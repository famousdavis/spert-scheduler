// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import type { ActivityDependency } from "@domain/models/types";
import {
  buildDependencyGraph,
  detectCycle,
  validateDependencies,
  computeCriticalPathDuration,
  computeCriticalPathWithMilestones,
  computeCriticalPathActivities,
} from "./dependency-graph";

// -- Helpers -----------------------------------------------------------------

function fsDep(from: string, to: string, lag = 0): ActivityDependency {
  return { fromActivityId: from, toActivityId: to, type: "FS", lagDays: lag };
}

function ssDep(from: string, to: string, lag = 0): ActivityDependency {
  return { fromActivityId: from, toActivityId: to, type: "SS", lagDays: lag };
}

function ffDep(from: string, to: string, lag = 0): ActivityDependency {
  return { fromActivityId: from, toActivityId: to, type: "FF", lagDays: lag };
}

// -- buildDependencyGraph ----------------------------------------------------

describe("buildDependencyGraph", () => {
  it("handles empty activities and deps", () => {
    const graph = buildDependencyGraph([], []);
    expect(graph.topologicalOrder).toEqual([]);
    expect(graph.roots).toEqual([]);
  });

  it("handles activities with no dependencies (all roots)", () => {
    const graph = buildDependencyGraph(["a", "b", "c"], []);
    expect(graph.topologicalOrder).toHaveLength(3);
    expect(graph.roots).toEqual(["a", "b", "c"]);
  });

  it("handles linear chain A → B → C", () => {
    const graph = buildDependencyGraph(
      ["a", "b", "c"],
      [fsDep("a", "b"), fsDep("b", "c")]
    );
    expect(graph.topologicalOrder).toEqual(["a", "b", "c"]);
    expect(graph.roots).toEqual(["a"]);
    expect(graph.predecessors.get("b")).toEqual([{ id: "a", lagDays: 0, type: "FS" }]);
    expect(graph.successors.get("a")).toEqual([{ id: "b", lagDays: 0, type: "FS" }]);
  });

  it("handles diamond: A → B, A → C, B → D, C → D", () => {
    const graph = buildDependencyGraph(
      ["a", "b", "c", "d"],
      [fsDep("a", "b"), fsDep("a", "c"), fsDep("b", "d"), fsDep("c", "d")]
    );
    // A must come first, D must come last
    expect(graph.topologicalOrder[0]).toBe("a");
    expect(graph.topologicalOrder[3]).toBe("d");
    expect(graph.roots).toEqual(["a"]);
    expect(graph.predecessors.get("d")).toHaveLength(2);
  });

  it("handles parallel activities: A → C, B → C", () => {
    const graph = buildDependencyGraph(
      ["a", "b", "c"],
      [fsDep("a", "c"), fsDep("b", "c")]
    );
    // C must come after both A and B
    expect(graph.topologicalOrder.indexOf("c")).toBe(2);
    expect(graph.roots).toEqual(["a", "b"]);
  });

  it("preserves lag days in predecessor/successor maps", () => {
    const graph = buildDependencyGraph(
      ["a", "b"],
      [fsDep("a", "b", 3)]
    );
    expect(graph.predecessors.get("b")).toEqual([{ id: "a", lagDays: 3, type: "FS" }]);
    expect(graph.successors.get("a")).toEqual([{ id: "b", lagDays: 3, type: "FS" }]);
  });

  it("skips self-loops silently", () => {
    const graph = buildDependencyGraph(["a", "b"], [fsDep("a", "a"), fsDep("a", "b")]);
    expect(graph.topologicalOrder).toEqual(["a", "b"]);
  });

  it("skips deps referencing unknown activities silently", () => {
    const graph = buildDependencyGraph(["a", "b"], [fsDep("a", "x"), fsDep("a", "b")]);
    expect(graph.topologicalOrder).toEqual(["a", "b"]);
    expect(graph.predecessors.get("b")).toEqual([{ id: "a", lagDays: 0, type: "FS" }]);
  });

  it("throws on cycle", () => {
    expect(() =>
      buildDependencyGraph(["a", "b"], [fsDep("a", "b"), fsDep("b", "a")])
    ).toThrow("Dependency cycle detected");
  });

  it("throws on 3-node cycle", () => {
    expect(() =>
      buildDependencyGraph(
        ["a", "b", "c"],
        [fsDep("a", "b"), fsDep("b", "c"), fsDep("c", "a")]
      )
    ).toThrow("Dependency cycle detected");
  });
});

// -- detectCycle -------------------------------------------------------------

describe("detectCycle", () => {
  it("returns null for acyclic graph", () => {
    expect(detectCycle(["a", "b", "c"], [fsDep("a", "b"), fsDep("b", "c")])).toBeNull();
  });

  it("returns null for no dependencies", () => {
    expect(detectCycle(["a", "b"], [])).toBeNull();
  });

  it("detects A → B → A cycle", () => {
    const cycle = detectCycle(["a", "b"], [fsDep("a", "b"), fsDep("b", "a")]);
    expect(cycle).not.toBeNull();
    expect(cycle!.length).toBeGreaterThanOrEqual(3); // at least [a, b, a]
    // First and last should be the same (cycle)
    expect(cycle![0]).toBe(cycle![cycle!.length - 1]);
  });

  it("detects A → B → C → A cycle", () => {
    const cycle = detectCycle(
      ["a", "b", "c"],
      [fsDep("a", "b"), fsDep("b", "c"), fsDep("c", "a")]
    );
    expect(cycle).not.toBeNull();
    expect(cycle![0]).toBe(cycle![cycle!.length - 1]);
  });

  it("ignores self-loops in cycle detection", () => {
    // Self-loops are handled by validateDependencies, not detectCycle
    expect(detectCycle(["a"], [fsDep("a", "a")])).toBeNull();
  });

  it("detects cycle in larger graph", () => {
    // A → B → C, D → E → C → D (cycle in D-E-C)
    const cycle = detectCycle(
      ["a", "b", "c", "d", "e"],
      [fsDep("a", "b"), fsDep("b", "c"), fsDep("d", "e"), fsDep("e", "c"), fsDep("c", "d")]
    );
    expect(cycle).not.toBeNull();
  });
});

// -- validateDependencies ----------------------------------------------------

