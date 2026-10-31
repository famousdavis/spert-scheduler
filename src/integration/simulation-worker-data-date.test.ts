// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, vi, afterEach } from "vitest";
import type { Activity, ActivityDependency, SimulationRun } from "@domain/models/types";
import type { SimulationRequest, WorkerOutgoingMessage } from "@core/simulation/worker-protocol";
import { runSimulationInWorker } from "@core/simulation/worker-client";

/**
 * WI-154 — the worker carries the data date's offset in BOTH modes, and the client sends it (Review
 * 35, verification G1; the design's straw U3). A NEW fixture, outside
 * `simulation-worker-protocol-oracle.test.ts`, whose pinned JSON must not move. Point estimates, so
 * every trial gives the same number: Done (Complete, recorded, 5 days) then Next (5 days, not
 * started). Today Tue 10/27 is 16 working days after the Start Date, Mon 10/05: Next runs 16 – 21.
 * Without the offset it follows Done: 5 – 10.
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

function samples(posted: WorkerOutgoingMessage[]): number[] {
  const result = posted.find((m) => m.type === "simulation:result");
  if (result?.type !== "simulation:result") throw new Error(`no result: ${JSON.stringify(posted.map((m) => m.type))}`);
  const run: SimulationRun = result.payload;
  return [...new Set(run.samples)];
}

const act = (id: string, overrides: Partial<Activity> = {}): Activity => ({
  id, name: id, min: 5, mostLikely: 5, max: 5, confidenceLevel: "mediumConfidence", distributionType: "uniform", status: "planned", ...overrides,
});
const ACTS = [act("Done", { status: "complete", actualStartDate: "2026-10-05", actualFinishDate: "2026-10-09", actualDuration: 5 }), act("Next")];
const DEPS: ActivityDependency[] = [{ fromActivityId: "Done", toActivityId: "Next", type: "FS", lagDays: 0 }];
const SEQUENTIAL = { activities: ACTS, trialCount: 1000, rngSeed: "wi154", deterministicDurations: [5], sequentialRecords: [{ startOffset: 0, duration: 5 }, null] };
const DEPENDENCY = {
  activities: ACTS, trialCount: 1000, rngSeed: "wi154", dependencyMode: true, dependencies: DEPS,
  deterministicDurationMap: { Next: 5 }, recordedStarts: { Done: 0 }, recordedDurations: { Done: 5 },
};

describe("the simulation worker, with the data date's offset", () => {
  it("dependencies on: Next starts at the offset", async () => {
    expect(samples(await runInWorker({ ...DEPENDENCY, dataDateOffset: 16 }))).toEqual([21]);
    expect(samples(await runInWorker(DEPENDENCY))).toEqual([10]);
  });

  it("dependencies off: the same", async () => {
    expect(samples(await runInWorker({ ...SEQUENTIAL, dataDateOffset: 16 }))).toEqual([21]);
    expect(samples(await runInWorker(SEQUENTIAL))).toEqual([10]);
  });

  it("an offset that is not a whole number of days above zero is dropped, as a malformed map entry is", async () => {
    for (const bad of [0, -3, 2.5, "16", Number.NaN]) {
      expect(samples(await runInWorker({ ...DEPENDENCY, dataDateOffset: bad }))).toEqual([10]);
    }
  });
});

describe("the client sends it, and only when it can move a row", () => {
  const sent: SimulationRequest[] = [];
  class FakeWorker {
    onmessage: unknown = null;
    onerror: unknown = null;
    postMessage(m: SimulationRequest) { sent.push(m); }
    terminate() {}
  }
  afterEach(() => { vi.unstubAllGlobals(); sent.length = 0; });

  it("16 is sent; none is not", () => {
    vi.stubGlobal("Worker", FakeWorker);
    const callbacks = { onProgress: () => {}, onComplete: () => {}, onError: () => {} };
    runSimulationInWorker(ACTS, 10, "s", [5], callbacks, undefined, undefined, [{ startOffset: 0, duration: 5 }, null], 16);
    runSimulationInWorker(ACTS, 10, "s", [5], callbacks, undefined, undefined, [{ startOffset: 0, duration: 5 }, null]);
    expect(sent.map((r) => r.payload.dataDateOffset)).toEqual([16, undefined]);
    expect("dataDateOffset" in sent[1]!.payload).toBe(false);
  });
});
