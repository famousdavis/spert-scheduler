// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { Activity, ActivityDependency, SimulationRun } from "@domain/models/types";
import { ENGINE_VERSION } from "@domain/models/types";
import { createDistributionForActivity } from "@core/distributions/factory";
import { buildMcDistribution } from "@core/distributions/truncated";
import type { Distribution } from "@core/distributions/distribution";
import { createSeededRng } from "@infrastructure/rng";
import type { SeededRng } from "@infrastructure/rng/seeded-rng";
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

/** One activity as the constrained sequential loop needs it: order-preserving. */
type SequentialActivityInfo =
  | { type: "complete"; duration: number }
  | { type: "active"; distIndex: number; floor: number };

/**
 * Split activities into a completed-duration sum and a distribution list.
 *
 * Runs ONCE per simulation, not per trial — extracting it costs nothing measurable.
 * The conditional-sampling seam (v0.49.0) lives here: in-progress activities draw from
 * X | X > t, and an activity whose model is exhausted is reported by id.
 */
function buildActivityDistributions(activities: Activity[]): {
  completedSum: number;
  distributions: Distribution[];
  exhaustedIds: string[];
} {
  let completedSum = 0;
  const distributions: Distribution[] = [];
  const exhaustedIds: string[] = [];
  for (const activity of activities) {
    if (activity.status === "complete" && activity.actualDuration != null) {
      completedSum += activity.actualDuration;
    } else {
      const base = createDistributionForActivity(activity);
      const { dist, isExhausted } = buildMcDistribution(activity, base);
      distributions.push(dist);
      if (isExhausted) exhaustedIds.push(activity.id);
    }
  }
  return { completedSum, distributions, exhaustedIds };
}

/**
 * Per-activity info for the constrained path, in ACTIVITY order.
 *
 * The ordering is load-bearing: `sequentialConstraints[a]` is indexed by activity
 * position, not by distribution position, so completed activities must keep their slot.
 * Runs once per simulation.
 */
function buildSequentialActivityInfos(
  activities: Activity[],
  deterministicDurations: number[] | undefined,
): SequentialActivityInfo[] {
  const infos: SequentialActivityInfo[] = [];
  let distIdx = 0;
  for (const activity of activities) {
    if (activity.status === "complete" && activity.actualDuration != null) {
      infos.push({ type: "complete", duration: activity.actualDuration });
    } else {
      infos.push({
        type: "active",
        distIndex: distIdx,
        floor: deterministicDurations?.[distIdx] ?? 0,
      });
      distIdx++;
    }
  }
  return infos;
}

/**
 * Apply one hard constraint and return the activity's start position.
 *
 * ⚠️ THIS IS THE ONE EXTRACTION INSIDE A HOT LOOP — called once per activity per trial
 * (400,000 times for the 40-activity sample at the default trial count). Measured rather
 * than assumed; see `monte-carlo.bench.ts`, whose CONSTRAINED variant exists precisely
 * because the sample project is unconstrained and would not have exercised this at all.
 *
 * Soft constraints have no per-trial effect, and SNLT/FNLT none in sequential mode.
 * Offsets are exclusive-finish (`offset + 1`), matching v0.54.0's MFO/FNET fix.
 */
function applyHardConstraint(
  currentPos: number,
  duration: number,
  constraint: SequentialConstraintEntry,
): number {
  const offset = constraint.offsetFromStart;
  switch (constraint.type) {
    case "MSO":
    case "SNET":
      // Push start to at least the constraint offset.
      return Math.max(currentPos, offset);
    case "MFO":
      // Finish ON the constraint date; floor semantics — a later natural finish overruns.
      return Math.max(offset + 1 - duration, currentPos);
    case "FNET": {
      // Push finish to at least the constraint date.
      const naturalEnd = currentPos + duration;
      return offset + 1 > naturalEnd ? offset + 1 - duration : currentPos;
    }
    default:
      return currentPos;
  }
}

/** The per-trial sample loop for the constrained path — positions, not a plain sum. */
function runConstrainedTrials(
  samples: Float64Array,
  infos: SequentialActivityInfo[],
  distributions: Distribution[],
  sequentialConstraints: (SequentialConstraintEntry | null)[],
  rng: SeededRng,
  reportProgress: ((trial: number) => void) | null,
): void {
  const trialCount = samples.length;
  for (let trial = 0; trial < trialCount; trial++) {
    let currentPos = 0; // cumulative working-day offset from project start
    for (let a = 0; a < infos.length; a++) {
      const info = infos[a]!;
      const duration =
        info.type === "complete"
          ? info.duration
          : Math.max(info.floor, distributions[info.distIndex]!.sample(rng));
      const constraint = sequentialConstraints[a];
      if (constraint && constraint.mode === "hard") {
        currentPos = applyHardConstraint(currentPos, duration, constraint);
      }
      currentPos += duration;
    }
    samples[trial] = currentPos;
    reportProgress?.(trial);
  }
}

