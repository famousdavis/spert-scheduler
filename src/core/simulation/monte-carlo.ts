// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import type { Activity, ActivityDependency, SimulationRun } from "@domain/models/types";
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
import {
  buildDependencyGraph,
  computeCriticalPathDuration,
  computeCriticalPathWithMilestones,
} from "@core/schedule/dependency-graph";

/** Per-activity constraint info for sequential mode (parallel to activities array). */
export interface SequentialConstraintEntry {
  type: string;          // ConstraintType
  offsetFromStart: number;
  mode: string;          // ConstraintMode
}

export interface MonteCarloInput {
  activities: Activity[];
  trialCount: number;
  rngSeed: string;
  /** Per non-complete activity deterministic duration (Parkinson's Law floor). */
  deterministicDurations?: number[];
  /** Per-activity constraint info for sequential mode (parallel to activities array, null = no constraint). */
  sequentialConstraints?: (SequentialConstraintEntry | null)[];
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
    sequentialConstraints,
    onProgress,
    progressInterval = 10000,
  } = input;

  const rng = createSeededRng(rngSeed);
  const hasConstraints = sequentialConstraints?.some((c) => c !== null) ?? false;

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

  if (hasConstraints) {
    // Position-tracking path: constraints can insert idle gaps
    // Build per-activity info array (preserves activity order for constraint alignment)
    const activityInfos: Array<
      | { type: "complete"; duration: number }
      | { type: "active"; distIndex: number; floor: number }
    > = [];
    let distIdx = 0;
    for (const activity of activities) {
      if (activity.status === "complete" && activity.actualDuration != null) {
        activityInfos.push({ type: "complete", duration: activity.actualDuration });
      } else {
        activityInfos.push({
          type: "active",
          distIndex: distIdx,
          floor: deterministicDurations?.[distIdx] ?? 0,
        });
        distIdx++;
      }
    }

    for (let trial = 0; trial < trialCount; trial++) {
      let currentPos = 0; // cumulative working-day offset from project start

      for (let a = 0; a < activityInfos.length; a++) {
        const info = activityInfos[a]!;
        let duration: number;

        if (info.type === "complete") {
          duration = info.duration;
        } else {
          const sampled = distributions[info.distIndex]!.sample(rng);
          duration = Math.max(info.floor, sampled);
        }

        // Apply hard constraint (soft constraints have no per-trial effect)
        const constraint = sequentialConstraints![a];
        if (constraint && constraint.mode === "hard") {
          const offset = constraint.offsetFromStart;
          switch (constraint.type) {
            case "MSO":
            case "SNET":
              // Push start to at least the constraint offset
              currentPos = Math.max(currentPos, offset);
              break;
            case "MFO": {
              // Pin finish at constraint offset; back-calculate start
              const es = Math.max(offset - duration, currentPos);
              currentPos = es;
              break;
            }
            case "FNET": {
              // Push finish to at least constraint offset
              const naturalEnd = currentPos + duration;
              if (offset > naturalEnd) {
                currentPos = offset - duration;
              }
              break;
            }
            // SNLT, FNLT: no per-trial effect
          }
        }

        currentPos += duration;
      }

      samples[trial] = currentPos;

      if (
        shouldReportProgress &&
        (trial + 1) % progressInterval === 0 &&
        trial + 1 < trialCount
      ) {
        onProgress(trial + 1, trialCount);
      }
    }
  } else {
    // Fast path: no constraints, simple sum of durations
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
  }

  return samples;
}

// -- Dependency-aware Monte Carlo --------------------------------------------

export interface DependencyMonteCarloInput {
  activities: Activity[];
  dependencies: ActivityDependency[];
  trialCount: number;
  rngSeed: string;
  /** Per-activity deterministic duration (Parkinson's Law floor), keyed by activity ID. */
  deterministicDurationMap?: Map<string, number>;
  /** Map of milestoneId → list of activity IDs assigned to that milestone. */
  milestoneActivityIds?: Map<string, string[]>;
  /** Map of activityId → earliest start offset in working days (from startsAtMilestoneId). */
  activityEarliestStart?: Map<string, number>;
  /** Map of activityId → constraint info for per-trial clamping. */
  constraintMap?: Map<string, { type: string; offsetFromStart: number; mode: string }>;
  /** Optional progress callback. */
  onProgress?: (completedTrials: number, totalTrials: number) => void;
  /** How often to report progress (default: 10000). */
  progressInterval?: number;
}

