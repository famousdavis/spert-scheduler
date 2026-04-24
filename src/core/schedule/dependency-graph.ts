// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

/**
 * Dependency graph utilities for activity scheduling.
 * Pure functions, zero framework dependencies.
 *
 * Uses Kahn's algorithm (iterative BFS) for topological sorting.
 * Critical path computed via forward pass in topological order.
 */

import type { ActivityDependency, ConstraintType, ConstraintMode, DependencyType } from "@domain/models/types";
import { applyForwardConstraintInt } from "./constraint-utils";

// -- Types -------------------------------------------------------------------

type EdgeRef = { id: string; lagDays: number; type: DependencyType };

export interface DependencyGraph {
  /** Activity IDs in topological order (predecessors before successors) */
  topologicalOrder: string[];
  /** Map: activityId → list of predecessor { id, lagDays, type } */
  predecessors: Map<string, EdgeRef[]>;
  /** Map: activityId → list of successor { id, lagDays, type } */
  successors: Map<string, EdgeRef[]>;
  /** Activity IDs with no predecessors */
  roots: string[];
}

export interface ValidationError {
  type: "self-loop" | "missing-ref" | "duplicate" | "cycle";
  message: string;
}

// -- Build Graph -------------------------------------------------------------

function populateAdjacency(
  deps: ActivityDependency[],
  idSet: Set<string>,
  predecessors: Map<string, EdgeRef[]>,
  successors: Map<string, EdgeRef[]>,
  inDegree: Map<string, number>,
): void {
  for (const dep of deps) {
    if (!idSet.has(dep.fromActivityId) || !idSet.has(dep.toActivityId)) continue;
    if (dep.fromActivityId === dep.toActivityId) continue;

    predecessors.get(dep.toActivityId)!.push({
      id: dep.fromActivityId,
      lagDays: dep.lagDays,
      type: dep.type,
    });
    successors.get(dep.fromActivityId)!.push({
      id: dep.toActivityId,
      lagDays: dep.lagDays,
      type: dep.type,
    });
    inDegree.set(dep.toActivityId, (inDegree.get(dep.toActivityId) ?? 0) + 1);
  }
}

function kahnTopoSort(
  activityIds: string[],
  successors: Map<string, EdgeRef[]>,
  inDegree: Map<string, number>,
): string[] {
  const queue: string[] = [];
  for (const id of activityIds) {
    if (inDegree.get(id) === 0) queue.push(id);
  }

  const order: string[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    order.push(node);
    for (const succ of successors.get(node) ?? []) {
      const newDegree = (inDegree.get(succ.id) ?? 1) - 1;
      inDegree.set(succ.id, newDegree);
      if (newDegree === 0) queue.push(succ.id);
    }
  }
  return order;
}

/**
 * Build a dependency graph from activity IDs and dependencies.
 * Throws on cycle detection — use `detectCycle` first if you need a softer check.
 */
export function buildDependencyGraph(
  activityIds: string[],
  deps: ActivityDependency[]
): DependencyGraph {
  const idSet = new Set(activityIds);
  const predecessors = new Map<string, EdgeRef[]>();
  const successors = new Map<string, EdgeRef[]>();
  const inDegree = new Map<string, number>();

  for (const id of activityIds) {
    predecessors.set(id, []);
    successors.set(id, []);
    inDegree.set(id, 0);
  }

  populateAdjacency(deps, idSet, predecessors, successors, inDegree);

  const topologicalOrder = kahnTopoSort(activityIds, successors, inDegree);

  if (topologicalOrder.length !== activityIds.length) {
    throw new Error("Dependency cycle detected — cannot compute topological order");
  }

  const roots = activityIds.filter((id) => (predecessors.get(id)?.length ?? 0) === 0);

  return { topologicalOrder, predecessors, successors, roots };
}

// -- Cycle Detection ---------------------------------------------------------

const WHITE = 0, GRAY = 1, BLACK = 2;

function buildAdjacencyForCycle(
  activityIds: string[],
  deps: ActivityDependency[],
): Map<string, string[]> {
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
  return adjacency;
}

