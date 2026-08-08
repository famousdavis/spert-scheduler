// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type {
  Activity,
  ActivityDependency,
  Calendar,
  ConstraintConflict,
  DependencyConflict,
  DeterministicSchedule,
  Milestone,
  ScheduledActivity,
} from "@domain/models/types";
import { advanceToNextWorkingDay, type WorkCalendar } from "@core/calendar/work-calendar";
import { createDistributionForActivity } from "@core/distributions/factory";
import {
  addWorkingDays,
  subtractWorkingDays,
  activityEndDate,
  activityStartDate,
  countWorkingDays,
  formatDateISO,
  parseDateISO,
} from "@core/calendar/calendar";
import { buildDependencyGraph, computeCriticalPathDuration } from "./dependency-graph";
import {
  applyForwardConstraint,
  applyBackwardConstraint,
  detectConstraintConflict,
} from "./constraint-utils";

// -- Shared helper for duration resolution ------------------------------------

/**
 * Resolve the deterministic duration for a single activity at a given percentile.
 *  - Complete with actual → returns actualDuration
 *  - In-progress with elapsed → returns max(elapsed+1, inverseCDF)
 *  - Otherwise → returns max(1, inverseCDF)
 *
 * WHY THE `+1`, since the line above restates the formula without stating the rule.
 * In progress means NOT FINISHED: having observed t elapsed days, the duration is known to
 * be strictly greater than t, so in whole working days it is at least t + 1. The rule is
 * stated in full at the Monte Carlo seam — `truncated.ts:12` — *"we have observed X > t.
 * The correct operator is conditioning, not clamping: sample from X | X > t."* This `+1`
 * is that same statement in the integer-day domain the deterministic schedule works in.
 *
 * ⚠️ It was never cross-referenced here, and the two halves have since diverged. Both
 * arrived together in v0.13.0 (CHANGELOG: *"floors each trial at elapsed + 1"*); v0.49.0
 * replaced the Monte Carlo half with genuine left-truncation, so the line below is now the
 * only IMPLEMENTATION of the elapsed+1 floor in the source (measured 2026-08-07).
 *
 * ⚠️ That is a claim about executable code, NOT a string count — and the distinction is the
 * one this whole audit is about. Grepping `elapsed + 1` / `elapsed+1` / `actualDuration + 1`
 * across `src/**` returns well over a dozen hits, and this comment adds to them. Every hit
 * but one is a doc comment, an inline note, a test name or a changelog string; exactly one
 * computes anything. Do not read the sentence above as a grep result, because it is not.
 *
 * Read `truncated.ts` before changing it; the two must keep agreeing about what "in
 * progress" means.
 *
 * The floor is pinned by `deterministic-oracle.json`'s `z3` — but only since 2026-08-07,
 * and only because that fixture's `actualDuration` makes it BIND. See the warning at
 * `deterministic-oracle.test.ts`'s "completed and in-progress activities" before editing it.
 */
function resolveActivityDuration(activity: Activity, percentile: number): number {
  if (activity.status === "complete" && activity.actualDuration != null) {
    return activity.actualDuration;
  }
  const dist = createDistributionForActivity(activity);
  const base = Math.max(1, Math.ceil(dist.inverseCDF(percentile)));
  if (activity.status === "inProgress" && activity.actualDuration != null) {
    return Math.max(activity.actualDuration + 1, base);
  }
  return base;
}

// -- Sequential scheduling ----------------------------------------------------

/**
 * Compute the deterministic duration for each non-complete activity at a given percentile.
 * Returns an array of durations (minimum 1 working day each), one per non-complete activity.
 *
 * Used as the Parkinson's Law floor in Monte Carlo simulation.
 */
export function computeDeterministicDurations(
  activities: Activity[],
  probabilityTarget: number
): number[] {
  return activities
    .filter((a) => !(a.status === "complete" && a.actualDuration != null))
    .map((a) => resolveActivityDuration(a, probabilityTarget));
}

/**
 * Compute a deterministic schedule for a linear activity chain at a given percentile.
 * Activities are executed in array order (finish-to-start linear chain).
 * Scheduling constraints (SNET, MSO, MFO, FNET) are applied when present.
 *
 * @param activities - Activities in execution order
 * @param startDate - Project start date ("YYYY-MM-DD")
 * @param percentile - Probability target (e.g. 0.85 for P85)
 * @param calendar - Optional calendar with holidays
 */
