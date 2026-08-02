# Mutation baselines — the rest of Stryker's mutate scope

**Recorded:** 2026-08-01 · **Tree:** `main` @ `85cc711`, v0.60.0
**Covers:** every file in `stryker.config.mjs`'s `mutate` list except `deterministic.ts` and
`monte-carlo.ts`, which have their own records (`docs/mutation-baseline-c1.md` and the v0.59.11
survivor work).
**Charter item:** `docs/CHARTER_codebase-quality.md` §3.1.

Tracked on purpose, for the same reason as `mutation-baseline-c1.md`: `reports/mutation/` is
gitignored, and a comparison baseline that lives only in an ignored directory is not a baseline.
`.md` outside `src/`, so the copyright-header guard does not require a header.

Before this, **only two of the fourteen files in scope had ever been driven to a recorded number.**

---

## Protocol

```bash
node scripts/mutation-run.mjs <file>       # clears .stryker-tmp + the incremental cache,
                                           # then asserts a FRESHLY WRITTEN mutation.json
```

One file per invocation — the runner keys the report by target, so a glob would not resolve.
All ten runs below used identical command, scope and cleared cache.

⚠️ **Keep the machine otherwise idle.** `Timeout` counts as *detected*, so CPU contention inflates
a score. See the `dependency-graph.ts` note below — this was checked, not assumed.

**Wall clock:** the nine substantive files took **~11 minutes total** on a quiet machine.
`dependency-graph.ts` alone takes ~13 min; its 274 mutants and 9 genuine timeouts dominate.

Three preconditions, each of which has silently corrupted a run before — unchanged from
`mutation-baseline-c1.md`: `maxTestRunnerReuse: 1` must stay in `stryker.config.mjs`; the
incremental cache must be deleted; a CLI `--reporters` flag *replaces* the config list.

**No config edits were needed.** `vitest.stryker.config.ts`'s `include` already covers the test
files for all seven mutate patterns. This is the difference between §3.1 and §3.4 (the CSV parser),
which needs two edits or every mutant reports `NoCoverage`.

---

## Summary — all six categories, every file

> This table is the **baseline**: a point-in-time measurement, left as recorded. Three of these files
> were remediated in the same session — see *Post-remediation* at the end for the new numbers. Compare
> future runs against whichever of the two is the right reference for what you are doing.

| File | Killed | Timeout | **Survived** | NoCov | CompileErr | Ignored | Generated | **Valid** | Score |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| `distributions/normal.ts` | 147 | 1 | 6 | 0 | 11 | 3 | 168 | 154 | **96.10%** |
| `distributions/truncated.ts` | 51 | 0 | 2 | 0 | 23 | 15 | 91 | 53 | **96.23%** |
| `distributions/uniform.ts` | 39 | 0 | **0** | 0 | 6 | 3 | 48 | 39 | **100.00%** |
| `distributions/log-normal.ts` | 30 | 0 | 3 | 0 | 7 | 3 | 43 | 33 | **90.91%** |
| `distributions/triangular.ts` | 83 | 0 | 12 | 1 | 11 | 3 | 110 | 96 | **86.46%** |
| `distributions/factory.ts` | 5 | 0 | 4 | 0 | 6 | 12 | 27 | **9** | **55.56%** |
| `schedule/dependency-graph.ts` | 150 | 9 | 17 | 1 | 64 | 33 | 274 | 177 | **89.83%** |
| `schedule/constraint-utils.ts` | 117 | 0 | 12 | 5 | 34 | 72 | 240 | 134 | **87.31%** |
| `schedule/milestone-sim-params.ts` | 26 | 0 | 6 | 0 | 14 | 1 | 47 | 32 | **81.25%** |
| `schedule/buffer.ts` | 4 | 0 | **0** | 0 | 10 | 2 | 16 | **4** | **100.00%** |
| **Totals** | **652** | **10** | **62** | **7** | **186** | **147** | **1064** | **731** | **662/731 = 90.56%** |

Reconciles: `652+10+62+7+186+147 = 1064` generated; `652+10+62+7 = 731` valid.

