# Close-out — codebase quality campaign (§3.0 – §3.9)

**Closed 2026-08-03**, `main` @ v0.63.2. **41 PRs.** Lint **23 → 3**. Tests **2,827 / 138 files**
(recorded as 2,135 / 102 at the campaign's start — that figure is from memory and was not
re-derived here).

The charter (`CHARTER_codebase-quality.md`) carries the standing practices; this does not repeat
them. What follows is the synthesis that exists nowhere as a whole, because it accumulated across
forty-odd commit bodies.

---

## 1. The headline is not the lint number

**23 → 3, and the 3 that remain are decisions rather than debt.** Each is an informed decline with a
measured reason recorded at its site. That is a better outcome than 0 would have been, and it is the
opposite of what a lint-count campaign produces.

⚠️ **The metric found none of the defects.** Six user-visible defects shipped during the campaign
window, and not one was at a function the linter flagged:

| | Defect |
|---|---|
| v0.61.0 | a stale scenario id survived project → project navigation, leaving the page with nothing rendered |
| v0.62.0 | clearing an activity's name discarded every other edit, because the "unsaved changes" prompt was itself gated on the form being saveable |
| v0.62.1 | *"1 project were skipped"* |
| v0.62.2 | scenario tabs unreachable by keyboard and unannounced to screen readers |
| v0.63.0 | a dependency cycle blamed the user's estimates |
| v0.63.1 | clearing an estimate field silently kept the old value |

Every one was found by **executing code that had never run**, or by **a person looking at a rendered
page**. None by cognitive complexity.

---

## 2. Four proxies tested, four wrong

Each looked reasonable. Each was believed until something checked it against the thing it stood for.

| Proxy | What it claimed | What it hid |
|---|---|---|
| **File-level coverage** | *"`ScenarioComparison.tsx` is 0%"* | 0% → 1.04% dropped a function out of the uncovered count while covering none of it |
| **Function-level `hits > 0`** | *"`migrateV11toV12` is covered"* | entered 7 times; its loop body **never executed once** |
| **Line-range statement attribution** | *"`ActivityProgressBars` is 75%"* | branches were at **27.7%** |
| **The layer** (`UI = defects`, `core = clean`) | held 4-and-4, used as a tiebreaker | broke on `ActivityProgressBars` — UI, 27.7% branches, no oracle, **clean** |

⚠️ **The surviving measure is a function-scoped BRANCH count, and it survives because it is not a
proxy for anything.** The last entry is the sharpest: the layer correlation was real, predictive, and
still a shadow of something else.

---

## 3. The one idea worth carrying: independent expression

**Derivation matters here**, because it is why this is not a pattern fitted to its own data.

1. **§3.8** — `migrateV11toV12`'s write-forward had **never executed once**. Predicted the campaign's
   highest-probability defect. It was **correct** — because `ProjectSchema`'s `superRefine`
   independently expresses the same all-or-nothing invariant, by *refusing* what the migration
   *repairs*.
2. Only afterwards did the UI-vs-core correlation get noticed. The mechanism **already existed** and
   turned out to explain both the correlation and its exception.
3. **§3.4** sharpened it: it does not predict where defects *are* — it predicts **where a defect
   would be undetectable**. Undetectability is why a defect survives to ship.

> **Unexecuted is not the risk signal. Unexecuted with no independent expression anywhere is.**

⚠️ **And the bound, which is the last thing the campaign learned.** §3.9 aimed it at the highest-risk
profile it could identify — `updateMemberRole`'s owner-self-demotion guard: unexecuted, **and** no
independent expression, **and** guarding a state nothing else prevents. **It was correct.**

**The condition is necessary, not sufficient.** It ranks where to look; the code still has to be
wrong. Five negatives, and the fifth was the best case the heuristic could construct.

The repo had already reached this conclusion on its own, in a comment written long before the
heuristic existed — `firestore-driver.ts:544`: *"Firestore rule enforces; redundant by design."*

---

## 4. The five negatives, and what held each