describe("validateDependencies", () => {
  it("returns empty for valid deps", () => {
    expect(
      validateDependencies(["a", "b", "c"], [fsDep("a", "b"), fsDep("b", "c")])
    ).toEqual([]);
  });

  it("returns empty for no deps", () => {
    expect(validateDependencies(["a", "b"], [])).toEqual([]);
  });

  it("detects self-loop", () => {
    const errors = validateDependencies(["a"], [fsDep("a", "a")]);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.type).toBe("self-loop");
  });

  it("detects missing from reference", () => {
    const errors = validateDependencies(["b"], [fsDep("x", "b")]);
    expect(errors.some((e) => e.type === "missing-ref")).toBe(true);
  });

  it("detects missing to reference", () => {
    const errors = validateDependencies(["a"], [fsDep("a", "x")]);
    expect(errors.some((e) => e.type === "missing-ref")).toBe(true);
  });

  it("detects duplicate dependency", () => {
    const errors = validateDependencies(
      ["a", "b"],
      [fsDep("a", "b"), fsDep("a", "b")]
    );
    expect(errors.some((e) => e.type === "duplicate")).toBe(true);
  });

  it("detects cycle", () => {
    const errors = validateDependencies(
      ["a", "b"],
      [fsDep("a", "b"), fsDep("b", "a")]
    );
    expect(errors.some((e) => e.type === "cycle")).toBe(true);
  });

  it("does not check cycles when structural errors exist", () => {
    // Self-loop prevents cycle check
    const errors = validateDependencies(["a", "b"], [fsDep("a", "a"), fsDep("a", "b"), fsDep("b", "a")]);
    expect(errors.some((e) => e.type === "self-loop")).toBe(true);
    expect(errors.some((e) => e.type === "cycle")).toBe(false);
  });
});

// -- computeCriticalPathDuration ---------------------------------------------

describe("computeCriticalPathDuration", () => {
  it("returns 0 for empty graph", () => {
    const graph = buildDependencyGraph([], []);
    const durations = new Map<string, number>();
    expect(computeCriticalPathDuration(graph, durations)).toBe(0);
  });

  it("single activity returns its duration", () => {
    const graph = buildDependencyGraph(["a"], []);
    const durations = new Map([["a", 5]]);
    expect(computeCriticalPathDuration(graph, durations)).toBe(5);
  });

  it("linear chain: sum of durations", () => {
    const graph = buildDependencyGraph(
      ["a", "b", "c"],
      [fsDep("a", "b"), fsDep("b", "c")]
    );
    const durations = new Map([["a", 3], ["b", 4], ["c", 5]]);
    // A(0-3) → B(3-7) → C(7-12)
    expect(computeCriticalPathDuration(graph, durations)).toBe(12);
  });

  it("parallel activities: max of branches", () => {
    // A → C, B → C (A and B run in parallel)
    const graph = buildDependencyGraph(
      ["a", "b", "c"],
      [fsDep("a", "c"), fsDep("b", "c")]
    );
    const durations = new Map([["a", 3], ["b", 7], ["c", 2]]);
    // A(0-3), B(0-7) in parallel, C starts after max(3,7) = 7, C(7-9)
    expect(computeCriticalPathDuration(graph, durations)).toBe(9);
  });

  it("diamond: critical path through longest branch", () => {
    // A → B, A → C, B → D, C → D
    const graph = buildDependencyGraph(
      ["a", "b", "c", "d"],
      [fsDep("a", "b"), fsDep("a", "c"), fsDep("b", "d"), fsDep("c", "d")]
    );
    const durations = new Map([["a", 2], ["b", 10], ["c", 3], ["d", 1]]);
    // A(0-2), B(2-12), C(2-5), D starts at max(12,5)=12, D(12-13)
    expect(computeCriticalPathDuration(graph, durations)).toBe(13);
  });

  it("with positive lag", () => {
    const graph = buildDependencyGraph(
      ["a", "b"],
      [fsDep("a", "b", 5)]
    );
    const durations = new Map([["a", 3], ["b", 4]]);
    // A(0-3), B starts at 3+5=8, B(8-12)
    expect(computeCriticalPathDuration(graph, durations)).toBe(12);
  });

  it("with negative lag (lead time)", () => {
    const graph = buildDependencyGraph(
      ["a", "b"],
      [fsDep("a", "b", -2)]
    );
    const durations = new Map([["a", 5], ["b", 4]]);
    // A(0-5), B starts at max(0, 5+(-2))=3, B(3-7)
    expect(computeCriticalPathDuration(graph, durations)).toBe(7);
  });

  it("with negative lag that would go below 0, clamps to 0", () => {
    const graph = buildDependencyGraph(
      ["a", "b"],
      [fsDep("a", "b", -10)]
    );
    const durations = new Map([["a", 3], ["b", 4]]);
    // A(0-3), B would start at 3+(-10)=-7, but earlyStart uses max(0, ...) implicitly
    // since earlyStart starts at 0 and max over predecessors
    // Actually: es = max(0, 3 + (-10)) → 0 isn't guaranteed by our code
    // Our code: es starts at 0, then max(es, predFinish + lagDays) = max(0, 3-10) = max(0, -7) = 0
    expect(computeCriticalPathDuration(graph, durations)).toBe(4);
  });

  it("all parallel (no deps): max of all durations", () => {
    const graph = buildDependencyGraph(["a", "b", "c"], []);
    const durations = new Map([["a", 3], ["b", 7], ["c", 5]]);
    expect(computeCriticalPathDuration(graph, durations)).toBe(7);
  });

  it("complex graph with multiple critical paths", () => {
    // A → C, A → D, B → D, C → E, D → E
    const graph = buildDependencyGraph(
      ["a", "b", "c", "d", "e"],
      [fsDep("a", "c"), fsDep("a", "d"), fsDep("b", "d"), fsDep("c", "e"), fsDep("d", "e")]
    );
    const durations = new Map([["a", 2], ["b", 1], ["c", 6], ["d", 3], ["e", 1]]);
    // A(0-2), B(0-1)
    // C starts at max(earlyFinish[A])=2, C(2-8)
    // D starts at max(earlyFinish[A], earlyFinish[B])=max(2,1)=2, D(2-5)
    // E starts at max(earlyFinish[C], earlyFinish[D])=max(8,5)=8, E(8-9)
    expect(computeCriticalPathDuration(graph, durations)).toBe(9);
  });
});

// -- computeCriticalPathWithMilestones ----------------------------------------

