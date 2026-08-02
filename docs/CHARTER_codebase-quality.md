# Charter — codebase quality (v2)

**Opened:** 2026-08-01 · **Revised:** 2026-08-02 · **Owner:** William W. Davis, MSPM, PMP
**Supersedes:** `PLAN_presummit-refactor.md` (complete) and this charter's v1
**Review evidence:** `CRITIQUE_codebase-quality-charter_Opus-1.md` — *root, untracked. A
point-in-time artifact, deliberately left under the root convention; its §3.1 census figures are
superseded by `docs/CENSUS_cognitive-complexity-2026-08-02.md`.*

**State, re-derived 2026-08-02 (§3.5 Step 4 branch):** `main` @ `bee6cc6` · **v0.62.2** ·
lint **5 (5 errors, 0 warnings)** · **2,704 tests / 131 files**
*Carried forward, NOT re-derived today:* `deterministic.ts` mutation **84.96%** (34 survivors) —
no source change since it was measured, but nothing has re-run it either.

⚠️ **This State line has now gone stale three times.** It read `85cc711` / v0.60.0 / lint 10 /
2,280 tests for four releases, then `01b6ffa` / v0.62.0 / 2,568 tests for three more, then
`bf4d8b6` / v0.62.1 / lint 8 / 2,600 tests while `main` was two releases past it. §4's *"every
reference here is anchored at `85cc711`"* is stale in the same way. **Re-derive line numbers rather
than trusting any anchor in this file.**

⚠️ **And the test count is a worked example of why.** The §3.5 Step 4 handoff, and PR #260's own
body, both stated **2,703**. Measured on that exact tree: **2,704**. Off by one, in a figure
written by the session that produced it, propagated into the next session's brief as a state to
verify against — which is the only reason it was caught.