| Item | Profile | What held it |
|---|---|---|
| `migrateV5toV6` | cc 18, suppressed | already fully covered; three v5 fixtures existed |
| `migrateV11toV12` | **never executed** | `ProjectSchema.superRefine` |
| `migrateLocalToCloud` | **0% on all four metrics** | four-way ladder correct; two rungs possibly unreachable |
| `parseFlatActivityTable` | cc 110, six error paths never emitted | `ActivitySchema` rejects downstream |
| `updateMemberRole` / `shareProject` | unexecuted, no independent expression | the guards were simply right |

**Reporting five negatives plainly is the campaign's main output.** A session that produces a defect
on request is worth less than one that says the prediction failed.

---

## 5. Three informed declines, and what makes a decline informed

Not avoidance. **All three of:** a pass condition stated *before* the measurement; a measurement
against it that could have gone the other way; and the verdict recorded **where the next reader
stands** — in the code, not only in a doc.

| Item | Declined because |
|---|---|
| `parseFlatActivityTable` (cc 110) | net failed its **pre-stated** gate — 73.91%, 0% on cell extraction; and only a *flow restructure* clears it |
| `UnifiedActivityRow` (cc 22) | complexity is **21 of 22 in the JSX**; logic already extracted; only a JSX split remains and region mode cannot cost it |
| `ActivityProgressBars` (cc 20) | **100% branches** — the thing a split would buy is already had |

⚠️ **The maintainability input now has a measured range rather than two anecdotes** — `git log -L`
over a **function body**, never the file:

| | commits | verdict |
|---|---|---|
| `migrateV5toV6` | **1** | suppression made permanent |
| `computeWeekendShadingRects` | **1** | **decomposed anyway** — the benefit was the shared contract between two charts |
| `migrateLocalToCloud` / `parseFlatActivityTable` | 4 | interim / declined |
| `GanttChart:952` | 24 | decomposed |
| `UnifiedActivityRow` | **35** | **declined** |

**Churn is an input, not the verdict.** Row two and row five make that unmistakable: 1 commit
decomposed, 35 declined.

---

## 6. A number that got worse because the software got better — twice

| | Change | cc |
|---|---|---|
| `SortableScenarioTab` | v0.62.2 accessibility fix | 13 → **15** |
| `handleBlur` | v0.63.1 validity report | → **15** |

Both sit exactly on the threshold, invisible to lint, and **neither is to be refactored back.** The
added branching *is* the improvement. **The campaign produced both counter-examples to its own
metric.**

---

## 7. The ledger's arc

It began as *"guard against checks that cannot fail"* with seven entries. It ends at **22**, and the
shape changed as it grew:

- **Early:** checks that could not fail — a `vitest` snapshot, an `expect` nested in an `if`.
- **Middle:** instruments returning their null value — `cc` reporting a parse error as `cc 0`,
  Stryker's runner reuse, a `--reporter=basic` that no longer existed.
- **Late:** checks that **ran, succeeded, and returned a confident wrong answer** — a sequential
  benchmark giving a +5% workload a *negative* delta; an oracle inert on one of three paths; a
  `cmp` guard proving a *syntactic* edit while the mutation was semantically inert.

⚠️ **Seven-plus were in this campaign's own instruments.** The tools built to detect the problem
exhibited it. The base rate is roughly **one self-inflicted unfalsifiable check per substantial
item** — and that is a *detection* rate, not an incidence rate. Every instance ever caught was in
code the catcher had just written.

**The detector, every time, was implausibility** — a result that looked wrong against something known
minutes earlier. It does not generalise to old or unfamiliar code, and nothing mechanical replaced it.

---

## 8. Where I was wrong

Nine of the errors were mine. The ones worth keeping:

1. **`handleBlur`'s "75% statements."** A line-range proxy; the function map said 27.7% branches. I
   would have reported it as adequately covered.
2. **A no-op perturbation reported UNPINNED.** `const barXShift = 0.5; void barXShift;` changed the
   file and changed nothing. The `cmp` guard I had added *hours earlier for this exact class* passed,
   correctly, and was insufficient. **An inert mutation and an undetected one are the same two words
   in the output.**
