# Mutation baseline — `src/core/schedule/deterministic.ts`

**Status:** M2/M3 complete (Week 0, 2026-08-01). **C1 classifications pending — Week 4.**
**Source artifact:** `reports/mutation/mutation.json`, written 2026-08-01 07:36, scoped to this file.
**Tree:** `main` @ `d7eedd8`, v0.59.12.

This file is tracked on purpose. `reports/mutation/` is gitignored, and C4's hard gate compares a
Weeks 5–6 run against the numbers recorded here six weeks earlier — a comparison baseline that lives
only in an ignored directory is not a baseline. It is `.md` and outside `src/`, so
`src/integration/copyright-headers.test.ts` does not require a header.

## Protocol

```bash
rm -rf .stryker-tmp reports/mutation/.stryker-incremental.json
npx stryker run --mutate src/core/schedule/deterministic.ts
```

Roughly 4m40s. **This is the protocol for _comparisons_, not for every iteration** — clearing the
incremental cache makes every run a full one. While writing tests, run without clearing it. The
cleared-cache protocol is mandatory only for the two runs C4's gate compares.

Three preconditions, each of which has silently corrupted a run before:

1. `maxTestRunnerReuse: 1` must stay in `stryker.config.mjs`. Without it, mutant activation goes
   stale in reused vitest workers and nearly everything reports `Survived` — monte-carlo scored
   10.07% vs 84.21% on the same tree. Fixed in v0.59.10 (#219).
2. Delete `.stryker-incremental.json`, or a poisoned cache replays old false `Survived` results.
3. A CLI `--reporters` flag **replaces** the config list rather than adding to it, same as
   `--mutate`. Pass neither, or pass the full list.

## Baseline — six categories

| Category | Count |
|---|---|
| Killed | 160 |
| Timeout | 1 |
| Survived | 70 |
| NoCoverage | 2 |
| CompileError | 120 |
| **Ignored** | **27** |
| **Total generated** | **380** |
| **Valid (denominator)** | **233** |
| **Score** | **161 / 233 = 69.10%** |

**Record all six every time, `ignored` included.** Earlier drafts of the plan carried
`ignored: 0` and a total of 353; both were wrong. The 27 come from
`mutator.excludedMutations: [StringLiteral, ObjectLiteral]` — those mutants are generated,
then marked `Ignored`, so they inflate the total without entering the denominator.

**120 compile-errors + 27 ignored = 39% of generated mutants never enter the denominator.**

> ⚠️ **AMENDED 2026-08-01, after C4's run — this paragraph originally said the gate compares the
> survivor *rate* rather than an absolute count, with a re-baseline trigger at 10% denominator
> movement. Both were wrong, and C4 proved it.** The rate is the *more* population-sensitive
> measure, and magnitude is the wrong trigger variable.
>
> **The rule now:** the **absolute `Survived` count** is the primary numeric condition, because it
> does not move with the population. Score and rate are authoritative **only while the denominator
> holds**; once it moves they are diagnostics. Movement is acceptable when it is **accounted for** —
> the delta reconciles across all six mutator categories — and a revert trigger when it is not.
> Decomposition *always* shrinks the denominator (new literals in dispatchers and helper returns hit
> `excludedMutations`), so a shrink at any magnitude is expected, not suspicious.
>
> C4 moved it 3.0% — under the old 10% trigger, so the hatch never fired — while `Survived` held
> byte-identical at 34. The old rule failed a refactor that had regressed nothing, and could only
> have been satisfied by returning tuples instead of objects, i.e. by making the code worse.

## Scope of judgement

72 survivors + no-coverage mutants in total. **18 sit before L249**, in
`computeDeterministicSchedule` and helpers that this work never touches — excluded from judgement,
but note they remain in the file-level score, so the ceiling for C1 is (161 + 54) / 233 = **92.3%**.

**54 sit inside `computeDependencySchedule` (L249–598).** All 54 are enumerated below and every one
is assigned to a cluster; the reconciliation leaves **zero unassigned**. Independently reproduced by
three reviewers and re-verified from the artifact on 2026-08-01.

| Cluster | Region | Survivors |
|---|---|---|
| SS/FF/FS clamps | L301–336 | 12 |
| Milestone-floor block | L343–353 | 3 |
| Project-end loop | L383–387 | 1 |
| Backward pass #1 | L394–429 | 4 |
| Backward pass #2 | L436–458 | 3 |
| Free float | L485–493 | 6 |
| Conflict detection | L500–511 | 1 |
| Dependency validation | L518–542 | 18 |
| Result assembly + returns | L561–599 | 6 |
| | | **54** |

**C1a (Week 3)** takes the four largest — dependency validation, clamps, free float, result assembly
= 42. **C1b (Week 4)** takes the rest = 12.

> The **backward passes need no complexity work** (they measure 14 and 11, and C4 lifts them
> verbatim) **but carry 7 survivors between them.** Three plan revisions read "no complexity work"
> as "no work" and dropped them from C1's scope. They are in scope.
>
> The **milestone-floor survivors (L345, L349×2) sit in code C4 lifts into a helper.** Cover them
> deliberately — they are the ones most likely to be disturbed by the refactor.

## Exit gate — end of Week 4

1. Every one of the 54 is **killed**, or **individually classified** equivalent/masked with a
   one-line reason in the Classification column below. A blank cell is not a classification.
2. If the classification rate exceeds ~25% of 54, spot-check five against a second reading. This is a
   **spot-check trigger, not a stop** — `monte-carlo.ts`, the suite's model of an honest outcome,
   classified nearly all of its 18 remaining survivors.
3. Record the post-C1 six-category breakdown and score in this file. **C4's gate compares against
   that score, not against 69.10%** — by Week 4 the file should sit near 89%, and gating on the
   pre-C1 number would let a twenty-point regression pass.

**Keying for C4.** Survivors in regions C4 lifts are keyed to the future helper name. Survivors in
the project-end loop, the total-float loop and the return ternaries **stay in the residual** and are
keyed to `computeDependencySchedule` itself.

> ⚠️ **CORRECTED — the residual set is 3 (L385, L596, L597), not "roughly 26".** The ~26 figure came
> from a round-4 review measuring against v4's **four**-lift recipe, under which the backward passes
> and dependency validation stayed inline. The shipped recipe lifts **seven** phases, extracting both.
> C4's run confirmed it: all 34 post-refactor survivors mapped one-to-one, with the residual keeping
> exactly the project-end one. **This is the second time this figure has been reasoned wrongly and
> corrected by measurement** — the reason C1b re-verified two of its classifications by execution
> rather than re-reading.

## The 54 — full enumeration

Line numbers are anchored at v0.59.12 (`d7eedd8`); **re-derive them before each step.** `Mutant`
is the replacement Stryker substituted.

### SS/FF/FS clamps — L301–336 · 12 survivors

| Line | Mutator | Status | Mutant | Classification |
|---|---|---|---|---|
| 301 | ConditionalExpression | Survived | `true` | |
| 301 | EqualityOperator | Survived | `offset > 0` | |
| 304 | UnaryOperator | Survived | `+offset` | |
| 305 | ConditionalExpression | Survived | `true` | |
| 305 | EqualityOperator | Survived | `candidateStart <= projectStart` | |
| 313 | EqualityOperator | Survived | `pred.lagDays > 0` | |
| 319 | EqualityOperator | Survived | `candidateStart <= projectStart` | |
| 326 | EqualityOperator | Survived | `offset > 0` | |
| 330 | BlockStatement | NoCoverage | `{}` | |
| 330 | ConditionalExpression | Survived | `false` | |
| 330 | EqualityOperator | Survived | `candidateStart <= projectStart` | |
| 336 | EqualityOperator | Survived | `candidateStart >= latestDate` | |

### Milestone-floor block — L343–353 · 3 survivors

| Line | Mutator | Status | Mutant | Classification |
|---|---|---|---|---|
| 345 | ConditionalExpression | Survived | `true` | |
| 349 | ConditionalExpression | Survived | `true` | |
| 349 | EqualityOperator | Survived | `milestoneDate >= activityStart` | |

### Project-end loop — L383–387 · 1 survivors

| Line | Mutator | Status | Mutant | Classification |
|---|---|---|---|---|
| 385 | EqualityOperator | Survived | `endDate >= projectEndDate` | |

### Backward pass #1 — L394–429 · 4 survivors

| Line | Mutator | Status | Mutant | Classification |
|---|---|---|---|---|
| 401 | ConditionalExpression | Survived | `true` | |
| 410 | ConditionalExpression | Survived | `true` | |
| 410 | EqualityOperator | Survived | `candidateLS <= ls` | |
| 417 | BlockStatement | Survived | `{}` | |

### Backward pass #2 — L436–458 · 3 survivors

| Line | Mutator | Status | Mutant | Classification |
|---|---|---|---|---|
| 436 | ArithmeticOperator | Survived | `graph.topologicalOrder.length + 1` | |
| 451 | ConditionalExpression | Survived | `true` | |
| 451 | EqualityOperator | Survived | `candidateLS <= ls` | |

### Free float — L485–493 · 6 survivors

| Line | Mutator | Status | Mutant | Classification |
|---|---|---|---|---|
| 485 | ConditionalExpression | Survived | `false` | |
| 486 | ArithmeticOperator | Survived | `countWorkingDays(predES, succES, calendar) +` | |
| 488 | ArithmeticOperator | Survived | `countWorkingDays(predEF, succEF, calendar) +` | |
| 491 | ArithmeticOperator | Survived | `countWorkingDays(predEF, succES, calendar) -` | |
| 493 | ConditionalExpression | Survived | `true` | |
| 493 | EqualityOperator | Survived | `gap <= minGap` | |

### Conflict detection — L500–511 · 1 survivors

| Line | Mutator | Status | Mutant | Classification |
|---|---|---|---|---|
| 500 | BlockStatement | Survived | `{}` | |

### Dependency validation — L518–542 · 18 survivors

| Line | Mutator | Status | Mutant | Classification |
|---|---|---|---|---|
| 518 | ConditionalExpression | Survived | `true` | |
| 518 | ConditionalExpression | Survived | `false` | |
| 518 | EqualityOperator | Survived | `offset > 0` | |
| 518 | EqualityOperator | Survived | `offset < 0` | |
| 520 | UnaryOperator | Survived | `+offset` | |
| 523 | BlockStatement | Survived | `{}` | |
| 530 | BooleanLiteral | Survived | `true` | |
| 531 | BlockStatement | Survived | `{}` | |
| 532 | ArithmeticOperator | Survived | `1 - dep.lagDays` | |
| 533 | ConditionalExpression | Survived | `false` | |
| 534 | BlockStatement | Survived | `{}` | |
| 536 | ConditionalExpression | Survived | `false` | |
| 537 | BlockStatement | Survived | `{}` | |
| 537 | ConditionalExpression | Survived | `true` | |
| 537 | EqualityOperator | Survived | `dep.type !== "FF"` | |
| 539 | ConditionalExpression | Survived | `false` | |
| 542 | BlockStatement | Survived | `{}` | |
| 542 | ConditionalExpression | Survived | `false` | |

### Result assembly + returns — L561–599 · 6 survivors

| Line | Mutator | Status | Mutant | Classification |
|---|---|---|---|---|
| 565 | ConditionalExpression | Survived | `true` | |
| 565 | ConditionalExpression | Survived | `true` | |
| 565 | ConditionalExpression | Survived | `true` | |
| 565 | LogicalOperator | Survived | `activity.status === "complete" \|\| activity` | |
| 596 | ConditionalExpression | Survived | `false` | |
| 597 | ConditionalExpression | Survived | `false` | |

---

# C1a results — Week 3 (2026-08-01)

**Scope:** the four largest clusters — dependency validation (18), SS/FF/FS clamps (12),
free float (6), result assembly (6) = **42 survivors**.

**Outcome: 31 killed, 11 classified. Zero left unaddressed.**

```
                        before        after
score              161/233 69.10%   192/233 82.40%
killed                 160            191
timeout                  1              1
survived                70             41
no-coverage              2              0     <- the FS clamp branch now has coverage
compile-error          120            120
ignored                 27             27
total generated        380            380     <- denominator unchanged; no code was touched
```

**C1a clusters: 42 → 11.** Result assembly cleared entirely; free float 6 → 1;
dependency validation 18 → 3; clamps 12 → 7.

The out-of-scope 18 before L249 are untouched, as intended, and the five C1b clusters
(milestone floor 3, project-end 1, backward passes 7, conflict detection 1 = 12) are
unchanged — C1a's tests did not incidentally cover them, so C1b's target is still 12.

## How the tests were written

Every asserted value was **measured against the real implementation first**, via a
throwaway probe, then written into the test. Working-day arithmetic across negative lags
is exactly where a confident hand calculation goes wrong, and two of the plan's own
figures had already been wrong that way.

The Stryker runs used a **guarded runner** that asserts a fresh `mutation.json` was
actually written — not merely present — and throws otherwise. A run that fails to start
emits no survivors, which is indistinguishable from "the tests are weak". See
`feedback_verification_must_assert_it_ran`.

**The root cause of the dependency-validation cluster is worth recording:** nothing in the
suite had ever produced a dependency violation. The pre-existing test named
*"FF violation detected when constraint forces finish before required"* wrapped its
assertion in `if (schedule.dependencyConflicts && length > 0)`, so it passed whether or not
a violation occurred. A hard `MSO`/`MFO` constraint that overrides the network is the way
to force one; all three types now have a real, asserted conflict.

## The 11 classified survivors

All eleven are one family: **operators at a boundary where both sides produce the same
observable value**, or **branches unreachable given an exhaustive type union**. None is a
missing test.

### Offset of exactly zero — `>= 0` mutated to `> 0` (4)

| Line | Context |
|---|---|
| L301 | SS candidate start |
| L313 | FF constrained finish |
| L326 | FS candidate start |
| L518 | `computeRequired` |

Each selects between `addWorkingDays(base, offset)` and `subtractWorkingDays(base, -offset)`.
At `offset === 0` the two are the same call. **Verified empirically rather than assumed:**
`addWorkingDays(d, 0) === subtractWorkingDays(d, 0) === d` for a Monday, a Friday **and a
Saturday** — the non-working-day case is the one where an implementation might plausibly
advance, and it does not. Equivalent.

### Clamp comparison at equality — `<` mutated to `<=` (3)

L305 (SS), L319 (FF), L330 (FS): `if (candidateStart < projectStart) candidateStart = new Date(projectStart)`.
When the two are equal the mutant performs the assignment and the original does not, but the
assigned value **is** the value already held. Only the date is observable — it is formatted to
ISO before anything reads it — so no test can distinguish them. Equivalent.

### Running extremum at equality (2)

- **L336** `if (candidateStart > latestDate)` → `>=`: assigns a date equal to the one held.
- **L493** `if (gap < minGap)` → `<=`: assigns a number equal to the one held.

Equivalent for the same reason.

### Unreachable given the type union (2)

- **L537** `else if (dep.type === "FF")` → `true`. `DependencyType` is exactly
  `"FS" | "SS" | "FF"`; FS and SS are consumed by the two preceding branches, so only FF
  reaches this one. Over every reachable input the mutant is the original. **Equivalent.**
- **L530** `let violated = false` → `true`. Each of the three branches assigns `violated`
  unconditionally, so the initializer is never read. **Masked, not equivalent** — a dependency
  whose `type` fell outside the union would keep the initializer and be reported as violated.
  The Zod schema and the TypeScript union both forbid that, so killing it would mean asserting
  on data the type system prevents. Deliberately not chased.

## Still open for C1b (Week 4)

The 12 in the remaining five clusters: backward pass #1 (4), backward pass #2 (3), milestone
floor (3), project-end loop (1), conflict detection (1).

⚠️ The backward passes carry 7 of those 12 and need **no complexity work** — C4 lifts them
verbatim. Three plan revisions read that as "no work" and dropped them from C1's scope.
⚠️ The milestone-floor three (L345, L349×2) sit in code C4 lifts into `applyMilestoneFloor`.
Key them there, per the map in `M1-RESULT.md`.

---

# C1b results — Week 4 (2026-08-01) · C1 COMPLETE

**Scope:** the five remaining clusters — backward pass #1 (4), backward pass #2 (3),
milestone floor (3), project-end loop (1), conflict detection (1) = **12 survivors**.

**Outcome: 7 killed, 5 classified.**

```
                   pre-C1        post-C1a       post-C1b
score         161/233 69.10%  192/233 82.40%  199/233 85.41%
killed             160             191             198
survived            70              41              34
no-coverage          2               0               0
compile-error      120             120             120
ignored             27              27              27
total generated    380             380             380
```

## C1 final position — the exit gate

**All 54 in-scope survivors are addressed: 38 killed, 16 classified with a written reason.**
The 18 before L249 remain untouched, as scoped. `34 live − 18 out-of-scope = 16`.

| Cluster | Start | End | Killed |
|---|---|---|---|
| Dependency validation | 18 | 3 | 15 |
| SS/FF/FS clamps | 12 | 7 | 5 |
| Free float | 6 | 1 | 5 |
| Result assembly | 6 | 0 | 6 |
| Backward pass #1 | 4 | 1 | 3 |
| Backward pass #2 | 3 | 2 | 1 |
| Milestone floor | 3 | 1 | 2 |
| Project-end loop | 1 | 1 | 0 |
| Conflict detection | 1 | 0 | 1 |
| **Total** | **54** | **16** | **38** |

**The denominator never moved (233).** No source was touched during C1, so the 16-point
score gain is entirely test quality, not a population shift. That matters for C4's gate,
which compares against **85.41%**, not the 69.10% this file opened with.

## What C1b found

Nothing had ever asserted the late-date fields — `lateStart`, `lateFinish`, `lateStartNet`,
`lateFinishNet` — at all. Both backward passes computed them and no test read them. That is
why seven survivors sat there, and why three plan revisions could read "needs no complexity
work" (C4 lifts them verbatim) as "needs no work". True of complexity, false of coverage.

Newly covered: late dates derived from successors rather than the project end; late start as
the **earliest** across successors rather than whichever is listed last, in **both** passes;
the backward constraint adjustment, asserted by requiring the constrained and network late
dates to **disagree**; the milestone floor matching on id rather than position, and never
pulling an activity earlier; and the post-pass soft-constraint sweep, asserted on
`type: "constraint-violation"` / `severity: "warning"` so it cannot be satisfied by a
forward-pass conflict.

## The 5 classified in C1b

| Line | Mutation | Classification |
|---|---|---|
| L349 | `milestoneDate > activityStart` → `>=` | equivalent |
| L385 | `endDate > projectEndDate` → `>=` | equivalent |
| L410 | `candidateLS < ls` → `<=` | equivalent |
| L451 | `candidateLS < ls` → `<=` | equivalent |
| L436 | `topologicalOrder.length - 1` → `+ 1` | **equivalent — verified by execution** |

The first four are the same shape as C1a's equality family: at the boundary the mutant
performs an assignment the original skips, and the value assigned **is** the value already
held. Only the resulting date or number is ever read, so nothing can distinguish them.

**L436 is the one that needed checking rather than reasoning.** Starting the reverse loop at
`length + 1` runs two extra iterations over `topologicalOrder[len]` and `[len + 1]`, both
`undefined`. Those write `lateStartNet` / `lateFinishNet` entries under an `undefined` key —
and every reader looks those maps up by ids drawn from `topologicalOrder`, so no reader ever
sees them. Reasoning said equivalent; reasoning is also how the "~26 residual survivors"
figure got into the plan. So it was **measured**: the mutation was applied and the full
`DeterministicSchedule` output diffed across four project shapes — single activity, simple
chain, diamond, and one carrying a hard `FNLT`. **Byte-identical.** Equivalent, confirmed.

## Spot-check (the >25% trigger)

16 of 54 classified = **29.6%**, above the plan's ~25% trigger, so a second reading was owed
on five. Five were verified **by execution rather than re-reading**:

- the four zero-offset mutants (L301, L313, L326, L518), via
  `addWorkingDays(d, 0) === subtractWorkingDays(d, 0) === d` measured on a Monday, a Friday
  **and a Saturday** — the non-working-day case being the one where an implementation might
  plausibly have advanced;
- **L436**, via the output diff above.

The remaining eleven rest on a structural argument — an assignment of a value equal to the one
already held, or a branch unreachable given `DependencyType`'s exhaustive union — stated per
mutant above and in the C1a section. That argument is sound but is *not* execution evidence,
and is labelled as such deliberately.

---

# C4 gate measurement — 2026-08-01

Run under the identical protocol: cleared sandbox, cleared incremental cache,
`npx stryker run --mutate src/core/schedule/deterministic.ts`, via the guarded runner
that asserts a freshly-written `mutation.json`.

```
                   pre-C4          post-C4
score         199/233 85.41%   192/226 84.96%
killed             198             191      (-7)
timeout              1               1
survived            34              34      (unchanged)
no-coverage          0               0
compile-error      120             124      (+4)
ignored             27              40      (+13)
total generated    380             390      (+10)
valid              233             226      (-7, a 3.0% move)
```

## Condition-by-condition

| # | Condition | Result |
|---|---|---|
| 1 | Same command, scope, cleared cache | **PASS** |
| 2 | Score ≥ 85.41% | **FAIL** — 84.96%, short by 0.45pp |
| 3 | Survivor count and rate no worse | count 34 = 34 **PASS**; rate 14.59% → 15.04% **FAIL** |
| 4 | Every survivor maps to a classified counterpart | **PASS** — all 34, zero new |

**The escape hatch did not fire.** The valid-mutant denominator moved 3.0%, below its
10% trigger.

## Condition 4 in full — every survivor accounted for

18 of the 34 sit outside C4's scope, unchanged: `computeCandidateLSDate` (16),
`resolveActivityDuration` (1), `computeDeterministicDurations` (1).

The other 16 map **one-to-one** onto the 16 classified during C1. **Not one new survivor,
and not one unclassified survivor** — so the bound of "more than three new C4-time
classifications, or any in the dispatcher or residual" is not approached: there are zero.

| Pre-C4 | Post-C4 destination | Mutation |
|---|---|---|
| L301 | `candidateFromSS` L277 | `>= 0` → `> 0` |
| L305 | `candidateFromSS` L279 | `<` → `<=` |
| L313 | `candidateFromFF` L286 | `>= 0` → `> 0` |
| L319 | `candidateFromFF` L290 | `<` → `<=` |
| L326 | `candidateFromFS` L296 | `>= 0` → `> 0` |
| L330 | `candidateFromFS` L298 | `<` → `<=` |
| L336 | `earliestStartFromPreds` L332 | `>` → `>=` |
| L349 | `applyMilestoneFloor` L345 | `>` → `>=` |
| L410 | `backwardPassConstrained` L452 | `<` → `<=` |
| L436 | `backwardPassNetwork` L490 | `- 1` → `+ 1` |
| L451 | `backwardPassNetwork` L505 | `<` → `<=` |
| L493 | `computeFreeFloat` L557 | `<` → `<=` |
| L518 | `validateDependencies` L612 | `>= 0` → `> 0` |
| L530 | `validateDependencies` L624 | `false` → `true` |
| L537 | `validateDependencies` L631 | FF branch → `true` |
| L385 | **residual** `computeDependencySchedule` L740 | `>` → `>=` |

This matches the keying map built during M1 exactly, including that the residual keeps
survivors from the project-end loop.

## Why the score fell, arithmetically

Within the valid population **only `killed` changed**: `valid` fell by 7 and `killed` fell
by the same 7. Survived, timeout and no-coverage are all identical. So the seven mutants
that left the population were seven that were **being killed**.

Removing seven kills from both sides of the ratio:

```
(199 - 7) / (233 - 7) = 192 / 226 = 84.96%
```

which reproduces the observed score **to the digit**. The entire 0.45pp drop is that
subtraction. Nothing that was tested became untested; a smaller population of
already-passing mutants simply makes the same success rate read lower.

Where the seven went is visible in the categories: `ignored` rose by 13 and
`compile-error` by 4, against 10 newly generated. The new ignored are concentrated in
exactly the places the decomposition created object literals — `buildScheduleResult` (3),
`candidateStartForPred` (2), `applyLocalConstraint` (2), `successorGap` (2) — and
`mutator.excludedMutations` lists `ObjectLiteral`. This is the effect condition 3 names
in its own text: *"decomposing into typed helpers changes which mutations typecheck (and
adds string/object literals in dispatchers and helper returns, which `excludedMutations`
ignores)."*

