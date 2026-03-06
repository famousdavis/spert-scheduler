/**
 * Dependency graph utilities for activity scheduling.
 * Pure functions, zero framework dependencies.
 *
 * Uses Kahn's algorithm (iterative BFS) for topological sorting.
 * Critical path computed via forward pass in topological order.
 */

import type { ActivityDependency } from "@domain/models/types";

// -- Types -------------------------------------------------------------------

export interface DependencyGraph {
  /** Activity IDs in topological order (predecessors before successors) */
  topologicalOrder: string[];
  /** Map: activityId → list of predecessor { id, lagDays } */
  predecessors: Map<string, { id: string; lagDays: number }[]>;
  /** Map: activityId → list of successor { id, lagDays } */
  successors: Map<string, { id: string; lagDays: number }[]>;
  /** Activity IDs with no predecessors */
  roots: string[];
}

export interface ValidationError {
  type: "self-loop" | "missing-ref" | "duplicate" | "cycle";
  message: string;
}

// -- Build Graph -------------------------------------------------------------

/**
 * Build a dependency graph from activity IDs and dependencies.
 * Throws on cycle detection — use `detectCycle` first if you need a softer check.
 */
export function buildDependencyGraph(
  activityIds: string[],
  deps: ActivityDependency[]
): DependencyGraph {
  const idSet = new Set(activityIds);
  const predecessors = new Map<string, { id: string; lagDays: number }[]>();
  const successors = new Map<string, { id: string; lagDays: number }[]>();
  const inDegree = new Map<string, number>();

  // Initialize
  for (const id of activityIds) {
    predecessors.set(id, []);
    successors.set(id, []);
    inDegree.set(id, 0);
  }

  // Populate edges (skip invalid refs silently — validation is separate)
  for (const dep of deps) {
    if (!idSet.has(dep.fromActivityId) || !idSet.has(dep.toActivityId)) continue;
    if (dep.fromActivityId === dep.toActivityId) continue;

    predecessors.get(dep.toActivityId)!.push({
      id: dep.fromActivityId,
      lagDays: dep.lagDays,
    });
    successors.get(dep.fromActivityId)!.push({
      id: dep.toActivityId,
      lagDays: dep.lagDays,
    });
    inDegree.set(dep.toActivityId, (inDegree.get(dep.toActivityId) ?? 0) + 1);
  }

  // Kahn's algorithm
  const queue: string[] = [];
  for (const id of activityIds) {
    if (inDegree.get(id) === 0) queue.push(id);
  }

  const topologicalOrder: string[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    topologicalOrder.push(node);
    for (const succ of successors.get(node) ?? []) {
      const newDegree = (inDegree.get(succ.id) ?? 1) - 1;
      inDegree.set(succ.id, newDegree);
      if (newDegree === 0) queue.push(succ.id);
    }
  }

  if (topologicalOrder.length !== activityIds.length) {
    throw new Error("Dependency cycle detected — cannot compute topological order");
  }

  const roots = activityIds.filter((id) => (predecessors.get(id)?.length ?? 0) === 0);

  return { topologicalOrder, predecessors, successors, roots };
}

// -- Cycle Detection ---------------------------------------------------------

/**
 * Detect a cycle in the dependency graph.
 * Returns the cycle path as an array of activity IDs, or null if no cycle exists.
 */
