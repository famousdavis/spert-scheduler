// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// -- WI-150 release C: Connect AI records progress -----------------------------
// `bulk_set_activity_progress` — an activity's Status, Actual Start and Actual Finish, entry by entry,
// all or nothing per entry (owner, R650):
//  - ADD-ONLY (ruling 6d): an entry records only what is not yet recorded. It never moves an activity
//    back (a started row to Planned, Complete to In Progress) and never changes a recorded date;
//    resending the recorded date is no change.
//  - The AI's own dates (ruling 5): a date the entry leaves out is the day the request was SENT (the
//    op's creation day, R4), and a weekend or holiday is judged on that same day; Planned → Complete
//    needs both dates; In Progress → Complete may leave out the finish. No date ever comes from the
//    plan: the grid's overdue-plan default is not the AI's.
//  - Never a Planned date: when a row leaves Planned, THE Status rule (`statusChangeUpdates`) keeps
//    its Planned pair from the scenario's PLAN (C′, the one schedule function), as on every path.
//  - Then the window's own date rule (`actualDatesFault`) and the stored-row schema.

import type { Activity, ActivityStatus, Calendar, DeterministicSchedule, Scenario } from "@domain/models/types";
import type { WorkCalendar } from "@core/calendar/work-calendar";
import { StoredActivitySchema } from "@domain/schemas/project.schema";
import { actualDatesFault, type ActualDatesFault } from "@domain/helpers/actual-dates-rules";
import { formatDateISO, parseDateISO } from "@core/calendar/calendar";
import {
  statusChangeUpdates,
  snapRecordedDate,
  recordableToday,
  elapsedWorkingDays,
  recordedDuration,
} from "@core/schedule/recorded-progress";
import { scenarioPlanSchedule } from "./scenario-schedule";
import { updateActivity } from "./project-service";
import {
  type AiBatchContext,
  type AiOpOutcome,
  type AiSkipReason,
  type BulkSetActivityProgressPayload,
  type BulkSetProgressItem,
  type OpResult,
  type SkippedItem,
  toItemReject,
} from "./ai-op-types";

const STATUSES: readonly string[] = ["planned", "inProgress", "complete"];

/** The window's date faults, each as the feed names it (Review 34, W9). */
const FAULT_REASONS: Record<ActualDatesFault, AiSkipReason> = {
  finishWithoutStart: "finish_without_start",
  startBeforeStartDate: "before_start_date",
  startAfterToday: "date_after_today",
  finishAfterToday: "date_after_today",
  startAfterFinish: "dates_out_of_order",
  finishBeforeStart: "dates_out_of_order",
};

/** What every entry of one op reads. The plan is computed ONCE, before the op's first entry. */
export interface ProgressContext {
  /** The draining browser's today: no recorded date may be after it, and an In Progress count runs to it. */
  today: string;
  /**
   * R4 and ruling 5: the day the request was sent — the op's creation day, never after `today`. A
   * left-out date is this day, and a weekend or holiday is judged on it.
   */
  defaultsDay: string;
  calendar: WorkCalendar | Calendar | undefined;
  /** The scenario's plan before this op (owner, R639, C′; ruling 5b), ONLY for the kept Planned pair. */
  plan: DeterministicSchedule | null;
  scenarioStart: string;
}

type ProgressCoreResult =
  | { ok: true; scenario: Scenario; noPlanKept: boolean }
  | { ok: false; reason: AiSkipReason };

/** One of the two dates as the entry leaves it, or why the entry is refused. */
type DateSlot = { ok: true; date: string | undefined } | { ok: false; reason: AiSkipReason };

type ResolvedDates = { ok: true; start: string | undefined; finish: string | undefined } | { ok: false; reason: AiSkipReason };

/** A real `YYYY-MM-DD` calendar date: the form, and a round trip through the calendar's own parse. */
function isRealDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && formatDateISO(parseDateISO(s)) === s;
}

function datesWellFormed(item: BulkSetProgressItem): boolean {
  const { actualStartDate: start, actualFinishDate: finish } = item;
  return (start === undefined || isRealDate(start)) && (finish === undefined || isRealDate(finish));
}

/** The context for one op, from the batch and the scenario as it stands before the op. */
export function progressContext(scenario: Scenario, batch: AiBatchContext, createdOn: string | undefined): ProgressContext {
  const created = createdOn !== undefined && isRealDate(createdOn) && createdOn < batch.today ? createdOn : undefined;
  return {
    today: batch.today,
    defaultsDay: created ?? batch.today,
    calendar: batch.calendar,
    plan: scenarioPlanSchedule(scenario, batch.calendar),
    scenarioStart: scenario.startDate,
  };
}

/** Ruling 6d: the Status never moves back. Those changes stay the user's, in the grid or the window. */
function movesBack(current: Activity, status: string): AiSkipReason | null {
  if (status === "planned" && current.status !== "planned") return "already_started";
  if (status === "inProgress" && current.status === "complete") return "already_complete";
  return null;
}

