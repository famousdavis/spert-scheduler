// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import type {
  Activity,
  ActivityDependency,
  Calendar,
  ConstraintConflict,
  DeterministicSchedule,
  Milestone,
  ScheduledActivity,
} from "@domain/models/types";
import type { WorkCalendar } from "@core/calendar/work-calendar";
import { createDistributionForActivity } from "@core/distributions/factory";
import {
  addWorkingDays,
  subtractWorkingDays,
  countWorkingDays,
  formatDateISO,
  parseDateISO,
  isWorkingDay,
} from "@core/calendar/calendar";
import { buildDependencyGraph, computeCriticalPathDuration } from "./dependency-graph";
import {
  applyForwardConstraint,
  applyBackwardConstraint,
  detectConstraintConflict,
} from "./constraint-utils";

// -- Shared helper for duration resolution ------------------------------------

/**
 * Resolve the deterministic duration for a single activity at a given percentile.
 *  - Complete with actual → returns actualDuration
 *  - In-progress with elapsed → returns max(elapsed+1, inverseCDF)
 *  - Otherwise → returns max(1, inverseCDF)
 */
function resolveActivityDuration(activity: Activity, percentile: number): number {
  if (activity.status === "complete" && activity.actualDuration != null) {
    return activity.actualDuration;
  }
  const dist = createDistributionForActivity(activity);
  const base = Math.max(1, Math.ceil(dist.inverseCDF(percentile)));
  if (activity.status === "inProgress" && activity.actualDuration != null) {
    return Math.max(activity.actualDuration + 1, base);
  }
  return base;
}

// -- Sequential scheduling ----------------------------------------------------

/**
 * Compute the deterministic duration for each non-complete activity at a given percentile.
 * Returns an array of durations (minimum 1 working day each), one per non-complete activity.
 *
 * Used as the Parkinson's Law floor in Monte Carlo simulation.
 */
export function computeDeterministicDurations(
  activities: Activity[],
  probabilityTarget: number
): number[] {
  return activities
    .filter((a) => !(a.status === "complete" && a.actualDuration != null))
    .map((a) => resolveActivityDuration(a, probabilityTarget));
}

/**
 * Compute a deterministic schedule for a linear activity chain at a given percentile.
 * Activities are executed in array order (finish-to-start linear chain).
 *
 * @param activities - Activities in execution order
 * @param startDate - Project start date ("YYYY-MM-DD")
 * @param percentile - Probability target (e.g. 0.85 for P85)
 * @param calendar - Optional calendar with holidays
 */
export function computeDeterministicSchedule(
  activities: Activity[],
  startDate: string,
  percentile: number,
  calendar?: WorkCalendar | Calendar
): DeterministicSchedule {
  const scheduledActivities: ScheduledActivity[] = [];

  let currentDate = parseDateISO(startDate);

  // Ensure start date is a working day
  while (!isWorkingDay(currentDate, calendar)) {
    currentDate.setDate(currentDate.getDate() + 1);
  }

  for (const activity of activities) {
    const isActual = activity.status === "complete" && activity.actualDuration != null;
    const duration = resolveActivityDuration(activity, percentile);

    const activityStartDate = currentDate;
    const activityEndDate = addWorkingDays(activityStartDate, duration, calendar);

    scheduledActivities.push({
      activityId: activity.id,
      name: activity.name,
      duration,
      startDate: formatDateISO(activityStartDate),
      endDate: formatDateISO(activityEndDate),
      isActual,
    });

    // Next activity starts the working day after this one ends
    currentDate = addWorkingDays(activityEndDate, 1, calendar);
  }

  const lastActivity = scheduledActivities[scheduledActivities.length - 1];
  const totalDuration = scheduledActivities.reduce(
    (sum, a) => sum + a.duration,
    0
  );

  return {
    activities: scheduledActivities,
    totalDurationDays: totalDuration,
    projectEndDate: lastActivity ? lastActivity.endDate : formatDateISO(currentDate),
  };
}

// -- Per-activity uncertainty computation -------------------------------------

/**
 * Compute per-activity uncertainty: the difference between the duration at
 * the project target and the activity target percentile.
 *
 * Used by the Gantt chart to show split bars (solid = deterministic, hatched = uncertainty).
 *
 * @returns Map of activityId → { solidDays, hatchedDays }
 */
export function computeActivityUncertaintyDays(
  activities: Activity[],
  activityTarget: number,
  projectTarget: number
): Map<string, { solidDays: number; hatchedDays: number }> {
  const result = new Map<string, { solidDays: number; hatchedDays: number }>();

  for (const activity of activities) {
    if (activity.status === "complete" && activity.actualDuration != null) {
      // Complete activities: fixed duration, no uncertainty
      result.set(activity.id, { solidDays: activity.actualDuration, hatchedDays: 0 });
    } else {
      // Planned and in-progress: resolveActivityDuration handles floor logic
      const solidDays = resolveActivityDuration(activity, activityTarget);
      const projectDays = resolveActivityDuration(activity, projectTarget);
      const hatchedDays = Math.max(0, projectDays - solidDays);
      result.set(activity.id, { solidDays, hatchedDays });
    }
  }

  return result;
}

