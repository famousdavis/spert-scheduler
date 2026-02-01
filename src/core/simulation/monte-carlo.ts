import type { Activity, SimulationRun } from "@domain/models/types";
import { ENGINE_VERSION, STANDARD_PERCENTILES } from "@domain/models/types";
import { createDistributionForActivity } from "@core/distributions/factory";
import type { Distribution } from "@core/distributions/distribution";
import { createSeededRng } from "@infrastructure/rng";
import {
  sortSamples,
  percentile,
  mean as computeMean,
  standardDeviation as computeSD,
  histogram,
} from "@core/analytics/analytics";

export interface MonteCarloInput {
  activities: Activity[];
  trialCount: number;
  rngSeed: string;
  /** Per non-complete activity deterministic duration (Parkinson's Law floor). */
  deterministicDurations?: number[];
}

/**
 * Run a Monte Carlo simulation. Pure function, no DOM, no Worker API.
 *
 * Algorithm (v1 -- sum of samples):
 * - Sum actualDuration for complete activities
 * - Create distributions for non-complete activities
 * - For each trial, sum samples from distributions + completed sum
 * - Clamp negative samples to zero (modeling decision, see plan Section 7)
 */
export function runMonteCarloSimulation(input: MonteCarloInput): SimulationRun {
  const { activities, trialCount, rngSeed, deterministicDurations } = input;
  const rng = createSeededRng(rngSeed);

  // Separate completed activities from active ones
  let completedSum = 0;
  const distributions: Distribution[] = [];

  for (const activity of activities) {
    if (activity.status === "complete" && activity.actualDuration != null) {
      completedSum += activity.actualDuration;
    } else {
      distributions.push(createDistributionForActivity(activity));
    }
  }

  // Run trials — Parkinson's Law: each activity's duration is at least its
  // deterministic (scheduled) duration, because work expands to fill time allotted.
  const samples = new Float64Array(trialCount);
  for (let trial = 0; trial < trialCount; trial++) {
    let totalDays = completedSum;
    for (let i = 0; i < distributions.length; i++) {
      const sampled = distributions[i]!.sample(rng);
      const floor = deterministicDurations?.[i] ?? 0;
      totalDays += Math.max(floor, sampled);
    }
    samples[trial] = totalDays;
  }

  // Sort for percentile computation
  sortSamples(samples);

  // Compute statistics
  const sampleMean = computeMean(samples);
  const sampleSD = computeSD(samples);
  const minSample = samples[0]!;
  const maxSample = samples[trialCount - 1]!;

  // Compute standard percentiles
  const percentiles: Record<number, number> = {};
  for (const p of STANDARD_PERCENTILES) {
    percentiles[p] = percentile(samples, p / 100);
  }

  // Generate histogram
  const histogramBins = histogram(samples, 40);

  return {
    id: "", // Set by caller (service layer)
    timestamp: new Date().toISOString(),
    trialCount,
    seed: rngSeed,
    engineVersion: ENGINE_VERSION,
    percentiles,
    histogramBins,
    mean: sampleMean,
    standardDeviation: sampleSD,
    minSample,
    maxSample,
    samples: Array.from(samples),
  };
}