describe("computeCriticalPathWithMilestones", () => {
  it("returns 0 for empty graph", () => {
    const graph = buildDependencyGraph([], []);
    const result = computeCriticalPathWithMilestones(graph, new Map(), new Map());
    expect(result.projectDuration).toBe(0);
    expect(result.milestoneDurations.size).toBe(0);
  });

  it("matches computeCriticalPathDuration when no milestones", () => {
    const graph = buildDependencyGraph(
      ["a", "b", "c"],
      [fsDep("a", "b"), fsDep("b", "c")]
    );
    const durations = new Map([["a", 3], ["b", 4], ["c", 5]]);
    const result = computeCriticalPathWithMilestones(graph, durations, new Map());
    expect(result.projectDuration).toBe(12);
  });

  it("computes per-milestone durations", () => {
    // A(3) → B(4) → C(5), milestone M1 covers A and B
    const graph = buildDependencyGraph(
      ["a", "b", "c"],
      [fsDep("a", "b"), fsDep("b", "c")]
    );
    const durations = new Map([["a", 3], ["b", 4], ["c", 5]]);
    const milestoneActivityIds = new Map([["m1", ["a", "b"]]]);
    const result = computeCriticalPathWithMilestones(graph, durations, milestoneActivityIds);
    expect(result.projectDuration).toBe(12);
    // M1 finish = max(earlyFinish[a]=3, earlyFinish[b]=7) = 7
    expect(result.milestoneDurations.get("m1")).toBe(7);
  });

  it("handles multiple milestones", () => {
    // A(2) → B(3), A(2) → C(5)
    const graph = buildDependencyGraph(
      ["a", "b", "c"],
      [fsDep("a", "b"), fsDep("a", "c")]
    );
    const durations = new Map([["a", 2], ["b", 3], ["c", 5]]);
    const milestoneActivityIds = new Map([
      ["m1", ["a", "b"]],
      ["m2", ["a", "c"]],
    ]);
    const result = computeCriticalPathWithMilestones(graph, durations, milestoneActivityIds);
    // A(0-2), B(2-5), C(2-7)
    expect(result.projectDuration).toBe(7);
    expect(result.milestoneDurations.get("m1")).toBe(5); // max(2, 5)
    expect(result.milestoneDurations.get("m2")).toBe(7); // max(2, 7)
  });

  it("applies earliest-start constraint", () => {
    // A(3) → B(4), but B has earliest start = 10
    const graph = buildDependencyGraph(
      ["a", "b"],
      [fsDep("a", "b")]
    );
    const durations = new Map([["a", 3], ["b", 4]]);
    const milestoneActivityIds = new Map([["m1", ["a", "b"]]]);
    const activityEarliestStart = new Map([["b", 10]]);
    const result = computeCriticalPathWithMilestones(
      graph, durations, milestoneActivityIds, activityEarliestStart
    );
    // A(0-3), B starts at max(3, 10)=10, B(10-14)
    expect(result.projectDuration).toBe(14);
    expect(result.milestoneDurations.get("m1")).toBe(14);
  });

  it("predecessor wins when later than earliest-start", () => {
    // A(15) → B(4), B has earliest start = 10
    const graph = buildDependencyGraph(
      ["a", "b"],
      [fsDep("a", "b")]
    );
    const durations = new Map([["a", 15], ["b", 4]]);
    const activityEarliestStart = new Map([["b", 10]]);
    const result = computeCriticalPathWithMilestones(
      graph, durations, new Map([["m1", ["b"]]]), activityEarliestStart
    );
    // A(0-15), B starts at max(15, 10)=15, B(15-19)
    expect(result.projectDuration).toBe(19);
    expect(result.milestoneDurations.get("m1")).toBe(19);
  });

  it("handles empty milestone activity list", () => {
    const graph = buildDependencyGraph(["a"], []);
    const durations = new Map([["a", 5]]);
    const milestoneActivityIds = new Map([["m1", []]]);
    const result = computeCriticalPathWithMilestones(graph, durations, milestoneActivityIds);
    expect(result.projectDuration).toBe(5);
    expect(result.milestoneDurations.get("m1")).toBe(0);
  });
});

// -- computeCriticalPathActivities -------------------------------------------

