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
import { computeMilestoneBuffer } from "@core/schedule/buffer";
import {
  addWorkingDays,
  countWorkingDays,
  parseDateISO,
  formatDateISO,
  isWorkingDay,
} from "@core/calendar/calendar";

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
  calendar?: Calendar
): Map<string, MilestoneBufferInfo> | null {
  return useMemo(() => {
    if (milestones.length === 0) return null;

    const result = new Map<string, MilestoneBufferInfo>();
    const scheduledMap = new Map(scheduledActivities.map((sa) => [sa.activityId, sa]));

    for (const milestone of milestones) {
      // Find activities assigned to this milestone
      const milestoneActivities = activities.filter((a) => a.milestoneId === milestone.id);
      if (milestoneActivities.length === 0) {
        result.set(milestone.id, {
          milestone,
          deterministicEndDate: milestone.targetDate,
          deterministicDuration: 0,
          bufferedEndDate: null,
          bufferDays: null,
          slackDays: null,
          health: "green",
        });
        continue;
      }

      // Find latest end date among milestone's scheduled activities
      let latestEndDate = parseDateISO(projectStartDate);
      for (const act of milestoneActivities) {
        const scheduled = scheduledMap.get(act.id);
        if (scheduled) {
          const endDate = parseDateISO(scheduled.endDate);
          if (endDate > latestEndDate) {
            latestEndDate = endDate;
          }
        }
      }

      const deterministicEndDate = formatDateISO(latestEndDate);
      const projectStart = parseDateISO(projectStartDate);
      const deterministicDuration = countWorkingDays(projectStart, latestEndDate, calendar);

      // Compute buffer from milestone MC results
      const milestoneResults = simulationResults?.milestoneResults?.[milestone.id];
      let bufferedEndDate: string | null = null;
      let bufferDays: number | null = null;
      let slackDays: number | null = null;

      if (milestoneResults) {
        const bufferResult = computeMilestoneBuffer(
          deterministicDuration,
          milestoneResults.percentiles,
          projectProbabilityTarget
        );
        if (bufferResult) {
          bufferDays = bufferResult.bufferDays;
          // Compute buffered end date by adding buffer days to deterministic end
          const bufferedEnd = addWorkingDays(latestEndDate, bufferResult.bufferDays, calendar);
          bufferedEndDate = formatDateISO(bufferedEnd);

          // Compute slack: working days between buffered end and target date
          const targetDate = parseDateISO(milestone.targetDate);
          while (!isWorkingDay(targetDate, calendar)) {
            targetDate.setDate(targetDate.getDate() + 1);
          }
          if (bufferedEnd <= targetDate) {
            slackDays = countWorkingDays(bufferedEnd, targetDate, calendar);
          } else {
            slackDays = -countWorkingDays(targetDate, bufferedEnd, calendar);
          }
        }
      }

      const health: "green" | "amber" | "red" =
        slackDays === null ? "green" :
        slackDays >= 5 ? "green" :
        slackDays >= 0 ? "amber" : "red";

      result.set(milestone.id, {
        milestone,
        deterministicEndDate,
        deterministicDuration,
        bufferedEndDate,
        bufferDays,
        slackDays,
        health,
      });
    }

    return result;
  }, [milestones, scheduledActivities, activities, simulationResults, projectStartDate, projectProbabilityTarget, calendar]);
}
