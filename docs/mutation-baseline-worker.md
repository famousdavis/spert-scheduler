# Mutation baseline — `src/workers/simulation.worker.ts` (§3.5 Step 4)

**Recorded:** 2026-08-02 · **Tree:** `test/worker-protocol-oracle`, stacked on `main` @ `bee6cc6`, v0.62.2
**Charter item:** `docs/CHARTER_codebase-quality.md` §3.5, Step 4 — the decomposition of
`self.onmessage` from **cc 30** to **cc 8**.

Tracked for the same reason as `mutation-baseline-c1.md` and `mutation-baseline-core-scope.md`:
`reports/mutation/` is gitignored, and a comparison baseline that lives only in an ignored
directory is not a baseline. `.md` outside `src/`, so no copyright header is required.

---

## ⚠️ Reproducing this needs TWO config changes, and neither is committed

This file is **not** in `stryker.config.mjs`'s `mutate` list, and its tests are not in
`vitest.stryker.config.ts`'s `include`. Both had to be worked around, and the first one is a
trap that will cost the next person an hour if it is not written down.

### 1. `tsconfigFile` must be `tsconfig.worker.json`, not `tsconfig.app.json`

`tsconfig.app.json` ends with `"exclude": ["src/workers/**/*.ts"]` — the worker is type-checked
only by `tsconfig.worker.json` (`lib: ["ES2020","WebWorker"]`, no node types). Stryker's
`typescript` checker is configured against `tsconfig.app.json`, so pointing `--mutate` at the
worker makes it **crash on the first mutant**:

```
Error: ... no watcher is registered for it. Changes would go unnoticed.
    at ScriptFile.guardMutationIsWatched (@stryker-mutator/typescript-checker)
```

✅ **`scripts/mutation-run.mjs` behaved correctly here.** The crash left the previous run's
`mutation.json` in place, and the runner threw *"mutation.json is STALE, not rewritten. Reading it
would report the PREVIOUS run's numbers as if they were this run's."* Without that guard this
would have silently reported a **completely unrelated file's** numbers as the worker baseline —
the exact shape the runner's header documents three prior instances of.

### 2. The scoped vitest config must include the worker's tests

`vitest.stryker.config.ts`'s `include` lists only `src/core/**` test files, so every worker
mutant would otherwise report `NoCoverage`. This is the §3.4 hazard, not the §3.1 one.

⚠️ **Neither edit was committed, deliberately.** Adding `simulation.worker.test.ts` to the
committed `include` would make it run for *every* file in the mutate scope — giving a future
`monte-carlo.ts` or `deterministic.ts` comparison **more killing power than the baselines they
are measured against**. That is precisely the trap the `deterministic-oracle.test.ts` note in
that file already warns about, and it would be silent.

**Recipe, applied then reverted:**

```
stryker.config.mjs        tsconfigFile: "tsconfig.app.json"  →  "tsconfig.worker.json"
vitest.stryker.config.ts  include += "src/workers/simulation.worker.test.ts"
                          include += "src/integration/simulation-worker-protocol-oracle.test.ts"   (scope B only)
node scripts/mutation-run.mjs src/workers/simulation.worker.ts
```

**Premise asserted, not assumed:** before reading any number, the scoped config was run directly
—`npx vitest run --config vitest.stryker.config.ts src/workers/simulation.worker.test.ts` →
**23 tests passed**. A mutation baseline whose tests never ran is the failure mode this whole
campaign is organised around.

---

## Two scopes, because the guard set is split across two files

The vocabulary guard is **structurally invisible in posted output** (§3.5 Step 2), so it is
covered by a marshalling assertion in `simulation.worker.test.ts` rather than by the oracle.
Recording both scopes shows exactly what each instrument contributes.

| Scope | Test files in the Stryker vitest include |
|---|---|
| **A** | `simulation.worker.test.ts` only |
| **B** *(primary gate)* | `simulation.worker.test.ts` **+** `simulation-worker-protocol-oracle.test.ts` |

Scope B is the gate because it is the guard set that actually protects this refactor. Scope A is
kept because it isolates the oracle's contribution — a measured number, not an assertion.

---

## Results — all six categories, both scopes

| | Killed | Timeout | **Survived** | NoCov | CompileErr | Ignored | Generated | **Valid** | Score |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| **A — pre** | 34 | 0 | **19** | 0 | 26 | 28 | 107 | 53 | 64.15% |
| **A — post** | 37 | 0 | **10** | 0 | 28 | 29 | 104 | 47 | 78.72% |
| **B — pre** | 39 | 0 | **14** | 0 | 26 | 28 | 107 | 53 | 73.58% |
| **B — post** | 41 | 0 | **6** | 0 | 28 | 29 | 104 | 47 | 87.23% |

**The oracle's measured contribution:** 5 mutants pre-decomposition (19 → 14) and 4 post
(10 → 6) that nothing else kills — the `milestoneSamples` guard, the `milestoneResults` attach,
and the milestone map's filter arrow.

⚠️ **`Valid` is identical (47) in both post-decomposition scopes**, because `CompileError` and
`Ignored` are decided by the checker and the mutator, not by which tests run. Only the
Killed/Survived split moves between A and B. A scope that changed the denominator would not be
comparing like with like.

