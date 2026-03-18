// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import type {
  SimulationRequest,
  SimulationProgress,
  SimulationResult,
  SimulationError,
} from "@core/simulation/worker-protocol";
import type { SimulationRun } from "@domain/models/types";
import { runTrials, runDependencyTrials, computeSimulationStats, computeMilestoneStats } from "@core/simulation/monte-carlo";

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
      payload.trialCount > 50000
    ) {
      postError(
        "Invalid simulation payload: trialCount must be between 1000 and 50000"
      );
      return;
    }
    if (typeof payload.rngSeed !== "string" || payload.rngSeed.length === 0) {
      postError("Invalid simulation payload: rngSeed must be a non-empty string");
      return;
    }

    try {
      const startTime = performance.now();

      let samples: Float64Array;
      let milestoneResults: Record<string, { percentiles: Record<number, number>; mean: number; standardDeviation: number }> | undefined;

      if (payload.dependencyMode && payload.dependencies) {
        // Dependency-aware simulation: critical path per trial
        const durMap = payload.deterministicDurationMap
          ? new Map(Object.entries(payload.deterministicDurationMap).filter(
              (entry): entry is [string, number] => typeof entry[1] === "number"
            ))
          : undefined;
        const milestoneActivityIds = payload.milestoneActivityIds
          ? new Map(Object.entries(payload.milestoneActivityIds).filter(
              (entry): entry is [string, string[]] => Array.isArray(entry[1])
            ))
          : undefined;
        const activityEarliestStart = payload.activityEarliestStart
          ? new Map(Object.entries(payload.activityEarliestStart).filter(
              (entry): entry is [string, number] => typeof entry[1] === "number"
            ))
          : undefined;
        const constraintMap = payload.constraintMap
          ? new Map(Object.entries(payload.constraintMap).filter(
              (entry): entry is [string, { type: string; offsetFromStart: number; mode: string }] =>
                entry[1] != null && typeof entry[1].offsetFromStart === "number"
            ))
          : undefined;

        const depResult = runDependencyTrials({
          activities: payload.activities,
          dependencies: payload.dependencies,
          trialCount: payload.trialCount,
          rngSeed: payload.rngSeed,
          deterministicDurationMap: durMap,
          milestoneActivityIds,
          activityEarliestStart,
          constraintMap,
          onProgress: postProgress,
          progressInterval: PROGRESS_INTERVAL,
        });
        samples = depResult.samples;
        if (depResult.milestoneSamples) {
          milestoneResults = computeMilestoneStats(depResult.milestoneSamples, payload.trialCount);
        }
      } else {
        // Sequential simulation (original behavior)
        samples = runTrials({
          activities: payload.activities,
          trialCount: payload.trialCount,
          rngSeed: payload.rngSeed,
          deterministicDurations: payload.deterministicDurations,
          onProgress: postProgress,
          progressInterval: PROGRESS_INTERVAL,
        });
      }

      const result = computeSimulationStats(
        samples,
        payload.trialCount,
        payload.rngSeed
      );

      if (milestoneResults) {
        result.milestoneResults = milestoneResults;
      }

      postResult(result, performance.now() - startTime);
    } catch (err) {
      postError(err instanceof Error ? err.message : String(err));
    }
  }
};