## Behaviour evidence, independent of the score

- **The 41-fixture oracle passes unchanged.** It was written before C4 and pins the full
  `DeterministicSchedule` across every dependency type, lag sign, constraint type and
  mode, milestone floor and calendar shape. It is the direct test of "did the output
  move", and it says no.
- The full suite passes unchanged: **2242 tests**, none modified for C4.
- `computeDependencySchedule` measures **134 → 6**, with no helper above 14, matching M1's
  prediction exactly. Lint falls 21 → 20.

**This is a decision for the owner, not a judgement to make in passing.** The gate reads
FAIL on conditions 2 and 3; its own stated rationale — *"do not revert on a population
artifact"* — reads PASS. The threshold that separates those two was set at 10% and the
move was 3%.

---

# C4 gate — decision, 2026-08-01

**ACCEPTED and merged under the amended gate.** Not an override of a failing gate — a correction to
two conditions that were mis-specified, made for a reason independent of this result.

## What the amendment is

Conditions 2 and 3 originally compared **ratios** unconditionally, with an escape hatch keyed to the
**magnitude** of denominator movement (>10%). Magnitude is the wrong variable; whether the movement is
**accounted for** is the right one. The amended rule, now in `PLAN_presummit-refactor.md` §3:

- The **absolute `Survived` count** is the primary numeric condition — it does not move with the
  population.
  > ⚠️ **AMENDED 2026-08-02 (§3.5 Step 4) — annotated, not rewritten, because this is a record.**
  > `Survived` does not move with the *denominator*, but it **does** move with **deduplication**:
  > merging N copies of an unguarded line into one removes N−1 survivors and guards nothing. The
  > worker decomposition read as an eight-survivor improvement and **seven of the eight were the
  > same two gaps counted fewer times**. So this bullet is a heuristic, not the condition. The
  > condition is the next one — *accounted for* — applied in **both** directions: a fall needs the
  > same one-by-one mapping as a rise. See `docs/CHARTER_codebase-quality.md` §2 and
  > `docs/mutation-baseline-worker.md`.