/**
 * Run Monte Carlo trials using a dependency graph.
 * Per trial: sample each activity's duration, compute the critical path.
 *
 * Parkinson's Law: each activity's trial duration is clamped to at least
 * its deterministic (scheduled) duration.
 */
export interface DependencyTrialsResult {
  samples: Float64Array;
  milestoneSamples?: Map<string, Float64Array>;
}

export function runDependencyTrials(input: DependencyMonteCarloInput): DependencyTrialsResult {
  const {
    activities,
    dependencies,
    trialCount,
    rngSeed,
    deterministicDurationMap,
    milestoneActivityIds,
    activityEarliestStart,
    constraintMap,
    onProgress,
    progressInterval = 10000,
  } = input;

  const rng = createSeededRng(rngSeed);
  const activityIds = activities.map((a) => a.id);

  // Build graph once (reused across all trials)
  const graph = buildDependencyGraph(activityIds, dependencies);

  // Separate completed activities and build distribution list for active ones
  const completedDurations = new Map<string, number>();
  const activeDistributions = new Map<string, Distribution>();
  const activeFloors = new Map<string, number>();

  for (const activity of activities) {
    if (activity.status === "complete" && activity.actualDuration != null) {
      completedDurations.set(activity.id, activity.actualDuration);
    } else {
      activeDistributions.set(activity.id, createDistributionForActivity(activity));
      activeFloors.set(
        activity.id,
        deterministicDurationMap?.get(activity.id) ?? 0
      );
    }
  }

  const hasMilestones = milestoneActivityIds && milestoneActivityIds.size > 0;
  const samples = new Float64Array(trialCount);
  const shouldReportProgress = onProgress && trialCount >= progressInterval;
  const trialDurations = new Map<string, number>();

  // Pre-allocate milestone sample arrays
  const milestoneSamples = hasMilestones
    ? new Map<string, Float64Array>(
        Array.from(milestoneActivityIds.keys()).map((id) => [id, new Float64Array(trialCount)])
      )
    : undefined;

  for (let trial = 0; trial < trialCount; trial++) {
    // Build duration map for this trial
    trialDurations.clear();

    for (const id of activityIds) {
      const completedDur = completedDurations.get(id);
      if (completedDur !== undefined) {
        trialDurations.set(id, completedDur);
      } else {
        const dist = activeDistributions.get(id)!;
        const sampled = dist.sample(rng);
        const floor = activeFloors.get(id) ?? 0;
        trialDurations.set(id, Math.max(floor, sampled));
      }
    }

    if (hasMilestones) {
      const result = computeCriticalPathWithMilestones(
        graph,
        trialDurations,
        milestoneActivityIds,
        activityEarliestStart,
        constraintMap,
      );
      samples[trial] = result.projectDuration;
      for (const [milestoneId, duration] of result.milestoneDurations) {
        milestoneSamples!.get(milestoneId)![trial] = duration;
      }
    } else if (constraintMap && constraintMap.size > 0) {
      // Use milestone-aware path for constraint support (empty milestones)
      const result = computeCriticalPathWithMilestones(
        graph,
        trialDurations,
        new Map(),
        activityEarliestStart,
        constraintMap,
      );
      samples[trial] = result.projectDuration;
    } else {
      samples[trial] = computeCriticalPathDuration(graph, trialDurations);
    }

    if (
      shouldReportProgress &&
      (trial + 1) % progressInterval === 0 &&
      trial + 1 < trialCount
    ) {
      onProgress(trial + 1, trialCount);
    }
  }

  return { samples, milestoneSamples };
}

/**
 * Compute per-milestone statistics from milestone MC samples.
 */
export function computeMilestoneStats(
  milestoneSamples: Map<string, Float64Array>,
  _trialCount?: number
): Record<string, { percentiles: Record<number, number>; mean: number; standardDeviation: number }> {
  const results: Record<string, { percentiles: Record<number, number>; mean: number; standardDeviation: number }> = {};

  for (const [milestoneId, samples] of milestoneSamples) {
    // Sort in-place for percentile calculation
    sortSamples(samples);
    results[milestoneId] = {
      percentiles: computeStandardPercentiles(samples),
      mean: computeMean(samples),
      standardDeviation: computeSD(samples),
    };
  }

  return results;
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
