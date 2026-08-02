// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// ===========================================================================
// ORACLE — a pinned protocol contract for the simulation Worker message seam.
//
// WHY THIS EXISTS
// §3.5 decomposes `self.onmessage` (cognitive complexity 30). Unlike ProjectPage, this is
// NOT a coverage problem — the handler is already at 97.95% thanks to C2. The risk under a
// refactor is silent behaviour drift, and that is exactly what an oracle is for.
//
// WHAT IT PINS — THE PROTOCOL, NOT THE NUMBERS
// The numeric output is already pinned by `monte-carlo-oracle.json`. This pins WHICH
// messages get posted, IN WHAT ORDER, WITH WHAT SHAPE, for a matrix of payloads:
// message types in sequence, the sorted key set of every payload, exact error strings, and
// the progress values.
//
// ⚠️ `elapsedMs` is wall-clock and therefore NOT pinned by value — but its PRESENCE is,
// via the key set. Pinning it would make the oracle fail on a fast machine, and dropping it
// from the key set would let a refactor delete it unnoticed.
//
// ⚠️ THERE IS NO CANCELLATION PATH IN THE WORKER, checked rather than assumed.
// `SimulationRequest` has exactly one type (`simulation:start`), the handler has no `else`,
// and `worker-client.ts` cancels by `worker.terminate()` — the worker is never told, it is
// killed. What exists instead is that an unrecognised message is SILENTLY IGNORED, which is
// pinned below as recorded-not-specified.
//
// ⚠️ DELIBERATELY NOT A VITEST SNAPSHOT — `vitest -u` would absorb the exact drift this
// exists to catch. Regenerating is an explicit act:
//
//     ORACLE_WRITE=1 npx vitest run src/integration/simulation-worker-protocol-oracle.test.ts
//
// and the diff must be reviewed. If §3.5 makes this need regenerating, §3.5 is wrong.
//
// ⚠️ IT LIVES IN `src/integration/`, NOT `src/workers/`, and that is deliberate.
// `tsconfig.worker.json` covers `src/workers/**` with `lib: ["ES2020","WebWorker"]` and no
// node types — correctly narrow for code that ships into a Worker. This oracle reads and
// writes its JSON, so it belongs with the other file-reading guards (copyright-headers,
// changelog-surfaces, falsify-runner) rather than widening the worker build for a test.
// Caught by `tsc -b`, which vitest and ESLint both passed.
//
// ⚠️ MUST STAY OUT of `vitest.stryker.config.ts`'s include allowlist, for the same reason as
// the other two oracles: it would give a post-refactor mutation comparison more killing
// power than its own baseline.
// ===========================================================================

import { describe, it, expect, vi } from "vitest";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Activity, ActivityDependency } from "@domain/models/types";
import type { WorkerOutgoingMessage } from "@core/simulation/worker-protocol";

const ORACLE_PATH = resolve("src/integration/simulation-worker-protocol-oracle.json");

/** One posted message, reduced to its protocol-relevant shape. */
interface PinnedMessage {
  type: string;
  /** Sorted payload keys — a dropped or renamed field moves this. */
  payloadKeys: string[];
  /** Set only where the value is deterministic and load-bearing. */
  values?: Record<string, unknown>;
}

type PinnedExchange = PinnedMessage[];

/** Load the worker against a stubbed `self` and capture everything it posts. */
async function runExchange(message: unknown): Promise<WorkerOutgoingMessage[]> {
  const posted: WorkerOutgoingMessage[] = [];
  const stub = { postMessage: (m: WorkerOutgoingMessage) => posted.push(m), onmessage: null as unknown };
  vi.stubGlobal("self", stub);
  vi.resetModules();
  await import("@workers/simulation.worker");
  (stub.onmessage as (e: { data: unknown }) => void)({ data: message });
  vi.unstubAllGlobals();
  return posted;
}

