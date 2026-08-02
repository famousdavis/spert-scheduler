# Close-out — quality campaign v2, §3.3 Tier C through §3.7

**Completed:** 2026-08-02 · `main` @ `1191e4a` · **v0.62.2** · **Status: at a clean stopping point.**

Thirteen PRs, thirteen merged, two releases tagged. The campaign continues from
`docs/CHARTER_codebase-quality.md`; §3.5 is named as next.

---

## What landed

| | Before (`01b6ffa`) | After (`1191e4a`) |
|---|---|---|
| ESLint findings | 8 | **6** |
| — errors / warnings | 8 / 0 | 6 / **0** |
| Tests | 2,568 | **2,681** |
| Test files | 126 | **130** |
| Uncovered sub-threshold functions | 21 *(stale)* | **5** |
| `monte-carlo.ts` max cc | 57 | **10** |
| Behavioural regressions | — | **zero** |

Both `NOT VERIFIED` items from the v0.60.0 smoke pass are closed. Two releases:
**v0.62.1** (an import-summary grammar defect) and **v0.62.2** (a real accessibility defect).

### By PR

| PR | Outcome |
|---|---|
| #246 | `ImportSection` at the component level — closes both `NOT VERIFIED` items |
| **v0.62.1** (#247) | the pluralisation defect #246 found; its pin became a proven guard |
| #248 | census re-derived: "51 at cc 10–15, 21 uncovered" → 52 / 9 |
| #249 | the charter moved into `docs/` and tracked |
| #250 | `ProjectPage.tsx` 0% → 48.81%; `scrollIntoView` stub |
| **v0.62.2** (#251) | scenario tabs keyboard-reachable, `aria-current` announced |
| #252 | census #2 (→ 5); falsification runner guarded against non-compiling mutants |
| #253 | the seven-detector table, the cc-15 rationale, the designated next item |
| #254 | `analytics.ts:268` covered; runner guarded against ambiguous needles |
| #255 | falsification specs committed; the direction framing corrected |
| #256 | Monte Carlo oracle pinned; benchmark committed as `npm run bench` |
| #257 | the oracle blind spot; "oracle before refactor" amended |
| #258 | §3.7 — both hot loops decomposed, cost measured; lint 8 → 6 |

---

## ⚠️ The most important output has no artifact, because nothing failed

**The constrained-path benchmark variant was added *before* decomposing, not after.**

The sample Cloud ERP project is entirely unconstrained — 40 activities, all `status: "planned"`,
**zero** `constraintType`, **zero** `actualDuration`. So every benchmark measurement taken up to
that point exercised only the engine's *fast* path. And `applyHardConstraint` — the one
extraction in §3.7 genuinely inside a hot loop, at 400,000 calls per simulation — lives on the
*constrained* path.

**Write out what would have happened.** §3.7 would have reported *"no measurable cost on the
constrained path"*. That claim would have carried a resolution figure. It would have rested on a
benchmark that had been falsified against injected slowdowns and passed. Every process step in
this campaign would have been honoured — pre-registered expectation, separate verdicts, interleaved
timing, resolution attached, no pre-set threshold. And it would have been **entirely vacuous**,
because the code path was never executed.

**A confident zero, produced by a process where every step was followed.** That is the most
dangerous artifact this campaign is capable of generating, and it is strictly worse than no
measurement: no measurement leaves a known gap, while this closes it falsely.

The only reason it does not exist is one decision that nobody would ever have audited — noticing
that the oracle's blind spot (found hours earlier, in a different instrument, in a different
subsystem) had the same shape here. **Ten prior instances in this campaign were reactive**: it
breaks, you convert it to a guard. This one arrived *before* the failure. That is the difference
between accumulating scar tissue and having a method, and it is recorded here because there is no
commit, no test and no red build pointing at it.

---

## Practices worth keeping

**Oracle before refactor — AND falsify the oracle first.** Amended this session, because the
unamended form is not sufficient. The Monte Carlo oracle presented as a 17-fixture behavioural
contract and was **inert on one of the engine's three sampling paths**: perturbing each
`sample()` call site by 1e-7 broke 9 fixtures on the main sequential path, 8 on the dependency
path, and **zero** on the constrained path. A decomposition of that branch would have passed it
and learned nothing.

⚠️ **An unfalsified oracle before a refactor is worse than no oracle**, because it converts
*"unverified"* into *"verified"* without changing what is known. And the oracle is this
campaign's designated backstop — *"an independent behavioural check the metric cannot flatter"*,
the thing that proved C4 correct when the mutation score said otherwise. **The backstop needed a
backstop.**

The root cause generalises further than the fix: **an oracle built from realistic data
systematically under-covers exactly the paths that most need one.** Realistic data exercises
realistic paths; the branches it cannot reach exist for *unusual* states — constrained
activities, completed activities, model exhaustion — which are the branches most likely to be
subtly wrong. v0.54.0/v0.54.1 already found an MFO/FNET off-by-one across four such seams.

**Gate on absolute `Survived`, not the mutation ratio.** §3.7's comparison is the cleanest
instance in the campaign's record:

| | pre | post | Δ |
|---|---|---|---|
| Killed | 125 | 114 | −11 |
| **Survived** | **18** | **18** | **0** |
| Timeout | 5 | 5 | 0 |
| NoCoverage | 1 | 1 | 0 |
| score | 87.25% | 86.23% | −1.02pp |

The whole −1.02pp is eleven *killed* mutants leaving the population as the denominator shrank
149 → 138. Decomposition always shrinks the denominator. The v0.59.11 baseline was three releases
old, so a fresh pre-decomposition run was made on today's code — it reproduced **87.25% exactly**,
which both made the comparison like-for-like and re-validated a baseline nobody had checked since
the Stryker harness fix. Two results from one run.

**A pre-registered threshold is a code-smell detector, not a user-impact gate.** The ~30% figure
fired usefully at **3.8%** — a value that could never matter to a user on a 71ms off-thread
computation — because it pointed at a real pathology: property lookups hoisted *into* an inner
loop, 1.2M per simulation. Hoisting them out recovered most of it.

**Report the sub-claim that didn't hold.** §3.7's pre-registered expectation ("extraction cost
immaterial") held. Its sub-claim ("below resolution") held for `runTrials` and **not** for
`runDependencyTrials`, which measured **+2.5%** against a ~1.2% resolution. Reported as
*"between zero and ~2.5%, marginal"* rather than rounded to zero. **A prediction checked only
where it succeeds is not checked.**

---

## The ledger: eighteen instances, four now guarded by tooling

Four tooling defects were converted from remembered lessons into committed guards this session:

| # | Tool | Cannot do its job → reports | Fix |
|---|---|---|---|
| 1 | `cc` region mode | parse error → **cc 0** | throws (§3.0) |
| 2 | `cc` suppression filter | suppressed → **"no functions"** | two-pass marking (§3.0) |
| 3 | falsify runner | non-compiling mutant → **"0 failing"** | `checkRunComparable` |
| 4 | falsify runner | misapplied mutant → **"survivor"** | `checkNeedleUnique` |

⚠️ **The common factor is NOT "flattering", and the imprecision was load-bearing.** #1 and #2 make
the *code* look simpler; #3 and #4 make the *test* look weak. So the heuristic *"be suspicious
when results look good"* would have caught the first two and **missed both of the others** — and
the defaming direction is the more dangerous, because **a result that criticises your own work
does not get audited.** Nobody re-checks a tool that just told them their test was weak.

What actually holds across all four is direction-agnostic: **the tool returns the value it would
return if there were genuinely nothing to report.** Absence of a result is indistinguishable from
a null result. That is the property to design against.

### Two new categories

- **A green local gate is not evidence about CI** when the local environment carries secrets CI
  does not (`isFirebaseAvailable` from `.env.local`). Every prior entry is a check that *could
  not* fail; this one can fail, did fail, and was believed to have passed because it ran in an
  environment that silently differed. **The unstated variable was not in the check — it was in
  the room.**
- **A measurement inverted by an uncontrolled ordering effect.** A sequential benchmark A/B gave
  a **+5% workload a negative delta** — more work, measured faster, because whichever variant
  runs first pays the JIT warm-up. Every other entry is a check that cannot fail or fails toward
  a null; **this one runs, succeeds, and returns a confident, precise, wrong-signed number.**
  Caught by the injected-delta calibration and by nothing else.

✅ And one instrument behaved correctly: the benchmark's first calibration produced a 0.9ms delta
against sd 1.5ms and reported **NOT DETECTED** — it **refused to certify a resolution it did not
have**. That is behaviour every tool here has failed to have at least once.

### The detector table, labelled honestly

**Seven mechanisms and one person** — and the person does not generalise. The last row is "a
result was implausible against tests I had reason to trust", which fired only because those tests
were days old and the prior was still warm.

⚠️ That forces a harder reading of the base rate. *"Roughly one self-inflicted unfalsifiable check
per substantial item"* is a **detection** rate, not an incidence rate. Before the tooling caught
up, ~10 instances were found and **none by tooling** — every one by a person finding a number
implausible, in code they had just written. Nobody in this campaign has ever caught one in
unfamiliar or old code, which is indistinguishable from there being none to catch. **The true
rate is unknown and bounded below by the measured one.** That is the argument for converting each
detector into a committed guard: a guard works on code nobody remembers writing; the person does
not.

---

## The retired metric

The census was re-derived twice (21 → 9 → 5 uncovered). **The headline is not the finding.**

*"Functions in 0%-coverage files"* now reads **2** while the honest count is **5**.
`ScenarioComparison.tsx` moved 0% → **1.04%**, dropping a cc-10 function out of the "uncovered"
count **while covering none of it**. Of the seven-point apparent improvement, only five points are
real coverage.

**A proxy failing in the flattering direction, inside the measurement this campaign uses to
describe itself, discovered by the campaign's own instrument.** Quote the function-level number
and say which is meant. `docs/CENSUS_cognitive-complexity-2026-08-02b.md` records all 52 band
functions so the next re-derivation can diff rather than re-explain.

---

## §8 — Where we were wrong

**The seven-detector table overstated itself.** Presented as seven mechanisms, it was seven
mechanisms and one person, and the person only fires on recent work. An eighth column that
silently doesn't generalise is itself a check that looks stronger than it is.

**The sample-project blind spot was found late.** It should have been obvious that a fixture built
for realism would not reach the engine's unusual-state branches. It was found by perturbation,
after the oracle had already been written, reviewed and presented as complete.

**Branch stacking, asserted as independence.** `refactor/monte-carlo-hot-loops` was created while
standing on `docs/oracle-blind-spot`, so #258 silently contained #257's charter commit. Both PRs
were green; both were reported as independent, with *"order doesn't matter"*. Merging #258 first
would have landed the charter change under a refactor commit message.

⚠️ **And the orchestrator repeated the claim with authority without running `git log main..branch`
— in a message instructing rigour.** The instructive part is *where* checking stopped: this
session verified the copyright-guard regex, the sample project's zero `constraintType`, the
mutation arithmetic in both directions, the cc figures, and the oracle's byte-identity — i.e.
**everything that felt like a measurement, and nothing that felt like bookkeeping.** Git topology
reads as process, not evidence, so it was waved through by both parties. What caught it was a
system note about unexpected file state. **Neither of us was running a check that would have.**

Handled by merging #257 first, rebasing (git dropped the duplicate patch automatically), and
**re-running CI, because the prior green was for a different tree** — the exposure rule applied to
one's own green checkmark.

---

## Recorded results that are not findings

**`createSampleProject`'s blind spot does not generalise.** Four files use it. Two — the Monte
Carlo oracle and the benchmark — feed it into the engine and were both fixed this session. The
other two (`sample-project-service.test.ts`, `sample-project.test.ts`) assert *assembly and
fixture shape*: next-Monday logic, schema validity, id re-minting, cross-reference remapping,
acyclicity, non-ageing milestone targets. **None exercises the simulation engine**, so "all
activities planned" is not a gap in them — it is simply what the fixture is. Bounded, not
systemic. Recorded so the question is not reopened by the next person who notices the fixture is
unconstrained.

**`ScenarioTabs.tsx:40` sits at cc 15 on purpose.** v0.62.2's accessibility fix moved it 13 → 15
and parked it one point under the lint threshold. The added branching *is* the accessibility.
Do not refactor it back under. Full rationale in the charter's §1.

**`analytics.ts:268`'s remaining mutation survivor is an equivalent mutant** — the clamp is
duplicated at the use site, so removing one leaves the other. Not killable; not fixed.

---

## Next: §3.5, the worker decomposition

**`src/workers/simulation.worker.ts:41`, cc 30.** Named here at the head of the ordered work, not
left to be picked.

It is the cheapest remaining substantial item: same subsystem as §3.7, it imports the two
functions just decomposed so the context is warm, and it is **already well covered thanks to C2's
19 message-seam tests** — which makes it a *decomposition* problem rather than a coverage one.

⚠️ **`analytics.ts:268` was named "the cheapest open item" in two consecutive censuses and skipped
both times.** Naming the next item explicitly, at the head of the list, is the mechanism for not
repeating that. It took a third pass and twenty minutes to close, and two censuses had called it
trivial without anyone checking.

It still needs the full treatment: an oracle written and **falsified** before a line moves, a
mutation comparison on absolute `Survived` with all six categories, and separate verdicts if the
decomposition splits. It was deliberately **not** started at the end of this session — starting it
with little context risks landing it half-verified, which thirteen PRs have now demonstrated is
worse than not starting.

Everything in §3.4 and §3.6–§3.9 beyond that remains unranked. Re-derive an order from evidence.
