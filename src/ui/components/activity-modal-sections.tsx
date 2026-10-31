// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useId, useState } from "react";
import type {
  Activity,
  ActivityDependency,
  ActivityStatus,
  ConstraintMode,
  ConstraintType,
  DistributionType,
  RSMLevel,
} from "@domain/models/types";
import { dependencyLabel, pluralize } from "@domain/helpers/format-labels";
import {
  ACTUAL_DATES_FAULT_FIELD,
  ACTUAL_DATES_FAULT_LINE,
  type ActualDatesFault,
} from "@ui/helpers/actual-dates-fault";

/** The Actual Dur. title. Its count is from the Actual Start when one is recorded; a row from before WI-137 counts from its scheduled start. */
function actualDurTitle(status: ActivityStatus, hasActualStart: boolean): string {
  if (status === "planned") return "Set status to In Progress or Complete to enter actual duration";
  const from = hasActualStart ? "the Actual Start" : "the scheduled start";
  if (status === "inProgress") return `Working days elapsed since ${from}. Used as the minimum floor for simulation trials.`;
  return hasActualStart
    ? "Total working days from the Actual Start to the Actual Finish"
    : "Total working days from scheduled start to actual finish";
}

function formatDepLagSuffix(lagDays: number): string {
  if (lagDays === 0) return "";
  return `, ${lagDays > 0 ? "+" : ""}${lagDays}d`;
}

function totalFloatLabel(totalFloat: number | null | undefined): string {
  if (totalFloat === 0) return "Critical path — 0 days float";
  if (totalFloat == null) return "—";
  return `${totalFloat} ${pluralize(totalFloat, "day")}`;
}

const LABEL = "block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 whitespace-nowrap";
const VALUE = "text-sm text-gray-900 dark:text-gray-100 py-1.5";
const INPUT_OK = "w-full text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:border-blue-400 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed";
const INPUT_BAD = "w-full text-sm border border-red-400 dark:border-red-500 rounded px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:border-blue-400 focus:outline-none";

/** A date field's `aria-invalid` and `aria-describedby` while the red line is about it — spread, as `constraintDateAria` is. */
function dateFieldAria(
  field: "start" | "finish",
  fault: ActualDatesFault | null,
  errorId: string,
  noteId: string | undefined,
): { "aria-invalid"?: true; "aria-describedby"?: string } {
  if (fault && ACTUAL_DATES_FAULT_FIELD[fault] === field) {
    return { "aria-invalid": true, "aria-describedby": noteId ? `${errorId} ${noteId}` : errorId };
  }
  return noteId ? { "aria-describedby": noteId } : {};
}

/** The line for a row with no Actual Start: where the schedule puts it instead, in the mode it is in. */
function unrecordedHint(dependencyMode: boolean): string {
  const where = dependencyMode ? "after its predecessors" : "after the activities before it";
  return `No Actual Start is recorded, so the schedule places this activity ${where}. Enter the day it started to record it.`;
}

/**
 * Schedule context (WI-137, look B revised, owner 2026-10-30): one line. Planned: Sched. Start,
 * Sched. Finish, Sched. Dur., Actual Dur. In Progress: Actual Start, Sched. Finish, Sched. Dur.,
 * Actual Dur. Complete: Sched. Finish, Actual Start, Actual Finish, Actual Dur. Actual Dur. takes
 * three digits (4rem) on every row; the date cells take the rest. Then the red line for a date the
 * window refuses, and any neutral note.
 *
 * It renders with or without a schedule: a date that breaks the schedule must stay where it was
 * typed, to be corrected there (Review 32, G3). With no schedule the Sched. cells show a dash.
 */
