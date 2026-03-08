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
    expect(graph.predecessors.get("b")).toEqual([{ id: "a", lagDays: 0 }]);
    expect(graph.successors.get("a")).toEqual([{ id: "b", lagDays: 0 }]);
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
    expect(graph.predecessors.get("b")).toEqual([{ id: "a", lagDays: 3 }]);
    expect(graph.successors.get("a")).toEqual([{ id: "b", lagDays: 3 }]);
  });

  it("skips self-loops silently", () => {
    const graph = buildDependencyGraph(["a", "b"], [fsDep("a", "a"), fsDep("a", "b")]);
    expect(graph.topologicalOrder).toEqual(["a", "b"]);
  });

  it("skips deps referencing unknown activities silently", () => {
    const graph = buildDependencyGraph(["a", "b"], [fsDep("a", "x"), fsDep("a", "b")]);
    expect(graph.topologicalOrder).toEqual(["a", "b"]);
    expect(graph.predecessors.get("b")).toEqual([{ id: "a", lagDays: 0 }]);
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
