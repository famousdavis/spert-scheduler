import { describe, it, expect } from "vitest";
import {
  addMilestone,
  removeMilestone,
  updateMilestone,
  assignActivityToMilestone,
  setActivityStartsAtMilestone,
} from "./milestone-service";
import { createScenario, createActivity, addActivityToScenario } from "./project-service";

function makeScenario() {
  const scenario = createScenario("Test", "2025-01-06");
  const a1 = createActivity("Task 1", scenario.settings);
  const a2 = createActivity("Task 2", scenario.settings);
  return addActivityToScenario(
    addActivityToScenario(scenario, a1),
    a2
  );
}

describe("addMilestone", () => {
  it("adds a milestone and invalidates simulation results", () => {
    const scenario = makeScenario();
    const updated = addMilestone(scenario, "Phase 1", "2025-02-01");
    expect(updated.milestones).toHaveLength(1);
    expect(updated.milestones[0]!.name).toBe("Phase 1");
    expect(updated.milestones[0]!.targetDate).toBe("2025-02-01");
    expect(updated.simulationResults).toBeUndefined();
  });
});

describe("removeMilestone", () => {
  it("removes milestone and clears activity references", () => {
    let scenario = makeScenario();
    scenario = addMilestone(scenario, "Phase 1", "2025-02-01");
    const msId = scenario.milestones[0]!.id;
    const actId = scenario.activities[0]!.id;

    // Assign activity to milestone first
    scenario = assignActivityToMilestone(scenario, actId, msId);
    scenario = setActivityStartsAtMilestone(scenario, actId, msId);

    expect(scenario.activities[0]!.milestoneId).toBe(msId);
    expect(scenario.activities[0]!.startsAtMilestoneId).toBe(msId);

    // Remove milestone
    const updated = removeMilestone(scenario, msId);
    expect(updated.milestones).toHaveLength(0);
    expect(updated.activities[0]!.milestoneId).toBeUndefined();
    expect(updated.activities[0]!.startsAtMilestoneId).toBeUndefined();
  });
});

describe("updateMilestone", () => {
  it("updates milestone name and target date", () => {
    let scenario = makeScenario();
    scenario = addMilestone(scenario, "Phase 1", "2025-02-01");
    const msId = scenario.milestones[0]!.id;

    const updated = updateMilestone(scenario, msId, {
      name: "Phase 1 Revised",
      targetDate: "2025-03-01",
    });
    expect(updated.milestones[0]!.name).toBe("Phase 1 Revised");
    expect(updated.milestones[0]!.targetDate).toBe("2025-03-01");
    expect(updated.milestones[0]!.id).toBe(msId);
  });
});

describe("assignActivityToMilestone", () => {
  it("assigns and unassigns activity to milestone", () => {
    let scenario = makeScenario();
    scenario = addMilestone(scenario, "Phase 1", "2025-02-01");
    const msId = scenario.milestones[0]!.id;
    const actId = scenario.activities[0]!.id;

    // Assign
    let updated = assignActivityToMilestone(scenario, actId, msId);
    expect(updated.activities[0]!.milestoneId).toBe(msId);

    // Unassign
    updated = assignActivityToMilestone(updated, actId, null);
    expect(updated.activities[0]!.milestoneId).toBeUndefined();
  });
});

describe("setActivityStartsAtMilestone", () => {
  it("sets and clears startsAtMilestoneId constraint", () => {
    let scenario = makeScenario();
    scenario = addMilestone(scenario, "Phase 1", "2025-02-01");
    const msId = scenario.milestones[0]!.id;
    const actId = scenario.activities[1]!.id;

    // Set
    let updated = setActivityStartsAtMilestone(scenario, actId, msId);
    expect(updated.activities[1]!.startsAtMilestoneId).toBe(msId);

    // Clear
    updated = setActivityStartsAtMilestone(updated, actId, null);
    expect(updated.activities[1]!.startsAtMilestoneId).toBeUndefined();
  });
});
