import type { Activity, SimulationRun } from "@domain/models/types";
import { ENGINE_VERSION } from "@domain/models/types";
import { createDistributionForActivity } from "@core/distributions/factory";
import type { Distribution } from "@core/distributions/distribution";
import { createSeededRng } from "@infrastructure/rng";
import {
  sortSamples,
  computeStandardPercentiles,
  percentile as computePercentile,
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
  /** Optional progress callback, called every `progressInterval` trials. */
  onProgress?: (completedTrials: number, totalTrials: number) => void;
  /** How often to report progress (default: 10000). */
  progressInterval?: number;
}

/**
 * Run Monte Carlo trials and return raw samples.
 *
 * Shared between the pure function and the Web Worker.
 * Parkinson's Law: each activity's duration is at least its deterministic
 * (scheduled) duration, because work expands to fill time allotted.
 */
export function runTrials(input: MonteCarloInput): Float64Array {
  const {
    activities,
    trialCount,
    rngSeed,
    deterministicDurations,
    onProgress,
    progressInterval = 10000,
  } = input;

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

  // Run trials
  const samples = new Float64Array(trialCount);
  const shouldReportProgress = onProgress && trialCount >= progressInterval;

  for (let trial = 0; trial < trialCount; trial++) {
    let totalDays = completedSum;
    for (let i = 0; i < distributions.length; i++) {
      const sampled = distributions[i]!.sample(rng);
      const floor = deterministicDurations?.[i] ?? 0;
      totalDays += Math.max(floor, sampled);
    }
    samples[trial] = totalDays;

    if (
      shouldReportProgress &&
      (trial + 1) % progressInterval === 0 &&
      trial + 1 < trialCount
    ) {
      onProgress(trial + 1, trialCount);
    }
  }

  return samples;
}

/**
 * Compute simulation statistics from raw sorted samples.
 */
export function computeSimulationStats(
  samples: Float64Array,
  trialCount: number,
  rngSeed: string
): SimulationRun {
  sortSamples(samples);

  // Build histogram from samples ≤ P99 to exclude extreme outliers
  const p99 = computePercentile(samples, 0.99);
  let p99EndIdx = samples.length;
  for (let i = samples.length - 1; i >= 0; i--) {
    if (samples[i]! <= p99) {
      p99EndIdx = i + 1;
      break;
    }
  }
  const histogramSamples = samples.subarray(0, p99EndIdx);

  return {
    id: "", // Set by caller (service layer)
    timestamp: new Date().toISOString(),
    trialCount,
    seed: rngSeed,
    engineVersion: ENGINE_VERSION,
    percentiles: computeStandardPercentiles(samples),
    histogramBins: histogram(histogramSamples, 40),
    mean: computeMean(samples),
    standardDeviation: computeSD(samples),
    minSample: samples[0] ?? 0,
    maxSample: samples[trialCount - 1] ?? 0,
    samples: Array.from(samples),
  };
}

/**
 * Run a Monte Carlo simulation. Pure function, no DOM, no Worker API.
 */
export function runMonteCarloSimulation(input: MonteCarloInput): SimulationRun {
  const samples = runTrials(input);
  return computeSimulationStats(samples, input.trialCount, input.rngSeed);
}
