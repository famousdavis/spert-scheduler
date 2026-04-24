// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import type { Activity, Milestone, Calendar } from "@domain/models/types";
import type { WorkCalendar } from "@core/calendar/work-calendar";
import { parseDateISO, isWorkingDay, countWorkingDays } from "@core/calendar/calendar";

export interface MilestoneSimParams {
  milestoneActivityIds?: Record<string, string[]>;
  activityEarliestStart?: Record<string, number>;
}

function snapForwardToWorkingDay(date: Date, calendar?: WorkCalendar | Calendar): void {
  while (!isWorkingDay(date, calendar)) {
    date.setDate(date.getDate() + 1);
  }
}

function buildMilestoneActivityMap(
  activities: Activity[],
  milestones: Milestone[],
): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const m of milestones) {
    const assigned = activities.filter((a) => a.milestoneId === m.id).map((a) => a.id);
    if (assigned.length > 0) {
      map[m.id] = assigned;
    }
  }
  return map;
}

function computeActivityEarliestStartOffset(
  activity: Activity,
  milestones: Milestone[],
  projStart: Date,
  calendar?: WorkCalendar | Calendar,
): number | undefined {
  if (!activity.startsAtMilestoneId) return undefined;
  const ms = milestones.find((m) => m.id === activity.startsAtMilestoneId);
  if (!ms) return undefined;
  const msDate = parseDateISO(ms.targetDate);
  snapForwardToWorkingDay(msDate, calendar);
  return countWorkingDays(projStart, msDate, calendar);
}

/**
 * Build simulation parameters for milestone-aware dependency scheduling.
 * Maps activities to their milestones and computes earliest-start offsets
 * (in working days from project start) for activities constrained by
 * `startsAtMilestoneId`.
 *
 * Non-working day handling: if the project start or a milestone target date
 * falls on a weekend/holiday, it snaps forward to the next working day
 * before computing the offset.
 */
export function buildMilestoneSimParams(
  activities: Activity[],
  milestones: Milestone[],
  startDate: string,
  calendar?: WorkCalendar | Calendar
): MilestoneSimParams {
  if (!milestones || milestones.length === 0) return {};

  const milestoneActivityIds = buildMilestoneActivityMap(activities, milestones);

  const projStart = parseDateISO(startDate);
  snapForwardToWorkingDay(projStart, calendar);

  const activityEarliestStart: Record<string, number> = {};
  for (const a of activities) {
    const offset = computeActivityEarliestStartOffset(a, milestones, projStart, calendar);
    if (offset !== undefined) {
      activityEarliestStart[a.id] = offset;
    }
  }

  return {
    milestoneActivityIds: Object.keys(milestoneActivityIds).length > 0 ? milestoneActivityIds : undefined,
    activityEarliestStart: Object.keys(activityEarliestStart).length > 0 ? activityEarliestStart : undefined,
  };
}