/** The per-trial sample loop for the unconstrained fast path — a plain sum. */
function runFastTrials(
  samples: Float64Array,
  completedSum: number,
  distributions: Distribution[],
  deterministicDurations: number[] | undefined,
  rng: SeededRng,
  reportProgress: ((trial: number) => void) | null,
): void {
  const trialCount = samples.length;
  for (let trial = 0; trial < trialCount; trial++) {
    let totalDays = completedSum;
    for (let i = 0; i < distributions.length; i++) {
      const sampled = distributions[i]!.sample(rng);
      const floor = deterministicDurations?.[i] ?? 0;
      totalDays += Math.max(floor, sampled);
    }
    samples[trial] = totalDays;
    reportProgress?.(trial);
  }
}

/**
 * A per-trial progress reporter, or null when progress is not being reported.
 *
 * Returning null rather than a no-op keeps the hot loop's cost at one `?.` null check
 * instead of a function call per trial when nobody is listening — which is the common case.
 */
function makeProgressReporter(
  trialCount: number,
  onProgress: ((completed: number, total: number) => void) | undefined,
  progressInterval: number,
): ((trial: number) => void) | null {
  if (!onProgress || trialCount < progressInterval) return null;
  return (trial: number) => {
    if ((trial + 1) % progressInterval === 0 && trial + 1 < trialCount) {
      onProgress(trial + 1, trialCount);
    }
  };
}

/**
 * Run Monte Carlo trials and return raw samples.
 *
 * Shared between the pure function and the Web Worker.
 * Parkinson's Law: each activity's duration is at least its deterministic
 * (scheduled) duration, because work expands to fill time allotted.
 */
export function runTrials(input: MonteCarloInput): { samples: Float64Array; exhaustedIds: string[] } {
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
  const { completedSum, distributions, exhaustedIds } = buildActivityDistributions(activities);
  const samples = new Float64Array(trialCount);
  const reportProgress = makeProgressReporter(trialCount, onProgress, progressInterval);
  const hasConstraints = sequentialConstraints?.some((c) => c !== null) ?? false;

  if (hasConstraints) {
    // Position-tracking path: constraints can insert idle gaps, so a running position is
    // tracked rather than a plain sum, and activity order must be preserved.
    runConstrainedTrials(
      samples,
      buildSequentialActivityInfos(activities, deterministicDurations),
      distributions,
      sequentialConstraints!,
      rng,
      reportProgress,
    );
  } else {
    runFastTrials(samples, completedSum, distributions, deterministicDurations, rng, reportProgress);
  }

  return { samples, exhaustedIds };
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
  exhaustedIds: string[];
}

/** Per-activity sampling inputs for dependency mode, keyed by activity id. */
interface DependencySamplingModel {
  completedDurations: Map<string, number>;
  activeDistributions: Map<string, Distribution>;
  activeFloors: Map<string, number>;
  exhaustedIds: string[];
}

/**
 * Build the dependency-mode sampling model. Runs ONCE per simulation.
 *
 * Keyed by id rather than position, because the critical-path engine addresses activities
 * by id — this is the same split as `buildActivityDistributions` but a different shape,
 * and merging them would force one caller to convert on every trial.
 */
function buildDependencySamplingModel(
  activities: Activity[],
  deterministicDurationMap: Map<string, number> | undefined,
): DependencySamplingModel {
  const completedDurations = new Map<string, number>();
  const activeDistributions = new Map<string, Distribution>();
  const activeFloors = new Map<string, number>();
  const exhaustedIds: string[] = [];
  for (const activity of activities) {
    if (activity.status === "complete" && activity.actualDuration != null) {
      completedDurations.set(activity.id, activity.actualDuration);
    } else {
      // Conditional sampling seam (dependency mode): X | X > t for in-progress.
      const base = createDistributionForActivity(activity);
      const { dist, isExhausted } = buildMcDistribution(activity, base);
      activeDistributions.set(activity.id, dist);
      if (isExhausted) exhaustedIds.push(activity.id);
      activeFloors.set(activity.id, deterministicDurationMap?.get(activity.id) ?? 0);
    }
  }
  return { completedDurations, activeDistributions, activeFloors, exhaustedIds };
}

/**
 * Fill `out` with this trial's per-activity durations.
 *
 * ⚠️ HOT — once per trial. Mutates the caller's Map rather than returning a new one, which
 * is deliberate: the original cleared and refilled a single Map across all trials to avoid
 * an allocation per trial, and that property is preserved here. Measured, not assumed —
 * see `monte-carlo.bench.ts`.
 */
