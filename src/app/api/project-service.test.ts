// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import {
  createProject,
  createScenario,
  cloneScenario,
  createActivity,
  addActivityToScenario,
  addScenarioToProject,
  updateActivity,
  reorderActivities,
  removeActivityFromScenario,
} from "./project-service";
import type { Scenario, SimulationRun } from "@domain/models/types";
import { DEFAULT_SCENARIO_SETTINGS } from "@domain/models/types";

describe("createProject", () => {
  it("creates a project with a unique ID", () => {
    const p1 = createProject("Project A");
    const p2 = createProject("Project B");
    expect(p1.id).toBeTruthy();
    expect(p1.id).not.toBe(p2.id);
  });

  it("auto-creates a Baseline scenario", () => {
    const project = createProject("Test");
    expect(project.scenarios).toHaveLength(1);
    expect(project.scenarios[0]!.name).toBe("Baseline");
    expect(project.scenarios[0]!.activities).toEqual([]);
  });

  it("uses provided startDate for Baseline", () => {
    const project = createProject("Test", "2025-06-01");
    expect(project.scenarios[0]!.startDate).toBe("2025-06-01");
  });
});

describe("createScenario", () => {
  it("generates a fresh seed", () => {
    const s1 = createScenario("Baseline", "2025-01-06");
    const s2 = createScenario("Optimistic", "2025-01-06");
    expect(s1.settings.rngSeed).not.toBe("placeholder");
    expect(s1.settings.rngSeed).not.toBe(s2.settings.rngSeed);
  });

  it("applies settings overrides", () => {
    const s = createScenario("Test", "2025-01-06", { trialCount: 10000 });
    expect(s.settings.trialCount).toBe(10000);
    expect(s.settings.probabilityTarget).toBe(0.5); // default preserved
    expect(s.settings.projectProbabilityTarget).toBe(0.95); // default preserved
  });
});

describe("cloneScenario", () => {
  function makeScenario(): Scenario {
    const scenario = createScenario("Original", "2025-01-06");
    const a1 = createActivity("Task 1", scenario.settings);
    const a2 = createActivity("Task 2", scenario.settings);
    return {
      ...scenario,
      activities: [
        { ...a1, status: "complete", actualDuration: 5 },
        { ...a2, status: "planned" },
      ],
      simulationResults: { id: "sim1" } as SimulationRun,
    };
  }

  it("produces new IDs for clone and activities", () => {
    const original = makeScenario();
    const clone = cloneScenario(original, "Clone");

    expect(clone.id).not.toBe(original.id);
    expect(clone.settings.rngSeed).not.toBe(original.settings.rngSeed);
    for (let i = 0; i < clone.activities.length; i++) {
      expect(clone.activities[i]!.id).not.toBe(original.activities[i]!.id);
    }
  });

  it("does not carry simulationResults", () => {
    const original = makeScenario();
    const clone = cloneScenario(original, "Clone");
    expect(clone.simulationResults).toBeUndefined();
  });

  it("drops completed activities when option set", () => {
    const original = makeScenario();
    const clone = cloneScenario(original, "Clone", { dropCompleted: true });
    expect(clone.activities).toHaveLength(1);
    expect(clone.activities[0]!.status).toBe("planned");
    expect(clone.activities[0]!.actualDuration).toBeUndefined();
  });

  it("preserves all activities without dropCompleted", () => {
    const original = makeScenario();
    const clone = cloneScenario(original, "Clone");
    expect(clone.activities).toHaveLength(2);
  });
});

