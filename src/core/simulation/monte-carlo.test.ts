// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { runMonteCarloSimulation, runTrials, runDependencyTrials, computeSimulationStats } from "./monte-carlo";
import type { Activity, ActivityDependency } from "@domain/models/types";

function makeActivity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: "a1",
    name: "Task",
    min: 3,
    mostLikely: 5,
    max: 10,
    confidenceLevel: "mediumConfidence",
    distributionType: "normal",
    status: "planned",
    ...overrides,
  };
}

describe("runMonteCarloSimulation", () => {
  it("returns correct trial count", () => {
    const result = runMonteCarloSimulation({
      activities: [makeActivity()],
      trialCount: 1000,
      rngSeed: "test-seed-1",
    });
    expect(result.trialCount).toBe(1000);
    expect(result.samples).toHaveLength(1000);
  });

  it("is deterministic with same seed", () => {
    const input = {
      activities: [makeActivity(), makeActivity({ id: "a2", name: "Task 2" })],
      trialCount: 5000,
      rngSeed: "reproducible-seed",
    };
    const run1 = runMonteCarloSimulation(input);
    const run2 = runMonteCarloSimulation(input);

    expect(run1.mean).toBe(run2.mean);
    expect(run1.standardDeviation).toBe(run2.standardDeviation);
    expect(run1.samples).toEqual(run2.samples);
  });

  it("produces different results with different seeds", () => {
    const activities = [makeActivity()];
    const run1 = runMonteCarloSimulation({
      activities,
      trialCount: 5000,
      rngSeed: "seed-A",
    });
    const run2 = runMonteCarloSimulation({
      activities,
      trialCount: 5000,
      rngSeed: "seed-B",
    });
    // Very unlikely to be exactly equal
    expect(run1.mean).not.toBe(run2.mean);
  });

  it("includes completed activities as fixed durations", () => {
    const activities = [
      makeActivity({
        id: "a1",
        status: "complete",
        actualDuration: 5,
      }),
      makeActivity({
        id: "a2",
        min: 0,
        mostLikely: 0,
        max: 0,
      }),
    ];
    const result = runMonteCarloSimulation({
      activities,
      trialCount: 1000,
      rngSeed: "completed-test",
    });
    // All samples should be at least 5 (the completed activity duration)
    expect(result.minSample).toBeGreaterThanOrEqual(5);
  });

  it("samples are sorted", () => {
    const result = runMonteCarloSimulation({
      activities: [makeActivity()],
      trialCount: 1000,
      rngSeed: "sort-test",
    });
    for (let i = 1; i < result.samples.length; i++) {
      expect(result.samples[i]!).toBeGreaterThanOrEqual(result.samples[i - 1]!);
    }
  });

  it("percentiles are monotonically non-decreasing", () => {
    const result = runMonteCarloSimulation({
      activities: [makeActivity(), makeActivity({ id: "a2" })],
      trialCount: 10000,
      rngSeed: "percentile-test",
    });
    const pValues = [5, 10, 25, 50, 75, 85, 90, 95, 96, 97, 98, 99];
    for (let i = 1; i < pValues.length; i++) {
      expect(result.percentiles[pValues[i]!]).toBeGreaterThanOrEqual(
        result.percentiles[pValues[i - 1]!]!
      );
    }
  });

  it("histogram bin counts sum to at least 99% of trial count (>P99 outliers excluded)", () => {
    const trialCount = 5000;
    const result = runMonteCarloSimulation({
      activities: [makeActivity()],
      trialCount,
      rngSeed: "histogram-test",
    });
    const totalCount = result.histogramBins.reduce(
      (sum, b) => sum + b.count,
      0
    );
    // Bins include samples ≤ P99, so at least 99% of trials are represented
    expect(totalCount).toBeGreaterThanOrEqual(Math.floor(trialCount * 0.99));
    expect(totalCount).toBeLessThanOrEqual(trialCount);
  });

  it("records engine version and seed", () => {
    const result = runMonteCarloSimulation({
      activities: [makeActivity()],
      trialCount: 1000,
      rngSeed: "meta-test",
    });
    expect(result.engineVersion).toBe("1.0.0");
    expect(result.seed).toBe("meta-test");
  });

  it("clamps negative samples to zero", () => {
    // Use very high uncertainty normal to potentially produce negatives
    const activities = [
      makeActivity({
        min: 0,
        mostLikely: 1,
        max: 2,
        confidenceLevel: "guesstimate",
        distributionType: "normal",
      }),
    ];
    const result = runMonteCarloSimulation({
      activities,
      trialCount: 50000,
      rngSeed: "clamp-test",
    });
    // All samples should be >= 0
    for (const sample of result.samples) {
      expect(sample).toBeGreaterThanOrEqual(0);
    }
  });

  it("clamps activity durations to deterministic floor (Parkinson's Law)", () => {
    // Two activities with deterministic floors of 20 and 30 days
    const activities = [
      makeActivity({ id: "a1", min: 3, mostLikely: 5, max: 10 }),
      makeActivity({ id: "a2", min: 5, mostLikely: 8, max: 15 }),
    ];
    const deterministicDurations = [20, 30]; // High floors well above sample range
    const result = runMonteCarloSimulation({
      activities,
      trialCount: 10000,
      rngSeed: "parkinson-test",
      deterministicDurations,
    });
    // Every trial total must be >= sum of floors (50)
    const floorSum = 20 + 30;
    for (const sample of result.samples) {
      expect(sample).toBeGreaterThanOrEqual(floorSum);
    }
  });

  it("Parkinson clamping with completed activities", () => {
    const activities = [
      makeActivity({ id: "a1", status: "complete", actualDuration: 10 }),
      makeActivity({ id: "a2", min: 3, mostLikely: 5, max: 10 }),
    ];
    // Only non-complete activities get deterministic durations
    const deterministicDurations = [25]; // Floor for a2 only
    const result = runMonteCarloSimulation({
      activities,
      trialCount: 5000,
      rngSeed: "parkinson-completed-test",
      deterministicDurations,
    });
    // Every trial: 10 (completed) + at least 25 (Parkinson floor) = >= 35
    for (const sample of result.samples) {
      expect(sample).toBeGreaterThanOrEqual(35);
    }
  });

  it("handles 0 activities (empty project)", () => {
    const result = runMonteCarloSimulation({
      activities: [],
      trialCount: 1000,
      rngSeed: "empty-test",
    });
    expect(result.trialCount).toBe(1000);
    expect(result.samples).toHaveLength(1000);
    for (const sample of result.samples) {
      expect(sample).toBe(0);
    }
    expect(result.mean).toBe(0);
    expect(result.standardDeviation).toBe(0);
  });

  it("handles 1 trial", () => {
    const result = runMonteCarloSimulation({
      activities: [makeActivity()],
      trialCount: 1,
      rngSeed: "single-trial",
    });
    expect(result.samples).toHaveLength(1);
    const singleValue = result.samples[0]!;
    for (const p of [5, 50, 95, 99]) {
      expect(result.percentiles[p]).toBe(singleValue);
    }
  });

  it("handles all-complete activities (no randomness)", () => {
    const activities = [
      makeActivity({ id: "a1", status: "complete", actualDuration: 5 }),
      makeActivity({ id: "a2", status: "complete", actualDuration: 10 }),
      makeActivity({ id: "a3", status: "complete", actualDuration: 3 }),
    ];
    const result = runMonteCarloSimulation({
      activities,
      trialCount: 1000,
      rngSeed: "all-complete",
    });
    for (const sample of result.samples) {
      expect(sample).toBe(18);
    }
    expect(result.mean).toBe(18);
    expect(result.standardDeviation).toBe(0);
  });

  it("handles completed activity with actualDuration = 0", () => {
    const activities = [
      makeActivity({ id: "a1", status: "complete", actualDuration: 0 }),
      makeActivity({ id: "a2", min: 3, mostLikely: 5, max: 10 }),
    ];
    const result = runMonteCarloSimulation({
      activities,
      trialCount: 1000,
      rngSeed: "zero-actual",
    });
    expect(result.mean).toBeGreaterThan(0);
  });
});