export function computeDeterministicSchedule(
  activities: Activity[],
  startDate: string,
  percentile: number,
  calendar?: WorkCalendar | Calendar
): DeterministicSchedule {
  const scheduledActivities: ScheduledActivity[] = [];
  const conflicts: ConstraintConflict[] = [];

  let currentDate = parseDateISO(startDate);

  // Ensure start date is a working day
  currentDate = advanceToNextWorkingDay(currentDate, calendar);

  for (const activity of activities) {
    const isActual = activity.status === "complete" && activity.actualDuration != null;
    const duration = resolveActivityDuration(activity, percentile);

    const activityStartDate = currentDate;
    const activityEnd = activityEndDate(activityStartDate, duration, calendar);

    let finalStartISO = formatDateISO(activityStartDate);
    let finalEndISO = formatDateISO(activityEnd);

    // Apply scheduling constraint (forward pass)
    if (activity.constraintType && activity.constraintDate && activity.constraintMode) {
      const result = applyForwardConstraint(
        finalStartISO, finalEndISO, duration,
        activity.constraintType, activity.constraintDate,
        activity.constraintMode, activity.id, activity.name, calendar,
      );
      finalStartISO = result.es;
      finalEndISO = result.ef;
      if (result.conflict) conflicts.push(result.conflict);
    }

    scheduledActivities.push({
      activityId: activity.id,
      name: activity.name,
      duration,
      startDate: finalStartISO,
      endDate: finalEndISO,
      isActual,
    });

    // Next activity starts the working day after this one's (possibly constrained) end
    currentDate = addWorkingDays(parseDateISO(finalEndISO), 1, calendar);
  }

  const lastActivity = scheduledActivities[scheduledActivities.length - 1];
  const totalDuration = scheduledActivities.reduce(
    (sum, a) => sum + a.duration,
    0
  );
  const projectEndISO = lastActivity ? lastActivity.endDate : formatDateISO(currentDate);
  // Inclusive span in the MC duration domain (includes constraint idle). currentDate
  // has been advanced past the last activity by the loop, so use the raw startDate.
  const spanDays = lastActivity
    ? countWorkingDays(parseDateISO(startDate), parseDateISO(projectEndISO), calendar) + 1
    : 0;

  return {
    activities: scheduledActivities,
    totalDurationDays: totalDuration,
    spanDays,
    projectEndDate: projectEndISO,
    constraintConflicts: conflicts.length > 0 ? conflicts : undefined,
  };
}

// -- Per-activity uncertainty computation -------------------------------------

/**
 * Compute per-activity uncertainty: the difference between the duration at
 * the project target and the activity target percentile.
 *
 * Used by the Gantt chart to show split bars (solid = deterministic, hatched = uncertainty).
 *
 * @returns Map of activityId → { solidDays, hatchedDays }
 */
export function computeActivityUncertaintyDays(
  activities: Activity[],
  activityTarget: number,
  projectTarget: number
): Map<string, { solidDays: number; hatchedDays: number }> {
  const result = new Map<string, { solidDays: number; hatchedDays: number }>();

  for (const activity of activities) {
    if (activity.status === "complete") {
      // Complete activities: fixed duration, no uncertainty.
      // Fall back to the deterministic duration when actualDuration is missing
      // so the bar still renders correctly without phantom hatching.
      const solidDays = activity.actualDuration ?? resolveActivityDuration(activity, activityTarget);
      result.set(activity.id, { solidDays, hatchedDays: 0 });
    } else {
      // Planned and in-progress: resolveActivityDuration handles floor logic
      const solidDays = resolveActivityDuration(activity, activityTarget);
      const projectDays = resolveActivityDuration(activity, projectTarget);
      const hatchedDays = Math.max(0, projectDays - solidDays);
      result.set(activity.id, { solidDays, hatchedDays });
    }
  }

  return result;
}

// -- Backward-pass type-dispatch helper (date domain) -------------------------

