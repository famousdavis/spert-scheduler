import type {
  Project,
  Scenario,
  Activity,
  ActivityDependency,
  Calendar,
  DependencyType,
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
    return { ...a, id: newId };
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

  return {
    id: generateId(),
    name: newName,
    startDate: scenario.startDate,
    activities,
    dependencies: clonedDeps,
    settings: {
      ...scenario.settings,
      rngSeed: generateId(), // New seed for clone
    },
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

// -- Dependencies ------------------------------------------------------------

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