// -- Dependency-aware scheduling ---------------------------------------------

/**
 * Compute deterministic durations as a Map (activityId → days).
 * Used by Monte Carlo dependency simulation as Parkinson's Law floors.
 */
export function computeDependencyDurations(
  activities: Activity[],
  percentile: number
): Map<string, number> {
  const durations = new Map<string, number>();
  for (const activity of activities) {
    durations.set(activity.id, resolveActivityDuration(activity, percentile));
  }
  return durations;
}

/**
 * Compute a deterministic schedule using a dependency graph.
 * Activities are scheduled based on predecessor finish dates (not array order).
 * Activities with no predecessors start on the project start date (in parallel).
 *
 * @param activities - All activities in the scenario
 * @param dependencies - Finish-to-Start dependencies with optional lag
 * @param startDate - Project start date ("YYYY-MM-DD")
 * @param percentile - Probability target (e.g. 0.50 for P50)
 * @param calendar - Optional calendar with holidays
 */
export function computeDependencySchedule(
  activities: Activity[],
  dependencies: ActivityDependency[],
  startDate: string,
  percentile: number,
  calendar?: WorkCalendar | Calendar,
  milestones?: Milestone[]
): DeterministicSchedule {
  const graph = buildDependencyGraph(
    activities.map((a) => a.id),
    dependencies
  );

  // Compute duration for each activity
  const durationMap = computeDependencyDurations(activities, percentile);

  // Activity lookup
  const activityMap = new Map(activities.map((a) => [a.id, a]));

  const projectStart = parseDateISO(startDate);
  while (!isWorkingDay(projectStart, calendar)) {
    projectStart.setDate(projectStart.getDate() + 1);
  }

  // -- Forward pass (with constraint tracking) --------------------------------
  // For each activity, compute:
  // - networkStart/networkEnd: ES/EF before this activity's local constraint
  // - startDates/endDates: ES/EF after constraint (propagates to successors)

  const startDates = new Map<string, Date>();    // constrained ES
  const endDates = new Map<string, Date>();      // constrained EF
  const networkStart = new Map<string, string>(); // network ES (ISO)
  const networkEnd = new Map<string, string>();   // network EF (ISO)
  const conflicts: ConstraintConflict[] = [];

  for (const id of graph.topologicalOrder) {
    const activity = activityMap.get(id)!;
    const duration = durationMap.get(id) ?? 1;

    const preds = graph.predecessors.get(id) ?? [];
    let activityStart: Date;

    if (preds.length === 0) {
      activityStart = new Date(projectStart);
    } else {
      // Starts after all predecessors' CONSTRAINED finish + lag
      let latestDate = new Date(0);
      for (const pred of preds) {
        const predEnd = endDates.get(pred.id)!;
        const offset = 1 + pred.lagDays;
        let candidateStart: Date;
        if (offset >= 0) {
          candidateStart = addWorkingDays(predEnd, offset, calendar);
        } else {
          candidateStart = subtractWorkingDays(predEnd, -offset, calendar);
          if (candidateStart < projectStart) {
            candidateStart = new Date(projectStart);
          }
        }
        if (candidateStart > latestDate) {
          latestDate = candidateStart;
        }
      }
      activityStart = latestDate;
    }

    // Apply startsAtMilestoneId floor
    if (activity.startsAtMilestoneId && milestones) {
      const milestone = milestones.find((m) => m.id === activity.startsAtMilestoneId);
      if (milestone) {
        const milestoneDate = parseDateISO(milestone.targetDate);
        while (!isWorkingDay(milestoneDate, calendar)) {
          milestoneDate.setDate(milestoneDate.getDate() + 1);
        }
        if (milestoneDate > activityStart) {
          activityStart = milestoneDate;
        }
      }
    }

    // Ensure start is a working day
    while (!isWorkingDay(activityStart, calendar)) {
      activityStart.setDate(activityStart.getDate() + 1);
    }

    const activityEnd = addWorkingDays(activityStart, duration, calendar);

    // Save network dates (before local constraint adjustment)
    const esNetISO = formatDateISO(activityStart);
    const efNetISO = formatDateISO(activityEnd);
    networkStart.set(id, esNetISO);
    networkEnd.set(id, efNetISO);

    // Apply scheduling constraint (forward pass)
    if (activity.constraintType && activity.constraintDate && activity.constraintMode) {
      const result = applyForwardConstraint(
        esNetISO, efNetISO, duration,
        activity.constraintType, activity.constraintDate,
        activity.constraintMode, activity.id, activity.name, calendar,
      );
      startDates.set(id, parseDateISO(result.es));
      endDates.set(id, parseDateISO(result.ef));
      if (result.conflict) conflicts.push(result.conflict);
    } else {
      startDates.set(id, activityStart);
      endDates.set(id, activityEnd);
    }
  }

  // Project end is the latest constrained end date
  let projectEndDate = projectStart;
  for (const endDate of endDates.values()) {
    if (endDate > projectEndDate) projectEndDate = endDate;
  }
  const projectEndISO = formatDateISO(projectEndDate);

  // -- Backward pass #1 (constraint-adjusted, for display) --------------------

  const lateStartCon = new Map<string, string>();  // ISO dates
  const lateFinishCon = new Map<string, string>(); // ISO dates

  for (let i = graph.topologicalOrder.length - 1; i >= 0; i--) {
    const id = graph.topologicalOrder[i]!;
    const activity = activityMap.get(id)!;
    const duration = durationMap.get(id) ?? 1;
    const succs = graph.successors.get(id) ?? [];

    let lf: Date;
    if (succs.length === 0) {
      lf = new Date(projectEndDate);
    } else {
      lf = new Date(8640000000000000); // max date
      for (const succ of succs) {
        const succLS = parseDateISO(lateStartCon.get(succ.id)!);
        const offset = 1 + succ.lagDays;
        const candidateLF = offset >= 0
          ? subtractWorkingDays(succLS, offset, calendar)
          : addWorkingDays(succLS, -offset, calendar);
        if (candidateLF < lf) lf = candidateLF;
      }
    }

    let ls = subtractWorkingDays(lf, duration, calendar);

    // Apply backward constraint adjustment
    if (activity.constraintType && activity.constraintDate && activity.constraintMode) {
      const backResult = applyBackwardConstraint(
        formatDateISO(ls), formatDateISO(lf), duration,
        activity.constraintType, activity.constraintDate,
        activity.constraintMode, calendar,
      );
      ls = parseDateISO(backResult.ls);
      lf = parseDateISO(backResult.lf);
    }

    lateStartCon.set(id, formatDateISO(ls));
    lateFinishCon.set(id, formatDateISO(lf));
  }

  // -- Backward pass #2 (network-driven, no constraint adjustments) -----------

  const lateStartNet = new Map<string, string>();
  const lateFinishNet = new Map<string, string>();

  for (let i = graph.topologicalOrder.length - 1; i >= 0; i--) {
    const id = graph.topologicalOrder[i]!;
    const duration = durationMap.get(id) ?? 1;
    const succs = graph.successors.get(id) ?? [];

    let lf: Date;
    if (succs.length === 0) {
      lf = new Date(projectEndDate);
    } else {
      lf = new Date(8640000000000000);
      for (const succ of succs) {
        const succLS = parseDateISO(lateStartNet.get(succ.id)!);
        const offset = 1 + succ.lagDays;
        const candidateLF = offset >= 0
          ? subtractWorkingDays(succLS, offset, calendar)
          : addWorkingDays(succLS, -offset, calendar);
        if (candidateLF < lf) lf = candidateLF;
      }
    }

    const ls = subtractWorkingDays(lf, duration, calendar);
    lateStartNet.set(id, formatDateISO(ls));
    lateFinishNet.set(id, formatDateISO(lf));
  }

  // -- Float, critical path, conflict detection --------------------------------

  const totalFloatMap = new Map<string, number>();
  for (const id of graph.topologicalOrder) {
    const esDate = parseDateISO(networkStart.get(id)!);
    const lsDate = parseDateISO(lateStartNet.get(id)!);
    totalFloatMap.set(id, countWorkingDays(esDate, lsDate, calendar));
  }

  // Detect SNLT/FNLT and soft constraint conflicts using network-driven late dates
  for (const id of graph.topologicalOrder) {
    const activity = activityMap.get(id)!;
    if (!activity.constraintType || !activity.constraintDate || !activity.constraintMode) continue;

    const conflict = detectConstraintConflict(
      networkStart.get(id)!, networkEnd.get(id)!,
      lateStartNet.get(id)!, lateFinishNet.get(id)!,
      activity.constraintType, activity.constraintDate,
      activity.constraintMode, activity.id, activity.name, calendar,
    );
    if (conflict) conflicts.push(conflict);
  }

  // -- Build result -----------------------------------------------------------

  const scheduledActivities: ScheduledActivity[] = [];
  for (const id of graph.topologicalOrder) {
    const activity = activityMap.get(id)!;
    const duration = durationMap.get(id) ?? 1;
    const isActual = activity.status === "complete" && activity.actualDuration != null;

    scheduledActivities.push({
      activityId: id,
      name: activity.name,
      duration,
      startDate: formatDateISO(startDates.get(id)!),
      endDate: formatDateISO(endDates.get(id)!),
      isActual,
      lateStart: lateStartCon.get(id),
      lateFinish: lateFinishCon.get(id),
      lateStartNet: lateStartNet.get(id),
      lateFinishNet: lateFinishNet.get(id),
      totalFloat: totalFloatMap.get(id),
    });
  }

  // Total duration is the critical path length (consistent with Monte Carlo computation)
  const totalDurationDays = computeCriticalPathDuration(graph, durationMap);

  return {
    activities: scheduledActivities,
    totalDurationDays,
    projectEndDate: projectEndISO,
    constraintConflicts: conflicts.length > 0 ? conflicts : undefined,
  };
}