/**
 * Compute candidate late start date for a predecessor from a single successor.
 * SS: succLS − lag, FF: succLF − (lag + predDuration), FS: succLS − (1 + lag + predDuration).
 */
function computeCandidateLSDate(
  type: string,
  succLSISO: string,
  succLFISO: string,
  lagDays: number,
  predDuration: number,
  calendar?: WorkCalendar | Calendar,
): Date {
  if (type === "SS") {
    const succLS = parseDateISO(succLSISO);
    return lagDays >= 0
      ? subtractWorkingDays(succLS, lagDays, calendar)
      : addWorkingDays(succLS, -lagDays, calendar);
  }
  if (type === "FF") {
    const succLF = parseDateISO(succLFISO);
    const combined = lagDays + predDuration - 1;
    return combined >= 0
      ? subtractWorkingDays(succLF, combined, calendar)
      : addWorkingDays(succLF, -combined, calendar);
  }
  // FS
  const succLS = parseDateISO(succLSISO);
  const combined = lagDays + predDuration;
  return combined >= 0
    ? subtractWorkingDays(succLS, combined, calendar)
    : addWorkingDays(succLS, -combined, calendar);
}

// -- Dependency-aware scheduling ---------------------------------------------

/**
 * Compute deterministic durations as a Map (activityId → days).
 * Used by Monte Carlo dependency simulation as Parkinson's Law floors.
 */
export function computeDependencyDurations(
  activities: Activity[],
  percentile: number
): Map<string, number> {
  const durations = new Map<string, number>();
  for (const activity of activities) {
    durations.set(activity.id, resolveActivityDuration(activity, percentile));
  }
  return durations;
}

/**
 * Compute a deterministic schedule using a dependency graph.
 * Activities are scheduled based on predecessor finish dates (not array order).
 * Activities with no predecessors start on the project start date (in parallel).
 *
 * @param activities - All activities in the scenario
 * @param dependencies - Finish-to-Start dependencies with optional lag
 * @param startDate - Project start date ("YYYY-MM-DD")
 * @param percentile - Probability target (e.g. 0.50 for P50)
 * @param calendar - Optional calendar with holidays
 */

// ---------------------------------------------------------------------------
// Dependency-aware scheduling — decomposed (C4).
//
// computeDependencySchedule measured cognitive complexity 134 as one function.
// It is now seven lifted phases plus a residual that orchestrates them. Behaviour
// is unchanged: the phases were lifted with their bodies intact wherever possible,
// and src/core/schedule/deterministic-oracle.test.ts pins the output of 41 fixtures
// across every dependency type, lag sign, constraint type/mode, milestone floor and
// calendar shape. If that oracle needs regenerating, this refactor is wrong.
//
// The helpers live HERE, in this file, on purpose: stryker.config.mjs lists
// deterministic.ts by exact path, not a glob, so helpers moved to a new module
// would leave the mutation denominator and the score would rise because the code
// stopped being measured rather than because it got safer.
// ---------------------------------------------------------------------------

type Cal = WorkCalendar | Calendar | undefined;
type DepGraph = ReturnType<typeof buildDependencyGraph>;
type Edge = { id: string; type: string; lagDays: number };

// ---------------------------------------------------------------------------
// LIFT 1 — forward pass, split per §3: three per-type candidate helpers behind a
// dispatcher, plus the milestone floor and the local-constraint apply.
// ---------------------------------------------------------------------------

/** SS: read the predecessor's START date, offset = lag (no +1). */
function candidateFromSS(predStart: Date, lagDays: number, projectStart: Date, calendar: Cal): Date {
  if (lagDays >= 0) return addWorkingDays(predStart, lagDays, calendar);
  const candidate = subtractWorkingDays(predStart, -lagDays, calendar);
  return candidate < projectStart ? new Date(projectStart) : candidate;
}

/** FF: constrained EF = pred END + lag, then back-calculate ES. */
function candidateFromFF(
  predEnd: Date, lagDays: number, duration: number, projectStart: Date, calendar: Cal,
): Date {
  const constrainedEF = lagDays >= 0
    ? addWorkingDays(predEnd, lagDays, calendar)
    : subtractWorkingDays(predEnd, -lagDays, calendar);
  const candidate = activityStartDate(constrainedEF, duration, calendar);
  return candidate < projectStart ? new Date(projectStart) : candidate;
}