function reconstructCyclePath(
  cycleStart: string,
  fromNode: string,
  parent: Map<string, string | null>,
): string[] {
  const cycle: string[] = [cycleStart];
  let current = fromNode;
  while (current !== cycleStart) {
    cycle.push(current);
    current = parent.get(current)!;
  }
  cycle.push(cycleStart);
  cycle.reverse();
  return cycle;
}

function findCycleFrom(
  startId: string,
  adjacency: Map<string, string[]>,
  color: Map<string, number>,
  parent: Map<string, string | null>,
): string[] | null {
  const stack: string[] = [startId];
  while (stack.length > 0) {
    const node = stack[stack.length - 1]!;
    const nodeColor = color.get(node)!;

    if (nodeColor !== WHITE) {
      color.set(node, BLACK);
      stack.pop();
      continue;
    }

    color.set(node, GRAY);
    for (const neighbor of adjacency.get(node) ?? []) {
      const neighborColor = color.get(neighbor)!;
      if (neighborColor === GRAY) {
        return reconstructCyclePath(neighbor, node, parent);
      }
      if (neighborColor === WHITE) {
        parent.set(neighbor, node);
        stack.push(neighbor);
      }
    }
  }
  return null;
}

/**
 * Detect a cycle in the dependency graph.
 * Returns the cycle path as an array of activity IDs, or null if no cycle exists.
 */
export function detectCycle(
  activityIds: string[],
  deps: ActivityDependency[]
): string[] | null {
  const adjacency = buildAdjacencyForCycle(activityIds, deps);

  const color = new Map<string, number>();
  const parent = new Map<string, string | null>();
  for (const id of activityIds) {
    color.set(id, WHITE);
    parent.set(id, null);
  }

  for (const startId of activityIds) {
    if (color.get(startId) !== WHITE) continue;
    const cycle = findCycleFrom(startId, adjacency, color, parent);
    if (cycle) return cycle;
  }

  return null;
}

// -- Validation --------------------------------------------------------------

function validateDepStructure(
  dep: ActivityDependency,
  idSet: Set<string>,
  seen: Set<string>,
  errors: ValidationError[],
): void {
  if (dep.fromActivityId === dep.toActivityId) {
    errors.push({
      type: "self-loop",
      message: `Activity "${dep.fromActivityId}" cannot depend on itself`,
    });
    return;
  }

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

  const key = `${dep.fromActivityId}->${dep.toActivityId}`;
  if (seen.has(key)) {
    errors.push({
      type: "duplicate",
      message: `Duplicate dependency: "${dep.fromActivityId}" → "${dep.toActivityId}"`,
    });
  }
  seen.add(key);
}

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
    validateDepStructure(dep, idSet, seen, errors);
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

// -- Type-dispatch helpers (integer domain) -----------------------------------

/**
 * Compute candidate early start for a successor from a single predecessor.
 * SS: predES + lag, FF: predEF + lag − succDuration, FS: predEF + lag.
 */
function computeEarlyStartFromPred(
  type: DependencyType,
  predES: number,
  predEF: number,
  lagDays: number,
  succDuration: number,
): number {
  if (type === "SS") return predES + lagDays;
  if (type === "FF") return predEF + lagDays - succDuration;
  return predEF + lagDays; // FS
}

/**
 * Compute candidate late start for a predecessor from a single successor.
 * SS: succLS − lag, FF: succLF − lag − predDuration, FS: succLS − lag − predDuration.
 */
function computeLateStartFromSucc(
  type: DependencyType,
  succLS: number,
  succLF: number,
  lagDays: number,
  predDuration: number,
): number {
  if (type === "SS") return succLS - lagDays;
  if (type === "FF") return succLF - lagDays - predDuration;
  return succLS - lagDays - predDuration; // FS
}

// -- Forward / Backward Pass primitives --------------------------------------

interface ForwardPassResult {
  earlyStart: Map<string, number>;
  earlyFinish: Map<string, number>;
  maxFinish: number;
}