**333 of 1064 generated mutants (31.3%) never enter a denominator** — 186 compile-errors plus 147
ignored. Comparable to `deterministic.ts`'s 39%.

### Files with no mutable surface

| File | Result |
|---|---|
| `distributions/distribution.ts` | Stryker exits at dry run: **"No tests were found"** |
| `distributions/index.ts` | same |

Both are type-only after erasure — a lone `export interface` and a re-export barrel. The runner
throws its **STALE** guard rather than reporting a number, which is correct behaviour and worth
recording: `mutation.json` still held the *previous* file's data, and without that guard this
document would have recorded `constraint-utils.ts`'s numbers twice more under the wrong filenames.
The guard earned its keep here.

---

## ⚠️ Two scores that must not be read at face value

**`buffer.ts` — 100% on a denominator of four.** Ten of sixteen mutants were `CompileError` and two
`Ignored`: a **62.5% compile-error rate**, against 31.6% for `deterministic.ts` and 23.4% for
`dependency-graph.ts`. Four surviving-capable mutants is close to no evidence. Recording this as
"the strongest file in scope" would be a flattering-direction misreading of exactly the kind this
campaign keeps catching. **Compare `uniform.ts`: also 100%, but on 39 valid mutants.** Same
headline, entirely different evidence.

**`factory.ts` — 55.56%, the weakest file in the whole mutate scope**, and 12 of its 27 mutants are
`Ignored` (it is a switch returning object literals, which `excludedMutations` skips). Its four
survivors are all genuine gaps, not equality edges — see below.

**Score is authoritative only while the denominator holds.** Per `mutation-baseline-c1.md`'s
amended rule, the **absolute `Survived` count** is the primary comparison figure for every file here.

⚠️ **Amended 2026-08-02:** `Survived` is a *diagnostic*, not the gate — it falls under
deduplication without anything improving (§3.5 Step 4: 14 → 6, of which seven were duplicate
mutants collapsing). **The gate is whether the delta reconciles, in either direction.** Charter §2.

### The small-denominator rule — stated, with its reason

*Added 2026-08-01. The two instances above were recorded from the start; the rule behind them was
argued in conversation and never written down, so every reader had to re-derive it. That is the same
omission class as a stale figure — worse, because nothing contradicts it.*

**Below roughly 20 valid mutants, a mutation score is not evidence.** Not "weak evidence" — the
interval is too wide to separate a well-tested file from a badly-tested one.

Derivable, so it needn't be taken on faith. Using the exact (Clopper-Pearson) 95% lower bound for a
perfect score, `0.025^(1/n)`:

| Valid mutants `n` | `n/n` killed means "true kill rate is at least…" |
|---|---|
| 4 | **39.8%** |
| 9 | 66.4% |
| 20 | 83.2% |
| 39 | 91.0% |

So `buffer.ts`'s 100% on 4 is consistent with a true kill rate under 40% — indistinguishable from the
weakest file in scope. `uniform.ts`'s 100% on 39 rules out anything below 91%. **Identical headline,
opposite strength.** Around n≈20 a perfect score starts carrying real information, which is where the
threshold comes from; it is a judgement about where the curve turns, not a bright line.

**The corollary matters more than the rule.** A thin denominator undermines **the score**, not the
**individual survivor findings**. A survivor is a specific mutant a specific test suite failed to
kill — that observation is exactly as valid at n=9 as at n=900. `factory.ts`'s four survivors were
real gaps at any denominator, and closing them (4 → 0, denominator held at 9) was right regardless of
what its 55.56% did or didn't mean.

**Practical consequence:** never rank files by score without printing the denominator beside it, and
never dismiss a survivor because the file's score looks acceptable.

---

## `dependency-graph.ts` — a contention check that came back clean

The first run of this file (during the charter review) happened while a CPU-heavy ESLint sweep was
running concurrently. It reported **9 `Timeout`s** where every other file in the quiet chain reported
0 or 1. Timeouts count as *detected*, so contention would have **inflated** the score — 159/177
rather than 150/177, 89.83% rather than 84.75%.

