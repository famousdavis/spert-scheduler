import { describe, it, expect } from "vitest";
import {
  createProject,
  createScenario,
  cloneScenario,
  createActivity,
  addActivityToScenario,
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

  it("has empty scenarios", () => {
    const project = createProject("Test");
    expect(project.scenarios).toEqual([]);
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