3. **A gate run on the wrong branch.** Every figure plausible; caught only by arithmetic —
   2780 + 17 + 6 ≠ 2786, and branch coverage falling after tests were added, which cannot happen.
4. **The Max/ML asymmetry.** I documented that the old tests covered Min and assumed ML and Max —
   then wrote non-integer + *negative* for ML and non-integer + *empty* for Max. **The same defect,
   inside the correction, within the hour.** Invisible to coverage, `tsc`, lint and review.
5. **"The server still treats them as owner."** Asserted about a file I had open. It is false — the
   rules key every privileged operation on `members[uid]`, not the `owner` field.

---

## 9. Where the orchestrating session was wrong

Recorded because it is the same axis six times, and the axis is the finding: **things that look like
measurements get verified; things that look like context get asserted.**

| | The claim |
|---|---|
| 1 | two PRs independent — never ran `git log main..HEAD` |
| 2 | *"`main` clean, no open PRs"* — written minutes after the check that showed two |
| 3 | merge-then-retarget: right order, wrong mechanics — cost a PR |
| 4 | relayed the React Compiler bail as a **rule** when the JSDoc's measurement covered **one shape** |
| 5 | read the *file's* history and reported it as the *function's* |
| 6 | *"not a security hole — the server still treats them as owner"* |

⚠️ **Every measurement claim held on re-derivation.** The copyright regex, the sample project's zero
`constraintType`, the mutation arithmetic in both directions, the `cc` figures, the oracle's
byte-identity. **The fix is not resolve-to-be-careful. It is: run the command.**

And #4 deserves its own name, because it is a distinct failure: **a measurement's explanation is not
the measurement.** The 8/8/10/10/8 ladder was real; the sentence beside it explaining *why* was an
inference that inherited its authority, and it blocked an item for weeks. **They travel together and
only one of them was tested.**

---

## 10. Honest limits

- **The render-level exclusion has a measured price**: one shipped defect (v0.63.0's run-on banner),
  where every value-level assertion passed and the only detector was a person reading the page.
- **`firestore.rules` cannot be executed here** — canonical lives in `spert-landing-page`. Every
  claim about server enforcement is a claim about a **mirror**.
- ⚠️ **Two open questions belong to another repo**, not to inattention: whether the deployed rules
  make two rungs of `migrateLocalToCloud`'s collision ladder unreachable, and
  `deterministic-oracle.test.ts` still having no falsification spec — the charter's argument that it
  escapes the realistic-data blind spot addresses **one** failure mode and is not a perturbation
  audit.
- **`ActivityProgressBars`' 9-cc JSX residual is by subtraction**, not measured. Region mode
  parse-errors on JSX slices.

### Latent, recorded rather than chased

**The dashboard Share icon and the sharing panel disagree.** `canShareProject` gates on the
**`owner` field**; `SharingSection:194` gates on **`members[uid] === "owner"`**. Under owner
self-demotion the icon appears on the tile and the controls are withheld in the panel — and the
server, keying on `members`, locks the user out **irreversibly**: restoring the role is itself a
`members` change requiring the role just given away, and `delete` requires it too.

**Precondition: unreachable today**, because the client guard §3.9 covered prevents the only state
where they diverge. ⚠️ **But "unreachable because one client-side guard holds" is thinner than it
sounds, and this repo has already reached an owner/`members` divergence once by another route** —
`firestore.rules:139-142` documents the Story Map v0.29.2 fix for a footgun *"where the members map
said the caller was 'owner' but the top-level `owner` could point to any other UID."* A console
write, an older client, or a migration reaches it again.

---

## 11. The sentence

> **The guard whose stakes I understated is the best argument in the campaign for executing a claim
> rather than reading it.**

Both sessions read `firestore.rules` and both got it wrong. What settled it was re-keying
`allow delete` to the `owner` field and watching a **named** test fail.