function sampleTrialDurations(
  out: Map<string, number>,
  activityIds: string[],
  model: DependencySamplingModel,
  rng: SeededRng,
): void {
  // ⚠️ Destructured ONCE per trial, not per activity. Reading `model.completedDurations`
  // inside the inner loop costs three property lookups per activity per trial — 1.2M for
  // the 40-activity sample at 10,000 trials — and the first draft did exactly that,
  // measuring +3.8% against the pre-decomposition baseline. Hoisting them brought it back
  // under the benchmark's resolution. Do not re-inline these.
  const { completedDurations, activeDistributions, activeFloors } = model;
  out.clear();
  for (const id of activityIds) {
    const completedDur = completedDurations.get(id);
    if (completedDur !== undefined) {
      out.set(id, completedDur);
      continue;
    }
    const sampled = activeDistributions.get(id)!.sample(rng);
    out.set(id, Math.max(activeFloors.get(id) ?? 0, sampled));
  }
}

/**
 * Build the per-trial "compute the project duration and record it" step, choosing the
 * critical-path variant ONCE rather than re-branching on every trial.
 *
 * Three shapes, and which one applies never changes within a simulation:
 *   - milestones present            -> milestone-aware path, fills the milestone arrays
 *   - constraints but no milestones -> the same call with an empty milestone map
 *   - neither                       -> the plain critical-path call
 *
 * Returning a closure rather than branching in the loop is what let `runDependencyTrials`
 * drop from 17 to under the threshold, and it removes a per-trial branch as a side effect.
 */
function makeTrialRecorder(
  graph: ReturnType<typeof buildDependencyGraph>,
  samples: Float64Array,
  milestoneSamples: Map<string, Float64Array> | undefined,
  milestoneActivityIds: Map<string, string[]> | undefined,
  activityEarliestStart: Map<string, number> | undefined,
  constraintMap: Map<string, { type: string; offsetFromStart: number; mode: string }> | undefined,
): (trial: number, durations: Map<string, number>) => void {
  const hasMilestones = !!milestoneActivityIds && milestoneActivityIds.size > 0;

  if (hasMilestones) {
    return (trial, durations) => {
      const result = computeCriticalPathWithMilestones(
        graph,
        durations,
        milestoneActivityIds,
        activityEarliestStart,
        constraintMap,
      );
      samples[trial] = result.projectDuration;
      for (const [milestoneId, duration] of result.milestoneDurations) {
        milestoneSamples!.get(milestoneId)![trial] = duration;
      }
    };
  }

  if (constraintMap && constraintMap.size > 0) {
    // Constraints without milestones: same engine call, empty milestone map. Allocated
    // once here rather than per trial, which the inlined version did not do.
    const noMilestones = new Map<string, string[]>();
    return (trial, durations) => {
      const result = computeCriticalPathWithMilestones(
        graph,
        durations,
        noMilestones,
        activityEarliestStart,
        constraintMap,
      );
      samples[trial] = result.projectDuration;
    };
  }

  return (trial, durations) => {
    samples[trial] = computeCriticalPathDuration(graph, durations);
  };
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
  // Built once and reused across all trials.
  const graph = buildDependencyGraph(activityIds, dependencies);
  const model = buildDependencySamplingModel(activities, deterministicDurationMap);

  const hasMilestones = !!milestoneActivityIds && milestoneActivityIds.size > 0;
  const samples = new Float64Array(trialCount);
  const reportProgress = makeProgressReporter(trialCount, onProgress, progressInterval);
  // One Map reused across trials — see sampleTrialDurations on why it is not reallocated.
  const trialDurations = new Map<string, number>();

  const milestoneSamples = hasMilestones
    ? new Map<string, Float64Array>(
        Array.from(milestoneActivityIds.keys()).map((id) => [id, new Float64Array(trialCount)]),
      )
    : undefined;

  const record = makeTrialRecorder(
    graph,
    samples,
    milestoneSamples,
    milestoneActivityIds,
    activityEarliestStart,
    constraintMap,
  );

  for (let trial = 0; trial < trialCount; trial++) {
    sampleTrialDurations(trialDurations, activityIds, model, rng);
    record(trial, trialDurations);
    reportProgress?.(trial);
  }

  return { samples, milestoneSamples, exhaustedIds: model.exhaustedIds };
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
  rngSeed: string,
  exhaustedIds?: string[]
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

  const result: SimulationRun = {
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
  // Omit-when-empty: keeps planned-only / complete-only runs shape-identical to today
  // (matches the milestoneResults precedent).
  if (exhaustedIds && exhaustedIds.length > 0) {
    result.modelExhaustedActivityIds = exhaustedIds;
  }
  return result;
}

/**
 * Run a Monte Carlo simulation. Pure function, no DOM, no Worker API.
 */
export function runMonteCarloSimulation(input: MonteCarloInput): SimulationRun {
  const { samples, exhaustedIds } = runTrials(input);
  return computeSimulationStats(samples, input.trialCount, input.rngSeed, exhaustedIds);
}
