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

**120 compile-errors + 27 ignored = 39% of generated mutants never enter the denominator.** That is
why C4's gate compares the survivor **rate**, not an absolute count: decomposing into typed helpers
changes which mutations typecheck, and adds literals in dispatchers and helper returns. If the valid
denominator moves more than 10%, re-run the protocol on the pre-C4 tree and adopt that as the
comparison baseline — do not revert on a population artifact.

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
keyed to `computeDependencySchedule` itself — roughly 26 of the 54 live in code C4 never extracts,
so demanding helper-keying for all of them is impossible.

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