function pin(posted: WorkerOutgoingMessage[]): PinnedExchange {
  return posted.map((m) => {
    const payload = (m as { payload?: Record<string, unknown> }).payload ?? {};
    const entry: PinnedMessage = { type: m.type, payloadKeys: Object.keys(payload).sort() };
    if (m.type === "simulation:error") {
      entry.values = { message: payload.message };
    } else if (m.type === "simulation:progress") {
      entry.values = { completedTrials: payload.completedTrials, totalTrials: payload.totalTrials };
    } else if (m.type === "simulation:result") {
      // Structural facts only — the floats are the MC oracle's job, and elapsedMs is
      // wall-clock. `percentileCount` catches a percentile silently disappearing.
      // ⚠️ An earlier draft pinned `sampleCount` and `exhaustedIds`, which are NOT keys on
      // SimulationRun — both read `null` in every fixture and pinned nothing. Caught by
      // reading the generated file rather than trusting the shape. Everything below is a
      // key that exists.
      const pcts = (payload.percentiles ?? {}) as Record<string, number>;
      const bins = (payload.histogramBins ?? []) as unknown[];
      entry.values = {
        percentileCount: Object.keys(pcts).length,
        // ⚠️ THE NaN GUARD. `percentileCount` alone stays 17 even if every value is NaN,
        // so it would not catch a payload poisoned by an unvalidated constraint reaching
        // Math.max. This is the assertion that makes the rejected-constraint fixture bite.
        allPercentilesFinite: Object.values(pcts).every((v) => Number.isFinite(v)),
        meanFinite: Number.isFinite(payload.mean as number),
        minMaxFinite:
          Number.isFinite(payload.minSample as number) && Number.isFinite(payload.maxSample as number),
        histogramBinCount: bins.length,
        trialCount: payload.trialCount,
        seed: payload.seed,
        engineVersion: payload.engineVersion,
        sampleArrayLength: Array.isArray(payload.samples) ? payload.samples.length : null,
        hasMilestoneResults: payload.milestoneResults !== undefined,
        elapsedMsIsFiniteNumber: Number.isFinite(payload.elapsedMs as number),
      };
    }
    return entry;
  });
}

// -- fixtures ---------------------------------------------------------------

function act(id: string, extra: Partial<Activity> = {}): Activity {
  return {
    id,
    name: id,
    min: 3,
    mostLikely: 5,
    max: 10,
    confidenceLevel: "mediumConfidence",
    distributionType: "normal",
    status: "planned",
    ...extra,
  } as Activity;
}

const BASE = {
  activities: [act("a1"), act("a2"), act("a3")],
  trialCount: 1000,
  rngSeed: "protocol-oracle-seed",
};

const deps: ActivityDependency[] = [
  { fromActivityId: "a1", toActivityId: "a2", type: "FS", lagDays: 0 },
  { fromActivityId: "a2", toActivityId: "a3", type: "FS", lagDays: 0 },
];

interface Case {
  name: string;
  message: unknown;
}

