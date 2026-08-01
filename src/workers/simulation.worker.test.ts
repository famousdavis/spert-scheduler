// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// C2 — the Worker message seam.
//
// Every simulation the app runs crosses this handler, and until now none of it was
// covered: src/workers/ held only the worker itself. It does not need a real Worker to
// test — it is a function assigned to `self.onmessage`, so stubbing `self` and calling
// the handler directly exercises the whole seam: payload validation, the
// dependency/sequential branch, Record→Map marshalling, progress and result posting,
// and the catch that must convert a thrown engine error into a posted message rather
// than an unhandled rejection inside a Worker.
//
// The engine itself (runTrials / runDependencyTrials) is deliberately NOT mocked. It is
// pure and fast, and mocking it would leave the marshalling — the actual seam, and the
// half that has already shipped a bug — asserted against a fake.

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Activity, ActivityDependency } from "@domain/models/types";
import type { SimulationRequest, WorkerOutgoingMessage } from "@core/simulation/worker-protocol";

let posted: WorkerOutgoingMessage[] = [];
let handler: (event: { data: unknown }) => void;

/** Load the worker module against a stubbed `self` and capture what it posts. */
async function loadWorker() {
  posted = [];
  const stub = {
    postMessage: (m: WorkerOutgoingMessage) => posted.push(m),
    onmessage: null as unknown,
  };
  vi.stubGlobal("self", stub);
  vi.resetModules();
  await import("./simulation.worker");
  handler = stub.onmessage as typeof handler;
}

function act(id: string, days: number, extra: Partial<Activity> = {}): Activity {
  return {
    id, name: id.toUpperCase(), min: days, mostLikely: days, max: days,
    confidenceLevel: "mediumConfidence", distributionType: "normal", status: "planned",
    ...extra,
  } as Activity;
}
/** A genuinely uncertain activity — min=ml=max leaves nothing for the RNG to vary. */
const spread = (id: string): Activity => act(id, 5, { min: 2, mostLikely: 5, max: 14 });

const fsDep = (from: string, to: string, lagDays = 0): ActivityDependency =>
  ({ fromActivityId: from, toActivityId: to, type: "FS", lagDays });

function start(payload: Partial<SimulationRequest["payload"]>): void {
  handler({
    data: {
      type: "simulation:start",
      payload: { activities: [act("a", 3)], trialCount: 1000, rngSeed: "seed-1", ...payload },
    },
  });
}

const errors = () => posted.filter((m) => m.type === "simulation:error");
const results = () => posted.filter((m) => m.type === "simulation:result");
const progress = () => posted.filter((m) => m.type === "simulation:progress");

