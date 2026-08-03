# Mutation baseline — `flat-activity-parser.ts` (§3.4)

**Recorded** 2026-08-02, `main` @ `8e5d5e8`.
**Purpose:** decide whether the existing net is strong enough to **restructure error-flow control**
behind — see §2's *"third category: restructuring how failure propagates"*.
**Not a regression gate.** No prior baseline exists for this file, so there is nothing to reconcile
against; §2's reconciliation rule governs *comparisons*, not a first measurement.

---

## ⚠️ The config edits were made LOCALLY and NOT COMMITTED

Same disposition, and the same reasoning, as `docs/mutation-baseline-worker.md`. Adding
`src/core/import/` to the committed `mutate`/`include` arrays would give any future
`monte-carlo.ts` or `deterministic.ts` comparison **more killing power than its own baseline**, and
those extra kills would mask exactly the survivors a revert gate exists to catch.

**Exact recipe — applied, measured, then reverted. This is what makes the run reproducible:**

```
stryker.config.mjs        mutate  += "src/core/import/flat-activity-parser.ts"
vitest.stryker.config.ts  include += "src/core/import/flat-activity-parser.test.ts"
npm run mutate src/core/import/flat-activity-parser.ts
```

`tsconfigFile` needs **no** change — unlike the worker, `src/core/` is inside `tsconfig.app.json`.

**Premise asserted before reading any number:**

```
npx vitest run --config vitest.stryker.config.ts src/core/import/flat-activity-parser.test.ts
  → Test Files 1 passed · Tests 64 passed
```

**Revert verified by counting sites, not by an exit code**
([[feedback_text_transform_assert_count]]): `grep -c 'core/import'` returned **0** in both files,
and `git status` reported both identical to `HEAD`.

---

## Pass condition — stated BEFORE the run

PASS required **all three**:

1. Mutation score **≥ 85%**.
2. **No survivor demonstrating a per-row validation or normalization stage can be disabled** without
   a test failing — the exact failure a `continue`-in-loop → early-`return` restructure risks.
3. **No survivor among the six error paths pinned in #273.**

---

## Result — 73.91%, and all three conditions FAIL

| Status | Count |
|---|---|
| Killed | **170** |
| Survived | **60** |
| Timeout | 0 |
| NoCoverage | 0 |
| CompileError | 108 |
| Ignored | 184 |
| **Total mutants** | **522** |

**Score = (170 + 0) / (170 + 60 + 0 + 0) = 73.91%.** Condition 1 fails by 11 points.

### By region — and the assertion style shows up as a number

