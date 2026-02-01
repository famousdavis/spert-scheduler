import { describe, it, expect } from "vitest";
import {
  createScenario,
  createActivity,
  addActivityToScenario,
  updateActivity,
  cloneScenario,
} from "@app/api/project-service";
import type { SimulationRun } from "@domain/models/types";

describe("Scenario cloning", () => {
  function buildScenario() {
    const scenario = createScenario("Original", "2025-01-06");
    const settings = scenario.settings;
    const a1 = { ...createActivity("Design", settings), min: 3, mostLikely: 5, max: 10 };
    const a2 = { ...createActivity("Build", settings), min: 10, mostLikely: 15, max: 25 };
    const a3 = { ...createActivity("Test", settings), min: 5, mostLikely: 7, max: 12 };

    let s = addActivityToScenario(scenario, a1);
    s = addActivityToScenario(s, a2);
    s = addActivityToScenario(s, a3);

    // Mark first as complete
    s = updateActivity(s, a1.id, {
      status: "complete",
      actualDuration: 4,
    });

    // Add fake simulation results
    s = {
      ...s,
      simulationResults: {
        id: "sim1",
        mean: 30,
        samples: [],
      } as unknown as SimulationRun,
    };

    return { scenario: s, activityIds: [a1.id, a2.id, a3.id] };
  }

  it("clone preserves activity count without dropCompleted", () => {
    const { scenario } = buildScenario();
    const clone = cloneScenario(scenario, "Clone");

    expect(clone.activities).toHaveLength(3);
    expect(clone.activities[0]!.status).toBe("complete");
  });

  it("clone with dropCompleted removes complete activities", () => {
    const { scenario } = buildScenario();
    const clone = cloneScenario(scenario, "Reforecast", {
      dropCompleted: true,
    });

    expect(clone.activities).toHaveLength(2);
    expect(clone.activities.every((a) => a.status === "planned")).toBe(true);
    expect(clone.activities.every((a) => a.actualDuration === undefined)).toBe(
      true
    );
  });

  it("clone generates new IDs for everything", () => {
    const { scenario, activityIds } = buildScenario();
    const clone = cloneScenario(scenario, "Clone");

    expect(clone.id).not.toBe(scenario.id);
    expect(clone.settings.rngSeed).not.toBe(scenario.settings.rngSeed);

    for (let i = 0; i < clone.activities.length; i++) {
      expect(clone.activities[i]!.id).not.toBe(activityIds[i]);
    }
  });

  it("clone does not carry simulation results", () => {
    const { scenario } = buildScenario();
    expect(scenario.simulationResults).toBeDefined();

    const clone = cloneScenario(scenario, "Clone");
    expect(clone.simulationResults).toBeUndefined();
  });

  it("clone preserves start date and settings (except seed)", () => {
    const { scenario } = buildScenario();
    const clone = cloneScenario(scenario, "Clone");

    expect(clone.startDate).toBe(scenario.startDate);
    expect(clone.settings.trialCount).toBe(scenario.settings.trialCount);
    expect(clone.settings.probabilityTarget).toBe(
      scenario.settings.probabilityTarget
    );
    expect(clone.settings.defaultConfidenceLevel).toBe(
      scenario.settings.defaultConfidenceLevel
    );
  });
});
