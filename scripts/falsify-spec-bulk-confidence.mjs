// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Falsification spec for WI-32 (v0.73.0): Distribution before Confidence in the bulk toolbar,
// the CSV import template and the headerless column order.
//
//   BulkActionToolbar.confidence.test.tsx — Distribution before Confidence; Confidence disabled,
//     titled and cleared while Triangular or Uniform is staged; enabled with nothing staged.
//   import-template-column-order.test.ts — the template's header resolves to
//     DEFAULT_COLUMN_ORDER, and its rows import the same pasted headerless as from the file.
//
// Each straw names EXACTLY the tests it must fail, and no others, written down before the run.
// Read "K failing; named-match K", not merely a non-zero exit: the runner passes a straw on any
// named match, so an EXTRA failure shows only as K exceeding the named count.
//
// B6 is the plausible "fix" of the deliberate difference from the grid: greying Confidence with
// nothing staged. It fails the nothing-staged test and the Triangular and Uniform tests' controls,
// which check the menu is enabled before anything is staged.
//
// Scope is the whole suite (src/). A passing whole-suite run writes about 1 MB, near
// execFileSync's 1 MiB maxBuffer, which counts stdout and stderr together; an overflow cuts off
// vitest's summary and the runner ABORTS rather than reporting, so it cannot pass silently.
import { readFileSync } from "node:fs";

const TOOLBAR = new URL("../src/ui/components/BulkActionToolbar.tsx", import.meta.url).pathname;

const ORDER = "reads Distribution, Confidence, Status — then Apply, Delete, Clear";
const TRIANGULAR = "Triangular staged → Confidence disabled, with the shared title";
const UNIFORM = "Uniform staged → Confidence disabled, with the shared title";
const ENABLED = "T-Normal, LogNormal and Beta-PERT staged → Confidence enabled";
const NOTHING = "nothing staged → Confidence enabled, and returning to the placeholder re-enables it";
const CLEARED = "the menu falls back to its placeholder, and T-Normal brings it back EMPTY";
const PAYLOAD = "Apply sends no level with Triangular — and, the control, sends it with T-Normal";

const PARSER = new URL("../src/core/import/flat-activity-parser.ts", import.meta.url).pathname;
const TEMPLATE = new URL("../public/spert-activity-import-template.csv", import.meta.url).pathname;

const TEMPLATE_ORDER = "the template's header resolves to DEFAULT_COLUMN_ORDER, then Type";
const TEMPLATE_ROWS = "its rows import the same pasted without the header as from the file with it";
const HEADERLESS_1 = "supports assumeDefaultColumnOrder option (no header row)";
const HEADERLESS_2 =
  "assumeDefaultColumnOrder path does not trigger section skip (Type absent from default order)";
const HEADERLESS_3 = "assumeDefaultColumnOrder with 500+ rows still hits activity-limit early-exit";

const escape = (s) => s.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

/** Matches exactly these test titles, as the verbose reporter prints them. */
const only = (...titles) => new RegExp(`> (?:${titles.map(escape).join("|")})$`);

// B1 swaps the two menus' whole blocks, each running from its comment opener to the next one's.
// Cut from the source as it stands when the spec loads (unmutated); a missing or out-of-order
// opener throws here rather than yielding a needle that matches nothing.
const source = readFileSync(TOOLBAR, "utf8");
const at = (opener) => {
  const i = source.indexOf(opener);
  if (i < 0) throw new Error(`falsify-spec-bulk-confidence: opener not found: ${opener}`);
  return i;
};
const dist = at("      {/* Distribution type dropdown");
const conf = at("      {/* Confidence level dropdown");
const status = at("      {/* Status dropdown");
if (!(dist < conf && conf < status)) throw new Error("falsify-spec-bulk-confidence: menus out of order");
const DIST_BLOCK = source.slice(dist, conf);
const CONF_BLOCK = source.slice(conf, status);

