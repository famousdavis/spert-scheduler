// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import type { Activity, Calendar, Milestone, ActivityDependency } from "@domain/models/types";
import type { WorkCalendar } from "@core/calendar/work-calendar";
import type { DependencySimulationParams } from "@core/simulation/worker-client";
import { computeDeterministicDurations, computeDependencyDurations } from "@core/schedule/deterministic";
import { buildMilestoneSimParams } from "@core/schedule/milestone-sim-params";

export interface SimulationParams {
  deterministicDurations: number[] | undefined;
  dependencyParams: DependencySimulationParams | undefined;
}

/**
 * Build simulation parameters for either sequential or dependency mode.
 * Pure function — used by both manual run and auto-run to avoid duplication.
 */
export function buildSimulationParams(
  activities: Activity[],
  dependencyMode: boolean,
  probabilityTarget: number,
  dependencies: ActivityDependency[],
  milestones: Milestone[],
  startDate: string,
  calendar: WorkCalendar | Calendar | undefined,
): SimulationParams {
  if (dependencyMode) {
    const durationMap = computeDependencyDurations(activities, probabilityTarget);
    const durMapRecord: Record<string, number> = {};
    for (const [k, v] of durationMap) durMapRecord[k] = v;

    const msParams = buildMilestoneSimParams(activities, milestones, startDate, calendar);

    return {
      deterministicDurations: undefined,
      dependencyParams: {
        dependencyMode: true,
        dependencies,
        deterministicDurationMap: durMapRecord,
        ...msParams,
      },
    };
  }

  return {
    deterministicDurations: computeDeterministicDurations(activities, probabilityTarget),
    dependencyParams: undefined,
  };
}
