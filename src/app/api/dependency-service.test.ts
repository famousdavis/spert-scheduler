// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import {
  addDependency,
  removeDependency,
  updateDependencyLag,
  removeActivitiesDeps,
} from "./dependency-service";
import { createScenario, createActivity, addActivityToScenario } from "./project-service";

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
