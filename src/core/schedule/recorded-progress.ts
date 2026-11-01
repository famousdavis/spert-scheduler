// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type {
  Activity,
  ActivityStatus,
  Calendar,
  ConstraintConflict,
  ConstraintType,
  DependencyType,
  LinkProgressNote,
  ProgressNote,
} from "@domain/models/types";
import { advanceToNextWorkingDay, type WorkCalendar } from "@core/calendar/work-calendar";
import {
  MAX_CALENDAR_ITERATIONS,
  activityEndDate,
  addWorkingDays,
  countWorkingDays,
  formatDateISO,
  isWorkingDay,
  parseDateISO,
  subtractWorkingDays,
} from "@core/calendar/calendar";
import { applyForwardConstraint } from "./constraint-utils";

type Cal = WorkCalendar | Calendar | undefined;

/**
 * WI-137 — what an activity's recorded dates mean to the schedule.
 *
 * A record exists only on an In Progress or Complete row with an Actual Start. Everything else
 * — a Planned row, and every row a v25 build wrote — has no record and is scheduled exactly as
 * before. The recorded start is a FACT, so it is placed where it happened, not where the plan
 * allows: FS and SS links, a milestone start and a start constraint do not move it. A Complete
 * row's finish is a fact too. An In Progress row's finish is still a FORECAST, so its FF links and
 * its finish constraint act on it as they act on an unrecorded row (owner, 2026-10-30).
 */
export interface RecordedProgress {
  /** The start the schedule uses: a working day (a non-working date moves FORWARD), never before the project start. */
  start: string;
  /** Working days from the project start to `start` — the simulation's offset. */
  startOffset: number;
  /** True when `start` is the stored Actual Start, unmoved — only then is it shown as recorded. */
  startAsRecorded: boolean;
  /** The stored Actual Start, when it lies before the project start and the schedule drew it from there. */
  clampedFrom?: string;
  /** A Complete row: its finish is a fact. An In Progress row's finish is a forecast. */
  complete: boolean;
  /** Complete rows with an Actual Finish: a working day (a non-working date moves BACK), never before `start`. */
  finish?: string;
  /** True when `finish` is the stored Actual Finish, unmoved. */
  finishAsRecorded?: boolean;
  /** Complete rows with an Actual Finish: working days from `start` to `finish`, both counted. */
  duration?: number;
}

function retreatToWorkingDay(date: Date, calendar: Cal): Date {
  const d = new Date(date);
  let guard = 0;
  while (!isWorkingDay(d, calendar) && guard++ < MAX_CALENDAR_ITERATIONS) d.setDate(d.getDate() - 1);
  return d;
}

function hasRecord(a: Activity): a is Activity & { actualStartDate: string } {
  return (a.status === "inProgress" || a.status === "complete") && !!a.actualStartDate;
}

/** Does any row carry a record? With none, every schedule and simulation is exactly as before WI-137. */
export function hasAnyRecord(activities: Activity[]): boolean {
  return activities.some(hasRecord);
}

/**
 * The critical path as a schedule placed it: the rows with no total float. With a recorded start
 * the plan's durations alone no longer give it — a row started early is not where they put it.
 */
export function zeroFloatIds(schedule: { activities: { activityId: string; totalFloat?: number }[] }): Set<string> {
  return new Set(schedule.activities.filter((sa) => sa.totalFloat === 0).map((sa) => sa.activityId));
}

/**
 * A Complete row whose day count comes from its two recorded dates. The simulation then takes the
 * row as done whether or not a count is stored, so every list that skips done rows must ask this
 * too, or the Parkinson floors after it shift by one index.
 */
export function hasRecordedFinish(a: Activity): boolean {
  return a.status === "complete" && !!a.actualStartDate && !!a.actualFinishDate;
}