describe("computeCriticalPathActivities", () => {
  it("returns empty set for empty graph", () => {
    const graph = buildDependencyGraph([], []);
    const result = computeCriticalPathActivities(graph, new Map());
    expect(result.criticalActivityIds.size).toBe(0);
    expect(result.projectDuration).toBe(0);
  });

  it("single activity is critical", () => {
    const graph = buildDependencyGraph(["a"], []);
    const result = computeCriticalPathActivities(graph, new Map([["a", 5]]));
    expect(result.criticalActivityIds).toEqual(new Set(["a"]));
    expect(result.projectDuration).toBe(5);
  });

  it("linear chain: all activities are critical", () => {
    const graph = buildDependencyGraph(
      ["a", "b", "c"],
      [fsDep("a", "b"), fsDep("b", "c")]
    );
    const durations = new Map([["a", 3], ["b", 4], ["c", 5]]);
    const result = computeCriticalPathActivities(graph, durations);
    expect(result.criticalActivityIds).toEqual(new Set(["a", "b", "c"]));
    expect(result.projectDuration).toBe(12);
  });

  it("diamond: critical path through longest branch", () => {
    // A → B, A → C, B → D, C → D; B is longer than C
    const graph = buildDependencyGraph(
      ["a", "b", "c", "d"],
      [fsDep("a", "b"), fsDep("a", "c"), fsDep("b", "d"), fsDep("c", "d")]
    );
    const durations = new Map([["a", 2], ["b", 10], ["c", 3], ["d", 1]]);
    const result = computeCriticalPathActivities(graph, durations);
    // A(0-2), B(2-12), C(2-5), D(12-13). C has float = 12-5 = 7
    expect(result.criticalActivityIds).toEqual(new Set(["a", "b", "d"]));
    expect(result.criticalActivityIds.has("c")).toBe(false);
    expect(result.projectDuration).toBe(13);
  });

  it("parallel roots: only longest-path root is critical", () => {
    // A and B are independent roots, no deps
    const graph = buildDependencyGraph(["a", "b"], []);
    const durations = new Map([["a", 10], ["b", 3]]);
    const result = computeCriticalPathActivities(graph, durations);
    expect(result.criticalActivityIds).toEqual(new Set(["a"]));
    expect(result.criticalActivityIds.has("b")).toBe(false);
    expect(result.projectDuration).toBe(10);
  });

  it("parallel roots with equal durations: both are critical", () => {
    const graph = buildDependencyGraph(["a", "b"], []);
    const durations = new Map([["a", 5], ["b", 5]]);
    const result = computeCriticalPathActivities(graph, durations);
    expect(result.criticalActivityIds).toEqual(new Set(["a", "b"]));
  });

  it("lag days can shift the critical path", () => {
    // A → B (lag 0), A → C (lag 20); C is short but lag makes it critical
    const graph = buildDependencyGraph(
      ["a", "b", "c"],
      [fsDep("a", "b", 0), fsDep("a", "c", 20)]
    );
    const durations = new Map([["a", 2], ["b", 10], ["c", 1]]);
    // A(0-2), B(2-12), C starts at 2+20=22, C(22-23)
    // maxFinish=23. LF[B]=23, LS[B]=23-10=13, ES[B]=2 → float=11
    // LF[C]=23, LS[C]=23-1=22, ES[C]=22 → float=0
    // LF[A]: min(LS[B]-0, LS[C]-20)=min(13,2)=2, LS[A]=2-2=0 → float=0
    const result = computeCriticalPathActivities(graph, durations);
    expect(result.criticalActivityIds).toEqual(new Set(["a", "c"]));
    expect(result.criticalActivityIds.has("b")).toBe(false);
    expect(result.projectDuration).toBe(23);
  });

  it("consistency: projectDuration matches computeCriticalPathDuration", () => {
    const graph = buildDependencyGraph(
      ["a", "b", "c", "d", "e"],
      [fsDep("a", "c"), fsDep("a", "d"), fsDep("b", "d"), fsDep("c", "e"), fsDep("d", "e")]
    );
    const durations = new Map([["a", 2], ["b", 1], ["c", 6], ["d", 3], ["e", 1]]);
    const result = computeCriticalPathActivities(graph, durations);
    const duration = computeCriticalPathDuration(graph, durations);
    expect(result.projectDuration).toBe(duration);
  });

  it("complex graph: identifies correct critical activities", () => {
    // A(2) → C(6) → E(1), A(2) → D(3) → E(1), B(1) → D(3) → E(1)
    const graph = buildDependencyGraph(
      ["a", "b", "c", "d", "e"],
      [fsDep("a", "c"), fsDep("a", "d"), fsDep("b", "d"), fsDep("c", "e"), fsDep("d", "e")]
    );
    const durations = new Map([["a", 2], ["b", 1], ["c", 6], ["d", 3], ["e", 1]]);
    // A(0-2), B(0-1), C(2-8), D(2-5), E(8-9)
    // Critical: A→C→E (length 9). D has float=3, B has float=6
    const result = computeCriticalPathActivities(graph, durations);
    expect(result.criticalActivityIds).toEqual(new Set(["a", "c", "e"]));
    expect(result.projectDuration).toBe(9);
  });
});

// -- Property-based tests ----------------------------------------------------

describe("property-based tests", () => {
  // Generate an acyclic DAG: for each pair (i,j) where i<j, optionally add edge i→j
  const acyclicGraphArb = fc
    .integer({ min: 1, max: 8 })
    .chain((n) => {
      const ids = Array.from({ length: n }, (_, i) => `act${i}`);
      const edgePairs: [number, number][] = [];
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          edgePairs.push([i, j]);
        }
      }
      return fc
        .tuple(
          fc.constant(ids),
          fc.subarray(edgePairs, { minLength: 0, maxLength: edgePairs.length }),
          fc.array(fc.integer({ min: 1, max: 20 }), { minLength: n, maxLength: n })
        )
        .map(([ids, edges, durs]) => ({
          ids,
          deps: edges.map(([i, j]) => fsDep(ids[i]!, ids[j]!)),
          durations: new Map(ids.map((id, i) => [id, durs[i]!])),
        }));
    });

  it("critical path ≥ longest single activity (fast-check)", () => {
    fc.assert(
      fc.property(acyclicGraphArb, (graphData) => {
        const graph = buildDependencyGraph(graphData.ids, graphData.deps);
        const cp = computeCriticalPathDuration(graph, graphData.durations);
        const maxSingle = Math.max(...graphData.durations.values());
        expect(cp).toBeGreaterThanOrEqual(maxSingle);
      })
    );
  });

  it("critical path ≤ sum of all durations (fast-check)", () => {
    fc.assert(
      fc.property(acyclicGraphArb, (graphData) => {
        const graph = buildDependencyGraph(graphData.ids, graphData.deps);
        const cp = computeCriticalPathDuration(graph, graphData.durations);
        let sum = 0;
        for (const d of graphData.durations.values()) sum += d;
        expect(cp).toBeLessThanOrEqual(sum);
      })
    );
  });

  it("topological order has all activities (fast-check)", () => {
    fc.assert(
      fc.property(acyclicGraphArb, (graphData) => {
        const graph = buildDependencyGraph(graphData.ids, graphData.deps);
        expect(new Set(graph.topologicalOrder)).toEqual(new Set(graphData.ids));
      })
    );
  });

  it("computeCriticalPathActivities.projectDuration === computeCriticalPathDuration (fast-check)", () => {
    fc.assert(
      fc.property(acyclicGraphArb, (graphData) => {
        const graph = buildDependencyGraph(graphData.ids, graphData.deps);
        const result = computeCriticalPathActivities(graph, graphData.durations);
        const duration = computeCriticalPathDuration(graph, graphData.durations);
        expect(result.projectDuration).toBe(duration);
      })
    );
  });

  it("critical path set is non-empty when graph has activities (fast-check)", () => {
    fc.assert(
      fc.property(acyclicGraphArb, (graphData) => {
        const graph = buildDependencyGraph(graphData.ids, graphData.deps);
        const result = computeCriticalPathActivities(graph, graphData.durations);
        expect(result.criticalActivityIds.size).toBeGreaterThanOrEqual(1);
      })
    );
  });

  it("critical activities are a subset of all activities (fast-check)", () => {
    fc.assert(
      fc.property(acyclicGraphArb, (graphData) => {
        const graph = buildDependencyGraph(graphData.ids, graphData.deps);
        const result = computeCriticalPathActivities(graph, graphData.durations);
        for (const id of result.criticalActivityIds) {
          expect(graphData.ids).toContain(id);
        }
      })
    );
  });

  it("predecessors come before successors in topological order (fast-check)", () => {
    fc.assert(
      fc.property(acyclicGraphArb, (graphData) => {
        const graph = buildDependencyGraph(graphData.ids, graphData.deps);
        const order = graph.topologicalOrder;
        const indexOf = new Map(order.map((id, i) => [id, i]));
        for (const dep of graphData.deps) {
          expect(indexOf.get(dep.fromActivityId)!).toBeLessThan(
            indexOf.get(dep.toActivityId)!
          );
        }
      })
    );
  });
});

