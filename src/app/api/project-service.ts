// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import type {
  Project,
  Scenario,
  Activity,
  Calendar,
  ScenarioSettings,
} from "@domain/models/types";
import {
  SCHEMA_VERSION,
  DEFAULT_SCENARIO_SETTINGS,
  BASELINE_SCENARIO_NAME,
} from "@domain/models/types";
import { formatDateISO } from "@core/calendar/calendar";
import { computeHeuristic } from "@core/estimation/heuristic";
import { generateId } from "./id";

// -- Project CRUD ------------------------------------------------------------

export function createProject(
  name: string,
  startDate?: string,
  settingsOverrides?: Partial<ScenarioSettings>
): Project {
  const resolvedStartDate = startDate ?? formatDateISO(new Date());
  return {
    id: generateId(),
    name,
    createdAt: new Date().toISOString(),
    schemaVersion: SCHEMA_VERSION,
    scenarios: [createScenario(BASELINE_SCENARIO_NAME, resolvedStartDate, settingsOverrides)],
  };
}

// -- Scenario CRUD -----------------------------------------------------------

export function createScenario(
  name: string,
  startDate: string,
  settingsOverrides?: Partial<ScenarioSettings>
): Scenario {
  return {
    id: generateId(),
    name,
    startDate,
    activities: [],
    dependencies: [],
    milestones: [],
    settings: {
      ...DEFAULT_SCENARIO_SETTINGS,
      rngSeed: generateId(), // Fresh seed per scenario
      ...settingsOverrides,
    },
  };
}

export function addScenarioToProject(
  project: Project,
  scenario: Scenario
): Project {
  return {
    ...project,
    scenarios: [...project.scenarios, scenario],
  };
}

export function removeScenarioFromProject(
  project: Project,
  scenarioId: string
): Project {
  return {
    ...project,
    scenarios: project.scenarios.filter((s) => s.id !== scenarioId),
  };
}

export function updateScenario(
  project: Project,
  scenarioId: string,
  updater: (scenario: Scenario) => Scenario
): Project {
  return {
    ...project,
    scenarios: project.scenarios.map((s) =>
      s.id === scenarioId ? updater(s) : s
    ),
  };
}

// -- Scenario Cloning --------------------------------------------------------

export interface CloneOptions {
  dropCompleted?: boolean;
}

export function cloneScenario(
  scenario: Scenario,
  newName: string,
  options: CloneOptions = {}
): Scenario {
  // First pass: clone all activities with new IDs, building old→new map
  const oldToNewId = new Map<string, string>();
  let activities = scenario.activities.map((a) => {
    const newId = generateId();
    oldToNewId.set(a.id, newId);
    return {
      ...a,
      id: newId,
      checklist: a.checklist?.map((item) => ({ ...item, id: generateId() })),
      deliverables: a.deliverables?.map((item) => ({ ...item, id: generateId() })),
    };
  });

  if (options.dropCompleted) {
    // Remove completed activities and clear their ID mappings
    const removed = new Set(
      activities.filter((a) => a.status === "complete").map((a) => a.id)
    );
    for (const [oldId, newId] of oldToNewId) {
      if (removed.has(newId)) oldToNewId.delete(oldId);
    }
    activities = activities
      .filter((a) => a.status !== "complete")
      .map((a) => ({
        ...a,
        status: "planned" as const,
        actualDuration: undefined,
      }));
  }

  // Filter out deps referencing removed activities (when dropCompleted is true)
  const clonedDeps = scenario.dependencies
    .map((dep) => ({
      ...dep,
      fromActivityId: oldToNewId.get(dep.fromActivityId),
      toActivityId: oldToNewId.get(dep.toActivityId),
    }))
    .filter(
      (dep): dep is typeof dep & { fromActivityId: string; toActivityId: string } =>
        dep.fromActivityId !== undefined && dep.toActivityId !== undefined
    );

  // Clone milestones with new IDs, building old→new map
  const oldToNewMilestoneId = new Map<string, string>();
  const clonedMilestones = scenario.milestones.map((m) => {
    const newId = generateId();
    oldToNewMilestoneId.set(m.id, newId);
    return { ...m, id: newId };
  });

  // Remap activity milestone references
  activities = activities.map((a) => ({
    ...a,
    milestoneId: a.milestoneId ? oldToNewMilestoneId.get(a.milestoneId) ?? undefined : undefined,
    startsAtMilestoneId: a.startsAtMilestoneId ? oldToNewMilestoneId.get(a.startsAtMilestoneId) ?? undefined : undefined,
  }));

  return {
    id: generateId(),
    name: newName,
    startDate: scenario.startDate,
    activities,
    dependencies: clonedDeps,
    milestones: clonedMilestones,
    settings: {
      ...scenario.settings,
      rngSeed: generateId(), // New seed for clone
    },
    notes: scenario.notes,
    // simulationResults are NOT cloned — stale
  };
}

