# Cognitive-complexity census — re-derived 2026-08-02

**Scope:** every non-test source file under `src/` (234 files) · `main` @ `e3e6521` · v0.62.1
**Method:** `scripts/measure-complexity.mjs`'s exported `measure()` — the same tool `npm run cc`
uses, same repo config, same authoritative (directive-ignoring) pass — cross-referenced against
a full `vitest run --coverage` (`coverage/coverage-final.json`).

**Supersedes** `CRITIQUE_codebase-quality-charter_Opus-1.md` §3.1 (2026-08-01, `85cc711`,
v0.60.0), whose figures are quoted in the charter's §1 and §3.6 as this campaign's organising
fact.

---

## Result

| | Original (`85cc711`) | Now (`e3e6521`) | Δ |
|---|---|---|---|
| Functions at **cc ≥ 16** | 10 (of which `.tsx` 5) | **10** (of which `.tsx` **3**) | 0 (`.tsx` −2) |
| Functions at **cc 10–15** | 51 (of which `.tsx` 18) | **52** (of which `.tsx` **19**) | **+1** |
| — of those, in **0%-coverage files** | **21** | **9** | **−12** |
| — of those, **function never executes** | not measured | **10** | — |
| — suppressed anywhere in the band | not measured | **0** | — |
| — coverage unresolved | not measured | **0** | — |

**The headline correction: 21 → 9.** The charter's *"51 functions at cc 10–15, 21 of them
uncovered"* should read **"52 at cc 10–15, 9 of them in files no test executes."**

### The sweep was validated against something that could contradict it

`npm run lint` independently reports **8** cognitive-complexity findings, and the two migrations
are suppressed (so absent from lint, present in an authoritative sweep). The census therefore
had to return **10 at cc ≥ 16, exactly 2 suppressed, with the 8 non-suppressed matching lint
site-for-site** — and aborts if it does not. It held. A census that had silently swept the wrong
file set would otherwise look identical to a finding.

Second, internal check: every function in a 0%-coverage file must also show zero execution
count. All 9 do, and the function-level count is 9 + 1 — `analytics.ts:268
computeBatchPercentileCIs`, which sits in a 61.5%-covered file and never runs. That single
function is the entire difference between the two definitions today.

---

## Two definitions of "uncovered", and why both are here

The original counted **functions living in files at 0% line coverage**. That was the right call
when 85 of 88 `.tsx` files were at exactly 0% — file granularity and function granularity agreed
almost everywhere. It is no longer a safe proxy: a function can sit in a 90%-covered file and
still never execute.

- **9** — like-for-like with the original. This is the number that corrects the charter.
- **10** — the sharper number: this specific function has an execution count of zero.

They are close *today* (one function apart) precisely because coverage is still concentrated at
the file level. Expect them to diverge as partial coverage spreads. Quote the sharper one going
forward, and say which is meant.

---

## What moved, and what cannot be attributed

**Accounted:** `.tsx` at cc ≥ 16 fell 5 → 3. §3.3 Tier A decomposed `UnifiedActivityGrid:145`
(cc 25) and `ActivityEditModal:379` (cc 20); `UnifiedActivityGrid.tsx` now has **nothing at
cc ≥ 10** at all, and `ActivityEditModal.tsx`'s only band entry is a covered cc 14. Both targets
left the lint-visible population, which is exactly what that step set out to do.

**Accounted:** all three `.ts` hook sites the original named as uncovered are now covered, with
real execution counts — `use-gantt-layout.ts:59` (cc 13, 45 hits), `use-storage-mode-switch.ts:45`
(cc 13, 11 hits), `use-milestone-buffers.ts:54` (cc 10, 15 hits). §3.2 did that.

**Accounted:** `PrintGanttChart.tsx:450` (cc 12, 8 hits) and `GanttChart.tsx:1260` (cc 14, 8
hits) are covered by the parity oracle. Both appear in the original's uncovered list at
`:427`/`:1255` — **the line numbers shifted when #244 extracted the today-line.** Anyone diffing
this census against the original by line number will get false "disappeared" results; diff by
file plus name.

⚠️ **NOT accounted: the band's +1 (51 → 52).** The original recorded only its top 12 rows, so
there is no full list to diff against. The delta is small and the direction is unsurprising —
decomposing a function above the threshold can drop a residual into the band — but this is an
explanation, not a derivation, and it is recorded as such. **The complete list below exists so
the next re-derivation does not have this problem.**

---

## Every function at cc 10–15, with coverage

Sorted by complexity. `hits` is the v8 execution count for that function.

