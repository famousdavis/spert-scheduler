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
 * ⚠️ v0.67.23 - `allActivitiesValid` GATES THE GENERIC BRANCH ONLY, and it is REQUIRED rather
 * than optional for the same reason `ScheduleError.isCycleError` is: both call sites must
 * decide, so a third cannot silently default to "show it".
 *
 * THE DEFECT IT CLOSES. Estimates commit per FIELD, against two STALE siblings. A new
 * activity is 1/1/1, so the first thing anyone types - Min 5, or Most Likely 10 - leaves the
 * store briefly incoherent (5/1/1), the engine throws, and a red banner quoting
 * `TriangularDistribution: must have a <= c <= b` appeared DURING NORMAL DATA ENTRY, on the
 * first activity of a fresh project, taking 126 px of layout with it and unmounting the
 * Gantt. The user had made no mistake: 5/10/20 is valid, they had simply not finished typing
 * it. ⚠️ MEASURED: NO left-to-right order avoids it - skipping Min and typing only Most Likely
 * gives 1/10/1, which throws too. Right-to-left (Max, ML, Min) is clean throughout.
 *
 * WHY THIS FLAG IS THE RIGHT DISCRIMINATOR AND NOT A PROXY. `UnifiedActivityRow` already
 * suppresses its OWN min <= ml <= max error until all three fields are touched
 * (`allEstimatesTouched`), and that gate deliberately withholds `onValidityChange(false)`
 * too. So during the half-typed window the rows genuinely report valid while the engine
 * cannot build a distribution - and that combination IS the premature state. The gate that
 * already existed at the row was simply missing at the consumer.
 *
 * ⚠️ SCOPED TO THE GENERIC BRANCH ON PURPOSE. Cycle and calendar errors arise with perfectly
 * valid estimates, so gating them on `allActivitiesValid` would silence real faults. Verified
 * throw-by-throw rather than assumed: the only throw under `core/schedule/` is
 * `DependencyCycleError`, and every calendar throw is either a `CalendarConfigurationError`
 * or starts with the iteration-limit message - both caught by `isCalendarError`, both checked
 * above this line.
 *
 * ⚠️ WHAT THIS DELIBERATELY SILENCES, so the next session does not read it as a bug. Any state
 * where the rows report valid but the engine still throws now shows NOTHING. Two are known:
 * (1) a row ABANDONED mid-entry - type Min, click away, never touch the other two - which
 * leaves a blank schedule with no message and a Run button that is enabled but a silent
 * no-op; FILED as a follow-up rather than fixed here, because closing it means adding
 * branching to `UnifiedActivityRow`, which carries two of the repo's three accepted lint
 * findings and has zero ratchet headroom. (2) `0/0/0` with LogNormal, which is schema-valid
 * (`nonnegative()`, and 0 <= 0 <= 0 passes both refinements) but throws `PERT mean must be
 * > 0`. Both are rare; the banner they replaced was wrong far more often than it was right.
 */
export function getScheduleErrorBanner(
  error: ScheduleError | null,
  allActivitiesValid: boolean
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
  // Generic branch = the estimates branch, per the reachability note above. Suppressed while
  // every row reports valid: that is the half-typed window, not a fault the user can act on.
  if (allActivitiesValid) return null;
  return {
    heading: "Schedule Error",
    message: error.message,
    advice: "Check the affected activity's estimates and settings.",
  };
}
