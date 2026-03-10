// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import type { Activity, Milestone, Calendar } from "@domain/models/types";
import { parseDateISO, isWorkingDay, countWorkingDays } from "@core/calendar/calendar";

export interface MilestoneSimParams {
  milestoneActivityIds?: Record<string, string[]>;
  activityEarliestStart?: Record<string, number>;
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
  calendar?: Calendar
): MilestoneSimParams {
  if (!milestones || milestones.length === 0) return {};

  const milestoneActivityIds: Record<string, string[]> = {};
  const activityEarliestStart: Record<string, number> = {};

  for (const m of milestones) {
    const assigned = activities.filter((a) => a.milestoneId === m.id).map((a) => a.id);
    if (assigned.length > 0) {
      milestoneActivityIds[m.id] = assigned;
    }
  }

  // Build earliest start offsets for activities with startsAtMilestoneId
  const projStart = parseDateISO(startDate);
  while (!isWorkingDay(projStart, calendar)) {
    projStart.setDate(projStart.getDate() + 1);
  }

  for (const a of activities) {
    if (a.startsAtMilestoneId) {
      const ms = milestones.find((m) => m.id === a.startsAtMilestoneId);
      if (ms) {
        const msDate = parseDateISO(ms.targetDate);
        while (!isWorkingDay(msDate, calendar)) {
          msDate.setDate(msDate.getDate() + 1);
        }
        const offset = countWorkingDays(projStart, msDate, calendar);
        activityEarliestStart[a.id] = offset;
      }
    }
  }

  return {
    milestoneActivityIds: Object.keys(milestoneActivityIds).length > 0 ? milestoneActivityIds : undefined,
    activityEarliestStart: Object.keys(activityEarliestStart).length > 0 ? activityEarliestStart : undefined,
  };
}