**`Survived` fell 14 → 6. The gate is satisfied, but the drop is not eight things getting
safer** — see the reconciliation below. It is mostly the same two gaps counted fewer times.

---

## Reconciliation — every one of the 14 pre-survivors accounted for

⚠️ **A drop needs accounting exactly as much as a rise does.** *"Gate on whether a delta
reconciles, not on its size"* — a decomposition that merges duplicated code will always improve
a survivor count without improving a single guard, and reporting that as a win is how a
measurement stops meaning anything.

| # | Pre-decomposition survivor | Post | Why |
|---|---|---|---|
| 1 | `L52` `trialCount > 100000` → `>=` | **survives at L76** | unchanged gap, moved into `validateStartPayload` |
| 2 | `L72` `exhaustedIds: string[] = []` → `["Stryker was here"]` | **gone** | the line no longer exists — see below |
| 3 | `L78` `Object.entries(deterministicDurationMap)` | **merged → L99** | three call sites became one |
| 4 | `L83` `Object.entries(milestoneActivityIds)` | **merged → L99** | ” |
| 5 | `L88` `Object.entries(activityEarliestStart)` | **merged → L99** | ” |
| 6 | `L79` `ConditionalExpression → true` | **merged → L86** | three copies of `isNumber` became one |
| 7 | `L89` `ConditionalExpression → true` | **merged → L86** | ” |
| 8 | `L79` `ConditionalExpression → false` | **merged → L86** | ” |
| 9 | `L89` `ConditionalExpression → false` | **merged → L86** | ” |
| 10 | `L79` `typeof … !== "number"` | **merged → L86** | ” |
| 11 | `L89` `typeof … !== "number"` | **merged → L86** | ” |
| 12 | `L79` filter arrow → `() => undefined` | **KILLED** | genuine strengthening — see below |
| 13 | `L89` filter arrow → `() => undefined` | **KILLED** | ” |
| 14 | `L152` `performance.now() - startTime` → `+` | **survives at L194** | `elapsedMs` is wall-clock and deliberately not pinned by value |

**Only two of the eight are real.**

- **#2 is dead-code removal.** `let exhaustedIds: string[] = []` was initialised and then
  unconditionally overwritten by both branches, so the initialiser was unreachable and no test
  could ever have killed it. `TrialOutcome.exhaustedIds` is now a **required** field, which is
  what forces both branches to supply it — the file's own comment previously noted that the
  engine's optional param meant *"the sequential branch's threading is NOT forced by the
  type-checker."* Now it is. A survivor removed by deleting unreachable code, not by testing it.
- **#12/#13 are a genuine strengthening, and it is an accident of merging.** Pre-decomposition
  there were three independent filter arrows; only the `milestoneActivityIds` one was killed
  (the `dependency/with-milestones` fixture notices when milestones vanish). Post, all three call
  sites share **one** arrow inside `toValidatedMap`, so the strongest call site's fixture now
  kills the mutant for all three. The guarding did not improve — the population merged, and the
  merged member inherited the best coverage of its inputs.

  ✅ **Scope A confirms the mechanism rather than leaving it as a story.** The merged arrow
  (`L99 [ArrowFunction]`) **survives in scope A and is killed in scope B** — so the kill is
  attributable to the oracle's milestone fixture specifically, which is exactly the call site
  that was already killing its own copy before the merge. Had the improvement come from
  somewhere else, this is where that would have shown up.
- **The other six (#3–#11) are pure duplicate-collapse.** Same logical gap, fewer mutants.

### The two real gaps, unchanged by this work

1. **`trialCount > 100000` is not pinned at the boundary.** `999`, `1000` and `100001` are all
   tested; **`100000` — the largest accepted value — is not**, so moving the comparison to `>=`
   changes nothing any test observes. Pre-existing, and pre-existing in both scopes.
2. **Nothing asserts a wrong-typed map entry is actually *dropped*.**
   `simulation.worker.test.ts`'s *"ignores map entries of the wrong runtime type instead of
   throwing"* asserts only `errors() === 0` and `results() === 1` — which holds whether the entry
   is filtered or passed straight through to the engine. The `isNumber` predicate and the
   `Object.entries` call are therefore unguarded in substance. Pre-existing; recorded, not fixed.

Neither is introduced by the decomposition, and neither is fixed by it. They are written down
here so the improved score is not read as covering them.

---

## What the type checker is doing, which the score does not show

**26 of 107 mutants (pre) and 28 of 104 (post) are `CompileError`** — rejected by TypeScript
before any test ran, and correctly excluded from the denominator. They are legitimate:

```
L45 [LogicalOperator] !payload && !Array.isArray(payload.activities)
    → TS2339: Property 'activities' does not exist on type 'never'.
```

Falsity-narrowing on `payload` makes the downstream code unsound the moment a guard is weakened.
This was checked rather than assumed, because a checker that rejected *valid* mutants would
silently shrink the tested population — and `tsconfig.app.json`, which does not cover this file
at all, is exactly the kind of thing that would have caused it.

⚠️ **This constrained the decomposition.** Extracting the validation preserved the narrowing only
because the compound expression `!payload || !Array.isArray(payload.activities)` moved
**intact**; splitting it into separate statements would have converted compile errors into live
mutants and quietly reduced what the type system checks.