export function resolveRecordedProgress(
  activities: Activity[],
  projectStartISO: string,
  calendar: Cal,
): Map<string, RecordedProgress> {
  const out = new Map<string, RecordedProgress>();
  const projectStart = advanceToNextWorkingDay(parseDateISO(projectStartISO), calendar);
  for (const a of activities) {
    if (!hasRecord(a)) continue;
    let start = advanceToNextWorkingDay(parseDateISO(a.actualStartDate), calendar);
    const clamped = start < projectStart;
    if (clamped) start = new Date(projectStart);
    const startISO = formatDateISO(start);
    const rec: RecordedProgress = {
      start: startISO,
      startOffset: countWorkingDays(projectStart, start, calendar),
      startAsRecorded: startISO === a.actualStartDate,
      complete: a.status === "complete",
    };
    if (clamped) rec.clampedFrom = a.actualStartDate;
    if (a.status === "complete" && a.actualFinishDate) {
      let finish = retreatToWorkingDay(parseDateISO(a.actualFinishDate), calendar);
      if (finish < start) finish = new Date(start);
      rec.finish = formatDateISO(finish);
      rec.finishAsRecorded = rec.finish === a.actualFinishDate;
      rec.duration = countWorkingDays(start, finish, calendar) + 1;
    }
    out.set(a.id, rec);
  }
  return out;
}

/**
 * The flags a scheduled row carries when its dates are recorded — none at all when they are not.
 * A date the schedule moved (before the Start Date, on a day that is no longer a working day) is
 * not flagged: the grid never shows a date in green, "as recorded", that is not the one recorded.
 */
export function recordedFlags(rec: RecordedProgress | undefined): { recordedStart?: true; recordedFinish?: true } {
  if (!rec) return {};
  return {
    ...(rec.startAsRecorded ? { recordedStart: true as const } : {}),
    ...(rec.finishAsRecorded ? { recordedFinish: true as const } : {}),
  };
}

// -- Placing a recorded row: the date domain ------------------------------------

const START_CONSTRAINTS: readonly ConstraintType[] = ["MSO", "SNET", "SNLT"];

function isStartConstraint(type: ConstraintType): boolean {
  return START_CONSTRAINTS.includes(type);
}

/** The finish an FF link asks of its successor: the predecessor's finish plus its lag (or minus its lead). */
export function ffRequiredFinish(predEnd: Date, lagDays: number, calendar: Cal): Date {
  return requiredDate(predEnd, lagDays, calendar);
}

/**
 * A recorded row in the deterministic forward pass, in either mode. The start is the record's.
 * A Complete row ends where its record (or its count) says. An In Progress row's forecast finish
 * is held by its FF links (`ffFinishes`, each already lag-counted) and by its finish constraint —
 * Must Finish On and Finish No Earlier Than move it; Finish No Later Than is checked later — just
 * as on an unrecorded row, with the same red conflict when a hard Must Finish On cannot be met.
 * `duration` comes back as the working days from start to finish, so every later pass agrees.
 */
export function placeRecordedRow(args: {
  activity: Activity;
  rec: RecordedProgress;
  duration: number;
  ffFinishes: Date[];
  calendar: Cal;
}): { es: Date; efNet: Date; ef: Date; duration: number; conflict: ConstraintConflict | null } {
  const { activity, rec, duration, ffFinishes, calendar } = args;
  const es = parseDateISO(rec.start);
  let efNet = activityEndDate(es, duration, calendar);
  if (rec.complete) return { es, efNet, ef: efNet, duration, conflict: null };
  for (const required of ffFinishes) if (required > efNet) efNet = required;
  let ef = efNet;
  let conflict: ConstraintConflict | null = null;
  const { constraintType: type, constraintDate: date, constraintMode: mode } = activity;
  if (type && date && mode && !isStartConstraint(type)) {
    const result = applyForwardConstraint(
      formatDateISO(es), formatDateISO(efNet), duration, type, date, mode, activity.id, activity.name, calendar,
    );
    ef = parseDateISO(result.ef);
    if (ef < es) ef = new Date(es);
    conflict = result.conflict;
  }
  return { es, efNet, ef, duration: countWorkingDays(es, ef, calendar) + 1, conflict };
}

/**
 * Does the record set this row's constraint aside? A start constraint, always; a finish
 * constraint, once the row is Complete. An In Progress row's finish constraint still applies.
 */
export function recordSetsConstraintAside(type: ConstraintType, rec: RecordedProgress | undefined): boolean {
  if (!rec) return false;
  return startSetsConstraintAside(type, rec.complete);
}

/** The same rule for a Status not yet saved (WI-154, Review 36 E1): a start sets aside a start constraint; Complete, any. */
export function startSetsConstraintAside(type: ConstraintType, complete: boolean): boolean {
  return complete || isStartConstraint(type);
}

// -- Placing a recorded row: the simulation's integer domain ----------------------

