// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { ScheduleError } from "@ui/hooks/use-schedule";

export interface ScheduleErrorBanner {
  heading: string;
  message: string;
  advice: string;
}

/**
 * Heading and advice for the schedule-error banner on the project page.
 *
 * Moved out of `ProjectPage.tsx` unchanged, for the same reason `auth-errors.ts` was moved
 * out of `AuthProvider`: `react-refresh/only-export-components` is active, so a component
 * module cannot export a non-component without producing a lint warning that counts against
 * the ratchet. Exporting it is what lets its behaviour be pinned by a test that asserts the
 * APP's logic rather than a reimplementation of it.
 *
 * Three branches, in precedence order. ⚠️ The cycle branch is v0.63.0's fix: until then this
 * branched on `isCalendarError` alone, so a dependency cycle - a non-calendar failure whose
 * estimates are entirely fine - was told to "Check the affected activity's estimates and
 * settings," pointing the user at the wrong place entirely. The old wording was pinned by
 * `import-cycle-characterisation.test.ts` precisely so this change would be demonstrated
 * rather than asserted; that pin is now updated and its falsification re-run.
 *
 * Cycle is checked FIRST. The two flags are independent booleans rather than a discriminated
 * union, so an error that somehow set both would otherwise fall to the calendar branch and
 * give work-week advice for a circular graph.
 *
 * ⚠️ v0.67.23 - the second argument GATES THE GENERIC BRANCH ONLY, and it is REQUIRED rather
 * than optional for the same reason `ScheduleError.isCycleError` is: both call sites must
 * decide, so a third cannot silently default to "show it". (v0.67.23 passed `allActivitiesValid`;
 * v0.69.0 passes `flaggedThrow` — see the last paragraph.)
 *
 * THE DEFECT IT CLOSED. Until v0.70.0 estimates committed per FIELD, against two STALE siblings.
 * A new activity is 1/1/1, so the first thing anyone typed - Min 5, or Most Likely 10 - left the
 * store briefly incoherent (5/1/1), the engine threw, and a red banner quoting
 * `TriangularDistribution: must have a <= c <= b` appeared DURING NORMAL DATA ENTRY, on the
 * first activity of a fresh project, taking 126 px of layout with it and unmounting the
 * Gantt. The user had made no mistake: 5/10/20 is valid, they had simply not finished typing
 * it. ⚠️ MEASURED: NO left-to-right order avoids it - skipping Min and typing only Most Likely
 * gives 1/10/1, which throws too. Right-to-left (Max, ML, Min) is clean throughout.
 *
 * WHY THE GATE WAS THE ROW'S OWN STATE AND NOT A PROXY. The row suppressed its OWN min <= ml <=
 * max error until all three fields were touched. During that half-typed window the engine could
 * not build a distribution while the row was not yet wrong - and that combination WAS the
 * premature state. v0.67.23 read it as "every row reports valid"; v0.69.0 had the row REPORT
 * mid-entry, so that only the flagged rows' own builds could raise the banner.
 *
 * ⚠️ v0.70.0 - THE PREMATURE STATE IS GONE AT ITS SOURCE. A row's three estimate cells commit as
 * ONE group when focus leaves them, so nothing reaches the store while they are still being typed
 * in: typing produces no throw, and a triple LEFT half-typed is saved and flagged by design. `mid-entry` and its
 * suppression were deleted; see the last paragraph for what the gate reads now.
 *
 * ⚠️ SCOPED TO THE GENERIC BRANCH ON PURPOSE. Cycle and calendar errors arise with perfectly
 * valid estimates, so gating them on estimate validity would silence real faults. Verified
 * throw-by-throw rather than assumed: the only throw under `core/schedule/` is
 * `DependencyCycleError`, and every calendar throw is either a `CalendarConfigurationError`
 * or starts with the iteration-limit message - both caught by `isCalendarError`, both checked
 * above this line.
 *
 * ⚠️ WHAT THIS DELIBERATELY SILENCED until v0.69.0, kept so the history reads: (1) a row
 * ABANDONED mid-entry - type Min, click away, never touch the other two - left a blank schedule
 * with no message and an enabled Run that did nothing; (2) `0/0/0` with LogNormal, which passed
 * the schema but throws `PERT mean must be > 0`. Both are FLAGGED since v0.69.0 — Run is refused
 * with the row named, and the LogNormal row is a schema error in its own right.
 *
 * ⚠️ v0.69.0 - THE SECOND ARGUMENT CHANGED MEANING. It was "every row reports valid"; it is now
 * `flaggedThrow`: the build message of the first activity, in the engine's order, whose
 * distribution cannot be built AND that has a saved issue (`useEstimateValidity`). The generic
 * branch shows only then, and shows THAT message rather than `error.message`. v0.69.0's two
 * reasons, both then pinned at the page, rested on a half-typed row being saved and held back:
 *   - a page-wide "some row is flagged" gate reopened v0.67.23 whenever ANY row was flagged,
 *     because the engine could be throwing on a held-back half-typed row;
 *   - the engine aborts at its FIRST throw and builds in array order, so its message could name
 *     a half-typed row above a flagged one - v0.67.23 again, in the content.
 * ⚠️ Since v0.70.0 neither can happen - nothing is saved while a row is still being typed in, and a
 * triple left half-typed is saved AND flagged, never held back - and `flaggedThrow` names the
 * same activity as the engine's first throw, with the same message (REASONED: every throw the
 * distribution factory raises is also an issue of the strict schema). It is kept as the gate.
 */
export function getScheduleErrorBanner(
  error: ScheduleError | null,
  flaggedThrow: string | null
): ScheduleErrorBanner | null {
  if (!error) return null;
  if (error.isCycleError) {
    return {
      heading: "Dependency Cycle",
      message: error.message,
      advice:
        "Two or more activities depend on each other in a loop. Open the Dependencies panel and remove one of the links in the loop.",
    };
  }
  if (error.isCalendarError) {
    return {
      heading: "Calendar Configuration Error",
      message: error.message,
      advice: "Check your work week settings in Settings.",
    };
  }
  // Generic branch = the estimates branch, per the reachability note above. Shown only for a
  // flagged activity that itself cannot be built.
  if (flaggedThrow === null) return null;
  return {
    heading: "Schedule Error",
    message: flaggedThrow,
    advice: "Check the affected activity's estimates and settings.",
  };
}