describe("runTrials", () => {
  it("calls onProgress callback at expected intervals", () => {
    const progressCalls: [number, number][] = [];
    runTrials({
      activities: [makeActivity()],
      trialCount: 25000,
      rngSeed: "progress-test",
      onProgress: (completed, total) => {
        progressCalls.push([completed, total]);
      },
      progressInterval: 10000,
    });
    expect(progressCalls).toHaveLength(2);
    expect(progressCalls[0]).toEqual([10000, 25000]);
    expect(progressCalls[1]).toEqual([20000, 25000]);
  });

  it("does not call onProgress for small trial counts", () => {
    const progressCalls: number[] = [];
    runTrials({
      activities: [makeActivity()],
      trialCount: 5000,
      rngSeed: "small-test",
      onProgress: (completed) => {
        progressCalls.push(completed);
      },
      progressInterval: 10000,
    });
    expect(progressCalls).toHaveLength(0);
  });
});

// -- Dependency-aware Monte Carlo tests --------------------------------------

function fsDep(from: string, to: string, lag = 0): ActivityDependency {
  return { fromActivityId: from, toActivityId: to, type: "FS", lagDays: lag };
}

describe("runDependencyTrials", () => {
  it("is deterministic with same seed", () => {
    const activities = [
      makeActivity({ id: "a1", name: "Task 1" }),
      makeActivity({ id: "a2", name: "Task 2" }),
    ];
    const deps = [fsDep("a1", "a2")];
    const input = {
      activities,
      dependencies: deps,
      trialCount: 5000,
      rngSeed: "dep-seed",
    };
    const s1 = runDependencyTrials(input);
    const s2 = runDependencyTrials(input);
    expect(Array.from(s1.samples)).toEqual(Array.from(s2.samples));
  });

  it("parallel activities produce shorter durations than sequential", () => {
    const activities = [
      makeActivity({ id: "a1", min: 5, mostLikely: 10, max: 15 }),
      makeActivity({ id: "a2", min: 5, mostLikely: 10, max: 15 }),
    ];

    // Sequential: A1 → A2
    const seqSamples = runDependencyTrials({
      activities,
      dependencies: [fsDep("a1", "a2")],
      trialCount: 5000,
      rngSeed: "parallel-test",
    });

    // Parallel: no deps
    const parSamples = runDependencyTrials({
      activities,
      dependencies: [],
      trialCount: 5000,
      rngSeed: "parallel-test",
    });

    const seqStats = computeSimulationStats(seqSamples.samples, 5000, "s");
    const parStats = computeSimulationStats(parSamples.samples, 5000, "s");

    // Parallel mean should be significantly less than sequential
    expect(parStats.mean).toBeLessThan(seqStats.mean);
  });

  it("applies Parkinson's Law floor per activity", () => {
    const activities = [
      makeActivity({ id: "a1", min: 1, mostLikely: 2, max: 3 }),
      makeActivity({ id: "a2", min: 1, mostLikely: 2, max: 3 }),
    ];
    const deps = [fsDep("a1", "a2")];
    const floorMap = new Map([["a1", 20], ["a2", 30]]);

    const result = runDependencyTrials({
      activities,
      dependencies: deps,
      trialCount: 1000,
      rngSeed: "parkinson-dep",
      deterministicDurationMap: floorMap,
    });

    // Sequential: a1 + a2, with floors 20 + 30 = 50
    for (let i = 0; i < result.samples.length; i++) {
      expect(result.samples[i]!).toBeGreaterThanOrEqual(50);
    }
  });

  it("handles completed activities as fixed durations", () => {
    const activities = [
      makeActivity({ id: "a1", status: "complete", actualDuration: 10 }),
      makeActivity({ id: "a2", min: 3, mostLikely: 5, max: 10 }),
    ];
    const deps = [fsDep("a1", "a2")];

    const result = runDependencyTrials({
      activities,
      dependencies: deps,
      trialCount: 1000,
      rngSeed: "completed-dep",
    });

    // Every trial should be at least 10 (a1) + something for a2
    for (let i = 0; i < result.samples.length; i++) {
      expect(result.samples[i]!).toBeGreaterThanOrEqual(10);
    }
  });

  it("handles all-complete activities (no randomness)", () => {
    const activities = [
      makeActivity({ id: "a1", status: "complete", actualDuration: 5 }),
      makeActivity({ id: "a2", status: "complete", actualDuration: 3 }),
    ];
    const deps = [fsDep("a1", "a2")];

    const result = runDependencyTrials({
      activities,
      dependencies: deps,
      trialCount: 100,
      rngSeed: "all-complete-dep",
    });

    // Sequential: 5 + 3 = 8
    for (let i = 0; i < result.samples.length; i++) {
      expect(result.samples[i]!).toBe(8);
    }
  });

  it("diamond graph: critical path through longest branch", () => {
    const activities = [
      makeActivity({ id: "a1", min: 2, mostLikely: 2, max: 2 }),
      makeActivity({ id: "a2", min: 10, mostLikely: 10, max: 10 }),
      makeActivity({ id: "a3", min: 3, mostLikely: 3, max: 3 }),
      makeActivity({ id: "a4", min: 1, mostLikely: 1, max: 1 }),
    ];
    const deps = [fsDep("a1", "a2"), fsDep("a1", "a3"), fsDep("a2", "a4"), fsDep("a3", "a4")];

    const result = runDependencyTrials({
      activities,
      dependencies: deps,
      trialCount: 100,
      rngSeed: "diamond-test",
    });

    // Critical path: a1(2) + a2(10) + a4(1) = 13
    for (let i = 0; i < result.samples.length; i++) {
      expect(result.samples[i]!).toBe(13);
    }
  });
});

