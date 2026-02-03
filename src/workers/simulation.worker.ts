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
    // Defense-in-depth: validate payload structure even though UI should send valid data
    if (!payload || !Array.isArray(payload.activities)) {
      postError("Invalid simulation payload: missing or invalid activities");
      return;
    }
    if (
      typeof payload.trialCount !== "number" ||
      payload.trialCount < 1000 ||
      payload.trialCount > 500000
    ) {
      postError(
        "Invalid simulation payload: trialCount must be between 1000 and 500000"
      );
      return;
    }
    if (typeof payload.rngSeed !== "string" || payload.rngSeed.length === 0) {
      postError("Invalid simulation payload: rngSeed must be a non-empty string");
      return;
    }

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
