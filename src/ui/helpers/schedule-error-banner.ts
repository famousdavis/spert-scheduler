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
 * branched on `isCalendarError` alone, so a dependency cycle — a non-calendar failure whose
 * estimates are entirely fine — was told to "Check the affected activity's estimates and
 * settings," pointing the user at the wrong place entirely. The old wording was pinned by
 * `import-cycle-characterisation.test.ts` precisely so this change would be demonstrated
 * rather than asserted; that pin is now updated and its falsification re-run.
 *
 * Cycle is checked FIRST. The two flags are independent booleans rather than a discriminated
 * union, so an error that somehow set both would otherwise fall to the calendar branch and
 * give work-week advice for a circular graph.
 */
export function getScheduleErrorBanner(
  error: ScheduleError | null
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
  return error.isCalendarError
    ? {
        heading: "Calendar Configuration Error",
        message: error.message,
        advice: "Check your work week settings in Settings.",
      }
    : {
        heading: "Schedule Error",
        message: error.message,
        advice: "Check the affected activity's estimates and settings.",
      };
}