// -- Activity CRUD -----------------------------------------------------------

export function createActivity(
  name: string,
  settings: ScenarioSettings
): Activity {
  const ml = 1;
  const { min, max } = settings.heuristicEnabled
    ? computeHeuristic(ml, settings.heuristicMinPercent, settings.heuristicMaxPercent)
    : { min: 1, max: 1 };
  return {
    id: generateId(),
    name,
    min,
    mostLikely: ml,
    max,
    confidenceLevel: settings.defaultConfidenceLevel,
    distributionType: settings.defaultDistributionType,
    status: "planned",
  };
}

export function addActivityToScenario(
  scenario: Scenario,
  activity: Activity
): Scenario {
  return {
    ...scenario,
    activities: [...scenario.activities, activity],
    simulationResults: undefined, // Invalidate stale results
  };
}

export function removeActivityFromScenario(
  scenario: Scenario,
  activityId: string
): Scenario {
  return {
    ...scenario,
    activities: scenario.activities.filter((a) => a.id !== activityId),
    dependencies: scenario.dependencies.filter(
      (d) => d.fromActivityId !== activityId && d.toActivityId !== activityId
    ),
    simulationResults: undefined, // Invalidate stale results
  };
}

export function updateActivity(
  scenario: Scenario,
  activityId: string,
  updates: Partial<Activity>
): Scenario {
  return {
    ...scenario,
    activities: scenario.activities.map((a) =>
      a.id === activityId ? { ...a, ...updates } : a
    ),
    simulationResults: undefined, // Invalidate stale results
  };
}

export function reorderActivities(
  scenario: Scenario,
  fromIndex: number,
  toIndex: number
): Scenario {
  const activities = [...scenario.activities];
  const [moved] = activities.splice(fromIndex, 1);
  if (!moved) return scenario;
  activities.splice(toIndex, 0, moved);
  return {
    ...scenario,
    activities,
    simulationResults: undefined, // Invalidate stale results
  };
}

export function reorderScenarios(
  project: Project,
  fromIndex: number,
  toIndex: number
): Project {
  const scenarios = [...project.scenarios];
  const [moved] = scenarios.splice(fromIndex, 1);
  if (!moved) return project;
  scenarios.splice(toIndex, 0, moved);
  return { ...project, scenarios };
}

// -- Rename ------------------------------------------------------------------

export function renameProject(project: Project, name: string): Project {
  return { ...project, name };
}

export function renameScenario(
  project: Project,
  scenarioId: string,
  name: string
): Project {
  return {
    ...project,
    scenarios: project.scenarios.map((s) =>
      s.id === scenarioId ? { ...s, name } : s
    ),
  };
}

// -- Project Fields ----------------------------------------------------------

export function updateProjectFields(
  project: Project,
  updates: Partial<Pick<Project, "targetFinishDate" | "showTargetOnGantt" | "showActivityIds" | "tileColor">>
): Project {
  return { ...project, ...updates };
}

// -- Calendar ----------------------------------------------------------------

export function setGlobalCalendar(
  project: Project,
  calendar: Calendar | undefined
): Project {
  return {
    ...project,
    globalCalendarOverride: calendar,
  };
}

// -- Dependencies (re-exported from dependency-service.ts) -------------------

export {
  addDependency,
  removeDependency,
  updateDependencyLag,
  updateDependencyType,
  removeActivitiesDeps,
} from "./dependency-service";

// -- Milestones (re-exported from milestone-service.ts) ----------------------

export {
  addMilestone,
  removeMilestone,
  updateMilestone,
  assignActivityToMilestone,
  setActivityStartsAtMilestone,
} from "./milestone-service";
