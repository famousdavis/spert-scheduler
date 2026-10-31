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
  DataDateProgressNote,
  ProgressNote,
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
import {
  buildDependencyGraph,
  computeCriticalPathDuration,
  computeCriticalPathWithMilestones,
} from "./dependency-graph";
import {
  detectConstraintNotes,
  detectProgressNotes,
  detectStartDateNotes,
  dataDateFloorOffsets,
  ffRequiredFinish,
  floorsAtDataDate,
  hasRecordedFinish,
  linkKey,
  overtakenLinks,
  placeRecordedRow,
  recordExplains,
  recordSetsConstraintAside,
  recordedFlags,
  resolveDataDate,
  resolveRecordedProgress,
  setAsideLinks,
  type DataDateFloor,
  type ProgressPair,
  type RecordedPin,
  type RecordedProgress,
} from "./recorded-progress";
import { nameOrUnnamed } from "@domain/helpers/display-name";
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
  // WI-137: a Complete row counted from its recorded dates is done too, as the simulation reads it.
  return activities
    .filter((a) => !(a.status === "complete" && (a.actualDuration != null || hasRecordedFinish(a))))
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
 * @param dataDate - WI-154: no Planned row starts before it ("YYYY-MM-DD"); omitted, no floor
 */
export function computeDeterministicSchedule(
  activities: Activity[],
  startDate: string,
  percentile: number,
  calendar?: WorkCalendar | Calendar,
  dataDate?: string,
): DeterministicSchedule {
  const scheduledActivities: ScheduledActivity[] = [];
  const conflicts: ConstraintConflict[] = [];

  let currentDate = parseDateISO(startDate);
  // WI-137: rows with a recorded start. Empty for every project a v25 build wrote.
  const records = resolveRecordedProgress(activities, startDate, calendar);
  // WI-154: the data date, or undefined — then every row is placed exactly as before.
  const floor = resolveDataDate(dataDate, startDate, calendar);
  const flooredFrom = new Map<string, string>();
  const held = new Set<string>();
  // WI-154 (E1): a started row is not held by a row above it that has not started.
  const setAside = setAsideLinks(sequentialPairs(activities), new Map(activities.map((a) => [a.id, a])), !!floor);

  // Ensure start date is a working day
  currentDate = advanceToNextWorkingDay(currentDate, calendar);
  // E1: where a started row goes when the row above it has not started — after the last started row.
  let afterStarted = currentDate;

  for (const [i, activity] of activities.entries()) {
    const from = heldByRowAbove(activities, i, setAside) ? currentDate : afterStarted;
    const at = dataDateStart(activity, from, floor);
    if (at !== from) flooredFrom.set(activity.id, formatDateISO(from));
    const placed = placeSequentialRow(activity, records.get(activity.id), at, percentile, calendar, floor);
    if (placed.conflict) conflicts.push(placed.conflict);
    if (placed.conflict?.passed) held.add(activity.id);
    scheduledActivities.push(placed.row);

    // Next activity starts the working day after this one's (possibly constrained) end
    currentDate = addWorkingDays(parseDateISO(placed.row.endDate), 1, calendar);
    if (!floorsAtDataDate(activity)) afterStarted = currentDate;
  }

  const lastActivity = scheduledActivities[scheduledActivities.length - 1];
  const { totalDuration, projectEndISO, notes } = sequentialTotals(
    activities, scheduledActivities, records, formatDateISO(currentDate), calendar, floor, setAside,
  );
  notes.push(...dataDateNotes(activities, flooredFrom, scheduledActivities, held, floor));
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
    ...(notes.length > 0 ? { progressNotes: notes } : {}),
  };
}

/**
 * One row of the sequential schedule: in turn after the row above, or — WI-137 — at its recorded
 * start (`placeRecordedRow`: a start constraint set aside, an In Progress row's finish constraint
 * still applied).
 */