// ---------------------------------------------------------------------------
// MC with non-standard work week floors (Category 1)
// ---------------------------------------------------------------------------

describe("Monte Carlo with non-standard work week deterministic floors", () => {
  it("invariant: Parkinson floor from 3-day week deterministic applied correctly", () => {
    // 3-day week gives larger deterministic durations → higher floors
    const activities = [
      makeActivity({ id: "a1", min: 3, mostLikely: 5, max: 10 }),
      makeActivity({ id: "a2", min: 5, mostLikely: 8, max: 15 }),
    ];
    const deterministicDurations = [20, 30]; // Simulating floors from 3-day week
    const result = runMonteCarloSimulation({
      activities,
      trialCount: 5000,
      rngSeed: "3day-floor-test",
      deterministicDurations,
    });
    const floorSum = 50;
    for (const sample of result.samples) {
      expect(sample).toBeGreaterThanOrEqual(floorSum);
    }
  });

  it("invariant: large floors from 1-day week complete without timeout", () => {
    const activities = [
      makeActivity({ id: "a1", min: 3, mostLikely: 5, max: 10 }),
      makeActivity({ id: "a2", min: 3, mostLikely: 5, max: 10 }),
    ];
    const deterministicDurations = [100, 100]; // Simulating 1-day week floors
    const result = runMonteCarloSimulation({
      activities,
      trialCount: 1000,
      rngSeed: "1day-floor-test",
      deterministicDurations,
    });
    expect(result.samples).toHaveLength(1000);
    for (const sample of result.samples) {
      expect(sample).toBeGreaterThanOrEqual(200);
    }
  });

  it("PBT: every sequential trial >= sum of generated deterministic floors", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 1, maxLength: 5 }),
        (floors) => {
          const activities = floors.map((_, i) =>
            makeActivity({ id: `a${i}`, min: 1, mostLikely: 2, max: 3 })
          );
          const result = runTrials({
            activities,
            trialCount: 100,
            rngSeed: "pbt-floor",
            deterministicDurations: floors,
          });
          const floorSum = floors.reduce((s, f) => s + f, 0);
          for (let i = 0; i < result.length; i++) {
            if (result[i]! < floorSum) return false;
          }
          return true;
        }
      ),
      { numRuns: 200 }
    );
  });

  it("invariant: dependency MC with high floors from non-standard week", () => {
    const activities = [
      makeActivity({ id: "a1", min: 1, mostLikely: 2, max: 3 }),
      makeActivity({ id: "a2", min: 1, mostLikely: 2, max: 3 }),
    ];
    const deps = [fsDep("a1", "a2")];
    const floorMap = new Map([["a1", 50], ["a2", 50]]);
    const result = runDependencyTrials({
      activities,
      dependencies: deps,
      trialCount: 1000,
      rngSeed: "dep-nonstandard-floor",
      deterministicDurationMap: floorMap,
    });
    // Sequential chain: a1 + a2, floors 50 + 50 = 100
    for (let i = 0; i < result.samples.length; i++) {
      expect(result.samples[i]!).toBeGreaterThanOrEqual(100);
    }
  });

  it("PBT: dependency MC samples >= critical path of generated floor map", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 50 }), { minLength: 2, maxLength: 4 }),
        (floors) => {
          const activities = floors.map((_, i) =>
            makeActivity({ id: `a${i}`, min: 1, mostLikely: 2, max: 3 })
          );
          // Sequential chain: a0 → a1 → a2 → ...
          const deps = floors.slice(1).map((_, i) => fsDep(`a${i}`, `a${i + 1}`));
          const floorMap = new Map(floors.map((f, i) => [`a${i}`, f]));
          const result = runDependencyTrials({
            activities,
            dependencies: deps,
            trialCount: 50,
            rngSeed: "pbt-dep-floor",
            deterministicDurationMap: floorMap,
          });
          const criticalPathFloor = floors.reduce((s, f) => s + f, 0);
          for (let i = 0; i < result.samples.length; i++) {
            if (result.samples[i]! < criticalPathFloor) return false;
          }
          return true;
        }
      ),
      { numRuns: 200 }
    );
  });

  it("empty deterministic floors: no Parkinson clamping", () => {
    const activities = [
      makeActivity({ id: "a1", min: 3, mostLikely: 5, max: 10 }),
    ];
    const withFloors = runMonteCarloSimulation({
      activities,
      trialCount: 5000,
      rngSeed: "floor-compare",
      deterministicDurations: [20],
    });
    const withoutFloors = runMonteCarloSimulation({
      activities,
      trialCount: 5000,
      rngSeed: "floor-compare",
    });
    // Without floors, mean should be lower
    expect(withoutFloors.mean).toBeLessThan(withFloors.mean);
  });
});

