import type {
  Activity,
  ActivityDependency,
  Calendar,
  DeterministicSchedule,
  Milestone,
  ScheduledActivity,
} from "@domain/models/types";
import { createDistributionForActivity } from "@core/distributions/factory";
import {
  addWorkingDays,
  subtractWorkingDays,
  formatDateISO,
  parseDateISO,
  isWorkingDay,
} from "@core/calendar/calendar";
import { buildDependencyGraph, computeCriticalPathDuration } from "./dependency-graph";

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
    .map((a) => {
      const dist = createDistributionForActivity(a);
      const base = Math.max(1, Math.ceil(dist.inverseCDF(probabilityTarget)));
      // In-progress with elapsed time: floor is at least elapsed + 1
      if (a.status === "inProgress" && a.actualDuration != null) {
        return Math.max(a.actualDuration + 1, base);
      }
      return base;
    });
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
  calendar?: Calendar
): DeterministicSchedule {
  const scheduledActivities: ScheduledActivity[] = [];

  let currentDate = parseDateISO(startDate);

  // Ensure start date is a working day
  while (!isWorkingDay(currentDate, calendar)) {
    currentDate.setDate(currentDate.getDate() + 1);
  }

  for (const activity of activities) {
    let duration: number;
    let isActual = false;

    if (activity.status === "complete" && activity.actualDuration != null) {
      duration = activity.actualDuration;
      isActual = true;
    } else if (activity.status === "inProgress" && activity.actualDuration != null) {
      const dist = createDistributionForActivity(activity);
      duration = Math.max(activity.actualDuration + 1, Math.ceil(dist.inverseCDF(percentile)));
    } else {
      const dist = createDistributionForActivity(activity);
      duration = Math.ceil(dist.inverseCDF(percentile));
      duration = Math.max(duration, 1); // minimum 1 working day
    }

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
      result.set(activity.id, { solidDays: activity.actualDuration, hatchedDays: 0 });
    } else if (activity.status === "inProgress" && activity.actualDuration != null) {
      const dist = createDistributionForActivity(activity);
      const floor = activity.actualDuration + 1;
      const solidDays = Math.max(floor, Math.ceil(dist.inverseCDF(activityTarget)));
      const projectDays = Math.max(floor, Math.ceil(dist.inverseCDF(projectTarget)));
      const hatchedDays = Math.max(0, projectDays - solidDays);
      result.set(activity.id, { solidDays, hatchedDays });
    } else {
      const dist = createDistributionForActivity(activity);
      const solidDays = Math.max(1, Math.ceil(dist.inverseCDF(activityTarget)));
      const projectDays = Math.max(1, Math.ceil(dist.inverseCDF(projectTarget)));
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
    if (activity.status === "complete" && activity.actualDuration != null) {
      durations.set(activity.id, activity.actualDuration);
    } else if (activity.status === "inProgress" && activity.actualDuration != null) {
      const dist = createDistributionForActivity(activity);
      const d = Math.max(activity.actualDuration + 1, Math.ceil(dist.inverseCDF(percentile)));
      durations.set(activity.id, d);
    } else {
      const dist = createDistributionForActivity(activity);
      const d = Math.max(1, Math.ceil(dist.inverseCDF(percentile)));
      durations.set(activity.id, d);
    }
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
  calendar?: Calendar,
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

  // Schedule each activity in topological order
  const startDates = new Map<string, Date>();
  const endDates = new Map<string, Date>();
  const scheduledActivities: ScheduledActivity[] = [];

  for (const id of graph.topologicalOrder) {
    const activity = activityMap.get(id)!;
    const duration = durationMap.get(id) ?? 1;
    const isActual = activity.status === "complete" && activity.actualDuration != null;

    const preds = graph.predecessors.get(id) ?? [];
    let activityStart: Date;

    if (preds.length === 0) {
      // Root activity: starts at project start
      activityStart = new Date(projectStart);
    } else {
      // Starts after all predecessors finish + lag
      let latestDate = new Date(0); // epoch
      for (const pred of preds) {
        const predEnd = endDates.get(pred.id)!;
        // Next working day after predecessor ends, plus lag days
        // offset = 1 (next day after end) + lagDays
        const offset = 1 + pred.lagDays;
        let candidateStart: Date;
        if (offset >= 0) {
          candidateStart = addWorkingDays(predEnd, offset, calendar);
        } else {
          // Negative offset (lead time): subtract working days from predecessor end
          candidateStart = subtractWorkingDays(predEnd, -offset, calendar);
          // Don't start before project start
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

    // Apply startsAtMilestoneId constraint: activity cannot start before milestone target date
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

    startDates.set(id, activityStart);
    endDates.set(id, activityEnd);

    scheduledActivities.push({
      activityId: id,
      name: activity.name,
      duration,
      startDate: formatDateISO(activityStart),
      endDate: formatDateISO(activityEnd),
      isActual,
    });
  }

  // Project end is the latest end date among all activities
  let projectEndDate = projectStart;
  for (const endDate of endDates.values()) {
    if (endDate > projectEndDate) projectEndDate = endDate;
  }

  // Total duration is the critical path length (consistent with Monte Carlo computation)
  const totalDurationDays = computeCriticalPathDuration(graph, durationMap);

  return {
    activities: scheduledActivities,
    totalDurationDays,
    projectEndDate: formatDateISO(projectEndDate),
  };
}
