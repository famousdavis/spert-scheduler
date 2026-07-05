// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import {
  addDependency,
  removeDependency,
  updateDependencyLag,
  updateDependencyType,
  removeActivitiesDeps,
} from "./dependency-service";
import { createScenario, createActivity, addActivityToScenario } from "./project-service";
import { detectCycle } from "@core/schedule/dependency-graph";
import type { ActivityDependency } from "@domain/models/types";

function makeScenario() {
  const scenario = createScenario("Test", "2025-01-06");
  const a1 = createActivity("Task 1", scenario.settings);
  const a2 = createActivity("Task 2", scenario.settings);
  const a3 = createActivity("Task 3", scenario.settings);
  return addActivityToScenario(
    addActivityToScenario(
      addActivityToScenario(scenario, a1),
      a2
    ),
    a3
  );
}

describe("addDependency", () => {
  it("adds a finish-to-start dependency", () => {
    const scenario = makeScenario();
    const a1 = scenario.activities[0]!.id;
    const a2 = scenario.activities[1]!.id;

    const updated = addDependency(scenario, a1, a2);
    expect(updated.dependencies).toHaveLength(1);
    expect(updated.dependencies[0]).toEqual({
      fromActivityId: a1,
      toActivityId: a2,
      type: "FS",
      lagDays: 0,
    });
    expect(updated.simulationResults).toBeUndefined();
  });

  it("supports custom lag days", () => {
    const scenario = makeScenario();
    const a1 = scenario.activities[0]!.id;
    const a2 = scenario.activities[1]!.id;

    const updated = addDependency(scenario, a1, a2, "FS", 3);
    expect(updated.dependencies[0]!.lagDays).toBe(3);
  });
});

describe("removeDependency", () => {
  it("removes the matching dependency", () => {
    const scenario = makeScenario();
    const a1 = scenario.activities[0]!.id;
    const a2 = scenario.activities[1]!.id;

    let updated = addDependency(scenario, a1, a2);
    expect(updated.dependencies).toHaveLength(1);

    updated = removeDependency(updated, a1, a2);
    expect(updated.dependencies).toHaveLength(0);
  });
});

describe("updateDependencyLag", () => {
  it("updates lag on the matching dependency", () => {
    const scenario = makeScenario();
    const a1 = scenario.activities[0]!.id;
    const a2 = scenario.activities[1]!.id;

    let updated = addDependency(scenario, a1, a2, "FS", 0);
    updated = updateDependencyLag(updated, a1, a2, 5);
    expect(updated.dependencies[0]!.lagDays).toBe(5);
  });
});

describe("removeActivitiesDeps", () => {
  it("removes all dependencies referencing given activity IDs", () => {
    const scenario = makeScenario();
    const [a1, a2, a3] = scenario.activities.map((a) => a.id);

    let updated = addDependency(scenario, a1!, a2!);
    updated = addDependency(updated, a2!, a3!);
    expect(updated.dependencies).toHaveLength(2);

    // Remove all deps involving a2
    updated = removeActivitiesDeps(updated, [a2!]);
    expect(updated.dependencies).toHaveLength(0);
  });

  it("keeps unrelated dependencies", () => {
    const scenario = makeScenario();
    const [a1, a2, a3] = scenario.activities.map((a) => a.id);

    let updated = addDependency(scenario, a1!, a2!);
    updated = addDependency(updated, a2!, a3!);

    // Remove deps involving only a3
    updated = removeActivitiesDeps(updated, [a3!]);
    expect(updated.dependencies).toHaveLength(1);
    expect(updated.dependencies[0]!.fromActivityId).toBe(a1);
  });
});

describe("addDependency — hardening (ref-equal no-ops)", () => {
  it("no-ops (ref-equal) when the predecessor does not exist", () => {
    const scenario = makeScenario();
    const a2 = scenario.activities[1]!.id;
    expect(addDependency(scenario, "nope", a2)).toBe(scenario);
  });

  it("no-ops (ref-equal) when the successor does not exist", () => {
    const scenario = makeScenario();
    const a1 = scenario.activities[0]!.id;
    expect(addDependency(scenario, a1, "nope")).toBe(scenario);
  });

  it("no-ops (ref-equal) on self-reference", () => {
    const scenario = makeScenario();
    const a1 = scenario.activities[0]!.id;
    expect(addDependency(scenario, a1, a1)).toBe(scenario);
  });

  it("no-ops (ref-equal) on a duplicate pair regardless of requested type", () => {
    const scenario = makeScenario();
    const a1 = scenario.activities[0]!.id;
    const a2 = scenario.activities[1]!.id;
    const once = addDependency(scenario, a1, a2, "FS");
    // Same pair, different requested type → still a duplicate → ref-equal no-op.
    expect(addDependency(once, a1, a2, "SS")).toBe(once);
  });

  it("no-ops (ref-equal) when the edge would create a cycle", () => {
    const scenario = makeScenario();
    const [a1, a2, a3] = scenario.activities.map((a) => a.id);
    let s = addDependency(scenario, a1!, a2!);
    s = addDependency(s, a2!, a3!);
    // a3 → a1 would close the cycle a1→a2→a3→a1.
    expect(addDependency(s, a3!, a1!)).toBe(s);
  });

  it("is replay-safe: re-adding the same edge returns the same reference", () => {
    const scenario = makeScenario();
    const a1 = scenario.activities[0]!.id;
    const a2 = scenario.activities[1]!.id;
    const once = addDependency(scenario, a1, a2);
    expect(addDependency(once, a1, a2)).toBe(once);
  });
});