// ---------------------------------------------------------------------------
// Parkinson's Law invariants (Category 5)
// ---------------------------------------------------------------------------

describe("Parkinson's Law invariants", () => {
  it("PBT: every sequential trial >= sum of generated floors", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 1, maxLength: 5 }),
        (floors) => {
          const activities = floors.map((_, i) =>
            makeActivity({ id: `p${i}`, min: 1, mostLikely: 2, max: 5 })
          );
          const samples = runTrials({
            activities,
            trialCount: 100,
            rngSeed: "parkinson-pbt",
            deterministicDurations: floors,
          });
          const total = floors.reduce((s, f) => s + f, 0);
          for (let i = 0; i < samples.length; i++) {
            if (samples[i]! < total) return false;
          }
          return true;
        }
      ),
      { numRuns: 200 }
    );
  });

  it("invariant: all trials include completed activity fixed durations", () => {
    const activities = [
      makeActivity({ id: "a1", status: "complete", actualDuration: 10 }),
      makeActivity({ id: "a2", status: "complete", actualDuration: 7 }),
      makeActivity({ id: "a3", min: 1, mostLikely: 2, max: 3 }),
    ];
    const result = runMonteCarloSimulation({
      activities,
      trialCount: 5000,
      rngSeed: "completed-invariant",
    });
    // Every sample must be >= 10 + 7 = 17
    for (const sample of result.samples) {
      expect(sample).toBeGreaterThanOrEqual(17);
    }
  });

  it("PBT: dependency trial >= critical path of generated floor map", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 50 }), { minLength: 2, maxLength: 4 }),
        (floors) => {
          const activities = floors.map((_, i) =>
            makeActivity({ id: `d${i}`, min: 1, mostLikely: 2, max: 5 })
          );
          const deps = floors.slice(1).map((_, i) => fsDep(`d${i}`, `d${i + 1}`));
          const floorMap = new Map(floors.map((f, i) => [`d${i}`, f]));
          const result = runDependencyTrials({
            activities,
            dependencies: deps,
            trialCount: 50,
            rngSeed: "parkinson-dep-pbt",
            deterministicDurationMap: floorMap,
          });
          const cpFloor = floors.reduce((s, f) => s + f, 0);
          for (let i = 0; i < result.samples.length; i++) {
            if (result.samples[i]! < cpFloor) return false;
          }
          return true;
        }
      ),
      { numRuns: 200 }
    );
  });
});

