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
 * ⚠️ RECORDED, NOT SPECIFIED — the non-calendar advice is KNOWN TO BE WRONG for one input.
 * This branches on `isCalendarError` alone, so every non-calendar failure is told to
 * "Check the affected activity's estimates and settings." A **dependency cycle** is a
 * non-calendar failure whose estimates are entirely fine — the graph is circular — so the
 * user is pointed at the wrong place. Pinned as-is by
 * `src/integration/import-cycle-characterisation.test.ts` so that changing it is a visible,
 * deliberate act rather than a silent drift. See §3.5.
 */
export function getScheduleErrorBanner(
  error: ScheduleError | null
): ScheduleErrorBanner | null {
  if (!error) return null;
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
