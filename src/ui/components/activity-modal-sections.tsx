// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useId, useState } from "react";
import type {
  Activity,
  ActivityDependency,
  ActivityStatus,
  ConstraintMode,
  ConstraintType,
} from "@domain/models/types";
import { dependencyLabel } from "@domain/helpers/format-labels";

function actualDurTitle(status: ActivityStatus): string {
  if (status === "planned") return "Set status to In Progress or Complete to enter actual duration";
  if (status === "inProgress") return "Working days elapsed since the scheduled start. Used as the minimum floor for simulation trials.";
  return "Total working days from scheduled start to actual finish";
}

function formatDepLagSuffix(lagDays: number): string {
  if (lagDays === 0) return "";
  return `, ${lagDays > 0 ? "+" : ""}${lagDays}d`;
}

function totalFloatLabel(totalFloat: number | null | undefined): string {
  if (totalFloat === 0) return "Critical path — 0 days float";
  if (totalFloat == null) return "—";
  return `${totalFloat} days`;
}

/** Schedule context row: Sched. Finish, Sched. Duration, Actual Duration, Actual Finish */
export function ScheduleContextRow({
  status,
  sa,
  scheduledStartDate,
  actualDuration,
  actualFinishDate,
  committedFinishDate,
  formatDate,
  handleActualDurationChange,
  handleActualFinishDateChange,
  handleActualFinishDateBlur,
  setActualDuration,
}: {
  status: ActivityStatus;
  sa: { endDate: string; duration: number };
  scheduledStartDate: string;
  actualDuration: number | "";
  actualFinishDate: string;
  committedFinishDate: string;
  formatDate: (iso: string) => string;
  handleActualDurationChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleActualFinishDateChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleActualFinishDateBlur: (e: React.FocusEvent<HTMLInputElement>) => void;
  setActualDuration: (v: number | "") => void;
}) {
  const baseId = useId();
  const actualDurId = `${baseId}-actualdur`;
  const actualFinId = `${baseId}-actualfin`;
  return (
    <div className={`grid gap-3 ${status === "complete" ? "grid-cols-[1fr_1fr_auto_4.5rem_1.3fr]" : "grid-cols-4"}`}>
      {/* Col 1: Scheduled Start (display only — always) */}
      <div>
        <div className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
          Sched. Start
        </div>
        <p className="text-sm text-gray-900 dark:text-gray-100 py-1.5">
          {formatDate(scheduledStartDate)}
        </p>
      </div>

      {/* Col 2: Scheduled Finish (display only — always) */}
      <div>
        <div className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 whitespace-nowrap">
          Sched. Finish
        </div>
        <p className="text-sm text-gray-900 dark:text-gray-100 py-1.5">
          {formatDate(sa.endDate)}
        </p>
      </div>

      {/* Col 3: Scheduled Duration (display only — always) */}
      <div>
        <div className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
          Sched. Dur.
        </div>
        <p className="text-sm text-gray-900 dark:text-gray-100 py-1.5">
          {sa.duration}d
        </p>
      </div>

      {/* Col 4: Actual Duration — disabled for planned, editable for inProgress + complete */}
      <div title={actualDurTitle(status)}>
        <label htmlFor={actualDurId} className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
          Actual Dur.
        </label>
        <input
          id={actualDurId}
          name="actualDuration"
          type="number"
          min={1}
          value={actualDuration}
          placeholder={status === "inProgress" ? "Elapsed" : undefined}
          onChange={
            status === "complete"
              ? handleActualDurationChange
              : (e) => setActualDuration(e.target.value === "" ? "" : Number(e.target.value))
          }
          disabled={status === "planned"}
          className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:border-blue-400 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
        />
      </div>

      {/* Col 4: Actual Finish Date — complete only */}
      {status === "complete" && (
        <div title="Entering a date auto-calculates duration; entering a duration auto-calculates this date">
          <label htmlFor={actualFinId} className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Actual Finish
          </label>
          <input
            id={actualFinId}
            name="actualFinishDate"
            type="date"
            value={actualFinishDate}
            onChange={handleActualFinishDateChange}
            onBlur={handleActualFinishDateBlur}
            min={scheduledStartDate}
            className={`w-full text-sm border rounded px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:border-blue-400 focus:outline-none ${
              committedFinishDate && committedFinishDate < scheduledStartDate
                ? "border-red-400 dark:border-red-500"
                : "border-gray-300 dark:border-gray-600"
            }`}
          />
          {committedFinishDate && committedFinishDate < scheduledStartDate && (
            <p className="text-xs text-red-500 dark:text-red-400 mt-0.5">
              Finish date cannot be before the scheduled start.
            </p>
          )}
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
          <span className="text-xs font-normal text-gray-400 dark:text-gray-500">{subtitle}</span>
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

/** Display-only list of predecessors/successors for a single activity. */
export function DependenciesDisplaySection({
  relatedDeps,
  activityId,
  activityNameById,
  onClose,
  onEditDependency,
  onAddDependency,
}: {
  relatedDeps: ActivityDependency[];
  activityId: string;
  activityNameById: (id: string) => string;
  onClose: () => void;
  onEditDependency?: (fromId: string, toId: string) => void;
  onAddDependency?: (fromId: string) => void;
}) {
  return (
    <>
      {relatedDeps.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">
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
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {isPred ? "Pred:" : "Succ:"}
                  </span>{" "}
                  <span className="text-gray-700 dark:text-gray-300 truncate">
                    {activityNameById(otherId)}
                  </span>
                  <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
                    {dependencyLabel(dep.type)}{formatDepLagSuffix(dep.lagDays)}
                  </span>
                </div>
                {onEditDependency && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onEditDependency(dep.fromActivityId, dep.toActivityId);
                    }}
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
          onClick={() => {
            onClose();
            onAddDependency(activityId);
          }}
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
      <div className="text-gray-900 dark:text-gray-100">{sa.duration} working days</div>
      <div className="text-gray-500 dark:text-gray-400">Total Float</div>
      <div className="text-gray-900 dark:text-gray-100">
        {totalFloatLabel(sa.totalFloat)}
      </div>
      {sa.freeFloat != null && (
        <>
          <div className="text-gray-500 dark:text-gray-400">Free Float</div>
          <div className="text-gray-900 dark:text-gray-100">{sa.freeFloat} days</div>
        </>
      )}
    </div>
  );
}
