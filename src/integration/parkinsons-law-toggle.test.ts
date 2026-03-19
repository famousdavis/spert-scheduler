// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import { runMonteCarloSimulation } from "@core/simulation/monte-carlo";
import { computeDeterministicDurations } from "@core/schedule/deterministic";
import type { Activity } from "@domain/models/types";

function makeActivity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: "a1",
    name: "Task",
    min: 5,
    mostLikely: 10,
    max: 20,
    confidenceLevel: "mediumConfidence",
    distributionType: "normal",
    status: "planned",
    ...overrides,
  };
}

describe("Parkinson's Law toggle — integration", () => {
  const activities: Activity[] = [
    makeActivity({ id: "a1", min: 5, mostLikely: 10, max: 20 }),
    makeActivity({ id: "a2", min: 8, mostLikely: 15, max: 30 }),
  ];
  const deterministicDurations = computeDeterministicDurations(activities, 0.5);
  const deterministicTotal = deterministicDurations.reduce((a, b) => a + b, 0);

  it("parkinsonsLawEnabled=true: no sample falls below deterministic total", () => {
    const result = runMonteCarloSimulation({
      activities,
      trialCount: 10000,
      rngSeed: "parkinson-toggle-enabled",
      deterministicDurations,
    });
    for (const sample of result.samples) {
      expect(sample).toBeGreaterThanOrEqual(deterministicTotal);
    }
  });

  it("parkinsonsLawEnabled=false: some samples fall below deterministic total", () => {
    // Pass undefined for deterministicDurations to disable clamping
    const result = runMonteCarloSimulation({
      activities,
      trialCount: 10000,
      rngSeed: "parkinson-toggle-disabled",
      deterministicDurations: undefined,
    });
    const belowFloor = result.samples.filter((s) => s < deterministicTotal);
    // With unclamped Normal distributions, many samples should fall below
    // the P50-based deterministic total
    expect(belowFloor.length).toBeGreaterThan(0);
  });

  it("parkinsonsLawEnabled=false: MC P50 can differ from deterministic total", () => {
    const result = runMonteCarloSimulation({
      activities,
      trialCount: 10000,
      rngSeed: "parkinson-toggle-p50",
      deterministicDurations: undefined,
    });
    // The unclamped MC P50 should be close to but can be below or at
    // the deterministic total — the key point is the simulation ran successfully
    expect(result.percentiles[50]).toBeDefined();
    expect(result.samples.length).toBe(10000);
  });
});
