// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type {
  Activity,
  Calendar,
  DistributionType,
  ScheduledActivity,
} from "@domain/models/types";
import type { WorkCalendar } from "@core/calendar/work-calendar";
import {
  DISTRIBUTION_TYPES,
  ACTIVITY_STATUSES,
} from "@domain/models/types";
import { ActivitySchema } from "@domain/schemas/project.schema";
import { recommendDistribution } from "@core/recommendation/recommendation";
import { computeHeuristic } from "@core/estimation/heuristic";
import { useDateFormat } from "@ui/hooks/use-date-format";
import {
  distributionLabel,
  distributionShortLabel,
  statusLabel,
} from "@domain/helpers/format-labels";
import { focusField, focusNextRow, focusPrevRow, computeElapsedDays } from "./activity-row-helpers";
import { EstimateInputs } from "./EstimateInputs";
import { ConfidenceLevelSelect } from "./ConfidenceLevelSelect";
import { DistributionSparkline } from "./DistributionSparkline";
import { GRID_COLUMNS, GRID_COLUMNS_WITH_CONSTRAINT } from "./grid-columns";

interface UnifiedActivityRowProps {
  activity: Activity;
  scheduledActivity?: ScheduledActivity;
  activityProbabilityTarget: number;
  autoFocusName?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (activityId: string) => void;
  onUpdate: (activityId: string, updates: Partial<Activity>) => void;
  onDelete: (activityId: string) => void;
  onValidityChange: (activityId: string, isValid: boolean) => void;
  isLocked?: boolean;
  heuristicEnabled?: boolean;
  heuristicMinPercent?: number;
  heuristicMaxPercent?: number;
  calendar?: WorkCalendar | Calendar;
  dependencyMode?: boolean;
  onEditActivity?: (activityId: string) => void;
  hasConstraintWarning?: boolean;
  activityNumber?: number;
}

type FieldErrors = Partial<Record<string, string>>;

/** Compact progress bars for tasks and/or deliverables beneath the activity name. */
function ActivityProgressBars({
  activity,
  onEditActivity,
}: {
  activity: Activity;
  onEditActivity?: (id: string) => void;
}) {
  const hasTasks = activity.checklist && activity.checklist.length > 0;
  const hasDeliverables = activity.deliverables && activity.deliverables.length > 0;
  const hasNotes = !!(activity.notes && activity.notes.trim().length > 0);
  if (!hasTasks && !hasDeliverables && !hasNotes) return null;

  const tasksDone = hasTasks ? activity.checklist!.filter((c) => c.completed).length : 0;
  const tasksTotal = hasTasks ? activity.checklist!.length : 0;
  const tasksAllDone = hasTasks && tasksDone === tasksTotal;

  const delDone = hasDeliverables ? activity.deliverables!.filter((d) => d.completed).length : 0;
  const delTotal = hasDeliverables ? activity.deliverables!.length : 0;
  const delAllDone = hasDeliverables && delDone === delTotal;

  const both = hasTasks && hasDeliverables;

  return (
    <div
      className={`mt-0.5 flex gap-0.5 cursor-pointer`}
      onClick={() => onEditActivity?.(activity.id)}
      title={[
        hasTasks ? `Tasks: ${tasksDone}/${tasksTotal}` : "",
        hasDeliverables ? `Deliverables: ${delDone}/${delTotal}` : "",
        hasNotes ? "Has notes" : "",
      ].filter(Boolean).join(" · ")}
    >
      {hasTasks && (
        <div className={`${both ? "flex-1" : "w-full"} h-0.5 rounded-full bg-gray-200 dark:bg-gray-600 overflow-hidden`}>
          <div
            className={`h-full rounded-full transition-all ${tasksAllDone ? "bg-green-500 dark:bg-green-400" : "bg-blue-500 dark:bg-blue-400"}`}
            style={{ width: `${(tasksDone / tasksTotal) * 100}%` }}
          />
        </div>
      )}
      {hasDeliverables && (
        <div className={`${both ? "flex-1" : "w-full"} h-0.5 rounded-full bg-gray-200 dark:bg-gray-600 overflow-hidden`}>
          <div
            className={`h-full rounded-full transition-all ${delAllDone ? "bg-green-500 dark:bg-green-400" : "bg-indigo-500 dark:bg-indigo-400"}`}
            style={{ width: `${(delDone / delTotal) * 100}%` }}
          />
        </div>
      )}
      {hasNotes && (
        <div className="w-2.5 h-0.5 rounded-full bg-violet-500 dark:bg-violet-400 shrink-0" />
      )}
    </div>
  );
}

