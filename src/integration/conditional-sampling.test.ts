// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach } from "vitest";
import {
  runMonteCarloSimulation,
  runTrials,
  runDependencyTrials,
  computeSimulationStats,
} from "@core/simulation/monte-carlo";
import { LocalStorageRepository } from "@infrastructure/persistence/local-storage-repository";
import { createProject, createScenario, addScenarioToProject } from "@app/api/project-service";
import type { Activity, SimulationRun } from "@domain/models/types";
import { ENGINE_VERSION } from "@domain/models/types";

function makeActivity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: "a1",
    name: "Task",
    min: 2,
    mostLikely: 5,
    max: 12,
    confidenceLevel: "mediumConfidence",
    distributionType: "triangular",
    status: "planned",
    ...overrides,
  };
}

// Pointwise coupling: with the same seed, a truncated draw inverseCDF(p0 + u(1-p0)) is
// >= the base draw inverseCDF(u) for every u (monotone inverseCDF, p0 >= 0). Therefore
// every trial's conditioned duration >= its unconditioned duration, and order statistics
// (percentiles) inherit the domination deterministically — no MC-noise flakiness.

describe("conditional sampling — parity (sequential vs dependency)", () => {
  it("single in-progress Triangular: bitwise-identical samples across both modes", () => {
    // Triangular consumes exactly 1 RNG draw per trial in both engines, so the same seed
    // yields identical streams. (Normal/LogNormal would differ: Box-Muller is 2 draws.)
    const activity = makeActivity({
      id: "t1",
      status: "inProgress",
      actualDuration: 7,
      distributionType: "triangular",
    });

    const seq = runTrials({ activities: [activity], trialCount: 5000, rngSeed: "parity" }).samples;
    const dep = runDependencyTrials({
      activities: [activity],
      dependencies: [],
      trialCount: 5000,
      rngSeed: "parity",
    }).samples;

    expect(Array.from(seq)).toEqual(Array.from(dep));
  });
});

describe("conditional sampling — upward P95 shift", () => {
  it("deep overrun (t = 0.9*max, Parkinson OFF): conditioned P95 > unconditioned P95", () => {
    const planned = makeActivity({ id: "d1", min: 1, mostLikely: 5, max: 10, status: "planned" });
    const inProgress = makeActivity({
      id: "d1",
      min: 1,
      mostLikely: 5,
      max: 10,
      status: "inProgress",
      actualDuration: 9, // 0.9 * max; cdf(9) ~= 0.978 (not a breach)
    });

    const before = runMonteCarloSimulation({ activities: [planned], trialCount: 20000, rngSeed: "overrun" });
    const after = runMonteCarloSimulation({ activities: [inProgress], trialCount: 20000, rngSeed: "overrun" });

    expect(after.percentiles[95]!).toBeGreaterThan(before.percentiles[95]!);
  });

  it("on-track (Parkinson ON): conditioned shifts up even under the plan-anchored floor", () => {
    // Triangular(2,10,30); t=11 → p0 ~= 0.36 (consumed < P50 plan ~13.3 → on-track).
    // Floor 14 (< base P95 ~24.7) is identical for both runs, isolating the effect to
    // the conditioned draw. Same seed → pointwise coupling → deterministic domination.
    const base = { id: "o1", min: 2, mostLikely: 10, max: 30, distributionType: "triangular" as const };
    const planned = makeActivity({ ...base, status: "planned" });
    const inProgress = makeActivity({ ...base, status: "inProgress", actualDuration: 11 });
    const floor = [14];

    const before = runMonteCarloSimulation({
      activities: [planned],
      trialCount: 20000,
      rngSeed: "ontrack",
      deterministicDurations: floor,
    });
    const after = runMonteCarloSimulation({
      activities: [inProgress],
      trialCount: 20000,
      rngSeed: "ontrack",
      deterministicDurations: floor,
    });

    expect(after.percentiles[95]!).toBeGreaterThanOrEqual(before.percentiles[95]!);
    expect(after.mean).toBeGreaterThan(before.mean + 0.5); // macroscopic, not noise
  });
});

