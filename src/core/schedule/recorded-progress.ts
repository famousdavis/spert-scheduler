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
  return rec.complete || isStartConstraint(type);
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

/** What a link allowed, and whether the recorded date came before it. */
function linkHit(
  pair: ProgressPair,
  rec: RecordedProgress,
  startDates: Map<string, Date>,
  endDates: Map<string, Date>,
  calendar: Cal,
): { event: "start" | "finish"; date: string; predecessorDate: Date; allowed: Date } | null {
  const predES = startDates.get(pair.fromId);
  const predEF = endDates.get(pair.fromId);
  if (!predES || !predEF) return null;
  if (pair.type === "FF") {
    // An In Progress row's finish is a forecast the link holds (no note); a Complete row's is a fact.
    const finish = endDates.get(pair.toId);
    if (!rec.complete || !finish) return null;
    const allowed = requiredDate(predEF, pair.lagDays, calendar);
    return finish < allowed ? { event: "finish", date: formatDateISO(finish), predecessorDate: predEF, allowed } : null;
  }
  const base = pair.type === "SS" ? predES : predEF;
  const allowed = requiredDate(base, pair.type === "SS" ? pair.lagDays : 1 + pair.lagDays, calendar);
  return parseDateISO(rec.start) < allowed
    ? { event: "start", date: rec.start, predecessorDate: base, allowed }
    : null;
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
}): LinkProgressNote[] {
  const { pairs, records, startDates, endDates, activityMap, calendar, sequential } = args;
  const notes: LinkProgressNote[] = [];
  for (const pair of pairs) {
    const rec = records.get(pair.toId);
    const succ = activityMap.get(pair.toId);
    const pred = activityMap.get(pair.fromId);
    if (!rec || !succ || !pred) continue;
    const hit = linkHit(pair, rec, startDates, endDates, calendar);
    if (!hit) continue;
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
    });
  }
  return notes;
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
  /** The row's start, finish and duration as the schedule shows them now, when there is a schedule. */
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
 * start and finish as the schedule shows them at that moment, P6's Planned dates (owner, R625).
 * Nothing moves them afterwards. Both or neither: with no schedule (a cycle, a calendar error)
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
