// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useMemo } from "react";
import type {
  Activity,
  Calendar,
  DeterministicSchedule,
} from "@domain/models/types";
import type { WorkCalendar } from "@core/calendar/work-calendar";
import { CalendarConfigurationError } from "@core/calendar/work-calendar";
import { computeSchedule } from "@app/api/schedule-service";

/**
 * Memoized deterministic schedule computation.
 * Recomputes only when activities, startDate, probabilityTarget, or calendar change.
 *
 * If the calendar configuration has no valid work days, fires onCalendarError
 * (if provided) with the error message.
 */
export function useSchedule(
  activities: Activity[],
  startDate: string,
  probabilityTarget: number,
  calendar?: WorkCalendar | Calendar,
  onCalendarError?: (msg: string | null) => void
): DeterministicSchedule | null {
  return useMemo(() => {
    if (activities.length === 0) return null;
    try {
      const result = computeSchedule(activities, startDate, probabilityTarget, calendar);
      onCalendarError?.(null);
      return result;
    } catch (err) {
      if (err instanceof CalendarConfigurationError) {
        onCalendarError?.(err.message);
      }
      return null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- onCalendarError is a setState, stable ref
  }, [activities, startDate, probabilityTarget, calendar]);
}
