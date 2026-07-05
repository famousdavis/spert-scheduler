// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

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

describe("milestone-service — hardening", () => {
  it("addMilestone accepts an explicit id (defaulting to generateId when omitted)", () => {
    const scenario = makeScenario();
    const updated = addMilestone(scenario, "Phase 1", "2025-02-01", "ms-fixed");
    expect(updated.milestones[0]!.id).toBe("ms-fixed");
  });

  it("addMilestone always allocates (does not itself dedupe by id)", () => {
    // The transform is intentionally NOT ref-equal-safe; the AI applier's
    // duplicate-id pre-check is what dedupes. Two calls with the same id yield
    // two entries.
    const scenario = makeScenario();
    const once = addMilestone(scenario, "Phase 1", "2025-02-01", "ms-fixed");
    const twice = addMilestone(once, "Phase 1", "2025-02-01", "ms-fixed");
    expect(twice.milestones.filter((m) => m.id === "ms-fixed")).toHaveLength(2);
  });

  it("updateMilestone no-ops (ref-equal) when the milestone does not exist", () => {
    const scenario = makeScenario();
    expect(updateMilestone(scenario, "nope", { name: "X" })).toBe(scenario);
  });

  it("updateMilestone no-ops (ref-equal) when every provided field is unchanged", () => {
    let scenario = makeScenario();
    scenario = addMilestone(scenario, "Phase 1", "2025-02-01");
    const msId = scenario.milestones[0]!.id;
    expect(updateMilestone(scenario, msId, { name: "Phase 1" })).toBe(scenario);
    expect(
      updateMilestone(scenario, msId, { name: "Phase 1", targetDate: "2025-02-01" })
    ).toBe(scenario);
  });

  it("assignActivityToMilestone no-ops (ref-equal) when the activity does not exist", () => {
    let scenario = makeScenario();
    scenario = addMilestone(scenario, "Phase 1", "2025-02-01");
    const msId = scenario.milestones[0]!.id;
    expect(assignActivityToMilestone(scenario, "nope", msId)).toBe(scenario);
  });

  it("assignActivityToMilestone no-ops (ref-equal) when the target milestone does not exist", () => {
    const scenario = makeScenario();
    const actId = scenario.activities[0]!.id;
    expect(assignActivityToMilestone(scenario, actId, "nope")).toBe(scenario);
  });

  it("assignActivityToMilestone no-ops (ref-equal) when the assignment is unchanged", () => {
    let scenario = makeScenario();
    scenario = addMilestone(scenario, "Phase 1", "2025-02-01");
    const msId = scenario.milestones[0]!.id;
    const actId = scenario.activities[0]!.id;
    const assigned = assignActivityToMilestone(scenario, actId, msId);
    // Re-assigning to the same milestone → ref-equal no-op.
    expect(assignActivityToMilestone(assigned, actId, msId)).toBe(assigned);
    // Unassigning an already-unassigned activity → ref-equal no-op.
    const otherAct = scenario.activities[1]!.id;
    expect(assignActivityToMilestone(scenario, otherAct, null)).toBe(scenario);
  });
});
