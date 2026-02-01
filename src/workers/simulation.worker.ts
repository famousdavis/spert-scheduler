import type {
  SimulationRequest,
  SimulationProgress,
  SimulationResult,
  SimulationError,
} from "@core/simulation/worker-protocol";
import type { SimulationRun } from "@domain/models/types";
import { runTrials, computeSimulationStats } from "@core/simulation/monte-carlo";

const PROGRESS_INTERVAL = 10000;

function postProgress(completedTrials: number, totalTrials: number) {
  const msg: SimulationProgress = {
    type: "simulation:progress",
    payload: { completedTrials, totalTrials },
  };
  self.postMessage(msg);
}

function postResult(result: SimulationRun, elapsedMs: number) {
  const msg: SimulationResult = {
    type: "simulation:result",
    payload: { ...result, elapsedMs },
  };
  self.postMessage(msg);
}

function postError(message: string) {
  const msg: SimulationError = {
    type: "simulation:error",
    payload: { message },
  };
  self.postMessage(msg);
}

self.onmessage = (event: MessageEvent<SimulationRequest>) => {
  const { type, payload } = event.data;
  if (type === "simulation:start") {
    try {
      const startTime = performance.now();

      const samples = runTrials({
        activities: payload.activities,
        trialCount: payload.trialCount,
        rngSeed: payload.rngSeed,
        deterministicDurations: payload.deterministicDurations,
        onProgress: postProgress,
        progressInterval: PROGRESS_INTERVAL,
      });

      const result = computeSimulationStats(
        samples,
        payload.trialCount,
        payload.rngSeed
      );

      postResult(result, performance.now() - startTime);
    } catch (err) {
      postError(err instanceof Error ? err.message : String(err));
    }
  }
};
