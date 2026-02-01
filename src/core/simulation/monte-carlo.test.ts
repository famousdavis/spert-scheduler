import { describe, it, expect } from "vitest";
import { runMonteCarloSimulation } from "./monte-carlo";
import type { Activity } from "@domain/models/types";

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

  it("histogram bin counts sum to trial count", () => {
    const result = runMonteCarloSimulation({
      activities: [makeActivity()],
      trialCount: 5000,
      rngSeed: "histogram-test",
    });
    const totalCount = result.histogramBins.reduce(
      (sum, b) => sum + b.count,
      0
    );
    expect(totalCount).toBe(5000);
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
});