- **Score and rate are authoritative only while the denominator holds.** Once it moves they are
  diagnostics.
- Denominator movement must **reconcile across all six mutator categories**. Explained movement is
  acceptable; unexplained movement is a revert trigger.
- **Condition 4 must pass on its own terms regardless.** It is the detector; 2 and 3 are proxies.

## Why C4 passes the amended rule

`Survived` **34 → 34, byte-identical.** All 34 map one-to-one onto C1's 16 in-scope classifications
plus the 18 out-of-scope, **zero new** — against a bound of "more than three new classifications, or
any in the dispatcher or residual." The population reconciles: **+13 ignored + 4 compile-error − 7
killed = +10 generated**, and every one of the seven that left the valid population came out of the
**Killed** bucket. Nothing tested became untested; a smaller set of already-passing mutants reads as a
lower rate.

The mechanism is the one the plan named **in prose, before the run**: object and string literals in
new dispatchers and helper returns, which `excludedMutations` skips. Ignored went 27 → 40, split
StringLiteral 20 / ObjectLiteral 20. The plan predicted the effect and mis-calibrated its trigger.

Independent corroboration the gate does not have: **the 41-fixture oracle passes 44/44**, pinning the
full `DeterministicSchedule` by byte-equality. It was written before C4 and cannot be regenerated away.

## The tell that the old rule was broken

The only way to satisfy old condition 2 was to **return tuples instead of objects** — to make the code
worse. A gate satisfiable only by degrading the artifact it protects is mis-specified, not strict.
The executor identified this and declined to contort the code, which is exactly what the
"do not refactor merely to satisfy a threshold" principle exists for.

## The cost, recorded rather than glossed

**Seven previously mutation-tested sites are no longer mutation-covered.** They became object or
string literals that `excludedMutations` skips. The code still runs and the oracle still pins its
output, but those sites lost mutation coverage. This is a consequence of a pre-existing project config
choice (`excludedMutations: ["StringLiteral", "ObjectLiteral"]`), not of test quality — and it is a
genuine narrowing of surface, not a free win. Anyone revisiting `excludedMutations` should know that
decomposition compounds its effect.

## Post-C4 baseline — the reference for any future comparison

```
killed 191 · timeout 1 · survived 34 · no-coverage 0 · compile-error 124 · ignored 40
generated 390 · valid 226 · score 192/226 = 84.96% · survivor rate 15.04%
```

**Survivor floor for future gates: 34.** Score and rate: use only against a held denominator.