function computeEarlyStartForActivity(
  dur: number,
  preds: EdgeRef[],
  earlyStart: Map<string, number>,
  earlyFinish: Map<string, number>,
): number {
  let es = 0;
  for (const pred of preds) {
    const predES = earlyStart.get(pred.id) ?? 0;
    const predEF = earlyFinish.get(pred.id) ?? 0;
    es = Math.max(es, computeEarlyStartFromPred(pred.type, predES, predEF, pred.lagDays, dur));
  }
  return Math.max(0, es); // Floor to project start
}

function runForwardPass(
  graph: DependencyGraph,
  durations: Map<string, number>,
): ForwardPassResult {
  const earlyStart = new Map<string, number>();
  const earlyFinish = new Map<string, number>();

  for (const id of graph.topologicalOrder) {
    const dur = durations.get(id) ?? 0;
    const preds = graph.predecessors.get(id) ?? [];
    const es = computeEarlyStartForActivity(dur, preds, earlyStart, earlyFinish);
    earlyStart.set(id, es);
    earlyFinish.set(id, es + dur);
  }

  let maxFinish = 0;
  for (const ef of earlyFinish.values()) {
    if (ef > maxFinish) maxFinish = ef;
  }

  return { earlyStart, earlyFinish, maxFinish };
}

function computeLateStartForActivity(
  dur: number,
  succs: EdgeRef[],
  maxFinish: number,
  lateStart: Map<string, number>,
  lateFinish: Map<string, number>,
): number {
  if (succs.length === 0) {
    return maxFinish - dur;
  }
  let ls = Infinity;
  for (const succ of succs) {
    const succLS = lateStart.get(succ.id) ?? maxFinish;
    const succLF = lateFinish.get(succ.id) ?? maxFinish;
    ls = Math.min(ls, computeLateStartFromSucc(succ.type, succLS, succLF, succ.lagDays, dur));
  }
  return ls;
}

function runBackwardPass(
  graph: DependencyGraph,
  durations: Map<string, number>,
  maxFinish: number,
): { lateStart: Map<string, number> } {
  const lateStart = new Map<string, number>();
  const lateFinish = new Map<string, number>();

  for (let i = graph.topologicalOrder.length - 1; i >= 0; i--) {
    const id = graph.topologicalOrder[i]!;
    const dur = durations.get(id) ?? 0;
    const succs = graph.successors.get(id) ?? [];
    const ls = computeLateStartForActivity(dur, succs, maxFinish, lateStart, lateFinish);
    lateStart.set(id, ls);
    lateFinish.set(id, ls + dur);
  }

  return { lateStart };
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
  return runForwardPass(graph, durations).maxFinish;
}

// -- Critical Path Activities -------------------------------------------------

export interface CriticalPathResult {
  /** Set of activity IDs on the critical path (total float === 0) */
  criticalActivityIds: Set<string>;
  /** Total project duration (same as computeCriticalPathDuration) */
  projectDuration: number;
}

/**
 * Compute which activities are on the critical path using forward + backward pass.
 *
 * Forward pass: Early Start (ES), Early Finish (EF) per activity.
 * Backward pass: Late Finish (LF), Late Start (LS) per activity.
 * Total Float = LS - ES. Activities with float === 0 are critical.
 *
 * @param graph - Pre-built dependency graph
 * @param durations - Map of activityId → duration in working days
 * @returns Set of critical activity IDs and total project duration
 */
export function computeCriticalPathActivities(
  graph: DependencyGraph,
  durations: Map<string, number>
): CriticalPathResult {
  if (graph.topologicalOrder.length === 0) {
    return { criticalActivityIds: new Set(), projectDuration: 0 };
  }

  const { earlyStart, maxFinish } = runForwardPass(graph, durations);
  const { lateStart } = runBackwardPass(graph, durations, maxFinish);

  const criticalActivityIds = new Set<string>();
  for (const id of graph.topologicalOrder) {
    const totalFloat = (lateStart.get(id) ?? 0) - (earlyStart.get(id) ?? 0);
    if (totalFloat === 0) {
      criticalActivityIds.add(id);
    }
  }

  return { criticalActivityIds, projectDuration: maxFinish };
}

// -- Milestone-aware critical path -------------------------------------------

