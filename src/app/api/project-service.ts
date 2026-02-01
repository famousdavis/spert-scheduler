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
} from "@domain/models/types";
import { generateId } from "./id";

// -- Project CRUD ------------------------------------------------------------

export function createProject(name: string): Project {
  return {
    id: generateId(),
    name,
    createdAt: new Date().toISOString(),
    schemaVersion: SCHEMA_VERSION,
    scenarios: [],
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
  let activities = scenario.activities.map((a) => ({
    ...a,
    id: generateId(),
  }));

  if (options.dropCompleted) {
    activities = activities
      .filter((a) => a.status !== "complete")
      .map((a) => ({
        ...a,
        status: "planned" as const,
        actualDuration: undefined,
      }));
  }

  return {
    id: generateId(),
    name: newName,
    startDate: scenario.startDate,
    activities,
    dependencies: [],
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
  return {
    id: generateId(),
    name,
    min: 1,
    mostLikely: 1,
    max: 1,
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
