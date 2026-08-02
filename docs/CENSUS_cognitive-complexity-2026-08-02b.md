# Cognitive-complexity census — re-derived after #250 and #251

**Scope:** every non-test source file under `src/` (234 files) · `main` @ `8b41f13` · v0.62.2
**Method:** identical to the first census — `measure()` from `scripts/measure-complexity.mjs`
cross-referenced against a full `vitest run --coverage`. Scope deliberately held constant for
comparability. (`scripts/falsify.mjs` is new but lives outside `src/`, so it cannot explain any
delta.)

**Supersedes** `docs/CENSUS_cognitive-complexity-2026-08-02.md`, which superseded
`CRITIQUE_codebase-quality-charter_Opus-1.md` §3.1.

---

## Result

| | Original (`85cc711`) | First census (`e3e6521`) | **Now (`8b41f13`)** |
|---|---|---|---|
| cc ≥ 16 | 10 | 10 | **10** |
| cc 10–15 | 51 | 52 | **52** |
| — in 0%-coverage files | 21 | 9 | **2** |
| — **function never executes** | not measured | 10 | **5** |

The sweep reproduced `npm run lint` exactly — 10 at cc ≥ 16, exactly 2 suppressed, the other 8
matching site-for-site — and aborts if it does not. It held. Lint holding at 8 is also
independent evidence that nothing crossed the threshold in v0.62.2.

---

## ⚠️ The file-granularity number should now be retired as the headline

It reads **2**. The honest number is **5**. They were one apart in the first census and are now
**two and a half times** apart, exactly as that document predicted they would diverge.

Every one of the previous nine is accounted for:

| Outcome | Count | Sites |
|---|---|---|
| **Genuinely covered** — the function executes | **5** | `ProjectPage.tsx:80` (72 hits) · `ScenarioTabs.tsx:40` (205) · `ScenarioSummaryCard.tsx:143` (48) · `SharingSection.tsx:330` (39) · `ConnectAiPanel.tsx:21` (39) |
| **The proxy broke** — file left 0%, function still never runs | **2** | `UnifiedActivityRow.tsx:216` (file 26.22%, 0 hits) · `ScenarioComparison.tsx:53` (file **1.04%**, 0 hits) |
| **Still 0%** | **2** | `HolidayLoader.tsx:105` · `ActivityImportSection.tsx:189` |

So of the seven-point "improvement" in the file-granularity number, **only five points are real
coverage**. `ScenarioComparison.tsx` moving from 0% to **1.04%** removed a cc-10 function from
the count while covering none of it — the proxy failing in the flattering direction, on the
metric this campaign uses to describe itself.

**Quote the function-level number. It is 5.**

---

## The prediction was wrong again, in the same direction

Written before the run: **4–6** by file granularity. Actual: **2**. That is the second
consecutive under-prediction of how much coverage had already landed — the first census
predicted 12–18 and got 9. Recorded because a prediction only checked when it succeeds is not a
check, and because a repeated one-directional error is information: work lands wider than its
stated target, because covering an orchestrator covers its children.

---

## What the v0.62.2 accessibility fix cost, measured

`ScenarioTabs.tsx:40 SortableScenarioTab` moved **cc 13 → 15**. Turning a `<span>` into a
`<button>` with `onClick` + `onDoubleClick` and a conditional `aria-current` adds real
branching. It is now **one point under the lint threshold** and will never appear in a lint
report — which is this campaign's thesis arriving on a change made during the campaign itself.

Not a reason to undo it. Recorded so nobody later discovers it as a surprise.

---

## The five that never execute

| cc | Site | File coverage |
|---|---|---|
| 14 | `UnifiedActivityRow.tsx:216` | 26.22% |
| 13 | `HolidayLoader.tsx:105` `loadHolidays` | 0% |
| 11 | `ActivityImportSection.tsx:189` `handleCommit` | 0% |
| 11 | `core/analytics/analytics.ts:268` `computeBatchPercentileCIs` | 61.54% |
| 10 | `ScenarioComparison.tsx:53` `computeEntry` | 1.04% |