// ---------------------------------------------------------------------------
// Degenerate inputs (Category 5)
// ---------------------------------------------------------------------------

describe("degenerate inputs", () => {
  it("min=max=mostLikely: all trials equal", () => {
    const activities = [
      makeActivity({ id: "a1", min: 5, mostLikely: 5, max: 5 }),
    ];
    const result = runMonteCarloSimulation({
      activities,
      trialCount: 1000,
      rngSeed: "zero-variance",
    });
    for (const sample of result.samples) {
      expect(sample).toBe(5);
    }
    expect(result.standardDeviation).toBe(0);
  });

  it("min=max=mostLikely=0: all trials zero", () => {
    const activities = [
      makeActivity({ id: "a1", min: 0, mostLikely: 0, max: 0 }),
    ];
    const result = runMonteCarloSimulation({
      activities,
      trialCount: 1000,
      rngSeed: "all-zero",
    });
    for (const sample of result.samples) {
      expect(sample).toBe(0);
    }
    expect(result.mean).toBe(0);
  });

  it("100 activities with 10000 trials completes without timeout", () => {
    const activities = Array.from({ length: 100 }, (_, i) =>
      makeActivity({ id: `a${i}`, min: 1, mostLikely: 2, max: 5 })
    );
    const result = runMonteCarloSimulation({
      activities,
      trialCount: 10000,
      rngSeed: "scale-test",
    });
    expect(result.samples).toHaveLength(10000);
    expect(result.mean).toBeGreaterThan(0);
  });

  it("wide diamond graph (10 parallel branches): mean < sequential sum", () => {
    const start = makeActivity({ id: "start", min: 1, mostLikely: 1, max: 1 });
    const end = makeActivity({ id: "end", min: 1, mostLikely: 1, max: 1 });
    const branches = Array.from({ length: 10 }, (_, i) =>
      makeActivity({ id: `b${i}`, min: 3, mostLikely: 5, max: 10 })
    );
    const activities = [start, ...branches, end];
    const deps = [
      ...branches.map((b) => fsDep("start", b.id)),
      ...branches.map((b) => fsDep(b.id, "end")),
    ];

    const result = runDependencyTrials({
      activities,
      dependencies: deps,
      trialCount: 5000,
      rngSeed: "wide-diamond",
    });
    const stats = computeSimulationStats(result.samples, 5000, "s");
    // Sequential sum would be ~52 (1 + 10*5 + 1), parallel should be ~7 (1 + max(branches) + 1)
    const seqSum = 1 + 10 * 5 + 1;
    expect(stats.mean).toBeLessThan(seqSum);
  });

  it("trial count of 1 produces valid statistics", () => {
    const result = runMonteCarloSimulation({
      activities: [makeActivity()],
      trialCount: 1,
      rngSeed: "single-trial-edge",
    });
    expect(result.samples).toHaveLength(1);
    // All percentiles should equal the single sample
    const value = result.samples[0]!;
    for (const p of [5, 50, 95, 99]) {
      expect(result.percentiles[p]).toBe(value);
    }
  });
});