function placeSequentialRow(
  activity: Activity,
  rec: RecordedProgress | undefined,
  currentDate: Date,
  percentile: number,
  calendar: Cal,
  floor: DataDateFloor | undefined,
): { row: ScheduledActivity; conflict: ConstraintConflict | null } {
  let duration = rec?.duration ?? resolveActivityDuration(activity, percentile);
  let startISO = formatDateISO(currentDate);
  let endISO = formatDateISO(activityEndDate(currentDate, duration, calendar));
  let conflict: ConstraintConflict | null = null;

  if (rec) {
    const placed = placeRecordedRow({ activity, rec, duration, ffFinishes: [], calendar });
    startISO = formatDateISO(placed.es);
    endISO = formatDateISO(placed.ef);
    duration = placed.duration;
    conflict = placed.conflict;
  } else if (activity.constraintType && activity.constraintDate && activity.constraintMode) {
    // Apply scheduling constraint (forward pass)
    const result = applyForwardConstraint(
      startISO, endISO, duration,
      activity.constraintType, activity.constraintDate,
      activity.constraintMode, activity.id, activity.name, calendar,
    );
    const held = holdAtDataDate(activity, parseDateISO(result.es), result, currentDate, duration, floor, calendar);
    startISO = formatDateISO(held.es);
    endISO = formatDateISO(held.ef);
    conflict = held.conflict;
  }
  return {
    row: {
      activityId: activity.id,
      name: activity.name,
      duration,
      startDate: startISO,
      endDate: endISO,
      isActual: isCompleteActual(activity, rec),
      ...recordedFlags(rec),
    },
    conflict,
  };
}

/** Totals: with no record, the sum and the last row's end, exactly as before WI-137. */
function sequentialTotals(
  activities: Activity[],
  scheduled: ScheduledActivity[],
  records: Map<string, RecordedProgress>,
  afterLastISO: string,
  calendar: Cal,
  floor: DataDateFloor | undefined,
  setAside: ReadonlySet<string>,
): { totalDuration: number; projectEndISO: string; notes: ProgressNote[] } {
  if (records.size > 0 || floor) return summariseSequentialRecords(activities, scheduled, records, calendar, floor, setAside);
  const last = scheduled[scheduled.length - 1];
  return {
    totalDuration: scheduled.reduce((sum, a) => sum + a.duration, 0),
    projectEndISO: last ? last.endDate : afterLastISO,
    notes: [],
  };
}

/** WI-137: a Complete row's count is its record's when its dates are recorded. */
function isCompleteActual(activity: Activity, rec: RecordedProgress | undefined): boolean {
  return activity.status === "complete" && (activity.actualDuration != null || rec?.duration !== undefined);
}

/**
 * WI-137, dependencies off, only when a row has a record: the project ends when its LAST-ENDING row
 * ends (a recorded start can sit before the row above ends), the work-content duration follows the
 * recorded starts, and each recorded start earlier than the row above's finish gets a note.
 */
function summariseSequentialRecords(
  activities: Activity[],
  scheduled: ScheduledActivity[],
  records: Map<string, RecordedProgress>,
  calendar: Cal,
  floor: DataDateFloor | undefined,
  setAside: ReadonlySet<string>,
): { totalDuration: number; projectEndISO: string; notes: ProgressNote[] } {
  let pos = 0;
  let maxEnd = 0;
  let endISO = scheduled[0]!.endDate;
  // WI-154: a Planned row starts no earlier than the data date's offset, and (E1) a started row
  // whose row above has not started goes after the last started row, as the date loop places it.
  const floors = dataDateFloorOffsets(activities, floor?.offset);
  let afterStarted = 0;
  for (let i = 0; i < scheduled.length; i++) {
    const id = scheduled[i]!.activityId;
    const rec = records.get(id);
    if (!heldByRowAbove(activities, i, setAside)) pos = afterStarted;
    if (rec) pos = rec.startOffset;
    pos = Math.max(pos, floors?.get(id) ?? 0);
    pos += scheduled[i]!.duration;
    if (!floors?.has(id)) afterStarted = pos;
    if (pos > maxEnd) maxEnd = pos;
    if (scheduled[i]!.endDate > endISO) endISO = scheduled[i]!.endDate;
  }
  const notes = allProgressNotes({
    pairs: sequentialPairs(activities),
    records,
    startDates: new Map(scheduled.map((sa) => [sa.activityId, parseDateISO(sa.startDate)])),
    endDates: new Map(scheduled.map((sa) => [sa.activityId, parseDateISO(sa.endDate)])),
    activityMap: new Map(activities.map((a) => [a.id, a])),
    calendar,
    sequential: true,
    setAside,
  });
  return { totalDuration: maxEnd, projectEndISO: endISO, notes };
}