/** Ruling 5: an activity that has not started is marked Complete only with both dates. */
function lacksADate(item: BulkSetProgressItem, current: Activity, status: string): boolean {
  if (status !== "complete" || current.status !== "planned") return false;
  return item.actualStartDate === undefined || item.actualFinishDate === undefined;
}

/** The entry against its Status, before any date is resolved — each refusal its own reason (W9). */
function shapeRefusal(item: BulkSetProgressItem, current: Activity, status: string): AiSkipReason | null {
  const anyDate = item.actualStartDate !== undefined || item.actualFinishDate !== undefined;
  if (!STATUSES.includes(status) || (item.status === undefined && !anyDate)) return "invalid";
  const back = movesBack(current, status);
  if (back) return back;
  if (status === "planned" && anyDate) return "dates_on_planned";
  if (status === "inProgress" && item.actualFinishDate !== undefined) return "finish_while_in_progress";
  if (!datesWellFormed(item)) return "invalid";
  return lacksADate(item, current, status) ? "needs_both_dates" : null;
}

/**
 * A start the entry sends, recorded as the window records a typed one — forward to a working day —
 * except that ruling 5 judges a weekend or holiday on the day the request was sent (Review 37,
 * interactions E1 = verification R1): a start no later than that day whose forward move would pass
 * it takes the last working day on or before it. A date after today is left as sent, for
 * `actualDatesFault` to refuse.
 */
function sentStart(raw: string, ctx: ProgressContext): string {
  if (raw > ctx.today) return raw;
  const snapped = snapRecordedDate(raw, "start", ctx.calendar);
  return raw <= ctx.defaultsDay && snapped > ctx.defaultsDay ? recordableToday(ctx.defaultsDay, ctx.calendar) : snapped;
}

/** A finish the entry sends moves BACK to a working day (it was done by then). A date after today is left as sent. */
function sentFinish(raw: string, ctx: ProgressContext): string {
  return raw > ctx.today ? raw : snapRecordedDate(raw, "finish", ctx.calendar);
}

/**
 * One date, add-only (ruling 6d). Left out: the recorded date, else `fill`. Sent: recorded as
 * `record` records it — unless a date is already recorded, which stays: the same date again (as
 * stored, or as the app would record what was sent) is no change, and any other is refused.
 */
function dateSlot(
  recorded: string | undefined,
  raw: string | undefined,
  record: (d: string) => string,
  fill: () => string | undefined,
): DateSlot {
  if (raw === undefined) return { ok: true, date: recorded ?? fill() };
  if (recorded === undefined) return { ok: true, date: record(raw) };
  return raw === recorded || record(raw) === recorded ? { ok: true, date: recorded } : { ok: false, reason: "date_recorded" };
}

/**
 * Both dates. A Planned row holds no record (a date it carries — an old import — is not its start).
 * A left-out start is the day the request was sent, or the working day before when that is not a
 * working day — only for a row leaving Planned: a started row keeps the start it has, or has none.
 * A left-out finish is that same day, only for In Progress → Complete (Planned → Complete has both).
 */
function resolveDates(current: Activity, item: BulkSetProgressItem, status: ActivityStatus, ctx: ProgressContext): ResolvedDates {
  const sentDay = () => recordableToday(ctx.defaultsDay, ctx.calendar);
  const recordedStart = current.status === "planned" ? undefined : current.actualStartDate;
  const start = dateSlot(recordedStart, item.actualStartDate, (d) => sentStart(d, ctx), () => (current.status === "planned" ? sentDay() : undefined));
  if (!start.ok) return start;
  if (status !== "complete") return { ok: true, start: start.date, finish: undefined };
  const recordedFinish = current.status === "complete" ? current.actualFinishDate : undefined;
  const finish = dateSlot(recordedFinish, item.actualFinishDate, (d) => sentFinish(d, ctx), () => (current.status === "inProgress" ? sentDay() : undefined));
  if (!finish.ok) return finish;
  return { ok: true, start: start.date, finish: finish.date };
}

/**
 * The Planned pair a row keeps when it leaves Planned, from THE Status rule with the row's dates in
 * the plan (C′) — the same three values the grid, the bulk toolbar and the window hand it. Only the
 * pair is taken: the rule's own dates for the row are the grid's defaults, not the AI's (ruling 5).
 */
function keptPlannedPair(current: Activity, status: ActivityStatus, ctx: ProgressContext): Partial<Activity> {
  if (current.status !== "planned") return {};
  const row = ctx.plan?.activities.find((r) => r.activityId === current.id);
  const rule = statusChangeUpdates(current, status, {
    today: ctx.defaultsDay,
    scheduledStart: row?.startDate,
    scheduledFinish: row?.endDate,
    scheduledDuration: row?.duration,
    calendar: ctx.calendar,
  });
  return { plannedStartDate: rule.plannedStartDate, plannedFinishDate: rule.plannedFinishDate };
}

