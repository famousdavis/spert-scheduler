import type { Activity, SimulationRun } from "@domain/models/types";
import {
  runSimulationInWorker,
  type SimulationHandle,
} from "@core/simulation/worker-client";
import { runMonteCarloSimulation } from "@core/simulation/monte-carlo";
import { generateId } from "./id";

export interface SimulationServiceCallbacks {
  onProgress?: (completedTrials: number, totalTrials: number) => void;
  onComplete: (result: SimulationRun, elapsedMs: number) => void;
  onError: (message: string) => void;
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
  callbacks: SimulationServiceCallbacks
): SimulationHandle {
  const simulationId = generateId();

  try {
    return runSimulationInWorker(activities, trialCount, rngSeed, deterministicDurations, {
      onProgress: callbacks.onProgress,
      onComplete: (result, elapsedMs) => {
        callbacks.onComplete({ ...result, id: simulationId }, elapsedMs);
      },
      onError: callbacks.onError,
    });
  } catch {
    // Worker creation failed — synchronous fallback
    try {
      const startTime = performance.now();
      const result = runMonteCarloSimulation({
        activities,
        trialCount,
        rngSeed,
        deterministicDurations,
      });
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