Re-run on an idle machine. Result, all six categories:

```
{"Ignored":33,"Killed":150,"CompileError":64,"Timeout":9,"Survived":17,"NoCoverage":1}
generated 274 | valid 177 | score 159/177 = 89.83%
```

**Byte-identical.** The 9 timeouts are genuine: mutating Kahn's algorithm's loop conditions
(`while (queue.length > 0)`, the in-degree decrement) produces real infinite loops, and this is the
only file in scope containing an unbounded loop. **89.83% stands.** Recorded because the suspicion
was reasonable, the check was cheap, and it converted an assumption into a fact.

---

## Survivor classification

Three buckets. **GAP** — a branch or guard no test exercises in the mutated direction; killable, and
the kill is worth having. **EDGE** — a boundary-equality mutant (`<` vs `<=`, `>=` vs `>`) that needs
a fixture at the exact boundary; the same family C1 found largely equivalent in `deterministic.ts`,
so each needs an individual reading before it is called equivalent. **NOCOV** — never executed at all.

### `factory.ts` — 4 survivors / 9 valid · **all GAP**

| Line | Mutant | Bucket | Reason |
|---|---|---|---|
| L39 | `ConditionalExpression → false` | **GAP** | the `if (mean <= 0) throw` guard for LogNormal is never entered |
| L39 | `EqualityOperator mean <= 0 → mean < 0` | **GAP** | no fixture uses a mean of exactly 0 |
| L39 | `BlockStatement → {}` | **GAP** | the throw itself is never executed |
| L71 | `LogicalOperator ?? → &&` | **GAP** | the `DISTRIBUTION_LABELS[…] ?? activity.distributionType` fallback is never reached |

⚠️ **This is the most consequential cluster in the record.** `createDistributionForActivity` decides
which distribution *every* activity gets, and **both of its defensive branches are unverified**. The
L71 fallback exists specifically for malformed data — an older export, a hand-edited project file, a
future schema version read by an older build — per the comment above it. Nothing tests that path.

### `constraint-utils.ts` — 12 survivors + 5 no-coverage

| Function | Lines | Bucket | Note |
|---|---|---|---|
| `detectSoftViolation` | L384–385 ×5 | **NOCOV** | ⚠️ **the entire `case "FNET"` arm is never executed by any test** |
| `detectSoftViolation` | L391 ×2 | EDGE | `lfNet > constraintDate` boundary |
| `applyBackwardConstraint` | L218, L227 ×2 | EDGE | `constraintDate < lsNet` / `< lfNet` boundaries |
| `applyBackwardConstraint` | L249 | **EQUIVALENT** | `case "FNET":` in a `case "SNET": case "FNET": break;` group — see below |
| `applyForwardConstraint` | L93, L102 | EDGE | `constraintDate > esNet` / `> efNet` boundaries |
| `applyForwardConstraint` | L110 | **EQUIVALENT** | `case "FNLT":` in a `case "SNLT": case "FNLT": break;` group — see below |
| `detectHardConflict` | L307, L319 ×2 | EDGE | `esNet < constraintDate` / `efNet < constraintDate` boundaries |

⚠️ **FNET is the standout.** It has a bug history — the MFO/FNET Monte Carlo off-by-one fixed across
four seams in v0.54.0/v0.54.1 — and its soft-violation branch is the one arm of that switch no test
reaches. **Cover FNET first.**

> ⚠️ **CORRECTED — L249 and L110 were first recorded as `GAP`; they are `EQUIVALENT`.** A case body
> containing only `break`, in a switch with no `default`, is behaviourally identical to not matching
> at all — so removing the label changes nothing and no test can kill it. The evidence was already in
> hand when the wrong call was made: `it("FNLT hard: no forward-pass effect")` and
> `it("FNET hard: no backward-pass effect")` both exist, both pass, and the mutants survived anyway.
> Caught by doing the per-file analysis before touching the file.

### The heuristic this yields — and its trap