/**
 * The count, as the window recounts it: only when the Status or a date moved, from the start to the
 * DRAIN day for In Progress (the window's day of saving), and over the recorded pair for Complete.
 */
function recount(current: Activity, status: ActivityStatus, start: string | undefined, finish: string | undefined, ctx: ProgressContext): number | undefined {
  const moved = status !== current.status || start !== current.actualStartDate || finish !== current.actualFinishDate;
  if (!moved || !start) return current.actualDuration;
  if (status === "inProgress") return elapsedWorkingDays(start, ctx.today, ctx.calendar);
  return finish && finish >= start ? recordedDuration(start, finish, ctx.calendar) : current.actualDuration;
}

/** The fields this entry writes. */
function composeProgress(current: Activity, status: ActivityStatus, start: string | undefined, finish: string | undefined, ctx: ProgressContext): Partial<Activity> {
  return {
    status,
    actualStartDate: start,
    actualFinishDate: finish,
    actualDuration: recount(current, status, start, finish, ctx),
    ...keptPlannedPair(current, status, ctx),
  };
}

/** The window's date rule, with the scenario's Start Date and the drain day's today. */
function dateFault(patch: Partial<Activity>, status: ActivityStatus, item: BulkSetProgressItem, ctx: ProgressContext): AiSkipReason | null {
  const fault = actualDatesFault({
    status,
    start: patch.actualStartDate ?? "",
    finish: patch.actualFinishDate ?? "",
    today: ctx.today,
    scenarioStart: ctx.scenarioStart,
    lastEdited: item.actualFinishDate === undefined ? "start" : "finish",
  });
  return fault ? FAULT_REASONS[fault] : null;
}

/** Only the keys whose value moves. */
function changedFields(current: Activity, patch: Partial<Activity>): Partial<Activity> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (current[key as keyof Activity] !== value) out[key] = value;
  }
  return out as Partial<Activity>;
}

/** One entry, all or nothing: refused with one reason, or applied (results invalidated, as every AI write). */
export function setProgressCore(scenario: Scenario, item: BulkSetProgressItem, ctx: ProgressContext): ProgressCoreResult {
  const current = scenario.activities.find((a) => a.id === item.id);
  if (!current) return { ok: false, reason: "not_found" };
  const status = item.status ?? current.status;
  const refused = shapeRefusal(item, current, status);
  if (refused) return { ok: false, reason: refused };
  // Past the refusals, "planned" can only be a Planned row asked to stay Planned.
  if (status === "planned") return { ok: false, reason: "value_unchanged" };
  const dates = resolveDates(current, item, status, ctx);
  if (!dates.ok) return dates;
  const patch = composeProgress(current, status, dates.start, dates.finish, ctx);
  const fault = dateFault(patch, status, item, ctx);
  if (fault) return { ok: false, reason: fault };
  const changed = changedFields(current, patch);
  if (Object.keys(changed).length === 0) return { ok: false, reason: "value_unchanged" };
  if (!StoredActivitySchema.safeParse({ ...current, ...changed }).success) return { ok: false, reason: "invalid" };
  // F7: it left Planned, and the rule kept no Planned dates (no schedule to keep them from).
  const noPlanKept = current.status === "planned" && patch.plannedStartDate === undefined;
  return { ok: true, scenario: updateActivity(scenario, current.id, changed), noPlanKept };
}

function progressOutcome(appliedCount: number, skippedItems: SkippedItem[], noPlanKept: number): AiOpOutcome {
  const note = noPlanKept > 0 ? { noPlanKept } : {};
  return skippedItems.length === 0
    ? { status: "applied", ...note }
    : { status: "partial", appliedCount, skippedItems, ...note };
}

/**
 * The op. Entries apply in array order — a repeated id sees the earlier entry's result — and every
 * entry reads the plan as it stood before the op (ruling 5b: rows started in one call keep their
 * pre-call plans). Inside a batch, "before the op" means after the batch's earlier ops. Each skipped
 * entry carries its activity's name, as the feed names it (Review 37, G2).
 */
export function handleBulkSetActivityProgress(
  scenario: Scenario,
  p: BulkSetActivityProgressPayload,
  batch: AiBatchContext & { createdOn?: string },
): OpResult {
  const ctx = progressContext(scenario, batch, batch.createdOn);
  let scn = scenario;
  const skippedItems: SkippedItem[] = [];
  let appliedCount = 0;
  let noPlanKept = 0;
  p.updates.forEach((item, index) => {
    const r = setProgressCore(scn, item, ctx);
    if (!r.ok) {
      const name = scn.activities.find((a) => a.id === item.id)?.name ?? item.id;
      skippedItems.push({ index, id: item.id, name, reason: toItemReject(r.reason) });
      return;
    }
    scn = r.scenario;
    appliedCount++;
    if (r.noPlanKept) noPlanKept++;
  });
  return { scenario: scn, outcome: progressOutcome(appliedCount, skippedItems, noPlanKept) };
}
