// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import type { Scenario, Milestone } from "@domain/models/types";
import { generateId } from "./id";

export function addMilestone(
  scenario: Scenario,
  name: string,
  targetDate: string,
  id: string = generateId()
): Scenario {
  const milestone: Milestone = { id, name, targetDate };
  return {
    ...scenario,
    milestones: [...scenario.milestones, milestone],
    simulationResults: undefined,
  };
}

export function removeMilestone(
  scenario: Scenario,
  milestoneId: string
): Scenario {
  return {
    ...scenario,
    milestones: scenario.milestones.filter((m) => m.id !== milestoneId),
    activities: scenario.activities.map((a) => ({
      ...a,
      milestoneId: a.milestoneId === milestoneId ? undefined : a.milestoneId,
      startsAtMilestoneId: a.startsAtMilestoneId === milestoneId ? undefined : a.startsAtMilestoneId,
    })),
    simulationResults: undefined,
  };
}

export function updateMilestone(
  scenario: Scenario,
  milestoneId: string,
  updates: Partial<Omit<Milestone, "id">>
): Scenario {
  const milestone = scenario.milestones.find((m) => m.id === milestoneId);
  if (!milestone) return scenario; // existence guard (ref-equal)
  // Value-equality: every provided field already matches → no-op (ref-equal).
  const keys = Object.keys(updates) as Array<keyof Omit<Milestone, "id">>;
  if (keys.every((k) => updates[k] === milestone[k])) return scenario;
  return {
    ...scenario,
    milestones: scenario.milestones.map((m) =>
      m.id === milestoneId ? { ...m, ...updates } : m
    ),
    simulationResults: undefined,
  };
}

export function assignActivityToMilestone(
  scenario: Scenario,
  activityId: string,
  milestoneId: string | null
): Scenario {
  const activity = scenario.activities.find((a) => a.id === activityId);
  if (!activity) return scenario; // activity must exist (ref-equal)
  // When assigning (not unassigning), the milestone must exist too.
  if (milestoneId !== null && !scenario.milestones.some((m) => m.id === milestoneId)) {
    return scenario;
  }
  const nextMilestoneId = milestoneId ?? undefined;
  if (activity.milestoneId === nextMilestoneId) return scenario; // value-equality (ref-equal)
  return {
    ...scenario,
    activities: scenario.activities.map((a) =>
      a.id === activityId
        ? { ...a, milestoneId: nextMilestoneId }
        : a
    ),
    simulationResults: undefined,
  };
}

export function setActivityStartsAtMilestone(
  scenario: Scenario,
  activityId: string,
  milestoneId: string | null
): Scenario {
  return {
    ...scenario,
    activities: scenario.activities.map((a) =>
      a.id === activityId
        ? { ...a, startsAtMilestoneId: milestoneId ?? undefined }
        : a
    ),
    simulationResults: undefined,
  };
}