interface MilestoneActivityState {
  es: number;
  ef: number;
  maxPredEF: number;
}

function computeActivityScheduleWithMilestone(
  id: string,
  dur: number,
  preds: EdgeRef[],
  earlyStart: Map<string, number>,
  earlyFinish: Map<string, number>,
  activityEarliestStart?: Map<string, number>,
): MilestoneActivityState {
  let es = 0;
  let maxPredEF = 0;
  for (const pred of preds) {
    const predES = earlyStart.get(pred.id) ?? 0;
    const predEF = earlyFinish.get(pred.id) ?? 0;
    maxPredEF = Math.max(maxPredEF, predEF);
    es = Math.max(es, computeEarlyStartFromPred(pred.type, predES, predEF, pred.lagDays, dur));
  }
  es = Math.max(0, es); // Floor to project start

  if (activityEarliestStart) {
    const floor = activityEarliestStart.get(id);
    if (floor !== undefined && floor > es) {
      es = floor;
    }
  }

  return { es, ef: es + dur, maxPredEF };
}

function applyHardConstraintIfPresent(
  state: MilestoneActivityState,
  dur: number,
  constraint: { type: string; offsetFromStart: number; mode: string } | undefined,
): MilestoneActivityState {
  if (!constraint || constraint.mode !== "hard") return state;
  const result = applyForwardConstraintInt(
    state.es, state.ef, dur,
    constraint.type as ConstraintType,
    constraint.offsetFromStart,
    constraint.mode as ConstraintMode,
    state.maxPredEF,
  );
  return { es: result.es, ef: result.ef, maxPredEF: state.maxPredEF };
}

function computeMilestoneDurations(
  milestoneActivityIds: Map<string, string[]>,
  earlyFinish: Map<string, number>,
): Map<string, number> {
  const milestoneDurations = new Map<string, number>();
  for (const [milestoneId, actIds] of milestoneActivityIds) {
    let maxFinish = 0;
    for (const actId of actIds) {
      const ef = earlyFinish.get(actId) ?? 0;
      if (ef > maxFinish) maxFinish = ef;
    }
    milestoneDurations.set(milestoneId, maxFinish);
  }
  return milestoneDurations;
}

/**
 * Compute critical path duration with per-milestone tracking and earliest-start constraints.
 *
 * Same forward pass as computeCriticalPathDuration but:
 * - Applies activityEarliestStart floor to each activity's early start (for startsAtMilestoneId)
 * - Computes max(earlyFinish) for each milestone's activity set
 *
 * @param graph - Pre-built dependency graph
 * @param durations - Map of activityId → duration in working days
 * @param milestoneActivityIds - Map of milestoneId → list of activity IDs assigned to that milestone
 * @param activityEarliestStart - Map of activityId → earliest start offset (working days from project start)
 * @returns Project duration and per-milestone durations
 */
export function computeCriticalPathWithMilestones(
  graph: DependencyGraph,
  durations: Map<string, number>,
  milestoneActivityIds: Map<string, string[]>,
  activityEarliestStart?: Map<string, number>,
  constraintMap?: Map<string, { type: string; offsetFromStart: number; mode: string }>,
): { projectDuration: number; milestoneDurations: Map<string, number> } {
  const earlyStart = new Map<string, number>();
  const earlyFinish = new Map<string, number>();

  for (const id of graph.topologicalOrder) {
    const dur = durations.get(id) ?? 0;
    const preds = graph.predecessors.get(id) ?? [];
    let state = computeActivityScheduleWithMilestone(
      id, dur, preds, earlyStart, earlyFinish, activityEarliestStart,
    );
    state = applyHardConstraintIfPresent(state, dur, constraintMap?.get(id));
    earlyStart.set(id, state.es);
    earlyFinish.set(id, state.ef);
  }

  let projectDuration = 0;
  for (const ef of earlyFinish.values()) {
    if (ef > projectDuration) projectDuration = ef;
  }

  const milestoneDurations = computeMilestoneDurations(milestoneActivityIds, earlyFinish);

  return { projectDuration, milestoneDurations };
}