/** FS: the original behaviour — offset = 1 + lag. */
function candidateFromFS(predEnd: Date, lagDays: number, projectStart: Date, calendar: Cal): Date {
  const offset = 1 + lagDays;
  if (offset >= 0) return addWorkingDays(predEnd, offset, calendar);
  const candidate = subtractWorkingDays(predEnd, -offset, calendar);
  return candidate < projectStart ? new Date(projectStart) : candidate;
}

/** Thin dispatcher, mirroring the shape of the existing computeCandidateLSDate. */
function candidateStartForPred(
  pred: Edge,
  startDates: Map<string, Date>,
  endDates: Map<string, Date>,
  duration: number,
  projectStart: Date,
  calendar: Cal,
): Date {
  if (pred.type === "SS") {
    return candidateFromSS(startDates.get(pred.id)!, pred.lagDays, projectStart, calendar);
  }
  if (pred.type === "FF") {
    return candidateFromFF(endDates.get(pred.id)!, pred.lagDays, duration, projectStart, calendar);
  }
  return candidateFromFS(endDates.get(pred.id)!, pred.lagDays, projectStart, calendar);
}

/** Starts after all predecessors' constraints are satisfied (type-aware). */
function earliestStartFromPreds(
  preds: Edge[],
  startDates: Map<string, Date>,
  endDates: Map<string, Date>,
  duration: number,
  projectStart: Date,
  calendar: Cal,
): Date {
  if (preds.length === 0) return new Date(projectStart);
  let latestDate = new Date(0);
  for (const pred of preds) {
    const candidateStart = candidateStartForPred(pred, startDates, endDates, duration, projectStart, calendar);
    if (candidateStart > latestDate) latestDate = candidateStart;
  }
  return latestDate;
}

/**
 * Apply the startsAtMilestoneId floor.
 *
 * ⚠️ DO NOT NORMALISE `milestoneDate` TO A WORKING DAY HERE. It looks missing and it is not.
 * The caller advances `activityStart` on the line immediately after this returns, and
 * `advanceToNextWorkingDay` is monotonic and idempotent, so for every input
 * `A(max(A(M), S)) === A(max(M, S))` — a snap on this side cannot change the schedule. Proof
 * by cases: M ≥ S collapses by idempotence; M < S with A(M) ≤ S gives A(S) both ways; and
 * M < S < A(M) forces S to be non-working, since no working day lies in [M, A(M)), so
 * A(S) === A(M).
 *
 * It was here from v0.11.0 (`ddc1cff`) until 2026-08-07 — born redundant, in the same commit
 * as the caller's advance and twelve lines from it, so nothing ever superseded it. Its ONLY
 * observable effect was to fail schedules that should have succeeded: it walked from the raw
 * target day-by-day, so a milestone sitting behind a long run of non-working days tripped
 * `advanceToNextWorkingDay`'s 10,000-iteration guard and threw `CalendarConfigurationError`
 * for the entire project — a milestone that had already lost the comparison and could not
 * move anything. Pinned by "a milestone that loses the comparison cannot fail the schedule"
 * in `deterministic.test.ts`; found by mutation D10 in the oracle's falsification spec.
 *
 * ⚠️ NOT the same as `milestone-sim-params.ts:45`, which snaps a milestone target and is
 * load-bearing: its result feeds `countWorkingDays` to produce an OFFSET, with nothing
 * downstream to re-normalise it. Snapping is correct there and redundant here; the two sites
 * are not copies of one rule.
 */
function applyMilestoneFloor(
  activity: Activity, activityStart: Date, milestones: Milestone[] | undefined,
): Date {
  if (!activity.startsAtMilestoneId || !milestones) return activityStart;
  const milestone = milestones.find((m) => m.id === activity.startsAtMilestoneId);
  if (!milestone) return activityStart;
  const milestoneDate = parseDateISO(milestone.targetDate);
  return milestoneDate > activityStart ? milestoneDate : activityStart;
}

