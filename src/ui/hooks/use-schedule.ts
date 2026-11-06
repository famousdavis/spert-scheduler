// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useMemo } from "react";
import type {
  Activity,
  Calendar,
  DeterministicSchedule,
} from "@domain/models/types";
import type { WorkCalendar } from "@core/calendar/work-calendar";
import { computeScenarioSchedule, type ScheduleError } from "@app/api/scenario-schedule";

/**
 * WI-150 release C: the page's one schedule function and its inputs now live in `/app`
 * (`app/api/scenario-schedule.ts`), so the AI's progress write can read them; re-exported here so
 * every existing importer is unchanged.
 */
export {
  computeScenarioSchedule,
  scenarioScheduleInputs,
  type ScheduleError,
  type ScenarioScheduleInputs,
  type ScenarioScheduleResult,
} from "@app/api/scenario-schedule";

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
  onScheduleError?: (error: ScheduleError | null) => void,
  today?: string,
): DeterministicSchedule | null {
  return useMemo(() => {
    if (activities.length === 0) return null;
    const { schedule, scheduleError } = computeScenarioSchedule({ activities, startDate, probabilityTarget, calendar, network: null, today });
    onScheduleError?.(scheduleError);
    return schedule;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- onScheduleError is a setState, stable ref
  }, [activities, startDate, probabilityTarget, calendar, today]);
}