// -- SS and FF dependency types (integer domain) -----------------------------

describe("SS forward pass (computeCriticalPathDuration)", () => {
  it("SS lag=0: A(5) SS→ B(3) — B starts when A starts, project = max(5, 0+3) = 5", () => {
    const ids = ["a", "b"];
    const deps = [ssDep("a", "b")];
    const graph = buildDependencyGraph(ids, deps);
    const durations = new Map([["a", 5], ["b", 3]]);
    // A: ES=0, EF=5; B: ES=max(0, predStart(0)+0)=0, EF=3; project=max(5,3)=5
    expect(computeCriticalPathDuration(graph, durations)).toBe(5);
  });

  it("SS lag=2: A(5) SS+2→ B(3) — B starts 2 after A starts, project = max(5, 2+3) = 5", () => {
    const ids = ["a", "b"];
    const deps = [ssDep("a", "b", 2)];
    const graph = buildDependencyGraph(ids, deps);
    const durations = new Map([["a", 5], ["b", 3]]);
    // B: ES=0+2=2, EF=5; project=max(5,5)=5
    expect(computeCriticalPathDuration(graph, durations)).toBe(5);
  });

  it("SS lag=-1: A(5) SS-1→ B(3) — floor ES to 0", () => {
    const ids = ["a", "b"];
    const deps = [ssDep("a", "b", -1)];
    const graph = buildDependencyGraph(ids, deps);
    const durations = new Map([["a", 5], ["b", 3]]);
    // B: ES=max(0, 0+(-1))=max(0,-1)=0, EF=3; project=max(5,3)=5
    expect(computeCriticalPathDuration(graph, durations)).toBe(5);
  });

  it("SS chain: A(4) SS+1→ B(3) SS+2→ C(2)", () => {
    const ids = ["a", "b", "c"];
    const deps = [ssDep("a", "b", 1), ssDep("b", "c", 2)];
    const graph = buildDependencyGraph(ids, deps);
    const durations = new Map([["a", 4], ["b", 3], ["c", 2]]);
    // A: ES=0, EF=4; B: ES=0+1=1, EF=4; C: ES=1+2=3, EF=5
    // project=max(4,4,5)=5
    expect(computeCriticalPathDuration(graph, durations)).toBe(5);
  });
});

describe("FF forward pass (computeCriticalPathDuration)", () => {
  it("FF lag=0: A(5) FF→ B(3) — B finishes when A finishes, B: ES=5-3=2, project=5", () => {
    const ids = ["a", "b"];
    const deps = [ffDep("a", "b")];
    const graph = buildDependencyGraph(ids, deps);
    const durations = new Map([["a", 5], ["b", 3]]);
    // B: ES=max(0, predFinish(5)+0-3)=max(0,2)=2, EF=5; project=max(5,5)=5
    expect(computeCriticalPathDuration(graph, durations)).toBe(5);
  });

  it("FF lag=2: A(5) FF+2→ B(3) — B finishes 2 after A, B: ES=5+2-3=4, project=7", () => {
    const ids = ["a", "b"];
    const deps = [ffDep("a", "b", 2)];
    const graph = buildDependencyGraph(ids, deps);
    const durations = new Map([["a", 5], ["b", 3]]);
    // B: ES=max(0, 5+2-3)=4, EF=7; project=max(5,7)=7
    expect(computeCriticalPathDuration(graph, durations)).toBe(7);
  });

  it("FF lag=-1: A(5) FF-1→ B(3) — B finishes 1 before A, B: ES=5-1-3=1, project=5", () => {
    const ids = ["a", "b"];
    const deps = [ffDep("a", "b", -1)];
    const graph = buildDependencyGraph(ids, deps);
    const durations = new Map([["a", 5], ["b", 3]]);
    // B: ES=max(0, 5+(-1)-3)=max(0,1)=1, EF=4; project=max(5,4)=5
    expect(computeCriticalPathDuration(graph, durations)).toBe(5);
  });
});

describe("SS backward pass (computeCriticalPathActivities)", () => {
  it("SS lag=0: A(5) SS→ B(3) — neither is critical (SS-only constraint)", () => {
    const ids = ["a", "b"];
    const deps = [ssDep("a", "b")];
    const graph = buildDependencyGraph(ids, deps);
    const durations = new Map([["a", 5], ["b", 3]]);
    const result = computeCriticalPathActivities(graph, durations);
    // Forward: A: ES=0, EF=5; B: ES=0, EF=3; project=5
    // Backward: B no succs: LS=2, LF=5; A: succ B(SS), candidateLS=2-0=2 → float=2
    // CPM correctly shows float>0 for both activities in an SS-only pair
    expect(result.projectDuration).toBe(5);
    expect(result.criticalActivityIds.has("a")).toBe(false);
    expect(result.criticalActivityIds.has("b")).toBe(false);
  });

  it("SS critical chain: A(3) SS+2→ B(5) — B is critical", () => {
    const ids = ["a", "b"];
    const deps = [ssDep("a", "b", 2)];
    const graph = buildDependencyGraph(ids, deps);
    const durations = new Map([["a", 3], ["b", 5]]);
    const result = computeCriticalPathActivities(graph, durations);
    // A: ES=0, EF=3; B: ES=0+2=2, EF=7; project=max(3,7)=7
    // Backward: B no succs: LS=7-5=2, LF=7; float=2-2=0 → critical
    // A: succ B(SS), candidateLS=LS(B)-lag=2-2=0; LS=0, LF=3; float=0-0=0 → critical
    expect(result.projectDuration).toBe(7);
    expect(result.criticalActivityIds.has("a")).toBe(true);
    expect(result.criticalActivityIds.has("b")).toBe(true);
  });
});