// ---------------------------------------------------------------------------
// Milestone Monte Carlo (Category 5)
// ---------------------------------------------------------------------------

describe("milestone Monte Carlo", () => {
  it("milestoneSamples populated for each milestone", () => {
    const activities = [
      makeActivity({ id: "a1", min: 3, mostLikely: 5, max: 10 }),
      makeActivity({ id: "a2", min: 3, mostLikely: 5, max: 10 }),
    ];
    const deps = [fsDep("a1", "a2")];
    const milestoneActivityIds = new Map([["m1", ["a1"]]]);

    const result = runDependencyTrials({
      activities,
      dependencies: deps,
      trialCount: 100,
      rngSeed: "milestone-pop",
      milestoneActivityIds,
    });

    expect(result.milestoneSamples).toBeDefined();
    expect(result.milestoneSamples!.has("m1")).toBe(true);
    expect(result.milestoneSamples!.get("m1")!).toHaveLength(100);
  });

  it("milestone duration <= project duration for every trial", () => {
    const activities = [
      makeActivity({ id: "a1", min: 3, mostLikely: 5, max: 10 }),
      makeActivity({ id: "a2", min: 3, mostLikely: 5, max: 10 }),
    ];
    const deps = [fsDep("a1", "a2")];
    const milestoneActivityIds = new Map([["m1", ["a1"]]]);

    const result = runDependencyTrials({
      activities,
      dependencies: deps,
      trialCount: 1000,
      rngSeed: "milestone-lte",
      milestoneActivityIds,
    });

    const ms = result.milestoneSamples!.get("m1")!;
    for (let i = 0; i < result.samples.length; i++) {
      expect(ms[i]!).toBeLessThanOrEqual(result.samples[i]!);
    }
  });

  it("milestone covering all activities equals project duration", () => {
    const activities = [
      makeActivity({ id: "a1", min: 3, mostLikely: 5, max: 10 }),
      makeActivity({ id: "a2", min: 3, mostLikely: 5, max: 10 }),
    ];
    const deps = [fsDep("a1", "a2")];
    const milestoneActivityIds = new Map([["m1", ["a1", "a2"]]]);

    const result = runDependencyTrials({
      activities,
      dependencies: deps,
      trialCount: 1000,
      rngSeed: "milestone-all",
      milestoneActivityIds,
    });

    const ms = result.milestoneSamples!.get("m1")!;
    for (let i = 0; i < result.samples.length; i++) {
      expect(ms[i]!).toBe(result.samples[i]!);
    }
  });

  it("milestone with activityEarliestStart offset", () => {
    const activities = [
      makeActivity({ id: "a1", min: 5, mostLikely: 5, max: 5 }),
      makeActivity({ id: "a2", min: 5, mostLikely: 5, max: 5 }),
    ];
    // Parallel: no deps
    const milestoneActivityIds = new Map([["m1", ["a2"]]]);
    const activityEarliestStart = new Map([["a2", 10]]); // a2 can't start before day 10

    const result = runDependencyTrials({
      activities,
      dependencies: [],
      trialCount: 100,
      rngSeed: "milestone-offset",
      milestoneActivityIds,
      activityEarliestStart,
    });

    const ms = result.milestoneSamples!.get("m1")!;
    // a2 starts at day 10, duration 5, so milestone = 15
    for (let i = 0; i < ms.length; i++) {
      expect(ms[i]!).toBeGreaterThanOrEqual(15);
    }
  });
});