/** A recorded start in the simulation: placed at its offset; an In Progress row's finish still follows logic. */
export interface RecordedPin {
  offset: number;
  finishFollowsLogic: boolean;
}

/**
 * The simulation's twin of `placeRecordedRow`'s finish rule (exclusive finish offsets, as
 * `applyForwardConstraintInt` uses): a hard Must Finish On holds the finish on its day, never
 * before the start; a hard Finish No Earlier Than is a floor. Anything else leaves it.
 */
export function pinnedFinishInt(
  es: number,
  ef: number,
  constraint: { type: string; offsetFromStart: number; mode: string } | null | undefined,
): number {
  if (!constraint || constraint.mode !== "hard") return ef;
  if (constraint.type === "MFO") return Math.max(es + 1, constraint.offsetFromStart + 1);
  if (constraint.type === "FNET") return Math.max(ef, constraint.offsetFromStart + 1);
  return ef;
}

// -- The neutral notes -------------------------------------------------------------

export interface ProgressPair {
  fromId: string;
  toId: string;
  type: DependencyType;
  lagDays: number;
}

function requiredDate(base: Date, offset: number, calendar: Cal): Date {
  return offset >= 0 ? addWorkingDays(base, offset, calendar) : subtractWorkingDays(base, -offset, calendar);
}

type LinkHit = { event: "start" | "finish"; date: string; predecessorDate: Date; allowed: Date };

/**
 * What a link allowed, and whether the activity's date came before it. `start` is its recorded start
 * (`undefined`: it has started with none — WI-154, E1 — and its start as placed is compared).
 * `heldFinish`: a finish-to-finish link holds an In Progress row's forecast finish — unless the link
 * is set aside (WI-154, E1), when the forecast is compared like a fact.
 */
function linkHit(
  pair: ProgressPair,
  start: string | undefined,
  heldFinish: boolean,
  startDates: Map<string, Date>,
  endDates: Map<string, Date>,
  calendar: Cal,
): LinkHit | null {
  const predES = startDates.get(pair.fromId);
  const predEF = endDates.get(pair.fromId);
  if (!predES || !predEF) return null;
  if (pair.type === "FF") {
    // An In Progress row's finish is a forecast the link holds (no note); a Complete row's is a fact.
    const finish = endDates.get(pair.toId);
    if (heldFinish || !finish) return null;
    const allowed = requiredDate(predEF, pair.lagDays, calendar);
    return finish < allowed ? { event: "finish", date: formatDateISO(finish), predecessorDate: predEF, allowed } : null;
  }
  const date = start ?? (startDates.get(pair.toId) && formatDateISO(startDates.get(pair.toId)!));
  if (!date) return null;
  const base = pair.type === "SS" ? predES : predEF;
  const allowed = requiredDate(base, pair.type === "SS" ? pair.lagDays : 1 + pair.lagDays, calendar);
  return parseDateISO(date) < allowed ? { event: "start", date, predecessorDate: base, allowed } : null;
}

/**
 * The note's WI-154 fields: the predecessor's dates as scheduled when it has not started (Review 35,
 * verification E4, interactions W7 — the words must not say it started or finished), and how the
 * activity started when its start is not recorded.
 */
function notStartedFields(
  pred: Activity, succ: Activity, recorded: boolean, forecast: boolean,
  predES: Date | undefined, predEF: Date | undefined, workAfter: boolean,
): Partial<LinkProgressNote> {
  const out: Partial<LinkProgressNote> = {};
  if (floorsAtDataDate(pred) && predES && predEF) {
    out.predecessorNotStarted = { start: formatDateISO(predES), finish: formatDateISO(predEF) };
    if (workAfter) out.workAfter = true;
  }
  if (!recorded && (succ.status === "inProgress" || succ.status === "complete")) out.unrecorded = succ.status;
  if (forecast) out.forecast = true;
  return out;
}

/**
 * A recorded start (or a Complete row's finish) earlier than a link allows is a FACT, not a
 * mistake (owner, R599): one neutral note per link it overtook. Detected after the forward pass,
 * from the dates the schedule placed. `pairs` are the dependencies, or — dependencies off — each
 * row and the row above it.
 */
