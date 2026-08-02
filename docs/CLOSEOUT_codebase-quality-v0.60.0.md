# Close-out — pre-Summit quality campaign (v0.59.12 → v0.60.0)

**Completed:** 2026-08-01 · `main` @ `29b351e` · **Status: complete at target.**

The October conference constraint that shaped this plan was removed near the end. The
campaign is closed at its stated target rather than extended; a new campaign picks up
from `docs/CHARTER_codebase-quality.md`.

---

## What landed

| | Before | After |
|---|---|---|
| ESLint findings | 23 | **10** |
| — errors / warnings | 17 / 6 | 10 / **0** |
| Mutation score, `deterministic.ts` | 69.10% | **85.41%** (pre-C4 basis) |
| Tests | 2,135 | **2,280** |
| Test files | 102 | 107 |
| Behavioural regressions | — | **zero** |

**Thirteen of thirteen deltas banked.** Eleven PRs, every one gate-green in CI, `main`
clean throughout. Two releases: **v0.59.13** (two real defects) and **v0.60.0** (SD-1).

Every delta from 23 → 17 was a **removal**. Only the last seven were suppressions, and
those are interim (see *Open questions*).

### By step

| Step | Outcome |
|---|---|
| Week 0 | M1–M4 measurements; `.stryker-tmp` lint contamination closed; tags 63 → 75 |
| B1 | 12 tests over `importProjects`' drift ladder |
| **v0.59.13** | two defects B1 exposed, fixed as their own release |
| B2 | **SD-1 closed** — `planImportDecisions` extracted; 23 → 21 |
| C1a/C1b | 54 in-scope survivors: 38 killed, 16 classified |
| Oracle | 41-fixture output contract for `computeDependencySchedule` |
| C3 | `constraintMap` conversion shared across both simulation seams |
| C4 | `computeDependencySchedule` **134 → 6**; 21 → 20 |
| C5 | active scenario derived, not effect-synced; 20 → 19 |
| B3 | banner + CDF interpolation extracted and tested; 19 → 17 |
| B5/B6 | seven justified suppressions; 17 → **10** |
| C2 | Worker message seam covered — 19 tests |
| Tooling | measurement probes committed as `npm run cc` / `npm run mutate` |

---

## What was found that nothing was looking for

The campaign's stated goal was a lint number. Its most valuable output was five defects
and one latent bug that no one had gone looking for — all surfaced by *writing tests
before refactoring*, never by the metric.

1. **Same-batch copy naming** (`use-project-store.ts`, fixed v0.59.13). Importing two
   same-named projects and choosing "keep both" gave both copies the identical name.
   `nextCloneName` read a pre-update snapshot and could not see the sibling minted a line
   earlier. Ids were always unique — only the labels collided.

2. **Post-`set()` error envelope** (fixed v0.59.13). `repo.remove` and three
   `removeLastScenarioId` calls ran unguarded *after* the state transition had committed.
   A storage failure there escaped `importProjects` as an exception: the import had
   happened, but the caller received no `ImportOutcome` and the remaining cleanup was
   skipped.

3. **A missing route `key`, closed by construction** (C5). `{ path: "project/:id" }` has
   no key, so navigating project → project keeps the component mounted. The old effect
   only ran when the active scenario id was falsy, so a stale id survived that transition
   and rendered no scenario. Scoping the selection to its project closed it as a
   consequence of the right design, not a separate patch.

4. **A test that could not fail** (C1a). `"FF violation detected…"` wrapped its assertion
   in `if (dependencyConflicts && length > 0)`. Nothing in the suite had *ever* produced a
   dependency violation, so eighteen mutants sat behind an assertion that never ran.

5. **A cyclic dependency graph posts a result, not an error** (C2). `buildDependencyGraph`
   throws on cycles; this path never reaches that throw. The UI prevents cycles, so it may
   be unreachable — but defence-in-depth validation is what the rest of that handler does.
   **Flagged, not fixed, and deliberately not pinned by a test** — a test would enshrine
   the behaviour rather than record the question.

   > ⚠️ **CORRECTION, 2026-08-02 (§3.5 Step 3). The claim above is false as stated, and this
   > record is left intact rather than rewritten.** All three shapes were measured against
   > `buildDependencyGraph` directly: a **self-loop** (`a→a`) does not throw, a **2-cycle**
   > throws, a **3-cycle** throws. So it is not "a cyclic dependency graph" — only a
   > **self-edge** passes, because `dependency-graph.ts:47` `continue`s on `from === to` and
   > the edge never enters `inDegree`. Real cycles throw, and the worker correctly converts
   > that into a posted error. The charter's §3.5 already had this right; this closeout did
   > not. Both behaviours are now pinned in `simulation.worker.test.ts` — the self-loop as
   > **recorded-not-specified**, and the real-cycle error beside it as the contrast that
   > gives it meaning. **The open question is narrower than recorded:** not "why do cycles
   > post results", but *"should a self-edge be rejected, or is silently ignoring a semantic
   > no-op correct?"* — which is a product decision, where the original wording sounded like
   > a bug.