describe("addScenarioToProject", () => {
  function buildProjectWith3Scenarios() {
    const project = createProject("Test", "2025-01-06");
    const s2 = createScenario("B", "2025-01-06");
    const s3 = createScenario("C", "2025-01-06");
    return {
      ...project,
      scenarios: [...project.scenarios, s2, s3],
    };
  }

  it("appends to end when insertAtIndex is undefined", () => {
    const project = buildProjectWith3Scenarios();
    const newScenario = createScenario("New", "2025-01-06");
    const updated = addScenarioToProject(project, newScenario);
    expect(updated.scenarios).toHaveLength(4);
    expect(updated.scenarios[3]!.id).toBe(newScenario.id);
  });

  it("prepends when insertAtIndex=0", () => {
    const project = buildProjectWith3Scenarios();
    const newScenario = createScenario("New", "2025-01-06");
    const updated = addScenarioToProject(project, newScenario, 0);
    expect(updated.scenarios).toHaveLength(4);
    expect(updated.scenarios[0]!.id).toBe(newScenario.id);
    expect(updated.scenarios[1]!.name).toBe("Baseline");
    expect(updated.scenarios[2]!.name).toBe("B");
    expect(updated.scenarios[3]!.name).toBe("C");
  });

  it("inserts mid-array at insertAtIndex=middle, preserving neighbors", () => {
    const project = buildProjectWith3Scenarios();
    const newScenario = createScenario("New", "2025-01-06");
    const updated = addScenarioToProject(project, newScenario, 1);
    expect(updated.scenarios).toHaveLength(4);
    expect(updated.scenarios[0]!.name).toBe("Baseline");
    expect(updated.scenarios[1]!.id).toBe(newScenario.id);
    expect(updated.scenarios[2]!.name).toBe("B");
    expect(updated.scenarios[3]!.name).toBe("C");
  });

  it("appends when insertAtIndex=length", () => {
    const project = buildProjectWith3Scenarios();
    const newScenario = createScenario("New", "2025-01-06");
    const updated = addScenarioToProject(project, newScenario, project.scenarios.length);
    expect(updated.scenarios).toHaveLength(4);
    expect(updated.scenarios[3]!.id).toBe(newScenario.id);
  });

  it("clamps insertAtIndex=-1 to 0", () => {
    const project = buildProjectWith3Scenarios();
    const newScenario = createScenario("New", "2025-01-06");
    const updated = addScenarioToProject(project, newScenario, -1);
    expect(updated.scenarios[0]!.id).toBe(newScenario.id);
  });

  it("clamps insertAtIndex>length to length", () => {
    const project = buildProjectWith3Scenarios();
    const newScenario = createScenario("New", "2025-01-06");
    const updated = addScenarioToProject(project, newScenario, project.scenarios.length + 5);
    expect(updated.scenarios).toHaveLength(4);
    expect(updated.scenarios[3]!.id).toBe(newScenario.id);
  });

  it("does not mutate the input project's scenarios array", () => {
    const project = buildProjectWith3Scenarios();
    const originalScenariosRef = project.scenarios;
    const originalLength = project.scenarios.length;
    const newScenario = createScenario("New", "2025-01-06");
    const updated = addScenarioToProject(project, newScenario, 1);
    expect(project.scenarios).toBe(originalScenariosRef);
    expect(project.scenarios).toHaveLength(originalLength);
    expect(updated.scenarios).not.toBe(originalScenariosRef);
  });
});

describe("activity mutations", () => {
  it("addActivityToScenario clears simulationResults", () => {
    const scenario = createScenario("Test", "2025-01-06");
    const withResults: Scenario = {
      ...scenario,
      simulationResults: { id: "sim1" } as SimulationRun,
    };
    const activity = createActivity("New Task", DEFAULT_SCENARIO_SETTINGS);
    const updated = addActivityToScenario(withResults, activity);
    expect(updated.simulationResults).toBeUndefined();
    expect(updated.activities).toHaveLength(1);
  });

  it("updateActivity clears simulationResults", () => {
    const scenario = createScenario("Test", "2025-01-06");
    const activity = createActivity("Task", scenario.settings);
    const withActivity: Scenario = {
      ...scenario,
      activities: [activity],
      simulationResults: { id: "sim1" } as SimulationRun,
    };
    const updated = updateActivity(withActivity, activity.id, {
      min: 5,
    });
    expect(updated.simulationResults).toBeUndefined();
    expect(updated.activities[0]!.min).toBe(5);
  });

  it("removeActivityFromScenario clears simulationResults", () => {
    const scenario = createScenario("Test", "2025-01-06");
    const activity = createActivity("Task", scenario.settings);
    const withActivity: Scenario = {
      ...scenario,
      activities: [activity],
      simulationResults: { id: "sim1" } as SimulationRun,
    };
    const updated = removeActivityFromScenario(withActivity, activity.id);
    expect(updated.simulationResults).toBeUndefined();
    expect(updated.activities).toHaveLength(0);
  });

  it("reorderActivities swaps positions", () => {
    const scenario = createScenario("Test", "2025-01-06");
    const a1 = createActivity("First", scenario.settings);
    const a2 = createActivity("Second", scenario.settings);
    const withActivities: Scenario = {
      ...scenario,
      activities: [a1, a2],
    };
    const reordered = reorderActivities(withActivities, 0, 1);
    expect(reordered.activities[0]!.name).toBe("Second");
    expect(reordered.activities[1]!.name).toBe("First");
  });
});
