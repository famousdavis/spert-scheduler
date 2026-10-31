// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { Activity, ActivityDependency, SimulationRun } from "@domain/models/types";
import type {
  SimulationRequest,
  WorkerOutgoingMessage,
} from "./worker-protocol";
import type { SequentialRecordEntry } from "./monte-carlo";

export interface SimulationCallbacks {
  onProgress?: (completedTrials: number, totalTrials: number) => void;
  onComplete: (result: SimulationRun, elapsedMs: number) => void;
  onError: (message: string) => void;
}

export interface SimulationHandle {
  cancel: () => void;
}

export interface DependencySimulationParams {
  dependencyMode: boolean;
  dependencies: ActivityDependency[];
  deterministicDurationMap?: Record<string, number>;
  milestoneActivityIds?: Record<string, string[]>;
  activityEarliestStart?: Record<string, number>;
  constraintMap?: Record<string, { type: string; offsetFromStart: number; mode: string }>;
  /** WI-137: activityId → recorded start's offset; a Complete row's day count from its dates. */
  recordedStarts?: Record<string, number>;
  recordedDurations?: Record<string, number>;
}

/**
 * Launch a Monte Carlo simulation in a Web Worker.
 * Worker is created per-run and terminated on completion/error/cancel.
 */
export function runSimulationInWorker(
  activities: Activity[],
  trialCount: number,
  rngSeed: string,
  deterministicDurations: number[] | undefined,
  callbacks: SimulationCallbacks,
  dependencyParams?: DependencySimulationParams,
  sequentialConstraints?: ({ type: string; offsetFromStart: number; mode: string } | null)[],
  sequentialRecords?: (SequentialRecordEntry | null)[],
  dataDateOffset?: number,
): SimulationHandle {
  const worker = new Worker(
    new URL("../../workers/simulation.worker.ts", import.meta.url),
    { type: "module" }
  );

  let terminated = false;

  function terminate() {
    if (!terminated) {
      terminated = true;
      worker.terminate();
    }
  }

  worker.onmessage = (event: MessageEvent<WorkerOutgoingMessage>) => {
    const msg = event.data;

    // Defensive validation: ensure message has expected structure
    if (!msg || typeof msg !== "object" || !("type" in msg)) {
      callbacks.onError("Invalid worker message received");
      terminate();
      return;
    }

    switch (msg.type) {
      case "simulation:progress":
        callbacks.onProgress?.(
          msg.payload.completedTrials,
          msg.payload.totalTrials
        );
        break;
      case "simulation:result":
        callbacks.onComplete(msg.payload, msg.payload.elapsedMs);
        terminate();
        break;
      case "simulation:error":
        callbacks.onError(msg.payload.message);
        terminate();
        break;
    }
  };

  worker.onerror = (event) => {
    callbacks.onError(event.message || "Worker encountered an error");
    terminate();
  };

  const request: SimulationRequest = {
    type: "simulation:start",
    payload: {
      activities,
      trialCount,
      rngSeed,
      deterministicDurations,
      sequentialConstraints: sequentialConstraints ?? undefined,
      // WI-137: sent only when a row has a record, so every other request is as before.
      ...(sequentialRecords && { sequentialRecords }),
      // WI-154: sent only when the data date can move a row, so every other request is as before.
      ...(dataDateOffset && { dataDateOffset }),
      ...(dependencyParams && {
        dependencyMode: dependencyParams.dependencyMode,
        dependencies: dependencyParams.dependencies,
        deterministicDurationMap: dependencyParams.deterministicDurationMap,
        milestoneActivityIds: dependencyParams.milestoneActivityIds,
        activityEarliestStart: dependencyParams.activityEarliestStart,
        constraintMap: dependencyParams.constraintMap,
        ...(dependencyParams.recordedStarts && {
          recordedStarts: dependencyParams.recordedStarts,
          recordedDurations: dependencyParams.recordedDurations,
        }),
      }),
    },
  };

  worker.postMessage(request);

  return {
    cancel: () => {
      terminate();
    },
  };
}