describe("simulation.worker — message seam", () => {
  beforeEach(async () => {
    await loadWorker();
  });

  it("registers a message handler on load", () => {
    expect(typeof handler).toBe("function");
  });

  describe("payload validation — defence in depth, since the UI should never send these", () => {
    it("ignores a message type it does not own, silently", () => {
      handler({ data: { type: "something:else", payload: {} } });
      expect(posted).toHaveLength(0);
    });

    it("rejects a missing payload", () => {
      handler({ data: { type: "simulation:start" } });
      expect(errors()[0]!.payload.message).toMatch(/activities/i);
    });

    it("rejects activities that are not an array", () => {
      handler({ data: { type: "simulation:start", payload: { activities: "nope" } } });
      expect(errors()).toHaveLength(1);
      expect(results()).toHaveLength(0);
    });

    it("rejects a trial count below the floor, above the ceiling, or not a number", () => {
      for (const trialCount of [999, 100001, "5000" as unknown as number]) {
        posted = [];
        start({ trialCount });
        expect(errors()[0]!.payload.message).toMatch(/1000 and 100000/);
      }
    });

    it("accepts the exact boundaries", () => {
      start({ trialCount: 1000 });
      expect(errors()).toHaveLength(0);
      expect(results()).toHaveLength(1);
    });

    it("rejects an empty or non-string seed", () => {
      for (const rngSeed of ["", 42 as unknown as string]) {
        posted = [];
        start({ rngSeed });
        expect(errors()[0]!.payload.message).toMatch(/rngSeed/);
      }
    });

    it("posts nothing but the error — no partial result — when validation fails", () => {
      start({ trialCount: 1 });
      expect(posted).toHaveLength(1);
      expect(posted[0]!.type).toBe("simulation:error");
    });
  });

  describe("sequential mode", () => {
    it("posts one result carrying stats and the elapsed time", () => {
      start({ activities: [act("a", 3), act("b", 5)] });
      expect(results()).toHaveLength(1);
      const r = results()[0]!.payload;
      expect(r.trialCount).toBe(1000);
      expect(r.seed).toBe("seed-1");
      expect(r.percentiles).toBeDefined();
      expect(typeof r.elapsedMs).toBe("number");
    });

    it("is deterministic for a given seed, and different for a different one", () => {
      start({ activities: [spread("a"), spread("b")], rngSeed: "alpha" });
      const first = JSON.stringify(results()[0]!.payload.percentiles);

      posted = [];
      start({ activities: [spread("a"), spread("b")], rngSeed: "alpha" });
      expect(JSON.stringify(results()[0]!.payload.percentiles)).toBe(first);

      posted = [];
      start({ activities: [spread("a"), spread("b")], rngSeed: "beta" });
      expect(JSON.stringify(results()[0]!.payload.percentiles)).not.toBe(first);
    });

    it("drops a sequential constraint whose type or mode is outside the vocabulary", () => {
      // Both runs must produce the SAME result: the bogus constraint is filtered out,
      // so it cannot influence the schedule.
      start({
        activities: [act("a", 3)],
        sequentialConstraints: [{ type: "NONSENSE", offsetFromStart: 2, mode: "hard" }],
      });
      const withBogus = JSON.stringify(results()[0]!.payload.percentiles);

      posted = [];
      start({ activities: [act("a", 3)] });
      expect(JSON.stringify(results()[0]!.payload.percentiles)).toBe(withBogus);
    });
  });

  describe("dependency mode", () => {
    const twoActivities = [act("a", 3), act("b", 4)];

    it("takes the dependency branch and posts a result", () => {
      start({
        activities: twoActivities,
        dependencies: [fsDep("a", "b")],
        dependencyMode: true,
      });
      expect(errors()).toHaveLength(0);
      expect(results()).toHaveLength(1);
      expect(results()[0]!.payload.percentiles).toBeDefined();
    });

    it("falls back to sequential when dependencyMode is set but dependencies are absent", () => {
      // The branch requires BOTH — a half-configured payload must not reach the
      // dependency engine with an undefined graph.
      start({ activities: twoActivities, dependencyMode: true });
      expect(errors()).toHaveLength(0);
      expect(results()).toHaveLength(1);
    });

    it("marshals the Record-shaped maps across the postMessage boundary", () => {
      // These arrive as plain objects because structured-clone flattens Maps in the
      // protocol; the handler must rebuild them or the engine silently ignores them.
      start({
        activities: twoActivities,
        dependencies: [fsDep("a", "b")],
        dependencyMode: true,
        deterministicDurationMap: { a: 3, b: 4 },
        activityEarliestStart: { b: 2 },
        milestoneActivityIds: { m1: ["a", "b"] },
      });
      expect(errors()).toHaveLength(0);
      expect(results()).toHaveLength(1);
    });

    it("ignores map entries of the wrong runtime type instead of throwing", () => {
      start({
        activities: twoActivities,
        dependencies: [fsDep("a", "b")],
        dependencyMode: true,
        deterministicDurationMap: { a: "three" as unknown as number },
        activityEarliestStart: { b: null as unknown as number },
        milestoneActivityIds: { m1: "not-an-array" as unknown as string[] },
      });
      expect(errors()).toHaveLength(0);
      expect(results()).toHaveLength(1);
    });

    it("drops a constraint outside the vocabulary, matching the sync fallback", () => {
      // This is the seam where the two simulation paths once disagreed: the service
      // fallback lacked this filter and silently kept invalid constraints.
      start({
        activities: twoActivities,
        dependencies: [fsDep("a", "b")],
        dependencyMode: true,
        constraintMap: { a: { type: "BOGUS", offsetFromStart: 1, mode: "hard" } },
      });
      const dropped = JSON.stringify(results()[0]!.payload.percentiles);

      posted = [];
      start({ activities: twoActivities, dependencies: [fsDep("a", "b")], dependencyMode: true });
      expect(JSON.stringify(results()[0]!.payload.percentiles)).toBe(dropped);
    });

    it("honours a valid constraint — proving the filter is selective, not blanket", () => {
      start({
        activities: twoActivities,
        dependencies: [fsDep("a", "b")],
        dependencyMode: true,
        constraintMap: { b: { type: "SNET", offsetFromStart: 40, mode: "hard" } },
      });
      const constrained = JSON.stringify(results()[0]!.payload.percentiles);

      posted = [];
      start({ activities: twoActivities, dependencies: [fsDep("a", "b")], dependencyMode: true });
      expect(JSON.stringify(results()[0]!.payload.percentiles)).not.toBe(constrained);
    });
  });

  it("reports progress during a long run", () => {
    // The progress interval is 10 000 trials, so a run at the ceiling must emit some.
    start({ activities: [act("a", 3)], trialCount: 30000 });
    expect(progress().length).toBeGreaterThan(0);
    const p = progress()[0]!.payload;
    expect(p.totalTrials).toBe(30000);
    expect(p.completedTrials).toBeGreaterThan(0);
  });

  it("posts an engine failure as an error message rather than throwing out of the Worker", async () => {
    // The one place a mock is warranted. The catch block is unreachable with
    // well-formed input, and it guards something that cannot be observed any other
    // way: a throw escaping this handler surfaces as an unhandled rejection INSIDE a
    // Worker, where nothing can report it and the UI simply hangs forever.
    posted = [];
    vi.resetModules();
    vi.doMock("@core/simulation/monte-carlo", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@core/simulation/monte-carlo")>()),
      runTrials: () => {
        throw new Error("engine exploded");
      },
    }));
    const stub = {
      postMessage: (m: WorkerOutgoingMessage) => posted.push(m),
      onmessage: null as unknown,
    };
    vi.stubGlobal("self", stub);
    await import("./simulation.worker");
    const h = stub.onmessage as typeof handler;

    expect(() =>
      h({
        data: {
          type: "simulation:start",
          payload: { activities: [act("a", 3)], trialCount: 1000, rngSeed: "s" },
        },
      }),
    ).not.toThrow();

    expect(errors()).toHaveLength(1);
    expect(errors()[0]!.payload.message).toBe("engine exploded");
    expect(results()).toHaveLength(0);
    vi.doUnmock("@core/simulation/monte-carlo");
  });

  // ⚠️ FINDING, deliberately not pinned by a test: a CYCLIC dependency graph posts a
  // simulation:result rather than an error. buildDependencyGraph throws on cycles, but
  // this path never reaches that throw. The UI prevents cycles, so it may be
  // unreachable in practice — but the worker's defence-in-depth validation does not
  // catch it, and validation is exactly what the rest of this block covers. Writing a
  // test here would enshrine the behaviour rather than record the question.
});