// T1 puts the template's Confidence Level and Distribution columns back in their pre-v0.73.0
// places, in the header and every data row; the comment lines are left as they are.
const template = readFileSync(TEMPLATE, "utf8");
const splitCsv = (line) => {
  const out = [];
  let cur = "";
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === "," && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
};
const TEMPLATE_SWAPPED_BACK = template
  .split("\n")
  .map((line) => {
    if (line === "" || line.startsWith("#")) return line;
    const c = splitCsv(line);
    [c[5], c[6]] = [c[6], c[5]];
    return c.map((v) => (v.includes(",") ? `"${v}"` : v)).join(",");
  })
  .join("\n");

export const testFile = "src/";
export const mutations = [
  {
    // The two menus back in their old order: Confidence first.
    id: "B1  Confidence back before Distribution  [expect 1: ORDER]",
    file: TOOLBAR,
    find: DIST_BLOCK + CONF_BLOCK,
    replace: CONF_BLOCK + DIST_BLOCK,
    expectFailing: only(ORDER),
  },
  {
    id: "B2  `disabled` removed  [expect 4: TRIANGULAR, UNIFORM, ENABLED, NOTHING]",
    file: TOOLBAR,
    find: "        disabled={confidenceDisabled}\n",
    replace: "",
    expectFailing: only(TRIANGULAR, UNIFORM, ENABLED, NOTHING),
  },
  {
    id: "B3  the title removed  [expect 2: TRIANGULAR, UNIFORM]",
    file: TOOLBAR,
    find: "        title={confidenceDisabled ? CONFIDENCE_NA_TITLE : undefined}\n",
    replace: "",
    expectFailing: only(TRIANGULAR, UNIFORM),
  },
  {
    // Disabled for the three that USE a level, enabled for the two that ignore it.
    id: "B4  the predicate inverted  [expect 6: all but ORDER]",
    file: TOOLBAR,
    find: 'return staged !== "" && !confidenceApplies(staged);',
    replace: 'return staged !== "" && confidenceApplies(staged);',
    expectFailing: only(TRIANGULAR, UNIFORM, ENABLED, NOTHING, CLEARED, PAYLOAD),
  },
  {
    // Still disabled, but the staged level survives — and Apply sends it.
    id: "B5  the clearing removed  [expect 2: CLEARED, PAYLOAD]",
    file: TOOLBAR,
    find: '    if (stagedDistributionIgnoresConfidence(value)) setStagedConfidence("");\n',
    replace: "",
    expectFailing: only(CLEARED, PAYLOAD),
  },
  {
    id: "B6  nothing staged greyed too  [expect 3: TRIANGULAR, UNIFORM, NOTHING]",
    file: TOOLBAR,
    find: 'return staged !== "" && !confidenceApplies(staged);',
    replace: 'return staged === "" || !confidenceApplies(staged);',
    expectFailing: only(TRIANGULAR, UNIFORM, NOTHING),
  },
  {
    id: "T1  the template's columns swapped back  [expect 2: TEMPLATE_ORDER, TEMPLATE_ROWS]",
    file: TEMPLATE,
    find: template,
    replace: TEMPLATE_SWAPPED_BACK,
    expectFailing: only(TEMPLATE_ORDER, TEMPLATE_ROWS),
  },
  {
    // The headerless order back to Confidence first: the template no longer matches it, and the
    // three headerless parser tests, whose rows are in the new order, no longer parse.
    id: "T2  DEFAULT_COLUMN_ORDER swapped back  [expect 5: TEMPLATE_ORDER, TEMPLATE_ROWS, HEADERLESS_1-3]",
    file: PARSER,
    find: '  "distribution",\n  "confidence",\n',
    replace: '  "confidence",\n  "distribution",\n',
    expectFailing: only(TEMPLATE_ORDER, TEMPLATE_ROWS, HEADERLESS_1, HEADERLESS_2, HEADERLESS_3),
  },
];
