import type {
  SimulationRequest,
  SimulationProgress,
  SimulationResult,
  SimulationError,
} from "@core/simulation/worker-protocol";
import type { Activity, SimulationRun } from "@domain/models/types";
import { ENGINE_VERSION, STANDARD_PERCENTILES } from "@domain/models/types";
import { createDistributionForActivity } from "@core/distributions/factory";
import type { Distribution } from "@core/distributions/distribution";
import { createSeededRng } from "@infrastructure/rng";
import {
  sortSamples,
  percentile,
  mean as computeMean,
  standardDeviation as computeSD,
  histogram,
} from "@core/analytics/analytics";

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

function runSimulation(activities: Activity[], trialCount: number, rngSeed: string, deterministicDurations?: number[]) {
  const startTime = performance.now();
  const rng = createSeededRng(rngSeed);

  let completedSum = 0;
  const distributions: Distribution[] = [];

  for (const activity of activities) {
    if (activity.status === "complete" && activity.actualDuration != null) {
      completedSum += activity.actualDuration;
    } else {
      distributions.push(createDistributionForActivity(activity));
    }
  }

  const samples = new Float64Array(trialCount);
  const shouldReportProgress = trialCount >= PROGRESS_INTERVAL;

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
      (trial + 1) % PROGRESS_INTERVAL === 0 &&
      trial + 1 < trialCount
    ) {
      postProgress(trial + 1, trialCount);
    }
  }

  sortSamples(samples);

  const sampleMean = computeMean(samples);
  const sampleSD = computeSD(samples);
  const minSample = samples[0]!;
  const maxSample = samples[trialCount - 1]!;

  const percentiles: Record<number, number> = {};
  for (const p of STANDARD_PERCENTILES) {
    percentiles[p] = percentile(samples, p / 100);
  }

  const histogramBins = histogram(samples, 40);
  const elapsedMs = performance.now() - startTime;

  const result: SimulationRun = {
    id: "",
    timestamp: new Date().toISOString(),
    trialCount,
    seed: rngSeed,
    engineVersion: ENGINE_VERSION,
    percentiles,
    histogramBins,
    mean: sampleMean,
    standardDeviation: sampleSD,
    minSample,
    maxSample,
    samples: Array.from(samples),
  };

  postResult(result, elapsedMs);
}

self.onmessage = (event: MessageEvent<SimulationRequest>) => {
  const { type, payload } = event.data;
  if (type === "simulation:start") {
    try {
      runSimulation(payload.activities, payload.trialCount, payload.rngSeed, payload.deterministicDurations);
    } catch (err) {
      postError(err instanceof Error ? err.message : String(err));
    }
  }
};