/** Apply this activity's own scheduling constraint (forward pass). */
function applyLocalConstraint(
  activity: Activity,
  esNetISO: string,
  efNetISO: string,
  duration: number,
  activityStart: Date,
  activityEnd: Date,
  calendar: Cal,
  // `conflict` is nullable, not optional: applyForwardConstraint returns null when
  // the constraint is satisfied. The caller tests truthiness, so this matches the
  // original inline `if (result.conflict)` exactly rather than normalising to undefined.
): { es: Date; ef: Date; conflict?: ConstraintConflict | null } {
  if (!activity.constraintType || !activity.constraintDate || !activity.constraintMode) {
    return { es: activityStart, ef: activityEnd };
  }
  const result = applyForwardConstraint(
    esNetISO, efNetISO, duration,
    activity.constraintType, activity.constraintDate,
    activity.constraintMode, activity.id, activity.name, calendar,
  );
  return { es: parseDateISO(result.es), ef: parseDateISO(result.ef), conflict: result.conflict };
}

function forwardPass(args: {
  graph: DepGraph;
  activityMap: Map<string, Activity>;
  durationMap: Map<string, number>;
  projectStart: Date;
  calendar: Cal;
  milestones?: Milestone[];
}): {
  startDates: Map<string, Date>;
  endDates: Map<string, Date>;
  networkStart: Map<string, string>;
  networkEnd: Map<string, string>;
  conflicts: ConstraintConflict[];
} {
  const { graph, activityMap, durationMap, projectStart, calendar, milestones } = args;
  const startDates = new Map<string, Date>();    // constrained ES
  const endDates = new Map<string, Date>();      // constrained EF
  const networkStart = new Map<string, string>(); // network ES (ISO)
  const networkEnd = new Map<string, string>();   // network EF (ISO)
  const conflicts: ConstraintConflict[] = [];

  for (const id of graph.topologicalOrder) {
    const activity = activityMap.get(id)!;
    const duration = durationMap.get(id) ?? 1;
    const preds = (graph.predecessors.get(id) ?? []) as Edge[];

    let activityStart = earliestStartFromPreds(preds, startDates, endDates, duration, projectStart, calendar);
    activityStart = applyMilestoneFloor(activity, activityStart, milestones);
    activityStart = advanceToNextWorkingDay(activityStart, calendar); // ensure a working day

    const activityEnd = activityEndDate(activityStart, duration, calendar);

    // Save network dates (before local constraint adjustment)
    const esNetISO = formatDateISO(activityStart);
    const efNetISO = formatDateISO(activityEnd);
    networkStart.set(id, esNetISO);
    networkEnd.set(id, efNetISO);

    const local = applyLocalConstraint(
      activity, esNetISO, efNetISO, duration, activityStart, activityEnd, calendar,
    );
    startDates.set(id, local.es);
    endDates.set(id, local.ef);
    if (local.conflict) conflicts.push(local.conflict);
  }

  return { startDates, endDates, networkStart, networkEnd, conflicts };
}

// ---------------------------------------------------------------------------
// LIFT 2 — backward pass #1 (constraint-adjusted, for display). Verbatim.
// ---------------------------------------------------------------------------

function backwardPassConstrained(args: {
  graph: DepGraph;
  activityMap: Map<string, Activity>;
  durationMap: Map<string, number>;
  projectEndDate: Date;
  calendar: Cal;
}): { lateStartCon: Map<string, string>; lateFinishCon: Map<string, string> } {
  const { graph, activityMap, durationMap, projectEndDate, calendar } = args;
  const lateStartCon = new Map<string, string>();
  const lateFinishCon = new Map<string, string>();

  for (let i = graph.topologicalOrder.length - 1; i >= 0; i--) {
    const id = graph.topologicalOrder[i]!;
    const activity = activityMap.get(id)!;
    const duration = durationMap.get(id) ?? 1;
    const succs = graph.successors.get(id) ?? [];

    let ls: Date;
    if (succs.length === 0) {
      ls = activityStartDate(new Date(projectEndDate), duration, calendar);
    } else {
      ls = new Date(8640000000000000); // max date
      for (const succ of succs) {
        const candidateLS = computeCandidateLSDate(
          succ.type, lateStartCon.get(succ.id)!, lateFinishCon.get(succ.id)!,
          succ.lagDays, duration, calendar,
        );
        if (candidateLS < ls) ls = candidateLS;
      }
    }

    let lf = activityEndDate(ls, duration, calendar);

    // Apply backward constraint adjustment
    if (activity.constraintType && activity.constraintDate && activity.constraintMode) {
      const backResult = applyBackwardConstraint(
        formatDateISO(ls), formatDateISO(lf), duration,
        activity.constraintType, activity.constraintDate,
        activity.constraintMode, calendar,
      );
      ls = parseDateISO(backResult.ls);
      lf = parseDateISO(backResult.lf);
    }

    lateStartCon.set(id, formatDateISO(ls));
    lateFinishCon.set(id, formatDateISO(lf));
  }

  return { lateStartCon, lateFinishCon };
}