export function ScheduleContextRow({
  status,
  sa,
  scheduledStartDate,
  actualDuration,
  actualStartDate,
  setActualStartDate,
  handleActualStartDateBlur,
  today,
  progressNotes,
  completeSchedFinish,
  dateFault,
  dependencyMode,
  actualFinishDate,
  formatDate,
  handleActualDurationChange,
  handleActualFinishDateChange,
  handleActualFinishDateBlur,
  setActualDuration,
}: {
  status: ActivityStatus;
  sa: { endDate: string; duration: number } | undefined;
  scheduledStartDate: string | null;
  actualDuration: number | "";
  actualStartDate: string;
  setActualStartDate: (v: string) => void;
  handleActualStartDateBlur: (e: React.FocusEvent<HTMLInputElement>) => void;
  today: string;
  /** This activity's neutral notes, as sentences. */
  progressNotes: { key: string; sentence: string }[];
  /** A Complete row's Sched. Finish — see `completeRowSchedFinish` in ActivityEditModal. */
  completeSchedFinish?: string;
  /** What the window refuses about the two dates, if anything. */
  dateFault: ActualDatesFault | null;
  dependencyMode: boolean;
  actualFinishDate: string;
  formatDate: (iso: string) => string;
  handleActualDurationChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleActualFinishDateChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleActualFinishDateBlur: (e: React.FocusEvent<HTMLInputElement>) => void;
  setActualDuration: (v: number | "") => void;
}) {
  const baseId = useId();
  const actualDurId = `${baseId}-actualdur`;
  const actualFinId = `${baseId}-actualfin`;
  const actualStartId = `${baseId}-actualstart`;
  const errorId = `${baseId}-dateerror`;
  const noteId = progressNotes.length > 0 ? `${baseId}-notes` : undefined;
  const isPlanned = status === "planned";
  const isComplete = status === "complete";
  const unrecorded = !isPlanned && !actualStartDate;
  const dash = <p className={VALUE}>&mdash;</p>;

  // Look B: ONE line. A Planned row keeps v0.79.36's line exactly; an In Progress or Complete row
  // shows its Actual Start where Sched. Start was — the schedule follows the record, so the plan's
  // own start is no longer a separate date to show.
  const schedStart = (
    <div>
      <div className={LABEL}>Sched. Start</div>
      {scheduledStartDate ? <p className={VALUE}>{formatDate(scheduledStartDate)}</p> : dash}
    </div>
  );
  const schedFinishCell = (iso: string | undefined) => (
    <div>
      <div className={LABEL}>Sched. Finish</div>
      {iso ? <p className={VALUE}>{formatDate(iso)}</p> : dash}
    </div>
  );
  const schedFinish = schedFinishCell(sa?.endDate);
  const schedDur = (
    <div>
      <div className={LABEL}>Sched. Dur.</div>
      {sa ? <p className={VALUE}>{sa.duration}d</p> : dash}
    </div>
  );
  const startAria = dateFieldAria("start", dateFault, errorId, noteId);
  const actualStart = (
    <div title="The day this activity really started. A non-working day moves to the next working day.">
      <label htmlFor={actualStartId} className={LABEL}>Actual Start</label>
      <input
        id={actualStartId}
        name="actualStartDate"
        type="date"
        autoComplete="off"
        value={actualStartDate}
        max={today}
        onChange={(e) => setActualStartDate(e.target.value)}
        onBlur={handleActualStartDateBlur}
        {...startAria}
        className={startAria["aria-invalid"] ? INPUT_BAD : INPUT_OK}
      />
    </div>
  );
  const finishAria = dateFieldAria("finish", dateFault, errorId, undefined);
  const actualFinish = (
    <div title="The day this activity really finished. A non-working day moves back to the last working day.">
      <label htmlFor={actualFinId} className={LABEL}>Actual Finish</label>
      <input
        id={actualFinId}
        name="actualFinishDate"
        type="date"
        autoComplete="off"
        value={actualFinishDate}
        min={actualStartDate || undefined}
        max={today}
        onChange={handleActualFinishDateChange}
        onBlur={handleActualFinishDateBlur}
        {...finishAria}
        className={finishAria["aria-invalid"] ? INPUT_BAD : INPUT_OK}
      />
    </div>
  );
  const actualDur = (
    <div title={actualDurTitle(status, !!actualStartDate)}>
      <label htmlFor={actualDurId} className={LABEL}>Actual Dur.</label>
      <input
        id={actualDurId}
        name="actualDuration"
        type="number"
        autoComplete="off"
        min={1}
        value={actualDuration}
        placeholder={status === "inProgress" ? "Elapsed" : undefined}
        onChange={
          isComplete
            ? handleActualDurationChange
            : (e) => setActualDuration(e.target.value === "" ? "" : Number(e.target.value))
        }
        disabled={isPlanned}
        className={INPUT_OK}
      />
    </div>
  );

  return (
    <div className="space-y-2">
      {isPlanned && (
        <div className="grid gap-3 grid-cols-[1fr_1fr_auto_4rem]">{schedStart}{schedFinish}{schedDur}{actualDur}</div>
      )}
      {status === "inProgress" && (
        <div className="grid gap-3 grid-cols-[1.4fr_1fr_auto_4rem]">{actualStart}{schedFinish}{schedDur}{actualDur}</div>
      )}
      {isComplete && (
        <div className="grid gap-3 grid-cols-[1fr_1.3fr_1.3fr_4rem]">
          {schedFinishCell(completeSchedFinish ?? sa?.endDate)}{actualStart}{actualFinish}{actualDur}
        </div>
      )}
      {dateFault && (
        <p id={errorId} className="text-xs text-red-700 dark:text-red-400">{ACTUAL_DATES_FAULT_LINE[dateFault]}</p>
      )}
      {unrecorded && (
        <p className="text-xs text-gray-600 dark:text-gray-400">{unrecordedHint(dependencyMode)}</p>
      )}
      {noteId && (
        <div id={noteId} className="space-y-1">
          {progressNotes.map((n) => (
            <p key={n.key} className="flex items-start gap-1.5 text-xs text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700/40 border border-gray-200 dark:border-gray-600 rounded px-2 py-1.5">
              <span aria-hidden="true" className="text-blue-700 dark:text-blue-300 font-semibold">i</span>
              <span>{n.sentence}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

/** Collapsible section wrapper */
export function Section({
  title,
  subtitle,
  defaultOpen = true,
  indicator,
  indicatorColor,
  children,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  indicator?: boolean;
  indicatorColor?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-gray-200 dark:border-gray-700">
      <button
        type="button"
        className="w-full flex items-center gap-2 py-2 text-sm font-medium text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400"
        onClick={() => setOpen((o) => !o)}
      >
        <svg
          className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-90" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        {title}
        {subtitle && (
          <span className="text-xs font-normal text-gray-500 dark:text-gray-400">{subtitle}</span>
        )}
        {indicator && (
          <span className={`w-1.5 h-1.5 rounded-full ${indicatorColor ?? "bg-blue-500"}`} />
        )}
      </button>
      {open && <div className="pb-3 space-y-3">{children}</div>}
    </div>
  );
}

/** Builds constraint-related field updates, isolating the null-coalescing diff logic. */
// eslint-disable-next-line react-refresh/only-export-components
export function computeConstraintUpdates(
  activity: Activity,
  constraintType: ConstraintType | null,
  constraintDate: string | null,
  constraintMode: ConstraintMode | null,
  constraintNote: string | null,
): Partial<Activity> {
  const curType = activity.constraintType ?? null;
  const curDate = activity.constraintDate ?? null;
  const curMode = activity.constraintMode ?? null;
  const curNote = activity.constraintNote ?? null;
  const newType = constraintType ?? null;
  const newDate = newType ? (constraintDate ?? null) : null;
  const newMode = newType ? (constraintMode ?? null) : null;
  const newNote = newType ? (constraintNote?.trim() || null) : null;
  const updates: Partial<Activity> = {};
  if (newType !== curType) updates.constraintType = newType;
  if (newDate !== curDate) updates.constraintDate = newDate;
  if (newMode !== curMode) updates.constraintMode = newMode;
  if (newNote !== curNote) updates.constraintNote = newNote;
  return updates;
}

/**
 * Builds the description field update from a draft string.
 * `trim() || undefined` normalizes empty/whitespace to absent, so clearing an
 * existing description emits an explicit `{ description: undefined }` (which
 * `Object.keys` counts, so both save and dismiss-detection see the clear).
 * Returns `{}` when unchanged.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function computeDescriptionUpdate(
  activity: Activity,
  draft: string,
): Partial<Activity> {
  const next = draft.trim() || undefined;
  if (next !== (activity.description ?? undefined)) return { description: next };
  return {};
}

/**
 * Builds the General-section field updates: name, status, and actual duration.
 *
 * Two behaviours here are easy to misread and are pinned by tests:
 *  - A name that trims to empty is IGNORED, not saved and not rejected. The modal has no
 *    error state for it; the field simply keeps its previous value on save.
 *  - Leaving a completed/in-progress status emits an explicit `{ actualDuration: undefined }`
 *    to CLEAR the recorded duration — an own-property whose value is undefined, which
 *    `Object.keys` counts. Same convention as computeDescriptionUpdate. The clear only
 *    fires when there was something to clear.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function computeGeneralUpdates(
  activity: Activity,
  name: string,
  status: ActivityStatus,
  actualDuration: string | number,
  actualStartDate?: string,
  actualFinishDate?: string,
): Partial<Activity> {
  const updates: Partial<Activity> = {};

  const trimmed = name.trim();
  if (trimmed && trimmed !== activity.name) updates.name = trimmed;
  if (status !== activity.status) updates.status = status;

  if (status === "complete" || status === "inProgress") {
    if (actualDuration !== "" && actualDuration !== activity.actualDuration) {
      // Floor to a whole day and never below 1. NaN survives both Math.floor and
      // Math.max, so the isNaN guard below is what rejects non-numeric input.
      const dur = Math.max(1, Math.floor(Number(actualDuration)));
      if (!isNaN(dur)) updates.actualDuration = dur;
    }
  } else if (activity.actualDuration != null) {
    updates.actualDuration = undefined;
  }
  Object.assign(updates, computeRecordedDateUpdates(activity, status, actualStartDate, actualFinishDate));

  return updates;
}

/**
 * WI-137: the two recorded dates. `undefined` drafts mean "not shown here" and change nothing;
 * an empty draft clears. Planned clears both; In Progress clears the finish.
 */
function computeRecordedDateUpdates(
  activity: Activity,
  status: ActivityStatus,
  start: string | undefined,
  finish: string | undefined,
): Partial<Activity> {
  const updates: Partial<Activity> = {};
  const wantStart = status === "planned" ? "" : start;
  const wantFinish = status === "complete" ? finish : "";
  if (wantStart !== undefined && wantStart !== (activity.actualStartDate ?? "")) {
    updates.actualStartDate = wantStart || undefined;
  }
  if (wantFinish !== undefined && wantFinish !== (activity.actualFinishDate ?? "")) {
    updates.actualFinishDate = wantFinish || undefined;
  }
  return updates;
}

/**
 * Builds the Estimates-section field updates.
 *
 * Each numeric field is skipped when its draft is the empty string — a half-typed field
 * must not overwrite a stored estimate with NaN — and otherwise compared numerically, so
 * retyping "5" over a stored 5 produces no update.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function computeEstimateUpdates(
  activity: Activity,
  min: string | number,
  mostLikely: string | number,
  max: string | number,
  confidenceLevel: RSMLevel,
  distributionType: DistributionType,
): Partial<Activity> {
  const updates: Partial<Activity> = {};

  if (min !== "" && Number(min) !== activity.min) updates.min = Number(min);
  if (mostLikely !== "" && Number(mostLikely) !== activity.mostLikely) {
    updates.mostLikely = Number(mostLikely);
  }
  if (max !== "" && Number(max) !== activity.max) updates.max = Number(max);
  if (confidenceLevel !== activity.confidenceLevel) updates.confidenceLevel = confidenceLevel;
  if (distributionType !== activity.distributionType) {
    updates.distributionType = distributionType;
  }

  return updates;
}

/**
 * Display-only list of predecessors/successors for a single activity.
 *
 * Neither action closes the activity modal. The dependency dialog STACKS on top of it,
 * and that is load-bearing, not cosmetic: this component used to call the parent's
 * `onClose()` before handing off, which unmounted ActivityEditModal and silently
 * discarded every unsaved draft in it (name, estimates, constraint, description,
 * checklist, deliverables, notes). The unsaved-changes guard did not fire, because it
 * hangs off `Dialog.Root onOpenChange` — Escape and overlay clicks route through it,
 * a direct `onClose()` does not. Keeping the parent mounted also means the new
 * dependency appears in this list on its own (`relatedDeps` derives from a live store
 * selector) and the section stays expanded, since nothing remounted.
 *
 * Do not reintroduce an `onClose` prop here.
 */
export function DependenciesDisplaySection({
  relatedDeps,
  activityId,
  activityNameById,
  onEditDependency,
  onAddDependency,
}: {
  relatedDeps: ActivityDependency[];
  activityId: string;
  activityNameById: (id: string) => string;
  onEditDependency?: (fromId: string, toId: string) => void;
  onAddDependency?: (fromId: string) => void;
}) {
  return (
    <>
      {relatedDeps.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No dependencies involving this activity.
        </p>
      ) : (
        <div className="space-y-2">
          {relatedDeps.map((dep) => {
            const isPred = dep.toActivityId === activityId;
            const otherId = isPred ? dep.fromActivityId : dep.toActivityId;
            return (
              <div
                key={`${dep.fromActivityId}-${dep.toActivityId}`}
                className="flex items-center justify-between gap-2 px-2 py-1.5 rounded bg-gray-50 dark:bg-gray-700/50 text-sm"
              >
                <div className="flex-1 min-w-0">
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {isPred ? "Pred:" : "Succ:"}
                  </span>{" "}
                  <span className="text-gray-700 dark:text-gray-300 truncate">
                    {activityNameById(otherId)}
                  </span>
                  <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                    {dependencyLabel(dep.type)}{formatDepLagSuffix(dep.lagDays)}
                  </span>
                </div>
                {onEditDependency && (
                  <button
                    type="button"
                    onClick={() => onEditDependency(dep.fromActivityId, dep.toActivityId)}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 shrink-0"
                  >
                    Edit
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {onAddDependency && (
        <button
          type="button"
          onClick={() => onAddDependency(activityId)}
          className="mt-2 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
        >
          + Add Dependency
        </button>
      )}
    </>
  );
}

/** Display-only schedule analysis grid: dates, duration, float values. */
export function ScheduleAnalysisSection({
  sa,
  formatDate,
}: {
  sa: { startDate: string; endDate: string; duration: number; totalFloat?: number; freeFloat?: number | null };
  formatDate: (iso: string) => string;
}) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
      <div className="text-gray-500 dark:text-gray-400">Scheduled Start</div>
      <div className="text-gray-900 dark:text-gray-100">{formatDate(sa.startDate)}</div>
      <div className="text-gray-500 dark:text-gray-400">Scheduled Finish</div>
      <div className="text-gray-900 dark:text-gray-100">{formatDate(sa.endDate)}</div>
      <div className="text-gray-500 dark:text-gray-400">Duration</div>
      <div className="text-gray-900 dark:text-gray-100">{sa.duration} working {pluralize(sa.duration, "day")}</div>
      <div className="text-gray-500 dark:text-gray-400">Total Float</div>
      <div className="text-gray-900 dark:text-gray-100">
        {totalFloatLabel(sa.totalFloat)}
      </div>
      {sa.freeFloat != null && (
        <>
          <div className="text-gray-500 dark:text-gray-400">Free Float</div>
          <div className="text-gray-900 dark:text-gray-100">{sa.freeFloat} {pluralize(sa.freeFloat, "day")}</div>
        </>
      )}
    </div>
  );
}
