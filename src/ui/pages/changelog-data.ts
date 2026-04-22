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
    version: "0.38.4",
    date: "2026-04-21",
    sections: [
      {
        title: "Internal",
        items: [
          "Flattened nested-function depth in the Zustand project and notification stores (PR 2 of the three-PR lint-debt paydown plan). All 10 sonarjs/no-nested-functions errors resolved. Lint count: 89 → 79 errors (0 warnings).",
          "Added four module-level helpers to use-project-store.ts: updateProjectInList(projects, projectId, transform), updateScenarioInList(projects, projectId, scenarioId, mutation), patchActivityInList(activities, activityId, patch), and filterOut(arr, value). Each is a plain function that takes its callback as a parameter, so inlining them at call sites no longer counts as a nested function definition.",
          "Rewrote 9 store actions (addActivity, duplicateActivity, updateActivityChecklist, updateActivityDeliverables, updateActivityNotes, updateScenarioNotes, setSimulationResults, removeConvertedWorkDay, toggleScenarioLock) to use these helpers. Each action went from 5 nested arrow levels to 3.",
          "use-notification-store.ts: extracted the filter predicate into a module-level removeFromList(notifications, id) helper shared by both addNotification's auto-dismiss setTimeout and the explicit removeNotification action.",
          "No behavior change. All 1218 tests pass; undo/redo, activity mutations, and notification dismissal are observationally identical.",
        ],
      },
    ],
  },
  {
    version: "0.38.3",
    date: "2026-04-21",
    sections: [
      {
        title: "Internal",
        items: [
          "Eliminated all four ESLint warnings and three errors from the pre-existing lint baseline (PR 1 of a three-PR lint-debt paydown plan). Lint count: 96 → 89 problems (92 errors + 4 warnings → 89 errors + 0 warnings). Two of the warnings were real React correctness signals, not stylistic.",
          "ScenarioSummaryCard.tsx: eliminated double-render on heuristic %-input prop changes. The two useState + useEffect pairs that synced localMinPct/localMaxPct to settings.heuristic{Min,Max}Percent triggered react-hooks/set-state-in-effect warnings and caused a second render after every scenario switch or undo/redo. Replaced with React's documented 'adjust state during render' pattern (useState for previous prop + if (prev !== current) setPrev(current); setLocal(...)), which commits a single render per prop change.",
          "SimulationPanel.tsx: restored React Compiler optimization of the targetLookup useMemo. The manual dep list listed simulationResults?.samples (a narrower shape than the React Compiler's inferred simulationResults), which tripped react-hooks/preserve-manual-memoization and prevented compiler-driven optimization. Broadened the dep to the full simulationResults object; the memoized body already null-guards simulationResults?.samples?.length. Also extracted the inline color ternary into a healthColor() helper and pre-computed the ' by {dateLabel}' suffix to eliminate the adjacent SonarJS no-nested-conditional and no-nested-template-literals errors.",
          "ThemeToggleButton.tsx: restored fast-refresh HMR. The file exported a non-component nextTheme helper alongside the component, which tripped react-refresh/only-export-components and disabled HMR for the file. Dropped the export keyword; nextTheme is used only internally.",
          "eslint.config.js: added coverage/ to the ignores list. The auto-generated Istanbul coverage output (coverage/block-navigation.js) was surfacing an Unused eslint-disable directive warning on every lint run.",
        ],
      },
    ],
  },
  {
    version: "0.38.2",
    date: "2026-04-21",
    sections: [
      {
        title: "Fixed",
        items: [
          "Printed PDF report no longer shows a misleading Confidence label for Triangular and Uniform activities. The Statistical PERT Ratio Scale Modifier (RSM) only drives the proxy standard deviation for Normal and LogNormal distributions; Triangular and Uniform activities ignore the stored confidenceLevel. The interactive grid already greys the cell out, and the XLSX/CSV schedule exports already write an empty cell for these distributions, but the printed report rendered the confidence label unconditionally for every row. The print path now mirrors the same distributionType guard used by the export pipeline, falling back to an em-dash (—) — the standard N/A sentinel elsewhere in the printed report — for non-SPERT distributions.",
        ],
      },
    ],
  },
  {
    version: "0.38.1",
    date: "2026-04-20",
    sections: [
      {
        title: "Fixed",
        items: [
          "Scenario tab row now scrolls horizontally with a standard mouse wheel on Windows. Chromium-family browsers do not translate vertical wheel events to horizontal scroll on containers whose only overflow axis is X, so users with many scenarios had to use Shift+Wheel or click a partially-visible tab. A scoped native wheel listener now redirects deltaY into scrollLeft when the container overflows and the event has no horizontal component. Trackpad two-finger horizontal gestures (which carry deltaX) are passed through unchanged. Firefox's line-mode deltas are converted to pixels.",
        ],
      },
    ],
  },
  {
    version: "0.38.0",
    date: "2026-04-19",
    sections: [
      {
        title: "Security",
        items: [
          "Sign-out now fully wipes per-user session data. Previously, after signing out of Cloud Storage, the prior user's projects, preferences, and last-active scenario map remained in both the in-memory store and localStorage. On a shared browser, the next user could see the prior user's data and — in rare cases — inadvertently upload it to their own Firestore account. Sign-out now cancels pending Firestore writes, zeros the Zustand project store, and clears spert:project:*, spert:project-index, spert:user-preferences, and spert-scheduler:active-scenarios. Storage mode (spert:storage-mode), first-run banner state, and the Nager country cache are intentionally preserved for continuity.",
          "Sign-out during an edit no longer races revoked credentials. The Firestore driver now cancels queued 500 ms-debounced writes before firebaseSignOut, so pending writes cannot fire against revoked credentials. beforeunload still flushes — tab-close semantics are unchanged.",
          "ToS-mismatch forced sign-out now routes through the same cleanup as user-initiated sign-out, so both paths cannot drift.",
          "ToS acceptance write failures no longer strand the user. When the Firestore write to users/{uid} fails, LS_TOS_WRITE_PENDING is now left set and LS_TOS_ACCEPTED_VERSION is unset, so the next sign-in retries and creates the missing record. Previously the local flags were finalized unconditionally, which could leave the user marked accepted locally but missing from Firestore — causing cross-app re-prompts.",
        ],
      },
      {
        title: "Added",
        items: [
          "Auth chip now has a 'signed-in + local' state. When you are signed in but using Local Storage, the chip shows your avatar + lock icon and opens a popover with two actions: 'Switch to Cloud Storage' (navigates to Settings — does not auto-switch) and 'Sign Out'. Previously the chip rendered 'Local only / Sign in' to already-signed-in users, with no way to sign out from the header.",
          "Cloud → Local mode switch now prompts. When toggling off Cloud Storage with projects present, a confirmation modal offers 'Keep local copy' (default) or 'Discard'. Discard clears spert:project:*, spert:project-index, spert-scheduler:active-scenarios, and zeros the in-memory store. Preferences are preserved — you're still the same person.",
          "OAuth popup errors are now differentiated. Closing the popup or double-clicking Sign In is a silent no-op — the page no longer redirects away. Popup-blocker browsers still fall back to a redirect and now show an explanatory toast before navigating. Other errors surface a 'Sign-in failed' toast.",
          "After a successful sign-in from the header chip's modal, the modal closes and the app navigates to /settings so you can immediately toggle Cloud Storage with one click. Previously the modal stayed open with no guidance.",
          "Shared getFirstName() helper for rendering user names with Microsoft 'Last, First' reversal. Used by the auth chip (both signed-in states) and the SharingSection member list — no more duplicated comma-parsing logic.",
        ],
      },
    ],
  },
  {
    version: "0.37.4",
    date: "2026-04-17",
    sections: [
      {
        title: "Added",
        items: [
          "Gantt chart now auto-draws finish-to-start arrows between adjacent activities when Dependency Mode is OFF. This makes the implicit sequential ordering visually explicit. The existing Arrows toolbar checkbox now also appears in non-dependency mode so you can hide the auto-drawn arrows if they aren't useful. Auto-drawn arrows are non-interactive and do not carry critical-path styling — in sequential mode every activity is trivially on the critical path, so the stripe would add no information.",
        ],
      },
    ],
  },
  {
    version: "0.37.3",
    date: "2026-04-16",
    sections: [
      {
        title: "Fixed",
        items: [
          "Header title and navigation tabs (Projects, Calendar, Settings, About) now use an inline-flex layout, working around a Chromium 147 rendering regression that caused the pointer-cursor affordance to disappear (and in Brave, clicks to miss the center of nav tabs). The workaround is harmless on unaffected browsers.",
        ],
      },
    ],
  },
  {
    version: "0.37.2",
    date: "2026-04-16",
    sections: [
      {
        title: "Fixed",
        items: [
          "Header buttons (theme toggle, cloud auth chip) now show the pointing-finger cursor on hover. This restores the click affordance that was lost with the Tailwind v4 upgrade, which removed the default `cursor: pointer` on `<button>` elements.",
          "Header title 'SPERT® Scheduler' is now fully clickable across its entire width at any viewport size — previously the title could wrap on narrow viewports, leaving the second line outside the hit target.",
          "Navigation links (Projects, Calendar, Settings, About) now explicitly declare the pointing-finger cursor and no-wrap behavior, so the click target stays consistent across browsers including Brave.",
        ],
      },
    ],
  },
  {
    version: "0.37.1",
    date: "2026-04-16",
    sections: [
      {
        title: "Fixed",
        items: [
          "Scenario tab row: hid the horizontal scrollbar that was rendering as a thick gray bar over the tab underline. Scrolling still works via drag, wheel, and keyboard; overflow is now signaled by partially-visible tabs at the edge.",
        ],
      },
    ],
  },
  {
    version: "0.37.0",
    date: "2026-04-16",
    sections: [
      {
        title: "Added",
        items: [
          "Scenario tabs now scroll horizontally when there are more scenarios than fit. The Compare button stays pinned on the right edge and is always visible.",
        ],
      },
      {
        title: "Changed",
        items: [
          "Cloning a scenario now inserts the new clone immediately to the left of the source scenario, instead of appending to the end. Cloning from the '+' Add dialog follows the same placement rule. The clone becomes the active scenario and is auto-scrolled into view if off-screen.",
        ],
      },
    ],
  },
  {
    version: "0.36.4",
    date: "2026-04-10",
    sections: [
      {
        title: "Improved",
        items: [
          "Sign-in modal buttons now show Google and Microsoft brand icons.",
        ],
      },
    ],
  },
  {
    version: "0.36.3",
    date: "2026-04-10",
    sections: [
      {
        title: "Added",
        items: [
          "Sign-in modal when clicking the auth chip. Opens a focused dialog with Google and Microsoft sign-in buttons instead of navigating to the Settings page.",
        ],
      },
      {
        title: "Fixed",
        items: [
          "Horizontal layout shift caused by the scrollbar appearing and disappearing when navigating between pages of different heights.",
        ],
      },
    ],
  },
  {
    version: "0.36.2",
    date: "2026-04-09",
    sections: [
      {
        title: "Changed",
        items: [
          "Auth chip in the header is now a single clickable pill. When signed in to cloud storage, clicking anywhere on the chip opens a small account menu showing your name and email, with a Sign Out button. Dismiss with Escape or by clicking outside. When signed out, clicking the chip still opens the sign-in flow.",
        ],
      },
    ],
  },
  {
    version: "0.36.1",
    date: "2026-04-08",
    sections: [
      {
        title: "Fixed",
        items: [
          "Dependency edit modal: negative lag (lead time) values like \u201C-5\u201D can now be entered reliably. The Lag Days field auto-selects its current value on focus and accepts the minus sign as you type. Out-of-range values are clamped to \u00B1365 days on save.",
        ],
      },
    ],
  },
  {
    version: "0.36.0",
    date: "2026-04-08",
    sections: [
      {
        title: "Added",
        items: [
          "Theme toggle button in the header (between About and the cloud storage chip). Click to cycle Light \u2192 Dark \u2192 System; the icon reflects the current state.",
          "Per-project tile color: pick one of 8 muted accent colors (Slate, Sage, Sky, Lavender, Rose, Amber, Teal, Clay) to color-code projects on the Projects page \u2014 useful for grouping projects that belong to the same program. The color shows as a 4px left border strip on the tile.",
          "Import Projects button on the Projects page header (next to Export All Projects). Matches the header layout used by other SPERT Suite apps.",
        ],
      },
    ],
  },
  {
    version: "0.35.0",
    date: "2026-04-05",
    sections: [
      {
        title: "Legal",
        items: [
          "Updated Terms of Service and Privacy Policy to v04-05-2026.",
          "Added SPERT\u00AE AHP to list of covered apps.",
          "Updated effective date to April 5, 2026.",
        ],
      },
    ],
  },
  {
    version: "0.34.9",
    date: "2026-04-05",
    sections: [
      {
        title: "Improved",
        items: [
          "Header auth chip: replaced the text-button sign-in and avatar dropdown with the SPERT Suite split-pill design. Signed-in shows avatar + first name + cloud icon; local/signed-out shows lock + \"Local only\" + \"Sign in\".",
        ],
      },
    ],
  },
  {
    version: "0.34.8",
    date: "2026-04-03",
    sections: [
      {
        title: "Improved",
        items: [
          "Activity grid: the delete (×) button is now gray at rest and turns red only on hover, reducing visual clutter while preserving discoverability.",
        ],
      },
    ],
  },
  {
    version: "0.34.7",
    date: "2026-04-02",
    sections: [
      {
        title: "Added",
        items: [
          "Projects page: new \"Export All Projects\" button exports all active projects in one click (same JSON format as the Settings export, simulation results excluded).",
          "localStorage warning banner: an amber caution banner now appears on every page when your data is stored locally, reminding you to export at the end of each session. Dismiss with \"Got it\" for the session.",
          "Settings → Notifications: new toggle to permanently suppress the localStorage warning banner.",
        ],
      },
      {
        title: "Improved",
        items: [
          "Settings page: \"Schedule Export\" section renamed to \"Export Schedule\" for consistency with action-first labeling.",
        ],
      },
    ],
  },
  {
    version: "0.34.6",
    date: "2026-04-02",
    sections: [
      {
        title: "Improved",
        items: [
          "Gantt: finish date bar labels are now right-aligned inside the bar, anchoring the date visually to the bar's right (finish) edge instead of floating at center.",
        ],
      },
    ],
  },
  {
    version: "0.34.5",
    date: "2026-04-01",
    sections: [
      {
        title: "Security",
        items: [
          "XLSX export now guards against Excel formula injection (cells starting with =, +, -, @, tab, or carriage return are prefixed), matching the existing CSV export protection.",
          "CSV/clipboard import pipeline: individual cell values are now capped at 1,000 characters before processing, and error messages truncate echoed user values to 80 characters.",
          "Import parsing stops early once the 500-activity limit is reached, avoiding unnecessary processing of oversized files.",
        ],
      },
      {
        title: "Fixed",
        items: [
          "Min, Most Likely, and Max summary totals are now rounded to the nearest whole number in the activity grid and schedule exports (XLSX and CSV).",
        ],
      },
    ],
  },
  {
    version: "0.34.4",
    date: "2026-04-01",
    sections: [
      {
        title: "Maintenance",
        items: [
          "Internal refactoring: extracted useScheduleExport hook, ActivityEditModal sub-components, and SonarJS remediation helpers for improved maintainability.",
        ],
      },
    ],
  },
  {
    version: "0.34.3",
    date: "2026-04-01",
    sections: [
      {
        title: "Improved",
        items: [
          "Activity grid: hover over any row to reveal a pencil icon in the name cell that opens the Edit Activity modal directly.",
          "Min/ML/Max estimate columns narrowed (42px → 38px) and Status/Actual columns trimmed for a more compact layout.",
          "Estimate values (Min/ML/Max) are displayed as integers in the grid; decimals are accepted during entry and rounded on save.",
        ],
      },
    ],
  },
  {
    version: "0.34.2",
    date: "2026-04-01",
    sections: [
      {
        title: "Added",
        items: [
          "Activities with notes now show a small violet indicator beneath the activity name in the grid (alongside the existing task and deliverable bars), and a violet dot on the Notes section header in the Edit Activity modal.",
        ],
      },
    ],
  },
  {
    version: "0.34.1",
    date: "2026-04-01",
    sections: [
      {
        title: "Changed",
        items: [
          "Any scenario can now be deleted. The last remaining scenario is protected from deletion instead of the first (Baseline) scenario.",
        ],
      },
    ],
  },
  {
    version: "0.34.0",
    date: "2026-03-31",
    sections: [
      {
        title: "Added",
        items: [
          "CDF date probability lookup: enter a target finish date above the Cumulative Distribution chart to see the probability of finishing by that date, with a RAG-colored reference line (green/amber/red based on Schedule Health thresholds).",
          "Scheduled Start date now displayed in the Edit Activity modal alongside Scheduled Finish and Duration.",
        ],
      },
      {
        title: "Fixed",
        items: [
          "CDF chart x-axis changed from categorical to numeric scale, producing a true CDF curve shape instead of a straight line.",
          "CDF chart resolution increased from 500 to 1,000 downsampled points for better tail accuracy.",
          "Edit Activity modal no longer falsely reports unsaved changes when opened and closed without modifications.",
        ],
      },
      {
        title: "Changed",
        items: [
          "Edit Activity modal: duration labels abbreviated to \"Sched. Dur.\" and \"Actual Dur.\" for better layout at Complete status.",
        ],
      },
    ],
  },
  {
    version: "0.33.8",
    date: "2026-03-31",
    sections: [
      {
        title: "Maintenance",
        items: [
          "Updated Terms of Service and Privacy Policy to v03-31-2026.",
          "Updated canonical legal document URLs to spertsuite.com.",
          "Updated consent UI text to SPERT® Suite branding.",
        ],
      },
    ],
  },
  {
    version: "0.33.7",
    date: "2026-03-29",
    sections: [
      {
        title: "Fixed",
        items: [
          "CDF chart probability capped at 99%. The cumulative distribution tooltip previously displayed \"Probability: 100%\" at the rightmost data point, implying certainty that the project cannot exceed the maximum simulated duration. Monte Carlo samples are finite — the true distribution tail always extends beyond the observed maximum.",
        ],
      },
    ],
  },
  {
    version: "0.33.6",
    date: "2026-03-29",
    sections: [
      {
        title: "Fixed",
        items: [
          "Web Worker trial count validation ceiling raised from 50,000 to 100,000 to match the Zod schema and UI options introduced in v0.33.5. Previously, selecting 100,000 trials caused a worker validation error.",
        ],
      },
    ],
  },
  {
    version: "0.33.5",
    date: "2026-03-29",
    sections: [
      {
        title: "Added",
        items: [
          "Monte Carlo simulation trial count option: 100,000 trials now available in both the scenario settings and default preferences dropdowns. Useful for audit-grade precision where reduced variance is needed.",
        ],
      },
    ],
  },
  {
    version: "0.33.4",
    date: "2026-03-29",
    sections: [
      {
        title: "Added",
        items: [
          "Gantt chart row guide lines: faint horizontal lines every 3 rows to help visually track activities to their bars. On by default; toggle in the Gantt appearance panel under Shading.",
        ],
      },
    ],
  },
  {
    version: "0.33.3",
    date: "2026-03-28",
    sections: [
      {
        title: "Changed",
        items: [
          "Gantt chart color presets expanded from 4 to 10: Classic, Professional, Colorful, Grayscale, Contrast, Forest, Ocean, Sunset, Lavender, Earth.",
          "Retired Monochrome and Warm presets; existing projects using them fall back to Classic.",
          "About page: removed \"IT\" qualifier from project manager audience description.",
          "About page: License section now links to the GitHub LICENSE file and discloses the Section 7(b) non-permissive attribution requirements.",
        ],
      },
    ],
  },
  {
    version: "0.33.2",
    date: "2026-03-28",
    sections: [
      {
        title: "Enhanced",
        items: [
          "Cumulative Distribution Function (CDF) chart tooltip now shows projected finish date alongside duration and probability when hovering over the curve, making it easy to answer \"what's the probability my project finishes by this date?\"",
          "Scenario comparison CDF chart tooltip also includes projected finish dates.",
        ],
      },
    ],
  },
  {
    version: "0.33.1",
    date: "2026-03-28",
    sections: [
      {
        title: "Changed",
        items: [
          "Default distribution type changed from Normal (T-Normal) to Triangular, aligning with the recommended distribution for the updated heuristic defaults.",
          "Default heuristic minimum changed from 50% to 75%, bringing congruence with Triangular distribution recommendations.",
          "Footer now includes a \"License\" link to the project's GNU GPL v3.0 LICENSE file on GitHub (with Section 7(b) non-permissive additional terms).",
        ],
      },
    ],
  },
  {
    version: "0.33.0",
    date: "2026-03-28",
    sections: [
      {
        title: "Chore — Clean Code Audit",
        items: [
          "Added eslint-plugin-sonarjs (recommended ruleset) and @vitest/coverage-v8 as dev dependencies.",
          "Reduced ESLint findings from 144 to 98 (46 eliminated, 12 of 15 rules fully resolved).",
          "Fixed: removeById() delegates to remove(), nested template literals extracted to named consts, useEffect dependency array corrected, dead test code removed.",
          "Suppressed 33 intentional or false-positive findings across 8 rules with eslint-disable + NOSONAR comments.",
          "Deleted macOS copy artifact: src/core/schedule/target-rag 2.ts.",
          "Deferred structural complexity findings (no-nested-conditional, cognitive-complexity, no-nested-functions) for future refactor passes.",
        ],
      },
    ],
  },
  {
    version: "0.32.3",
    date: "2026-03-28",
    sections: [
      {
        title: "Bug Fixes",
        items: [
          "Gantt chart: reduced Today proximity suppression threshold from 60px to 44px. On compressed fit-to-window timelines (1,500+ day projects), the previous threshold suppressed quarterly ticks that had adequate visual clearance, leaving gaps in the timeline header (e.g. Q2 → Q4 with no Q3 label).",
        ],
      },
    ],
  },
  {
    version: "0.32.2",
    date: "2026-03-27",
    sections: [
      {
        title: "Security",
        items: [
          "Activity Edit Modal: added date format validation guard on Actual Finish Date blur handler to prevent malformed strings from propagating NaN through calendar math.",
          "Activity Edit Modal: actual duration input now clamps to positive integers (Math.max(1, Math.floor)) at both the handler and save layers, preventing negative, zero, or NaN values from reaching the store.",
          "Activity Edit Modal: replaced magic number 10000 with exported MAX_CALENDAR_ITERATIONS constant for non-work-day snapping loop guard.",
        ],
      },
      {
        title: "Internal",
        items: [
          "Exported MAX_CALENDAR_ITERATIONS from @core/calendar/calendar for reuse in UI handlers.",
        ],
      },
    ],
  },
  {
    version: "0.32.1",
    date: "2026-03-27",
    sections: [
      {
        title: "Refactoring",
        items: [
          "ActivityEditModal: extracted ScheduleContextRow local component and buildFieldUpdates() sub-function for cleaner save/dirty-check logic.",
          "GanttChart: extracted GanttToolbar local component (~108 lines) from the main render body.",
          "gantt-utils: consolidated monthTickLabel, quarterlyTickLabel, semiannualTickLabel via shared tickLabelWithYear helper.",
          "gantt-utils: completed toISO deprecation — all internal uses replaced with formatDateISO from @core/calendar/calendar.",
          "gantt-utils: removed buildOrderedActivities no-op function and its 4 tests.",
          "activity-row-helpers: documented computeElapsedDays dual-type calendar parameter.",
        ],
      },
      {
        title: "Tests",
        items: [
          "Added 5 new tests: semiannualTickLabel edge case, countQuarterlyTicks/countSemiannualTicks same-day boundaries, generateTicks forced monthly, computeWeekendShadingRects trailing span closure.",
        ],
      },
    ],
  },
  {
    version: "0.32.0",
    date: "2026-03-27",
    sections: [
      {
        title: "New Features",
        items: [
          "Gantt chart Fit to Window toggle: compresses the full project timeline into the visible container width with no horizontal scrolling. Enables the copy-image button to capture the complete chart for presentations.",
          "Gantt chart Timeline Labels control (Sparse / Normal / Dense): directly selects tick granularity for multi-year projects. Dense = monthly, Normal = quarterly (Q1-Q4), Sparse = semi-annual (H1/H2). Works with or without Fit to Window.",
        ],
      },
      {
        title: "Enhancements",
        items: [
          "Quarterly and semi-annual tick labels show year on first tick and year-change boundaries (e.g. Q2 '26, Q3, Q4, Q1 '27).",
          "Year-carrying tick labels render in bold for easy year-break identification.",
          "Today line proximity suppression prevents tick labels from crowding the Today date label.",
          "Print chart parity for all tick density, bold year labels, and collision suppression changes.",
        ],
      },
      {
        title: "Internal",
        items: [
          "Schema version 18 → 19 (migration adds fitToWindow to Gantt appearance settings).",
        ],
      },
    ],
  },
  {
    version: "0.31.0",
    date: "2026-03-27",
    sections: [
      {
        title: "New Features",
        items: [
          "Activity Edit Modal: bidirectional Actual Finish Date field for completed activities. Enter a finish date to auto-calculate duration, or enter a duration to auto-calculate the finish date. Uses the project work calendar for accurate working-day math.",
        ],
      },
      {
        title: "Enhancements",
        items: [
          "Activity Edit Modal: Actual Duration field now editable for in-progress activities, matching the activity grid behavior. Shows 'Elapsed' placeholder when empty; falls back to computed elapsed working days on save if cleared.",
          "Estimates section in Activity Edit Modal now defaults to collapsed, reducing visual noise on modal open.",
        ],
      },
    ],
  },
  {
    version: "0.30.5",
    date: "2026-03-27",
    sections: [
      {
        title: "Enhancements",
        items: [
          "Dependency type dropdowns and labels now show full names (Finish-to-Start, Start-to-Start, Finish-to-Finish) instead of two-letter abbreviations for improved clarity.",
        ],
      },
      {
        title: "Refactoring",
        items: [
          "Centralized dependency type labels into dependencyLabel() formatter in format-labels.ts, replacing the local constant in DependencyEditModal.",
        ],
      },
    ],
  },
  {
    version: "0.30.4",
    date: "2026-03-27",
    sections: [
      {
        title: "Enhancements",
        items: [
          "Gantt bar label font size now scales with the activity font size selection (Small/Normal/Large/XL). Small is the minimum — larger settings increase readability.",
          "Bar labels (dates or durations) are hidden when they don't fit inside the bar, preventing clipped or overlapping text.",
          "Bar label font is automatically capped to fit within the bar height when compact row density is combined with large/XL font sizes.",
        ],
      },
    ],
  },
  {
    version: "0.30.3",
    date: "2026-03-26",
    sections: [
      {
        title: "New Features",
        items: [
          "Drag-and-drop scenario tab reordering: grab the grip handle on any scenario tab to drag it to a new position.",
        ],
      },
    ],
  },
  {
    version: "0.30.2",
    date: "2026-03-26",
    sections: [
      {
        title: "Bug Fixes",
        items: [
          "Fixed CDF comparison chart legend overlap: scenario names were clipped by the x-axis label. Consolidated axis label into caption below the chart.",
        ],
      },
      {
        title: "Testing",
        items: [
          "Added 67 mutation-testing gap-closure tests across constraint-utils, dependency-graph, and deterministic scheduler modules.",
          "Boundary equality tests for all 6 constraint types (MSO, MFO, SNET, FNET, SNLT, FNLT) in forward pass, backward pass, and conflict detection.",
          "SS/FF dependency backward pass tests: late dates, total float, and lag accounting.",
          "SS/FF forward pass tests: negative lag clamping to project start, positive lag offsets.",
          "SS/FF dependency violation detection coverage.",
          "Working-day skip loop tests: Saturday, Sunday, and holiday start date advancement.",
          "actualDuration guard tests: complete and inProgress activities with/without actualDuration.",
          "Conflict result shape tests: undefined vs array for constraintConflicts and dependencyConflicts.",
          "Critical path tests: maxPredEF correctness with hard MFO constraints, empty graph, milestone floor, cycle path structure.",
          "Invalid dependency filtering: non-existent IDs, self-loops, validateDependencies error types.",
        ],
      },
    ],
  },
  {
    version: "0.30.1",
    date: "2026-03-26",
    sections: [
      {
        title: "Bug Fixes",
        items: [
          "Fixed activity name overflow at larger font sizes: character limits now scale inversely with font size.",
          "Fixed small font size mapping (was 10px, now 11px as designed).",
          "Fixed comfortable row density dimensions (rowHeight 42→44px, printRowHeight 24→25px).",
          "Fixed print Gantt dependency lag label using hardcoded font size instead of scaled value.",
        ],
      },
      {
        title: "Refactoring",
        items: [
          "Extracted weekend shading computation to shared computeWeekendShadingRects() pure function in gantt-utils.ts.",
        ],
      },
    ],
  },
  {
    version: "0.30.0",
    date: "2026-03-26",
    sections: [
      {
        title: "New Features",
        items: [
          "Per-project Gantt chart appearance controls: name column width, font size, row density, and bar label format.",
          "Color preset system with 4 built-in themes (Classic, Monochrome, Ocean, Warm) that work in both light and dark mode.",
          "Custom bar colors: override planned and in-progress bar colors with any color via swatch picker or color input.",
          "Weekend/non-work day shading: optional gray bands on the Gantt chart highlighting non-working days.",
          "Appearance settings travel with the project on export/import.",
          "Print Gantt chart mirrors all appearance settings (layout, colors, font scaling, weekend shading).",
          "Palette icon toggle button in the Gantt toolbar to show/hide the appearance panel.",
        ],
      },
      {
        title: "Technical",
        items: [
          "New resolveGanttAppearance() pure function maps settings to concrete pixel values and colors.",
          "Hatch patterns now use strokeOpacity approach with bar colors instead of separate named hatch colors.",
          "dateToX() no longer has a default leftMargin parameter — all call sites pass it explicitly.",
          "useGanttLayout hook parameterized with leftMargin, rowHeight, and barHeight.",
        ],
      },
      {
        title: "Schema",
        items: [
          "Schema v17 → v18: Added optional ganttAppearance field to Project.",
        ],
      },
    ],
  },
  {
    version: "0.29.3",
    date: "2026-03-26",
    sections: [
      {
        title: "New Features",
        items: [
          "\"Show Activity IDs\" toggle now persists per project instead of resetting on page navigation.",
          "Print report now includes Finish Target date in the Project Summary section.",
          "Print report header shows the app version for traceability.",
          "Gantt timeline now shows monthly tick marks for projects spanning 91+ days, with year shown on first tick and at year boundaries.",
          "Gantt \"Today\" line now shows the formatted date beneath the label, matching milestone label style.",
          "Month gridlines are always visible even when labels are suppressed by collision with Today/Finish/Milestone markers.",
          "\"Show Finish Target Date\" checkbox shows a tooltip explaining why it's disabled when no target date is set.",
        ],
      },
      {
        title: "UI Polish",
        items: [
          "Print report tasks/deliverables tables redesigned with activity header rows and indented items for clearer visual hierarchy.",
          "ToS/Privacy notification banner no longer appears on printed PDF reports.",
          "Fixed Chrome print quirk where fixed-position elements ignored display: none.",
        ],
      },
      {
        title: "Schema",
        items: [
          "Schema v16 → v17: Added optional showActivityIds field to Project.",
        ],
      },
    ],
  },
  {
    version: "0.29.2",
    date: "2026-03-25",
    sections: [
      {
        title: "Refactor",
        items: [
          "Extracted shared renderItemTable helper in PrintableReport, eliminating duplicate Activity Tasks / Activity Deliverables table rendering.",
          "Extracted formatItemColumn helper in schedule-export-service, deduplicating tasks/deliverables column logic in buildGridRows.",
          "Extracted ActivityProgressBars named component in UnifiedActivityRow, replacing the inline IIFE with a clearer sub-component.",
        ],
      },
      {
        title: "UI Polish",
        items: [
          "Deliverables progress bar color changed from teal to indigo for better visual distinction from the green completed-tasks bar.",
          "Deliverables checkbox color updated to indigo to match progress bar.",
        ],
      },
      {
        title: "Security",
        items: [
          "Patched 3 high-severity transitive dependency vulnerabilities (undici, picomatch, flatted).",
        ],
      },
    ],
  },
  {
    version: "0.29.1",
    date: "2026-03-25",
    sections: [
      {
        title: "UI Polish",
        items: [
          "Activity edit modal section counts (Tasks, Deliverables) now render in a smaller, lighter font for softer visual hierarchy.",
          "Blue dot indicators added to Scheduling Constraint and Dependencies section headers when content is present, matching the existing Notes indicator.",
          "Unsaved changes guard on activity edit modal: clicking outside with pending changes prompts to save. The explicit Cancel button always discards without prompting.",
        ],
      },
    ],
  },
  {
    version: "0.29.0",
    date: "2026-03-25",
    sections: [
      {
        title: "New Features",
        items: [
          "Activity Deliverables — track deliverables (documents, artifacts, sign-offs) per activity with a checklist-style UI. Appears in activity edit modal, schedule export, and print report.",
          "Activity Notes — free-text notes field per activity (up to 2,000 characters) in the activity edit modal. Blue dot indicator when notes are present.",
          "Scenario Notes — free-text notes per scenario via memo icon in the summary card. Blue dot indicator when non-empty.",
          "Finish Target placeholder styling — lighter font weight when no date is set for clearer visual distinction.",
        ],
      },
      {
        title: "Progress Bars",
        items: [
          "Activity row progress bars now support deliverables: teal bar for in-progress, green when all delivered.",
          "When both tasks and deliverables are present, two half-width bars display side by side.",
        ],
      },
      {
        title: "Export & Print",
        items: [
          "Schedule export (XLSX/CSV) includes two new columns: Deliverables and Deliverable Details.",
          "Print report includes an Activity Deliverables table.",
        ],
      },
      {
        title: "Schema",
        items: [
          "Schema version bumped from 15 to 16 (passthrough migration).",
          "Checklist item limit raised from 20 to 50 per activity.",
        ],
      },
    ],
  },
  {
    version: "0.28.2",
    date: "2026-03-25",
    sections: [
      {
        title: "Security",
        items: [
          "CSV formula injection guard expanded to cover tab and carriage return prefix characters per OWASP guidance.",
          "Added dedicated test coverage for CSV formula injection guard across all export paths.",
          "Suppressed false-positive ESLint react-hooks/refs error in PercentileTable with documented rationale.",
        ],
      },
    ],
  },
  {
    version: "0.28.1",
    date: "2026-03-25",
    sections: [
      {
        title: "Refactor",
        items: [
          "Extracted RAG schedule health computation to a pure, testable utility (computeTargetRAGColor) — memoized at call site for better render performance.",
          "Extracted Gantt chart preferences into a consolidated useGanttPreferences hook, reducing GanttChart.tsx by ~50 lines.",
          "Extracted Schedule Health threshold UI into a standalone ScheduleHealthSection component.",
          "Cleaned up redundant prop spread in GanttSection.",
        ],
      },
      {
        title: "Dependencies",
        items: [
          "Updated firebase, react-router-dom, recharts, typescript-eslint, eslint, @eslint/js, @vitejs/plugin-react to latest stable minor/patch releases.",
        ],
      },
    ],
  },
  {
    version: "0.28.0",
    date: "2026-03-25",
    sections: [
      {
        title: "New Features",
        items: [
          "Finish Target Date — set a project-level target finish date (e.g., the date promised in your project charter) in the summary card. The target date appears between the Start and Finish dates for quick reference.",
          "Gantt chart Target line — optionally display the finish target as a vertical dashed line on the Gantt chart. Toggle visibility via the 'Show Finish Target Date' checkbox in the Gantt toolbar.",
          "RAG schedule health indicator — the Target line and Finish Target date in the summary card reflect schedule health: green (simulation finishes by the green percentile), amber (within the amber threshold), or red (at risk). Gray/blue when no simulation has been run.",
          "Configurable RAG thresholds — set Green and Amber percentile thresholds in Settings under 'Finish Target — Schedule Health'. Defaults: Green at P80, Amber at P50.",
          "Monochrome-safe dash patterns — the Target line uses distinct dash patterns per RAG state (long dashes for green, medium for amber, dots for red) so schedule health is distinguishable on black-and-white prints.",
        ],
      },
    ],
  },
  {
    version: "0.27.0",
    date: "2026-03-24",
    sections: [
      {
        title: "New Features",
        items: [
          "Estimation Heuristics Suggester — new inline panel in Settings that helps you choose informed heuristic min/max percentages by selecting your industry domain and activity subdomain from a curated 73-entry reference table spanning 23 industries. Displays suggested optimistic and pessimistic percentages with rationale, and applies values to your heuristic defaults with one click.",
        ],
      },
    ],
  },
  {
    version: "0.26.2",
    date: "2026-03-24",
    sections: [
      {
        title: "Bug Fixes",
        items: [
          "Corrected activity end date calculation. Previously, end dates were computed one working day too late (e.g., a 5-day activity starting Monday showed an end date of the following Monday instead of Friday). This also caused a 1-day gap between sequential activities. All scheduled dates are now consistent with standard project management conventions: the end date is the last working day of the activity. Existing project data is unaffected — only displayed schedule dates change.",
        ],
      },
    ],
  },
  {
    version: "0.26.1",
    date: "2026-03-24",
    sections: [
      {
        title: "Enhancements",
        items: [
          "Redesigned bulk action toolbar: added Status dropdown (Planned, In Progress, Complete) alongside Confidence and Distribution. All three dropdowns now stage selections until you click \"Apply.\" When applying a distribution change with heuristics enabled, you're prompted to recalculate min/max using current heuristic percentages.",
          "The browser's \"Save as PDF\" default filename now includes the project name and today's date (e.g., \"SPERT Scheduler for My Project - March 24, 2026.pdf\").",
        ],
      },
    ],
  },
  {
    version: "0.26.0",
    date: "2026-03-23",
    sections: [
      {
        title: "Enhancements",
        items: [
          "New \"Show Activity IDs\" toggle in the Gantt chart toolbar. When enabled, sequential number prefixes (#1, #2, #3...) appear before activity names across the Gantt chart, activity grid, dependency panel, milestone panel, warnings panel, and modal dialogs — making it easy to reference specific activities by number during team conversations. Numbers match the # column in the schedule export. Toggle is session-only and resets on page reload.",
        ],
      },
    ],
  },
  {
    version: "0.25.3",
    date: "2026-03-23",
    sections: [
      {
        title: "Bug Fixes",
        items: [
          "Activity Edit Modal now applies heuristic min/max auto-fill when the Most Likely value is changed, matching the behavior of the activity grid. Previously, editing ML in the modal with heuristics enabled did not recalculate min and max.",
        ],
      },
    ],
  },
  {
    version: "0.25.2",
    date: "2026-03-23",
    sections: [
      {
        title: "Enhancements",
        items: [
          "Total Float and Free Float are now surfaced in three places in Dependency Mode: the schedule export (XLSX and CSV) includes new float columns; hovering over a Gantt activity bar shows a tooltip with scheduled dates and float values; and the Activity Edit Modal includes a new read-only Schedule Analysis section. Activities on the critical path are identified as such (Total Float = 0). Float values are only shown in Dependency Mode and do not appear in sequential mode schedules.",
          "Schedule export filenames now prefixed with \"spert-scheduler\" for easy identification.",
        ],
      },
    ],
  },
  {
    version: "0.25.1",
    date: "2026-03-23",
    sections: [
      {
        title: "Bug Fixes",
        items: [
          "Copy image button now shows a disabled state with an explanatory tooltip in browsers that do not support image clipboard writes (Firefox). Chrome, Edge, and Brave are unaffected.",
        ],
      },
      {
        title: "Improvements",
        items: [
          "Added Import Activities quick reference guide (PDF) link to the import section",
          "Updated Quick Reference Guide for v0.25.0",
          "PDF links now open in a new browser tab instead of triggering a download",
        ],
      },
    ],
  },
  {
    version: "0.25.0",
    date: "2026-03-22",
    sections: [
      {
        title: "New Features",
        items: [
          "Import activities from CSV file or clipboard paste — parse spreadsheet data into a new scenario with full validation, dependency resolution, and cycle detection",
          "Download CSV template with 10 example activities demonstrating all four distribution types (T-Normal, LogNormal, Triangular, Uniform) with realistic dependency chains",
          "Live preview with debounced parsing, row-level error/warning display, and summary statistics",
          "Import to a new project or add as a scenario to an existing project, with one-click navigation to the imported project",
          "Confidence Level is optional for Triangular and Uniform distributions (only affects T-Normal and LogNormal)",
        ],
      },
    ],
  },
  {
    version: "0.24.4",
    date: "2026-03-21",
    sections: [
      {
        title: "New Features",
        items: [
          "Dependency panel sort toggle — switch between alphabetical (A→Z) and schedule order (by predecessor start date) to view dependencies in the order they appear in the schedule",
        ],
      },
    ],
  },
  {
    version: "0.24.3",
    date: "2026-03-20",
    sections: [
      {
        title: "Bug Fixes",
        items: [
          "Scheduling constraints (SNET, MSO, MFO, FNET) now work in sequential (non-dependency) mode — previously constraints were silently ignored when dependency mode was off",
          "Monte Carlo simulation in sequential mode now respects constraint-induced schedule gaps (position-tracking path with per-trial constraint application)",
        ],
      },
    ],
  },
  {
    version: "0.24.2",
    date: "2026-03-20",
    sections: [
      {
        title: "Security",
        items: [
          "Gate project name console.warn behind import.meta.env.DEV in Firestore driver",
          "Add CSV formula injection guard to simulation CSV export csvEscape() for suite consistency",
        ],
      },
    ],
  },
  {
    version: "0.24.1",
    date: "2026-03-20",
    sections: [
      {
        title: "Refactoring",
        items: [
          "Extract ChecklistSection component from ActivityEditModal (~130 LOC reduction) with controlled component pattern",
          "Deduplicate CONSTRAINT_LABELS — shared constant and constraintLabel() helper now in @domain/helpers/constraint-labels.ts",
        ],
      },
      {
        title: "Bug Fixes",
        items: [
          "Fix handleAddTask stale closure — checklist.length in useCallback dependency array caused unnecessary recreations",
        ],
      },
    ],
  },
  {
    version: "0.24.0",
    date: "2026-03-20",
    sections: [
      {
        title: "New Features",
        items: [
          "Activity task checklists — add, toggle, reorder, and remove tasks within each activity via the Activity Edit modal",
          "New \"Tasks\" section in Activity Edit modal with drag-and-drop reordering (max 20 tasks per activity)",
          "Thin progress bar under activity name in grid — color-coded: blue for in-progress, green when all tasks complete; clickable to open Activity Edit modal",
          "Checklist progress visible in print report as \"Activity Tasks\" section with per-activity completion counts",
          "Schedule export (XLSX/CSV) includes Tasks summary and Task Details columns",
        ],
      },
      {
        title: "UI Improvements",
        items: [
          "Task input retains focus after adding a task for rapid entry of multiple tasks",
        ],
      },
      {
        title: "Technical",
        items: [
          "Schema v13 → v14 migration (optional checklist field on Activity)",
          "Dedicated store method for checklist updates preserves simulation results (no unnecessary re-runs)",
          "Activity duplication and scenario cloning generate fresh checklist item IDs",
        ],
      },
    ],
  },
  {
    version: "0.23.1",
    date: "2026-03-19",
    sections: [
      {
        title: "Bug Fixes",
        items: [
          "Fix CDF chart x-axis \"Duration (days)\" label clipped by insufficient bottom margin",
          "Fix print Gantt dependency arrows rendering on top of bars instead of behind them",
        ],
      },
      {
        title: "Performance",
        items: [
          "Bootstrap CI computation 17× faster — batch all percentiles per sort instead of sorting per percentile",
          "Show 95% CI toggle now defers computation via setTimeout(0) to keep checkbox responsive",
        ],
      },
      {
        title: "UI Improvements",
        items: [
          "Print Gantt buffer row label changed from \"Buffer\" to \"Schedule Buffer\" to match interactive chart",
          "Print Gantt buffer bar uses hatched yellow fill instead of solid yellow to match interactive chart",
          "Gantt buffer bar duration label (+Xd) now has a white halo for readability over hatched pattern",
          "Activity Edit modal: Name and Status fields side-by-side for compact layout",
          "Dependency Edit modal: Relationship Type and Lag Days side-by-side; predecessor/successor always editable via dropdowns",
          "Dependency panel: list sorted alphabetically by predecessor then successor name",
          "Dependency panel: click any row to open edit modal for full dependency editing",
          "Dependency panel: placeholder text in add-dependency dropdowns styled with muted color",
          "Locked scenarios: Gantt chart arrows fully unresponsive (no hover highlight, tooltip, or click)",
          "Constraint column dash and tags show pointer cursor to indicate clickability",
          "Scenario summary card: improved toggle-to-label spacing",
        ],
      },
    ],
  },
  {
    version: "0.23.0",
    date: "2026-03-19",
    sections: [
      {
        title: "New Features",
        items: [
          "Click any Gantt chart bar to open the expanded Activity Edit modal — edit name, status, estimates, constraints, and dependencies all in one place",
          "Click any dependency arrow in the Gantt chart to edit its relationship type, lag days, or delete it via a new Dependency Edit modal",
          "Hover over dependency arrows to highlight them with thicker strokes and brighter colors for easy identification",
          "Add new dependencies directly from the Activity Edit modal's Dependencies section",
          "Terminal activity markers on Gantt chart — right-edge stripe automatically marks activities with no successor in dependency mode",
        ],
      },
    ],
  },
  {
    version: "0.22.3",
    date: "2026-03-19",
    sections: [
      {
        title: "New Features",
        items: [
          "Click activity names in the Gantt chart to rename them inline — saves on blur or Enter, cancel with Escape",
        ],
      },
      {
        title: "UI Improvements",
        items: [
          "Gantt legend reordered: Complete, In Progress, Planned (matches workflow progression)",
          "Gantt legend: Today now appears before Finish to match left-to-right reading order on chart",
        ],
      },
    ],
  },
  {
    version: "0.22.2",
    date: "2026-03-19",
    sections: [
      {
        title: "Bug Fixes",
        items: [
          "Fix histogram buffer shading not appearing when Parkinson's Law clamps all trials above deterministic duration",
        ],
      },
      {
        title: "Security",
        items: [
          "Add hasOnly() field constraints to Firestore users/{uid} write rule to prevent arbitrary field injection",
          "Add hasOnly() field constraints to Firestore spertscheduler_settings write rule to restrict writable keys",
          "Add defensive ?? true fallback to Parkinson's Law preference read in Settings page",
          "Harden schema migration v12→v13 to normalize non-boolean parkinsonsLawEnabled values via typeof check",
        ],
      },
    ],
  },
  {
    version: "0.22.1",
    date: "2026-03-18",
    sections: [
      {
        title: "Refactoring",
        items: [
          "Extract shared ToggleSwitch component from ScenarioSummaryCard and PreferencesSection (6 duplicated toggle instances → 1 reusable component)",
        ],
      },
      {
        title: "Dependencies",
        items: [
          "Upgrade zustand 5.0.11→5.0.12, tailwindcss 4.2.1→4.2.2, @tailwindcss/vite 4.2.1→4.2.2, typescript-eslint 8.57.0→8.57.1, @types/react 19.2.10→19.2.14",
        ],
      },
    ],
  },
  {
    version: "0.22.0",
    date: "2026-03-18",
    sections: [
      {
        title: "Features",
        items: [
          "Add configurable Parkinson's Law toggle — disable per-scenario to allow simulated activity durations below the deterministic schedule",
        ],
      },
      {
        title: "Enhancements",
        items: [
          "Add Parkinson's Law status to printed project report",
          "Add Parkinson's Law default toggle to user preferences",
          "Compact scenario summary card layout — consolidate target labels, shrink heuristic inputs, add tooltips to all toggles",
        ],
      },
    ],
  },
  {
    version: "0.21.2",
    date: "2026-03-18",
    sections: [
      {
        title: "Bug Fixes",
        items: [
          "Fix LogNormal distribution sparkline curve peaking at wrong position — peak now aligns with the most-likely (mode) marker",
          "Fix mode marker vertical line offset in all distribution sparklines — now accounts for SVG padding to align with curve peak",
          "Fix histogram Buffer shading starting at Monte Carlo mean instead of deterministic P50 duration — shaded region now matches the summary card buffer",
        ],
      },
      {
        title: "Enhancements",
        items: [
          "Make \"Run simulation\" text clickable in schedule buffer placeholder, giving users a third trigger point for simulation",
        ],
      },
      {
        title: "Security",
        items: [
          "Add CSV formula injection guard for schedule exports",
          "Add 10 MB file size guard at the import service layer",
          "Filter scenario memory localStorage entries to string values only",
          "Gate preferences validation logging behind development mode",
          "Document Firestore enum validation limitations in SECURITY.md",
        ],
      },
    ],
  },
  {
    version: "0.21.1",
    date: "2026-03-18",
    sections: [
      {
        title: "Refactoring",
        items: [
          "Extract type-dispatch helpers in scheduling core to deduplicate SS/FF/FS forward and backward pass logic",
          "Extract shared WarningItem component in WarningsPanel for consistent constraint/dependency conflict rendering",
        ],
      },
    ],
  },
  {
    version: "0.21.0",
    date: "2026-03-18",
    sections: [
      {
        title: "New Features",
        items: [
          "Add Start-to-Start (SS) and Finish-to-Finish (FF) dependency relationship types alongside existing Finish-to-Start (FS)",
          "Type-aware forward/backward pass scheduling in both integer and date domains",
          "Dependency type selector in add form and inline editing on existing dependencies",
          "Type-aware Gantt chart arrow anchors: SS left-to-left, FF right-to-right, FS right-to-left",
          "Dependency constraint violation detection and display in Warnings panel",
          "Schedule export (XLSX/CSV) shows dependency type in predecessor/successor references (e.g., 1FS+2d, 2SS, 3FF)",
          "Gantt chart toggle to show/hide dependency arrows (persisted preference)",
          "FF arrows use U-turn path with left-pointing arrowhead at successor's finish",
        ],
      },
      {
        title: "Technical",
        items: [
          "Schema v11→v12 migration with defensive type write-forward",
          "Unified LS-based backward pass for all dependency types",
          "Post-pass dependency validation with sign-dispatch for negative lag",
        ],
      },
    ],
  },
  {
    version: "0.20.4",
    date: "2026-03-18",
    sections: [
      {
        title: "Enhancements",
        items: [
          "Add optional constraint note field (up to 500 characters) to document constraint rationale",
          "Add Constraints section to print report with Type, Date, Mode, and Note columns",
          "Add Constraint Note column to XLSX/CSV schedule exports",
          "Add SPERT® branding to print report header and footer",
          "Add sign-in buttons to Cloud Storage settings section for discoverability",
        ],
      },
    ],
  },
  {
    version: "0.20.3",
    date: "2026-03-18",
    sections: [
      {
        title: "Bug Fixes",
        items: [
          "Fix heuristic Min/Max % inputs rejecting intermediate keystrokes (now validates on blur)",
          "Format constraint warning dates to match user's date format preference",
          "Change Clear constraint button color from red to green (no-error semantic)",
          "Use unique blue C icon for constraint legend indicator (was identical to Planned)",
          "Remove misleading hover pencil icon from Gantt chart rows",
        ],
      },
      {
        title: "Enhancements",
        items: [
          "Move schedule export (XLSX/CSV) buttons into summary card buffer row, reclaiming vertical space",
        ],
      },
    ],
  },
  {
    version: "0.20.2",
    date: "2026-03-17",
    sections: [
      {
        title: "Security",
        items: [
          "Escalate write-forward migration failures to error callback",
          "Add iteration guard to constraint date picker non-working-day snap loop",
          "Validate constraint type/mode enum domains in worker payload filter",
          "Reject schema versions below 1 on project import",
          "Fix localStorage key namespace collision for active-scenario persistence",
          "Harden filename sanitization: empty fallback, 200-char truncation",
          "Log Zod validation failures in preferences loader for diagnostics",
        ],
      },
    ],
  },
  {
    version: "0.20.1",
    date: "2026-03-17",
    sections: [
      {
        title: "Refactoring",
        items: [
          "Extract useScenarioComparison hook from ProjectPage (comparison mode state + handlers)",
          "Extract EstimateInputs component from UnifiedActivityRow (Min/ML/Max numeric inputs)",
          "Extract BulkActionToolbar component from UnifiedActivityGrid (bulk selection UI)",
        ],
      },
    ],
  },
  {
    version: "0.20.0",
    date: "2026-03-17",
    sections: [
      {
        title: "New Features",
        items: [
          "Activity scheduling constraints: MSO, MFO, SNET, SNLT, FNET, FNLT with Hard/Soft modes",
          "Activity Edit Modal for managing scheduling constraints (click constraint badge in grid or edit icon on Gantt hover)",
          "Warnings Panel showing constraint conflicts and violations with severity levels",
          "Constraint column in activity grid (dependency mode) with clickable badges",
          "Constraint indicators on Gantt chart bars (interactive and print)",
          "Dual backward pass: constraint-adjusted late dates (display) + network-driven late dates (CPM float)",
          "Monte Carlo simulation respects hard constraints per trial (MSO, MFO, SNET, FNET clamping)",
          "Schema v10 to v11 migration with write-forward for Firestore",
        ],
      },
      {
        title: "Enhancements",
        items: [
          "Schedule export (XLSX/CSV) includes constraint type, date, and mode columns",
          "Gantt legend includes constraint indicator when constraints are present",
          "Sequential-mode banner when constraints exist but dependency mode is off",
          "totalFloat computed from network-driven backward pass (not constraint-adjusted)",
          "Soft constraint badges in activity grid show amber shading when a warning condition exists",
          "Wider activity name column in grid \u2014 reclaimed space from Distribution, Min/ML/Max, Confidence, and Actions columns",
          "Wider activity name area in Gantt chart (interactive and print) \u2014 shows up to 38 characters",
          "Date format option changed from YYYY-MM-DD to YYYY/MM/DD to prevent line-wrapping in grid cells",
          "Removed duplicate activity button from grid rows",
        ],
      },
    ],
  },
  {
    version: "0.19.3",
    date: "2026-03-17",
    sections: [
      {
        title: "Enhancements",
        items: [
          "Add \"Date prepared\" label to bottom-right of Gantt chart (interactive + print), providing context when the chart is copied or shared",
        ],
      },
      {
        title: "Bug Fixes",
        items: [
          "Fix Max % heuristic input not accepting typed values (removed HTML min constraint that blocked intermediate keystrokes)",
          "Fix Gantt chart showing activities in topological sort order instead of grid order when dependency mode is enabled",
        ],
      },
    ],
  },
  {
    version: "0.19.2",
    date: "2026-03-17",
    sections: [
      {
        title: "Security",
        items: [
          "Validate cached country data with Zod before use (loadCachedCountries)",
          "Add regex guard and encodeURIComponent on country code before URL construction (fetchPublicHolidays)",
          "Namespace localStorage cache key to spert-scheduler:nager-countries",
        ],
      },
    ],
  },
  {
    version: "0.19.1",
    date: "2026-03-17",
    sections: [
      {
        title: "Improvements",
        items: [
          "Updated ARCHITECTURE.md and SECURITY.md with v0.19.0 domain model, calendar validation, and security documentation",
          "Simplified Zustand selectors in CalendarPage and useWorkCalendar hook (removed unnecessary useShallow wrappers)",
        ],
      },
    ],
  },
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