// ---------------------------------------------------------------------------
// LIFT 3 — backward pass #2 (network-driven, no constraint adjustments). Verbatim.
// ---------------------------------------------------------------------------

function backwardPassNetwork(args: {
  graph: DepGraph;
  durationMap: Map<string, number>;
  projectEndDate: Date;
  calendar: Cal;
}): { lateStartNet: Map<string, string>; lateFinishNet: Map<string, string> } {
  const { graph, durationMap, projectEndDate, calendar } = args;
  const lateStartNet = new Map<string, string>();
  const lateFinishNet = new Map<string, string>();

  for (let i = graph.topologicalOrder.length - 1; i >= 0; i--) {
    const id = graph.topologicalOrder[i]!;
    const duration = durationMap.get(id) ?? 1;
    const succs = graph.successors.get(id) ?? [];

    let ls: Date;
    if (succs.length === 0) {
      ls = activityStartDate(new Date(projectEndDate), duration, calendar);
    } else {
      ls = new Date(8640000000000000);
      for (const succ of succs) {
        const candidateLS = computeCandidateLSDate(
          succ.type, lateStartNet.get(succ.id)!, lateFinishNet.get(succ.id)!,
          succ.lagDays, duration, calendar,
        );
        if (candidateLS < ls) ls = candidateLS;
      }
    }

    const lf = activityEndDate(ls, duration, calendar);
    lateStartNet.set(id, formatDateISO(ls));
    lateFinishNet.set(id, formatDateISO(lf));
  }

  return { lateStartNet, lateFinishNet };
}

// ---------------------------------------------------------------------------
// LIFT 4 — free float, plus the one gap helper §3's recipe calls for.
// ---------------------------------------------------------------------------

/** Gap from this activity to one successor, in working days, per dependency type. */
function successorGap(
  succ: Edge, predES: Date, predEF: Date, succES: Date, succEF: Date, calendar: Cal,
): number {
  if (succ.type === "SS") return countWorkingDays(predES, succES, calendar) - succ.lagDays;
  if (succ.type === "FF") return countWorkingDays(predEF, succEF, calendar) - succ.lagDays;
  return countWorkingDays(predEF, succES, calendar) - 1 - succ.lagDays; // FS
}

/**
 * Free float = min gap to any successor's early start, in working days.
 * For terminal activities (no successors), free float equals total float.
 */
function computeFreeFloat(args: {
  graph: DepGraph;
  totalFloatMap: Map<string, number>;
  startDates: Map<string, Date>;
  endDates: Map<string, Date>;
  calendar: Cal;
}): Map<string, number> {
  const { graph, totalFloatMap, startDates, endDates, calendar } = args;
  const freeFloatMap = new Map<string, number>();

  for (const id of graph.topologicalOrder) {
    const succs = (graph.successors.get(id) ?? []) as Edge[];
    if (succs.length === 0) {
      freeFloatMap.set(id, totalFloatMap.get(id) ?? 0);
      continue;
    }
    let minGap = Infinity;
    const predES = startDates.get(id)!;
    const predEF = endDates.get(id)!;
    for (const succ of succs) {
      const gap = successorGap(
        succ, predES, predEF, startDates.get(succ.id)!, endDates.get(succ.id)!, calendar,
      );
      if (gap < minGap) minGap = gap;
    }
    freeFloatMap.set(id, Math.max(0, minGap));
  }

  return freeFloatMap;
}

