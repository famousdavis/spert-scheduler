// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import type { Activity, Calendar, Milestone, ActivityDependency } from "@domain/models/types";
import type { WorkCalendar } from "@core/calendar/work-calendar";
import type { DependencySimulationParams } from "@core/simulation/worker-client";
import { computeDeterministicDurations, computeDependencyDurations } from "@core/schedule/deterministic";
import { buildMilestoneSimParams } from "@core/schedule/milestone-sim-params";
import { parseDateISO, isWorkingDay, countWorkingDays } from "@core/calendar/calendar";

/** Per-activity constraint info for sequential MC (parallel to activities array). */
export type SequentialConstraintEntry = { type: string; offsetFromStart: number; mode: string } | null;

export interface SimulationParams {
  deterministicDurations: number[] | undefined;
  dependencyParams: DependencySimulationParams | undefined;
  sequentialConstraints: SequentialConstraintEntry[] | undefined;
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
  parkinsonsLawEnabled: boolean,
): SimulationParams {
  if (dependencyMode) {
    const durationMap = computeDependencyDurations(activities, probabilityTarget);
    const durMapRecord: Record<string, number> = {};
    for (const [k, v] of durationMap) durMapRecord[k] = v;

    const msParams = buildMilestoneSimParams(activities, milestones, startDate, calendar);

    // Build constraintMap: convert constraint dates to integer offsets from project start
    let constraintMap: Record<string, { type: string; offsetFromStart: number; mode: string }> | undefined;
    const constrainedActivities = activities.filter(
      (a) => a.constraintType && a.constraintDate && a.constraintMode
    );
    if (constrainedActivities.length > 0) {
      const projStart = parseDateISO(startDate);
      while (!isWorkingDay(projStart, calendar)) {
        projStart.setDate(projStart.getDate() + 1);
      }
      constraintMap = {};
      for (const a of constrainedActivities) {
        const cDate = parseDateISO(a.constraintDate!);
        while (!isWorkingDay(cDate, calendar)) {
          cDate.setDate(cDate.getDate() + 1);
        }
        constraintMap[a.id] = {
          type: a.constraintType!,
          offsetFromStart: countWorkingDays(projStart, cDate, calendar),
          mode: a.constraintMode!,
        };
      }
    }

    return {
      deterministicDurations: undefined,
      dependencyParams: {
        dependencyMode: true,
        dependencies,
        deterministicDurationMap: parkinsonsLawEnabled ? durMapRecord : undefined,
        ...msParams,
        constraintMap,
      },
      sequentialConstraints: undefined,
    };
  }

  // Build sequential constraints if any activities have them
  let sequentialConstraints: SequentialConstraintEntry[] | undefined;
  const constrainedActivities = activities.filter(
    (a) => a.constraintType && a.constraintDate && a.constraintMode
  );
  if (constrainedActivities.length > 0) {
    const projStart = parseDateISO(startDate);
    while (!isWorkingDay(projStart, calendar)) {
      projStart.setDate(projStart.getDate() + 1);
    }
    sequentialConstraints = activities.map((a) => {
      if (!a.constraintType || !a.constraintDate || !a.constraintMode) return null;
      const cDate = parseDateISO(a.constraintDate);
      while (!isWorkingDay(cDate, calendar)) {
        cDate.setDate(cDate.getDate() + 1);
      }
      return {
        type: a.constraintType,
        offsetFromStart: countWorkingDays(projStart, cDate, calendar),
        mode: a.constraintMode,
      };
    });
  }

  return {
    deterministicDurations: parkinsonsLawEnabled ? computeDeterministicDurations(activities, probabilityTarget) : undefined,
    dependencyParams: undefined,
    sequentialConstraints,
  };
}
