import type { Activity, ActivityDependency, SimulationRun } from "@domain/models/types";
import type {
  SimulationRequest,
  WorkerOutgoingMessage,
} from "./worker-protocol";

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
  deterministicDurationMap: Record<string, number>;
  milestoneActivityIds?: Record<string, string[]>;
  activityEarliestStart?: Record<string, number>;
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
  dependencyParams?: DependencySimulationParams
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
      ...(dependencyParams && {
        dependencyMode: dependencyParams.dependencyMode,
        dependencies: dependencyParams.dependencies,
        deterministicDurationMap: dependencyParams.deterministicDurationMap,
        milestoneActivityIds: dependencyParams.milestoneActivityIds,
        activityEarliestStart: dependencyParams.activityEarliestStart,
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