/** Dependencies off: does the row above hold this row? Not when E1 sets their pair aside (WI-154). */
function heldByRowAbove(activities: Activity[], i: number, setAside: ReadonlySet<string>): boolean {
  return i === 0 || !setAside.has(linkKey(activities[i - 1]!.id, activities[i]!.id, "FS"));
}

/** Dependencies off: each row and the row above it, as a finish-to-start pair. */
function sequentialPairs(activities: Activity[]): ProgressPair[] {
  return activities.slice(1).map((a, i) => ({ fromId: activities[i]!.id, toId: a.id, type: "FS" as const, lagDays: 0 }));
}

/** WI-137: every neutral note — links overtaken, constraints set aside, starts before the Start Date. */
function allProgressNotes(args: Parameters<typeof detectProgressNotes>[0]): ProgressNote[] {
  return [
    ...detectProgressNotes(args),
    ...detectConstraintNotes(args),
    ...detectStartDateNotes(args.records, args.activityMap),
  ];
}

// -- WI-154: the data date in the date domain ------------------------------------

/** A not-started row's start: never before the data date. Any other row, as given. */
function dataDateStart(activity: Activity, start: Date, floor: DataDateFloor | undefined): Date {
  return floor && floorsAtDataDate(activity) && start < floor.date ? new Date(floor.date) : start;
}

/**
 * After the row's own constraint: a hard Must Start On or Must Finish On whose date has passed would
 * pull a not-started row back into days that have passed. The schedule starts it instead where it
 * would start with no constraint — `networkStart`, the later of the data date and what its links (or
 * the row above) allow, as the simulation does (owner, R639, decision 2) — and the red conflict the
 * constraint raised is reworded to say so.
 */
function holdAtDataDate(
  activity: Activity, es: Date, result: { ef: string | Date; conflict?: ConstraintConflict | null },
  networkStart: Date, duration: number, floor: DataDateFloor | undefined, calendar: Cal,
): { es: Date; ef: Date; conflict: ConstraintConflict | null } {
  const ef = typeof result.ef === "string" ? parseDateISO(result.ef) : result.ef;
  const conflict = result.conflict ?? null;
  if (!floor || !floorsAtDataDate(activity) || es >= floor.date) return { es, ef, conflict };
  const end = activityEndDate(networkStart, duration, calendar);
  return { es: new Date(networkStart), ef: end, conflict: conflict && passedConstraint(conflict, networkStart, end, floor) };
}

/**
 * "today, 2026-10-27", "on 2026-11-02, the next working day", or "on 2026-11-10" — `mid`: the words
 * go on, so an appositive is closed with a comma.
 */
function startWords(start: Date, floor: DataDateFloor, mid = false): string {
  const iso = formatDateISO(start);
  if (start.getTime() !== floor.date.getTime()) return `on ${iso}`;
  const words = iso === floor.today ? `today, ${iso}` : `on ${iso}, the next working day`;
  return mid ? `${words},` : words;
}

/**
 * The conflict's words once the row is held: the date has passed, and the row has not started — no
 * "data date" (Review 35, verification W1), and no "held", which it is not (interactions E4).
 */
function passedConstraint(c: ConstraintConflict, start: Date, end: Date, floor: DataDateFloor): ConstraintConflict {
  const name = nameOrUnnamed(c.activityName);
  const message = c.constraintType === "MFO"
    ? `${name}: Must Finish On ${c.constraintDate} cannot be met: ${name} has not started, so the schedule starts it ${startWords(start, floor, true)} and finishes it on ${formatDateISO(end)}.`
    : `${name}: Must Start On ${c.constraintDate} has passed, and ${name} has not started, so the schedule starts it ${startWords(start, floor)}.`;
  return { ...c, computedDate: formatDateISO(start), message, passed: true };
}

/**
 * One note per not-started row the data date moved later, when the schedule starts it ON the data
 * date, in the grid's order (Review 35, W5). A row a later constraint or a predecessor moved
 * further has none; nor has a row its reworded Must Start On or Must Finish On error explains —
 * any other conflict leaves the note (W4).
 */
