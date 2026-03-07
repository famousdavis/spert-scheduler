import type { Scenario, ActivityDependency, DependencyType } from "@domain/models/types";

export function addDependency(
  scenario: Scenario,
  fromActivityId: string,
  toActivityId: string,
  type: DependencyType = "FS",
  lagDays = 0
): Scenario {
  const dep: ActivityDependency = { fromActivityId, toActivityId, type, lagDays };
  return {
    ...scenario,
    dependencies: [...scenario.dependencies, dep],
    simulationResults: undefined,
  };
}

export function removeDependency(
  scenario: Scenario,
  fromActivityId: string,
  toActivityId: string
): Scenario {
  return {
    ...scenario,
    dependencies: scenario.dependencies.filter(
      (d) => !(d.fromActivityId === fromActivityId && d.toActivityId === toActivityId)
    ),
    simulationResults: undefined,
  };
}

export function updateDependencyLag(
  scenario: Scenario,
  fromActivityId: string,
  toActivityId: string,
  lagDays: number
): Scenario {
  return {
    ...scenario,
    dependencies: scenario.dependencies.map((d) =>
      d.fromActivityId === fromActivityId && d.toActivityId === toActivityId
        ? { ...d, lagDays }
        : d
    ),
    simulationResults: undefined,
  };
}

/**
 * Remove all dependencies referencing any of the given activity IDs.
 * Used by bulk delete.
 */
export function removeActivitiesDeps(
  scenario: Scenario,
  activityIds: string[]
): Scenario {
  const idSet = new Set(activityIds);
  return {
    ...scenario,
    dependencies: scenario.dependencies.filter(
      (d) => !idSet.has(d.fromActivityId) && !idSet.has(d.toActivityId)
    ),
  };
}
