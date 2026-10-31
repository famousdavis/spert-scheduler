// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useMemo } from "react";
import type {
  Activity,
  ActivityDependency,
  Calendar,
  DeterministicSchedule,
  Milestone,
} from "@domain/models/types";
import type { WorkCalendar } from "@core/calendar/work-calendar";
import { isCalendarError } from "@core/calendar/work-calendar";
import { computeDependencySchedule } from "@core/schedule/deterministic";
import { isDependencyCycleError } from "@core/schedule/dependency-graph";
import { scenarioDataDate } from "@core/schedule/recorded-progress";
import { computeSchedule } from "@app/api/schedule-service";

export interface ScheduleError {
  message: string;
  isCalendarError: boolean;
  /**
   * A dependency cycle, which is neither a calendar problem nor an estimates problem.
   * REQUIRED, not optional: both construction sites must decide, so a new one cannot
   * silently default to "not a cycle" and fall back to advice that points at estimates.
   */
  isCycleError: boolean;
}

/**
 * Everything the project page schedules a scenario from (WI-137 release 2). The page gathers it
 * ONCE; its own schedule and the plan a row keeps when it leaves Planned are both computed from it
 * by `computeScenarioSchedule`, so the two can never be computed from different inputs.
 */
export interface ScenarioScheduleInputs {
  activities: Activity[];
  startDate: string;
  probabilityTarget: number;
  calendar?: WorkCalendar | Calendar;
  /** Dependency mode: its links and milestones. `null` in sequential mode. */
  network: { dependencies: ActivityDependency[]; milestones: Milestone[] } | null;
  /**
   * WI-154: today, `YYYY-MM-DD`, local. With a record in the scenario, no Planned row starts before
   * it (`scenarioDataDate`). Omitted: no floor, as before.
   */
  today?: string;
}

export interface ScenarioScheduleResult {
  schedule: DeterministicSchedule | null;
  scheduleError: ScheduleError | null;
}

/**
 * THE schedule the project page shows, in either mode, as one pure function (lifted out of this
 * hook and the page's dependency memo in WI-137 release 2). No activities: no schedule and no
 * error. Every failure is caught and classified: `isCalendarError` by the shared, two-shape
 * work-calendar.ts#isCalendarError predicate; `isCycleError` only in dependency mode — the
 * sequential engine never builds a dependency graph, so it cannot raise one.
 */
export function computeScenarioSchedule(inputs: ScenarioScheduleInputs): ScenarioScheduleResult {
  const { activities, startDate, probabilityTarget, calendar, network, today } = inputs;
  if (activities.length === 0) return { schedule: null, scheduleError: null };
  const dataDate = today ? scenarioDataDate(activities, today) : undefined;
  try {
    const schedule = network
      ? computeDependencySchedule(activities, network.dependencies, startDate, probabilityTarget, calendar, network.milestones, dataDate)
      : computeSchedule(activities, startDate, probabilityTarget, calendar, dataDate);
    return { schedule, scheduleError: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      schedule: null,
      scheduleError: { message, isCalendarError: isCalendarError(err), isCycleError: !!network && isDependencyCycleError(err) },
    };
  }
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