function dataDateNotes(
  activities: Activity[],
  flooredFrom: Map<string, string>,
  scheduled: ScheduledActivity[],
  held: ReadonlySet<string>,
  floor: DataDateFloor | undefined,
): DataDateProgressNote[] {
  if (!floor || flooredFrom.size === 0) return [];
  const dateISO = formatDateISO(floor.date);
  const byId = new Map(scheduled.map((sa) => [sa.activityId, sa]));
  return activities
    .filter((a) => flooredFrom.has(a.id) && byId.get(a.id)?.startDate === dateISO && !held.has(a.id))
    .map((a) => ({
      kind: "data-date", activityId: a.id, activityName: a.name, date: dateISO,
      logicStart: flooredFrom.get(a.id)!, today: floor.today,
    }));
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
 * It was here from v0.11.0 (`ddc1cff`, 2026-03-07) until 2026-08-07, and **there was never a
 * window in which it did anything**. The caller's advance did not arrive alongside it or after
 * it — it had already been there for two releases, since v0.9.0 (`84c1fa6`). Verified against
 * `ddc1cff^` (`4843a1c`), which carries the outer loop and no `milestoneDate` at all. So this
 * was not a fix that later became redundant; it was redundant on arrival. Its ONLY
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
  records: Map<string, RecordedProgress>;
  floor?: DataDateFloor;
}): {
  startDates: Map<string, Date>;
  endDates: Map<string, Date>;
  networkStart: Map<string, string>;
  networkEnd: Map<string, string>;
  conflicts: ConstraintConflict[];
  heldDurations: Map<string, number>;
  flooredFrom: Map<string, string>;
  held: Set<string>;
} {
  const { graph, activityMap, durationMap, projectStart, calendar, milestones, records, floor } = args;
  const startDates = new Map<string, Date>();    // constrained ES
  const endDates = new Map<string, Date>();      // constrained EF
  const networkStart = new Map<string, string>(); // network ES (ISO)
  const networkEnd = new Map<string, string>();   // network EF (ISO)
  const conflicts: ConstraintConflict[] = [];
  const heldDurations = new Map<string, number>(); // WI-137: recorded rows, start to finish
  const flooredFrom = new Map<string, string>(); // WI-154: the start logic gave a row the data date moved
  const held = new Set<string>(); // WI-154: rows a passed Must Start On or Must Finish On no longer holds

  for (const id of graph.topologicalOrder) {
    const activity = activityMap.get(id)!;
    const duration = durationMap.get(id) ?? 1;
    const preds = (graph.predecessors.get(id) ?? []) as Edge[];
    const rec = records.get(id);
    if (rec) {
      // WI-137: a recorded start is a fact — not moved by predecessors, a milestone start, or a
      // start constraint. An In Progress row's forecast finish still follows FF links and its
      // finish constraint (owner, 2026-10-30).
      const placed = placeRecordedRow({
        activity, rec, duration, ffFinishes: ffFinishesFor(preds, endDates, calendar), calendar,
      });
      networkStart.set(id, rec.start);
      networkEnd.set(id, formatDateISO(placed.efNet));
      startDates.set(id, placed.es);
      endDates.set(id, placed.ef);
      heldDurations.set(id, placed.duration);
      if (placed.conflict) conflicts.push(placed.conflict);
      continue;
    }

    let activityStart = earliestStartFromPreds(preds, startDates, endDates, duration, projectStart, calendar);
    activityStart = applyMilestoneFloor(activity, activityStart, milestones);
    activityStart = advanceToNextWorkingDay(activityStart, calendar); // ensure a working day
    // WI-154: a not-started row starts no earlier than the data date (already a working day).
    const logicStart = activityStart;
    activityStart = dataDateStart(activity, activityStart, floor);
    if (activityStart !== logicStart) flooredFrom.set(id, formatDateISO(logicStart));

    const activityEnd = activityEndDate(activityStart, duration, calendar);

    // Save network dates (before local constraint adjustment)
    const esNetISO = formatDateISO(activityStart);
    const efNetISO = formatDateISO(activityEnd);
    networkStart.set(id, esNetISO);
    networkEnd.set(id, efNetISO);

    const local = applyLocalConstraint(
      activity, esNetISO, efNetISO, duration, activityStart, activityEnd, calendar,
    );
    const placed = holdAtDataDate(activity, local.es, local, activityStart, duration, floor, calendar);
    startDates.set(id, placed.es);
    endDates.set(id, placed.ef);
    if (placed.conflict) conflicts.push(placed.conflict);
    if (placed.conflict?.passed) held.add(id);
  }

  return { startDates, endDates, networkStart, networkEnd, conflicts, heldDurations, flooredFrom, held };
}