// ---------------------------------------------------------------------------
// LIFT 5 — SNLT/FNLT and soft-constraint conflict detection. Verbatim.
// ---------------------------------------------------------------------------

function detectSoftConflicts(args: {
  graph: DepGraph;
  activityMap: Map<string, Activity>;
  networkStart: Map<string, string>;
  networkEnd: Map<string, string>;
  lateStartNet: Map<string, string>;
  lateFinishNet: Map<string, string>;
  calendar: Cal;
}): ConstraintConflict[] {
  const { graph, activityMap, networkStart, networkEnd, lateStartNet, lateFinishNet, calendar } = args;
  const found: ConstraintConflict[] = [];

  for (const id of graph.topologicalOrder) {
    const activity = activityMap.get(id)!;
    if (!activity.constraintType || !activity.constraintDate || !activity.constraintMode) continue;

    const conflict = detectConstraintConflict(
      networkStart.get(id)!, networkEnd.get(id)!,
      lateStartNet.get(id)!, lateFinishNet.get(id)!,
      activity.constraintType, activity.constraintDate,
      activity.constraintMode, activity.id, activity.name, calendar,
    );
    if (conflict) found.push(conflict);
  }

  return found;
}

// ---------------------------------------------------------------------------
// LIFT 6 — post-pass dependency constraint validation. Verbatim.
// ---------------------------------------------------------------------------

function validateDependencies(args: {
  dependencies: ActivityDependency[];
  startDates: Map<string, Date>;
  endDates: Map<string, Date>;
  activityMap: Map<string, Activity>;
  calendar: Cal;
}): DependencyConflict[] {
  const { dependencies, startDates, endDates, activityMap, calendar } = args;
  const dependencyConflicts: DependencyConflict[] = [];

  function computeRequired(baseDate: Date, offset: number): Date {
    return offset >= 0
      ? addWorkingDays(baseDate, offset, calendar)
      : subtractWorkingDays(baseDate, -offset, calendar);
  }

  for (const dep of dependencies) {
    const succES = startDates.get(dep.toActivityId);
    const succEF = endDates.get(dep.toActivityId);
    const predES = startDates.get(dep.fromActivityId);
    const predEF = endDates.get(dep.fromActivityId);
    if (!succES || !succEF || !predES || !predEF) continue;

    let violated = false;
    if (dep.type === "FS") {
      const required = computeRequired(predEF, 1 + dep.lagDays);
      violated = succES < required;
    } else if (dep.type === "SS") {
      const required = computeRequired(predES, dep.lagDays);
      violated = succES < required;
    } else if (dep.type === "FF") {
      const required = computeRequired(predEF, dep.lagDays);
      violated = succEF < required;
    }

    if (violated) {
      const fromName = activityMap.get(dep.fromActivityId)?.name ?? "";
      const toName = activityMap.get(dep.toActivityId)?.name ?? "";
      dependencyConflicts.push({
        type: "dependency-violation",
        fromActivityId: dep.fromActivityId,
        fromActivityName: fromName,
        toActivityId: dep.toActivityId,
        toActivityName: toName,
        dependencyType: dep.type,
        lagDays: dep.lagDays,
        severity: "warning",
        message: `${dep.type} constraint violated: ${toName} does not satisfy ${dep.type} relationship with ${fromName}`,
      });
    }
  }

  return dependencyConflicts;
}

// ---------------------------------------------------------------------------
// LIFT 7 — result assembly. Verbatim.
// ---------------------------------------------------------------------------

