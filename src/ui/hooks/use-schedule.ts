// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useMemo } from "react";
import type {
  Activity,
  Calendar,
  DeterministicSchedule,
} from "@domain/models/types";
import type { WorkCalendar } from "@core/calendar/work-calendar";
import { isCalendarError } from "@core/calendar/work-calendar";
import { computeSchedule } from "@app/api/schedule-service";

export interface ScheduleError {
  message: string;
  isCalendarError: boolean;
}

/**
 * Memoized deterministic schedule computation.
 * Recomputes only when activities, startDate, probabilityTarget, or calendar change.
 *
 * Fires onScheduleError (if provided) with every schedule computation failure —
 * not just calendar misconfigurations. The isCalendarError flag on the error
 * distinguishes a genuine calendar problem (checked via the shared, two-shape
 * work-calendar.ts#isCalendarError predicate) from every other schedule error,
 * so callers can show the right advice for each. Fires with `null` on success.
 */
export function useSchedule(
  activities: Activity[],
  startDate: string,
  probabilityTarget: number,
  calendar?: WorkCalendar | Calendar,
  onScheduleError?: (error: ScheduleError | null) => void
): DeterministicSchedule | null {
  return useMemo(() => {
    if (activities.length === 0) return null;
    try {
      const result = computeSchedule(activities, startDate, probabilityTarget, calendar);
      onScheduleError?.(null);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      onScheduleError?.({ message, isCalendarError: isCalendarError(err) });
      return null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- onScheduleError is a setState, stable ref
  }, [activities, startDate, probabilityTarget, calendar]);
}
