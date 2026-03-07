import type { Scenario, Milestone } from "@domain/models/types";
import { generateId } from "./id";

export function addMilestone(
  scenario: Scenario,
  name: string,
  targetDate: string
): Scenario {
  const milestone: Milestone = { id: generateId(), name, targetDate };
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
  return {
    ...scenario,
    activities: scenario.activities.map((a) =>
      a.id === activityId
        ? { ...a, milestoneId: milestoneId ?? undefined }
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