> **Moved into `docs/` and tracked, 2026-08-02.** It lived at the repo root, untracked, alongside
> the point-in-time `PROMPT_`/`ANALYSIS_`/`CRITIQUE_` working files. Three reasons it does not
> belong there: `docs/CLOSEOUT_codebase-quality-v0.60.0.md` is tracked and equally candid about
> this codebase's weaknesses, so the precedent exists; this is a *living controlling document* that
> has taken at least seven corrections, **none of which was recoverable or attributable**; and
> `docs/CENSUS_cognitive-complexity-2026-08-02.md` (#248) made the chain incoherent — a tracked
> record citing an untracked authority. It was never in git, so there is no prior history to
> recover; attribution starts here. The root convention and gitignored `CLAUDE.md` are unchanged.

---

## 1. The goal

**The cleanest, most maintainable, safest codebase this app can have.** Concretely: *when I change
something, will anything tell me I got it wrong?*

**This is not a lint-count campaign.** v1 said so and then organised itself around the ten remaining
findings anyway. The review measured why that was wrong: **52 functions sit at cc 10–15 — invisible
to lint — and 5 of them never execute.** The single most consequential file in the
app measures cc 14 and will therefore never appear in a lint report. The count is an output.

⚠️ *This read "51 … 21 of them uncovered" until 2026-08-02, from the review at `85cc711`.
Re-derived at `e3e6521` — `docs/CENSUS_cognitive-complexity-2026-08-02.md`, which records the
**complete** band list so the next re-derivation can diff rather than re-explain. The argument got
stronger, not weaker: the lint-visible population is still **10**, so the band is still five times
larger and still holds `ProjectPage.tsx`. What changed is the exposure — 21 → 9, retired by §3.2,
§3.3 and the parity oracle, **none of which moved the lint count.** Note two definitions now
differ: 9 counts functions in 0%-coverage files (like-for-like with the original); **10** counts
functions that never execute. Say which you mean.*

### The canonical example — read this before "fixing" `ScenarioTabs.tsx:40`

⚠️ **`SortableScenarioTab` sits at cc 15 on purpose. Do not refactor it back under.**

v0.62.2 made the scenario tabs keyboard-reachable and gave them `aria-current`, so assistive
technology can finally report which scenario is active. That change — unambiguously better for
real users — moved the function from **cc 13 to cc 15**, and parked it **one point under the lint
threshold**, where the metric will never mention it again.

The added complexity **is** the accessibility: a `<button>` with `onClick`, `onDoubleClick` and a
conditional `aria-current` is genuinely more branching than a `<span>`. Reducing it would be
optimising the number rather than the code — the move this charter forbids — made worse by the
fact that the number got worse *because the software got better*.

It is not a lint finding. It needs no action. It is here because the campaign's central claim —
**the metric ranks risk backwards** — was demonstrated by a change the campaign itself produced,
inside the release that produced it. Full derivation:
`docs/CENSUS_cognitive-complexity-2026-08-02b.md`.

**No schedule, no deadline, no tripwires.**

---

## 2. Standing practices

Full derivation in `CLOSEOUT_codebase-quality-v0.60.0.md`. Two govern everything:

**Measure before asserting.** v1 of this charter was reviewed by measurement and **eight of its
claims were wrong or overstated** — including its own headline mutation figure. If a number gates a
decision, produce it.

**Guard against checks that cannot fail.** ⚠️ **Twenty instances now** — this table said *"seven"*
and listed seven until 2026-08-01, while five more sat in commit bodies and one arrived that day.
**None was caught by tooling; every one was caught by a person finding a result implausible.**

| | The check that couldn't fail |
|---|---|
| v0.59.10 | Stryker runner reuse → mass false `Survived` |
| Week 0 | P1's verification copied a lint-clean file — read 23 either way |
| B1 | `--reporter=basic` removed in Vitest 4 → startup error → no failure lines |
| C1a | `expect` nested in `if (conflicts?.length > 0)` — 18 mutants immune |
| Oracle *(prevented)* | a `vitest` snapshot would let `vitest -u` absorb the regression it exists to catch |
| Close-out | `cc`'s region mode reported a parse failure as **`cc 0`** |
| Review | `cc` reports "every function measures 0" for suppressed functions — see §3.0 |
| §3.3 Tier A | a fixture with a wrong field — green while testing the *opposite* of its name |
| §3.3 Tier A | `as Partial<T>` casts disabled the type check that would have caught that fixture |
| §3.2 | `vi.resetModules()` split module identity — the guard test passed while not testing the guard |
| #242 / #244 | an unasserted string `replace` silently didn't apply — **twice**, once producing a wrong conclusion about which chart triggered the compiler bail |
| **§3.3 Tier C** | **`waitFor(/Import/i)` matched the static heading "Import Projects"** — passed instantly while the file was never processed. See §3.3's rider. |
| §3.6 | a `<MemoryRouter initialEntries>` **rerender that never navigated** — `initialEntries` is read once at mount, so the transition under test never happened |
| **v0.62.1** | ⚠️ **A GREEN LOCAL GATE IS NOT EVIDENCE ABOUT CI** when the local environment carries secrets CI does not. `isFirebaseAvailable` is derived from `VITE_FIREBASE_API_KEY`: true with `.env.local`, false in CI. Two tests passed locally and failed in CI. **New category** — every prior entry is a check that *could not* fail; this one *can* fail, *did* fail, and was believed to have passed, because it ran in an environment that silently differed. **The unstated variable was not in the check — it was in the room.** |
| **v0.62.2** | ⚠️ **A MUTATION THAT CANNOT COMPILE PROVES NOTHING IN EITHER DIRECTION.** A JSX opening tag swapped without its closing tag stopped the file parsing; vitest ran **zero** tests and the falsification runner counted *"0 failing"* — which reads as SURVIVOR, making a strong test look weak. Dangerous rather than merely wasteful if falsification is ever used to justify **deleting** a test as redundant. |
| **v0.62.2** | ⚠️ **AN AMBIGUOUS MUTATION NEEDLE MUTATES THE WRONG SITE.** `String.replace(string, …)` rewrites only the FIRST occurrence. Three needles in the analytics spec matched lines shared by `bootstrapPercentileCI` and `computeBatchPercentileCIs`, so all three mutated the untested sibling and were reported as **survivors**. Found the same day instance #3 was fixed, **in the tool that fixed it**. Fixed by `checkNeedleUnique`. |
| **§3.7** | ⚠️ **A MEASUREMENT INVERTED BY AN UNCONTROLLED ORDERING EFFECT — a category of its own.** A sequential A/B gave a **+5% workload a NEGATIVE delta**: more work, measured faster, because whichever variant runs first pays the JIT warm-up. Every other entry is a check that *cannot* fail or that fails toward a null; **this one runs, succeeds, and returns a confident, precise, WRONG-SIGNED number.** Trusted in the §3.7 decomposition A/B it would have shown that extracting code from a hot loop made it faster — absurd, but only just, and "supported by measurement". Caught by the injected-delta calibration and by **nothing else**. Fix: interleaved round-robin timing with every variant pre-warmed (`monte-carlo.bench.ts`). |
| **§3.5** | ⚠️ **THE INSTRUMENT WAS MEASURING AT THE WRONG SEAM — a category beyond "measuring too little".** The worker's constraint-vocabulary guard (`:114–115`) has no observable effect on posted output: an unknown TYPE hits `applyHardConstraint`'s `default:` and a non-`"hard"` MODE is never applied. Deleting either check left the **entire C2 suite AND the protocol oracle green** — including three C2 tests *named* for that guard. **No number of extra fixtures would have helped**, which makes it worse than #256's inert-on-one-path oracle: the intuitive response to an incomplete oracle is *add cases*, and here that would have failed silently while looking like diligence. Fixed by capturing at the `runTrials` seam instead (a spy calling **through**, not a mock). |
| **§3.5 Step 4** | ⚠️ **A PREMISE TEST THAT MEASURES ITS OWN FIXTURE NAMES.** The protocol oracle's `"the fixtures actually reach BOTH engines, not just one"` filters the successful fixtures by the string prefixes `dependency/` and `sequential/` and asserts the counts — a fact about the **naming convention**, not about which engine ran. Mutation **W11** routed *every* dependency payload to the sequential engine and that test **passed**; the only failure was `dependency/with-milestones`, and only because milestones vanish. So the guard that reads as "both engines are exercised" is carried entirely by one unrelated fixture. ⚠️ It was written **one artifact after** the same session renamed `simulation.worker.test.ts:144` for precisely this defect — *a name describing a guard it cannot check.* **Knowing the failure class did not confer immunity to it**, which is the second time that has been recorded here (cf. instance #12, found by the session probing for it, in its own probe). Recorded, not yet fixed; W11's spec comment carries the measured limitation so it cannot be lost. |

| **§3.8 Item A** | ⚠️ **A SUCCESS EXIT CODE THAT CANNOT EXPRESS "MATCHED NOTHING".** `sed -i '' 's/\bfirstDeps\b/depsOf/g'` on darwin substituted nothing and **exited 0** — BSD `sed` has no `\b`. Falsification was then re-run against a file believed to have changed and returned 11/11 green: a correct result for the wrong file. The ledger already held *"unasserted `replace` ×2"* (#242/#244), but this is the sharper form — **there WAS a check, and it was the exit code**, whose success contract does not include *did anything*. Same family as the census's `hits > 0` and `cc`'s 0-for-parse-error: a signal structurally unable to report the failure mode it is being trusted for. **Rule: for any text transformation, assert the NUMBER OF SITES CHANGED, never the exit code.** ⚠️ Platform detail, because it will recur: this repo runs on darwin, and BSD-vs-GNU `sed` differ on `\b`, `-i`, and `\+`. Prefer a script that reports its own replacement count. |
| **§3.8 Item B** | ⚠️ **A PER-ITEM ISOLATION TEST WITH THE HANDLED ITEM LAST TESTS NO ISOLATION.** Two of fifteen mutations initially SURVIVED (`continue` → `break` in the skip and corrupt rungs) because the fixtures put the skipped/corrupt project *after* the healthy one — by then the loop was over, so aborting and continuing are indistinguishable. Both tests were *named* for isolation and covered none of it. **Isolation is a property of the LOOP: the handled item must PRECEDE a healthy one, or the assertion is vacuous.** Found by falsification, not by review — and the two tests had passed on their first run, which over never-executed code is precisely when to distrust them. |

✅ **And one instrument behaved correctly, which is worth recording too.** The benchmark's first
calibration attempt produced a 0.9ms delta against sd 1.5ms and reported **NOT DETECTED** —
it **refused to certify a resolution it did not have**. That is the behaviour every tool in this
repo has failed to have at least once. Declining to answer is a feature.

⚠️ **THE COMMON FACTOR IS NOT "FLATTERING" — AN EARLIER DRAFT OF THIS SAID SO AND IT IS
WRONG, in a way that matters operationally.**

| # | Tool | Reports | Direction |
|---|---|---|---|
| 1 | `cc` region mode | parse error → **cc 0** | makes the CODE look simpler — flatters |
| 2 | `cc` suppression filter | suppressed → **"no functions"** | makes the CODE look simpler — flatters |
| 3 | falsify runner | non-compiling mutant → **"0 failing"** | makes the TEST look weak — does NOT flatter |
| 4 | falsify runner | misapplied mutant → **"survivor"** | makes the TEST look weak — does NOT flatter |

Two flatter, two defame. So the heuristic *"be suspicious when results look good"* would have
caught the first two and **missed both of the others**. Worse, the defaming direction is the more
dangerous one: **a result that criticises your own work does not get audited.** Nobody re-checks a
tool that just told them their test was weak — they believe it and go write another test. #4 was
caught only because three survivors was implausible against tests there was reason to trust.

**The factor that actually holds across all four is direction-agnostic:** *the tool returns the
value it would return if there were genuinely nothing to report.* **Absence of a result is
indistinguishable from a null result.** That is the property to design against — every
measurement tool here should be asked: *what does it return when it cannot do its job, and is
that distinguishable from a real answer?*

⚠️ **Two are inside the measurement tool itself, and both failed in the safe-looking direction.**
⚠️ **The twelfth was found by the session probing for it, in its own throwaway probe** — which is the
best evidence available that knowing about this failure class does not confer immunity to it.

**Seven mistakes, seven detectors, none caught by reading the code.** Recorded 2026-08-02 from
a single session (#246–#252). This table is the argument for running the whole gate, and it is
more use to a future reader than any of the numbers beside it.

| Detector | What it caught |
|---|---|
| **Mutation** | Two tests claiming more than they guarded — the C5 leak test survived removal of the project-scoping check; the delete test survived removal of the guard it named |
| **A test failing outright** | A `<MemoryRouter initialEntries>` rerender that never navigated (`initialEntries` is read once at mount) |
| **`tsc -b`** | `createActivity(name, 3, 5, 10)` against a `(name, settings)` signature — vitest and ESLint both accepted it |
| **CI** | Two tests depending on `.env.local` existing; `isFirebaseAvailable` is false in CI |
| **`changelog-surfaces.test.ts`** | The v0.57.1 heading trap, re-created — a `## 0.62.1` heading replaced instead of inserted above, orphaning its entry |
| **The falsification runner** | Its own third-instance tooling defect: a non-compiling mutant read as "0 failing" |
| **`npm run cc`** | `SortableScenarioTab` cc 13 → 15 from the v0.62.2 accessibility fix — invisible to lint |

⚠️ **Seven mechanisms and one person — and the person does not generalise.** The last row is
"a result was implausible against tests I had reason to trust", which fired only because those
tests were days old and the prior was still warm. Against unfamiliar or old code nothing would
have fired.

⚠️ **That forces a harder reading of the base rate.** *"Roughly one self-inflicted unfalsifiable
check per substantial item"* is a **detection** rate, not an incidence rate. Before the tooling
caught up, ~10 instances of this class were found and **none was caught by tooling** — every one
by a person finding a number implausible, in code they had just written. Nobody in this campaign
has ever caught one in unfamiliar or old code, and that is indistinguishable from there being
none to catch. **The true rate is unknown and bounded below by the measured one.**

That is not cause for alarm; it is the precise argument for converting each detector into a
committed guard the moment it fires. **A guard works on code nobody remembers writing. The person
does not.**

📌 **A guard that keeps catching the same two lines is reporting on those lines too.**
`checkNeedleUnique` has now aborted **three times**, and all three were the *same pair*:
`populateAdjacency` and `buildAdjacencyForCycle` in `dependency-graph.ts` open with a
byte-identical two-line prelude —

```
if (!idSet.has(dep.fromActivityId) || !idSet.has(dep.toActivityId)) continue;
if (dep.fromActivityId === dep.toActivityId) continue;
```

— so every needle aimed at either lands ambiguously. The guard is working; the duplication is the
thing making it work so often. Deduplicating that prelude would remove the hazard at its source.
**Not done here** — `dependency-graph.ts` carries a recorded mutation baseline (89.83%, 17
survivors) and this is not that item. Recorded so the third save is read as a finding about the
code and not only as a win for the tool.

**Commit the falsification spec, not just the runner.** Added 2026-08-02. `scripts/falsify.mjs`
was committed while every spec it consumed lived in scratchpad — so for a day, no falsification
result in this campaign was reproducible: durable tool, vanished inputs. That is the same
principle `docs/mutation-baseline-core-scope.md` already states for mutation baselines ("a
comparison baseline that lives only in an ignored directory is not a baseline"), applied to one
kind of artifact and not the other. Specs now live in `scripts/falsify-spec-*.mjs`, beside the
runner and inside the copyright guard's reach (its regex is `scripts/[^/]+$`, so a subdirectory
would have been a blind spot).

✅ **The retroactive audit came back clean.** All 45 needles across #246 (18), #250/#251 (17) and
the analytics spec (9) were re-checked with `checkNeedleUnique`: **0 ambiguous**. The falsification
claims made before the fix stand — they were not re-verified, only cleared of the specific defect
that could have invalidated them. What the defect could ever have affected is STRENGTH claims
("we proved these tests would catch it"), never the code or the tests themselves.

**The durable store is commit bodies, not chat.** All five of the previously-missing entries were
recoverable from `git log --format='%H%n%B'` over #240–#244, in unusual detail. Verified 2026-08-01;
that is why they could be restored here at all.

### THE OPPORTUNITY-TO-CONTRADICT RULE

**Absence of a failing signal is not evidence unless something was in a position to produce
one.** Added 2026-08-01, replacing a rule that was wrong within a day of being written.

⚠️ **This is ONE rule with one name, deliberately.** It was reached twice from opposite
directions — once by auditing which of this charter's figures could be trusted (*"nothing has
contradicted this" is evidence only where subsequent work ran through it*), and once, on
2026-08-02, from tooling (*a passing check proves nothing unless something adversarial ran
against it*). Two formulations in two sections is how a rule gets applied in one place and
forgotten in the other, so they are consolidated here. Its two faces:

- **On figures** — sort by exposure, not by section. See the table below.
- **On checks** — a green test, oracle or benchmark is worth exactly as much as the last thing
  that tried to break it. §3.7's oracle passed 17 fixtures while inert on one of three engine
  paths; the fixture that fixed it passed 23 tests while carrying invalid constraint codes.
  Neither looked wrong.

The discarded rule said the errors traced to `CRITIQUE_codebase-quality-charter_Opus-1.md` **§5** —
the half that *proposed* — while §1–§4, the half that *measured*, held. Tidy, and false: **the "28
suppressions" figure came from §3.** A section called trustworthy had already produced a wrong number
at the moment it was called trustworthy. ⚠️ The tell was on the face of the report either way — **the
parenthetical didn't sum to its own headline** — visible without opening the repo, and not added up.

**Sort by exposure, not by section** — the figures face of the rule above.

| Confirmed — something could have contradicted it, and didn't | How |
|---|---|
| `dependency-graph.ts` **89.83%** | independently re-run; byte-identical across all six categories |
| `cc`'s suppression blind spot | confirmed twice — by probe and by the fix |
| The jsdom API survey | only two stubs needed; `File`/`FileReader`/`sessionStorage` all work unstubbed |
| `ProjectPage` **1,074 lines · max cc 14 · 0 tests** | re-derived 2026-08-01 (both referencing files mention it only in comments) |

⚠️ **Never exposed — the silence means nothing:** `src/infrastructure` 73.89%/59.74% · SD-2/SD-3's
open status · the parser's line counts · **every figure in §3.4–§3.9.** No work has run through any
of them. Treat as untested, not as durable.

✅ **Re-derived twice on 2026-08-02** (`docs/CENSUS_cognitive-complexity-2026-08-02b.md`, which
supersedes `…-2026-08-02.md`). *"51 at cc 10–15, 21 uncovered"* → **52 at cc 10–15, 5 that never
execute.** Both sweeps were validated against `npm run lint` before their output was read.
⚠️ **Retire the file-granularity number.** *"In a 0%-coverage file"* now reads **2** while the
honest count is **5**: `ScenarioComparison.tsx` moved 0% → **1.04%**, dropping a cc-10 function
out of the count while covering none of it. The two definitions were one apart in the first
sweep and are two and a half times apart in the second. Quote the function-level number and say
so. ⚠️ Line numbers shift under extraction — diff censuses by file plus name, never by line.

### ⚠️ Characterise before designing — the only DIRECTION practice in this charter

Recorded 2026-08-02, after §3.5 and §3.7. **This is a different KIND of practice from every
other entry here, and that is the reason it gets its own section rather than a line in a list.**

> **"Oracle before refactor has never once changed what I was about to build — it only ever
> verified that what I built was safe."**

Almost every standing practice below is a **safety** practice: oracle-before-refactor,
falsify-the-guard, gate-on-accounted-movement, absolute-Survived. They answer *"is the change I
have decided on sound?"* Not one of them has ever said *"you are about to build the wrong
thing."* Characterisation is the only practice whose output is that sentence.

**Three cases, each checkable in the repo rather than taken on trust:**

| | The charter asked | Characterisation answered |
|---|---|---|
| **§3.7** | *"what does extraction cost?"* | **What is being protected is 27ms / 71ms** at the default trial count, 270ms / 713ms at the schema ceiling, **off the main thread** — too small to protect, whatever extraction costs. The cost question was the wrong one. *(#258, `monte-carlo.bench.ts`)* |
| **§3.5 import** | *"`ActivityDependencySchema` has no cycle refinement"* — which implies adding one | The failure was **already caught and reported by all six consumers**. The gap was **messaging, not validation**, and reject-at-import would have been the wrong product. *(#266)* |
| **§3.5 detection** | a new `.refine()` was about to be written | `validateDependencies` **already existed** at `dependency-graph.ts:281`, already consumed by `DependencyPanel` and `ai-snapshot-service` — two layers down from where the new code was going. *(#268)* |

Three items, three times the first framing was wrong, and in every case the correction came from
**looking at what the code actually does before designing against it.** A safety practice would
have verified each wrong build beautifully.

⚠️ **Sequencing matters, not just the entry.** This belongs here **before §3.8 opens**, because
§3.8 is the item most exposed to its absence: its recorded framing — *"cannot be proven
behaviour-identical against data we no longer have"* — already reads as a design constraint, and
someone opening it cold would start by building the synthesised corpus described there. **Whether
that is the right first move is precisely the question a characterisation phase asks**, and that
question has been answered "no" three times running.

⚠️ **PROVENANCE, which is part of the finding.** The sentence above survives only because it was
quoted back in an orchestration reply. **It appears in no commit body.** This charter's own rule is
that *the durable store is commit bodies, not chat* — proven when five missing ledger entries
turned out recoverable from #240–#244 and nothing else. The one report proposing a new **direction**
practice is the one that nearly did not survive. That is why it is recorded in **#269's PR body as
well as here**: a practice about durable storage that exists only in a doc nobody re-reads is half
the failure it describes.

### ⚠️ Unexecuted is not the risk signal — unexecuted with NO INDEPENDENT EXPRESSION is

Recorded 2026-08-02, from §3.8. **This is the second DIRECTION practice, and it exists because a
prediction made in this charter's own terms failed.**

Every prior first-execution in this campaign found something — ImportSection, ProjectPage, the
worker seam. §3.8 Item A was therefore predicted to be the highest-probability defect discovery
yet: `migrateV11toV12`'s write-forward had **never once executed**, and it runs against real user
documents during schema migration. **It was correct.** Ten characterisation tests, eleven killed
mutations, no defect.

**Why it was correct is the whole finding.** That code was never verified by a *test*, but it was
verified by a **second independent implementation of the same rule agreeing with it**:
`migrateV10toV11` nulls all three constraint fields unless all are set; `ProjectSchema`'s
`superRefine` rejects unless all three are equally present. Different mechanisms — one makes data
conform, the other refuses non-conforming data — expressing one invariant. That is convergence, not
duplication, and it is a real if weaker form of verification.

**The repo already does this deliberately.** `firestore-driver.ts:544` carries the comment
*"Firestore rule enforces; redundant by design"* on a client-side owner check.

| Behaviour | Independent expression | Verdict |
|---|---|---|
| `migrateV10toV11`'s all-or-nothing constraint nulling | `ProjectSchema.superRefine` | correct, and now tested |
| An unrecognised dependency type surviving `migrateV11toV12` | `z.enum(DEPENDENCY_TYPES)` rejects downstream | fine — the migration fills gaps because something else validates |
| **`constraintNote` outliving the constraint it described** | **none — the `superRefine` covers type/date/mode only** | ⚠️ **the interesting one.** A note describing a constraint that no longer exists passes every check in the system. Recorded as a **product question** — should clearing a constraint clear its note? — not chased. |

⚠️ **So the search order changes.** Ranking by "never executed" ranks by *how little we looked*.
Ranking by "never executed **and** nothing else in the system restates it" ranks by how little
*anything* looked. Ask of any unexecuted code: **is there a schema, a rule, a sibling guard, or a
server-side check that says the same thing a different way?** If yes, it is likelier fine than the
coverage number suggests. If no, that is where to spend the effort.

⚠️ **And record the prediction before the work, then report against it either way.** Item B's
prediction — *"the four-way collision ladder has no independent expression anywhere"* — was
**partly wrong**, and usefully: `firestore.rules:246` membership-gates the read, so the rules do
independently constrain the ladder. That was written down *before* looking. A prediction checked
only when it fails is the same defect as one checked only when it succeeds.

### ⚠️ Build fixtures that CANNOT pass vacuously — structure beats assertion

Recorded 2026-08-02, from §3.8. **This supersedes nothing but strengthens "assert the premise
before the behaviour", which is a habit; this is a construction.**

The premise problem: a test asserting that a migration **left a value alone** passes identically
when the code under test never ran at all — wrong key, wrong nesting, empty array, loop entered
zero times. The charter's existing answer is to assert the premise separately. That works and it
can be forgotten.

**The construction: every preserve-case fixture carries BOTH a value the code must rewrite AND one
it must leave alone.**

```ts
dependencies: [
  { fromActivityId: "a", toActivityId: "b", type: "SS", lagDays: 0 }, // must survive
  { fromActivityId: "b", toActivityId: "c", lagDays: 0 },             // must become FS
]
```

If the loop never reaches this array, the test fails **on the rewrite**, not on the untouched
value. Vacuity is now structurally impossible rather than defended against. An assertion can be
omitted; a fixture that cannot pass vacuously cannot be omitted, because it *is* the test.

⚠️ **The ordering corollary, which cost two survivors before it was understood.** For any property
of the LOOP rather than of an item — per-item isolation, continue-vs-abort — **the handled item
must come FIRST**. A skipped or corrupt item placed last leaves nothing behind it to observe, and
`continue` and `break` become indistinguishable. See the two §3.8 Item B rows in the table above.

**Both mutations that exposed this exist in the committed specs on purpose** (`F6`, `F12`, and
`M3`/`M7` for the pairing itself), so the technique is guarded rather than merely described.

⚠️ **And the sentence that generalises all of it:**

> **All 15 passed first time. Over never-executed code that was the signal to distrust them, not to
> ship.**

A green suite normally means the code is fine. Over code that has **never executed**, it means
nothing of the kind — there was no prior red run to disprove anything, so the tests and the code
have only ever agreed with each other. **This inverts the natural reading of green in precisely the
situation where the natural reading is wrong**, and it is why falsification is budgeted as work
rather than diligence. In §3.8 Item B it converted two vacuous tests into real ones; without it,
both would have shipped named for a property they did not cover.

### The render-level exclusion has a measured price now

`"Explicitly not tested: visual layout, styling"` **remains a defensible scope decision** — this is
not a reversal. What changed is that its price is now known rather than hypothetical: **one shipped
defect, in the release whose entire purpose was making one message read correctly.** v0.63.0's
schedule-error banner space-joined its message and advice into one `<p>`; because the message is a
raw engine diagnostic ending without punctuation, the two ran together as a single unreadable
sentence. **Caught in a browser, not by a test.**

⚠️ **And no value-level assertion could have caught it.** `getScheduleErrorBanner` returns
`{ heading, message, advice }` as three separate strings, and its return value was correct both
before and after. The defect existed **only at the level where correct values are composed for
rendering** — one level above where every instrument this campaign built asserts.

The disposal is a **deliberate, minimal, single-purpose incursion**: one render-level test
asserting three distinct elements and their text. No pixels, no class strings, no DOM snapshot.
Anyone weighing whether to revisit the exclusion should have that number — one defect — rather
than a hypothetical.

### ⚠️ A pin that imports nothing from the app is not pinning the app

Recorded 2026-08-02, from §3.5 Phase 1. **The one rule in this charter that a grep can decide.**

A characterisation test for `getScheduleErrorBanner` was drafted that computed the heading and
advice *inside the test*, from `isCalendarError`, and asserted the result. Every assertion passed.
It pinned **nothing** — it asserted its own arithmetic against itself, and it would have stayed
green through precisely the change it existed to detect. The next PR's entire *"behaviour changed
as intended"* claim was going to rest on it.

**The check is mechanical:** *does the test file import the symbol it claims to pin?* If a test
asserts about `getScheduleErrorBanner` and never imports `getScheduleErrorBanner`, it is testing a
local copy. That is decidable by grep, by review, and plausibly by a lint rule — **no judgement
about altitude, no reading of logic.** Prefer it to softer formulations like *"test the real
thing"*, which require knowing what the real thing is.

⚠️ **This is the ledger's OLDEST failure returning, not a new one.** Week 0: *"P1's verification
copied a lint-clean file — read 23 either way"* — a verification run against a **copy** of the
artifact rather than the artifact. Twenty instances later, in a different language and a different
layer, the same shape. Recorded as a **recurrence** deliberately: the useful fact is not that a new
mistake happened, it is that the oldest one came back after everything since was supposed to have
taught it.

**The corollary that made it tempting.** The honest fix required *moving* `getScheduleErrorBanner`
out of `ProjectPage.tsx` (`react-refresh/only-export-components` forbids exporting a non-component
from a component module — the same reason `auth-errors.ts` left `AuthProvider`). Reimplementing it
in the test was the way to avoid that move. **Whenever copying into a test is the cheaper option,
that is the moment to suspect this defect** — the copy is never chosen because it is better, it is
chosen because the export is inconvenient.

### ⚠️ A shared substring turns a narrow test into an apparently-broad one

Recorded 2026-08-02, from §3.4. **A specific, checkable mechanism for the "sound test adjacent to a
claim it does not support" category — this one is decidable by reading the assertion.**

`flat-activity-parser.ts` validates three duration columns in three structurally identical blocks,
each with its own column label and its own interpolated value. Two tests covered them —
`"errors on non-integer duration"` and `"errors on negative duration"` — and both asserted:

```ts
expect(result.errors[0]!.message).toContain("non-negative integer");
```

**That substring is common to all three messages.** Both tests fed the *Optimistic (Min)* column
only, and the Most Likely and Pessimistic (Max) blocks had **never executed** — yet the suite read
as though duration validation was covered. The overlap is what made a one-block test look like a
three-block test.

**The mechanism generalises:** wherever N structurally similar blocks emit messages sharing a stem,
an assertion on the stem cannot distinguish which block ran. Coverage says so; the test name does
not.

**The fix is mechanical: assert the full object, not a fragment.**

```ts
expect(result.errors).toEqual([
  { row: 2, column: "Pessimistic (Max)",
    message: 'Pessimistic (Max) must be a non-negative integer, got "3.5".',
    severity: "error" },
]);
```

A fixture that trips a *different* column's validation now fails instead of passing on the overlap.
⚠️ **And this is where the independent-expression heuristic earns its keep** — nothing downstream
restates which column a message names, so a crossed label is undetectable by any other means. Spec
mutations `P1`/`P2` in `scripts/falsify-spec-parser-errors.mjs` are exactly that defect, and they
are killed only because the assertions are whole-object.

### ⚠️ Additive at nesting 0 — an exact sum PROVES the partition

Recorded 2026-08-02, from §3.4. **A measurement of the measurement, and the thing that makes a
decomposition map trustworthy rather than plausible.**

Cognitive complexity is additive for sequential blocks at nesting level 0. So when a region is
sliced into candidate lift targets and each is measured standalone with `npm run cc <file> a-b`,
**the parts must sum to the whole measured the same way.** `parseFlatActivityTable`'s row-loop body
measured `209-477` standalone at **cc 43**, and its six sub-blocks measured 5 + 3 + 7 + 18 + 9 + 1 =
**exactly 43**.

That exactness is evidence the slices are **complete and non-overlapping** — no logic double-counted,
none dropped between boundaries. A sum that comes in *under* means a gap; *over* means an overlap or
a boundary landing mid-construct. Run it before trusting any decomposition map.

⚠️ **It also explains why the parts can sum to less than the enclosing function.** The same body
measured *with* its `for` header is **cc 72**, not 43 — the 29-point difference is the nesting
penalty the loop imposes on everything inside it. That gap is not an error; it is the number that
decides which decomposition shape works (see §2's control-flow entry below).

### ⚠️ The third category: RESTRUCTURING HOW FAILURE PROPAGATES

Recorded 2026-08-02, from §3.4. **The charter's "extraction relocates, decomposition clears" has
only two slots and this fits neither.**

| | What it does | Risk profile |
|---|---|---|
| **Extraction** | moves a block behind a name | mechanical, reversible |
| **Decomposition** | moves logic into units that stand alone | changes structure, not control flow |
| ⚠️ **Flow restructuring** | changes **how failure propagates** — e.g. `continue`-in-loop → early-`return` aggregation | changes the shape of error handling itself |

§3.4 is the evidence, and it is measured, not argued. `parseFlatActivityTable` is cc 110:

- Lifting the **four passes** the file's own comments advertise leaves Pass 1 at **cc 72**. Fails.
- Lifting **stage helpers called inside the row loop** leaves the orchestrator at **cc 17**. Still
  fails — seven `if (!x) continue` guards cost **2 each** at nesting 1.
- Moving the stage sequence into a `parseRow` helper that **early-returns**, called once from the
  loop, gives **7 + 5**. Clears — the same seven guards cost **1 each** at nesting 0.

**So the only shape that clears this finding is a flow restructure, not an extraction.** That
matters because the risk is different in kind: extraction cannot change behaviour, and this can.
Here it would land on an untrusted-input parser whose four body commits include a security fix
(`96dfa1d`, v0.34.5, XLSX formula-injection guard).

⚠️ **Practical consequence — the net's quality becomes decision-critical rather than nice to have.**
For an extraction, existing tests are a courtesy. For a flow restructure they are the only thing
standing between a refactor and a silently skipped validation stage. State the pass condition for
that net **before** measuring it, and be willing to decline the restructure on the result.

### ⚠️ Neither the score nor the survivor count is the gate — the reconciliation is

Recorded 2026-08-02, from §3.5 Step 4. **This amends *"gate on absolute `Survived`, not the
ratio"*, which has been stated as the rule and is really a heuristic with two known failure
modes — in opposite directions.**

| | The number that moved | What was actually true |
|---|---|---|
| **C4 · §3.7** | the **ratio** fell (85.41% → 84.96%, 87.25% → 86.23%) | **nothing regressed.** Decomposition shrank the denominator; `Survived` held byte-identical |
| **§3.5 Step 4** | the **absolute `Survived` count** fell 14 → 6 | **almost nothing improved.** Merging three duplicated map conversions collapsed their mutants |

The first case is why this campaign stopped gating on the ratio. The second is the same error with
the sign flipped, and it is the more seductive one, because it arrives as good news about your own
refactor. Of §3.5's eight fewer survivors, **seven were the same two gaps counted fewer times**;
one was dead-code removal, and exactly **one** was a real kill — inherited, by merging, from the
strongest call site's fixture.

**The rule that survives both cases: gate on whether the delta RECONCILES — not on its size, and
not on its sign.** The one-by-one accounting *is* the gate. `Survived` and the score are
**diagnostics that tell you where to look**; a moved number is a prompt to produce the mapping,
never a verdict on its own.

The practical consequence is the part that gets skipped: **a survivor count that falls is exactly
as much work to justify as one that rises.** Both directions get the table. Worked example, with
all fourteen pre-survivors mapped: `docs/mutation-baseline-worker.md`.

⚠️ **And deduplication is not a rare special case** — it is what a large share of this campaign's
remaining work *is*. Every future item that merges duplicated code will produce this shape, so
"absolute `Survived` fell" will keep looking like a result and keep needing the accounting.

✅ **The rule met its mirror case the same afternoon it landed, from the opposite direction.**
#263 was written because §3.7's ratio **fell** while nothing regressed. Hours later, §3.5 Step 5's
ratio **rose** +1.01pp while nothing improved — `Survived` held byte-identical at 6 and 10, and
the whole movement was eight `Ignored` string-literal mutants leaving the population as the two
deleted vocabulary arrays went. Same arithmetic, opposite sign, opposite misreading available.

A rule usually waits months for a real test. This one waited an afternoon, and the case that
arrived was **not** the one it was written from — which is the strongest evidence available that
*"the reconciliation is the gate"* was the right generalisation rather than a patch on C4.

### ⚠️ An oracle built from realistic data under-covers exactly the paths that most need one

Recorded 2026-08-02, from §3.7's prerequisites. **This amends "oracle before refactor", which was
stated as sufficient and is not.**

The Monte Carlo oracle was built from the sample Cloud ERP project and presented as a 17-fixture
behavioural contract. Perturbing each of the engine's three `sample()` call sites by 1e-7 showed
it was **inert on one of the three**: 9 fixtures failed for the main sequential path, 8 for the
dependency path, and **zero** for the constrained path. A decomposition of that branch would have
passed the oracle and learned nothing.

**The cause generalises further than the fix.** Realistic data exercises realistic paths. The
branches it cannot reach are the ones that exist for *unusual* states — constrained activities,
completed activities, model exhaustion — which are precisely the branches most likely to be
subtly wrong. v0.54.0/v0.54.1 already found an MFO/FNET off-by-one across four such seams.
`sample-project.ts` contains **zero** `constraintType` and **zero** `actualDuration` occurrences.

⚠️ **An unfalsified oracle before a refactor is worse than no oracle**, because it converts
*"unverified"* into *"verified"* without changing what is known. The technique is minimal: perturb
each call site the oracle claims to cover by 1e-7 and confirm it propagates. Spec committed as
`scripts/falsify-spec-monte-carlo-oracle.mjs`.

✅ **Bounded, not systemic.** `deterministic-oracle.json` carries 11 `constraintType` entries, so
C4's oracle is unaffected — its fixtures were hand-built rather than drawn from the sample project.
The blind spot belongs to oracles built *from realistic fixtures*, not to oracles generally.

📌 **Open, not now:** three test files use `createSampleProject` as a fixture and inherit the same
blind spot by construction. Nobody has asked what they actually cover. ~10 minutes, after §3.7.

**Also standing:** ⚠️ **oracle before refactor — AND FALSIFY THE ORACLE, against every path it
claims to cover, before trusting it** (committed JSON, never a regenerable snapshot) · net before
decomposition · tests first, fix what they expose as its own release, then refactor · extraction
relocates a finding, only decomposition clears it · suppression carries a specific reason and is
interim unless the reason is permanent.

---

## 3. The work, in measured order

v1 ordered these by reasoning. The review reordered them by evidence. **The sequence below is the
recommendation; §3.0 is a hard prerequisite.**

⚠️ **Only §3.0–§3.3 are ordered by evidence. §3.4–§3.9 are not** — confirmed by the charter's author
at the 2026-08-01 handoff: those sat "roughly in the order v1 had them, lightly adjusted," and their
positions are **not** considered judgements about relative priority. Do not read a number below §3.3
as a ranking.

✅ **CLOSED (#254):** `analytics.ts:268 computeBatchPercentileCIs` — 12 tests, ~20 minutes,
61.54% → 83.89%. It really was cheap; two censuses said so without checking, and it took a third
pass to find out they were right. *(Original note, kept because the mechanism is the point:)*
⚠️ **DESIGNATED NEXT ITEM (2026-08-02): `core/analytics/analytics.ts:268
computeBatchPercentileCIs`.** cc 11, in `/core`, **never executed**. No harness, no mocks, no
provider stubs — a plain unit test. It has now appeared in **two consecutive censuses as the
cheapest open item** and been skipped both times, which is exactly how a thing stays cheapest
and never done. **Start here, before anything in §3.4, §3.5 or §3.7–§3.9.**

⚠️ **DESIGNATED NEXT ITEM (2026-08-02, after §3.7): `src/workers/simulation.worker.ts:41`, cc 30
— §3.5's worker decomposition.** The cheapest remaining substantial item: same subsystem as §3.7,
it imports the two functions just decomposed, and C2's 19 message-seam tests already cover it — so
it is a DECOMPOSITION problem, not a coverage one. Needs the full treatment all the same: an
oracle written *and falsified* before a line moves, mutation compared on absolute `Survived` with
all six categories. Close-out: `docs/CLOSEOUT_codebase-quality-v0.62.2.md`.

**Revised order, agreed by both orchestrators 2026-08-01:**

1. **§3.3 Tier C — `ImportSection`** (in progress). Closes the two `NOT VERIFIED` smoke items.
2. **§3.6 — `ProjectPage.tsx`.** ⚠️ **Promoted from sixth to second.** The genuine dependency was
   real — a 1,074-line file at 0% coverage cannot be safely decomposed without a component harness,
   and §3.3 builds it — but that dependency is discharged the moment the harness lands. The rest of
   its position was inertia. **If this charter's own claim is true — that `ProjectPage` is the file
   where a change is least checkable — sixth was indefensible.** §3.4's parser is well-bounded, off
   the primary path and has no coverage crisis; it does not outrank the app's least-checkable file.
3. Everything else — **unranked.** Re-derive an order from evidence when the time comes rather than
   inheriting one from this list.

### 3.0 — Fix the measurement tool ⚠️ BLOCKING

`npm run cc` uses `eslint.lintText`, which honours in-file `eslint-disable` directives — so a
suppressed function is filtered out *before* counting and the tool prints *"no functions reported."*
Proven by blanking the directive line: `migrations.ts:111` hides **cc 18**,
`firestore-migration.ts:58` hides **cc 21**.

**This is the tool §3.8 tells you to size decompositions with, returning zero for exactly the two
functions §3.8 is about.** Add `--ignore-suppressions`, or report suppressed functions with a marker.

⚠️ **Scoped accurately: this blocks §3.8 and nothing else.** The filter is per-message, so it hides
only functions whose *own* cognitive-complexity finding is suppressed — the two migrations. §3.1 uses
Stryker, not `cc`; §3.2 and §3.3 touch files whose `react-hooks` suppressions don't mask a cc finding.
It goes first because it is ~30 minutes and the tool is used throughout, **not** because everything
else is untrustworthy.

### 3.1 — Record the remaining mutation baselines · ~1–1.5 h

**Cheapest item in the campaign and the only one whose output changes what you'd do in the others.**

`stryker.config.mjs` lists 7 patterns expanding to **14 files**; only `deterministic.ts` and
`monte-carlo.ts` have recorded baselines. ⚠️ **`vitest.stryker.config.ts` already includes test files
for all seven paths — this needs zero config edits**, unlike §3.4.

⚠️ **v1 implied unmeasured meant weak. It doesn't.** `dependency-graph.ts` measured **89.83%, 17
survivors** — better than `deterministic.ts` after an entire multi-week step. Five files remain.

**Done means:** a recorded baseline and classification per file, in `docs/mutation-baseline-c1.md`'s
format. Doing it now also protects the C4 gate's denominator rule at the cheapest moment there will
ever be.

One survivor already worth resolving: `buildAdjacencyForCycle:L132`, `LogicalOperator ||→&&` survived
— nothing distinguishes "one endpoint missing" from "both missing" in the cycle detector. Same
neighbourhood as §3.5.

### 3.2 — The uncovered hooks · blocked on nothing

**15 of 39 hook/helper files are at 0%** — ~364 executable lines, all testable with `renderHook`
today, with **7 files of precedent**. No harness decision, no convention debate, no parity obligation.
Three carry cc 10–15 functions: `use-gantt-layout.ts:60` (15), `use-storage-mode-switch.ts:45` (13),
`use-milestone-buffers.ts:54` (10).

⚠️ **v1's monolithic "component layer" gap hid this entirely.** It is the cheapest real coverage in
the campaign and should run alongside §3.1.

Also here: partially-covered hooks with real logic — `use-import-state.ts` 43.33%,
`use-ai-connectivity.ts` 57.25%, `use-cloud-sync.ts` 66.66%.

### 3.3 — The component layer

**2.21% line coverage; 85 of 88 `.tsx` files at exactly 0%.** ⚠️ `.tsx` is **40.2% of executable
surface** — a plurality, not "most of the app," as v1 claimed. ⚠️ And the RTL precedent is thinner
than v1 said: 8 files import it, but **7 are `renderHook` and only `SignOutConfirmModal.test.tsx`
renders a real component.** One file of precedent, not two.

**Three tiers, cheapest first:**

- **Tier A — extract and unit-test, no new infrastructure.** `UnifiedActivityGrid:145` and
  `ActivityEditModal:379` are pure logic wearing a callback — both build a `Partial<Activity>` diff
  and need no React. House style exists (`unified-activity-helpers.ts`, `activity-row-helpers.ts`,
  all at 100%). ⚠️ **Lifting them wholesale keeps cc 25/20 — they must be split by field group.**
- **Tier B — `renderHook`.** Covered by §3.2.
- **Tier C — `render`.** Only what the DOM reaches: event wiring, conditional rendering,
  accessibility, and the **31 `react-hooks` suppressions across 20 files in `src/ui`**
  (18 `set-state-in-effect`, 6 `exhaustive-deps`, 4 `preserve-manual-memoization`, 3 `refs`) —
  suppressed risk sitting in exactly this territory, unmentioned by v1.
  ⚠️ *This read "28 … (21, 6, 4, 3)" until 2026-08-01: the headline disagreed with the repo and the
  parenthetical summed to 34, not 28. Re-derived — 31 directives, 31 rule mentions, 20 files, so each
  directive names exactly one rule. Count disable lines only; grepping `react-hooks/` across `src/ui`
  also catches prose in comments and gives a different, wrong answer.*

**Explicitly not tested:** visual layout, styling, SVG geometry (that belongs to `gantt-utils` unit
tests), anything a Tier-A helper already covers. **No DOM snapshots** — a regenerable expectation is
the failure mode already ruled out.

**Start with `ImportSection.tsx`, not the five flagged sites.** The five were chosen by a metric this
charter says ranks risk backwards. `ImportSection` is small (max cc 10) and is the one place a
component test does something no other technique can: it closes both **NOT VERIFIED** smoke items.
Build the harness against a real need, then apply it.

**Those two items are reachable.** Both paths read via `FileReader.readAsText`, which jsdom 29
implements. `use-import-state.test.ts` already drives a real `File` through `handleFileChange`; what
is missing is only the `<input onChange>` binding and the `fileInputRef.current?.click()` indirection
at `ImportSection.tsx:48–60` — ✅ *that anchor still holds at `01b6ffa`.* The OS picker dialog itself
stays unreachable and is not worth chasing.

⚠️ **Corrected 2026-08-01 — the stated technique is unavailable.** This paragraph named
`userEvent.upload()`, but **`@testing-library/user-event` is not installed** (`@testing-library/`
holds only `dom`, `jest-dom`, `react`), and adding it trips the **60-day soak window**. The house
idiom is `fireEvent` (`ActivityEditModal.test.tsx:6`), so the route is
`fireEvent.change(input, { target: { files: [file] } })` — **which must be proven to drive the
handler before anything is built on it**, not assumed. A file-input technique that silently no-ops
under jsdom is indistinguishable from a passing suite, which is this project's defining failure mode.
⚠️ Also stale: *"re-check the comment at `:127`"* — line 127 is now `tabIndex={-1}` and carries no
comment.

✅ **Cheaper than written: one component closes both items.** `ImportSection` is rendered in **two**
hosts — `SettingsPage.tsx:45` and `ProjectsPage.tsx:266` — with the same `projects` prop. The two
NOT VERIFIED entries are one component mounted twice, not two surfaces.

**jsdom suffices — measured, not assumed.** No file uses `getBBox` or `getComputedTextLength`, the
usual jsdom SVG killer; Gantt layout is arithmetic in `use-gantt-layout.ts`. `new Worker` appears once
and never in a component. Needs stubs for `ResizeObserver` and `matchMedia`, and mocks for
`html2canvas` / `navigator.clipboard`. `src/test-setup.ts` is one line today — **a ~20-line addition,
not a harness rebuild.**

**`PrintGanttChart` parity — pin the data, not the pixels.** A 679-line parallel implementation
enforced by one sentence in CLAUDE.md and nothing else; `:54` (cc 13) and `:427` (cc 12) at 0%. Make
`gantt-utils.ts` the shared contract and assert both charts derive the same geometry from the same
input — committed JSON, byte-compared, C4-oracle-shaped. ✅ This also gives
**`gantt-utils.ts:314`** (cc 18) a home — the tenth lint finding, which belonged to no gap in v1.

#### Rider — the "warn about losing work" guard · a sweep that must be read, not grepped

Recorded 2026-08-01. v0.62.0 fixed `ActivityEditModal`'s `handleDismiss`, which prompted only when
`hasChanges && isValid`. **The defect was not the expression.** It was a guard that conditions
*"warn the user they're about to lose work"* on that work being **valid** — which is backwards:
invalid work is still work the user typed. Empty name → `isValid` false → silent discard of every
other edit.

⚠️ **A textual sweep under-detects this by construction, and one has already been run and
over-read.** `grep hasChanges` hits only `ActivityEditModal` (already fixed) — that is near-zero
evidence of absence, because the semantic variants read `isDirty && canSave`, `hasChanges && !errors`,
or an early `return` when a form fails validation. The ~16 components with dismiss/close/navigate-away
flows have to be **read**.

**Status: hypothesis, never tested.** Its author raised it from the shape of the bug without checking
a single other component. Do not record it as a finding until the handlers are read; if it repeats
even once it is a finding, and if it repeats nowhere that is worth writing down too.

### 3.4 — The CSV parser · ✅ CLOSED as a coverage item (decomposition viable but DECLINED)

`flat-activity-parser.ts:140`, **cc 110**. Every claim above was re-derived and **held** — one
function (next highest in the file is 4), 6 production references across 2 files, reachable only
from `SettingsPage`, and the two-config-edit trap still applies. ⚠️ **Worth recording that the
framing survived**, after five consecutive items where it did not.

⚠️ **What the charter did NOT say, and it reframed the item:** ordinary coverage had never been
checked. The file was at **93.61% statements / 83.45% branches behind 52 tests** — not an uncovered
file. The uncovered slice was coherent: **it was the error paths**, six user-facing messages no test
had ever caused the parser to emit (#273, now 99.46% / 92.08%, 100% lines and functions).

⚠️ **Correction to the §3.3 coupling.** This section claimed `ActivityImportSection` was *"one of
the two NOT VERIFIED surfaces"*. It was not — that entry is **Import half / JSON import from
Settings**, both *project JSON* (`ImportSection`, closed in #246). `ActivityImportSection` is *CSV
activity* import, a different component, and it was never a NOT VERIFIED surface. The true coupling
— the parser's only UI consumer — is real but weak: it argues that someone testing the component
wants the parser understood, not that parser work needs the component. It stays a §3.3 leftover.

**Decomposition: measured, viable, declined.** See `docs/mutation-baseline-parser.md`.

| Shape | Residual | |
|---|---|---|
| the **four passes** the file's own comments advertise | Pass 1 at **cc 72** | ❌ |
| stage helpers **called inside the row loop** | orchestrator at **cc 17** | ❌ |
| a `parseRow` helper that **early-returns**, called once | **7 + 5** | ✅ |

Full map: ~14 units, nothing above cc 11. ⚠️ **But the only shape that clears is a flow
restructure, not an extraction** — the seven `if (!x) continue` guards cost 2 each at nesting 1 and
1 each at nesting 0, and that difference *is* the finding. See §2's third-category entry.

**The net was measured against a pass condition stated before the run, and failed all three parts:
73.91%, with 0% on cell extraction, 50% on the Zod/duplicate path, and deletable clauses in the
Min guard.** A flow restructure on an untrusted-input parser whose four body commits include a
security fix (`96dfa1d`, v0.34.5, XLSX formula injection) is not a change to make behind that net.

⚠️ **The mutation run used UNCOMMITTED config edits**, per `mutation-baseline-worker.md`'s
precedent, so the whole-scope baseline stays uncontaminated. The exact recipe is in the baseline doc.

**Open, cheapest first if ever reopened:** cell extraction (0/9 survivors), Pass 0 header resolution
(47%), and three one-line tests — a negative Max, and a zero-duration row through the CSV path.

### 3.5 — The worker seam and import validation

> **STATUS 2026-08-02 — PREREQUISITES DONE, DECOMPOSITION NEXT.**
> Already committed and falsified, so do not re-derive it:
> - **Step 1** — the worker's `VALID_SEQ_TYPES`/`VALID_SEQ_MODES` were diffed against
>   `CONSTRAINT_TYPES`/`CONSTRAINT_MODES`: **identical, same order.** The dedup is a cleanup,
>   not a defect. ⚠️ And it is **one** copy, not "the fifth of five" — the other six sites are
>   `switch` cases or union-typed predicates that TypeScript checks. The distinguishing
>   property is `.includes()` on an unchecked `string[]`, which is the only shape free to drift.
> - **Step 2** — `simulation-worker-protocol-oracle.{test.ts,json}`: 14 fixtures, 19 tests,
>   byte-stable, 9 of 10 output mutations killed. Plus a **marshalling guard** in
>   `simulation.worker.test.ts` covering the one branch the oracle structurally cannot reach
>   (all four guard mutations killed). `simulation.worker.test.ts:144` renamed to what it
>   asserts.
> - **Step 3** — the self-loop behaviour pinned **recorded-not-specified**, premise proven
>   first, both mutations killed.
>
> - **Step 4 — DONE.** `self.onmessage` **cc 30 → 8**; four extracted functions, none above
>   cc 3, so this is decomposition and not relocation. Lint **6 → 5**. The committed oracle
>   passes **byte-identical** (not regenerated, not `-u`). Mutation on absolute `Survived`,
>   both scopes, all six categories: `docs/mutation-baseline-worker.md`.
>   ⚠️ **`Survived` FELL 14 → 6, and seven of those eight are the same two gaps counted fewer
>   times** — merging three duplicated map conversions into one collapses their mutants without
>   guarding anything. Every one of the 14 is reconciled in that file. **A drop needs accounting
>   as much as a rise does.**
>   ⚠️ **Reproducing the run needs `tsconfigFile: "tsconfig.worker.json"`** — `tsconfig.app.json`
>   *excludes* `src/workers/**`, so Stryker's checker crashes on the first mutant. Neither config
>   edit is committed, and the file says why.
>
> - **Step 5 — DONE.** `VALID_SEQ_TYPES`/`VALID_SEQ_MODES` retired for `CONSTRAINT_TYPES`/
>   `CONSTRAINT_MODES` behind a **narrowing** predicate, **cast-free**: `.some` rather than
>   `.includes`, because `.some` compares `T` with `string` (legal) while `.includes` on a
>   readonly tuple narrows its parameter and forces a cast. **`Survived` held byte-identical in
>   both scopes** (6→6, 10→10 — the same mutants). The score rose +1.01pp for an accountable
>   reason: the two deleted arrays held exactly **8 string literals**, all `Ignored`, so the
>   denominator moved *the other way* from §3.7's.
>   ✅ **What the narrowing bought, measured:** of the new guard's 20 mutants, 9 are **Killed**
>   (all five of `isOneOf`'s) and **10 cannot compile** — weakening `c != null` makes
>   `c.offsetFromStart` unsound, so the type system now does work the tests were doing.
>   ⚠️ **What it did NOT buy:** W5 stays red. A TypeScript **type predicate is an unchecked
>   assertion**, so an unsound predicate body still compiles. Narrowing makes the guard harder to
>   weaken *by accident*, not harder to delete *on purpose* — the marshalling assertion is still
>   what covers that branch.
>
> **§3.5 is complete** apart from the read-only item it always deferred: sharing the three map
> conversions with the service side, **with service-side tests written first** (the worker
> filters, the service does not). Import validation — `ActivityDependencySchema` has no cycle
> refinement, so project JSON import is the one unguarded write path — remains open and is the
> larger half of this section.

⚠️ **v1's cycle finding was overstated, and the review corrected it by probe.** A **2-cycle and
3-cycle already error correctly.** Only a **self-loop** passes through — `dependency-graph.ts:47`
explicitly `continue`s on `from === to`, so a self-edge never enters `inDegree` and Kahn's sort
completes. A self-edge is a semantic no-op.

`detectCycle` guards every write path — CSV parser, `dependency-service.ts:22`, `DependencyPanel`,
`DependencyEditModal`, `ai-op-handlers:482`. **The one unguarded path is project JSON import / a
foreign cloud document:** `ActivityDependencySchema` (`project.schema.ts:130`) validates length, enum
and lag range only — no refinement — and `export-import-service.ts` never mentions dependencies.

**So this belongs to import validation, not the worker.** Much smaller than v1 implied.

Remaining worker work: decompose `:41` (cc 30, now 97.96% covered thanks to C2); retire the fifth
constraint-vocabulary copy at `:114–115` against `CONSTRAINT_TYPES`/`CONSTRAINT_MODES`; share the
other three map conversions **with service-side tests first** (worker filters, service does not).
⚠️ A new simulation parameter threads through **seven** files, not the five v1 claimed.

### 3.6 — `ProjectPage.tsx` and the sub-threshold band

⚠️ **v1 named the store as the gravitational center. It isn't — SD-1 did its job.**

| File | Lines | Max cc | Coverage | Tests |
|---|---|---|---|---|
| `use-project-store.ts` | 1,743 | **8** | 71.99% | 105 |
| **`ProjectPage.tsx`** | **1,074** | **14** | **0%** | **0** |
| `GanttChart.tsx` | 1,356 | 20 (+14, 11, 10, 10, 9) | 0% | 0 |

`ProjectPage` orchestrates everything, sits **one point under the lint threshold** — so the metric
will never mention it — and nothing executes it. That is the file where a change is least checkable.

**And it is not alone: 52 functions sit at cc 10–15, 5 of which never execute**
(re-derived twice on 2026-08-02 — `docs/CENSUS_cognitive-complexity-2026-08-02b.md`; was "51 … 21",
then "52 … 9"). The visible ten were never the population that mattered. ⚠️ `ProjectPage.tsx:80` is
no longer among them — §3.6 covered it — and v0.62.2 pushed `ScenarioTabs.tsx:40` from cc 13 to 15
without lint noticing, which is this section's thesis happening during the campaign itself.

**Done means:** `ProjectPage` covered and, if warranted, decomposed; a judgement on the sub-threshold
band. `docs/SPEC_DEVIATIONS.md` still carries **SD-2** open and **SD-3** open (⚠️ SD-3's stated target
is **"Deferred"**, not v0.45.0 as v1 said).

### 3.7 — The Monte Carlo hot loops

`monte-carlo.ts:53` (cc 57) and `:223` (cc 29) were excluded by reasoning, **never benchmarked**.
Measure the extraction cost. If negligible, decompose. If real, suppress **with the measurement
attached** — which converts an inherited opinion into a fact.

### 3.8 — The migrations · ✅ CLOSED (characterised; decomposition declined, with reasons)

⚠️ **This section is a rewrite. It was headed "The two migrations" and prescribed a build that
characterisation retired in full — the first time in this campaign that an entire approach was
retired rather than redirected. The superseded text is preserved in the PR that replaced it; do not
restore its framing.**

**It is not "the two migrations."** `npm run cc` — the measurement §3.0 was fixed to enable, and
which nobody had pointed at these files until 2026-08-02 — reports **five** functions at cc ≥ 10 in
`migrations.ts` and **one** in `firestore-migration.ts`, with two completely different problems:

| Site | cc | Suppressed | Coverage before | After |
|---|---|---|---|---|
| `migrations.ts:111` `migrateV5toV6` | 18 | **yes** | **fully covered — 0 uncovered statements, 0 uncovered branches** | unchanged |
| `migrations.ts:202` `migrateV10toV11` | 15 | no | preserve-existing-data branch never taken `[2, 0]` | `[5, 1]` |
| `migrations.ts:230` `migrateV11toV12` | 15 | no | **write-forward NEVER EXECUTED `[0, 0]`** | `[5, 2]` |
| `migrations.ts:138` `migrateV6toV7` | 10 | no | covered | — |
| `migrations.ts:253` `migrateV12toV13` | 10 | no | covered | — |
| `firestore-migration.ts:58` `migrateLocalToCloud` | 21 | **yes** | **0% on all four metrics** | 97.61% stmts, 100% lines/functions |

**Both halves of the old plan were falsified, for different reasons.**

- ⚠️ **The synthesised v5 corpus is retired.** It would have been built for `migrateV5toV6` — the
  one function of the six with **zero** uncovered statements and **zero** uncovered branches. Three
  v5-shaped fixtures already existed at `migrations.test.ts:323/349/374`, plus four sequential
  chains passing through v5. The charter proposed synthesising data for its best-covered target.
- ⚠️ **The Firebase emulator is retired, and never existed.** No `firebase.json`, no `.firebaserc`,
  no `firebase-tools` — every "emulator" string in the repo was planning prose or this charter's own
  sentence. Standing one up would mean a dev dependency inside the **60-day soak window**, and it is
  unnecessary: `firestore-driver.test.ts` (19 tests) and `firestore-sharing.test.ts` (6 tests) have
  tested exactly this kind of code for months by mocking `firebase/firestore` and `./firebase` and
  importing the real module.

⚠️ **The suppression on `migrateLocalToCloud` states — *"effectively untestable in CI (it needs a
live Firestore), so a refactor here would be unverifiable by construction"*. That JUSTIFICATION is
refuted**, by 25 tests in the two files beside it and now by 16 more against the function itself.
**That is not the same as saying the suppression should go**; whether to retire it is a separate
call, and it is open.

**Done so far** — both tests-only and unversioned: characterisation of the two never-executed
branches in `migrations.ts` (10 tests, 11 killed mutations), and of `migrateLocalToCloud`'s
collision ladder (16 tests, 15 killed mutations). **No defect was found in either.** See the
"unexecuted with no independent expression" entry in §2 for why that is the informative result and
not a disappointing one.

### ⚠️ The decomposition verdict — DECLINED, and why the two functions got different answers

⚠️ **Refuting a suppression's stated reason is NOT the same as establishing that decomposition is
warranted.** Both original reasons were proved false. That retires the *justification*; it says
nothing about whether the refactor is a good idea, and *never refactor merely to satisfy the
threshold* still governs.

**The decisive fact is measured, not argued: shipped migrations are append-only IN PRACTICE.**
`git log -L` over `migrateV5toV6`'s body returns **exactly one commit** — `3aceb2e` (v0.8.0), its
introduction. Every later commit to `migrations.ts` adds a new migration or is a repo-wide sweep.
No shipped migration in this repo has ever been edited after introduction. So the maintainability
payoff is near zero — easier-to-change code that nobody changes — against the highest risk in the
codebase, since altering a shipped migration alters how historical user data migrates, forever.

⚠️ **`migrateV5toV6` → suppression now PERMANENT.** The charter's own rule is that a suppression
*"is interim unless the reason is permanent"*, and append-only is a permanent reason. Its comment
now records that decomposition was **considered and declined**, with this reasoning and its date, so
the next reader of the word *"interim"* does not relitigate it.

⚠️ **`migrateLocalToCloud` → stays INTERIM, because the same argument does not hold and the
difference was measured rather than assumed.** `git log -L` over its body returns **four** commits:
`57714c3` (v0.12.0, introduction), then `929419e` (v0.15.2), `ff9fe25` (v0.33.0) and `ff7c5da`
(v0.42.6, **a security fix**). **This code IS edited**, so maintainability is live rather than
theoretical, and "append-only, nobody changes it" would have been a *second false justification
replacing the first* — the exact failure this pass exists to correct. Decomposition is **deferred on
a named condition**, not declined: the reachability question below may mean the ladder needs to
*change* rather than be reorganised, and decomposing first would entrench a possibly-wrong shape.

**Open:**

1. ⚠️ **A reachability question this repo cannot answer — record it, do not chase it from here.** `firestore.rules:246` reads
   `allow get: if isAuth() && request.auth.uid in resource.data.members`. A **non-member** read is
   therefore *denied*, not answered — so the ladder's *"doc exists but belongs to someone else"*
   rung may be a shape the deployed rules can never hand the client, leaving the `catch` as its only
   live route. Whether a read of a **missing** doc is likewise denied (`resource` is null) decides
   whether the *"no doc → keep the original id"* rung is reachable at all — and if it is not, every
   migrated project silently gets a new id and reports `migrated-new-id`. **Not decidable from
   here:** the canonical ruleset lives in `spert-landing-page` and deploys via the Firebase Console,
   and no emulator is configured. For the owner, recorded rather than guessed.
2. **A product question, not a defect:** should clearing an activity's constraint clear its
   `constraintNote`? Today the note survives and passes every check in the system — see §2.

**§3.8 is CLOSED.** Characterisation done, both false justifications replaced with true ones, the
decomposition verdict taken and recorded in the code rather than only here. Nothing was decomposed
and nothing should be. What remains open are the two items above — one belonging to another repo,
one belonging to the owner — and neither blocks anything.

### 3.9 — `src/infrastructure`

**73.89% lines / 59.74% branches**, with `firestore-driver` at 60% and `firestore-sharing` at 43.33%.
No gap in v1 covered it at all.

---

## 4. Working agreements

- **One item at a time.** Tests-only and config-only merges are unversioned
  ([spert-scheduler#213](https://github.com/famousdavis/spert-scheduler/pull/213) is the precedent);
  behaviour changes take a version bump, all version and changelog surfaces, and `git tag -a`.
- **Never pre-set `expectProblems`** — re-derive from `npm run lint` before each commit. ⚠️ At zero,
  **delete the key**; ESLint emits no `✖ N problems` line and the gate fails at
  `scripts/shipgate.mjs:333`.
- ⚠️ **`reportUnusedDisableDirectives` defaults to `"warn"`** — a misplaced directive produces a
  warning that counts.
- **Re-derive line numbers each step.** Every reference here is anchored at `85cc711`.
- **Never edit `scripts/shipgate.mjs`** — byte-identical across nine repos. **60-day soak window.**
- ⚠️ **RETARGET A STACKED CHILD PR TO `main` BEFORE MERGING ITS PARENT.** Merging the parent with
  `--delete-branch` **closes** the child — GitHub does not retarget it — and a closed PR whose base
  branch is gone can be neither re-based nor reopened:

  ```
  gh pr edit  <child>  --base main          # ← FIRST, while the parent is still open
  gh pr merge <parent> --squash --delete-branch
  git rebase main && git push --force-with-lease    # git drops the duplicate patch itself
  ```

  Observed 2026-08-02: after `gh pr merge 260 --delete-branch`, `gh pr edit 261 --base main`
  returned *"Cannot change the base branch of a closed pull request"* and `gh pr reopen 261`
  returned *"Could not open the pull request."* #261 had to be re-created as #262. The work was
  never at risk — the branch and its commit were untouched — but the PR, its body and its review
  thread were lost.

  **This was in a handoff as an instruction, in the correct order but with the wrong mechanics**,
  which is the recurring shape below.

- ⚠️ **The bookkeeping is what goes wrong, not the measurements.** Three campaign errors now share
  one axis, and it is not carelessness — it is *which claims get checked*:

  | | The claim | How it failed |
  |---|---|---|
  | §3.7 | two PRs are independent | asserted without `git log main..HEAD`; #258 silently contained #257 |
  | §3.5 | *"`main` clean, no open PRs"* | written **minutes after** running the check that showed two open |
  | §3.5 | merge-then-retarget | correct order, wrong mechanics — cost a PR |

  Over the same span **every measurement claim held** on re-derivation: the copyright regex, the
  sample project's zero `constraintType`, the mutation arithmetic in both directions, the `cc`
  figures, the oracle's byte-identity, the six constraint sites. **Things that look like
  measurements get verified; things that look like process get waved through** — by whoever is
  writing, in both roles, including inside documents whose subject is rigour. The fix is not
  resolve-to-be-careful: **run the command.** `git log main..HEAD` costs one second and has now
  been the deciding check twice.
- **Mutation comparisons** use identical command, scope and cleared cache. Record all six status
  categories including `ignored`. ⚠️ A scoped run is **~5–13 min**, not ~5.
  ⚠️ **The gate is the RECONCILIATION, not `Survived` and not the score.** Both are diagnostics
  with a known failure mode each — the ratio falls when decomposition shrinks the denominator, and
  the absolute count falls when deduplication collapses duplicate mutants. **A fall is as much
  work to justify as a rise.** See §2.

## 5. Settled

The lint count is an output. The metric ranks risk backwards here. No sibling repo installs
`eslint-plugin-sonarjs`. Extraction relocates; only decomposition clears. Decomposition always shrinks
the mutation denominator, **and deduplication always shrinks the survivor count without guarding
anything** — so neither number is a verdict. The C4 gate's amended form stands
(`docs/mutation-baseline-c1.md`), now read through §2's reconciliation rule: **the accounting is the
gate.**

## 6. Tooling

**`npm run cc`** (`scripts/measure-complexity.mjs`) — ⚠️ **defective until §3.0 lands.**
**`npm run mutate`** (`scripts/mutation-run.mjs`) — guarded runner.
**`docs/mutation-baseline-c1.md`** — the artifact format for §3.1 and §3.4.
