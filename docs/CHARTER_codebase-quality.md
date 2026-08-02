# Charter — codebase quality (v2)

**Opened:** 2026-08-01 · **Revised:** 2026-08-02 · **Owner:** William W. Davis, MSPM, PMP
**Supersedes:** `PLAN_presummit-refactor.md` (complete) and this charter's v1
**Review evidence:** `CRITIQUE_codebase-quality-charter_Opus-1.md` — *root, untracked. A
point-in-time artifact, deliberately left under the root convention; its §3.1 census figures are
superseded by `docs/CENSUS_cognitive-complexity-2026-08-02.md`.*

**State, re-derived 2026-08-02:** `main` @ `bf4d8b6` · **v0.62.1** · lint **8 (8 errors, 0
warnings)** · **2,600 tests / 127 files**
*Carried forward, NOT re-derived today:* `deterministic.ts` mutation **84.96%** (34 survivors) —
no source change since it was measured, but nothing has re-run it either.

⚠️ **This State line has now gone stale twice.** It read `85cc711` / v0.60.0 / lint 10 / 2,280
tests for four releases, then `01b6ffa` / v0.62.0 / 2,568 tests for three more. §4's *"every
reference here is anchored at `85cc711`"* is stale in the same way. **Re-derive line numbers rather
than trusting any anchor in this file.**

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

**Guard against checks that cannot fail.** ⚠️ **Eighteen instances now** — this table said *"seven"*
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

⚠️ **DESIGNATED NEXT ITEM (2026-08-02): `core/analytics/analytics.ts:268
computeBatchPercentileCIs`.** cc 11, in `/core`, **never executed**. No harness, no mocks, no
provider stubs — a plain unit test. It has now appeared in **two consecutive censuses as the
cheapest open item** and been skipped both times, which is exactly how a thing stays cheapest
and never done. **Start here, before anything in §3.4, §3.5 or §3.7–§3.9.**

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

### 3.4 — The CSV parser

`flat-activity-parser.ts:140`, **cc 110**, 585 lines / 461 code, 6 production references across 2
files, reachable only from `SettingsPage`. No mutation evidence.

⚠️ **Two config edits, not one:** `stryker.config.mjs`'s `mutate` **and**
`vitest.stryker.config.ts`'s `include`, or every mutant reports `NoCoverage`.

⚠️ **Coupled to §3.3.** `ActivityImportSection` is the parser's only UI consumer and one of the two
NOT VERIFIED surfaces — the component test and the parser work are the same surface.

### 3.5 — The worker seam and import validation

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

### 3.8 — The two migrations

⚠️ **Blocked on §3.0** — `npm run cc` currently reports nothing for both.

`migrations.ts:111` (cc 18) and `firestore-migration.ts:58` (cc 21) — ⚠️ **v1 cited `:104` and `:53`,
which now point at the suppression comment blocks.** B5's directives carry sound reasoning, but *"can
not be proven behaviour-identical against data we no longer have"* argues for **needing an oracle**,
not for never touching it. Build it — a synthesised v5 corpus spanning the shape space, the Firebase
emulator for `migrateLocalToCloud` — then decompose. **These suppressions are interim.**

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
- **Mutation comparisons** use identical command, scope and cleared cache. Record all six status
  categories including `ignored`. ⚠️ A scoped run is **~5–13 min**, not ~5.

## 5. Settled

The lint count is an output. The metric ranks risk backwards here. No sibling repo installs
`eslint-plugin-sonarjs`. Extraction relocates; only decomposition clears. Decomposition always shrinks
the mutation denominator. The C4 gate's amended form stands (`docs/mutation-baseline-c1.md`).

## 6. Tooling

**`npm run cc`** (`scripts/measure-complexity.mjs`) — ⚠️ **defective until §3.0 lands.**
**`npm run mutate`** (`scripts/mutation-run.mjs`) — guarded runner.
**`docs/mutation-baseline-c1.md`** — the artifact format for §3.1 and §3.4.