describe("conditional sampling — modelExhaustedActivityIds propagation", () => {
  const breached = makeActivity({
    id: "b1",
    min: 2,
    mostLikely: 5,
    max: 12,
    status: "inProgress",
    actualDuration: 12, // t >= max → breach (bounded)
    distributionType: "triangular",
  });

  it("sequential (runMonteCarloSimulation) attaches the breached ID", () => {
    const run = runMonteCarloSimulation({ activities: [breached], trialCount: 1000, rngSeed: "seq-breach" });
    expect(run.modelExhaustedActivityIds).toEqual(["b1"]);
  });

  it("default worker sequential path (runTrials -> computeSimulationStats) attaches the ID", () => {
    // Mirrors exactly what simulation.worker.ts does on the default path: the optional
    // exhaustedIds param is NOT forced by the type-checker, so this guards the wiring.
    const { samples, exhaustedIds } = runTrials({ activities: [breached], trialCount: 1000, rngSeed: "worker-seq" });
    const run = computeSimulationStats(samples, 1000, "worker-seq", exhaustedIds);
    expect(run.modelExhaustedActivityIds).toEqual(["b1"]);
  });

  it("dependency mode (runDependencyTrials -> computeSimulationStats) attaches the ID", () => {
    const dep = runDependencyTrials({
      activities: [breached],
      dependencies: [],
      trialCount: 1000,
      rngSeed: "dep-breach",
    });
    const run = computeSimulationStats(dep.samples, 1000, "dep-breach", dep.exhaustedIds);
    expect(run.modelExhaustedActivityIds).toEqual(["b1"]);
  });

  it("no breach: modelExhaustedActivityIds is undefined (omit-when-empty, not [])", () => {
    const onTrack = makeActivity({ id: "ok", status: "inProgress", actualDuration: 6 });
    const run = runMonteCarloSimulation({ activities: [onTrack], trialCount: 1000, rngSeed: "no-breach" });
    expect(run.modelExhaustedActivityIds).toBeUndefined();
  });
});

describe("conditional sampling — regression (planned-only / complete-only unchanged)", () => {
  it("complete-only project is a deterministic point mass (unchanged)", () => {
    const activities = [
      makeActivity({ id: "c1", status: "complete", actualDuration: 5 }),
      makeActivity({ id: "c2", status: "complete", actualDuration: 8 }),
    ];
    const run = runMonteCarloSimulation({ activities, trialCount: 1000, rngSeed: "complete" });
    expect(run.percentiles[50]).toBe(13);
    expect(run.percentiles[95]).toBe(13);
    expect(run.mean).toBe(13);
    expect(run.standardDeviation).toBe(0);
    expect(run.modelExhaustedActivityIds).toBeUndefined();
  });

  it("planned-only percentiles match the pre-change golden (byte-identical)", () => {
    // Planned activities route through buildMcDistribution -> base (no wrapper), so these
    // values are unchanged from before conditional sampling. Golden captured on this seed.
    const activities = [
      makeActivity({ id: "p1", min: 2, mostLikely: 5, max: 12, distributionType: "triangular" }),
      makeActivity({ id: "p2", min: 3, mostLikely: 8, max: 20, distributionType: "normal" }),
      makeActivity({ id: "p3", min: 1, mostLikely: 4, max: 9, distributionType: "logNormal" }),
    ];
    const run = runMonteCarloSimulation({ activities, trialCount: 10000, rngSeed: "planned-golden" });

    expect(run.percentiles).toEqual(PLANNED_GOLDEN.percentiles);
    expect(run.mean).toBeCloseTo(PLANNED_GOLDEN.mean, 10);
    expect(run.standardDeviation).toBeCloseTo(PLANNED_GOLDEN.standardDeviation, 10);
    expect(run.modelExhaustedActivityIds).toBeUndefined();
  });
});

describe("conditional sampling — Zod persistence round-trip", () => {
  let repo: LocalStorageRepository;
  beforeEach(() => {
    localStorage.clear();
    repo = new LocalStorageRepository();
  });

  it("modelExhaustedActivityIds survives repository save -> load (ProjectSchema.safeParse)", () => {
    let project = createProject("Breach Persist");
    project = addScenarioToProject(project, createScenario("Baseline", "2025-03-01"));

    const run: SimulationRun = {
      id: "run-1",
      timestamp: "2026-06-10T00:00:00.000Z",
      trialCount: 1000,
      seed: "s",
      engineVersion: ENGINE_VERSION,
      percentiles: { 50: 10, 95: 15 },
      histogramBins: [],
      mean: 10,
      standardDeviation: 2,
      minSample: 5,
      maxSample: 20,
      samples: [],
      modelExhaustedActivityIds: ["act-1"],
    };
    const scenario = { ...project.scenarios[0]!, simulationResults: run };
    project = { ...project, scenarios: [scenario] };

    repo.save(project);
    const loaded = repo.load(project.id);

    expect(loaded).not.toBeNull();
    expect(loaded!.scenarios[0]!.simulationResults?.modelExhaustedActivityIds).toEqual(["act-1"]);
  });
});

// Golden captured from seed "planned-golden" on this fixture. Planned-only routes
// through buildMcDistribution -> base, so these are byte-identical to pre-change.
const PLANNED_GOLDEN: { percentiles: Record<number, number>; mean: number; standardDeviation: number } = {
  percentiles: {
    5: 12.986252937536076,
    10: 14.442063545687382,
    25: 16.972384546455736,
    50: 19.832293023614277,
    55: 20.39176732666612,
    60: 20.99013893022914,
    65: 21.570878414592066,
    70: 22.189890690816913,
    75: 22.863199998855507,
    80: 23.535767650544486,
    85: 24.372836593996592,
    90: 25.426786968297108,
    95: 27.079620287163994,
    96: 27.60963403560251,
    97: 28.1588599009526,
    98: 29.02409569386602,
    99: 30.224802954620323,
  },
  mean: 19.922339258537484,
  standardDeviation: 4.294564641430211,
};