export function detectProgressNotes(args: {
  pairs: ProgressPair[];
  records: Map<string, RecordedProgress>;
  startDates: Map<string, Date>;
  endDates: Map<string, Date>;
  activityMap: Map<string, Activity>;
  calendar: Cal;
  sequential: boolean;
  /** WI-154 (E1): links from work that has not started into work that has (`setAsideLinks`). */
  setAside?: ReadonlySet<string>;
}): LinkProgressNote[] {
  const { pairs, records, startDates, endDates, activityMap, calendar, sequential } = args;
  const notes: LinkProgressNote[] = [];
  const followed = new Set(pairs.map((p) => p.fromId)); // the activities some link starts from
  for (const pair of pairs) {
    const rec = records.get(pair.toId);
    const succ = activityMap.get(pair.toId);
    const pred = activityMap.get(pair.fromId);
    if (!succ || !pred) continue;
    const setAside = args.setAside?.has(linkKey(pair.fromId, pair.toId, pair.type)) ?? false;
    if (!rec && !setAside) continue;
    const heldFinish = !setAside && !rec?.complete;
    const hit = linkHit(pair, rec?.start, heldFinish, startDates, endDates, calendar);
    if (!hit) continue;
    const forecast = hit.event === "finish" && !!rec && !rec.complete;
    notes.push({
      kind: "link",
      activityId: pair.toId,
      activityName: succ.name,
      event: hit.event,
      date: hit.date,
      predecessorId: pair.fromId,
      predecessorName: pred.name,
      predecessorComplete: pred.status === "complete",
      dependencyType: pair.type,
      lagDays: pair.lagDays,
      predecessorDate: formatDateISO(hit.predecessorDate),
      allowedDate: formatDateISO(hit.allowed),
      sequential,
      ...notStartedFields(pred, succ, !!rec, forecast, startDates.get(pair.fromId), endDates.get(pair.fromId), followed.has(pair.toId)),
      ...movedRecordedDate(succ, rec, hit.event),
    });
  }
  return notes;
}

/**
 * WI-150 (Review 34, V-E3): the stored date a note's event is about, when the schedule did not keep
 * it as recorded — so the words never say "the start you recorded" of a date the schedule moved.
 */
function movedRecordedDate(
  a: Activity, rec: RecordedProgress | undefined, event: "start" | "finish",
): { recordedDate?: string } {
  if (!rec) return {};
  const moved = event === "start" ? !rec.startAsRecorded : rec.complete && rec.finishAsRecorded === false;
  const date = event === "start" ? a.actualStartDate : a.actualFinishDate;
  return moved && date ? { recordedDate: date } : {};
}

/** Is `date` on the wrong side of a constraint of this type? */
function breaksConstraint(type: ConstraintType, date: string, constraintDate: string): boolean {
  if (type === "MSO" || type === "MFO") return date !== constraintDate;
  if (type === "SNET" || type === "FNET") return date < constraintDate;
  return date > constraintDate; // SNLT, FNLT
}

/**
 * The constraints a record set aside and broke: a start constraint against the recorded start, and
 * a Complete row's finish constraint against its finish. One neutral note each — never the red or
 * amber the same date would raise on a row with no record. An In Progress row's finish constraint
 * is not here: it still applies, and warns or errs as before.
 */
export function detectConstraintNotes(args: {
  records: Map<string, RecordedProgress>;
  endDates: Map<string, Date>;
  activityMap: Map<string, Activity>;
}): ProgressNote[] {
  const { records, endDates, activityMap } = args;
  const notes: ProgressNote[] = [];
  for (const [id, rec] of records) {
    const a = activityMap.get(id);
    if (!a?.constraintType || !a.constraintDate) continue;
    const type = a.constraintType;
    if (!recordSetsConstraintAside(type, rec)) continue;
    const isStart = isStartConstraint(type);
    const end = endDates.get(id);
    const date = isStart ? rec.start : end && formatDateISO(end);
    if (!date || !breaksConstraint(type, date, a.constraintDate)) continue;
    notes.push({
      kind: "constraint",
      activityId: id,
      activityName: a.name,
      event: isStart ? "start" : "finish",
      date,
      constraintType: type,
      constraintDate: a.constraintDate,
      ...movedRecordedDate(a, rec, isStart ? "start" : "finish"),
    });
  }
  return notes;
}

