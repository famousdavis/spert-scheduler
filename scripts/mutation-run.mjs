// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// A scoped Stryker run that PROVES IT RAN before reporting anything.
//
// WHY THE GUARD EXISTS
// A mutation run that fails to start emits no survivors and no score — which is
// indistinguishable from "your tests are strong". This project has been bitten by that
// exact shape three separate times, and every one of them reported good news:
//
//   1. v0.59.10 — stale mutant activation under unlimited test-runner reuse made nearly
//      every mutant report `Survived`, exit code 0. Read as "the tests are weak".
//      (`maxTestRunnerReuse: 1` in stryker.config.mjs is the fix; do not remove it.)
//   2. A lint check that copied a lint-CLEAN file into the sandbox, so it passed
//      whether or not the thing it was verifying worked.
//   3. `--reporter=basic`, removed in Vitest 4: every run was a startup error, so all
//      five guard mutations read as "survived".
//
// So this script asserts a FRESHLY WRITTEN mutation.json — not merely a present one,
// because a stale file from a previous run is the most dangerous case of all — and
// throws loudly otherwise.
//
// WHY THE CLEARED CACHE
// `incremental: true` is a large speed win while iterating, but any comparison between
// two runs must clear both the sandbox and the incremental cache or the second run can
// replay the first one's verdicts. Iterate with plain `npx stryker run`; use this
// script for the runs you intend to COMPARE.
//
// USAGE
//   node scripts/mutation-run.mjs src/core/schedule/deterministic.ts
//
// Reports all six mutator categories (`ignored` included — it is easy to miss and it
// changes the denominator), the valid-mutant denominator, the score, and every
// surviving mutant grouped by the function that contains it.
//
// ⚠️ NEITHER NUMBER THIS SCRIPT PRINTS IS A GATE. Both have a known failure mode, and they
// point in OPPOSITE directions:
//
//   1. The SCORE falls when nothing regressed. Score and survivor rate are ratios, so they
//      move when the population moves — and decomposition always shrinks the population,
//      because new object/string literals in helper returns hit `excludedMutations`. A
//      ratio that fell while `Survived` held is arithmetic. (C4; §3.7.)
//   2. The ABSOLUTE `Survived` COUNT falls when nothing improved. Deduplication collapses
//      N copies of an unguarded line into one, removing N−1 survivors and guarding nothing.
//      §3.5 Step 4 read as an eight-survivor improvement; seven of the eight were the same
//      two gaps counted fewer times.
//
// Failure mode 2 is the more dangerous, because it arrives as good news about your own
// refactor and nobody audits that. The rule that survives both: GATE ON WHETHER THE DELTA
// RECONCILES — map every prior survivor to its post-run fate, one by one. A FALL IS AS MUCH
// WORK TO JUSTIFY AS A RISE. See docs/CHARTER_codebase-quality.md §2, worked example in
// docs/mutation-baseline-worker.md, denominator arithmetic in docs/mutation-baseline-c1.md.

import { execSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(import.meta.dirname, "..");
const JSON_PATH = path.join(ROOT, "reports/mutation/mutation.json");

const target = process.argv[2];
if (!target) {
  console.error("usage: node scripts/mutation-run.mjs <file-to-mutate>");
  process.exit(2);
}

rmSync(path.join(ROOT, ".stryker-tmp"), { recursive: true, force: true });
rmSync(path.join(ROOT, "reports/mutation/.stryker-incremental.json"), { force: true });
const before = existsSync(JSON_PATH) ? statSync(JSON_PATH).mtimeMs : 0;

let output = "";
try {
  output = execSync(`npx stryker run --mutate ${target}`, {
    cwd: ROOT,
    encoding: "utf-8",
    stdio: "pipe",
    maxBuffer: 64 * 1024 * 1024,
  });
} catch (err) {
  output = `${err.stdout ?? ""}${err.stderr ?? ""}`;
}

// --- the guard --------------------------------------------------------------
if (!existsSync(JSON_PATH)) {
  throw new Error(
    `HARNESS ERROR — no mutation.json written; Stryker did not run.\n` +
      `(Is "json" still in stryker.config.mjs reporters? A CLI --reporters flag REPLACES that list.)\n` +
      output.slice(-2000),
  );
}
if (statSync(JSON_PATH).mtimeMs <= before) {
  throw new Error(
    `HARNESS ERROR — mutation.json is STALE, not rewritten. Reading it would report the ` +
      `PREVIOUS run's numbers as if they were this run's.\n${output.slice(-2000)}`,
  );
}

const report = JSON.parse(readFileSync(JSON_PATH, "utf-8"));
const file = report.files[target];
if (!file) throw new Error(`HARNESS ERROR — report contains no entry for ${target}`);
if (!file.mutants?.length) throw new Error("HARNESS ERROR — report contains zero mutants");

// --- results ----------------------------------------------------------------
const tally = {};
for (const m of file.mutants) tally[m.status] = (tally[m.status] || 0) + 1;
const detected = (tally.Killed ?? 0) + (tally.Timeout ?? 0);
const valid = detected + (tally.Survived ?? 0) + (tally.NoCoverage ?? 0);

console.log(`\n${target}`);
console.log("six categories:", JSON.stringify(tally));
console.log(
  `generated ${file.mutants.length} | valid ${valid} | score ${detected}/${valid} = ` +
    `${((detected / valid) * 100).toFixed(2)}%`,
);
console.log(`SURVIVED (compare on this first): ${tally.Survived ?? 0}`);

const source = readFileSync(path.join(ROOT, target), "utf-8").split("\n");
const enclosingFn = (line) => {
  for (let i = line - 1; i >= 0; i--) {
    const m = /^(?:export )?(?:async )?function ([A-Za-z0-9_$]+)\s*\(/.exec(source[i]);
    if (m) return m[1];
  }
  return "(module scope)";
};

const live = file.mutants
  .filter((m) => m.status === "Survived" || m.status === "NoCoverage")
  .sort((a, b) => a.location.start.line - b.location.start.line);

const byFn = new Map();
for (const m of live) {
  const fn = enclosingFn(m.location.start.line);
  if (!byFn.has(fn)) byFn.set(fn, []);
  byFn.get(fn).push(m);
}

console.log(`\nsurviving mutants by function (${live.length} total):`);
for (const [fn, list] of [...byFn].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${String(list.length).padStart(3)}  ${fn}`);
  for (const m of list) {
    const replacement = String(m.replacement ?? "").replace(/\n/g, " ").slice(0, 56);
    console.log(`        L${m.location.start.line} [${m.mutatorName}] ${m.status} -> ${replacement}`);
  }
}