export function UnifiedActivityRow({
  activity,
  scheduledActivity,
  activityProbabilityTarget,
  autoFocusName,
  isSelected,
  onToggleSelect,
  onUpdate,
  onDelete,
  onValidityChange,
  isLocked,
  heuristicEnabled,
  heuristicMinPercent = 50,
  heuristicMaxPercent = 200,
  calendar,
  dependencyMode,
  onEditActivity,
  hasConstraintWarning,
  activityNumber,
}: UnifiedActivityRowProps) {
  const nameInputRef = useRef<HTMLInputElement>(null);
  const formatDate = useDateFormat();
  const gridCols = dependencyMode ? GRID_COLUMNS_WITH_CONSTRAINT : GRID_COLUMNS;

  useEffect(() => {
    if (autoFocusName && nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, [autoFocusName]);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: activity.id });

  const sortableStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const [errors, setErrors] = useState<FieldErrors>({});
  const [, setTouchedFields] = useState<Set<string>>(() => {
    const allEqual =
      activity.min === activity.mostLikely &&
      activity.mostLikely === activity.max;
    return allEqual
      ? new Set<string>()
      : new Set(["min", "mostLikely", "max"]);
  });

  const allEstimatesTouched = (touched: Set<string>) =>
    touched.has("min") && touched.has("mostLikely") && touched.has("max");

  const validateAndUpdate = useCallback(
    (field: string, value: number | string, touched: Set<string>) => {
      const updates = { [field]: value };
      const candidate = { ...activity, ...updates };

      const result = ActivitySchema.safeParse(candidate);
      if (result.success) {
        setErrors((prev) => {
          const next = { ...prev };
          delete next[field];
          delete next["min"];
          delete next["mostLikely"];
          return next;
        });
        onValidityChange(activity.id, true);
      } else if (allEstimatesTouched(touched)) {
        const fieldErrors: FieldErrors = {};
        for (const issue of result.error.issues) {
          const path = issue.path.join(".");
          fieldErrors[path] = issue.message;
        }
        setErrors((prev) => ({ ...prev, ...fieldErrors }));
        onValidityChange(activity.id, false);
      }

      onUpdate(activity.id, updates);
    },
    [activity, onUpdate, onValidityChange]
  );

  const handleBlur = useCallback(
    (field: "min" | "mostLikely" | "max", rawValue: string) => {
      const parsed = parseFloat(rawValue);
      if (!isNaN(parsed)) {
        const num = Math.round(parsed);
        // When heuristic is enabled and ML actually changed, auto-calculate min/max
        if (heuristicEnabled && field === "mostLikely" && num !== activity.mostLikely) {
          const { min: minRaw, max: maxRaw } = computeHeuristic(num, heuristicMinPercent, heuristicMaxPercent);
          const min = Math.round(minRaw);
          const max = Math.round(maxRaw);
          setTouchedFields((prev) => {
            const next = new Set(prev);
            next.add("min");
            next.add("mostLikely");
            next.add("max");
            return next;
          });
          // Update all three fields together
          const updates = { mostLikely: num, min, max };
          const candidate = { ...activity, ...updates };
          const result = ActivitySchema.safeParse(candidate);
          if (result.success) {
            setErrors({});
            onValidityChange(activity.id, true);
          }
          onUpdate(activity.id, updates);
          // Sync min/max input elements with new values
          const minEl = document.querySelector<HTMLInputElement>(
            `[data-row-id="${activity.id}"][data-field="min"]`
          );
          const maxEl = document.querySelector<HTMLInputElement>(
            `[data-row-id="${activity.id}"][data-field="max"]`
          );
          if (minEl) minEl.value = String(min);
          if (maxEl) maxEl.value = String(max);
        } else {
          setTouchedFields((prev) => {
            const next = new Set(prev);
            next.add(field);
            validateAndUpdate(field, num, next);
            return next;
          });
        }
      }
    },
    [validateAndUpdate, heuristicEnabled, heuristicMinPercent, heuristicMaxPercent, activity, onUpdate, onValidityChange]
  );

  const isComplete = activity.status === "complete";
  const isInProgress = activity.status === "inProgress";

  const handleTabNav = useCallback(
    (
      e: React.KeyboardEvent,
      currentField: "name" | "min" | "ml" | "max" | "confidence" | "distribution" | "status" | "actual"
    ) => {
      if (e.key !== "Tab") return;

      // Build field order based on heuristic mode, completion status,
      // and whether confidence applies to this distribution type
      const confidenceApplies =
        activity.distributionType === "normal" || activity.distributionType === "logNormal";
      let fieldOrder: string[];
      if (heuristicEnabled) {
        fieldOrder = confidenceApplies
          ? ["name", "ml", "confidence", "distribution", "status"]
          : ["name", "ml", "distribution", "status"];
        if (isComplete || isInProgress) fieldOrder.push("actual");
      } else {
        fieldOrder = (isComplete || isInProgress)
          ? ["name", "min", "ml", "max", "actual"]
          : ["name", "min", "ml", "max"];
      }
      const idx = fieldOrder.indexOf(currentField);
      const lastField = fieldOrder[fieldOrder.length - 1];

      // When heuristic is on and user clicked directly into min or max
      // (not in the tab-order), navigate relative to their position in the full layout:
      // min sits before ml, max sits after ml
      if (heuristicEnabled && idx === -1) {
        e.preventDefault();
        if (currentField === "min") {
          focusField(activity.id, e.shiftKey ? "name" : "ml");
        } else if (currentField === "max") {
          focusField(activity.id, e.shiftKey ? "ml" : (confidenceApplies ? "confidence" : "distribution"));
        }
        return;
      }

      if (!e.shiftKey && currentField === lastField) {
        // Tab from last field -> next row's Name (or Add button)
        e.preventDefault();
        const gridEl = (e.target as HTMLElement).closest(
          "[data-activity-grid]"
        );
        if (!gridEl) return;
        const rows = Array.from(
          gridEl.querySelectorAll<HTMLElement>("[data-row-id]")
        );
        const rowIds = [
          ...new Set(rows.map((r) => r.getAttribute("data-row-id")!)),
        ];
        focusNextRow(activity.id, rowIds);
      } else if (e.shiftKey && currentField === "name") {
        // Shift+Tab from Name -> prev row's last field
        e.preventDefault();
        const gridEl = (e.target as HTMLElement).closest(
          "[data-activity-grid]"
        );
        if (!gridEl) return;
        const rows = Array.from(
          gridEl.querySelectorAll<HTMLElement>("[data-row-id]")
        );
        const rowIds = [
          ...new Set(rows.map((r) => r.getAttribute("data-row-id")!)),
        ];
        // Hint to prev row what the last tabbable field is (status for heuristic, max for normal)
        focusPrevRow(activity.id, rowIds, heuristicEnabled ? "status" : undefined);
      } else if (!e.shiftKey) {
        // Tab forward within the row
        const nextField = fieldOrder[idx + 1];
        if (nextField) {
          e.preventDefault();
          focusField(activity.id, nextField);
        }
      } else {
        // Shift+Tab backward within the row
        const prevField = fieldOrder[idx - 1];
        if (prevField) {
          e.preventDefault();
          focusField(activity.id, prevField);
        }
      }
    },
    [activity.id, activity.distributionType, isComplete, isInProgress, heuristicEnabled]
  );

  const estimateFields = useMemo(
    () => [
      { dataField: "min", activityKey: "min", defaultValue: activity.min, error: errors["min"], title: "Optimistic estimate (days)" },
      { dataField: "ml", activityKey: "mostLikely", defaultValue: activity.mostLikely, error: errors["mostLikely"], title: "Most likely estimate (days)" },
      { dataField: "max", activityKey: "max", defaultValue: activity.max, error: errors["max"], title: "Pessimistic estimate (days)" },
    ],
    [activity.min, activity.mostLikely, activity.max, errors]
  );

  const recommendation = useMemo(
    () =>
      recommendDistribution(
        activity.min,
        activity.mostLikely,
        activity.max,
        activity.confidenceLevel
      ),
    [activity.min, activity.mostLikely, activity.max, activity.confidenceLevel]
  );

  const targetPct = Math.round(activityProbabilityTarget * 100);

  const hasErrors = Object.keys(errors).length > 0;

  return (
    <div
      ref={setNodeRef}
      className={`group/row grid items-center gap-1 px-1 py-1.5 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50/50 dark:hover:bg-gray-700/50 text-sm ${
        hasErrors ? "bg-red-50/30 dark:bg-red-900/20" : ""
      } ${isDragging ? "opacity-80 bg-blue-50 dark:bg-blue-900/30 z-10 shadow-md" : ""}`}
      style={{
        gridTemplateColumns: gridCols,
        ...sortableStyle,
      }}
    >
      {/* Checkbox */}
      <div className="flex items-center justify-center">
        <input
          type="checkbox"
          checked={isSelected ?? false}
          onChange={() => onToggleSelect?.(activity.id)}
          className="rounded border-gray-300 dark:border-gray-600 dark:bg-gray-700"
          tabIndex={-1}
        />
      </div>

      {/* Grip handle */}
      <div className="flex items-center justify-center">
        {isLocked ? (
          <span
            className="text-gray-200 dark:text-gray-700 select-none text-base leading-none cursor-not-allowed"
            title="Scenario is locked"
          >
            &#x2261;
          </span>
        ) : (
          <button
            className="text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 cursor-grab active:cursor-grabbing select-none text-base leading-none"
            title="Drag to reorder"
            {...attributes}
            {...listeners}
            tabIndex={-1}
          >
            &#x2261;
          </button>
        )}
      </div>

      {/* Name */}
      <div className="relative">
        <div className={`flex items-center${onEditActivity ? " pr-5" : ""}`}>
          {activityNumber != null && (
            <span className="text-gray-400 dark:text-gray-500 text-xs font-mono select-none shrink-0 w-7 text-right mr-1">
              #{activityNumber}
            </span>
          )}
          <input
            ref={nameInputRef}
            data-row-id={activity.id}
            data-field="name"
            type="text"
            value={activity.name}
            onChange={(e) => onUpdate(activity.id, { name: e.target.value })}
            onKeyDown={(e) => handleTabNav(e, "name")}
            disabled={isLocked}
            className="flex-1 min-w-0 px-1.5 py-1 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded text-sm focus:border-blue-400 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            placeholder="Add an activity name"
          />
        </div>
        {onEditActivity && (
          <button
            type="button"
            onClick={() => onEditActivity(activity.id)}
            className="absolute right-0 top-0 h-full w-5 flex items-center justify-center opacity-0 group-hover/row:opacity-100 transition-opacity text-gray-400 dark:text-gray-500 hover:text-blue-500 dark:hover:text-blue-400"
            title="Edit activity"
            tabIndex={-1}
            aria-label="Edit activity"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
        )}
        <ActivityProgressBars activity={activity} onEditActivity={onEditActivity} />
      </div>

      {/* Schedule: Duration */}
      <div className="text-right tabular-nums text-gray-700 dark:text-gray-300 px-1">
        {scheduledActivity ? (
          <span>{scheduledActivity.duration}d</span>
        ) : (
          <span className="text-gray-300 dark:text-gray-600">&mdash;</span>
        )}
      </div>

      {/* Schedule: Start */}
      <div className="tabular-nums text-gray-700 dark:text-gray-300 text-sm px-1">
        {scheduledActivity ? (
          <span>{formatDate(scheduledActivity.startDate)}</span>
        ) : (
          <span className="text-gray-300 dark:text-gray-600">&mdash;</span>
        )}
      </div>

      {/* Schedule: End */}
      <div className="tabular-nums text-gray-700 dark:text-gray-300 text-sm px-1">
        {scheduledActivity ? (
          <span>{formatDate(scheduledActivity.endDate)}</span>
        ) : (
          <span className="text-gray-300 dark:text-gray-600">&mdash;</span>
        )}
      </div>

      {/* Constraint badge (dependency mode only) */}
      {dependencyMode && (
        <div className="px-0.5">
          <button
            type="button"
            onClick={() => onEditActivity?.(activity.id)}
            className={`w-full text-[10px] leading-tight rounded px-1 py-0.5 truncate text-center cursor-pointer ${
              activity.constraintType
                ? activity.constraintMode === "hard"
                  ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-600"
                  : hasConstraintWarning
                    ? "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-dashed border-amber-300 dark:border-amber-600"
                    : "bg-transparent text-gray-500 dark:text-gray-400 border border-dashed border-gray-300 dark:border-gray-600"
                : "text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400"
            }`}
            title={
              activity.constraintType
                ? `${activity.constraintType} ${activity.constraintDate ?? ""} (${activity.constraintMode ?? ""})`
                : "Click to add a constraint"
            }
          >
            {activity.constraintType
              ? `${activity.constraintType}${activity.constraintMode === "soft" ? " S" : ""}`
              : "\u2014"}
          </button>
        </div>
      )}

      {/* Min / ML / Max */}
      <EstimateInputs
        activityId={activity.id}
        fields={estimateFields}
        onBlur={handleBlur as (field: string, value: string) => void}
        onKeyDown={handleTabNav as (e: React.KeyboardEvent, field: string) => void}
        disabled={isLocked}
      />

      {/* Confidence */}
      <div>
        <ConfidenceLevelSelect
          value={activity.confidenceLevel}
          onChange={(level) =>
            onUpdate(activity.id, { confidenceLevel: level })
          }
          disabled={isLocked || (activity.distributionType !== "normal" && activity.distributionType !== "logNormal")}
          data-row-id={activity.id}
          data-field="confidence"
          onKeyDown={(e) => handleTabNav(e, "confidence")}
          tabIndex={heuristicEnabled ? 0 : -1}
        />
      </div>

      {/* Distribution */}
      <div className="flex items-center gap-0.5 group relative">
        <select
          data-row-id={activity.id}
          data-field="distribution"
          value={activity.distributionType}
          onChange={(e) =>
            onUpdate(activity.id, {
              distributionType: e.target.value as DistributionType,
            })
          }
          onKeyDown={(e) => handleTabNav(e, "distribution")}
          disabled={isLocked}
          className="w-full px-1 py-1 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded text-sm focus:border-blue-400 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
          tabIndex={heuristicEnabled ? 0 : -1}
        >
          {DISTRIBUTION_TYPES.map((dt) => (
            <option key={dt} value={dt}>
              {distributionLabel(dt)}
            </option>
          ))}
        </select>
        {!isLocked && recommendation.recommended !== activity.distributionType && (
          <button
            onClick={() =>
              onUpdate(activity.id, {
                distributionType: recommendation.recommended,
              })
            }
            className="shrink-0 px-1 py-0.5 bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 rounded text-[10px] hover:bg-amber-200 dark:hover:bg-amber-800/50"
            title={recommendation.rationale}
            tabIndex={-1}
          >
            {distributionShortLabel(recommendation.recommended)}
          </button>
        )}
        {/* Sparkline tooltip on hover */}
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-20 pointer-events-none">
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded shadow-lg p-1">
            <DistributionSparkline
              min={activity.min}
              mostLikely={activity.mostLikely}
              max={activity.max}
              distributionType={activity.distributionType}
              width={80}
              height={30}
            />
          </div>
        </div>
      </div>

      {/* Status */}
      <div>
        <select
          data-row-id={activity.id}
          data-field="status"
          value={activity.status}
          onChange={(e) => {
            const newStatus = e.target.value as Activity["status"];
            const updates: Partial<Activity> = { status: newStatus };
            if (newStatus === "inProgress" && scheduledActivity) {
              updates.actualDuration = computeElapsedDays(scheduledActivity.startDate, calendar);
            }
            if (newStatus === "planned") {
              updates.actualDuration = undefined;
            }
            onUpdate(activity.id, updates);
          }}
          onKeyDown={(e) => handleTabNav(e, "status")}
          disabled={isLocked}
          className="w-full px-1 py-1 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded text-sm focus:border-blue-400 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
          tabIndex={heuristicEnabled ? 0 : -1}
        >
          {ACTIVITY_STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </select>
      </div>

      {/* Actual duration (shown when complete or in-progress) */}
      <div>
        {(isComplete || isInProgress) ? (
          <input
            data-row-id={activity.id}
            data-field="actual"
            type="number"
            title={isInProgress
              ? "Working days elapsed since the scheduled start. Used as the minimum floor for simulation trials."
              : "Total working days from scheduled start to actual finish"
            }
            defaultValue={activity.actualDuration ?? ""}
            key={`${activity.id}-actual-${activity.status}-${activity.actualDuration ?? "empty"}`}
            onFocus={(e) => e.target.select()}
            onBlur={(e) => {
              const raw = e.target.value.trim();
              if (raw === "") {
                if (isInProgress && scheduledActivity) {
                  const elapsed = computeElapsedDays(scheduledActivity.startDate, calendar);
                  onUpdate(activity.id, { actualDuration: elapsed });
                  e.target.value = String(elapsed);
                } else {
                  onUpdate(activity.id, { actualDuration: undefined });
                }
                return;
              }
              const val = parseInt(raw, 10);
              if (!isNaN(val) && val >= 0) {
                onUpdate(activity.id, { actualDuration: val });
              }
            }}
            onKeyDown={(e) => handleTabNav(e, "actual")}
            disabled={isLocked}
            className="w-full px-1 py-1 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded text-sm tabular-nums text-right focus:border-blue-400 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            placeholder={isInProgress ? "Elapsed" : "Act."}
            min="0"
            step="1"
          />
        ) : (
          <span className="text-gray-300 dark:text-gray-600 text-xs px-1">&mdash;</span>
        )}
      </div>

      {/* Separator */}
      <div className="h-6 bg-gray-200 dark:bg-gray-600" />

      {/* Source badge with variance indicator */}
      <div className="text-center">
        {scheduledActivity ? (
          <div className="flex flex-col items-center gap-0.5">
            {scheduledActivity.isActual ? (
              <span className="text-green-600 dark:text-green-400 text-[10px] font-medium bg-green-50 dark:bg-green-900/30 px-1.5 py-0.5 rounded">
                Actual
              </span>
            ) : (
              <span className="text-blue-600 dark:text-blue-400 text-[10px] bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded">
                P{targetPct}
              </span>
            )}
            {/* Variance indicator when complete with actual duration */}
            {isComplete && activity.actualDuration != null && scheduledActivity && !scheduledActivity.isActual && (
              <VarianceIndicator
                estimated={scheduledActivity.duration}
                actual={activity.actualDuration}
              />
            )}
          </div>
        ) : null}
      </div>

      {/* Actions: Delete */}
      <div className="flex items-center justify-center">
        {isLocked ? (
          <span className="text-gray-300 dark:text-gray-600" title="Scenario is locked">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </span>
        ) : (
          <button
            onClick={() => {
              if (window.confirm("Are you sure you want to delete this activity?")) {
                onDelete(activity.id);
              }
            }}
            className="text-red-400 dark:text-red-500 hover:text-red-600 dark:hover:text-red-400 text-sm transition-colors"
            title="Delete activity"
            tabIndex={-1}
            aria-label="Delete activity"
          >
            &#10005;
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Small variance indicator showing actual vs estimated difference.
 */
function VarianceIndicator({
  estimated,
  actual,
}: {
  estimated: number;
  actual: number;
}) {
  const diff = actual - estimated;
  const pctDiff = estimated > 0 ? (diff / estimated) * 100 : 0;

  if (Math.abs(diff) < 0.1) {
    // On track
    return (
      <span
        className="text-[9px] text-gray-500 dark:text-gray-400"
        title={`Actual ${actual}d matches estimate ${estimated.toFixed(1)}d`}
      >
        ✓ On track
      </span>
    );
  }

  const isUnder = diff < 0;
  const colorClass = isUnder
    ? "text-green-600 dark:text-green-400"
    : "text-amber-600 dark:text-amber-400";

  return (
    <span
      className={`text-[9px] ${colorClass}`}
      title={`Actual: ${actual}d, Estimated: ${estimated.toFixed(1)}d (${isUnder ? "" : "+"}${pctDiff.toFixed(0)}%)`}
    >
      {isUnder ? "▼" : "▲"} {Math.abs(diff).toFixed(1)}d ({isUnder ? "" : "+"}
      {pctDiff.toFixed(0)}%)
    </span>
  );
}
