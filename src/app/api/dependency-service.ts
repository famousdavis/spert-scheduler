// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import type { Scenario, ActivityDependency, DependencyType } from "@domain/models/types";
import { detectCycle } from "@core/schedule/dependency-graph";

export function addDependency(
  scenario: Scenario,
  fromActivityId: string,
  toActivityId: string,
  type: DependencyType = "FS",
  lagDays = 0
): Scenario {
  // Guard sequence — any failure is a no-op that returns the same reference,
  // so the AI batch applier's ref-equality confirmation can treat it as skipped.
  const activityIds = scenario.activities.map((a) => a.id);
  const idSet = new Set(activityIds);
  // Both endpoints must exist.
  if (!idSet.has(fromActivityId) || !idSet.has(toActivityId)) return scenario;
  // No self-reference.
  if (fromActivityId === toActivityId) return scenario;
  // No edge already exists for this pair, regardless of requested type.
  if (
    scenario.dependencies.some(
      (d) => d.fromActivityId === fromActivityId && d.toActivityId === toActivityId
    )
  ) {
    return scenario;
  }
  const dep: ActivityDependency = { fromActivityId, toActivityId, type, lagDays };
  // No cycle introduced by the trial edge.
  if (detectCycle(activityIds, [...scenario.dependencies, dep])) return scenario;
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
  // Match guard: no such edge → no-op (ref-equal).
  const exists = scenario.dependencies.some(
    (d) => d.fromActivityId === fromActivityId && d.toActivityId === toActivityId
  );
  if (!exists) return scenario;
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
  const target = scenario.dependencies.find(
    (d) => d.fromActivityId === fromActivityId && d.toActivityId === toActivityId
  );
  if (!target) return scenario; // match guard (ref-equal)
  if (target.lagDays === lagDays) return scenario; // value-equality guard (ref-equal)
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

export function updateDependencyType(
  scenario: Scenario,
  fromActivityId: string,
  toActivityId: string,
  type: DependencyType
): Scenario {
  const target = scenario.dependencies.find(
    (d) => d.fromActivityId === fromActivityId && d.toActivityId === toActivityId
  );
  if (!target) return scenario; // match guard (ref-equal)
  if (target.type === type) return scenario; // value-equality guard (ref-equal)
  return {
    ...scenario,
    dependencies: scenario.dependencies.map((d) =>
      d.fromActivityId === fromActivityId && d.toActivityId === toActivityId
        ? { ...d, type }
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