export function detectCycle(
  activityIds: string[],
  deps: ActivityDependency[]
): string[] | null {
  const idSet = new Set(activityIds);
  const adjacency = new Map<string, string[]>();

  for (const id of activityIds) {
    adjacency.set(id, []);
  }
  for (const dep of deps) {
    if (!idSet.has(dep.fromActivityId) || !idSet.has(dep.toActivityId)) continue;
    if (dep.fromActivityId === dep.toActivityId) continue;
    adjacency.get(dep.fromActivityId)!.push(dep.toActivityId);
  }

  // DFS-based cycle detection
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  const parent = new Map<string, string | null>();

  for (const id of activityIds) {
    color.set(id, WHITE);
    parent.set(id, null);
  }

  for (const startId of activityIds) {
    if (color.get(startId) !== WHITE) continue;

    const stack: string[] = [startId];
    while (stack.length > 0) {
      const node = stack[stack.length - 1]!;
      const nodeColor = color.get(node)!;

      if (nodeColor === WHITE) {
        color.set(node, GRAY);
        for (const neighbor of adjacency.get(node) ?? []) {
          const neighborColor = color.get(neighbor)!;
          if (neighborColor === GRAY) {
            // Found cycle — reconstruct path
            const cycle: string[] = [neighbor];
            let current = node;
            while (current !== neighbor) {
              cycle.push(current);
              current = parent.get(current)!;
            }
            cycle.push(neighbor);
            cycle.reverse();
            return cycle;
          }
          if (neighborColor === WHITE) {
            parent.set(neighbor, node);
            stack.push(neighbor);
          }
        }
      } else {
        // Post-visit
        color.set(node, BLACK);
        stack.pop();
      }
    }
  }

  return null;
}

// -- Validation --------------------------------------------------------------

/**
 * Validate dependencies against a set of activity IDs.
 * Returns an array of validation errors (empty = valid).
 */
export function validateDependencies(
  activityIds: string[],
  deps: ActivityDependency[]
): ValidationError[] {
  const errors: ValidationError[] = [];
  const idSet = new Set(activityIds);
  const seen = new Set<string>();

  for (const dep of deps) {
    // Self-loop
    if (dep.fromActivityId === dep.toActivityId) {
      errors.push({
        type: "self-loop",
        message: `Activity "${dep.fromActivityId}" cannot depend on itself`,
      });
      continue;
    }

    // Missing references
    if (!idSet.has(dep.fromActivityId)) {
      errors.push({
        type: "missing-ref",
        message: `Predecessor "${dep.fromActivityId}" does not exist`,
      });
    }
    if (!idSet.has(dep.toActivityId)) {
      errors.push({
        type: "missing-ref",
        message: `Successor "${dep.toActivityId}" does not exist`,
      });
    }

    // Duplicates
    const key = `${dep.fromActivityId}->${dep.toActivityId}`;
    if (seen.has(key)) {
      errors.push({
        type: "duplicate",
        message: `Duplicate dependency: "${dep.fromActivityId}" → "${dep.toActivityId}"`,
      });
    }
    seen.add(key);
  }

  // Cycle detection (only if no structural errors)
  if (errors.length === 0) {
    const cycle = detectCycle(activityIds, deps);
    if (cycle) {
      errors.push({
        type: "cycle",
        message: `Dependency cycle detected: ${cycle.join(" → ")}`,
      });
    }
  }

  return errors;
}

// -- Critical Path -----------------------------------------------------------

/**
 * Compute the critical path duration using a forward pass in topological order.
 *
 * @param graph - Pre-built dependency graph
 * @param durations - Map of activityId → duration in working days
 * @returns Total project duration (critical path length)
 */
export function computeCriticalPathDuration(
  graph: DependencyGraph,
  durations: Map<string, number>
): number {
  const earlyStart = new Map<string, number>();
  const earlyFinish = new Map<string, number>();

  for (const id of graph.topologicalOrder) {
    const preds = graph.predecessors.get(id) ?? [];
    let es = 0;
    for (const pred of preds) {
      const predFinish = earlyFinish.get(pred.id) ?? 0;
      es = Math.max(es, predFinish + pred.lagDays);
    }
    earlyStart.set(id, es);
    earlyFinish.set(id, es + (durations.get(id) ?? 0));
  }

  let maxFinish = 0;
  for (const ef of earlyFinish.values()) {
    if (ef > maxFinish) maxFinish = ef;
  }

  return maxFinish;
}