**A surviving mutant beside a green test that names its behaviour means one of two things: the mutant
is equivalent, or the test is vacuous. It points at a question, not an answer.**

⚠️ The first draft of this note stopped at "that combination is the signature of an equivalent
mutant." **That is wrong, and this project already has the counterexample.** In C1a,
`it("FF violation detected when constraint forces finish before required")` was green, named exactly
the mutated behaviour, and **eighteen mutants sat behind it** — because its `expect` was wrapped in
`if (dependencyConflicts?.length > 0)` and nothing in the suite had ever produced a dependency
violation. The assertion could not fail. Read through the wrong half of the heuristic, those eighteen
would have been filed as equivalent and never revisited.

**Disambiguate by breaking the behaviour by hand and checking that the named test fails.** For the two
`case` collapses the argument is structural — a `break`-only body in a switch with no `default` cannot
be observed. For `triangular.ts` below it was numeric: one `node -e` comparing both branch formulas at
the boundary. Either is fine. Skipping the step is not.

Also note **72 `Ignored`** here, 30% of generated — the highest ratio in scope.

### `triangular.ts` — 12 survivors + 1 no-coverage

Concentrated in `inverseCDF` (L71–81) and `cdf` (L106–108).

| Lines | Bucket | Note |
|---|---|---|
| L71 ×4 + 1 NoCov | **GAP** | the `p < 0 \|\| p > 1` domain guard is never entered — including `LogicalOperator \|\| → &&` |
| L74, L75, L76, L81 | **EQUIVALENT** | early returns the continuous branches reproduce exactly |
| L79 | **EQUIVALENT** | `p < fc` vs `p <= fc` — both branches yield `c` at the mode |
| L106–108 ×3 | **EQUIVALENT** | `cdf` clamps the fallthrough reproduces exactly |

⚠️ The L71 domain guard cluster matters: `inverseCDF` is called with percentile inputs throughout the
scheduler, and its out-of-range rejection is untested. **It is also the only killable cluster here.**

> ⚠️ **CORRECTED — L74/L75/L76/L81 were first recorded as `GAP` and L79/L106–108 as `EDGE`. All eight
> are `EQUIVALENT`, verified numerically rather than reasoned.** The Triangular CDF is continuous and
> its two branches meet exactly at the mode, so every boundary the guards protect is a value the
> fallthrough already produces:
>
> ```
> inverseCDF at p===fc:  lower-branch 5        upper-branch 5        literal c 5
> cdf at x===c:          low 0.2857142857…     high 0.2857142857…    fc 0.2857142857…
> cdf at x===a:          guard 0               fallthrough 0
> cdf at x===b:          guard 1               fallthrough 1
> ```
>
> Algebraically: at `p = fc`, `a + √(fc·(b−a)·(c−a)) = a + (c−a) = c`, and
> `b − √((1−fc)·(b−a)·(b−c)) = b − (b−c) = c`. The degenerate and `p === 0` / `p === 1` early returns
> reduce the same way. **Eight of thirteen survivors here are unkillable**, which is why a blanket
> equivalence sweep would have been poor value: per-file, at the moment of touching the file, this
> cost one `node -e`.

### `normal.ts` — 6 survivors / 154 valid · **96.10%**

`normalQuantile` L44, L49 ×2, L56 ×2 and `normalErf` L127 — the low/high tail-region branch
selection. **All EDGE**: rational-approximation region boundaries (`p <= pLow`, `p < pHigh`), where
a fixture at the exact split point is needed. Same family C1 classified as largely equivalent.

### `milestone-sim-params.ts` — 6 survivors / 32 valid · **81.25%**

| Line | Bucket | Note |
|---|---|---|
| L65 ×2 | **GAP** | both directions of a guard survive — never entered |
| L82 ×2 | EDGE | `Object.keys(activityEarliestStart).length > 0` at zero |
| L41, L42 | **GAP** | `computeActivityEarliestStartOffset` guards not exercised |

### `log-normal.ts` — 3 survivors · `truncated.ts` — 2 survivors

