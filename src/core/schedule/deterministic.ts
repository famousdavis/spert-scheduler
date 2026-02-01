import type {
  Activity,
  Calendar,
  DeterministicSchedule,
  ScheduledActivity,
} from "@domain/models/types";
import { createDistributionForActivity } from "@core/distributions/factory";
import {
  addWorkingDays,
  formatDateISO,
  parseDateISO,
  isWorkingDay,
} from "@core/calendar/calendar";

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
      return Math.max(1, Math.ceil(dist.inverseCDF(probabilityTarget)));
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