/** Each recorded start before the scenario's Start Date: the schedule draws the row from there. */
export function detectStartDateNotes(
  records: Map<string, RecordedProgress>,
  activityMap: Map<string, Activity>,
): ProgressNote[] {
  const notes: ProgressNote[] = [];
  for (const [id, rec] of records) {
    const a = activityMap.get(id);
    if (!a || !rec.clampedFrom) continue;
    notes.push({ kind: "before-start-date", activityId: id, activityName: a.name, date: rec.clampedFrom, startDate: rec.start });
  }
  return notes;
}

/**
 * Does a record explain this link's violation? Then a note replaces the amber warning. A recorded
 * start explains any FS or SS link; only a Complete row's finish explains an FF link — an In
 * Progress row's forecast finish is held by the link, and warns as before if it still is not met.
 */
export function recordExplains(
  type: DependencyType, toId: string, records: Map<string, RecordedProgress>,
): boolean {
  const rec = records.get(toId);
  if (!rec) return false;
  return type === "FF" ? rec.complete : true;
}

// -- The one status rule ---------------------------------------------------------

export interface StatusChangeContext {
  /** Today, `YYYY-MM-DD`, read from the clock by the caller (the core never reads it). */
  today: string;
  /**
   * The row's start, finish and duration in the PLAN, when there is a schedule. WI-154 (owner, R639,
   * C′): for a Planned row that is the page's schedule computed WITHOUT today's floor, the plan
   * before work that has not started was moved to today; the caller passes that row. So a late start
   * keeps the plan's date as its Planned Start, and Complete judges "already due" by the plan.
   */
  scheduledStart?: string;
  scheduledFinish?: string;
  scheduledDuration?: number;
  calendar: Cal;
}

const PROGRESS_CLEARED: Partial<Activity> = {
  actualDuration: undefined,
  plannedStartDate: undefined,
  plannedFinishDate: undefined,
  actualStartDate: undefined,
  actualFinishDate: undefined,
};

/** Working days from `start` to `today`, both counted when working — `computeElapsedDays`'s rule, at least 1. */
export function elapsedWorkingDays(startISO: string, todayISO: string, calendar: Cal): number {
  const start = parseDateISO(startISO);
  const today = parseDateISO(todayISO);
  if (start > today) return 1;
  return Math.max(1, countWorkingDays(start, today, calendar) + (isWorkingDay(today, calendar) ? 1 : 0));
}

/** Working days from `startISO` to `finishISO`, both counted: the Complete row's day count. */
export function recordedDuration(startISO: string, finishISO: string, calendar: Cal): number {
  const start = advanceToNextWorkingDay(parseDateISO(startISO), calendar);
  const finish = retreatToWorkingDay(parseDateISO(finishISO), calendar);
  return finish < start ? 1 : countWorkingDays(start, finish, calendar) + 1;
}

/** Snap a typed date for the record: a start moves forward to a working day, a finish moves back. */
export function snapRecordedDate(iso: string, which: "start" | "finish", calendar: Cal): string {
  const d = parseDateISO(iso);
  return formatDateISO(which === "start" ? advanceToNextWorkingDay(d, calendar) : retreatToWorkingDay(d, calendar));
}

/**
 * The working day a date taken from TODAY records: today, or on a weekend or holiday the last
 * working day before it — never a day still to come.
 */
export function recordableToday(todayISO: string, calendar: Cal): string {
  return snapRecordedDate(todayISO, "finish", calendar);
}

/**
 * WI-137 release 2 — the Planned Start and Planned Finish a row keeps when it leaves Planned: its
 * start and finish in the plan at that moment, P6's Planned dates (owner, R625). WI-154 (R639, C′):
 * the plan is the schedule without today's floor, so a late start keeps the date it was late
 * against. Nothing moves them afterwards. Both or neither: with no schedule (a cycle, a calendar error)
 * nothing is kept, and a pair a Planned row somehow carries (an old import) is never kept over.
 */
function plannedDatesAtStart(ctx: StatusChangeContext): Partial<Activity> {
  const { scheduledStart, scheduledFinish } = ctx;
  return scheduledStart && scheduledFinish
    ? { plannedStartDate: scheduledStart, plannedFinishDate: scheduledFinish }
    : { plannedStartDate: undefined, plannedFinishDate: undefined };
}

