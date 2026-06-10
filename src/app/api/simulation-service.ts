// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import type { Activity, SimulationRun } from "@domain/models/types";
import {
  runSimulationInWorker,
  type SimulationHandle,
  type DependencySimulationParams,
} from "@core/simulation/worker-client";
import { runMonteCarloSimulation, runDependencyTrials, computeSimulationStats, computeMilestoneStats } from "@core/simulation/monte-carlo";
import { generateId } from "./id";

export interface SimulationServiceCallbacks {
  onProgress?: (completedTrials: number, totalTrials: number) => void;
  onComplete: (result: SimulationRun, elapsedMs: number) => void;
  onError: (message: string) => void;
}

/**
 * Synchronous simulation fallback used when Worker creation fails.
 * Handles both dependency-mode (graph-based) and sequential-mode runs.
 *
 * Exported for regression testing of the dependency-mode constraint path
 * (the public `runSimulation` entry point reaches this only when Worker
 * construction throws, which does not happen deterministically under vitest).
 */
export function runSimulationSync(
  activities: Activity[],
  trialCount: number,
  rngSeed: string,
  deterministicDurations: number[] | undefined,
  dependencyParams?: DependencySimulationParams,
  sequentialConstraints?: ({ type: string; offsetFromStart: number; mode: string } | null)[],
): SimulationRun {
  if (dependencyParams?.dependencyMode) {
    const durMap = dependencyParams.deterministicDurationMap
      ? new Map(
          Object.entries(dependencyParams.deterministicDurationMap).map(
            ([k, v]) => [k, v as number]
          )
        )
      : undefined;
    const milestoneActivityIds = dependencyParams.milestoneActivityIds
      ? new Map(Object.entries(dependencyParams.milestoneActivityIds))
      : undefined;
    const activityEarliestStart = dependencyParams.activityEarliestStart
      ? new Map(Object.entries(dependencyParams.activityEarliestStart))
      : undefined;
    // Convert constraintMap (Record → Map) with the same validation filter as the
    // worker path (simulation.worker.ts). Omitting this silently dropped hard
    // scheduling constraints (MSO/SNET/MFO/FNET) in the sync fallback, diverging
    // from the worker path for the same project.
    const VALID_CONSTRAINT_TYPES = ["MSO", "MFO", "SNET", "SNLT", "FNET", "FNLT"];
    const VALID_CONSTRAINT_MODES = ["hard", "soft"];
    const constraintMap = dependencyParams.constraintMap
      ? new Map(Object.entries(dependencyParams.constraintMap).filter(
          (entry): entry is [string, { type: string; offsetFromStart: number; mode: string }] =>
            entry[1] != null
            && typeof entry[1].offsetFromStart === "number"
            && VALID_CONSTRAINT_TYPES.includes(entry[1].type)
            && VALID_CONSTRAINT_MODES.includes(entry[1].mode)
        ))
      : undefined;

    const depResult = runDependencyTrials({
      activities,
      dependencies: dependencyParams.dependencies,
      trialCount,
      rngSeed,
      deterministicDurationMap: durMap,
      milestoneActivityIds,
      activityEarliestStart,
      constraintMap,
    });
    const result = computeSimulationStats(depResult.samples, trialCount, rngSeed, depResult.exhaustedIds);
    if (depResult.milestoneSamples) {
      result.milestoneResults = computeMilestoneStats(depResult.milestoneSamples, trialCount);
    }
    return result;
  }

  return runMonteCarloSimulation({
    activities,
    trialCount,
    rngSeed,
    deterministicDurations,
    sequentialConstraints: sequentialConstraints ?? undefined,
  });
}

/**
 * Run a Monte Carlo simulation using a Web Worker (preferred) with
 * synchronous fallback if Worker creation fails.
 */
export function runSimulation(
  activities: Activity[],
  trialCount: number,
  rngSeed: string,
  deterministicDurations: number[] | undefined,
  callbacks: SimulationServiceCallbacks,
  dependencyParams?: DependencySimulationParams,
  sequentialConstraints?: ({ type: string; offsetFromStart: number; mode: string } | null)[],
): SimulationHandle {
  const simulationId = generateId();

  try {
    return runSimulationInWorker(activities, trialCount, rngSeed, deterministicDurations, {
      onProgress: callbacks.onProgress,
      onComplete: (result, elapsedMs) => {
        callbacks.onComplete({ ...result, id: simulationId }, elapsedMs);
      },
      onError: callbacks.onError,
    }, dependencyParams, sequentialConstraints);
  } catch {
    // Worker creation failed — synchronous fallback
    try {
      const startTime = performance.now();
      const result = runSimulationSync(activities, trialCount, rngSeed, deterministicDurations, dependencyParams, sequentialConstraints);
      const elapsedMs = performance.now() - startTime;
      callbacks.onComplete({ ...result, id: simulationId }, elapsedMs);
    } catch (err) {
      callbacks.onError(
        err instanceof Error ? err.message : String(err)
      );
    }

    // Return a no-op cancel handle for synchronous execution
    return { cancel: () => {} };
  }
}