function buildCases(): Case[] {
  return [
    { name: "sequential/unconstrained", message: { type: "simulation:start", payload: { ...BASE } } },
    {
      name: "sequential/constrained-hard",
      message: {
        type: "simulation:start",
        payload: {
          ...BASE,
          sequentialConstraints: [
            { type: "SNET", offsetFromStart: 5, mode: "hard" },
            null,
            { type: "FNLT", offsetFromStart: 40, mode: "soft" },
          ],
        },
      },
    },
    {
      name: "sequential/constraint-entry-rejected-as-invalid",
      // The vocabulary guard at :114-115 — an unrecognised type must be dropped to null,
      // not passed through. This is the ONE site TypeScript cannot check (see Step 1).
      message: {
        type: "simulation:start",
        payload: {
          ...BASE,
          sequentialConstraints: [
            { type: "NOT_A_REAL_TYPE", offsetFromStart: 5, mode: "hard" },
            { type: "SNET", offsetFromStart: 5, mode: "NOT_A_MODE" },
            // ⚠️ The non-numeric offset is the entry that makes the guard OBSERVABLE. An
            // unrecognised TYPE is behaviourally invisible — applyHardConstraint's
            // `default:` returns currentPos unchanged — so a fixture built only from bad
            // types would pass identically with the guard removed. A non-numeric offset
            // reaches Math.max and produces NaN samples, which moves every percentile.
            { type: "SNET", offsetFromStart: "not-a-number", mode: "hard" },
          ],
        },
      },
    },
    {
      name: "sequential/parkinsons-floors",
      message: { type: "simulation:start", payload: { ...BASE, deterministicDurations: [6, 7, 8] } },
    },
    {
      name: "sequential/progress-reported",
      // trialCount at exactly 2x PROGRESS_INTERVAL: one progress message, then the result.
      message: { type: "simulation:start", payload: { ...BASE, trialCount: 20000 } },
    },
    {
      name: "dependency/plain",
      message: { type: "simulation:start", payload: { ...BASE, dependencyMode: true, dependencies: deps } },
    },
    {
      name: "dependency/with-milestones",
      message: {
        type: "simulation:start",
        payload: {
          ...BASE,
          dependencyMode: true,
          dependencies: deps,
          milestoneActivityIds: { m1: ["a1", "a2"] },
          activityEarliestStart: { a3: 2 },
        },
      },
    },
    {
      name: "dependency/constraints-no-milestones",
      message: {
        type: "simulation:start",
        payload: {
          ...BASE,
          dependencyMode: true,
          dependencies: deps,
          constraintMap: { a2: { type: "SNET", offsetFromStart: 4, mode: "hard" } },
        },
      },
    },
    // -- the three validation rejections, each a distinct posted string ------
    { name: "error/activities-missing", message: { type: "simulation:start", payload: { trialCount: 1000, rngSeed: "s" } } },
    { name: "error/trialcount-too-low", message: { type: "simulation:start", payload: { ...BASE, trialCount: 999 } } },
    { name: "error/trialcount-too-high", message: { type: "simulation:start", payload: { ...BASE, trialCount: 100001 } } },
    { name: "error/seed-empty", message: { type: "simulation:start", payload: { ...BASE, rngSeed: "" } } },
    {
      name: "error/engine-throws",
      // min > max is rejected by the distribution factory — a throw from inside the engine,
      // which the catch at :153 must convert into a posted error rather than an unhandled
      // rejection inside a Worker.
      message: {
        type: "simulation:start",
        payload: { ...BASE, activities: [act("bad", { min: 99, mostLikely: 5, max: 1 })] },
      },
    },
    // -- recorded-not-specified ---------------------------------------------
    {
      name: "unknown-message-type/silently-ignored",
      // ⚠️ RECORDED, NOT SPECIFIED. The handler branches only on "simulation:start" and has
      // no else, so anything else produces NO response at all — not an error, not an ack.
      // Silence may well be correct for a fire-and-forget worker, but nothing says so, and
      // a decomposition could change it without any other test noticing. Pinned to keep the
      // refactor honest; the question stays open.
      message: { type: "simulation:cancel", payload: {} },
    },
  ];
}

// -- the oracle -------------------------------------------------------------

describe("simulation worker — pinned protocol oracle", async () => {
  const cases = buildCases();
  const actual: Record<string, PinnedExchange> = {};
  for (const c of cases) actual[c.name] = pin(await runExchange(c.message));

  if (process.env.ORACLE_WRITE === "1") {
    writeFileSync(ORACLE_PATH, JSON.stringify(actual, null, 2) + "\n");
  }

  it("the oracle file exists and covers every fixture", () => {
    expect(existsSync(ORACLE_PATH)).toBe(true);
    const expected = JSON.parse(readFileSync(ORACLE_PATH, "utf8")) as Record<string, PinnedExchange>;
    expect(Object.keys(expected).sort()).toEqual(Object.keys(actual).sort());
  });

  it("every fixture name is unique", () => {
    expect(new Set(cases.map((c) => c.name)).size).toBe(cases.length);
  });

  it("the matrix is the expected size", () => {
    expect(cases.length).toBe(14);
  });

  it("the fixtures actually reach BOTH engines, not just one", () => {
    // Premise check. Every success fixture posts a result; if the dependency fixtures were
    // silently falling back to the sequential engine, or vice versa, the matrix would still
    // pass fixture-by-fixture while testing half of what it claims.
    const succeeded = Object.entries(actual).filter(([, e]) => e.some((m) => m.type === "simulation:result"));
    expect(succeeded.map(([n]) => n).filter((n) => n.startsWith("dependency/"))).toHaveLength(3);
    expect(succeeded.map(([n]) => n).filter((n) => n.startsWith("sequential/"))).toHaveLength(5);
  });

  it("the error fixtures actually error, and the success fixtures actually do not", () => {
    for (const [name, exchange] of Object.entries(actual)) {
      const errored = exchange.some((m) => m.type === "simulation:error");
      if (name.startsWith("error/")) expect(errored, name).toBe(true);
      else expect(errored, name).toBe(false);
    }
  });

  const expected = JSON.parse(readFileSync(ORACLE_PATH, "utf8")) as Record<string, PinnedExchange>;
  for (const c of cases) {
    it(`matches the pinned exchange: ${c.name}`, () => {
      expect(actual[c.name]).toEqual(expected[c.name]);
    });
  }
});
