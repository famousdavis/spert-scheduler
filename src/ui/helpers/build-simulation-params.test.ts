// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import { buildSimulationParams } from "./build-simulation-params";
import type { Activity, Milestone, ActivityDependency } from "@domain/models/types";

function makeActivity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: "a1",
    name: "Task 1",
    min: 5,
    mostLikely: 10,
    max: 20,
    confidenceLevel: "mediumConfidence",
    distributionType: "normal",
    status: "planned",
    ...overrides,
  };
}

describe("buildSimulationParams", () => {
  const activities: Activity[] = [
    makeActivity({ id: "a1" }),
    makeActivity({ id: "a2", min: 3, mostLikely: 7, max: 15 }),
  ];
  const milestones: Milestone[] = [];
  const dependencies: ActivityDependency[] = [];

  it("returns deterministicDurations and no dependencyParams in sequential mode", () => {
    const result = buildSimulationParams(
      activities, false, 0.5, dependencies, milestones, "2026-01-05", undefined,
    );
    expect(result.deterministicDurations).toBeDefined();
    expect(result.deterministicDurations).toHaveLength(2);
    expect(result.dependencyParams).toBeUndefined();
  });

  it("returns dependencyParams and no deterministicDurations in dependency mode", () => {
    const deps: ActivityDependency[] = [
      { fromActivityId: "a1", toActivityId: "a2", type: "FS", lagDays: 0 },
    ];
    const result = buildSimulationParams(
      activities, true, 0.5, deps, milestones, "2026-01-05", undefined,
    );
    expect(result.deterministicDurations).toBeUndefined();
    expect(result.dependencyParams).toBeDefined();
    expect(result.dependencyParams!.dependencyMode).toBe(true);
    expect(result.dependencyParams!.dependencies).toBe(deps);
    expect(result.dependencyParams!.deterministicDurationMap).toBeDefined();
    expect(typeof result.dependencyParams!.deterministicDurationMap["a1"]).toBe("number");
    expect(typeof result.dependencyParams!.deterministicDurationMap["a2"]).toBe("number");
  });

  it("includes milestone sim params in dependency mode", () => {
    const ms: Milestone[] = [{ id: "m1", name: "Alpha", targetDate: "2026-02-01" }];
    const acts: Activity[] = [
      makeActivity({ id: "a1", milestoneId: "m1" }),
      makeActivity({ id: "a2" }),
    ];
    const deps: ActivityDependency[] = [
      { fromActivityId: "a1", toActivityId: "a2", type: "FS", lagDays: 0 },
    ];
    const result = buildSimulationParams(
      acts, true, 0.5, deps, ms, "2026-01-05", undefined,
    );
    expect(result.dependencyParams!.milestoneActivityIds).toBeDefined();
    expect(result.dependencyParams!.milestoneActivityIds!["m1"]).toContain("a1");
  });
});