describe("FF backward pass (computeCriticalPathActivities)", () => {
  it("FF lag=0: A(5) FF→ B(3) — both critical", () => {
    const ids = ["a", "b"];
    const deps = [ffDep("a", "b")];
    const graph = buildDependencyGraph(ids, deps);
    const durations = new Map([["a", 5], ["b", 3]]);
    const result = computeCriticalPathActivities(graph, durations);
    // A: ES=0, EF=5; B: ES=max(0, 5-3)=2, EF=5; project=5
    // Backward: B no succs: LS=5-3=2, LF=5; float=2-2=0 → critical
    // A: succ B(FF), candidateLS=LF(B)-lag-dur=5-0-5=0; LS=0, LF=5; float=0 → critical
    expect(result.projectDuration).toBe(5);
    expect(result.criticalActivityIds.has("a")).toBe(true);
    expect(result.criticalActivityIds.has("b")).toBe(true);
  });

  it("FF critical chain: A(5) FF+2→ B(3) — B is critical, A has float", () => {
    const ids = ["a", "b"];
    const deps = [ffDep("a", "b", 2)];
    const graph = buildDependencyGraph(ids, deps);
    const durations = new Map([["a", 5], ["b", 3]]);
    const result = computeCriticalPathActivities(graph, durations);
    // A: ES=0, EF=5; B: ES=max(0, 5+2-3)=4, EF=7; project=7
    // Backward: B no succs: LS=7-3=4, LF=7; float=4-4=0 → critical
    // A: succ B(FF), candidateLS=LF(B)-lag-dur=7-2-5=0; LS=0, LF=5; float=0 → critical
    expect(result.projectDuration).toBe(7);
    expect(result.criticalActivityIds.has("a")).toBe(true);
    expect(result.criticalActivityIds.has("b")).toBe(true);
  });
});

describe("Mixed-type backward pass", () => {
  it("FS+SS: A(3) FS→ C(2), B(4) SS→ C(2) — critical path through B", () => {
    const ids = ["a", "b", "c"];
    const deps = [fsDep("a", "c"), ssDep("b", "c")];
    const graph = buildDependencyGraph(ids, deps);
    const durations = new Map([["a", 3], ["b", 4], ["c", 2]]);
    const result = computeCriticalPathActivities(graph, durations);
    // A: ES=0, EF=3; B: ES=0, EF=4
    // C: predecessors A(FS): ES=EF(A)+0=3; B(SS): ES=ES(B)+0=0; max=3; EF=5
    // project=max(3,4,5)=5
    // Backward: C no succs: LS=5-2=3, LF=5; float=3-3=0 → critical
    // A: succ C(FS), candidateLS=LS(C)-0-dur=3-0-3=0; LS=0; float=0 → critical
    // B: succ C(SS), candidateLS=LS(C)-0=3; LS=3; dur=4, LF=7; float=3-0=3 → not critical
    expect(result.projectDuration).toBe(5);
    expect(result.criticalActivityIds.has("a")).toBe(true);
    expect(result.criticalActivityIds.has("c")).toBe(true);
    expect(result.criticalActivityIds.has("b")).toBe(false);
  });

  it("FS+FF: A(3) FS→ C(2), B(5) FF→ C(2)", () => {
    const ids = ["a", "b", "c"];
    const deps = [fsDep("a", "c"), ffDep("b", "c")];
    const graph = buildDependencyGraph(ids, deps);
    const durations = new Map([["a", 3], ["b", 5], ["c", 2]]);
    const result = computeCriticalPathActivities(graph, durations);
    // A: ES=0, EF=3; B: ES=0, EF=5
    // C: pred A(FS): ES=3; pred B(FF): ES=EF(B)+0-dur(C)=5-2=3; max=3; EF=5
    // project=max(3,5,5)=5
    expect(result.projectDuration).toBe(5);
  });

  it("SS+FF: A(4) SS+1→ C(3), B(5) FF→ C(3)", () => {
    const ids = ["a", "b", "c"];
    const deps = [ssDep("a", "c", 1), ffDep("b", "c")];
    const graph = buildDependencyGraph(ids, deps);
    const durations = new Map([["a", 4], ["b", 5], ["c", 3]]);
    const result = computeCriticalPathActivities(graph, durations);
    // A: ES=0, EF=4; B: ES=0, EF=5
    // C: pred A(SS+1): ES=0+1=1; pred B(FF): ES=5+0-3=2; max=2; EF=5
    // project=max(4,5,5)=5
    expect(result.projectDuration).toBe(5);
  });
});

// -- Pathological cases (P1-P10) ---------------------------------------------

