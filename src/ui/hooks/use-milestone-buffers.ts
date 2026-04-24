// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useMemo } from "react";
import type {
  Activity,
  Calendar,
  Milestone,
  MilestoneBufferInfo,
  ScheduledActivity,
  SimulationRun,
} from "@domain/models/types";
import type { WorkCalendar } from "@core/calendar/work-calendar";
import { computeMilestoneBuffer } from "@core/schedule/buffer";
import { computeMilestoneHealth } from "@domain/helpers/format-labels";
import {
  addWorkingDays,
  countWorkingDays,
  parseDateISO,
  formatDateISO,
  isWorkingDay,
} from "@core/calendar/calendar";

interface MilestoneSlackResult {
  bufferedEndDate: string;
  slackDays: number;
}

interface MilestoneComputeContext {
  projectStartDate: string;
  projectProbabilityTarget: number;
  calendar: WorkCalendar | Calendar | undefined;
}

function computeMilestoneSlack(
  bufferResult: { bufferDays: number },
  latestEndDate: Date,
  targetDate: Date,
  calendar: WorkCalendar | Calendar | undefined,
): MilestoneSlackResult {
  const bufferedEnd = addWorkingDays(latestEndDate, bufferResult.bufferDays, calendar);
  const bufferedEndDate = formatDateISO(bufferedEnd);

  const adjustedTarget = new Date(targetDate);
  while (!isWorkingDay(adjustedTarget, calendar)) {
    adjustedTarget.setDate(adjustedTarget.getDate() + 1);
  }

  const slackDays = bufferedEnd <= adjustedTarget
    ? countWorkingDays(bufferedEnd, adjustedTarget, calendar)
    : -countWorkingDays(adjustedTarget, bufferedEnd, calendar);

  return { bufferedEndDate, slackDays };
}

function computeSingleMilestoneInfo(
  milestone: Milestone,
  milestoneActivities: Activity[],
  scheduledMap: Map<string, ScheduledActivity>,
  simulationResults: SimulationRun | undefined,
  ctx: MilestoneComputeContext,
): MilestoneBufferInfo {
  if (milestoneActivities.length === 0) {
    return {
      milestone,
      deterministicEndDate: milestone.targetDate,
      deterministicDuration: 0,
      bufferedEndDate: null,
      bufferDays: null,
      slackDays: null,
      health: "green",
    };
  }

  let latestEndDate = parseDateISO(ctx.projectStartDate);
  for (const act of milestoneActivities) {
    const scheduled = scheduledMap.get(act.id);
    if (scheduled) {
      const endDate = parseDateISO(scheduled.endDate);
      if (endDate > latestEndDate) latestEndDate = endDate;
    }
  }

  const deterministicEndDate = formatDateISO(latestEndDate);
  const projectStart = parseDateISO(ctx.projectStartDate);
  const deterministicDuration = countWorkingDays(projectStart, latestEndDate, ctx.calendar) + 1;

  const milestoneResults = simulationResults?.milestoneResults?.[milestone.id];
  let bufferedEndDate: string | null = null;
  let bufferDays: number | null = null;
  let slackDays: number | null = null;

  if (milestoneResults) {
    const bufferResult = computeMilestoneBuffer(
      deterministicDuration,
      milestoneResults.percentiles,
      ctx.projectProbabilityTarget,
    );
    if (bufferResult) {
      bufferDays = bufferResult.bufferDays;
      const slack = computeMilestoneSlack(
        bufferResult,
        latestEndDate,
        parseDateISO(milestone.targetDate),
        ctx.calendar,
      );
      bufferedEndDate = slack.bufferedEndDate;
      slackDays = slack.slackDays;
    }
  }

  return {
    milestone,
    deterministicEndDate,
    deterministicDuration,
    bufferedEndDate,
    bufferDays,
    slackDays,
    health: computeMilestoneHealth(slackDays),
  };
}

/**
 * Compute milestone buffer info for each milestone.
 *
 * For each milestone:
 * 1. Find the latest end date among its assigned activities
 * 2. Compute buffer from milestone MC results
 * 3. Compute slack (working days between buffered end and target date)
 * 4. Determine health (green ≥ 5d, amber 0-4d, red < 0)
 */
export function useMilestoneBuffers(
  milestones: Milestone[],
  scheduledActivities: ScheduledActivity[],
  activities: Activity[],
  simulationResults: SimulationRun | undefined,
  projectStartDate: string,
  projectProbabilityTarget: number,
  calendar?: WorkCalendar | Calendar
): Map<string, MilestoneBufferInfo> | null {
  return useMemo(() => {
    if (milestones.length === 0) return null;

    const result = new Map<string, MilestoneBufferInfo>();
    const scheduledMap = new Map(scheduledActivities.map((sa) => [sa.activityId, sa]));
    const ctx: MilestoneComputeContext = {
      projectStartDate,
      projectProbabilityTarget,
      calendar,
    };

    for (const milestone of milestones) {
      const milestoneActivities = activities.filter((a) => a.milestoneId === milestone.id);
      result.set(
        milestone.id,
        computeSingleMilestoneInfo(milestone, milestoneActivities, scheduledMap, simulationResults, ctx),
      );
    }

    return result;
  }, [milestones, scheduledActivities, activities, simulationResults, projectStartDate, projectProbabilityTarget, calendar]);
}
