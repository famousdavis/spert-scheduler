// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// -- A scenario's schedule, as the project page computes it ----------------------
// WI-150 release C: lifted from `ui/hooks/use-schedule.ts` (which re-exports it) so the AI's
// progress write in `/app` reads the page's ONE schedule function from the same inputs. A module of
// its own, beside `schedule-service.ts`, so `computeSchedule` stays a module boundary (the hook's
// tests mock it there).

import type {
  ActivityDependency,
  Activity,
  Calendar,
  DeterministicSchedule,
  Milestone,
  Scenario,
} from "@domain/models/types";
import type { WorkCalendar } from "@core/calendar/work-calendar";
import { isCalendarError } from "@core/calendar/work-calendar";
import { computeDependencySchedule } from "@core/schedule/deterministic";
import { isDependencyCycleError } from "@core/schedule/dependency-graph";
import { scenarioDataDate } from "@core/schedule/recorded-progress";
import { computeSchedule } from "./schedule-service";

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
 * Everything a scenario's schedule is computed from (WI-137 release 2). The project page gathers it
 * ONCE; its own schedule and the plan a row keeps when it leaves Planned are both computed from it
 * by `computeScenarioSchedule`, so the two can never be computed from different inputs.
 * WI-150 release C: lifted here from `ui/hooks/use-schedule.ts` (which re-exports it) so the AI's
 * progress write in `/app` reads the same function from the same inputs (`scenarioScheduleInputs`).
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
   * it (`scenarioDataDate`). Omitted: no floor, as before — the PLAN (owner, R639, C′).
   */
  today?: string;
}

export interface ScenarioScheduleResult {
  schedule: DeterministicSchedule | null;
  scheduleError: ScheduleError | null;
}

/** What of a scenario its schedule reads besides its activities — a whole `Scenario` is one. */
export interface ScenarioScheduleSource {
  startDate: string;
  settings: { probabilityTarget: number; dependencyMode: boolean };
  dependencies: ActivityDependency[];
  milestones: Milestone[];
}

/**
 * WI-150 release C: THE mapping from a scenario to its schedule's inputs, activities aside — the
 * project page's memo, Settings' schedule export and the AI's progress write all call it, so none
 * of them can gather a second, different set (the v0.81.0 rule). `today` omitted: the plan (C′).
 */
export function scenarioScheduleInputs(
  source: ScenarioScheduleSource,
  calendar: WorkCalendar | Calendar | undefined,
  today?: string,
): Omit<ScenarioScheduleInputs, "activities"> {
  return {
    today,
    startDate: source.startDate,
    probabilityTarget: source.settings.probabilityTarget,
    calendar,
    network: source.settings.dependencyMode ? { dependencies: source.dependencies, milestones: source.milestones } : null,
  };
}

/**
 * THE schedule the project page shows, in either mode, as one pure function (lifted out of the
 * schedule hook and the page's dependency memo in WI-137 release 2; into `/app` in WI-150 release
 * C). No activities: no schedule and no error. Every failure is caught and classified:
 * `isCalendarError` by the shared, two-shape work-calendar.ts#isCalendarError predicate;
 * `isCycleError` only in dependency mode — the sequential engine never builds a dependency graph,
 * so it cannot raise one.
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
 * WI-150 release C: a scenario's PLAN — its schedule with today's floor off (owner, R639, C′), from
 * the one mapping and the one function. What a row leaving Planned keeps as its Planned pair, and
 * what Complete judges "already due" by; `null` when it cannot be calculated.
 */
export function scenarioPlanSchedule(
  scenario: Scenario,
  calendar: WorkCalendar | Calendar | undefined,
): DeterministicSchedule | null {
  return computeScenarioSchedule({ ...scenarioScheduleInputs(scenario, calendar), activities: scenario.activities }).schedule;
}