/** WI-137: the finish each FF link asks of a recorded row, lag counted. */
function ffFinishesFor(preds: Edge[], endDates: Map<string, Date>, calendar: Cal): Date[] {
  return preds
    .filter((p) => p.type === "FF")
    .map((p) => ffRequiredFinish(endDates.get(p.id)!, p.lagDays, calendar));
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
  overtaken: ReadonlySet<string>;
}): { lateStartCon: Map<string, string>; lateFinishCon: Map<string, string> } {
  const { graph, activityMap, durationMap, projectEndDate, calendar, overtaken } = args;
  const lateStartCon = new Map<string, string>();
  const lateFinishCon = new Map<string, string>();

  for (let i = graph.topologicalOrder.length - 1; i >= 0; i--) {
    const id = graph.topologicalOrder[i]!;
    const activity = activityMap.get(id)!;
    const duration = durationMap.get(id) ?? 1;
    const succs = liveSuccessors(graph, id, overtaken);

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
  overtaken: ReadonlySet<string>;
}): { lateStartNet: Map<string, string>; lateFinishNet: Map<string, string> } {
  const { graph, durationMap, projectEndDate, calendar, overtaken } = args;
  const lateStartNet = new Map<string, string>();
  const lateFinishNet = new Map<string, string>();

  for (let i = graph.topologicalOrder.length - 1; i >= 0; i--) {
    const id = graph.topologicalOrder[i]!;
    const duration = durationMap.get(id) ?? 1;
    const succs = liveSuccessors(graph, id, overtaken);

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

/**
 * WI-151: a row's successors less the links a record overtook (`overtakenLinks`, the links the
 * progress notes name). Such a link holds nothing back — the recorded start is placed where it
 * happened — so the late dates and the floats come from the row's other successors, or from the
 * project's end when none is left. Skipping it is what keeps a total float from going negative.
 */
const NO_LINKS: ReadonlySet<string> = new Set();

/**
 * WI-154 (E1): the network less the links set aside, in the FULL network's order — a valid order for
 * any part of it — so the rows come out in the order they always did. With none set aside, as given.
 */
function withoutLinks(
  full: DepGraph, activities: Activity[], dependencies: ActivityDependency[], setAside: ReadonlySet<string>,
): DepGraph {
  if (setAside.size === 0) return full;
  const kept = dependencies.filter((d) => !setAside.has(linkKey(d.fromActivityId, d.toActivityId, d.type)));
  return { ...buildDependencyGraph(activities.map((a) => a.id), kept), topologicalOrder: full.topologicalOrder };
}

function liveSuccessors(graph: DepGraph, id: string, overtaken: ReadonlySet<string>): Edge[] {
  const succs = (graph.successors.get(id) ?? []) as Edge[];
  return overtaken.size === 0 ? succs : succs.filter((s) => !overtaken.has(linkKey(id, s.id, s.type)));
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
  overtaken: ReadonlySet<string>;
}): Map<string, number> {
  const { graph, totalFloatMap, startDates, endDates, calendar, overtaken } = args;
  const freeFloatMap = new Map<string, number>();

  for (const id of graph.topologicalOrder) {
    const succs = liveSuccessors(graph, id, overtaken);
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
  records: Map<string, RecordedProgress>;
}): ConstraintConflict[] {
  const { graph, activityMap, networkStart, networkEnd, lateStartNet, lateFinishNet, calendar, records } = args;
  const found: ConstraintConflict[] = [];

  for (const id of graph.topologicalOrder) {
    const activity = activityMap.get(id)!;
    if (!activity.constraintType || !activity.constraintDate || !activity.constraintMode) continue;
    // WI-137: a constraint the record sets aside gets a neutral note instead (detectConstraintNotes).
    if (recordSetsConstraintAside(activity.constraintType, records.get(id))) continue;
    // A hard Must Start On or Must Finish On conflict is already reported by the forward pass
    // (applyLocalConstraint); reporting it here as well listed it twice (WI-140).
    const forwardPassReports = activity.constraintType === "MSO" || activity.constraintType === "MFO";
    if (activity.constraintMode === "hard" && forwardPassReports) continue;

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
  records: Map<string, RecordedProgress>;
  setAside: ReadonlySet<string>;
}): DependencyConflict[] {
  const { dependencies, startDates, endDates, activityMap, calendar, records, setAside } = args;
  const dependencyConflicts: DependencyConflict[] = [];

  function computeRequired(baseDate: Date, offset: number): Date {
    return offset >= 0
      ? addWorkingDays(baseDate, offset, calendar)
      : subtractWorkingDays(baseDate, -offset, calendar);
  }

  for (const dep of dependencies) {
    // WI-137: a violation a record explains is a neutral note, not this amber warning. WI-154 (E1):
    // so is a link from work that has not started into work that has, which holds nothing.
    if (recordExplains(dep.type, dep.toActivityId, records)) continue;
    if (setAside.has(linkKey(dep.fromActivityId, dep.toActivityId, dep.type))) continue;
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
        message: `${dep.type} constraint violated: ${nameOrUnnamed(toName)} does not satisfy ${dep.type} relationship with ${nameOrUnnamed(fromName)}`,
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
  records: Map<string, RecordedProgress>;
  floors?: Map<string, number>;
}): { scheduledActivities: ScheduledActivity[]; totalDurationDays: number; spanDays: number } {
  const {
    graph, activityMap, durationMap, startDates, endDates,
    lateStartCon, lateFinishCon, lateStartNet, lateFinishNet,
    totalFloatMap, freeFloatMap, projectStart, projectEndISO, calendar, records, floors,
  } = args;

  const scheduledActivities: ScheduledActivity[] = [];
  for (const id of graph.topologicalOrder) {
    const activity = activityMap.get(id)!;
    const duration = durationMap.get(id) ?? 1;
    const isActual = isCompleteActual(activity, records.get(id));

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
      ...recordedFlags(records.get(id)),
    });
  }

  // Total duration is the critical path length (consistent with Monte Carlo computation) —
  // with recorded starts placed where they happened (WI-137), as the simulation places them.
  // WI-154: and with not-started rows at the data date, as the simulation places them.
  const totalDurationDays = records.size > 0 || floors
    ? computeCriticalPathWithMilestones(graph, durationMap, new Map(), undefined, undefined, recordedStartPins(records), floors).projectDuration
    : computeCriticalPathDuration(graph, durationMap);
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
  milestones?: Milestone[],
  dataDate?: string,
): DeterministicSchedule {
  const graph = buildDependencyGraph(
    activities.map((a) => a.id),
    dependencies
  );
  const durationMap = computeDependencyDurations(activities, percentile);
  const activityMap = new Map(activities.map((a) => [a.id, a]));
  // WI-137: rows with a recorded start. Empty for every project a v25 build wrote.
  const records = resolveRecordedProgress(activities, startDate, calendar);
  for (const [id, rec] of records) if (rec.duration !== undefined) durationMap.set(id, rec.duration);

  let projectStart = parseDateISO(startDate);
  projectStart = advanceToNextWorkingDay(projectStart, calendar);
  // WI-154: the data date, or undefined — then every row is placed exactly as before.
  const floor = resolveDataDate(dataDate, startDate, calendar);
  const pairs = dependencies.map((d): ProgressPair => ({ fromId: d.fromActivityId, toId: d.toActivityId, type: d.type, lagDays: d.lagDays }));
  // WI-154 (Review 35, E1): with the data date, a link from work that has not started holds no work
  // that has, so the network the schedule is computed on leaves it out; the simulation does the same.
  // The full network is built first all the same, so a cycle fails the schedule exactly as before.
  const setAside = setAsideLinks(pairs, activityMap, !!floor);
  const network = withoutLinks(graph, activities, dependencies, setAside);

  const { startDates, endDates, networkStart, networkEnd, conflicts, heldDurations, flooredFrom, held } = forwardPass({
    graph: network, activityMap, durationMap, projectStart, calendar, milestones, records, floor,
  });
  // WI-137: a recorded row lasts from its start to its finish as placed, so the backward passes,
  // the floats and the totals all read the dates the forward pass drew.
  for (const [id, days] of heldDurations) durationMap.set(id, days);

  // Project end is the latest constrained end date
  let projectEndDate = projectStart;
  for (const endDate of endDates.values()) {
    if (endDate > projectEndDate) projectEndDate = endDate;
  }
  const projectEndISO = formatDateISO(projectEndDate);

  // WI-137's notes, from the dates the forward pass drew — before the backward passes, because the
  // links they name are the links the float skips (WI-151).
  const progressNotes = records.size > 0 || setAside.size > 0
    ? allProgressNotes({ pairs, records, startDates, endDates, activityMap, calendar, sequential: false, setAside })
    : [];
  const overtaken = overtakenLinks(progressNotes);

  const { lateStartCon, lateFinishCon } = backwardPassConstrained({
    graph: network, activityMap, durationMap, projectEndDate, calendar, overtaken,
  });
  // The float: on the network the schedule placed, less the links a record overtook (WI-151).
  const floatPass = backwardPassNetwork({ graph: network, durationMap, projectEndDate, calendar, overtaken });
  // The late dates the No Later Than checks read (and the row's network late dates): on the FULL
  // network with every link, as before WI-151 — skipping a link makes its predecessor end with the
  // project, and a check of that late finish would say a date cannot be met that is (Review 35,
  // verification E3). Without a skipped link the two passes are one.
  const { lateStartNet, lateFinishNet } = network === graph && overtaken.size === 0
    ? floatPass
    : backwardPassNetwork({ graph, durationMap, projectEndDate, calendar, overtaken: NO_LINKS });

  const totalFloatMap = new Map<string, number>();
  for (const id of graph.topologicalOrder) {
    const esDate = parseDateISO(networkStart.get(id)!);
    const lsDate = parseDateISO(floatPass.lateStartNet.get(id)!);
    totalFloatMap.set(id, countWorkingDays(esDate, lsDate, calendar));
  }

  const freeFloatMap = computeFreeFloat({
    graph: network, totalFloatMap, startDates, endDates, calendar, overtaken,
  });

  conflicts.push(...detectSoftConflicts({
    graph: network, activityMap, networkStart, networkEnd, lateStartNet, lateFinishNet, calendar, records,
  }));

  const dependencyConflicts = validateDependencies({
    dependencies, startDates, endDates, activityMap, calendar, records, setAside,
  });

  const { scheduledActivities, totalDurationDays, spanDays } = buildScheduleResult({
    graph: network, activityMap, durationMap, startDates, endDates,
    lateStartCon, lateFinishCon, lateStartNet, lateFinishNet,
    totalFloatMap, freeFloatMap, projectStart, projectEndISO, calendar, records,
    floors: dataDateFloorOffsets(activities, floor?.offset),
  });
  progressNotes.push(...dataDateNotes(activities, flooredFrom, scheduledActivities, held, floor));

  return {
    activities: scheduledActivities,
    totalDurationDays,
    spanDays,
    projectEndDate: projectEndISO,
    constraintConflicts: conflicts.length > 0 ? conflicts : undefined,
    dependencyConflicts: dependencyConflicts.length > 0 ? dependencyConflicts : undefined,
    ...(progressNotes.length > 0 ? { progressNotes } : {}),
  };
}

/**
 * WI-137: each recorded start's offset from the project start, for the integer-domain pass. Its
 * finish does not follow logic HERE: the durations it is given were already held by the forward
 * pass (FF links, finish constraints), so the pin's start plus that duration is the finish drawn.
 */
function recordedStartPins(records: Map<string, RecordedProgress>): Map<string, RecordedPin> {
  return new Map(Array.from(records, ([id, rec]) => [id, { offset: rec.startOffset, finishFollowsLogic: false }]));
}