describe("Pathological SS/FF cases", () => {
  it("P1: SS+FF conflict diamond — 4 activities", () => {
    // A(3)→B(4) SS, A(3)→C(2) FS, B(4)→D(3) FS, C(2)→D(3) FF
    const ids = ["a", "b", "c", "d"];
    const deps = [ssDep("a", "b"), fsDep("a", "c"), fsDep("b", "d"), ffDep("c", "d")];
    const graph = buildDependencyGraph(ids, deps);
    const durations = new Map([["a", 3], ["b", 4], ["c", 2], ["d", 3]]);
    const result = computeCriticalPathActivities(graph, durations);
    // A: ES=0, EF=3; B: ES(SS from A)=0, EF=4; C: ES(FS from A)=3, EF=5
    // D: pred B(FS): ES=EF(B)+0=4; pred C(FF): ES=EF(C)+0-dur(D)=5-3=2; max=4; EF=7
    // project=max(3,4,5,7)=7
    expect(result.projectDuration).toBe(7);
  });

  it("P2: FF pulling ES before project start — floor to 0", () => {
    // A(2) FF-3→ B(5): B would need ES = EF(A) + (-3) - 5 = 2 - 3 - 5 = -6 → floor to 0
    const ids = ["a", "b"];
    const deps = [ffDep("a", "b", -3)];
    const graph = buildDependencyGraph(ids, deps);
    const durations = new Map([["a", 2], ["b", 5]]);
    expect(computeCriticalPathDuration(graph, durations)).toBe(5);
    // B: ES=max(0, 2+(-3)-5)=max(0,-6)=0, EF=5
  });

  it("P3: Mixed SS+FF+FS predecessors", () => {
    // A(3)→D FS, B(4)→D SS+1, C(5)→D FF
    const ids = ["a", "b", "c", "d"];
    const deps = [fsDep("a", "d"), ssDep("b", "d", 1), ffDep("c", "d")];
    const graph = buildDependencyGraph(ids, deps);
    const durations = new Map([["a", 3], ["b", 4], ["c", 5], ["d", 2]]);
    // A: ES=0, EF=3; B: ES=0, EF=4; C: ES=0, EF=5
    // D: pred A(FS): ES=3; pred B(SS+1): ES=0+1=1; pred C(FF): ES=5-2=3; max=3; EF=5
    expect(computeCriticalPathDuration(graph, durations)).toBe(5);
  });

  it("P4: Backward pass asymmetry — SS and FS on same successor", () => {
    // A(5) SS→ B(3), A(5) FS→ C(2)
    const ids = ["a", "b", "c"];
    const deps = [ssDep("a", "b"), fsDep("a", "c")];
    const graph = buildDependencyGraph(ids, deps);
    const durations = new Map([["a", 5], ["b", 3], ["c", 2]]);
    const result = computeCriticalPathActivities(graph, durations);
    // A: ES=0, EF=5; B: ES=0, EF=3; C: ES=5, EF=7; project=7
    // Backward: C no succs: LS=7-2=5, LF=7; float=0 → critical
    // B no succs: LS=7-3=4, LF=7; float=4-0=4 → not critical
    // A: succ B(SS): candidateLS=4-0=4; succ C(FS): candidateLS=5-0-5=0; min=0; LS=0; float=0 → critical
    expect(result.projectDuration).toBe(7);
    expect(result.criticalActivityIds.has("a")).toBe(true);
    expect(result.criticalActivityIds.has("c")).toBe(true);
    expect(result.criticalActivityIds.has("b")).toBe(false);
  });

  it("P5: Negative lag floor on SS", () => {
    // A(3) SS-5→ B(4): B would start at 0+(-5)=-5 → floor to 0
    const ids = ["a", "b"];
    const deps = [ssDep("a", "b", -5)];
    const graph = buildDependencyGraph(ids, deps);
    const durations = new Map([["a", 3], ["b", 4]]);
    expect(computeCriticalPathDuration(graph, durations)).toBe(4);
  });

  it("P6: Long alternating-type chain", () => {
    // A(2) SS+1→ B(3) FF→ C(2) FS→ D(4)
    const ids = ["a", "b", "c", "d"];
    const deps = [ssDep("a", "b", 1), ffDep("b", "c"), fsDep("c", "d")];
    const graph = buildDependencyGraph(ids, deps);
    const durations = new Map([["a", 2], ["b", 3], ["c", 2], ["d", 4]]);
    // A: ES=0, EF=2; B: ES=0+1=1, EF=4; C: ES=max(0, EF(B)+0-dur(C))=max(0,4-2)=2, EF=4
    // D: ES=EF(C)+0=4, EF=8; project=8
    expect(computeCriticalPathDuration(graph, durations)).toBe(8);
  });

  it("P7: Parallel paths with competing constraints", () => {
    // Path 1: A(3) FS→ C(2) = 3+2 = 5
    // Path 2: B(4) FF+1→ C(2): C must finish after B+1: ES=4+1-2=3, EF=5
    // Path 1 says ES=3 for C; Path 2 says ES=3 for C; max=3; project=5
    const ids = ["a", "b", "c"];
    const deps = [fsDep("a", "c"), ffDep("b", "c", 1)];
    const graph = buildDependencyGraph(ids, deps);
    const durations = new Map([["a", 3], ["b", 4], ["c", 2]]);
    expect(computeCriticalPathDuration(graph, durations)).toBe(5);
  });

  it("P8: Zero-duration activity with FF (integer domain only)", () => {
    // A(3) FF→ B(0): B ES=max(0, 3+0-0)=3, EF=3; project=3
    const ids = ["a", "b"];
    const deps = [ffDep("a", "b")];
    const graph = buildDependencyGraph(ids, deps);
    const durations = new Map([["a", 3], ["b", 0]]);
    expect(computeCriticalPathDuration(graph, durations)).toBe(3);
  });

  it("P9: Negative lag exceeding predecessor duration", () => {
    // A(2) FF-5→ B(3): ES=max(0, 2+(-5)-3)=max(0,-6)=0, EF=3
    const ids = ["a", "b"];
    const deps = [ffDep("a", "b", -5)];
    const graph = buildDependencyGraph(ids, deps);
    const durations = new Map([["a", 2], ["b", 3]]);
    expect(computeCriticalPathDuration(graph, durations)).toBe(3);
  });

  it("P10: FF backward pass reads lateFinish not lateStart", () => {
    // A(5) FF→ B(3) — verify backward pass correctness
    // Forward: A: ES=0, EF=5; B: ES=2, EF=5; project=5
    // Backward: B: LS=2, LF=5; A: succ B(FF), candidateLS=LF(B)-lag-dur=5-0-5=0
    // If incorrectly reads LS(B)=2: candidateLS=2-0-5=-3 → WRONG
    const ids = ["a", "b"];
    const deps = [ffDep("a", "b")];
    const graph = buildDependencyGraph(ids, deps);
    const durations = new Map([["a", 5], ["b", 3]]);
    const result = computeCriticalPathActivities(graph, durations);
    expect(result.projectDuration).toBe(5);
    // Both should be critical (float=0)
    expect(result.criticalActivityIds.has("a")).toBe(true);
    expect(result.criticalActivityIds.has("b")).toBe(true);
  });
});

// ===========================================================================
// Gap 1 — Math.max → Math.min mutant killers (L425 in computeCriticalPathWithMilestones)
// ===========================================================================

describe("computeCriticalPathWithMilestones — maxPredEF correctness", () => {
  it("hard MFO constraint: maxPredEF clamps es above forced finish", () => {
    // A(5) FS→ B(1); B has hard MFO at offset 2; B SS→ C(1)
    // A: EF=5; maxPredEF for B = 5
    // B network: ES=5, EF=6
    // MFO: ef=2; es=2-1=1; es=max(1, maxPredEF=5)=5. {es:5, ef:2}
    // C via SS from B: ES=5, EF=6. Project=max(5,2,6)=6.
    // Math.min mutant: maxPredEF=0; es=max(1,0)=1; B ES=1; C ES=1, EF=2. Project=max(5,2,2)=5.
    const ids = ["a", "b", "c"];
    const deps = [fsDep("a", "b"), ssDep("b", "c")];
    const graph = buildDependencyGraph(ids, deps);
    const durations = new Map([["a", 5], ["b", 1], ["c", 1]]);
    const constraintMap = new Map([
      ["b", { type: "MFO", offsetFromStart: 2, mode: "hard" }],
    ]);
    const milestoneIds = new Map<string, string[]>();
    const result = computeCriticalPathWithMilestones(
      graph, durations, milestoneIds, undefined, constraintMap,
    );
    expect(result.projectDuration).toBe(6);
  });

  it("two predecessors with different EFs: maxPredEF selects the larger", () => {
    // A(2) FS→ C(1), B(10) FS→ C(1); C has hard MFO at offset 3; C SS→ D(1)
    // A: EF=2; B: EF=10; maxPredEF=10
    // C network: ES=10, EF=11; MFO: ef=3, es=3-1=2, es=max(2,10)=10
    // D via SS from C: ES=10, EF=11. Project=max(2,10,3,11)=11.
    // Math.min: maxPredEF=min(0,2)=0 (init 0, first pred A EF=2, min=0; then B EF=10, min=0)
    //   → es=max(2,0)=2; C ES=2; D ES=2, EF=3. Project=max(2,10,3,3)=10.
    const ids = ["a", "b", "c", "d"];
    const deps = [fsDep("a", "c"), fsDep("b", "c"), ssDep("c", "d")];
    const graph = buildDependencyGraph(ids, deps);
    const durations = new Map([["a", 2], ["b", 10], ["c", 1], ["d", 1]]);
    const constraintMap = new Map([
      ["c", { type: "MFO", offsetFromStart: 3, mode: "hard" }],
    ]);
    const milestoneIds = new Map<string, string[]>();
    const result = computeCriticalPathWithMilestones(
      graph, durations, milestoneIds, undefined, constraintMap,
    );
    expect(result.projectDuration).toBe(11);
  });
});

