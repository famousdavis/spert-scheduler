# Changelog

## 0.40.0 — 2026-04-30

### Changed

- **Editing scenario notes now collapses into a single undo entry per editing session.** Previously each keystroke pushed its own snapshot, so a sentence-long note consumed dozens of slots from the 50-entry undo stack and required dozens of Ctrl+Z presses to revert. Notes editing now produces exactly one undo entry from focus through blur, restoring the textarea to its pre-edit state with a single Ctrl+Z. Pressing Ctrl+Z mid-edit and continuing to type re-establishes the group cleanly so the post-undo edits also collapse to a single entry.

### Internal

- **Added commit-based undo grouping primitive to the project store.** Module-scoped `activeUndoGroup` state, a project-id-scoped guard at the top of `pushUndo`, and two new actions (`beginUndoGroup` / `endUndoGroup`) wired to the scenario-notes textarea via `onFocus` / `onBlur`. The defensive `onChange` wrapper at the `ProjectPage` layer also calls `beginUndoGroup` (idempotent during normal typing) so the group self-heals after a mid-edit `undo()` / `redo()` clears it. `undo()` and `redo()` close any active group before popping; `setProjects` and `clearAllData` null the group on session boundaries (sign-out, mode switch).
- **Three new test cases in `use-project-store.test.ts`** cover the grouping mechanism: single-entry collapse across repeated updates, cross-project mutations not suppressed by another project's group, and group self-heal after mid-edit undo. 1221 tests passing across 59 files.
- Activity-notes textarea in `ActivityEditModal.tsx` was intentionally **not** wired in this release. Its `onChange` writes to local component state and `updateActivityNotes` is invoked exactly once per Save, so the per-keystroke problem does not exist there today. Wiring is deferred until a future inline-edit refactor needs it.

## 0.39.1 — 2026-04-23

### Fixed

- **Settings → Cloud Storage radios appearing unchecked after opening then dismissing the auth-chip modal.** The modal's radio group shared `name="storage-mode"` with `StorageModeSection`, so the browser treated all four radios as a single native group. When the modal rendered and then closed, the Settings page's radios were left visually unchecked even though React state was unchanged. Renamed the modal's radios to `name="storage-mode-modal"` to keep the two groups isolated.

## 0.39.0 — 2026-04-23

### Changed

- **Standardized auth chip click behavior across all three states (signed-out, signed-in-local, signed-in-cloud).** Every click now opens the **Storage & Sign In** modal — the previous inline popover for signed-in states (with "Switch to Cloud Storage" and "Sign out" buttons) has been removed. Modal open state now lives at the `Layout` level rather than inside `AuthButton`, so the chip is a pure visual trigger.
- **Storage & Sign In modal now handles all three auth/storage combinations in-place.** After successful sign-in the modal no longer auto-closes and navigates to `/settings`; instead it transitions to the signed-in-local layout so the user can flip to Cloud Storage without leaving the modal. Signed-in states show an identity card with avatar, display name (Microsoft "Last, First MI" reversed to "First MI Last" via the new `getDisplayName` helper), email, and inline **Sign out**. Radio group is interactive when signed-in: selecting **Cloud** triggers the upload-confirm / migration flow, selecting **Local** triggers the Keep/Discard confirmation.
- **Modal now includes an always-visible Notifications section** with the "Warn me on startup when using local storage" toggle — a second entry point to the same preference already in Settings → Notifications. Both surfaces read and write the same `suppressLocalStorageWarning` preference (intentionally left cloud-synced alongside the rest of `UserPreferences`; not migrated to a local-only key).
- **Sign-in button row now wraps (`flex-wrap`)** below ~320px viewports instead of overflowing. Modal gains an explicit `×` close button in the title row (backdrop, Escape, and the dismiss text button continue to work).

### Internal

- **Extracted `src/ui/hooks/use-storage-mode-switch.ts`** — shared state machine for migration progress, migration result/error, and the Keep/Discard confirmation flow. Consumed by both `StorageLoginModal` (new) and `StorageModeSection` (settings page). Eliminates drift risk between the two mode-switch entry points.
- **Added `getDisplayName()`** to `src/ui/helpers/format-user.ts` alongside the existing `getFirstName()` — reverses Microsoft "Last, First MI" display names to natural "First MI Last" order for the identity card. `getFirstName` semantics unchanged.
- **Removed `openedWhileSignedOutRef` + post-sign-in auto-navigate effect** from `StorageLoginModal`. Signed-in vs signed-out layout is now pure state-driven off the `{user, mode}` tuple.
- Settings → Cloud Storage section retained as a secondary entry point; refactored to consume the shared hook. Settings → Notifications section retained — two entry points to the same toggle is intentional.

## 0.38.6 — 2026-04-23

### Internal

- **Lint debt paydown: eliminated all 48 `sonarjs/no-nested-conditional` errors and reduced `sonarjs/cognitive-complexity` errors from 26 to 14 across 24 files.** Total lint errors: 74 → 15 (plus one cosmetic warning; see below). Batched three coordinated PRs (B2-a → B1 → B2-b) into a single release because the changes have cross-plan code coupling and zero user-visible behavior — splitting into three version bumps would have created interim states where a nested ternary moves between files before getting fixed.
  - **B2-a — Pure-logic complexity reduction (5 CC errors).** `use-milestone-buffers.ts`: two-level extraction of `computeMilestoneSlack` + `computeSingleMilestoneInfo` with a `MilestoneComputeContext` param object. `build-simulation-params.ts`: extracted `resolveConstraintOffsets` (DRYs the constraint-resolution loop across sequential and dependency modes); preserved `SequentialConstraintEntry` public type shape so downstream consumers in `use-simulation.ts`, `worker-client.ts`, `worker-protocol.ts`, `simulation-service.ts`, and `monte-carlo.ts` keep compiling. `gantt-utils.ts`: replaced `generateTicks`'s 7-branch `if/else if` chain with a `TICK_GENERATORS` dispatch table + 7 per-level generator functions — bit-identical output. `local-storage-repository.ts`: `loadWithDiagnostics` restructured as a flat chain over a `PhaseResult<T>` discriminated union with four focused helpers (`extractProjectName`, `parseProjectJSON`, `validateSchemaVersion`, `migrateProjectData`); `LoadError` shape unchanged. `firestore-driver.ts`: extracted `processProjectDoc` as a private method, added the `QueryDocumentSnapshot` import, documented the write-forward side-effect in JSDoc.
  - **B1 — Nested-ternary elimination (48 errors across 20 files).** Added shared milestone-health helpers to `src/domain/helpers/format-labels.ts`: `MilestoneHealth` type + `computeMilestoneHealth`, `milestoneHealthDotClass`, `milestoneHealthTextClass`, `milestoneHealthLabel`. Applied three fix patterns throughout: Pattern A (`if/return` helpers or `let + if/else if` for 3+ branch selectors — `const` hoisting does not clear this rule), Pattern B (extracted `pickBestHighlight` generic for `.map()` data-shape producers in `ScenarioComparison.tsx`), Pattern C (extracted early-null-return formatters like `formatSignedBuffer`, `formatSignedSlack` for outer-null-guards wrapping inner ternaries). Key fixes: `firebase.ts` rewrite preserves local-only-mode contract (`initializeApp` now only called when `isFirebaseConfigured` is true — the prior `isFirebaseConfigured ? (getApps().length === 0 ? initializeApp(...) : getApps()[0]!) : null` collapsed to a `let app = null; if (isFirebaseConfigured) { app = ... }` guard); `GanttChart.tsx` and `PrintGanttChart.tsx` edited in one commit to preserve print parity (parallel `let barColor` + if/else rather than a shared helper, per CLAUDE.md's "do not share" convention for the two files). Interim CC reduction side-effect: 22 → 17 (B1's helper extractions dropped 5 CC errors as a bonus beyond the primary nested-ternary scope).
  - **B2-b — UI complexity reduction (3 CC errors; plan expected 4 but ScenarioTabs already cleared by B1's `let tabTitle` extraction).** `UnifiedActivityRow.tsx` `handleTabNav` (CC 33 after B1's partial reduction): extracted 5 helpers — `buildTabFieldOrder`, `handleOffOrderTabNav`, `getActivityRowIds`, `handleCrossRowTabNav`, `handleInRowTabNav`. The plan estimated 3 extractions would suffice but residual CC was still 19 after three; the additional cross-row/in-row split brought it below threshold. `use-gantt-layout.ts` and `PrintGanttChart.tsx` tick suppression: extracted shared `suppressOverlappingTicks` + `shouldSuppressTick` + `TickSuppressionParams` interface to `gantt-utils.ts`. Both call sites now collapse to a single-line memoized call; raw layout primitives pass through the param object rather than a callback to preserve per-param memoization stability. Dead inline consts (`MIN_LABEL_PX = 40`, `PRINT_ELEMENT_PROXIMITY_PX = 25`, `PRINT_TODAY_PROXIMITY_PX`) deleted post-refactor.
  - **Known cosmetic lint warning.** `PrintGanttChart.tsx:165` retains an `eslint-disable-next-line react-hooks/preserve-manual-memoization` directive that currently reports as "unused" because the rule is dormant in this project's ESLint config. Preserved intentionally for future-proofing — if the rule activates after a plugin update, the directive correctly targets the closing `)` of the `useMemo` call terminator where `printDensityPx` instability would surface. The `// NOSONAR` comment on the same line is load-bearing and independent of the disable directive.
  - No behavior change. All 1218 tests pass; typecheck clean.