// ---------------------------------------------------------------------------
// Progress callback edge cases (Category 5)
// ---------------------------------------------------------------------------

describe("progress callback edge cases", () => {
  it("onProgress receives monotonically increasing values", () => {
    const values: number[] = [];
    runTrials({
      activities: [makeActivity()],
      trialCount: 50000,
      rngSeed: "progress-mono",
      onProgress: (completed) => values.push(completed),
      progressInterval: 10000,
    });
    for (let i = 1; i < values.length; i++) {
      expect(values[i]!).toBeGreaterThan(values[i - 1]!);
    }
    expect(values.length).toBeGreaterThanOrEqual(2);
  });

  it("dependency MC calls onProgress at correct intervals", () => {
    const calls: [number, number][] = [];
    runDependencyTrials({
      activities: [
        makeActivity({ id: "a1" }),
        makeActivity({ id: "a2" }),
      ],
      dependencies: [fsDep("a1", "a2")],
      trialCount: 25000,
      rngSeed: "dep-progress",
      onProgress: (completed, total) => calls.push([completed, total]),
      progressInterval: 10000,
    });
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual([10000, 25000]);
    expect(calls[1]).toEqual([20000, 25000]);
  });

  it("computeSimulationStats: percentiles are monotonically non-decreasing", () => {
    // Hand-crafted sorted samples
    const samples = new Float64Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 100]);
    const stats = computeSimulationStats(samples, samples.length, "hand-crafted");
    const pValues = [5, 10, 25, 50, 75, 85, 90, 95, 99];
    for (let i = 1; i < pValues.length; i++) {
      expect(stats.percentiles[pValues[i]!]).toBeGreaterThanOrEqual(
        stats.percentiles[pValues[i - 1]!]!
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Floors edge cases (Category 5)
// ---------------------------------------------------------------------------

describe("deterministic floor edge cases", () => {
  it("floors of 0 have no clamping effect", () => {
    const activities = [
      makeActivity({ id: "a1", min: 3, mostLikely: 5, max: 10 }),
    ];
    const withZeroFloors = runMonteCarloSimulation({
      activities,
      trialCount: 5000,
      rngSeed: "zero-floor",
      deterministicDurations: [0],
    });
    const withoutFloors = runMonteCarloSimulation({
      activities,
      trialCount: 5000,
      rngSeed: "zero-floor",
    });
    // Identical results since max(0, sampled) = sampled
    expect(withZeroFloors.mean).toBe(withoutFloors.mean);
  });

  it("undefined floors: no Parkinson clamping applied", () => {
    const activities = [
      makeActivity({ id: "a1", min: 3, mostLikely: 5, max: 10 }),
    ];
    const result = runMonteCarloSimulation({
      activities,
      trialCount: 5000,
      rngSeed: "no-floor",
      // deterministicDurations intentionally omitted
    });
    // Some samples should be below what a high floor would impose
    expect(result.minSample).toBeLessThan(20);
  });
});