describe("removeDependency — hardening (ref-equal no-op)", () => {
  it("no-ops (ref-equal) when the pair is not present", () => {
    const scenario = makeScenario();
    const [a1, a2] = scenario.activities.map((a) => a.id);
    expect(removeDependency(scenario, a1!, a2!)).toBe(scenario);
  });
});

describe("updateDependencyLag — hardening (ref-equal no-ops)", () => {
  it("no-ops (ref-equal) when the pair is not present", () => {
    const scenario = makeScenario();
    const [a1, a2] = scenario.activities.map((a) => a.id);
    expect(updateDependencyLag(scenario, a1!, a2!, 5)).toBe(scenario);
  });

  it("no-ops (ref-equal) when the lag is unchanged", () => {
    const scenario = makeScenario();
    const [a1, a2] = scenario.activities.map((a) => a.id);
    const withDep = addDependency(scenario, a1!, a2!, "FS", 3);
    expect(updateDependencyLag(withDep, a1!, a2!, 3)).toBe(withDep);
  });
});

describe("updateDependencyType — hardening", () => {
  it("updates the type on the matching pair and invalidates results", () => {
    const scenario = makeScenario();
    const [a1, a2] = scenario.activities.map((a) => a.id);
    const withDep = addDependency(scenario, a1!, a2!, "FS");
    const updated = updateDependencyType(withDep, a1!, a2!, "SS");
    expect(updated.dependencies[0]!.type).toBe("SS");
    expect(updated.simulationResults).toBeUndefined();
  });

  it("no-ops (ref-equal) when the pair is not present", () => {
    const scenario = makeScenario();
    const [a1, a2] = scenario.activities.map((a) => a.id);
    expect(updateDependencyType(scenario, a1!, a2!, "SS")).toBe(scenario);
  });

  it("no-ops (ref-equal) when the type is unchanged", () => {
    const scenario = makeScenario();
    const [a1, a2] = scenario.activities.map((a) => a.id);
    const withDep = addDependency(scenario, a1!, a2!, "FS");
    expect(updateDependencyType(withDep, a1!, a2!, "FS")).toBe(withDep);
  });
});

describe("retarget-mode cycle exclusion (DependencyEditModal.validate logic)", () => {
  // The modal computes a prospective edge set: current edges MINUS the original
  // edge (edit mode) PLUS the proposed edge, then runs detectCycle. Excluding
  // the original edge is what prevents falsely rejecting a benign retarget.
  it("a benign retarget is not falsely rejected once the original edge is excluded", () => {
    const ids = ["a1", "a2", "a3", "a4"];
    const edges: ActivityDependency[] = [
      { fromActivityId: "a1", toActivityId: "a2", type: "FS", lagDays: 0 },
      { fromActivityId: "a2", toActivityId: "a3", type: "FS", lagDays: 0 },
      { fromActivityId: "a3", toActivityId: "a1", type: "FS", lagDays: 0 }, // closes a cycle
    ];
    // The full set is cyclic (a1→a2→a3→a1).
    expect(detectCycle(ids, edges)).not.toBeNull();

    // Retarget the successor of a3→a1 to a3→a4 (a4 is a sink → genuinely
    // benign). The prospective set excludes the original a3→a1.
    const prospective: ActivityDependency[] = [
      ...edges.filter((d) => !(d.fromActivityId === "a3" && d.toActivityId === "a1")),
      { fromActivityId: "a3", toActivityId: "a4", type: "FS", lagDays: 0 },
    ];
    expect(detectCycle(ids, prospective)).toBeNull(); // benign — must not be rejected

    // Without the exclusion, the naive set keeps the original edge and stays
    // cyclic — that is the false rejection the exclusion prevents.
    const naive: ActivityDependency[] = [
      ...edges,
      { fromActivityId: "a3", toActivityId: "a4", type: "FS", lagDays: 0 },
    ];
    expect(detectCycle(ids, naive)).not.toBeNull();
  });
});