## 0.38.5 — 2026-04-23

### Internal

- **Flattened cognitive complexity in the dependency graph and milestone simulation parameter builder** (PR 3 of the three-PR lint-debt paydown plan; see `/Users/william/.claude/plans/here-is-what-claude-vivid-jellyfish.md` for the full scope). All five `sonarjs/cognitive-complexity` errors in `src/core/schedule/dependency-graph.ts` (CC 16, 36, 17, 21) and `src/core/schedule/milestone-sim-params.ts` (CC 17) brought under the 15-allowed threshold. Lint count: 79 → 74 errors (0 warnings).
  - **`src/core/schedule/dependency-graph.ts`**: extracted `populateAdjacency` + `kahnTopoSort` from `buildDependencyGraph`; extracted `buildAdjacencyForCycle`, `reconstructCyclePath`, and `findCycleFrom` (single-DFS-tree visitor) from `detectCycle`; extracted `validateDepStructure` from `validateDependencies`; introduced shared `runForwardPass` / `runBackwardPass` primitives now reused by both `computeCriticalPathDuration` and `computeCriticalPathActivities`; extracted `computeActivityScheduleWithMilestone`, `applyHardConstraintIfPresent`, and `computeMilestoneDurations` from `computeCriticalPathWithMilestones`.
  - **`src/core/schedule/milestone-sim-params.ts`**: extracted `snapForwardToWorkingDay` (now shared by project-start and milestone-target snapping), `buildMilestoneActivityMap`, and `computeActivityEarliestStartOffset` from `buildMilestoneSimParams`.
  - **`stryker.config.mjs` + `vitest.stryker.config.ts`**: added `milestone-sim-params.ts` (and its test file) to the Stryker mutate scope so future refactors of that file have a baseline to compare against. Caught a latent gap during the baseline run — the file had no mutation coverage before this PR.
  - **Verified by Stryker mutation re-run against the pre-refactor baseline** (cold cache, ~13 min per run): `dependency-graph.ts` mutation score 89.13% → **89.27%** (survivors 20 → 19); `milestone-sim-params.ts` survivor count unchanged (8 → 8). The headline percentage drop on `milestone-sim-params` (80.00% → 77.78%) comes entirely from the extracted helpers producing more type-checker-rejected mutants (`# errors` 8 → 14), not new test gaps.
  - No behavior change. All 1218 tests pass; typecheck clean.

## 0.38.4 — 2026-04-21

### Internal

- **Flattened nested-function depth in the Zustand project and notification stores** (PR 2 of the three-PR lint-debt paydown plan). All 10 `sonarjs/no-nested-functions` errors resolved. Lint count: 89 → 79 errors (0 warnings).
  - Added four module-level helpers to `src/ui/hooks/use-project-store.ts`: `updateProjectInList(projects, projectId, transform)`, `updateScenarioInList(projects, projectId, scenarioId, mutation)`, `patchActivityInList(activities, activityId, patch)`, and `filterOut(arr, value)`. Each is a plain function that takes its callback as a parameter, so inlining them at call sites no longer counts as a nested function definition.
  - Rewrote 9 store actions (`addActivity`, `duplicateActivity`, `updateActivityChecklist`, `updateActivityDeliverables`, `updateActivityNotes`, `updateScenarioNotes`, `setSimulationResults`, `removeConvertedWorkDay`, `toggleScenarioLock`) to use these helpers. Each action went from 5 nested arrow levels (store setter → `set((state) =>)` → `.map((p) =>)` → `updateScenario(..., (s) =>)` → `activities.map((a) =>)`) to 3.
  - `src/ui/hooks/use-notification-store.ts`: extracted the filter predicate into a module-level `removeFromList(notifications, id)` helper shared by both `addNotification`'s auto-dismiss `setTimeout` and the explicit `removeNotification` action. Eliminated the single `sonarjs/no-nested-functions` error at line 37.
  - No behavior change. All 1218 tests pass; undo/redo, activity mutations, and notification dismissal are observationally identical.

## 0.38.3 — 2026-04-21

### Internal

