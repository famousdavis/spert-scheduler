# Handoff — §3.8, the two migrations

**Written:** 2026-08-02, at the end of the session that closed §3.5 and §3.7.
**For:** a session with none of that context.

The charter (`docs/CHARTER_codebase-quality.md`) carries the campaign. This carries **the opening
move** and **the things that are true but unwritten**. Short on purpose — read it in full.

⚠️ **Everything below is either verified now, cited to a commit, or marked unverified.** Nothing is
recalled. Half of what makes a report usable is knowing which things were checked.

---

## 1. State — re-derivable, not authoritative

| | |
|---|---|
| `main` | `ec10fe2` (#268) |
| Version | **v0.63.0** |
| Lint | **5 problems (5 errors, 0 warnings)** · `expectProblems: 5` |
| Tests | **2,727 / 133 files** *(on the #269 branch; `main` was 2,704 / 131 before it)* |

**Verify all four before acting.** Every stale-state incident in this campaign — including the
charter's own State line going stale three times, and a test count written off-by-one by the
session that produced it — was a number carried forward without a re-run.

---

## 2. The item: §3.8 — open with characterisation, not design

`migrations.ts:111 migrateV5toV6` and `firestore-migration.ts:58 migrateLocalToCloud`. Both carry
interim suppressions from B5/B6.

⚠️ **The charter's recorded framing already contains a design decision, stated as a constraint:**
*"cannot be proven behaviour-identical against data we no longer have."* Someone opening this cold
starts by building the synthesised v5 corpus the charter describes. **Whether that is the right
build at all is exactly what characterisation asks** — and that question has been answered *"no"*
three times running (§3.7's cost question, §3.5's import validation, §3.5's already-existing
detection; see the charter's *"Characterise before designing"* entry).

### The first step is minutes, and I did it — here is the result

⚠️ `npm run cc` was fixed in §3.0 **specifically** so these two functions could be measured, and
until now **nobody had pointed it at them.** The cc 18 / cc 21 figures were inherited from the
review that *found* the blind spot, not from a run after the fix.

```
npm run cc src/infrastructure/persistence/migrations.ts
  18  L111  migrateV5toV6      <-- over threshold  [suppressed]
  15  L202  migrateV10toV11
  15  L230  migrateV11toV12
  10  L138  migrateV6toV7

npm run cc src/infrastructure/firebase/firestore-migration.ts
  21  L58   migrateLocalToCloud  <-- over threshold  [suppressed]
  1 functions reported (1 suppressed by an in-file eslint-disable)
```

**Re-derived, unchanged — 18 and 21 are correct.** *"Unchanged"* is a real result and worth the two
minutes; it means the inherited numbers can now be cited rather than repeated.

**But the measurement immediately produced something the framing does not carry:**

- `migrations.ts` has **four** functions at cc ≥ 10, not one. **`migrateV10toV11` and
  `migrateV11toV12` both sit at exactly 15** — on the threshold, unsuppressed, invisible to lint by
  one point. §3.8 is framed as *"the two migrations"*; the file is not shaped that way.
- `firestore-migration.ts` reports **exactly one function above 0**. The file is essentially one
  large function. That is a different decomposition problem from `migrations.ts`, and the two
  should get **separate verdicts** — §3.7's precedent, where two functions in one file needed two.

**Not verified — check these:** whether those two cc-15 functions are covered; whether a v5-shaped
fixture already exists anywhere in the suite; whether the Firebase emulator the charter mentions is
actually configured in this repo.

---

## 3. What exists — do not rebuild it

**Tooling** (all committed, none are gate steps):

| | What it refuses to do — the part `--help` won't tell you |
|---|---|
| `npm run cc <file> [start-end]` | Reports **suppressed** functions marked `[suppressed]` rather than hiding them (§3.0). **Throws on a parse error** instead of reporting `cc 0` — region mode slices that start mid-statement fail loudly. |
| `npm run mutate <file>` | Asserts a **freshly written** `mutation.json`; a stale or absent one is a hard error, not a silent read. |
| `npm run bench` | **Self-calibrates every run** — injects +100%/+10%/+5% of the real workload and reports whether each was detected *on that machine, at that moment*. If +100% is not detected the run is worthless and it says so. Interleaved round-robin, never sequential A/B. |
| `node scripts/falsify.mjs <spec>` | Aborts if a mutant **fails to compile** (a non-compiling mutant reads as a survivor). Aborts if a needle matches **0 or 2+ places** (`String.replace` rewrites only the first — this produced three false survivors once, and caught a repeat 90 minutes later). Restores from `cp` backups and proves the suite green again. |

**Oracles** — all committed JSON, byte-compared, regenerated only by explicit `ORACLE_WRITE=1`,
**deliberately not vitest snapshots**, and all kept **out of** `vitest.stryker.config.ts`'s
allowlist:

- `deterministic-oracle` — `computeDependencySchedule` (C4)
- `monte-carlo-oracle` — both MC hot loops
- `simulation-worker-protocol-oracle` — the worker message protocol
- `gantt-parity-oracle` — interactive vs print chart geometry

**Falsification specs** are committed beside the runner as `scripts/falsify-spec-*.mjs` — six of
them. The runner was durable while its inputs lived in a scratchpad for a day; that is fixed, and
**new specs belong in `scripts/`**, flat, because the copyright guard's path regex is
`^(functions/)?scripts/[^/]+$` and a subdirectory is a blind spot in the guard.

---

## 4. Non-negotiables, each with its scar

- **Falsify every guard.** Break the thing it protects; the *named* test must fail. §3.5's protocol
  oracle passed 14 fixtures while **inert on one of three engine paths**, and only perturbation
  found it.
- **Assert the premise before the behaviour.** A fixture that fails to be what it claims passes the
  test while pinning nothing. The MC oracle's constrained fixtures shipped with **invalid constraint
  codes** and passed 23/23 until `tsc` objected.
- **Never cast a fixture.** A cast disables the check that catches fixture errors — that is how the
  invalid codes got in. Annotate the return type instead.
- **Run the full gate, not the relevant-looking check.** `tsc -b` caught **three** things last
  session that vitest and ESLint both passed: a wrong function signature, a `Record` where a `Map`
  was required, and a test placed under a tsconfig without node types.
- **Verify the branch base with `git log main..branch`.** A branch created while standing on another
  branch silently contains it; two PRs were reported as independent when one contained the other.
- **Retarget the child before merging the parent** when PRs are stacked.
- **`expectProblems` is a two-way ratchet.** Re-derive from `npm run lint` and set it in the same
  commit — a *resolved* problem must lower it.

---

## 5. Honest limits — what a fresh session cannot infer

⚠️ **The presentation gap.** Every instrument in this repo asserts about **values**. A defect that
exists only in **how correct values are composed for rendering** is invisible to all of it. v0.63.0
shipped one: the schedule-error banner space-joined its message and advice into a single `<p>`,
producing an unreadable sentence, while `getScheduleErrorBanner`'s return value was correct
throughout. **The only detector was a person looking at the page.** One render-level test now guards
that specific spot (#269); the class remains uncovered, and the charter's *"explicitly not tested:
visual layout, styling"* exclusion stands with its price now measured at one shipped defect.

⚠️ **"One person" is a detector in the table, and it does not generalise.** It fires on work still
warm — a result that looks implausible against tests you wrote last week. It would not fire on the
same defect in six months, or in unfamiliar code. Do not count on it.

⚠️ **The base rate is roughly one self-inflicted unfalsifiable check per substantial item — and that
is a DETECTION rate, not an incidence rate.** Every instance ever caught was in code the catcher had
just written. Nobody has caught one in old or unfamiliar code, which is indistinguishable from there
being none to catch. **The true rate is unknown and bounded below by the measured one.** Budget
falsification as work, not as diligence.

⚠️ **A tool that cannot do its job tends to return the value it returns when there is nothing to
report.** Four instances, all in this repo's own measurement tooling. Ask of any new instrument:
*what does it return when it cannot do its job, and is that distinguishable from a real answer?*
Note the direction varies — two flattered the code, two made a strong test look weak — so *"be
suspicious of good news"* catches only half.