`analytics.ts:268` remains the only `/core` entry and the only one reachable by a plain unit
test — still the cheapest item on this list, and still not done.

---

## Every function at cc 10–15, with coverage

Sorted by complexity. `hits` is the v8 execution count for that function.

| cc | Site | Name | File line cov | hits | |
|---|---|---|---|---|---|
| 15 | `src/app/api/ai-batch-service.ts:96` | applyAiOpToScenario | 91.9% | 277 | covered |
| 15 | `src/infrastructure/persistence/migrations.ts:202` | migrateV10toV11 | 98.1% | 9 | covered |
| 15 | `src/infrastructure/persistence/migrations.ts:230` | migrateV11toV12 | 98.1% | 7 | covered |
| 15 | `src/ui/components/ScenarioTabs.tsx:40` | SortableScenarioTab | 52.9% | 205 | covered |
| 15 | `src/ui/components/SharingSection.tsx:330` | BulkSharingSection | 18.2% | 39 | covered |
| 14 | `src/core/schedule/constraint-utils.ts:361` | detectSoftViolation | 99.1% | 1347 | covered |
| 14 | `src/core/schedule/deterministic.ts:425` | backwardPassConstrained | 99.2% | 2886 | covered |
| 14 | `src/ui/charts/GanttChart.tsx:1260` | L1260 | 53.8% | 8 | covered |
| 14 | `src/ui/components/ActivityEditModal.tsx:65` | ActivityEditModal | 46.7% | 27 | covered |
| 14 | `src/ui/components/ConnectAI/ConnectAiPanel.tsx:21` | ConnectAiPanel | 35.1% | 39 | covered |
| 14 | `src/ui/components/UnifiedActivityRow.tsx:216` | L216 | 26.2% | 0 | **NEVER RUNS** |
| 14 | `src/ui/pages/ProjectPage.tsx:80` | ProjectPage | 49.0% | 72 | covered |
| 13 | `src/app/api/ai-op-handlers.ts:183` | activityPatchChanges | 94.4% | 23 | covered |
| 13 | `src/app/api/schedule-export-service.ts:202` | L202 | 97.8% | 146 | covered |
| 13 | `src/ui/components/HolidayLoader.tsx:105` | loadHolidays | 0.0% | 0 | **NEVER RUNS** |
| 13 | `src/ui/components/ScenarioSummaryCard.tsx:143` | ScenarioSummaryCard | 39.5% | 48 | covered |
| 13 | `src/ui/hooks/use-cloud-sync.ts:222` | L222 | 63.8% | 6 | covered |
| 13 | `src/ui/hooks/use-gantt-layout.ts:59` | useGanttLayout | 100.0% | 92 | covered |
| 13 | `src/ui/hooks/use-import-state.ts:412` | handleConfirmImport | 84.0% | 15 | covered |
| 13 | `src/ui/hooks/use-storage-mode-switch.ts:45` | async | 100.0% | 11 | covered |
| 12 | `src/app/api/export-import-service.ts:246` | migrateAndValidateProjects | 98.8% | 48 | covered |
| 12 | `src/app/api/export-import-service.ts:332` | detectNameConflicts | 98.8% | 46 | covered |
| 12 | `src/ui/charts/PrintGanttChart.tsx:450` | L450 | 73.2% | 8 | covered |
| 12 | `src/ui/helpers/band-utils.ts:96` | deriveReorderResult | 98.4% | 9 | covered |
| 12 | `src/ui/hooks/use-ai-connectivity.ts:486` | startSession | 53.8% | 3 | covered |
| 11 | `src/core/analytics/analytics.ts:79` | histogram | 61.5% | 183 | covered |
| 11 | `src/core/analytics/analytics.ts:268` | computeBatchPercentileCIs | 61.5% | 0 | **NEVER RUNS** |
| 11 | `src/core/calendar/work-calendar.ts:73` | buildHolidaySet | 98.6% | 395 | covered |
| 11 | `src/core/schedule/dependency-graph.ts:155` | findCycleFrom | 99.5% | 3745 | covered |
| 11 | `src/core/schedule/deterministic.ts:80` | computeDeterministicSchedule | 99.2% | 118 | covered |
| 11 | `src/core/schedule/deterministic.ts:480` | backwardPassNetwork | 99.2% | 2886 | covered |
| 11 | `src/infrastructure/firebase/firestore-driver.ts:140` | L140 | 54.1% | 2 | covered |
| 11 | `src/ui/charts/GanttChart.tsx:453` | furthestDate | 53.8% | 33 | covered |
| 11 | `src/ui/charts/PrintGanttChart.tsx:54` | PrintGanttChart | 73.2% | 41 | covered |
| 11 | `src/ui/components/activity-modal-sections.tsx:247` | computeGeneralUpdates | 63.3% | 35 | covered |
| 11 | `src/ui/components/ActivityImportSection.tsx:189` | handleCommit | 0.0% | 0 | **NEVER RUNS** |
| 11 | `src/ui/components/unified-activity-helpers.ts:113` | handleCrossRowTabNav | 100.0% | 5 | covered |
| 11 | `src/ui/helpers/cdf-interpolate.ts:15` | bracket | 95.7% | 17 | covered |
| 11 | `src/ui/hooks/use-ai-connectivity.ts:181` | resumeSession | 53.8% | 2 | covered |
| 11 | `src/ui/providers/AuthProvider.tsx:360` | L360 | 45.9% | 10 | covered |
| 10 | `src/app/api/export-csv-formatter.ts:64` | exportScheduleCsv | 98.3% | 29 | covered |
| 10 | `src/core/schedule/constraint-utils.ts:37` | applyForwardConstraint | 99.1% | 2711 | covered |
| 10 | `src/infrastructure/firebase/firestore-sharing.ts:78` | getProjectMembers | 39.1% | 3 | covered |
| 10 | `src/infrastructure/persistence/migrations.ts:138` | migrateV6toV7 | 98.1% | 15 | covered |
| 10 | `src/infrastructure/persistence/migrations.ts:253` | migrateV12toV13 | 98.1% | 9 | covered |
| 10 | `src/ui/charts/GanttChart.tsx:256` | GanttChart | 53.8% | 51 | covered |
| 10 | `src/ui/charts/GanttChart.tsx:522` | L522 | 53.8% | 8 | covered |
| 10 | `src/ui/components/ImportSection.tsx:135` | L135 | 90.9% | 1 | covered |
| 10 | `src/ui/components/ScenarioComparison.tsx:53` | computeEntry | 1.0% | 0 | **NEVER RUNS** |
| 10 | `src/ui/helpers/format-user.ts:17` | getFirstName | 100.0% | 14 | covered |
| 10 | `src/ui/helpers/import-banner.ts:41` | importDoneBanner | 100.0% | 24 | covered |
| 10 | `src/ui/hooks/use-milestone-buffers.ts:54` | computeSingleMilestoneInfo | 100.0% | 15 | covered |

## Does the charter's claim still survive?

Yes. Lint-visible is **10**; the sub-threshold band is **52** — five times larger, still
invisible to the metric, and v0.62.2 just added a point to one of its members without lint
noticing. What has changed is the exposure: **21 → 9 → 5 uncovered**, retired by §3.2, §3.3,
§3.6 and the parity oracle, **none of which moved the lint count.**

## Reproducing

1. `npx vitest run --coverage --coverage.reporter=json`
2. Sweep `src/**/*.{ts,tsx}` (excluding `*.test.*`, `*.d.ts`, `test-setup.ts`, `test-stubs.ts`)
   through `measure()` from `scripts/measure-complexity.mjs`.
3. Assert the cc ≥ 16 population reproduces `npm run lint` before reading anything else.
4. Report the **function-level** uncovered count. Report the file-level one only alongside it,
   and only to compare with the pre-2026-08-02 figures.