- **Eliminated all four ESLint warnings and three errors from the pre-existing lint baseline** (PR 1 of a three-PR lint-debt paydown plan; see `/Users/william/.claude/plans/here-is-what-claude-vivid-jellyfish.md` for the full scope). Lint count: 96 → 89 problems (92 errors + 4 warnings → 89 errors + 0 warnings). Two of the warnings were real React correctness signals, not stylistic — see below.
  - **`ScenarioSummaryCard.tsx` — eliminated double-render on heuristic %-input prop changes.** The two `useState` + `useEffect` pairs that synced `localMinPct`/`localMaxPct` to `settings.heuristic{Min,Max}Percent` triggered `react-hooks/set-state-in-effect` warnings and caused a second render after every scenario switch or undo/redo. Replaced with React's documented "adjust state during render" pattern (`useState` for previous prop + `if (prev !== current) setPrev(current); setLocal(...)`), which commits a single render per prop change.
  - **`SimulationPanel.tsx` — restored React Compiler optimization of `targetLookup` useMemo.** The manual dep list listed `simulationResults?.samples` (a narrower shape than the React Compiler's inferred `simulationResults`), which tripped `react-hooks/preserve-manual-memoization` and prevented compiler-driven optimization. Broadened the dep to the full `simulationResults` object; the memoized body already null-guards `simulationResults?.samples?.length`, so the widening is safe. Also extracted the inline `pct >= greenPct ? ... : pct >= amberPct ? ...` ternary into a named `healthColor()` helper and pre-computed the `by ${dateLabel}` suffix to eliminate the adjacent SonarJS `no-nested-conditional` and `no-nested-template-literals` errors.
  - **`ThemeToggleButton.tsx` — restored fast-refresh HMR.** The file exported a non-component `nextTheme` helper alongside the component, which tripped `react-refresh/only-export-components` and disabled HMR for the file. Dropped the `export` keyword; `nextTheme` is used only internally.
  - **`eslint.config.js` — added `coverage/` to the ignores list.** The auto-generated Istanbul coverage output (`coverage/block-navigation.js`) was surfacing an `Unused eslint-disable directive` warning on every lint run.

## 0.38.2 — 2026-04-21

### Fixed

- **Printed PDF report no longer shows a misleading Confidence label for Triangular and Uniform activities.** The Statistical PERT Ratio Scale Modifier (RSM) only drives the proxy standard deviation for Normal and LogNormal distributions; Triangular and Uniform activities ignore the stored `confidenceLevel`. The interactive grid already greys the cell out, and the XLSX/CSV schedule exports already write an empty cell for these distributions, but `PrintableReport.tsx` rendered `RSM_LABELS[activity.confidenceLevel]` unconditionally for every row. The print path now mirrors the same `distributionType === "normal" || "logNormal"` guard used by `buildGridRows`, falling back to an em-dash (`—`) — the standard N/A sentinel elsewhere in the printed report — for non-SPERT distributions.

### Internal

- Added two regression tests to `schedule-export-service.test.ts` asserting `row.confidence === ""` for `distributionType: "triangular"` and `"uniform"` in `buildGridRows`. The existing guard was previously untested (the only fixture defaulted to `logNormal`), so a future refactor could have silently regressed it.

## 0.38.1 — 2026-04-20

### Fixed

- **Scenario tab row now scrolls horizontally with a standard mouse wheel on Windows.** Chromium-family browsers do not translate vertical wheel events to horizontal scroll on containers whose only overflow axis is X, so users with many scenarios had to use Shift+Wheel or click a partially-visible tab. A scoped native wheel listener on the scroll container now redirects `deltaY` into `scrollLeft` when the container overflows and the event has no horizontal component. Trackpad two-finger horizontal gestures (which carry `deltaX`) are passed through unchanged. Firefox's line-mode deltas (`deltaMode === 1`) are converted to pixels via a 16× multiplier.

## 0.38.0 — 2026-04-19

### Security

- **Sign-out now fully wipes per-user session data.** Previously, after signing out of Cloud Storage, the prior user's projects, preferences, and last-active scenario map remained in both the in-memory store and `localStorage`. On a shared browser, the next user could see the prior user's data and — in rare cases — inadvertently upload it to their own Firestore account. Sign-out now cancels pending Firestore writes, zeros the Zustand project store, and clears `spert:project:*`, `spert:project-index`, `spert:user-preferences`, and `spert-scheduler:active-scenarios`. Storage mode (`spert:storage-mode`), first-run banner state, and the Nager country cache are intentionally preserved for continuity.
- **Sign-out during an edit no longer races revoked credentials.** The Firestore driver now exposes a `cancelPendingSaves()` method (idempotent, silent drop) that runs before `firebaseSignOut`, so queued 500 ms-debounced writes cannot fire with revoked credentials. `beforeunload` still flushes — tab-close semantics are unchanged.
- **ToS-mismatch forced sign-out now routes through the same cleanup** as user-initiated sign-out, so both paths cannot drift.
- **ToS acceptance write failures no longer strand the user.** When the Firestore write to `users/{uid}` fails, `LS_TOS_WRITE_PENDING` is now left set and `LS_TOS_ACCEPTED_VERSION` is unset, so the next sign-in retries Branch A and creates the missing record. Previously the local flags were finalized unconditionally, which could leave the user marked accepted locally but missing from Firestore — causing cross-app re-prompts.

### Added

- **Auth chip now has a "signed-in + local" state (state d).** When you are signed in but using Local Storage, the chip shows your avatar + lock icon and opens a popover with two actions: "Switch to Cloud Storage" (navigates to Settings — does not auto-switch) and "Sign Out". Previously the chip rendered "Local only / Sign in" to already-signed-in users, with no way to sign out from the header.
- **Cloud → Local mode switch now prompts.** When toggling off Cloud Storage with projects present, a confirmation modal offers "Keep local copy" (default) or "Discard". Discard clears `spert:project:*`, `spert:project-index`, `spert-scheduler:active-scenarios`, and zeros the in-memory store. Preferences are preserved — you're still the same person.
- **OAuth popup errors are now differentiated.** Closing the popup (`auth/popup-closed-by-user`) or double-clicking Sign In (`auth/cancelled-popup-request`) is a silent no-op — the page no longer redirects away. Popup-blocker browsers still fall back to `signInWithRedirect` and now show an explanatory toast before navigating. Other errors surface a "Sign-in failed" toast.
- **After a successful sign-in from the header chip's modal**, the modal closes and the app navigates to `/settings` so you can immediately toggle Cloud Storage with one click. Previously the modal stayed open with no guidance.
- **Shared `getFirstName()` helper** for rendering user names with Microsoft "Last, First" reversal. Used by the auth chip (both states c and d) and the SharingSection member list — no more duplicated comma-parsing logic.

### Internal

- New `FirestoreDriver.cancelPendingSaves()` method (bulk sibling of the existing `cancelPendingSave(id)`).
- New `LocalStorageRepository.clearAll()` method for wiping all indexed project keys.
- New `clearAllLastScenarios()` in `scenario-memory.ts` and `clearPreferences()` in `preferences-repository.ts`.
- New `clearAllData()` action on `useProjectStore` — zeros `projects`, `loadError`, `loadErrors`, `undoStack`, `redoStack` in a single `set()` call. Does not touch `localStorage` or emit sync events.
- New `clearInMemory()` action on `usePreferencesStore` — resets preferences to defaults without writing to `localStorage` (unlike `resetPreferences`, which writes defaults).
- New `sign-out-cleanup-registry.ts` module — module-level single-slot callback so `StorageProvider` (deepest provider with access to all stores and the driver handle) can hand a cleanup closure to `AuthProvider` without crossing the `AuthProvider → StorageProvider` context boundary.
- New `getCloudSyncDriver()` exported from `use-cloud-sync.ts` — module-level driver handle that the registry reads during sign-out. Null when cloud mode is inactive.
- New `src/ui/providers/auth-errors.ts` — extracted `classifyPopupError()` and the `SIGN_IN_POPUP_BLOCKED` constant to keep `AuthProvider.tsx` component-only (react-refresh hygiene).
- New `src/ui/helpers/format-user.ts` — `getFirstName(displayName, email)`.
- New `src/ui/components/KeepOrDiscardLocalModal.tsx` — Radix dialog for the Cloud→Local confirmation.
- `useCloudSync` teardown now calls `cancelPendingSaves()` instead of `flushPendingSaves()` on mode-switch and sign-out; `beforeunload` still flushes.
- 42 new tests covering all new primitives and the popup-error classifier.

## 0.37.4 — 2026-04-17

### Added

- Gantt chart now auto-draws finish-to-start arrows between adjacent activities when Dependency Mode is OFF. This makes the implicit sequential ordering visually explicit. The existing Arrows toolbar checkbox now also appears in non-dependency mode so you can hide the auto-drawn arrows if they aren't useful. Auto-drawn arrows are non-interactive and do not carry critical-path styling — in sequential mode every activity is trivially on the critical path, so the stripe would add no information.

## 0.37.3 — 2026-04-16

### Fixed

- Header title and navigation tabs (Projects, Calendar, Settings, About) now use an inline-flex layout, working around a Chromium 147 rendering regression that caused the pointer-cursor affordance to disappear (and in Brave, clicks to miss the center of nav tabs). The workaround is harmless on unaffected browsers.

## 0.37.2 — 2026-04-16

### Fixed

- Header buttons (theme toggle, cloud auth chip) now show the pointing-finger cursor on hover. This restores the click affordance that was lost with the Tailwind v4 upgrade, which removed the default `cursor: pointer` on `<button>` elements.
- Header title "SPERT® Scheduler" is now fully clickable across its entire width at any viewport size — previously the title could wrap on narrow viewports, leaving the second line outside the hit target.
- Navigation links (Projects, Calendar, Settings, About) now explicitly declare the pointing-finger cursor and no-wrap behavior, so the click target stays consistent across browsers including Brave.

## 0.37.1 — 2026-04-16

### Fixed

- Scenario tab row: hid the horizontal scrollbar that was rendering as a thick gray bar over the tab underline. Scrolling still works via drag, wheel, and keyboard; overflow is now signaled by partially-visible tabs at the edge.

## 0.37.0 — 2026-04-16

### Added

- Scenario tabs now scroll horizontally when there are more scenarios than fit. The Compare button stays pinned on the right edge and is always visible.

### Changed

- Cloning a scenario now inserts the new clone immediately to the left of the source scenario, instead of appending to the end. Cloning from the "+" Add dialog follows the same placement rule. The clone becomes the active scenario and is auto-scrolled into view if off-screen.

## 0.36.4 — 2026-04-10

### Improved

- Sign-in modal buttons now show Google and Microsoft brand icons.

## 0.36.3 — 2026-04-10

### Added

- Sign-in modal when clicking the auth chip. Opens a focused dialog with Google and Microsoft sign-in buttons instead of navigating to the Settings page.

### Fixed

- Horizontal layout shift caused by the scrollbar appearing and disappearing when navigating between pages of different heights.

## 0.36.2 — 2026-04-09

### Changed

- Auth chip in the header is now a single clickable pill. When signed in to cloud storage, clicking anywhere on the chip opens a small account menu showing your name and email, with a Sign Out button. Dismiss with Escape or by clicking outside. When signed out, clicking the chip still opens the sign-in flow.

## 0.36.1 — 2026-04-08

### Fixed

- Dependency edit modal: negative lag (lead time) values like "-5" can now be entered reliably. The Lag Days field auto-selects its current value on focus and accepts the minus sign as you type. Out-of-range values are clamped to ±365 days on save.

## 0.36.0 — 2026-04-08

### Added

- Theme toggle button in the header (between About and the cloud storage chip). Click to cycle Light → Dark → System; the icon reflects the current state.
- Per-project tile color: pick one of 8 muted accent colors (Slate, Sage, Sky, Lavender, Rose, Amber, Teal, Clay) to color-code projects on the Projects page — useful for grouping projects that belong to the same program. The color shows as a 4px left border strip on the tile. (Schema v19 → v20.)
- Import Projects button on the Projects page header (next to Export All Projects). Matches the header layout used by other SPERT Suite apps.

## 0.35.0 — 2026-04-05

### Legal

- Updated Terms of Service and Privacy Policy to v04-05-2026.
- Added SPERT AHP to list of covered apps.
- Updated effective date to April 5, 2026.

## 0.34.9 — 2026-04-05

### Improved

- Header auth chip: replaced the text-button sign-in and avatar dropdown with the SPERT Suite split-pill design. Signed-in state shows a 26px avatar circle with first initial, first name only, and a cloud icon segment that navigates to Settings. Local/signed-out state shows a lock icon with "Local only" and a "Sign in" action segment.

## 0.34.8 — 2026-04-03

### Improved

- Activity grid: the delete (×) button is now gray at rest and turns red only on hover, reducing visual clutter while preserving discoverability.

## 0.34.7 — 2026-04-02

### Added

- Projects page: new "Export All Projects" button exports all active projects in one click (same JSON format as the Settings export, simulation results excluded). Disabled when there are no active projects.
- localStorage warning banner: an amber caution banner now appears on every page when data is stored locally, reminding users to export at the end of each session. "Got it" dismisses for the session.
- Settings → Notifications: new section with a toggle to permanently suppress the localStorage warning banner across sessions.

### Improved

- Settings page: "Schedule Export" section renamed to "Export Schedule" for consistency with action-first labeling.

## 0.34.6 — 2026-04-02

### Improved

- Gantt: finish date bar labels are now right-aligned inside the bar, anchoring the date visually to the bar's right (finish) edge instead of floating at center.

## 0.34.5 — 2026-04-01

### Security

- XLSX export now guards against Excel formula injection (cells starting with `=`, `+`, `-`, `@`, `\t`, `\r` are prefixed with `'`), matching the existing CSV export protection.
- CSV/clipboard import pipeline: individual cell values are now capped at 1,000 characters before processing, and error messages truncate echoed user values to 80 characters.
- Import parsing stops early once the 500-activity limit is reached, avoiding unnecessary processing of oversized files.
- `sanitizeForFirestore` now explicitly skips `__proto__`, `constructor`, and `prototype` keys as defense-in-depth.

### Fixed

- Min, Most Likely, and Max summary totals are now rounded to the nearest whole number in the activity grid and schedule exports (XLSX and CSV).

### Maintenance

- Added Firestore `hasOnly` drift detection test: parses `firestore.rules` at test time and compares against the Zod preferences schema to catch missing allowlist entries.
- Added "update `firestore.rules` `hasOnly` list" step to the CLAUDE.md user preference checklist.

## 0.34.4 — 2026-04-01

### Maintenance

- Extracted `useScheduleExport` hook from `ScenarioSummaryCard` — export state and handlers (XLSX, CSV) now live in a self-contained hook, reducing component body by ~30 lines.
- Extracted `DependenciesDisplaySection` and `ScheduleAnalysisSection` as local sub-components in `ActivityEditModal`, and extracted `computeConstraintUpdates` as a module-level helper to reduce nesting in `buildFieldUpdates`.
- SonarJS `no-nested-conditional` remediations: extracted `selectAutoTickLevel` in `gantt-utils.ts`; `resolveButtonClass` in `CopyImageButton.tsx`; `resolveUsageBarColor` in `LocalStorageSection.tsx`; `formatMilestoneCount` in `MilestonePanel.tsx`; label position logic in `HistogramChart.tsx`.
- SonarJS `cognitive-complexity` remediation: extracted `runSimulationSync` from `simulation-service.ts`.
- Updated `vitest` version pin to `^4.1.2` (cosmetic — already resolved to 4.1.2).

## 0.34.3 — 2026-04-01

### Improved

- Activity grid: hover over any row to reveal a pencil icon in the name cell that opens the Edit Activity modal directly.
- Min/ML/Max estimate columns narrowed (42px → 38px) and Status/Actual columns trimmed for a more compact layout.
- Estimate values (Min/ML/Max) are displayed as integers in the grid; decimals are accepted during entry and rounded on save.

## 0.34.2 — 2026-04-01

### Added

- Activities with notes now show a small violet indicator beneath the activity name in the grid (alongside the existing task and deliverable bars), and a violet dot on the Notes section header in the Edit Activity modal.

## 0.34.1 — 2026-04-01

### Changed

- Any scenario can now be deleted. The last remaining scenario is protected from deletion instead of the first (Baseline) scenario.

## 0.34.0 — 2026-03-31

### Added

- CDF date probability lookup: enter a target finish date above the Cumulative Distribution chart to see the probability of finishing by that date, with a RAG-colored reference line on the chart (green/amber/red based on Schedule Health thresholds).
- Scheduled Start date now displayed in the Edit Activity modal alongside Scheduled Finish and Duration.

### Fixed

- CDF chart x-axis changed from categorical to numeric scale, producing a true CDF curve shape instead of a straight line.
- CDF chart resolution increased from 500 to 1,000 downsampled points for better tail accuracy.
- Edit Activity modal no longer falsely reports unsaved changes when opened and closed without modifications.

### Changed

- Edit Activity modal: "Sched. Duration" and "Actual Duration" labels abbreviated to "Sched. Dur." and "Actual Dur." for better layout at Complete status.

## 0.33.8 — 2026-03-31

### Maintenance

- Updated Terms of Service and Privacy Policy to v03-31-2026.
- Updated canonical legal document URLs to spertsuite.com.
- Updated consent UI text to SPERT® Suite branding.

## 0.33.7 — 2026-03-29

### Fixed

- CDF chart probability capped at 99%. The cumulative distribution tooltip previously displayed "Probability: 100%" at the rightmost data point, implying certainty that the project cannot exceed the maximum simulated duration. Monte Carlo samples are finite — the true distribution tail always extends beyond the observed maximum.

## 0.33.6 — 2026-03-29

### Fixed

- Web Worker trial count validation ceiling raised from 50,000 to 100,000 to match the Zod schema and UI options introduced in v0.33.5. Previously, selecting 100,000 trials caused a worker validation error.

## 0.33.5 — 2026-03-29

### Added

- Monte Carlo simulation trial count option: 100,000 trials now available in both the scenario settings and default preferences dropdowns. Useful for audit-grade precision where reduced variance is needed.

## 0.33.4 — 2026-03-29

### Added

- Gantt chart row guide lines: faint horizontal lines every 3 rows to help visually track activities to their bars. On by default; toggle in the Gantt appearance panel under Shading.

## 0.33.3 — 2026-03-28

### Changed

- Gantt chart color presets expanded from 4 to 10: Classic, Professional, Colorful, Grayscale, Contrast, Forest, Ocean, Sunset, Lavender, Earth.
- Retired Monochrome and Warm presets; existing projects using them fall back to Classic.
- About page: removed "IT" qualifier from project manager audience description.
- About page: License section now links to the GitHub LICENSE file and discloses the Section 7(b) non-permissive attribution requirements.

## 0.33.2 — 2026-03-28

### Enhanced

- Cumulative Distribution Function (CDF) chart tooltip now shows projected finish date alongside duration and probability when hovering over the curve, making it easy to answer "what's the probability my project finishes by this date?"
- Scenario comparison CDF chart tooltip also includes projected finish dates.

## 0.33.1 — 2026-03-28

### Changed

- Default distribution type changed from Normal (T-Normal) to Triangular in both user preferences and scenario settings, aligning with the recommended distribution for the updated heuristic defaults.
- Default heuristic minimum changed from 50% to 75% in both user preferences and scenario settings, bringing congruence with Triangular distribution recommendations.
- Footer now includes a "License" link pointing to the project's GNU GPL v3.0 LICENSE file on GitHub (with Section 7(b) non-permissive additional terms), alongside the existing Terms of Service and Privacy Policy links.

## 0.33.0 — 2026-03-28

### Chore — Clean Code Audit

Static analysis audit of the entire `src/` directory using `eslint-plugin-sonarjs` added to the existing ESLint configuration. No functional changes. All 1,123 tests pass, matching the pre-audit baseline exactly.

**Tooling added:**
- `@vitest/coverage-v8` — coverage reporting (dev dependency)
- `eslint-plugin-sonarjs` — static analysis with SonarJS recommended ruleset (dev dependency)
- ESLint config override: `sonarjs/assertions-in-tests` disabled for `**/*.test.ts` and `**/*.test.tsx` (false positives from `fc.assert()` property-based tests)

**Findings: 144 → 98 (46 eliminated, 12 rules fully resolved)**

**Fixed — code changes:**
- `no-identical-functions`: `removeById()` now delegates to `remove()` in `local-storage-repository.ts`
- `no-nested-template-literals` (8): inner templates extracted to named consts in `WarningsPanel.tsx`, `export-import-service.ts`, `GanttChart.tsx`
- `exhaustive-deps`: extracted `projectName` const before `useEffect` in `ProjectPage.tsx`
- `no-unused-collection`: removed dead `rows` array and push loop in `flat-activity-parser.test.ts`

**Suppressed — intentional or false positives:**
- `assertions-in-tests` (14) — `fc.assert()` not recognized by SonarJS
- `no-unused-vars` (8) — intentional destructuring discards using established `_` prefix convention
- `pseudo-random` (4) — bootstrap CI resampling and test data generation, not security-sensitive
- `no-duplicated-branches` (1) — SNET/MSO cases intentionally identical in forward pass; difference manifests in backward pass
- `set-state-in-effect` (1) — intentional reset on lock state change
- `preserve-manual-memoization` (1) — `printDensityPx` instability acceptable in print-only context
- `table-header` (3) — presentation layout tables, no logical header row
- `concise-regex` (1) — explicit character class documents hyphen exclusion intentionally

**Deleted:**
- `src/core/schedule/target-rag 2.ts` — macOS copy artifact, not imported anywhere

**Deferred (structural complexity, out of scope):**
- `sonarjs/no-nested-conditional` (56) — requires surgical decomposition
- `sonarjs/cognitive-complexity` (32) — scheduling engine and parser logic; correctness-critical
- `sonarjs/no-nested-functions` (10) — case-by-case review needed

Top complexity offenders — `computeDependencySchedule` (140) and `parseActivities` (104) — deliberately untouched as correctness-critical algorithms where decomposition carries regression risk.

## 0.32.3 — 2026-03-28

### Bug Fixes

- Gantt chart: reduced Today proximity suppression threshold (`TODAY_PROXIMITY_PX`) from 60px to 44px. On compressed fit-to-window timelines (~1,500+ day projects in ~900px chart area), the previous threshold suppressed quarterly ticks that had adequate visual clearance, leaving visible gaps in the timeline header (e.g. Q2 → Q4 with no Q3 label).

## 0.32.2 — 2026-03-27

### Security

- Activity Edit Modal: added date format validation guard (`/^\d{4}-\d{2}-\d{2}$/`) on Actual Finish Date blur handler to prevent malformed strings from propagating NaN through `parseDateISO` and calendar math.
- Activity Edit Modal: actual duration input now clamps to positive integers (`Math.max(1, Math.floor)`) at both the handler and `buildFieldUpdates` save layers, preventing negative, zero, or NaN values from reaching the store.
- Activity Edit Modal: replaced magic number `10000` with exported `MAX_CALENDAR_ITERATIONS` constant for non-work-day snapping loop guard.

### Internal

- Exported `MAX_CALENDAR_ITERATIONS` from `@core/calendar/calendar` for reuse in UI handlers.

## 0.32.1 — 2026-03-27

### Refactoring

- ActivityEditModal: extracted `ScheduleContextRow` local component and `buildFieldUpdates()` sub-function for cleaner save/dirty-check logic.
- GanttChart: extracted `GanttToolbar` local component (~108 lines) from the main render body.
- gantt-utils: consolidated `monthTickLabel`, `quarterlyTickLabel`, `semiannualTickLabel` via shared `tickLabelWithYear` helper.
- gantt-utils: completed `toISO` deprecation — all internal uses replaced with `formatDateISO` from `@core/calendar/calendar`.
- gantt-utils: removed `buildOrderedActivities` no-op function and its 4 tests.
- activity-row-helpers: documented `computeElapsedDays` dual-type calendar parameter.

### Tests

- Added 5 new tests: `semiannualTickLabel` edge case, `countQuarterlyTicks`/`countSemiannualTicks` same-day boundaries, `generateTicks` forced monthly, `computeWeekendShadingRects` trailing span closure.

## 0.32.0 — 2026-03-27

### New Features

- Gantt chart **Fit to Window** toggle: compresses the full project timeline into the visible container width with no horizontal scrolling. Enables the copy-image button to capture the complete chart — including multi-year programs — for presentations.
- Gantt chart **Timeline Labels** control (Sparse / Normal / Dense): directly selects tick granularity for multi-year projects (>540 days). Dense shows monthly ticks, Normal shows quarterly (Q1–Q4), Sparse shows semi-annual (H1/H2). Works with or without Fit to Window.

### Enhancements

- Quarterly tick labels follow the `monthTickLabel` pattern: year shown on first tick and year-change boundaries only (e.g. "Q2 '26", "Q3", "Q4", "Q1 '27").
- Semi-annual tick labels: "H1 '26", "H2", "H1 '27" etc., with year on first tick and year boundaries.
- Year-carrying tick labels (e.g. "Q1 '27", "H1 '28", "Jan '26") render in **bold** for easy year-break identification.
- Today line proximity suppression: ticks within 60px of the Today line are suppressed for all ticks (including the first) since Today's label already shows the full date and year. Other chart elements (finish line, milestones) use a tighter 40px threshold.
- Print chart parity: all tick density, bold year labels, and collision suppression changes mirrored in PrintGanttChart.

### Internal

- Schema version 18 → 19 (migration adds `fitToWindow` to existing Gantt appearance settings; `timelineDensity` is optional — no additional migration needed).
- New exports in `gantt-utils.ts`: `quarterlyTickLabel`, `semiannualTickLabel`, `countQuarterlyTicks`, `countSemiannualTicks`.
- New constant `TODAY_PROXIMITY_PX` (60px) in `gantt-constants.ts` for Today-specific tick suppression.
- `generateTicks` accepts optional `tickLevel` parameter; `TickLevel` type extended with `"semiannual"`.
- Collision suppression decoupled: tick-to-tick uses 40px minimum, Today proximity uses 60px, density setting controls only tick level selection.

## 0.31.0 — 2026-03-27

### New Features

- Activity Edit Modal: bidirectional Actual Finish Date field for completed activities. Enter a finish date to auto-calculate duration, or enter a duration to auto-calculate the finish date. Uses the project work calendar for accurate working-day math.

### Enhancements

- Activity Edit Modal: Actual Duration field now editable for in-progress activities, matching the activity grid behavior. Shows "Elapsed" placeholder when empty; falls back to computed elapsed working days on save if cleared.
- Estimates section in Activity Edit Modal now defaults to collapsed, reducing visual noise on modal open.

## 0.30.5 — 2026-03-27

### Enhancements

- Dependency type dropdowns and labels now show full names (Finish-to-Start, Start-to-Start, Finish-to-Finish) instead of two-letter abbreviations for improved clarity.

### Refactoring

- Centralized dependency type labels into `dependencyLabel()` formatter in `format-labels.ts`, replacing the local constant in `DependencyEditModal`.

## 0.30.4 — 2026-03-27

### Enhancements

- Gantt bar label font size now scales with the activity font size selection (Small/Normal/Large/XL). Small is the minimum — larger settings increase readability.
- Bar labels (dates or durations) are hidden when they don't fit inside the bar, preventing clipped or overlapping text.
- Bar label font is automatically capped to fit within the bar height when compact row density is combined with large/XL font sizes.

## 0.30.3 — 2026-03-26

### New Features

- Drag-and-drop scenario tab reordering: grab the grip handle on any scenario tab to drag it to a new position.

## 0.30.2 — 2026-03-26

### Bug Fixes

- Fixed CDF comparison chart legend overlap: scenario names were clipped by the x-axis label. Consolidated axis label into caption below the chart.

### Testing

- Added 67 mutation-testing gap-closure tests across constraint-utils, dependency-graph, and deterministic scheduler modules.
- Boundary equality tests for all 6 constraint types (MSO, MFO, SNET, FNET, SNLT, FNLT) in forward pass, backward pass, and conflict detection.
- SS/FF dependency backward pass tests: late dates, total float, and lag accounting.
- SS/FF forward pass tests: negative lag clamping to project start, positive lag offsets.
- SS/FF dependency violation detection coverage.
- Working-day skip loop tests: Saturday, Sunday, and holiday start date advancement.
- `actualDuration` guard tests: complete and inProgress activities with/without `actualDuration`.
- Conflict result shape tests: `undefined` vs array for `constraintConflicts` and `dependencyConflicts`.
- Critical path tests: `maxPredEF` correctness with hard MFO constraints, empty graph, milestone floor, cycle path structure.
- Invalid dependency filtering: non-existent IDs, self-loops, `validateDependencies` error types.

## 0.30.1 — 2026-03-26

### Bug Fixes

- Fixed activity name overflow at larger font sizes: `nameCharLimit` and `printNameCharLimit` now scale inversely with font size (`Math.floor(baseLimit * 12 / nameFontSize)`).
- Fixed small font size mapping (was 10px, now 11px as designed).
- Fixed comfortable row density dimensions (`rowHeight` 42→44px, `printRowHeight` 24→25px).
- Fixed print Gantt dependency lag label using hardcoded `fontSize="4"` instead of scaled `fs4`.

### Refactoring

- Extracted weekend shading computation to shared `computeWeekendShadingRects()` pure function in `gantt-utils.ts` (used by both interactive and print Gantt charts).

## 0.30.0 — 2026-03-26

### New Features

- **Gantt appearance controls**: Per-project Gantt chart appearance panel with name column width (narrow/normal/wide), font size (small/normal/large/XL), row density (compact/normal/comfortable), and bar label format (duration/dates/none).
- **Color presets**: 4 built-in color themes (Classic, Monochrome, Ocean, Warm) with light and dark mode variants. Classic matches the existing Gantt colors exactly.
- **Custom bar colors**: Override planned and in-progress bar colors with any color via a swatch picker or native color input. Custom colors clear when switching presets.
- **Weekend/non-work day shading**: Optional gray bands on the Gantt chart highlighting non-working days (uses the project's work calendar).
- **Settings travel with project**: Appearance settings are stored on the project and survive export/import round-trips.
- **Print parity**: Print Gantt chart mirrors all appearance settings — layout dimensions, bar colors, font scaling, weekend shading, and bar labels.
- **Palette toggle**: New palette icon button in the Gantt toolbar shows/hides the collapsible appearance panel.

### Technical

- `resolveGanttAppearance()` pure function maps `GanttAppearanceSettings` to concrete pixel values and colors.
- Hatch patterns now use `strokeOpacity` approach with bar colors instead of separate named `hatchActivity`/`hatchInProgress` colors.
- `dateToX()` no longer has a default `leftMargin` parameter — all call sites pass it explicitly.
- `useGanttLayout` hook parameterized with `leftMargin`, `rowHeight`, and `barHeight`.
- New `GanttAppearancePanel` component with segmented controls and inline color pickers.
- `updateGanttAppearance` store action (pushUndo, no lock guard, no simulation invalidation).

### Schema

- v17 → v18: Added optional `ganttAppearance` field to `Project` interface.

## 0.29.3 — 2026-03-26

### New Features

- **Persist "Show Activity IDs"**: The Gantt toolbar toggle now persists per project (schema v17) instead of resetting on page navigation.
- **Finish Target on print report**: Project Summary section now includes the Finish Target date (or "—" if not set).
- **App version on print report**: The report header now shows the app version (e.g., "SPERT® Scheduler v0.29.3") for traceability.
- **Gantt timeline months**: Projects spanning 91+ days now show monthly tick marks (month name only) instead of biweekly date ticks. Year is shown on the first tick and at year boundaries.
- **Gantt "Today" date**: The Today vertical line now shows the formatted date beneath the label, matching the milestone label style.
- **Gantt month gridlines**: Month gridlines are always visible even when the label is suppressed by collision with Today/Finish/Milestone markers.
- **Disabled toggle tooltip**: "Show Finish Target Date" checkbox shows a tooltip explaining why it's disabled when no target date is set.

### UI Polish

- **Print report tasks/deliverables layout**: Redesigned with activity header rows showing name + progress count, followed by indented item rows — clearer visual hierarchy and consistent column alignment between Tasks and Deliverables tables.
- **Hide FirstRunBanner from print**: The ToS/Privacy notification banner no longer appears on printed PDF reports.
- **Print CSS hardening**: Fixed Chrome print quirk where fixed-position elements ignored `display: none` — added `position: static`, `visibility: hidden`, and space-collapsing overrides.

### Schema

- Schema v16 → v17: Added optional `showActivityIds` field to Project.

## 0.29.2 — 2026-03-25

### Refactor

- Extracted shared `renderItemTable` helper in PrintableReport, eliminating duplicate Activity Tasks / Activity Deliverables table rendering.
- Extracted `formatItemColumn` helper in schedule-export-service, deduplicating tasks/deliverables column logic in `buildGridRows`.
- Extracted `ActivityProgressBars` named component in UnifiedActivityRow, replacing the inline IIFE with a clearer sub-component.

### UI Polish

- Deliverables progress bar color changed from teal to indigo for better visual distinction from the green completed-tasks bar.
- Deliverables checkbox color updated to indigo to match progress bar.

### Security

- Patched 3 high-severity transitive dependency vulnerabilities: `undici` 7.22.0 → 7.24.6, `picomatch` 4.0.3 → 4.0.4, `flatted` 3.3.3 → 3.4.2.

## 0.29.1 — 2026-03-25

### UI Polish

- Activity edit modal section counts (Tasks, Deliverables) now render in a smaller, lighter font for softer visual hierarchy.
- Blue dot indicators added to Scheduling Constraint and Dependencies section headers when content is present, matching the existing Notes indicator.
- Unsaved changes guard on activity edit modal: clicking outside with pending changes prompts "Save them?" — OK saves, Cancel returns to the modal. The explicit Cancel button always discards without prompting.

## 0.29.0 — 2026-03-25

### New Features

- Activity Deliverables — track deliverables (documents, artifacts, sign-offs) per activity with a checklist-style UI. Deliverables appear in the activity edit modal, schedule export (XLSX/CSV), and print report.
- Activity Notes — free-text notes field per activity (up to 2,000 characters) in the activity edit modal. Blue dot indicator on the Notes section header when notes are present.
- Scenario Notes — free-text notes field per scenario accessible via a memo icon in the summary card. Blue dot indicator when notes are non-empty.
- Finish Target placeholder styling — the Finish Target date input now shows lighter font weight when no date is set, providing a clear visual distinction from populated dates.

### Progress Bars

- Activity row progress bars now support deliverables: teal bar for in-progress deliverables, green when all delivered.
- When both tasks and deliverables are present, two half-width bars display side by side.

### Export & Print

- Schedule export (XLSX/CSV) includes two new columns: "Deliverables" and "Deliverable Details".
- Print report includes an "Activity Deliverables" table (same format as Activity Tasks).

### Schema

- Schema version bumped from 15 to 16 (passthrough migration — no data transformation needed).
- Checklist item limit raised from 20 to 50 per activity.

## 0.28.2 — 2026-03-25

### Security

- CSV formula injection guard expanded to cover tab (`\t`) and carriage return (`\r`) prefix characters per OWASP guidance.
- Added dedicated test coverage for CSV formula injection guard across all export paths.
- Suppressed false-positive ESLint `react-hooks/refs` error in PercentileTable with documented rationale.

## 0.28.1 — 2026-03-25

### Refactor

- Extracted RAG schedule health computation to a pure, testable utility (`computeTargetRAGColor`) — memoized at call site for better render performance.
- Extracted Gantt chart preferences into a consolidated `useGanttPreferences` hook, reducing GanttChart.tsx by ~50 lines.
- Extracted Schedule Health threshold UI into a standalone `ScheduleHealthSection` component.
- Cleaned up redundant prop spread in GanttSection.

### Dependencies

- Updated firebase, react-router-dom, recharts, typescript-eslint, eslint, @eslint/js, @vitejs/plugin-react to latest stable minor/patch releases.

## 0.28.0 — 2026-03-25

### New Features

- Finish Target Date — set a project-level target finish date (e.g., the date promised in your project charter) in the summary card. The target date appears between the Start and Finish dates for quick reference.
- Gantt chart Target line — optionally display the finish target as a vertical dashed line on the Gantt chart. Toggle visibility via the "Show Finish Target Date" checkbox in the Gantt toolbar.
- RAG schedule health indicator — the Target line and Finish Target date in the summary card reflect schedule health: green (simulation finishes by the green percentile), amber (within the amber threshold), or red (at risk). Gray/blue when no simulation has been run.
- Configurable RAG thresholds — set Green and Amber percentile thresholds in Settings under "Finish Target — Schedule Health". Defaults: Green at P80, Amber at P50.
- Monochrome-safe dash patterns — the Target line uses distinct dash patterns per RAG state so schedule health is distinguishable on black-and-white prints.

## 0.27.0 — 2026-03-24

### New Features

- Estimation Heuristics Suggester — new inline panel in Settings that helps you choose informed heuristic min/max percentages by selecting your industry domain and activity subdomain from a curated 73-entry reference table spanning 23 industries. Displays suggested optimistic and pessimistic percentages with rationale, and applies values to your heuristic defaults with one click.

## 0.26.2 — 2026-03-24

### Bug Fixes

- Corrected activity end date calculation. Previously, end dates were computed one working day too late (e.g., a 5-day activity starting Monday showed an end date of the following Monday instead of Friday). This also caused a 1-day gap between sequential activities. All scheduled dates are now consistent with standard project management conventions: the end date is the last working day of the activity. Existing project data is unaffected — only displayed schedule dates change.

## 0.26.1 — 2026-03-24

### Enhancements

- Redesigned bulk action toolbar: added Status dropdown (Planned, In Progress, Complete) alongside Confidence and Distribution. All three dropdowns now stage selections until you click "Apply." When applying a distribution change with heuristics enabled, you're prompted to recalculate min/max using current heuristic percentages.
- The browser's "Save as PDF" default filename now includes the project name and today's date (e.g., "SPERT Scheduler for My Project - March 24, 2026.pdf").

## 0.26.0 — 2026-03-23

### Enhancements

- New "Show Activity IDs" toggle in the Gantt chart toolbar. When enabled, sequential number prefixes (#1, #2, #3...) appear before activity names across the Gantt chart, activity grid, dependency panel, milestone panel, warnings panel, and modal dialogs — making it easy to reference specific activities by number during team conversations. Numbers match the # column in the schedule export. Toggle is session-only and resets on page reload.

## 0.25.3 — 2026-03-23

### Bug Fixes

- Activity Edit Modal now applies heuristic min/max auto-fill when the Most Likely value is changed, matching the behavior of the activity grid. Previously, editing ML in the modal with heuristics enabled did not recalculate min and max.

## 0.25.2 — 2026-03-23

### Enhancements

- Total Float and Free Float are now surfaced in three places in Dependency Mode: the schedule export (XLSX and CSV) includes new float columns; hovering over a Gantt activity bar shows a tooltip with scheduled dates and float values; and the Activity Edit Modal includes a new read-only Schedule Analysis section. Activities on the critical path are identified as such (Total Float = 0). Float values are only shown in Dependency Mode and do not appear in sequential mode schedules.
- Schedule export filenames now prefixed with "spert-scheduler" for easy identification.

## 0.25.1 — 2026-03-23

### Bug Fixes

- Copy image button now shows a disabled state with an explanatory tooltip in browsers that do not support image clipboard writes (Firefox). Chrome, Edge, and Brave are unaffected.

### Improvements

- Added Import Activities quick reference guide (PDF) link to the import section
- Updated Quick Reference Guide for v0.25.0
- PDF links now open in a new browser tab instead of triggering a download

## 0.25.0 — 2026-03-22

### New Features

- Import activities from CSV file or clipboard paste — parse spreadsheet data into a new scenario with full validation, dependency resolution, and cycle detection
- Download CSV template with 10 example activities demonstrating all four distribution types (T-Normal, LogNormal, Triangular, Uniform) with realistic dependency chains
- Live preview with debounced parsing, row-level error/warning display, and summary statistics
- Import to a new project or add as a scenario to an existing project, with one-click navigation to the imported project
- Confidence Level is optional for Triangular and Uniform distributions (only affects T-Normal and LogNormal)

## 0.24.4 — 2026-03-21

### New Features

- Dependency panel sort toggle — switch between alphabetical (A→Z) and schedule order (by predecessor start date) to view dependencies in the order they appear in the schedule

## 0.24.3 — 2026-03-20

### Bug Fixes

- Scheduling constraints (SNET, MSO, MFO, FNET) now work in sequential (non-dependency) mode — previously constraints were silently ignored when dependency mode was off
- Monte Carlo simulation in sequential mode now respects constraint-induced schedule gaps (position-tracking path with per-trial constraint application)

## 0.24.2 — 2026-03-20

### Security

- Gate project name console.warn behind `import.meta.env.DEV` in Firestore driver (prevents project name leakage to browser console in production)
- Add CSV formula injection guard (`^[=+@-]` prefix) to simulation CSV export `csvEscape()` — matches schedule-export-service pattern for suite consistency

## 0.24.1 — 2026-03-20

### Refactoring

- Extract `ChecklistSection` component from ActivityEditModal (~130 LOC reduction) with controlled component pattern
- Deduplicate `CONSTRAINT_LABELS` — shared constant + `constraintLabel()` helper in `@domain/helpers/constraint-labels.ts` (was duplicated in ActivityEditModal and PrintableReport)

### Bug Fixes

- Fix `handleAddTask` stale closure — `checklist.length` in useCallback dependency array caused unnecessary recreations; now reads prop directly in controlled component

### Dependencies

- All available upgrades (firebase 12.11.0, vitest 4.1.0, @vitejs/plugin-react 5.2.0, eslint 9.39.4) deferred — released within 60-day freshness window

## 0.24.0 — 2026-03-20

### New Features

- Activity task checklists — add, toggle, reorder, and remove tasks within each activity via the Activity Edit modal
- New "Tasks" section in Activity Edit modal with drag-and-drop reordering (max 20 tasks per activity)
- Thin progress bar under activity name in grid — color-coded: blue for in-progress, green when all tasks complete, gray when none complete; clickable to open Activity Edit modal
- Checklist progress visible in print report as "Activity Tasks" section with per-activity completion counts
- Schedule export (XLSX/CSV) includes Tasks summary and Task Details columns

### UI Improvements

- Task input retains focus after adding a task for rapid entry of multiple tasks

### Technical

- Schema v13 → v14 migration (optional checklist field on Activity)
- Dedicated store method for checklist updates preserves simulation results (no unnecessary re-runs)
- Activity duplication and scenario cloning generate fresh checklist item IDs

## 0.23.1 — 2026-03-19

### Bug Fixes

- Fix CDF chart x-axis "Duration (days)" label clipped by insufficient bottom margin
- Fix print Gantt dependency arrows rendering on top of bars instead of behind them (paint order parity with interactive chart)

### Performance

- Bootstrap CI computation 17× faster — batch all percentiles per sort instead of sorting per percentile
- Show 95% CI toggle now defers computation via setTimeout(0) to keep checkbox responsive

### UI Improvements

- Print Gantt buffer row label changed from "Buffer" to "Schedule Buffer" to match interactive chart
- Print Gantt buffer bar uses hatched yellow fill instead of solid yellow to match interactive chart
- Gantt buffer bar duration label (+Xd) now has a white halo for readability over hatched pattern
- Activity Edit modal: Name and Status fields side-by-side for compact layout
- Dependency Edit modal: Relationship Type and Lag Days side-by-side; predecessor/successor always editable via dropdowns
- Dependency panel: list sorted alphabetically by predecessor then successor name
- Dependency panel: click any row to open edit modal for full dependency editing
- Dependency panel: placeholder text in add-dependency dropdowns styled with muted color
- Locked scenarios: Gantt chart arrows fully unresponsive (no hover highlight, tooltip, or click)
- Constraint column dash and tags show pointer cursor to indicate clickability
- Scenario summary card: improved toggle-to-label spacing

## 0.23.0 — 2026-03-19

### Features

- Click Gantt chart bars to open expanded Activity Edit modal with four sections: General, Estimates, Scheduling Constraint, and Dependencies
- Click dependency arrows to edit relationship type, lag days, or delete via new Dependency Edit modal
- Hover dependency arrows for visual highlighting with thicker strokes and brighter colors
- Add dependencies directly from the Activity Edit modal's Dependencies section
- Terminal activity markers on Gantt chart — right-edge stripe automatically marks activities with no successor in dependency mode

## 0.22.3 — 2026-03-19

### Features

- Click activity names in the Gantt chart to rename them inline — saves on blur or Enter, cancel with Escape

### UI Improvements

- Gantt legend reordered: Complete, In Progress, Planned (matches workflow progression)
- Gantt legend: Today now appears before Finish to match left-to-right reading order on chart

## 0.22.2 — 2026-03-19

### Bug Fixes

- Fix histogram buffer shading not appearing when Parkinson's Law clamps all trials above deterministic duration

### Security

- Add `hasOnly()` field constraints to Firestore `users/{uid}` write rule to prevent arbitrary field injection
- Add `hasOnly()` field constraints to Firestore `spertscheduler_settings` write rule to restrict writable keys
- Add defensive `?? true` fallback to Parkinson's Law preference read in Settings page
- Harden schema migration v12→v13 to normalize non-boolean `parkinsonsLawEnabled` values via `typeof` check

## 0.22.1 — 2026-03-18

### Refactoring

- Extract shared ToggleSwitch component from ScenarioSummaryCard and PreferencesSection (6 duplicated toggle instances → 1 reusable component)

### Dependencies

- Upgrade zustand 5.0.11→5.0.12, tailwindcss 4.2.1→4.2.2, @tailwindcss/vite 4.2.1→4.2.2, typescript-eslint 8.57.0→8.57.1, @types/react 19.2.10→19.2.14

## 0.22.0 — 2026-03-18

### Features

- Add configurable Parkinson's Law toggle — disable per-scenario to allow simulated activity durations below the deterministic schedule

### Enhancements

- Add Parkinson's Law status to printed project report
- Add Parkinson's Law default toggle to user preferences
- Compact scenario summary card layout — consolidate target labels, shrink heuristic inputs, add tooltips to all toggles

## 0.21.2 — 2026-03-18

### Bug Fixes

- Fix LogNormal distribution sparkline curve peaking at wrong position — peak now aligns with the most-likely (mode) marker
- Fix mode marker vertical line offset in all distribution sparklines — now accounts for SVG padding to align with curve peak
- Fix histogram Buffer shading starting at Monte Carlo mean instead of deterministic P50 duration — shaded region now matches the buffer shown in the summary card

### Enhancements

- Make "Run simulation" text clickable in schedule buffer placeholder (ScenarioSummaryCard), giving users a third trigger point for simulation

### Security

- Add CSV formula injection guard: prefix cells starting with `=`, `+`, `@`, or `-` with a single quote
- Add 10 MB file size guard at the import service layer (was UI-only)
- Filter scenario memory localStorage entries to string values only
- Gate preferences validation logging behind development mode
- Document Firestore enum validation limitations and list rule workaround in SECURITY.md

## 0.21.1 — 2026-03-18

### Refactoring

- Extract type-dispatch helpers in scheduling core to deduplicate SS/FF/FS forward and backward pass logic
- Extract shared WarningItem component in WarningsPanel for consistent constraint/dependency conflict rendering

## 0.21.0 — 2026-03-18

### New Features

- Add Start-to-Start (SS) and Finish-to-Finish (FF) dependency relationship types alongside existing Finish-to-Start (FS)
- Type-aware forward/backward pass scheduling in both integer and date domains
- Dependency type selector in add form and inline editing on existing dependencies
- Type-aware Gantt chart arrow anchors: SS left-to-left, FF right-to-right, FS right-to-left
- Dependency constraint violation detection and display in Warnings panel
- Schedule export (XLSX/CSV) shows dependency type in predecessor/successor references (e.g., 1FS+2d, 2SS, 3FF)
- Gantt chart toggle to show/hide dependency arrows (persisted preference)
- FF arrows use U-turn path (exit right, curve out, approach target from right with left-pointing arrowhead)

### Technical

- Schema v11→v12 migration with defensive type write-forward
- Unified LS-based backward pass for all dependency types
- Post-pass dependency validation with sign-dispatch for negative lag

## 0.20.4 — 2026-03-18

### Enhancements

- Add optional constraint note field (up to 500 characters) to document why a scheduling constraint exists
- Add Constraints section to print report with Type, Date, Mode, and Note columns
- Add Constraint Note column to XLSX/CSV schedule exports
- Add SPERT® branding to print report header and footer
- Add sign-in buttons to Cloud Storage settings section for discoverability

## 0.20.3 — 2026-03-18

### Bug Fixes

- Fix heuristic Min/Max % inputs rejecting intermediate keystrokes — now validates on blur (ScenarioSummaryCard, PreferencesSection)
- Format constraint warning dates to match user's date format preference (ActivityEditModal, WarningsPanel)
- Change Clear constraint button color from red to green (no-error semantic)
- Use unique blue C icon for constraint legend indicator (was identical to Planned)
- Remove misleading hover pencil icon from Gantt chart rows

### Enhancements

- Move schedule export (XLSX/CSV) buttons into summary card buffer row, reclaiming vertical space between activity grid and dependency panel

## 0.20.2 — 2026-03-17

### Security

- Escalate write-forward migration failures to error callback (firestore-driver.ts)
- Add iteration guard to constraint date picker non-working-day snap loop (ActivityEditModal.tsx)
- Validate constraint type/mode enum domains in worker payload filter (simulation.worker.ts)
- Reject schema versions below 1 on project import (export-import-service.ts)
- Fix localStorage key namespace collision for active-scenario persistence (scenario-memory.ts)
- Harden filename sanitization: empty fallback, 200-char truncation (download.ts)
- Log Zod validation failures in preferences loader for diagnostics (preferences-repository.ts)

## 0.20.1 — 2026-03-17

### Refactoring

- Extract `useScenarioComparison` hook from ProjectPage (comparison mode state + handlers)
- Extract `EstimateInputs` component from UnifiedActivityRow (Min/ML/Max numeric inputs)
- Extract `BulkActionToolbar` component from UnifiedActivityGrid (bulk selection UI)

## 0.20.0 — 2026-03-17

### New Features

- Activity scheduling constraints: MSO, MFO, SNET, SNLT, FNET, FNLT with Hard/Soft modes
- Activity Edit Modal for managing scheduling constraints
- Warnings Panel showing constraint conflicts and violations with severity levels
- Constraint column in activity grid (dependency mode) with clickable badges
- Constraint indicators on Gantt chart bars (interactive and print)
- Dual backward pass: constraint-adjusted late dates + network-driven late dates (CPM float)
- Monte Carlo simulation respects hard constraints per trial
- Schema v10 to v11 migration with write-forward for Firestore

### Enhancements

- Schedule export (XLSX/CSV) includes constraint type, date, and mode columns
- Gantt legend includes constraint indicator when constraints are present
- Sequential-mode banner when constraints exist but dependency mode is off
- totalFloat computed from network-driven backward pass
- Soft constraint badges in activity grid show amber shading when a warning condition exists
- Wider activity name column in grid (reclaimed 70px from Distribution, Min/ML/Max, Confidence, Actions columns)
- Wider activity name area in Gantt chart (interactive: 260px, print: 170px) — shows up to 38 characters
- Date format option changed from YYYY-MM-DD to YYYY/MM/DD to prevent line-wrapping in grid cells
- Removed duplicate activity button from grid rows (available via scenario clone instead)

## 0.19.3 — 2026-03-17

### Enhancements

- Add "Date prepared" label to bottom-right of Gantt chart (interactive + print), providing context when the chart is copied or shared

### Bug Fixes

- Fix Max % heuristic input not accepting typed values (removed HTML `min` constraint that blocked intermediate keystrokes)
- Fix Gantt chart showing activities in topological sort order instead of grid order when dependency mode is enabled

## 0.19.2 — 2026-03-17

### Security

- Validate cached country data with Zod before use (`loadCachedCountries`)
- Add regex guard and `encodeURIComponent` on country code before URL construction (`fetchPublicHolidays`)
- Namespace localStorage cache key to `spert-scheduler:nager-countries`

## 0.19.1 — 2026-03-17

### Improvements

- Updated ARCHITECTURE.md: schema version v8→v10, added `workDays`, `convertedWorkDays`, `WorkCalendar`, holiday `source`/`countryCodes`/`locale` fields, `defaultHolidayCountry` and Gantt preferences to domain model, updated test count
- Updated SECURITY.md: added calendar configuration validation section covering `workDays` validation, `CalendarConfigurationError`, priority stack, holiday range limits, and filename sanitization
- Simplified `useShallow` to targeted selectors in CalendarPage.tsx and use-work-calendar.ts where single-value selection made shallow comparison unnecessary

## 0.19.0 — 2026-03-17

### New Features

- Configurable work week: click interactive day pills to toggle work days on/off, supporting any combination including non-contiguous schedules (e.g., Mon/Wed/Fri)
- Converted work days: override non-work days as work days on a per-project basis (e.g., make specific Saturdays count as work days)
- Smart validation: warns when adding a date that is already a work day or falls on a holiday
- Amber warning when converted work day list exceeds 50 entries, suggesting work week adjustment instead

### Improvements

- Holiday-blocked conversion notification now persists until acknowledged via "Got it" button (replaces auto-dismiss toast)
- Calendar page dynamically describes the active work week instead of hardcoded "Monday through Friday"
- All scheduling, Gantt charts, and exports respect the configured work week
- CalendarConfigurationError banner when work week settings produce no valid work days
- Zustand store selectors refactored with `useShallow` and targeted selectors to eliminate "Maximum update depth exceeded" re-render cascades
- `loadPreferences()` uses shallow comparison to prevent unnecessary state replacement from JSON deserialization

### Testing

- Added 85 new tests (643 → 728 total across 45 files) covering v0.17.0–v0.19.0 features
- Non-standard work week configurations: Sun-Thu, 3-day, 1-day, non-contiguous, 7-day
- Holiday source interactions: API vs manual, backward compatibility, multi-country dedup
- Calendar layering integration tests: all 4 global/project combinations through full scheduling pipeline
- Date boundary conditions: year boundaries, DST transitions, leap year Feb 29
- Monte Carlo edge cases: Parkinson floor invariants, degenerate inputs, milestone simulation, progress callbacks
- 6 property-based tests (fast-check) for calendar round-trips and Parkinson's Law floor guarantees

## 0.18.2 — 2026-03-16

### Security

- Added Zod schema validation to Nager.Date API responses (countries and holidays) — closes the only unvalidated external data boundary
- Added runtime type guards to worker milestone/dependency payload conversion (defense-in-depth)
- Added filename sanitization for schedule exports — strips characters invalid on Windows/macOS (`/\*?"<>|:`)

## 0.18.1 — 2026-03-16

### Improvements

- Decomposed CalendarEditor.tsx (619 LOC) into HolidayLoader, HolidayList, and shell (~150 LOC each)
- Fixed memory leak in downloadFile(): wrapped URL.createObjectURL() in try-finally to ensure URL.revokeObjectURL() runs on error

## 0.18.0 — 2026-03-16

### New Features

- Schedule grid export: download the current scenario's activity schedule as a formatted XLSX or plain CSV file
- XLSX export includes professional formatting: bold headers, light fill, frozen column header row, auto-width columns, thin borders
- Summary metadata block at top of export: project/scenario name, dates, buffer, targets, dependency mode status
- Predecessor and Successor columns (dependency mode only) using activity numbers with lag notation (e.g., "1 +2d, 3")
- Export available from both the project page (inline button near grid) and the Settings page (Schedule Export section)
- XLSX/CSV toggle: active format button highlights blue to indicate last-exported format
- Disabled export hint with clickable "Run simulation" link that triggers simulation directly
- Confidence column blank in exports for Triangular and Uniform distributions (not applicable)

### Improvements

- Moved format-labels.ts from @ui/helpers to @domain/helpers (pure domain logic, fixes layer violation)
- Widened downloadFile() to accept BlobPart for binary file downloads
- XLSX column A auto-sized to fit longest summary key label

## 0.17.0 — 2026-03-16

### New Features

- Country holiday loader: select from 100+ countries to load public holidays via Nager.Date API
- Multi-country support: load holidays from multiple countries additively, with automatic name merging for shared dates (e.g., "Memorial Day / Whit Monday")
- Country labels on API holidays show origin country or "Multi" for shared dates
- Optional locale field for manual holidays (e.g., state or region name)
- Default country auto-detected from browser locale

### Improvements

- Holidays filtered to globally observed days only, visually distinguished from manual entries
- Selected country persists across sessions
- Built-in US holidays remain available as offline fallback when API is unavailable

## 0.16.2 — 2026-03-11

### Security

- Sharing operations (add member, remove member, change role) now use Firestore transactions for atomic read-verify-write, preventing TOCTOU race conditions
- ISO date validation now rejects invalid calendar dates (e.g., Feb 30, non-leap-year Feb 29) via round-trip verification
- Sharing error messages unified to prevent email enumeration (no longer reveals whether an email is registered)
- Email normalization in user profile writes ensures consistent case-insensitive lookup
- ToS write-pending localStorage flag now properly cleared on sign-out and version-mismatch paths
- Updated SECURITY.md: CSP documentation now matches actual index.html directives, added Known Limitations section
- Local firestore.rules updated to match production rules (membership-based list rule, privilege escalation prevention)

## 0.16.0 — 2026-03-11

### Features

- Added Terms of Service and Privacy Policy links in a persistent footer on every page
- Added first-run informational banner explaining optional Cloud Storage and legal agreements
- Added clickwrap consent modal that intercepts Cloud Storage sign-in — requires agreement to ToS and Privacy Policy before Firebase Auth
- Firestore ToS acceptance record written to `users/{uid}` after successful sign-in with read-before-write pattern
- Returning user version check on app load — signs out users with outdated or missing ToS acceptance
- Reference copies of Terms of Service and Privacy Policy added to /legal

## 0.15.3 — 2026-03-10

### Improvements

- Added copyright headers to all source files with GPL v3 license attribution
- LICENSE file updated with author attribution block and Section 7 additional terms for attribution and UI notice preservation

## 0.15.2 — 2026-03-09

### Bug Fixes

- Fixed project import silently failing in cloud storage mode — imported projects now sync to Firestore correctly
- Fixed real-time sync listeners not established for projects created or imported after initial cloud load
- Fixed race condition where switching storage modes during initial cloud load could overwrite local data
- User preferences now sync bidirectionally with Firestore in cloud storage mode
- Cancel pending debounced saves before project create/delete to prevent stale data overwrites
- Preferences migration now uses merge to preserve existing cloud preferences from other devices
