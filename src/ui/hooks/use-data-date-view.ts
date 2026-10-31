// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useMemo } from "react";
import type { Activity, Calendar, DeterministicSchedule, Scenario, ScheduledActivity, SimulationRun } from "@domain/models/types";
import type { WorkCalendar } from "@core/calendar/work-calendar";
import { scenarioDataDate, staleResults } from "@core/schedule/recorded-progress";
import { withPlanDates } from "@ui/components/activity-row-helpers";
import { staleResultsSentence } from "@ui/helpers/stale-results-words";
import { useDateFormat } from "@ui/hooks/use-date-format";

export interface DataDateView {
  /** The grid's rows: each Planned row with its dates in the plan before today's floor (C′). */
  gridScheduledActivities: ScheduledActivity[];
  /** The results the page shows: none when they are from an earlier data date. */
  simulationResults: SimulationRun | undefined;
  /** The one sentence beside results from an earlier data date, or undefined. */
  staleNote: string | undefined;
  /** The scenario print reads: its results left out when they are from an earlier data date. */
  printScenario: Scenario | undefined;
  /** The auto-run's today: only where the data date applies, so a new day re-runs only such a scenario. */
  autoRunToday: string | undefined;
}

const NO_ROWS: ScheduledActivity[] = [];

/**
 * WI-154 — what the project page shows of the data date, derived in one place and never written to
 * the store (owner, R639):
 *  - decision 1 (C′): the grid's rows carry each Planned row's dates in the plan before today's
 *    floor — the page's `planSchedule`, nothing changed — for the Status rule;
 *  - decision 3: results simulated on an earlier data date, in a scenario that holds a record, are
 *    shown as not run, with one sentence, on the page and in print.
 * A hook, so the page component's own complexity does not grow with it.
 */
export function useDataDateView(args: {
  scenario: Scenario | undefined;
  today: string;
  workCalendar: WorkCalendar | Calendar | undefined;
  schedule: DeterministicSchedule | null;
  planSchedule: (changed: Activity[]) => DeterministicSchedule | null;
}): DataDateView {
  const { scenario, today, workCalendar, schedule, planSchedule } = args;
  const formatDate = useDateFormat();
  const activities = scenario?.activities;
  const dataDay = activities ? scenarioDataDate(activities, today) : undefined;

  const gridScheduledActivities = useMemo(
    () => withPlanDates(schedule?.activities ?? NO_ROWS, dataDay ? planSchedule([]) : null, activities ?? []),
    [schedule, dataDay, planSchedule, activities],
  );
  const stale = useMemo(() => (scenario ? staleResults(scenario, today, workCalendar) : null), [scenario, today, workCalendar]);
  const printScenario = useMemo(
    () => (stale && scenario ? { ...scenario, simulationResults: undefined } : scenario),
    [stale, scenario],
  );
  return {
    gridScheduledActivities,
    simulationResults: stale ? undefined : scenario?.simulationResults,
    staleNote: stale ? staleResultsSentence(stale, formatDate) : undefined,
    printScenario,
    autoRunToday: dataDay,
  };
}