function buildScheduleResult(args: {
  graph: DepGraph;
  activityMap: Map<string, Activity>;
  durationMap: Map<string, number>;
  startDates: Map<string, Date>;
  endDates: Map<string, Date>;
  lateStartCon: Map<string, string>;
  lateFinishCon: Map<string, string>;
  lateStartNet: Map<string, string>;
  lateFinishNet: Map<string, string>;
  totalFloatMap: Map<string, number>;
  freeFloatMap: Map<string, number>;
  projectStart: Date;
  projectEndISO: string;
  calendar: Cal;
}): { scheduledActivities: ScheduledActivity[]; totalDurationDays: number; spanDays: number } {
  const {
    graph, activityMap, durationMap, startDates, endDates,
    lateStartCon, lateFinishCon, lateStartNet, lateFinishNet,
    totalFloatMap, freeFloatMap, projectStart, projectEndISO, calendar,
  } = args;

  const scheduledActivities: ScheduledActivity[] = [];
  for (const id of graph.topologicalOrder) {
    const activity = activityMap.get(id)!;
    const duration = durationMap.get(id) ?? 1;
    const isActual = activity.status === "complete" && activity.actualDuration != null;

    scheduledActivities.push({
      activityId: id,
      name: activity.name,
      duration,
      startDate: formatDateISO(startDates.get(id)!),
      endDate: formatDateISO(endDates.get(id)!),
      isActual,
      lateStart: lateStartCon.get(id),
      lateFinish: lateFinishCon.get(id),
      lateStartNet: lateStartNet.get(id),
      lateFinishNet: lateFinishNet.get(id),
      totalFloat: totalFloatMap.get(id),
      freeFloat: freeFloatMap.get(id),
    });
  }

  // Total duration is the critical path length (consistent with Monte Carlo computation)
  const totalDurationDays = computeCriticalPathDuration(graph, durationMap);
  // Inclusive span in the MC duration domain: project start → constraint/milestone-
  // adjusted end. projectStart is the advanced start (never mutated after line ~260).
  const spanDays = scheduledActivities.length > 0
    ? countWorkingDays(projectStart, parseDateISO(projectEndISO), calendar) + 1
    : 0;

  return { scheduledActivities, totalDurationDays, spanDays };
}

export function computeDependencySchedule(
  activities: Activity[],
  dependencies: ActivityDependency[],
  startDate: string,
  percentile: number,
  calendar?: WorkCalendar | Calendar,
  milestones?: Milestone[]
): DeterministicSchedule {
  const graph = buildDependencyGraph(
    activities.map((a) => a.id),
    dependencies
  );
  const durationMap = computeDependencyDurations(activities, percentile);
  const activityMap = new Map(activities.map((a) => [a.id, a]));

  let projectStart = parseDateISO(startDate);
  projectStart = advanceToNextWorkingDay(projectStart, calendar);

  const { startDates, endDates, networkStart, networkEnd, conflicts } = forwardPass({
    graph, activityMap, durationMap, projectStart, calendar, milestones,
  });

  // Project end is the latest constrained end date
  let projectEndDate = projectStart;
  for (const endDate of endDates.values()) {
    if (endDate > projectEndDate) projectEndDate = endDate;
  }
  const projectEndISO = formatDateISO(projectEndDate);

  const { lateStartCon, lateFinishCon } = backwardPassConstrained({
    graph, activityMap, durationMap, projectEndDate, calendar,
  });
  const { lateStartNet, lateFinishNet } = backwardPassNetwork({
    graph, durationMap, projectEndDate, calendar,
  });

  const totalFloatMap = new Map<string, number>();
  for (const id of graph.topologicalOrder) {
    const esDate = parseDateISO(networkStart.get(id)!);
    const lsDate = parseDateISO(lateStartNet.get(id)!);
    totalFloatMap.set(id, countWorkingDays(esDate, lsDate, calendar));
  }

  const freeFloatMap = computeFreeFloat({
    graph, totalFloatMap, startDates, endDates, calendar,
  });

  conflicts.push(...detectSoftConflicts({
    graph, activityMap, networkStart, networkEnd, lateStartNet, lateFinishNet, calendar,
  }));

  const dependencyConflicts = validateDependencies({
    dependencies, startDates, endDates, activityMap, calendar,
  });

  const { scheduledActivities, totalDurationDays, spanDays } = buildScheduleResult({
    graph, activityMap, durationMap, startDates, endDates,
    lateStartCon, lateFinishCon, lateStartNet, lateFinishNet,
    totalFloatMap, freeFloatMap, projectStart, projectEndISO, calendar,
  });

  return {
    activities: scheduledActivities,
    totalDurationDays,
    spanDays,
    projectEndDate: projectEndISO,
    constraintConflicts: conflicts.length > 0 ? conflicts : undefined,
    dependencyConflicts: dependencyConflicts.length > 0 ? dependencyConflicts : undefined,
  };
}
