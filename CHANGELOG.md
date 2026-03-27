# Changelog

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
