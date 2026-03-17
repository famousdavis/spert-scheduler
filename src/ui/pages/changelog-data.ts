// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

export interface ChangelogEntry {
  version: string;
  date: string;
  sections: {
    title: string;
    items: string[];
  }[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "0.19.0",
    date: "2026-03-17",
    sections: [
      {
        title: "New Features",
        items: [
          "Configurable work week: click interactive day pills to toggle work days on/off, supporting any combination including non-contiguous schedules (e.g., Mon/Wed/Fri)",
          "Converted work days: override non-work days as work days on a per-project basis (e.g., make specific Saturdays count as work days)",
          "Smart validation: warns when adding a date that is already a work day or falls on a holiday",
          "Amber warning when converted work day list exceeds 50 entries, suggesting work week adjustment instead",
        ],
      },
      {
        title: "Improvements",
        items: [
          "Holiday-blocked conversion notification now persists until acknowledged via \"Got it\" button (replaces auto-dismiss toast)",
          "Calendar page dynamically describes the active work week instead of hardcoded \"Monday through Friday\"",
          "All scheduling, Gantt charts, and exports respect the configured work week",
          "CalendarConfigurationError banner when work week settings produce no valid work days",
          "Zustand store selectors refactored to eliminate re-render cascades",
        ],
      },
      {
        title: "Testing",
        items: [
          "Added 85 new tests (643 → 728 total) covering work weeks, holidays, calendar layering, date boundaries, and Monte Carlo edge cases",
          "6 property-based tests (fast-check) for calendar round-trips and Parkinson's Law floor guarantees",
        ],
      },
    ],
  },
  {
    version: "0.18.2",
    date: "2026-03-16",
    sections: [
      {
        title: "Security",
        items: [
          "Added Zod schema validation to Nager.Date API responses (countries and holidays)",
          "Added runtime type guards to worker milestone/dependency payload conversion",
          "Added filename sanitization for schedule exports (strips invalid characters)",
        ],
      },
    ],
  },
  {
    version: "0.18.1",
    date: "2026-03-16",
    sections: [
      {
        title: "Improvements",
        items: [
          "Decomposed CalendarEditor.tsx (619 LOC) into HolidayLoader, HolidayList, and shell (~150 LOC each)",
          "Fixed memory leak in downloadFile(): wrapped URL.createObjectURL() in try-finally to ensure cleanup on error",
        ],
      },
    ],
  },
  {
    version: "0.18.0",
    date: "2026-03-16",
    sections: [
      {
        title: "New Features",
        items: [
          "Schedule grid export: download the current scenario's activity schedule as a formatted XLSX or plain CSV file",
          "XLSX export includes professional formatting: bold headers, light fill, frozen column header row, auto-width columns, thin borders",
          "Summary metadata block at top of export: project/scenario name, dates, buffer, targets, dependency mode status",
          "Predecessor and Successor columns (dependency mode only) using activity numbers with lag notation (e.g., \"1 +2d, 3\")",
          "Export available from both the project page (inline button near grid) and the Settings page (Schedule Export section)",
          "XLSX/CSV toggle: active format button highlights blue to indicate last-exported format",
          "Disabled export hint with clickable \"Run simulation\" link that triggers simulation directly",
          "Confidence column blank in exports for Triangular and Uniform distributions (not applicable)",
        ],
      },
      {
        title: "Improvements",
        items: [
          "Moved format-labels.ts from @ui/helpers to @domain/helpers (pure domain logic, fixes layer violation)",
          "Widened downloadFile() to accept BlobPart (string, ArrayBuffer, Uint8Array) for binary file downloads",
          "XLSX column A auto-sized to fit longest summary key label",
        ],
      },
    ],
  },
  {
    version: "0.17.0",
    date: "2026-03-16",
    sections: [
      {
        title: "New Features",
        items: [
          "Country holiday loader: select from 100+ countries to load public holidays via Nager.Date API",
          "Multi-country support: load holidays from multiple countries additively, with automatic name merging for shared dates",
          "Country labels on API holidays show origin country or \"Multi\" for shared dates",
          "Optional locale field for manual holidays (e.g., state or region name)",
          "Default country auto-detected from browser locale",
        ],
      },
      {
        title: "Improvements",
        items: [
          "Holidays filtered to globally observed days only, visually distinguished from manual entries",
          "Selected country persists across sessions",
          "Built-in US holidays remain available as offline fallback when API is unavailable",
        ],
      },
    ],
  },
  {
    version: "0.16.4",
    date: "2026-03-16",
    sections: [
      {
        title: "Improvements",
        items: [
          "Updated first-run notification to clarify browsewrap agreement for all users",
        ],
      },
    ],
  },
  {
    version: "0.16.3",
    date: "2026-03-11",
    sections: [
      {
        title: "Infrastructure",
        items: [
          "Pinned Node.js version to 22 LTS (engines field, .nvmrc) ahead of Node 20 EOL",
          "Aligned @types/node to ^22 for Node 22 LTS type definitions",
        ],
      },
    ],
  },
  {
    version: "0.16.2",
    date: "2026-03-11",
    sections: [
      {
        title: "Security",
        items: [
          "Sharing operations now use Firestore transactions for atomic read-verify-write, preventing race conditions",
          "ISO date validation rejects invalid calendar dates (e.g., Feb 30, non-leap-year Feb 29)",
          "Sharing error messages unified to prevent email enumeration",
          "Email normalization ensures consistent case-insensitive user lookup",
          "ToS localStorage flags properly cleared on sign-out",
          "SECURITY.md and firestore.rules updated to match production configuration",
        ],
      },
    ],
  },
  {
    version: "0.16.1",
    date: "2026-03-11",
    sections: [
      {
        title: "Improvements",
        items: [
          "Decomposed GanttChart.tsx into useGanttLayout hook, GanttSvgDefs, and GanttLegend components",
          "Extracted PrintGanttChart from PrintableReport.tsx into its own file",
          "DRYed simulation parameter building into buildSimulationParams helper (shared by manual run and auto-run)",
          "Extracted useAutoRunSimulation hook from ProjectPage.tsx",
          "Updated recharts, react-router-dom, Tailwind CSS, and 7 other dependencies to latest stable versions",
          "Fixed recharts 3.8.0 Tooltip formatter type compatibility",
          "Resolved all 56 ESLint errors and 20 warnings across the codebase (zero remaining)",
          "Fixed conditional React hooks in AuthButton, SharingSection, and StorageModeSection (rules-of-hooks compliance)",
          "Added underscore-prefix convention for intentionally unused variables in ESLint config",
        ],
      },
    ],
  },
  {
    version: "0.16.0",
    date: "2026-03-11",
    sections: [
      {
        title: "Features",
        items: [
          "Added Terms of Service and Privacy Policy links in a persistent footer on every page",
          "Added first-run informational banner explaining optional Cloud Storage and legal agreements",
          "Added clickwrap consent modal that intercepts Cloud Storage sign-in — requires agreement to ToS and Privacy Policy before Firebase Auth",
          "Firestore ToS acceptance record written to users/{uid} after successful sign-in with read-before-write pattern",
          "Returning user version check on app load — signs out users with outdated or missing ToS acceptance",
          "Reference copies of Terms of Service and Privacy Policy added to /legal",
        ],
      },
    ],
  },
  {
    version: "0.15.3",
    date: "2026-03-10",
    sections: [
      {
        title: "Improvements",
        items: [
          "Added copyright headers to all source files with GPL v3 license attribution",
          "LICENSE file updated with author attribution block and Section 7 additional terms for attribution and UI notice preservation",
        ],
      },
    ],
  },
  {
    version: "0.15.2",
    date: "2026-03-09",
    sections: [
      {
        title: "Bug Fixes",
        items: [
          "Fixed project import silently failing in cloud storage mode — imported projects now sync to Firestore correctly",
          "Fixed real-time sync listeners not established for projects created or imported after initial cloud load",
          "Fixed race condition where switching storage modes during initial cloud load could overwrite local data",
          "User preferences now sync bidirectionally with Firestore in cloud storage mode",
          "Cancel pending debounced saves before project create/delete to prevent stale data overwrites",
          "Preferences migration now uses merge to preserve existing cloud preferences from other devices",
        ],
      },
    ],
  },
  {
    version: "0.15.1",
    date: "2026-03-09",
    sections: [
      {
        title: "Improvements",
        items: [
          "Gantt chart toggle states (view mode, today line, critical path, project name) now persist across page refreshes and browser sessions via user preferences",
          "Last-active scenario is remembered per project — reopening a project restores the scenario you were last working on instead of always defaulting to Baseline",
        ],
      },
    ],
  },
  {
    version: "0.15.0",
    date: "2026-03-09",
    sections: [
      {
        title: "Improvements",
        items: [
          "Print Gantt chart now matches interactive chart: dependency arrows with Bezier curves, critical path highlighting (red stripe + red arrows), finish line with date, today line, tick grid with labels, project name header, milestone target dates, and contextual legend",
        ],
      },
    ],
  },
  {
    version: "0.14.5",
    date: "2026-03-09",
    sections: [
      {
        title: "Improvements",
        items: [
          "Added optional project name header toggle to Gantt chart — when enabled, displays the project name left-justified at the top of the chart (included in copy-as-image)",
        ],
      },
    ],
  },
  {
    version: "0.14.4",
    date: "2026-03-09",
    sections: [
      {
        title: "Bug Fixes",
        items: [
          "Fixed Gantt chart copy-as-image still failing on SVG elements (dependency arrows, bars, text) that inherit oklch() colors; neutralization now covers all computed CSS properties on both HTML and SVG elements, plus Tailwind v4 CSS custom properties on :root",
        ],
      },
    ],
  },
  {
    version: "0.14.3",
    date: "2026-03-09",
    sections: [
      {
        title: "Bug Fixes",
        items: [
          "Fixed Gantt chart copy-as-image failing due to unhandled oklch() colors in the legend (Tailwind CSS v4); oklch values are now converted to RGB preserving visual fidelity",
        ],
      },
    ],
  },
  {
    version: "0.14.2",
    date: "2026-03-09",
    sections: [
      {
        title: "Improvements",
        items: [
          "Added Quick Reference Guide PDF download to the About page",
          "Updated About page: default trial count corrected to 10,000, data privacy section now describes optional cloud storage",
        ],
      },
    ],
  },
  {
    version: "0.14.1",
    date: "2026-03-08",
    sections: [
      {
        title: "Bug Fixes",
        items: [
          "Fixed cloud sync replacing local projects with empty data when Firestore returns no projects (data-loss guard)",
          "Fixed storage mode switching to cloud even when migration fails — mode now stays on local if migration errors or has failures",
        ],
      },
    ],
  },
  {
    version: "0.14.0",
    date: "2026-03-08",
    sections: [
      {
        title: "New Features",
        items: [
          "Critical path visualization: toggleable red left stripe on Gantt bars and red dependency arrows for critical-path activities (dependency mode only, on by default)",
          "Today's date line: toggleable violet dashed vertical line showing today's position on the Gantt chart timeline",
          "Gantt chart legend: contextual legend below the chart explains bar colors, critical path indicator, uncertainty hatching, finish line, today line, and milestones",
        ],
      },
    ],
  },
  {
    version: "0.13.0",
    date: "2026-03-08",
    sections: [
      {
        title: "New Features",
        items: [
          "In-progress activities now respect elapsed working days: the Actual column auto-populates with elapsed days when an activity is marked \"In Progress\"",
          "Monte Carlo simulation floors each trial at elapsed + 1 for in-progress activities, producing tighter schedule buffers that reflect work already completed",
          "Clearing and blurring the Actual field for an in-progress activity auto-recalculates elapsed days from the scheduled start date",
          "Gantt chart solid/hatched bars for in-progress activities reflect the elevated duration floor",
        ],
      },
      {
        title: "Bug Fixes",
        items: [
          "Fixed milestone schedule stale data: adding/removing milestones with startsAtMilestone constraints now correctly triggers schedule recomputation",
        ],
      },
      {
        title: "Refactoring",
        items: [
          "Extracted resolveActivityDuration helper in deterministic.ts — DRYs identical 3-way branch (complete/inProgress/planned) from 4 functions",
          "Extracted mutateScenario helper in use-project-store.ts — DRYs lock-guard + undo + persist pattern from 15 store actions",
          "Decomposed SettingsPage.tsx (910 LOC) into 4 focused section components: PreferencesSection, LocalStorageSection, ExportSection, ImportSection",
          "Extracted changelog data array (670+ LOC) from ChangelogPage.tsx to changelog-data.ts",
          "Extracted activity row helpers (focusField, focusNextRow, focusPrevRow, computeElapsedDays) to activity-row-helpers.ts",
        ],
      },
      {
        title: "Quality",
        items: [
          "530 automated tests across 39 test files (up from 520/38 in v0.12.3)",
          "Added 10 sensitivity analysis tests covering empty input, sorting, variance contributions, coefficient of variation, zero-variance edge case, sdOverride, and getTopSensitiveActivities",
        ],
      },
    ],
  },
  {
    version: "0.12.3",
    date: "2026-03-07",
    sections: [
      {
        title: "Fixes",
        items: [
          "Scenario comparison now uses dependency-aware scheduling, fixing incorrect buffer and end-date values for scenarios with dependencies enabled",
        ],
      },
    ],
  },
  {
    version: "0.12.2",
    date: "2026-03-07",
    sections: [
      {
        title: "New Features",
        items: [
          "Gantt chart bars are now color-coded by activity status: blue (Planned), orange (In Progress), gray (Complete)",
          "Status colors apply to both interactive and print Gantt charts, including uncertainty hatching",
        ],
      },
      {
        title: "Fixes",
        items: [
          "Activity grid inputs are now properly disabled when a scenario is locked",
          "Status column widened so \"In Progress\" displays without truncation",
        ],
      },
    ],
  },
  {
    version: "0.12.1",
    date: "2026-03-07",
    sections: [
      {
        title: "Improvements",
        items: [
          "Project start date is now editable via a date picker in the Scenario Summary Card",
          "Milestone panel moved above Predecessor panel so the Gantt chart is visible while editing dependencies",
          "Confidence field is disabled for distributions that don't use it (Triangular, Uniform) with explanatory tooltip",
          "Milestone label clarified: \"Must finish before\" \u2192 \"Must finish before milestone\"",
          "Gantt chart finish date uses abbreviated month names to prevent truncation",
          "Gantt chart font sizes increased for better readability (activity names, date labels, milestones)",
          "Activity name truncation limit increased from 20 to 23 characters on Gantt chart",
        ],
      },
      {
        title: "Fixes",
        items: [
          "Tab navigation no longer gets stuck when Confidence field is disabled (Triangular/Uniform)",
          "Tab from Max field correctly skips disabled Confidence and reaches Distribution",
          "Removed unreachable dead code in distribution recommendation engine",
        ],
      },
    ],
  },
  {
    version: "0.12.0",
    date: "2026-03-07",
    sections: [
      {
        title: "Cloud Storage",
        items: [
          "Optional Firebase/Firestore cloud persistence on the shared spert-suite Firebase project",
          "Local-first architecture: app works identically without Firebase config; cloud is fully opt-in",
          "Storage mode toggle in Settings (Local/Cloud) with one-way migration from localStorage to Firestore",
          "Real-time sync across tabs and devices via Firestore onSnapshot listeners",
          "Simulation results stripped for cloud saves to stay within the Firestore 1 MB document limit",
        ],
      },
      {
        title: "Authentication",
        items: [
          "Google and Microsoft SSO via Firebase Authentication (popup with redirect fallback)",
          "Sign In button in the header (hidden when Firebase is not configured)",
          "User profile synced to Firestore on sign-in for email-based member lookup",
        ],
      },
      {
        title: "Project Sharing",
        items: [
          "Share projects with other users by email (owner/editor/viewer roles)",
          "Sharing panel on the project page for project owners in cloud mode",
          "Firestore security rules enforce role-based access and prevent editor privilege escalation",
        ],
      },
      {
        title: "Technical",
        items: [
          "Event bus pattern decoupling Zustand store from async Firestore writes",
          "Debounced cloud saves (500ms) with beforeunload flush for pending writes",
          "Cross-device preferences sync to Firestore",
          "Firebase SDK chunk splitting in Vite build for optimized loading",
          "511 automated tests across 38 test files",
        ],
      },
    ],
  },
  {
    version: "0.11.2",
    date: "2026-03-07",
    sections: [
      {
        title: "Security",
        items: [
          "Added Content Security Policy (CSP) meta tag to restrict script, style, image, and worker sources",
          "Added .max() length constraints to all Zod schema string fields (IDs: 64, names: 200, seeds: 100)",
          "Added .max() size constraints to all Zod schema array fields (activities: 500, deps: 2000, milestones: 100, samples: 100k, scenarios: 20, holidays: 1000)",
          "Fixed schema optionality mismatch: dependencies and milestones arrays are now required in ScenarioSchema (matching TypeScript interface and V8 migration guarantees)",
        ],
      },
    ],
  },
  {
    version: "0.11.1",
    date: "2026-03-07",
    sections: [
      {
        title: "Refactoring",
        items: [
          "Extracted milestone-service.ts from project-service.ts for focused milestone CRUD operations",
          "Extracted dependency-service.ts from project-service.ts for focused dependency CRUD operations",
          "Extracted buildMilestoneSimParams as a pure utility function in core/schedule for testability",
          "project-service.ts reduced from 418 to 290 LOC; new modules re-exported for backward compatibility",
          "ProjectPage.tsx reduced by 40+ LOC by removing inline milestone simulation parameter logic",
        ],
      },
      {
        title: "Quality",
        items: [
          "494 automated tests across 36 test files (up from 471/33 in v0.11.0)",
          "Added 5 mergeCalendars tests covering all input combinations and calendar integration",
          "Added 5 milestone-service tests covering add, remove, update, assign, and constraint operations",
          "Added 6 dependency-service tests covering add, remove, update lag, and bulk cleanup",
          "Added 7 milestone-sim-params tests including weekend/holiday snapping and calendar-aware offsets",
        ],
      },
    ],
  },
  {
    version: "0.11.0",
    date: "2026-03-07",
    sections: [
      {
        title: "Milestones",
        items: [
          "Added Milestones feature: fixed-date checkpoints with per-milestone schedule buffer and health indicators",
          "Milestone Panel UI for creating, editing, and assigning activities to milestones (requires dependency mode)",
          "Per-milestone Monte Carlo simulation: tracks finish times for each milestone's activity set independently",
          "Milestone buffer calculation with slack days and health status (green/amber/red)",
          "Gantt chart milestone markers: color-coded diamond markers with vertical dashed lines at target dates",
          "Activity 'starts at milestone' constraint: activities can be pinned to start on a milestone's target date",
          "Milestone-aware deterministic scheduling: startsAtMilestoneId constraint in dependency forward pass",
          "Scenario cloning preserves and remaps milestone IDs and activity milestone references",
        ],
      },
      {
        title: "Global Calendar",
        items: [
          "Company-wide holiday calendar that applies to all projects (e.g., US federal holidays)",
          "Per-project calendars remain for project-specific non-work days (e.g., team offsite, vendor shutdown)",
          "Global and per-project calendars are merged at schedule computation time",
          "Calendar page redesigned with two sections: Company Holidays and Project-Specific Non-Work Days",
        ],
      },
      {
        title: "Gantt Chart",
        items: [
          "Dependency arrows use cubic B\u00e9zier curves with shorter horizontal stubs for cleaner routing",
          "Overlap case arrows route with a flatter descent and connect to arrowheads from the left",
          "Milestone markers rendered as color-coded diamonds with vertical dashed lines at target dates",
        ],
      },
      {
        title: "User Interface",
        items: [
          "Collapsible Milestones and Dependencies sections matching the Gantt chart toggle pattern",
        ],
      },
      {
        title: "Schema",
        items: [
          "Schema v8: Added milestones array to scenarios, milestoneId and startsAtMilestoneId to activities",
          "Automatic migration from v7 to v8 adds empty milestones array to existing scenarios",
        ],
      },
      {
        title: "Quality",
        items: [
          "471 automated tests across 33 test files",
        ],
      },
    ],
  },
  {
    version: "0.10.1",
    date: "2026-03-07",
    sections: [
      {
        title: "Bug Fixes",
        items: [
          "Fixed Gantt chart not resizing when dependencies change \u2014 chart now defensively scans all scheduled activity end dates",
          "Fixed negative lag (lead time) having no effect \u2014 addWorkingDays ignored negative offsets, now uses subtractWorkingDays for lead time",
        ],
      },
      {
        title: "UX Improvements",
        items: [
          "Lag input field clears on focus (placeholder \"0\" instead of hard-to-select value), commits on blur or Enter",
          "Negative lag values fully supported in the UI for lead time scheduling",
        ],
      },
    ],
  },
  {
    version: "0.10.0",
    date: "2026-03-06",
    sections: [
      {
        title: "Gantt Chart",
        items: [
          "Interactive Gantt chart with dependency arrows, activity bars, and schedule buffer visualization",
          "Deterministic and With Uncertainty toggle showing per-activity uncertainty ranges",
          "Green dashed finish line at the buffered project end date with long-form date label",
          "Dependency arrows render behind activity bars for clean visual z-ordering",
          "Copy Gantt chart to clipboard as PNG image",
          "Range-adaptive time axis: daily, weekly, biweekly, or monthly ticks based on project duration",
          "Print-optimized Gantt chart in the printable report",
        ],
      },
      {
        title: "Refactoring",
        items: [
          "Extracted shared Gantt constants and utilities into gantt-constants.ts and gantt-utils.ts",
          "Eliminated code duplication between interactive and print Gantt charts",
          "GanttChart.tsx reduced from 767 to ~625 LOC via shared module extraction",
          "PrintableReport.tsx reduced from 491 to ~455 LOC by using shared utilities",
          "Added GanttChart to barrel export in charts/index.ts",
        ],
      },
      {
        title: "Bug Fixes",
        items: [
          "Fixed html2canvas crash on Tailwind CSS v4 oklch() color functions during chart copy",
          "Fixed undefined variable (fromX) in Gantt lag label positioning",
          "Fixed two prefer-const lint errors in deterministic.ts and UnifiedActivityRow.tsx",
        ],
      },
      {
        title: "Security",
        items: [
          "Resolved 3 npm audit vulnerabilities (rollup path traversal, minimatch ReDoS, ajv ReDoS)",
        ],
      },
      {
        title: "Quality",
        items: [
          "452 automated tests across 33 test files",
          "22 new unit tests for Gantt utility functions (dateToX, generateTicks, buildOrderedActivities, etc.)",
        ],
      },
    ],
  },
  {
    version: "0.9.0",
    date: "2026-03-06",
    sections: [
      {
        title: "Activity Dependencies",
        items: [
          "Opt-in dependency mode per scenario \u2014 toggle in the Scenario Summary Card",
          "Finish-to-Start (FS) dependencies with optional lag days (negative lag for lead time)",
          "Dependency Panel with add form, inline lag editing, and one-click removal",
          "Cycle prevention: the add form validates with real-time cycle detection before allowing new dependencies",
          "Duplicate prevention: cannot add the same predecessor\u2192successor relationship twice",
        ],
      },
      {
        title: "Dependency-Aware Scheduling",
        items: [
          "Topological sort (Kahn's algorithm) determines correct execution order",
          "Critical path method computes project duration accounting for parallelism",
          "Activities with no predecessors start in parallel on the project start date",
          "Deterministic schedule respects dependency constraints and lag days",
          "Monte Carlo simulation uses critical path per trial instead of flat summation",
          "Schedule buffer formula preserved: MC percentile at project target minus critical path duration",
        ],
      },
      {
        title: "Backward Compatibility",
        items: [
          "Dependencies toggle defaults to OFF \u2014 existing projects behave identically",
          "Toggling mode off preserves dependencies (not deleted), reverts to sequential schedule",
          "Schema version 7 with automatic v6\u2192v7 migration (adds dependencies array and mode flag)",
          "Dependencies survive export/import and scenario cloning (IDs remapped correctly)",
          "Deleting an activity automatically cleans up all its dependencies",
        ],
      },
      {
        title: "Settings & Printing",
        items: [
          "\"Enable Dependencies by Default\" preference in Settings page",
          "Printable report includes Dependencies section when dependency mode is on",
        ],
      },
      {
        title: "Quality",
        items: [
          "425 automated tests across 32 test files",
          "38 dependency graph algorithm tests including property-based tests with fast-check",
          "9 integration tests covering full dependency lifecycle and round-trip scenarios",
        ],
      },
    ],
  },
  {
    version: "0.8.0",
    date: "2026-03-06",
    sections: [
      {
        title: "Heuristic Estimation",
        items: [
          "Heuristic toggle auto-calculates min/max from Most Likely using configurable percentages (default 50%/200%)",
          "New activity defaults reflect heuristic when enabled (e.g., min=0.5, ML=1, max=2 for 50%/200%)",
          "Manual overrides persist \u2014 heuristic only recalculates when Most Likely value actually changes",
          "Min/max fields remain clickable for direct override even when heuristic is enabled",
          "Per-scenario heuristic toggle with global default in Settings",
          "Schema version 6 with heuristic settings (min%, max%, enabled) per scenario",
        ],
      },
      {
        title: "Keyboard Navigation",
        items: [
          "Heuristic tab order: Name \u2192 ML \u2192 Confidence \u2192 Distribution \u2192 Status \u2192 Add Activity (skips min/max)",
          "Tab from min/max fields navigates logically to adjacent columns even in heuristic mode",
          "Add Activity button shows blue focus state when tabbed to (no longer appears disabled)",
        ],
      },
      {
        title: "Confidence Dropdown",
        items: [
          "Type-ahead filter: start typing to narrow the confidence level list (e.g., 'L' filters to Low)",
          "Arrow key navigation: use Up/Down to highlight options, Enter to select",
          "Highlighted option auto-scrolls into view in the dropdown list",
        ],
      },
      {
        title: "Quality",
        items: [
          "356 automated tests across 30 test files",
        ],
      },
    ],
  },
  {
    version: "0.7.1",
    date: "2026-02-04",
    sections: [
      {
        title: "User Interface",
        items: [
          "Removed breadcrumbs from project page to reduce whitespace",
          "Replaced lock/unlock emoji with cross-platform SVG padlock icons",
        ],
      },
      {
        title: "Charts & Visualization",
        items: [
          "Histogram excludes extreme outliers beyond P99 for a clearer distribution shape",
          "Chart copy-to-clipboard replaces file download (paste directly into Word, PowerPoint, Slack, etc.)",
          "Copy button shows stateful feedback: spinner while copying, green checkmark on success, red X on error",
          "Histogram reference line labels auto-offset when Mean and Percentile values are close together",
          "Reference line labels color-coded to match their lines (red for Mean, green for Percentile)",
        ],
      },
      {
        title: "Bug Fixes",
        items: [
          "Fixed print/PDF export rendering a blank page",
          "Print report columns now match the web form order and include the duration column",
        ],
      },
    ],
  },
  {
    version: "0.7.0",
    date: "2026-02-03",
    sections: [
      {
        title: "Scenario Management",
        items: [
          "Scenario lock/unlock feature to protect schedules from accidental edits",
          "Lock indicator banner and disabled inputs when scenario is locked",
          "Lock toggle accessible from scenario tabs (hover to reveal lock icon)",
          "Lock state persisted and included in export/import",
          "Schema version 5 with locked scenario support",
        ],
      },
      {
        title: "Code Quality",
        items: [
          "Refactored lock guard pattern into reusable helper function (8 instances consolidated)",
          "Added findScenario and isLocked helper utilities for cleaner store code",
          "Expanded test coverage: 343 automated tests across 29 test files",
          "Migration edge case tests for v4\u2192v5 schema upgrade",
        ],
      },
    ],
  },
  {
    version: "0.6.2",
    date: "2026-02-03",
    sections: [
      {
        title: "Bug Fixes",
        items: [
          "Fix confidence dropdown being clipped on bottom activity rows (now renders via portal)",
        ],
      },
    ],
  },
  {
    version: "0.6.1",
    date: "2026-02-03",
    sections: [
      {
        title: "User Interface",
        items: [
          "Remove distracting up/down spinner arrows from number input fields (min, ml, max, actual)",
        ],
      },
    ],
  },
  {
    version: "0.6.0",
    date: "2026-02-03",
    sections: [
      {
        title: "Storage Optimization",
        items: [
          "User preference to control simulation data storage (saves ~90% space when disabled)",
          "Storage usage display in Settings showing current localStorage consumption",
          "Export option to include/exclude simulation results (checkbox, unchecked by default)",
          "328 automated tests across 29 test files",
        ],
      },
    ],
  },
  {
    version: "0.5.0",
    date: "2026-02-03",
    sections: [
      {
        title: "User Experience",
        items: [
          "Dark mode support with system preference detection and manual toggle",
          "Toast notification system for user feedback (success, error, info)",
          "Keyboard shortcuts help modal (press ? to view)",
          "Print-optimized project report (browser print with dedicated layout)",
          "Copy RNG seed to clipboard button",
          "Reset preferences to defaults button in Settings",
        ],
      },
      {
        title: "Activity Management",
        items: [
          "Activity row duplication with one-click copy",
          "Batch operations: bulk set confidence level, distribution type, or delete selected activities",
          "Inline distribution sparkline charts (hover to preview distribution shape)",
          "Variance tracking: shows actual vs estimated difference when activities complete",
        ],
      },
      {
        title: "Analysis & Visualization",
        items: [
          "Sensitivity analysis panel ranking activities by impact on project uncertainty",
          "Bootstrap confidence intervals on percentiles (toggle 'Show 95% CI' in percentile table)",
          "CDF comparison chart overlay when comparing 2-3 scenarios",
          "Chart export as PNG (histogram and CDF charts)",
        ],
      },
      {
        title: "Data Management",
        items: [
          "Project archival: archive/unarchive projects with filter toggle on projects page",
          "Preferences included in export/import (optional, backward compatible)",
          "Schema version 4 with archived project support",
        ],
      },
      {
        title: "Technical",
        items: [
          "html2canvas integration for chart PNG export",
          "321 automated tests across 29 test files",
        ],
      },
    ],
  },
  {
    version: "0.4.0",
    date: "2026-02-03",
    sections: [
      {
        title: "Security Hardening",
        items: [
          "React Error Boundary for graceful error recovery",
          "Calendar iteration guards prevent infinite loops with pathological data",
          "Web Worker message validation (defense-in-depth)",
          "Simulation payload validation before processing",
          "Chart data NaN/Infinity guards",
          "Explicit source map disabling in production builds",
          "SECURITY.md with deployment recommendations and security headers",
        ],
      },
    ],
  },
  {
    version: "0.3.0",
    date: "2026-02-02",
    sections: [
      {
        title: "Dependency Upgrades",
        items: [
          "React 18.3 \u2192 19.2 (latest stable)",
          "Vite 6 \u2192 7 with @vitejs/plugin-react 5",
          "TypeScript 5.7 \u2192 5.9",
          "Zod 3 \u2192 4 (schema validation)",
          "Recharts 2 \u2192 3 (charting library)",
          "Vitest 2 \u2192 4, fast-check 3 \u2192 4 (testing infrastructure)",
          "ESLint 9.18 \u2192 9.39, eslint-plugin-react-hooks 5 \u2192 7",
          "Tailwind CSS 4.0 \u2192 4.1, React Router 7.1 \u2192 7.13",
          "All remaining dependencies updated to latest stable versions",
        ],
      },
      {
        title: "Security & Quality",
        items: [
          "Zero known vulnerabilities for JFrog scan compliance",
          "All 314 automated tests passing on upgraded toolchain",
        ],
      },
    ],
  },
  {
    version: "0.2.0",
    date: "2026-02-01",
    sections: [
      {
        title: "User Preferences",
        items: [
          "Configurable defaults for trial count, distribution type, confidence level, activity target, and project target",
          "Date format preference (MM/DD/YYYY, DD/MM/YYYY, YYYY-MM-DD) applied globally across all views",
          "Auto-run simulation toggle with 500ms debounce \u2014 simulation re-runs automatically when activities or settings change",
          "Preferences stored separately in localStorage, independent of project data",
        ],
      },
      {
        title: "Data Entry & Editing",
        items: [
          "Tab navigation flows between estimate fields (Min \u2192 ML \u2192 Max) across activity rows",
          "Inline editing for project names and scenario names (double-click to rename)",
          "Activity grid summary row showing totals for Min, ML, Max, and scheduled duration",
          "Bulk select and mark-complete for multiple activities at once",
          "Confidence level dropdown with RSM descriptions for each of the 10 levels",
        ],
      },
      {
        title: "Simulation & Analysis",
        items: [
          "Confidence band visualization on histogram (shaded region between activity and project percentiles)",
          "Export simulation results as CSV with metadata, summary statistics, and percentile table",
          "Scenario comparison table for 2\u20133 scenarios with side-by-side metrics and best-value highlighting",
        ],
      },
      {
        title: "Navigation & Polish",
        items: [
          "Breadcrumb navigation on the project page",
          "Project search/filter on the projects page",
          "Undo/redo support (Ctrl+Z / Ctrl+Shift+Z) with 50-entry stack for all project mutations",
          "Validation error summary panel above the activity grid",
          "US federal holiday presets (12 holidays) with year selector in the calendar editor",
        ],
      },
      {
        title: "Refactoring & Quality",
        items: [
          "Centralized download helper and distribution/status label formatters for DRY code",
          "Memoized schedule lookup map in the activity grid for render performance",
          "Consistent date formatting across all views via the useDateFormat hook",
          "314 automated tests across 29 test files (up from 280 in v0.1.0)",
        ],
      },
    ],
  },
  {
    version: "0.1.0",
    date: "2026-01-31",
    sections: [
      {
        title: "Core Engine",
        items: [
          "SPERT three-point estimation with 10-level Ratio Scale Modifier (RSM) confidence mapping",
          "T-Normal, LogNormal, Triangular, and Uniform distribution strategies with automatic recommendation engine",
          "Deterministic schedule engine with configurable activity-level probability target (default P50)",
          "Monte Carlo simulation engine (50,000 trials default) running in a Web Worker for non-blocking UI",
          "Parkinson's Law modeling: simulated activity durations are clamped to at least the deterministic (scheduled) duration",
          "Schedule buffer calculation: project-level Monte Carlo percentile minus deterministic total",
          "Holiday-aware Monday\u2013Friday calendar with working day arithmetic",
          "Seeded PRNG (ARC4 via seedrandom) for reproducible simulation results",
        ],
      },
      {
        title: "User Interface",
        items: [
          "Unified activity grid merging input fields with computed schedule (dates, durations, source badges)",
          "Scenario summary card with Start, Finish w/o Buffer, Duration, Finish w/Buffer, and Duration w/Buffer",
          "Dual probability targets: Activity Target (deterministic schedule) and Project Target (MC confidence / buffer)",
          "Histogram, CDF chart, and percentile table for simulation results",
          "Scenario tabs with add, clone (with option to drop completed activities), and delete",
          "Activity reorder via drag-and-drop with grip handles",
          "All dates displayed in MM/DD/YYYY format (stored internally as YYYY-MM-DD)",
          "Blue-highlighted date values in the summary card for quick scanning",
        ],
      },
      {
        title: "Data & Persistence",
        items: [
          "All data stored locally in browser localStorage \u2014 no server, no analytics, no telemetry",
          "Schema-versioned persistence with sequential migration system (v1 \u2192 v2 \u2192 v3)",
          "Zod runtime validation on every load for data integrity",
          "Project and scenario CRUD with global calendar overrides",
          "JSON export/import with schema migration and conflict resolution (skip, replace, import as copy)",
        ],
      },
      {
        title: "Architecture",
        items: [
          "Strict layered architecture: Domain \u2192 Core \u2192 Infrastructure \u2192 Application \u2192 UI",
          "Core scheduling math is framework-agnostic (zero React/DOM dependencies)",
          "TypeScript strict mode with zero type errors",
          "Production build under 42 KB gzipped (excluding charts library)",
        ],
      },
    ],
  },
];