// ===========================================================================
// Gap 3 — Invalid dependency filtering (L116)
// ===========================================================================

describe("buildDependencyGraph — invalid dependency filtering", () => {
  it("deps referencing non-existent activity IDs are silently dropped", () => {
    const ids = ["a", "b"];
    const deps = [
      fsDep("a", "b"),
      fsDep("a", "z"),   // z doesn't exist
      fsDep("x", "b"),   // x doesn't exist
      fsDep("x", "z"),   // neither exists
    ];
    const graph = buildDependencyGraph(ids, deps);
    expect(graph.topologicalOrder).toHaveLength(2);
    expect(graph.predecessors.get("b")!.length).toBe(1);
    expect(graph.predecessors.get("b")![0]!.id).toBe("a");
  });

  it("self-referencing dependency is filtered out", () => {
    const ids = ["a", "b"];
    const deps = [
      fsDep("a", "b"),
      fsDep("a", "a"), // self-loop
    ];
    const graph = buildDependencyGraph(ids, deps);
    expect(graph.topologicalOrder).toHaveLength(2);
    expect(graph.predecessors.get("a")!.length).toBe(0);
  });

  it("validateDependencies reports missing activity IDs", () => {
    const errors = validateDependencies(["a", "b"], [fsDep("a", "z")]);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]!.type).toBe("missing-ref");
  });

  it("validateDependencies reports self-loop", () => {
    const errors = validateDependencies(["a", "b"], [fsDep("a", "a")]);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]!.type).toBe("self-loop");
  });
});

// ===========================================================================
// Gap 10 — Edge cases: empty graph, cycle path order, milestone floor
// ===========================================================================

describe("computeCriticalPathActivities — empty graph", () => {
  it("returns zero duration and empty critical set for empty graph", () => {
    const graph = buildDependencyGraph([], []);
    const durations = new Map<string, number>();
    const result = computeCriticalPathActivities(graph, durations);
    expect(result.projectDuration).toBe(0);
    expect(result.criticalActivityIds.size).toBe(0);
  });
});

describe("computeCriticalPathDuration — empty graph", () => {
  it("returns 0 for empty graph", () => {
    const graph = buildDependencyGraph([], []);
    expect(computeCriticalPathDuration(graph, new Map())).toBe(0);
  });
});

describe("detectCycle — cycle path structure", () => {
  it("returned cycle path starts and ends with the same node", () => {
    const cycle = detectCycle(["a", "b", "c"], [fsDep("a", "b"), fsDep("b", "c"), fsDep("c", "a")]);
    expect(cycle).not.toBeNull();
    expect(cycle![0]).toBe(cycle![cycle!.length - 1]);
  });

  it("cycle path contains all nodes in the cycle", () => {
    const cycle = detectCycle(["a", "b", "c"], [fsDep("a", "b"), fsDep("b", "c"), fsDep("c", "a")]);
    expect(cycle).not.toBeNull();
    const inner = cycle!.slice(0, -1);
    expect(inner).toContain("a");
    expect(inner).toContain("b");
    expect(inner).toContain("c");
  });

  it("2-node cycle returns correct path", () => {
    const cycle = detectCycle(["a", "b"], [fsDep("a", "b"), fsDep("b", "a")]);
    expect(cycle).not.toBeNull();
    expect(cycle!.length).toBeGreaterThanOrEqual(3); // [x, y, x]
    expect(cycle![0]).toBe(cycle![cycle!.length - 1]);
  });
});

describe("computeCriticalPathWithMilestones — milestone and floor", () => {
  it("milestone duration equals max EF of assigned activities", () => {
    const ids = ["a", "b"];
    const deps = [fsDep("a", "b")];
    const graph = buildDependencyGraph(ids, deps);
    const durations = new Map([["a", 3], ["b", 5]]);
    const milestoneIds = new Map([["m1", ["a", "b"]]]);
    const result = computeCriticalPathWithMilestones(graph, durations, milestoneIds);
    expect(result.milestoneDurations.get("m1")).toBe(8);
    expect(result.projectDuration).toBe(8);
  });

  it("milestone with only early-finishing activity gets correct duration", () => {
    const ids = ["a", "b", "c"];
    const deps = [fsDep("a", "c"), fsDep("b", "c")];
    const graph = buildDependencyGraph(ids, deps);
    const durations = new Map([["a", 3], ["b", 10], ["c", 1]]);
    const milestoneIds = new Map([["m1", ["a"]]]);
    const result = computeCriticalPathWithMilestones(graph, durations, milestoneIds);
    expect(result.milestoneDurations.get("m1")).toBe(3);
    expect(result.projectDuration).toBe(11);
  });

  it("activityEarliestStart floor raises ES above network-computed value", () => {
    const ids = ["a"];
    const graph = buildDependencyGraph(ids, []);
    const durations = new Map([["a", 3]]);
    const milestoneIds = new Map<string, string[]>();
    const activityEarliestStart = new Map([["a", 5]]);
    const result = computeCriticalPathWithMilestones(
      graph, durations, milestoneIds, activityEarliestStart,
    );
    expect(result.projectDuration).toBe(8);
  });
});