| cc | Site | Name | File line cov | hits | |
|---|---|---|---|---|---|
| 15 | `src/app/api/ai-batch-service.ts:96` | applyAiOpToScenario | 91.9% | 277 | covered |
| 15 | `src/infrastructure/persistence/migrations.ts:202` | migrateV10toV11 | 98.1% | 9 | covered |
| 15 | `src/infrastructure/persistence/migrations.ts:230` | migrateV11toV12 | 98.1% | 7 | covered |
| 15 | `src/ui/components/SharingSection.tsx:330` | BulkSharingSection | 0.0% | 0 | **UNCOVERED** |
| 14 | `src/core/schedule/constraint-utils.ts:361` | detectSoftViolation | 99.1% | 1347 | covered |
| 14 | `src/core/schedule/deterministic.ts:425` | backwardPassConstrained | 99.2% | 2886 | covered |
| 14 | `src/ui/charts/GanttChart.tsx:1260` | L1260 | 52.0% | 8 | covered |
| 14 | `src/ui/components/ActivityEditModal.tsx:65` | ActivityEditModal | 46.7% | 27 | covered |
| 14 | `src/ui/components/ConnectAI/ConnectAiPanel.tsx:21` | ConnectAiPanel | 0.0% | 0 | **UNCOVERED** |
| 14 | `src/ui/components/UnifiedActivityRow.tsx:216` | L216 | 0.0% | 0 | **UNCOVERED** |
| 14 | `src/ui/pages/ProjectPage.tsx:80` | ProjectPage | 0.0% | 0 | **UNCOVERED** |
| 13 | `src/app/api/ai-op-handlers.ts:183` | activityPatchChanges | 94.4% | 23 | covered |
| 13 | `src/app/api/schedule-export-service.ts:202` | L202 | 97.8% | 146 | covered |
| 13 | `src/ui/components/HolidayLoader.tsx:105` | loadHolidays | 0.0% | 0 | **UNCOVERED** |
| 13 | `src/ui/components/ScenarioSummaryCard.tsx:143` | ScenarioSummaryCard | 0.0% | 0 | **UNCOVERED** |
| 13 | `src/ui/components/ScenarioTabs.tsx:40` | SortableScenarioTab | 0.0% | 0 | **UNCOVERED** |
| 13 | `src/ui/hooks/use-cloud-sync.ts:222` | L222 | 63.3% | 6 | covered |
| 13 | `src/ui/hooks/use-gantt-layout.ts:59` | useGanttLayout | 100.0% | 45 | covered |
| 13 | `src/ui/hooks/use-import-state.ts:412` | handleConfirmImport | 84.0% | 15 | covered |
| 13 | `src/ui/hooks/use-storage-mode-switch.ts:45` | async | 100.0% | 11 | covered |
| 12 | `src/app/api/export-import-service.ts:246` | migrateAndValidateProjects | 98.8% | 48 | covered |
| 12 | `src/app/api/export-import-service.ts:332` | detectNameConflicts | 98.8% | 46 | covered |
| 12 | `src/ui/charts/PrintGanttChart.tsx:450` | L450 | 70.1% | 8 | covered |
| 12 | `src/ui/helpers/band-utils.ts:96` | deriveReorderResult | 98.4% | 9 | covered |
| 12 | `src/ui/hooks/use-ai-connectivity.ts:486` | startSession | 53.8% | 3 | covered |
| 11 | `src/core/analytics/analytics.ts:79` | histogram | 61.5% | 183 | covered |
| 11 | `src/core/analytics/analytics.ts:268` | computeBatchPercentileCIs | 61.5% | 0 | **UNCOVERED** |
| 11 | `src/core/calendar/work-calendar.ts:73` | buildHolidaySet | 98.6% | 345 | covered |
| 11 | `src/core/schedule/dependency-graph.ts:155` | findCycleFrom | 99.5% | 3745 | covered |
| 11 | `src/core/schedule/deterministic.ts:80` | computeDeterministicSchedule | 99.2% | 89 | covered |
| 11 | `src/core/schedule/deterministic.ts:480` | backwardPassNetwork | 99.2% | 2886 | covered |
| 11 | `src/infrastructure/firebase/firestore-driver.ts:140` | L140 | 54.1% | 2 | covered |
| 11 | `src/ui/charts/GanttChart.tsx:453` | furthestDate | 52.0% | 4 | covered |
| 11 | `src/ui/charts/PrintGanttChart.tsx:54` | PrintGanttChart | 70.1% | 4 | covered |
| 11 | `src/ui/components/activity-modal-sections.tsx:247` | computeGeneralUpdates | 63.3% | 35 | covered |
| 11 | `src/ui/components/ActivityImportSection.tsx:189` | handleCommit | 0.0% | 0 | **UNCOVERED** |
| 11 | `src/ui/components/unified-activity-helpers.ts:113` | handleCrossRowTabNav | 100.0% | 5 | covered |
| 11 | `src/ui/helpers/cdf-interpolate.ts:15` | bracket | 95.7% | 17 | covered |
| 11 | `src/ui/hooks/use-ai-connectivity.ts:181` | resumeSession | 53.8% | 2 | covered |
| 11 | `src/ui/providers/AuthProvider.tsx:360` | L360 | 45.9% | 10 | covered |
| 10 | `src/app/api/export-csv-formatter.ts:64` | exportScheduleCsv | 98.3% | 29 | covered |
| 10 | `src/core/schedule/constraint-utils.ts:37` | applyForwardConstraint | 99.1% | 2711 | covered |
| 10 | `src/infrastructure/firebase/firestore-sharing.ts:78` | getProjectMembers | 39.1% | 3 | covered |
| 10 | `src/infrastructure/persistence/migrations.ts:138` | migrateV6toV7 | 98.1% | 15 | covered |
| 10 | `src/infrastructure/persistence/migrations.ts:253` | migrateV12toV13 | 98.1% | 9 | covered |
| 10 | `src/ui/charts/GanttChart.tsx:256` | GanttChart | 52.0% | 4 | covered |
| 10 | `src/ui/charts/GanttChart.tsx:522` | L522 | 52.0% | 8 | covered |
| 10 | `src/ui/components/ImportSection.tsx:135` | L135 | 90.9% | 1 | covered |
| 10 | `src/ui/components/ScenarioComparison.tsx:53` | computeEntry | 0.0% | 0 | **UNCOVERED** |
| 10 | `src/ui/helpers/format-user.ts:17` | getFirstName | 100.0% | 14 | covered |
| 10 | `src/ui/helpers/import-banner.ts:41` | importDoneBanner | 100.0% | 24 | covered |
| 10 | `src/ui/hooks/use-milestone-buffers.ts:54` | computeSingleMilestoneInfo | 100.0% | 15 | covered |

