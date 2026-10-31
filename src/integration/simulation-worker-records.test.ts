// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, vi } from "vitest";
import type { Activity, ActivityDependency, SimulationRun } from "@domain/models/types";
import type { WorkerOutgoingMessage } from "@core/simulation/worker-protocol";
import { percentile, sortSamples } from "@core/analytics/analytics";

/**
 * WI-137 (2a): the worker carries recorded progress in BOTH modes. A NEW fixture, deliberately
 * outside `simulation-worker-protocol-oracle.test.ts`, whose pinned JSON must not move: with no
 * record every request is exactly as before. Driven the way that oracle drives the worker — the
 * real module against a stubbed `self` — and read for the numbers NUMBERS.md measured on R598's
 * example (20,000 trials, seed "probe-1", Parkinson's Law on).
 */
async function runInWorker(payload: Record<string, unknown>): Promise<WorkerOutgoingMessage[]> {
  const posted: WorkerOutgoingMessage[] = [];
  const stub = { postMessage: (m: WorkerOutgoingMessage) => posted.push(m), onmessage: null as unknown };
  vi.stubGlobal("self", stub);
  vi.resetModules();
  await import("@workers/simulation.worker");
  (stub.onmessage as (e: { data: unknown }) => void)({ data: { type: "simulation:start", payload } });
  vi.unstubAllGlobals();
  return posted;
}

function p50p95(posted: WorkerOutgoingMessage[]): [number, number] {
  const result = posted.find((m) => m.type === "simulation:result");
  if (result?.type !== "simulation:result") throw new Error(`no result: ${JSON.stringify(posted.map((m) => m.type))}`);
  const run: SimulationRun = result.payload;
  const sorted = sortSamples(Float64Array.from(run.samples));
  return [percentile(sorted, 0.5), percentile(sorted, 0.95)];
}

function act(id: string, overrides: Partial<Activity> = {}): Activity {
  return {
    id, name: id, min: 9, mostLikely: 10, max: 11,
    confidenceLevel: "mediumConfidence", distributionType: "uniform", status: "planned",
    ...overrides,
  };
}

const ACTS = [
  act("A", { status: "complete", actualStartDate: "2026-10-05", actualFinishDate: "2026-10-23", actualDuration: 15 }),
  act("B", { status: "inProgress", actualStartDate: "2026-10-19", actualDuration: 1 }),
  act("C"),
];
const DEPS: ActivityDependency[] = [
  { fromActivityId: "A", toActivityId: "B", type: "FS", lagDays: 0 },
  { fromActivityId: "B", toActivityId: "C", type: "FS", lagDays: 0 },
];
const BASE = { activities: ACTS, trialCount: 20000, rngSeed: "probe-1" };
const KEPT: [number, number] = [30.451189059661253, 31.339003251031873];
const MOVED: [number, number] = [35.45118905966125, 36.33900325103187];

describe("the simulation worker, with recorded progress", () => {
  it("dependencies off: the sequential records place B at its recorded start", async () => {
    const posted = await runInWorker({
      ...BASE,
      deterministicDurations: [10, 10],
      sequentialRecords: [{ startOffset: 0, duration: 15 }, { startOffset: 10 }, null],
    });
    expect(p50p95(posted)).toEqual(KEPT);
  });

  it("dependencies on: the recorded starts and durations do the same", async () => {
    const posted = await runInWorker({
      ...BASE,
      dependencyMode: true,
      dependencies: DEPS,
      deterministicDurationMap: { B: 10, C: 10 },
      recordedStarts: { A: 0, B: 10 },
      recordedDurations: { A: 15 },
    });
    expect(p50p95(posted)).toEqual(KEPT);
  });

  it("a malformed record entry is dropped, like a malformed constraint: that row is simulated as unrecorded, never NaN", async () => {
    const posted = await runInWorker({
      ...BASE,
      deterministicDurations: [10, 10],
      sequentialRecords: [null, { startOffset: "ten" }, { startOffset: 3, duration: "x" }],
    });
    expect(posted.map((m) => m.type)).toEqual(["simulation:progress", "simulation:result"]);
    expect(p50p95(posted)).toEqual(MOVED);
  });
});