/** Planned or In Progress → Complete (owner, 2026-10-30). */
function completeUpdates(activity: Activity, today: string, ctx: StatusChangeContext): Partial<Activity> {
  const cal = ctx.calendar;
  if (activity.status === "inProgress") {
    const start = activity.actualStartDate;
    // A row started before v0.80.0 has no Actual Start: it gets NO dates here, on any path, and
    // keeps its count as v0.79.36's grid did — the count it has, or else its scheduled duration.
    // Taking the start the schedule shows would freeze a start that moved as a recorded fact.
    if (!start) {
      return activity.actualDuration == null && ctx.scheduledDuration !== undefined
        ? { actualDuration: ctx.scheduledDuration }
        : {};
    }
    const finish = today < start ? start : today;
    return { actualStartDate: start, actualFinishDate: finish, actualDuration: recordedDuration(start, finish, cal) };
  }
  // Planned → Complete. Already due: its scheduled dates. Otherwise it finished today, and started
  // on its scheduled start if that has come, else today.
  const { scheduledStart, scheduledFinish } = ctx;
  if (scheduledStart && scheduledFinish && scheduledFinish <= today) {
    return {
      actualStartDate: scheduledStart,
      actualFinishDate: scheduledFinish,
      actualDuration: recordedDuration(scheduledStart, scheduledFinish, cal),
    };
  }
  const start = scheduledStart && scheduledStart <= today ? scheduledStart : today;
  return { actualStartDate: start, actualFinishDate: today, actualDuration: recordedDuration(start, today, cal) };
}

/**
 * THE rule every path that changes a Status uses (grid, Edit window, bulk toolbar). Returns the
 * fields to write beside the new Status, or `{}` when the Status does not change.
 *  - Planned clears all three.
 *  - In Progress keeps a recorded start (Complete → In Progress), else fills TODAY (owner, R599);
 *    clears any finish; the elapsed count is counted from that start to today.
 *  - Complete: see `completeUpdates`.
 *  - Leaving Planned keeps the Planned dates (`plannedDatesAtStart`); In Progress ↔ Complete leaves
 *    them as they are; Planned clears them with the rest (release 2).
 * A date taken from today is never in the future: on a non-working day it is the last working day.
 */
export function statusChangeUpdates(
  activity: Activity, newStatus: ActivityStatus, ctx: StatusChangeContext,
): Partial<Activity> {
  if (newStatus === activity.status) return {};
  if (newStatus === "planned") return { ...PROGRESS_CLEARED };
  const today = recordableToday(ctx.today, ctx.calendar);
  const planned = activity.status === "planned" ? plannedDatesAtStart(ctx) : {};
  if (newStatus === "inProgress") {
    // A Planned row holds no record, so a date it carries (an old import) is not its start.
    const start = activity.status === "planned" ? today : (activity.actualStartDate ?? today);
    return {
      ...planned,
      actualStartDate: start,
      actualFinishDate: undefined,
      actualDuration: elapsedWorkingDays(start, ctx.today, ctx.calendar),
    };
  }
  return { ...planned, ...completeUpdates(activity, today, ctx) };
}

// -- WI-154: the data date ---------------------------------------------------------

/**
 * WI-154 — the rows the data date floors: a Planned row, which has not started. A recorded start is
 * a fact; an In Progress row without one (from before v0.80.0) started on a day nobody recorded; a
 * Complete row is done. An In Progress row's FINISH is the remaining-work model's question (WI-78,
 * WI-139 step 2), not the floor's. Both engines ask this one predicate.
 */
export function floorsAtDataDate(a: Activity): boolean {
  return a.status === "planned";
}

/** The data date as both engines use it. */
export interface DataDateFloor {
  /** A working day after the project start: a non-working data date moves FORWARD. */
  date: Date;
  /** Working days from the project start to `date` — the simulation's offset. */
  offset: number;
  /** Today as the caller gave it, `YYYY-MM-DD`: `date`, or the day before a weekend or holiday ended. */
  today: string;
}

/**
 * The data date, or undefined when it can move nothing: none given, or on or before the project
 * start (then every row already starts on or after it, and the schedule is exactly as before).
 */
export function resolveDataDate(
  dataDateISO: string | undefined, projectStartISO: string, calendar: Cal,
): DataDateFloor | undefined {
  if (!dataDateISO) return undefined;
  const projectStart = advanceToNextWorkingDay(parseDateISO(projectStartISO), calendar);
  const date = advanceToNextWorkingDay(parseDateISO(dataDateISO), calendar);
  if (date <= projectStart) return undefined;
  return { date, offset: countWorkingDays(projectStart, date, calendar), today: dataDateISO };
}

