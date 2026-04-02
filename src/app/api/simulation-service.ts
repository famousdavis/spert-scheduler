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
 */
function runSimulationSync(
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

    const depResult = runDependencyTrials({
      activities,
      dependencies: dependencyParams.dependencies,
      trialCount,
      rngSeed,
      deterministicDurationMap: durMap,
      milestoneActivityIds,
      activityEarliestStart,
    });
    const result = computeSimulationStats(depResult.samples, trialCount, rngSeed);
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
