// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import { runSimulationSync } from "./simulation-service";
import { runDependencyTrials, computeSimulationStats } from "@core/simulation/monte-carlo";
import type { DependencySimulationParams } from "@core/simulation/worker-client";
import type { Activity, ActivityDependency } from "@domain/models/types";

function makeActivity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: "a1",
    name: "Task",
    min: 3,
    mostLikely: 5,
    max: 8,
    confidenceLevel: "mediumConfidence",
    distributionType: "triangular",
    status: "planned",
    ...overrides,
  };
}

// Regression for the appendix bug: runSimulationSync's dependency branch dropped
// constraintMap, so the synchronous Worker fallback ignored hard scheduling
// constraints (MSO/SNET/MFO/FNET) and produced different percentiles than the
// worker path for the same project.
describe("runSimulationSync — dependency-mode constraint regression", () => {
  const activities: Activity[] = [
    makeActivity({ id: "a1", name: "Activity 1" }),
    makeActivity({ id: "a2", name: "Activity 2", min: 2, mostLikely: 3, max: 5 }),
  ];
  const dependencies: ActivityDependency[] = [
    { fromActivityId: "a1", toActivityId: "a2", type: "FS", lagDays: 0 },
  ];
  const TRIALS = 2000;
  const SEED = "constraint-regression-seed";

  // Hard SNET on a2 at offset 100 dominates the ~8-day natural chain → constraint-sensitive.
  const constraintRecord = {
    a2: { type: "SNET", offsetFromStart: 100, mode: "hard" },
  };
  const dependencyParams: DependencySimulationParams = {
    dependencyMode: true,
    dependencies,
    constraintMap: constraintRecord,
  };

  function directRun(constraintMap?: Map<string, { type: string; offsetFromStart: number; mode: string }>) {
    return computeSimulationStats(
      runDependencyTrials({
        activities,
        dependencies,
        trialCount: TRIALS,
        rngSeed: SEED,
        constraintMap,
      }).samples,
      TRIALS,
      SEED,
    );
  }

  it("sync path applies constraintMap (matches a direct runDependencyTrials WITH constraintMap)", () => {
    const syncRun = runSimulationSync(activities, TRIALS, SEED, undefined, dependencyParams);
    const directWith = directRun(
      new Map([["a2", { type: "SNET", offsetFromStart: 100, mode: "hard" }]]),
    );

    // Same seed + same constraint → bit-identical samples and percentiles.
    expect(syncRun.samples).toEqual(directWith.samples);
    expect(syncRun.percentiles).toEqual(directWith.percentiles);
    expect(syncRun.mean).toBe(directWith.mean);
  });

  it("the fixture is genuinely constraint-sensitive (guards against a vacuous test)", () => {
    // Without the SNET the chain is ~8 days; with it the project cannot finish
    // before ~day 100. If these were equal, the test above would pass even with
    // the bug present.
    const directWith = directRun(
      new Map([["a2", { type: "SNET", offsetFromStart: 100, mode: "hard" }]]),
    );
    const directWithout = directRun(undefined);

    expect(directWith.percentiles[95]!).toBeGreaterThan(directWithout.percentiles[95]! + 50);
  });
});