`log-normal` L65, L70, L71 — the `x <= 0` domain guard of `cdf`. **GAP** (L65, L71) and **EDGE**
(L70, `x <= 0` vs `x < 0`).
`truncated` L52 `1 - Number.EPSILON` **EDGE** (the unbounded-breach threshold) and L64
`c > this.lowerP` **EDGE**.

### `buffer.ts`, `uniform.ts` — no survivors

Nothing to classify. See the denominator caveat above for `buffer.ts`.

---

## What this changes

1. **"Unmeasured" did not mean "weak."** Seven of the ten files score **86%+**, and the scope total
   is **90.56%** — above `deterministic.ts`'s 84.96% after a multi-week step. v1 of the charter
   implied the opposite.
2. **The weak spots are specific and small**, not diffuse: `factory.ts`'s two defensive branches,
   `constraint-utils`' FNET arm, and `triangular.ts`'s domain guard. Roughly a day of test-writing,
   not a campaign.
3. **`buffer.ts` needs a different kind of attention.** Its problem is not a low score but a
   denominator too thin to support one. That is a question about what the file's mutants *are*, not
   about its tests.
4. **The C4 gate's denominator is now protected** for the whole scope at the cheapest moment there
   will ever be — before any of §3.3–§3.9 moves a line.

**Recommended follow-up, in value order:** `factory.ts` (4 GAPs on a 9-denominator) →
`constraint-utils` FNET (5 NoCov on a branch with a bug history) → `triangular.ts` domain guard →
`milestone-sim-params` guards.

⚠️ **Do not sweep the EDGE population.** Its only value is supporting a future revert gate, and no
such gate exists for these files — nothing is about to be refactored under a mutation comparison.
C1 classified 54 survivors over two weeks *because* C4's gate depended on each having a counterpart
to map onto. Classify per-file, at the moment that file is about to change. The triangular
correction above is what that looks like: eight equivalences established in one command, because
the file was being touched anyway.

---

## Post-remediation — 2026-08-01, same session

The three recommended targets, done. **Every result matched a prediction registered before the run,
to the mutant, with every denominator held** — so the scores below are comparable, not just the
survivor counts.

| File | Survived | NoCoverage | Score | Denominator |
|---|---|---|---|---|
| `factory.ts` | 4 → **0** | — | 5/9 → **9/9 = 100.00%** | held at 9 |
| `constraint-utils.ts` | 12 → **10** | 5 → **0** | 117/134 → **124/134 = 92.54%** | held at 134 |
| `triangular.ts` | 12 → **8** | 1 → **0** | 83/96 → **88/96 = 91.67%** | held at 96 |

**Scope total: 662/731 = 90.56% → 675/731 = 92.34%, 62 survivors → 49.**

What was written, and why each kill works:

- **`constraint-utils`** — the soft matrix completed with MFO, FNET and FNLT, three cases each. The
  middle case carries the weight: the comparison is strict, so an activity landing *exactly* on its
  constraint date is not a violation, and without that fixture `<` mutated to `<=` survives.
- **`factory.ts`** — both defensive branches, with fixtures that deliberately construct Activities
  normal validation would reject, because that is precisely what the branches exist for. Also pins
  `cause` preservation, which nothing tested.
- **`triangular.ts`** — the `p < 0 || p > 1` domain guard, both disjuncts plus the closed-interval
  endpoints so the guard is pinned as not over-broad.

**The residual survivors are exactly the sets classified `EQUIVALENT` above** — `triangular`'s
remaining eight are L74, L75, L76, L79, L81, L106, L107, L108, and `constraint-utils`' ten are the
two `case` collapses plus the eight boundary EDGE mutants. Nothing unexplained is left in these three
files.

⚠️ One assertion in the new tests was wrong on first run and the tests caught it before the mutation
run did: soft-violation messages carry the **raw code** (`Soft constraint FNLT 2026-04-10 …`), not
the long label — only *hard* conflicts use the `"Must Start On"` style. Worth knowing before writing
any further constraint-message assertion.