## The nine, as work

All nine sit in `.tsx` files at 0% coverage, one function per file — so nine files, not nine
scattered sites. `ProjectPage.tsx:80` (cc 14) is among them and is §3.6's subject.

| cc | File | Function |
|---|---|---|
| 15 | `SharingSection.tsx:330` | `BulkSharingSection` |
| 14 | `ConnectAI/ConnectAiPanel.tsx:21` | `ConnectAiPanel` |
| 14 | `UnifiedActivityRow.tsx:216` | (arrow at `L216`) |
| 14 | `pages/ProjectPage.tsx:80` | `ProjectPage` |
| 13 | `HolidayLoader.tsx:105` | `loadHolidays` |
| 13 | `ScenarioSummaryCard.tsx:143` | `ScenarioSummaryCard` |
| 13 | `ScenarioTabs.tsx:40` | `SortableScenarioTab` |
| 11 | `ActivityImportSection.tsx:189` | `handleCommit` |
| 10 | `ScenarioComparison.tsx:53` | `computeEntry` |

Plus the tenth by the sharper definition: `core/analytics/analytics.ts:268
computeBatchPercentileCIs` (cc 11), in a 61.5%-covered file, never executed. It is the only
`/core` entry in either uncovered list and the only one reachable by a plain unit test.

---

## Does the charter's claim survive?

Yes, and it is now better supported than when it was written. The lint-visible population is
**10**; the sub-threshold band is **52** — still five times larger, still invisible to the
metric, and it still contains the file the charter names as least checkable (`ProjectPage.tsx`,
cc 14, one point under the threshold, zero tests).

What changed is the *size of the exposure*, not the shape of the argument: 21 uncovered → 9.
Two-thirds of the sub-threshold risk the critique identified has been retired by §3.2, §3.3 and
the parity oracle — none of which moved the lint count, which is the same point from the other
direction.

## Reproducing

1. `npx vitest run --coverage --coverage.reporter=json` → `coverage/coverage-final.json`
2. Sweep `src/**/*.{ts,tsx}` (excluding `*.test.*`, `*.d.ts`, `test-setup.ts`, `test-stubs.ts`)
   through `measure()` from `scripts/measure-complexity.mjs`.
3. Assert the cc ≥ 16 population reproduces `npm run lint` before reading anything else.