| Region | Killed | Survived | Score |
|---|---|---|---|
| Pass 0 header resolution | 9 | 10 | **47%** |
| row skips | 17 | 6 | 74% |
| **cell extraction** | **0** | **9** | **0%** |
| required fields *(#273)* | 6 | 0 | **100%** |
| Excel-date detection | 6 | 0 | **100%** |
| MIN block *(old tests only)* | 8 | 3 | **73%** |
| **ML block** *(#273)* | 10 | 1 | **91%** |
| MAX block *(#273)* | 9 | 2 | 82% |
| normalize distribution | 3 | 1 | 75% |
| normalize confidence | 8 | 1 | 89% |
| normalize status | 3 | 1 | 75% |
| UUID + Zod + duplicate | 5 | 5 | **50%** |
| tokenize + assemble | 4 | 3 | 57% |
| Pass 2 predecessors | 14 | 1 | 93% |
| Pass 3 cycle detection | 5 | 5 | **50%** |
| post-loop limits | 10 | 2 | 83% |

---

## ⚠️ The clause-level result — measured proof of the substring-overlap finding

All three duration guards are the identical shape:

```ts
if (rawX === "" || !Number.isInteger(xVal) || xVal < 0)
```

Stryker mutates each operand separately, so the clauses can be scored independently:

| Clause | MIN (L300) | ML (L309) | MAX (L318) |
|---|---|---|---|
| whole expression | Killed | Killed | Killed |
| first two clauses | Killed | Killed | Killed |
| `rawX === ""` | ⚠️ **Survived** | Killed | Killed |
| `xVal < 0` | ⚠️ **Survived** | Killed | ⚠️ **Survived** |

**This maps exactly onto how each block is tested, and nothing else.**

- **MIN** is covered only by the pre-#273 tests, which assert
  `.toContain("non-negative integer")` — a substring **all three messages share**. Two clauses can
  be deleted without any test failing.
- **ML** is the only block at full clause coverage. It is also the only one for which #273 wrote
  **both** a non-integer *and* a negative case, with whole-object assertions.
- **MAX** loses the `< 0` clause because #273 covered non-integer and empty — **but not negative.**

⚠️ **That last row is a gap in MY OWN #273 tests, and it is the first-of-a-group lesson recurring
one level up.** Having found that the old tests covered Min and assumed ML and Max, I wrote
non-integer + negative for ML and non-integer + empty for Max. The asymmetry was invisible without
mutation, and it is exactly the shape of the defect I had just documented.

**Why the survivors are survivors rather than defects:** `ActivitySchema` independently rejects
negative durations, so deleting the parser's own check changes *which* error the user sees, not
*whether* one occurs — the independent-expression heuristic again. The user-visible cost is a worse
message, not accepted bad data.

### Zero is a legal duration, so the `<= 0` survivors are real, not equivalent

`min`/`mostLikely`/`max` are `z.number().nonnegative()`, and v0.53.0 added degenerate estimates.
Mutating `xVal < 0` to `xVal <= 0` rejects a legal zero-duration activity, and **no test in the
suite imports one through the CSV path.** All three blocks carry this survivor.

---

## Verdict — FAIL on all three conditions

1. **73.91% < 85%** — fails outright.
2. **Fails.** `normalize distribution` and `normalize status` each carry a surviving
   `ConditionalExpression → true`, i.e. the stage's own guard can be made unconditional undetected;
   MIN carries two deletable clauses.
3. **Partially fails.** The six *messages* pinned in #273 are solidly killed (required fields and
   Excel-date at 100%), but the MAX `< 0` clause and the zero-duration boundary in all three blocks
   are uncovered.

### ⚠️ §3.4 CLOSES AS A COVERAGE ITEM. Decomposition is VIABLE BUT DECLINED.

The `migrateLocalToCloud` disposition. The shape measurement says a decomposition exists that clears
every unit (~14 functions, nothing above cc 11), but **the only shape that clears requires
restructuring how failure propagates**, and a 73.91% net with 0% on cell extraction and 50% on the
Zod/duplicate path is not something to perform that restructure behind — on an untrusted-input
parser whose four body commits include a security fix (`96dfa1d`, v0.34.5, XLSX formula injection).

**The pass condition did its job.** Stated before the run, it made 73.91% a decision rather than a
number to rationalise.

---

## Follow-up — the duration-guard clauses are CLOSED (#275)

⚠️ **The 73.91% above is the score AS OF THE RUN, and it is now a LOWER BOUND.** Five tests were
added afterwards that kill six of the sixty survivors. **The score was deliberately not
re-measured**, because the verdict does not depend on it: decline stands on `cell extraction 0%`
and the `UUID + Zod + duplicate 50%` path, neither of which was touched. Re-running would cost
5–13 minutes and two more config edits to move a number that changes no decision. Recorded here so
the figure is never carried forward as current — that failure has its own row in the charter's table.

**Scope was the three duration guards only**, per the line *"close the clauses in the code you wrote
tests for; document the rest."* Everything else in the survivor table above stands as documented.

| Was | Now |
|---|---|
| MIN `rawX === ""` **Survived** | killed — `reports an empty Min against its own column` |
| MIN `xVal < 0` **Survived** | killed — `reports a negative Min against its own column` |
| MAX `xVal < 0` **Survived** | killed — `reports a negative Max against its own column` |
| `minVal < 0` → `<= 0` **Survived** | killed — `accepts a zero Min alongside non-zero Most Likely and Max` |
| `mlVal  < 0` → `<= 0` **Survived** | killed — `accepts a zero duration, which is legal` |
| `maxVal < 0` → `<= 0` **Survived** | killed — same |

**Verified against the exact survivors, not against invented mutations.**
`scripts/falsify-spec-duration-clauses.mjs` replicates all six Stryker mutants above — same
operands, same replacements — and each is killed by its **named** test; baseline and restore both
69. That answers *"did the new tests close the clauses?"* directly, in seconds, rather than
inferring it from a moved aggregate.

**All three duration guards are now at full clause coverage**, which the ML block alone reached
before.

### Cheapest work if this is ever reopened, in measured order

1. **cell extraction, 0/9** — nine `?? ""` fallbacks, nothing detects any of them.
2. **Pass 0 header resolution, 47%** — 10 survivors, mostly `Regex` mutants on the header aliases.
3. **UUID + Zod + duplicate, 50%** and **Pass 3 cycle detection, 50%**.
4. ~~a negative **Max**, and a **zero-duration** row through the CSV path~~ — done in #275.