---

## Practices worth keeping

**Sequence: test → fix → refactor.** B1's tests exposed two defects; they shipped as
v0.59.13 *before* B2 touched the code. Folding them into the refactor would have broken
its own abort condition — "behaviour-identical under B1's tests" is meaningless if the
tests are changing in the same commit. B2 then passed with every prior test unmodified,
which is what made "behaviour-preserving" evidence rather than intention.

**Measure the decomposition before moving a line.** Every target was set by measuring a
hypothetical lift. It caught a recipe that would have burned 18–26 h to land a residual
of 23 instead of the predicted 6. Now `npm run cc <file> <start>-<end>`.

**A verification harness must prove it ran.** Four separate times this project has had a
check that silently never executed and therefore reported good news — Stryker's stale
runner reuse, a lint check that copied a clean file, `--reporter=basic` removed in
Vitest 4, and a region probe whose parse error read as "cc 0". All four looked like
success. Assert a positive signal; throw when it is absent.

**A conditional assertion is the same defect.** An `expect` inside an `if` is a test that
opted out of failing. Assert the precondition, then assert on it.

**Verify a guard by breaking it.** Every guard test in this campaign was confirmed by
mutating the thing it protects and checking the *named* test fails. Two harness bugs were
found this way — including one where 5 of 5 mutations reported "survived" because the
runner never started.

**Keep an independent behavioural check the metric cannot flatter.** The 41-fixture
oracle proved C4 preserved behaviour when the mutation score said otherwise. It was
written *before* the refactor, compares by byte equality, is deliberately excluded from
the Stryker allowlist, and cannot be regenerated away by `-u`.

**Gate on accounted movement, not magnitude.** C4's gate failed on a ratio while
`Survived` held byte-identical at 34. The whole 0.45pp drop was seven *killed* mutants
leaving the population. The tell that a gate is mis-specified: the only way to satisfy it
was to return tuples instead of objects — to make the code worse.

---

## Open questions — recorded as unsettled, not resolved

**The suppressions in B5/B6 are interim.** The justifications are specific and sound, but
"cannot be proven behaviour-identical against data we no longer have" argues for *needing
an oracle*, not for never touching it. A synthesised v5 corpus and the Firebase emulator
both exist.

**The Monte Carlo hot-loop exclusion was never measured.** "Leave permanently" was
reasoned, not benchmarked. This campaign already produced one case where confident
reasoning about extraction cost was wrong in a way only measurement revealed.

**Seven sites lost mutation coverage in C4.** They became object or string literals that
`excludedMutations` skips. The oracle pins their output — a different guarantee. Anyone
revisiting `excludedMutations` should know decomposition compounds its effect.

**The lint metric ranked risk backwards.** The cc-134 function was flat sequential CPM
and decomposed cleanly. The cc-49 was nested mutable state carrying seven documented
pitfalls. The number is an output of code quality, not a measure of it.

---

## Smoke pass — result, honestly

Not a gate; its result blocked nothing. Four items, run once.

| Item | Result |
|---|---|
| Dependency-mode UI pass | **Pass** — 294 working days, finish 10/04/2027, 136 dependency arrows, 198 bars, milestones with slack |
| Real-Worker determinism | **Pass** — two runs, byte-identical percentile tables |
| CDF comparison view | **Pass** — both series, axes, P95 target line |
| Multi-scenario restore | **Pass** (during C5) — a non-first scenario restored after full reload |
| Export half of export→clear→re-import | **Pass** — 222 KB, valid envelope, schema 23, both scenarios |
| **Import half, and JSON import from Settings** | **NOT VERIFIED** |

The import half could not be driven from the automation harness. Three techniques were
tried — `defineProperty` on `files` plus a change event, direct `files` assignment plus a
change event, and invoking React's `onChange` from the fiber. The console stayed clean
throughout and no state changed. **This is a harness limitation simulating a file picker,
not an observed application fault**, and it is recorded as unverified rather than passed.

What that leaves untested is the DOM plumbing between the file picker and the import
logic. The logic itself is the best-covered code in the campaign — 15 tests on
`planImportDecisions`, 15 on `importProjects`' drift ladder and save loops. Its permanent
form is a component-level test, which is Gap 1.