/**
 * WI-154's scope (option (a), records only): the data date is TODAY, and it applies only in a
 * scenario that holds a record — where someone has said what has started. A plan with no record
 * schedules exactly as before. `todayISO` is read from the clock by the caller (the core never is).
 */
export function scenarioDataDate(activities: Activity[], todayISO: string): string | undefined {
  return hasAnyRecord(activities) ? todayISO : undefined;
}

/** The simulation's floors, keyed by id: each Planned row at the data date's offset. */
export function dataDateFloorOffsets(activities: Activity[], offset: number | undefined): Map<string, number> | undefined {
  if (!offset || offset <= 0) return undefined;
  return new Map(activities.filter(floorsAtDataDate).map((a) => [a.id, offset]));
}

/** One key per link — the progress notes' and the float's (WI-151) — so the two name the same links. */
export function linkKey(fromId: string, toId: string, type: string): string {
  return `${fromId}|${toId}|${type}`;
}

/**
 * WI-154 (Review 35, interactions E1) — with the data date, a link from work that has NOT started
 * never holds work that HAS started (In Progress or Complete, its start recorded or not): its start,
 * and an In Progress row's forecast finish, are placed as if the link were not there, in both
 * engines. Otherwise the floor would push a started row — finished work included — past today
 * behind work that has not begun. Without the data date this is empty, and every schedule is as
 * before. `pairs` are the dependencies, or — dependencies off — each row and the row above it.
 */
export function setAsideLinks(
  pairs: readonly ProgressPair[], activityMap: Map<string, Activity>, floorApplies: boolean,
): Set<string> {
  const keys = new Set<string>();
  if (!floorApplies) return keys;
  for (const p of pairs) {
    const from = activityMap.get(p.fromId);
    const to = activityMap.get(p.toId);
    if (from && to && floorsAtDataDate(from) && !floorsAtDataDate(to)) keys.add(linkKey(p.fromId, p.toId, p.type));
  }
  return keys;
}

/**
 * WI-151: the links a record overtook — exactly the links the progress notes name. A recorded
 * start is placed where it happened (v0.80.0), so such a link holds nothing back, and the float
 * calculation skips it as the start's placement already does; a negative float never arises.
 */
export function overtakenLinks(notes: readonly ProgressNote[]): Set<string> {
  const keys = new Set<string>();
  for (const n of notes) if (n.kind === "link") keys.add(linkKey(n.predecessorId, n.activityId, n.dependencyType));
  return keys;
}

/** Stale results: the local day they were simulated on, and today's data date. */
export interface StaleResults {
  /** The run's own day, `YYYY-MM-DD`, local — from its `timestamp`. */
  simulatedOn: string;
  /** Today's data date, `YYYY-MM-DD`: where work that has not started is now scheduled from. */
  dataDate: string;
}

/**
 * WI-154 (owner, R639, decision 3): are a scenario's simulation results from an earlier data date?
 * In a scenario that holds a record the schedule moves with today, so results simulated when the
 * data date was earlier no longer match it: every surface shows them as not run, with one sentence,
 * and none writes the store to say so. The day comes from the run's own `timestamp` (no schema
 * change). It is compared as a data date — a weekend shares Monday's — so a Saturday run is not
 * stale on Sunday or Monday: nothing moved. A scenario with no record never has stale results.
 */
export function staleResults(
  scenario: { activities: Activity[]; startDate: string; simulationResults?: { timestamp: string } },
  todayISO: string,
  calendar: Cal,
): StaleResults | null {
  const run = scenario.simulationResults;
  if (!run || !scenarioDataDate(scenario.activities, todayISO)) return null;
  const simulatedOn = formatDateISO(new Date(run.timestamp));
  const now = resolveDataDate(todayISO, scenario.startDate, calendar);
  const then = resolveDataDate(simulatedOn, scenario.startDate, calendar);
  if (now?.date.getTime() === then?.date.getTime()) return null;
  return { simulatedOn, dataDate: formatDateISO(now?.date ?? advanceToNextWorkingDay(parseDateISO(todayISO), calendar)) };
}
