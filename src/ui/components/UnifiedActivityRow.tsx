import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type {
  Activity,
  DistributionType,
  ScheduledActivity,
} from "@domain/models/types";
import {
  DISTRIBUTION_TYPES,
  ACTIVITY_STATUSES,
} from "@domain/models/types";
import { ActivitySchema } from "@domain/schemas/project.schema";
import { recommendDistribution } from "@core/recommendation/recommendation";
import { useDateFormat } from "@ui/hooks/use-date-format";
import {
  distributionLabel,
  distributionShortLabel,
  statusLabel,
} from "@ui/helpers/format-labels";
import { ConfidenceLevelSelect } from "./ConfidenceLevelSelect";
import { DistributionSparkline } from "./DistributionSparkline";
import { GRID_COLUMNS } from "./grid-columns";

interface UnifiedActivityRowProps {
  activity: Activity;
  scheduledActivity?: ScheduledActivity;
  activityProbabilityTarget: number;
  autoFocusName?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (activityId: string) => void;
  onUpdate: (activityId: string, updates: Partial<Activity>) => void;
  onDelete: (activityId: string) => void;
  onDuplicate: (activityId: string) => void;
  onValidityChange: (activityId: string, isValid: boolean) => void;
  isLocked?: boolean;
}

type FieldErrors = Partial<Record<string, string>>;

function focusField(rowId: string, field: string) {
  const el = document.querySelector<HTMLElement>(
    `[data-row-id="${rowId}"][data-field="${field}"]`
  );
  if (el) {
    el.focus();
    return true;
  }
  return false;
}

function focusNextRow(currentRowId: string, activities: string[]) {
  const idx = activities.indexOf(currentRowId);
  if (idx >= 0 && idx < activities.length - 1) {
    return focusField(activities[idx + 1]!, "name");
  }
  // Focus the add-activity button if last row
  const addBtn = document.querySelector<HTMLElement>(
    '[data-field="add-activity"]'
  );
  if (addBtn) {
    addBtn.focus();
    return true;
  }
  return false;
}

function focusPrevRow(currentRowId: string, activities: string[]) {
  const idx = activities.indexOf(currentRowId);
  if (idx > 0) {
    return focusField(activities[idx - 1]!, "max");
  }
  return false;
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
  onDuplicate,
  onValidityChange,
  isLocked,
}: UnifiedActivityRowProps) {
  const nameInputRef = useRef<HTMLInputElement>(null);
  const formatDate = useDateFormat();

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
      const num = parseFloat(rawValue);
      if (!isNaN(num)) {
        setTouchedFields((prev) => {
          const next = new Set(prev);
          next.add(field);
          validateAndUpdate(field, num, next);
          return next;
        });
      }
    },
    [validateAndUpdate]
  );

  const handleTabNav = useCallback(
    (
      e: React.KeyboardEvent,
      currentField: "name" | "min" | "ml" | "max"
    ) => {
      if (e.key !== "Tab") return;

      const fieldOrder = ["name", "min", "ml", "max"];
      const idx = fieldOrder.indexOf(currentField);

      if (!e.shiftKey && currentField === "max") {
        // Tab from Max -> next row's Name (or Add button)
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
        // Shift+Tab from Name -> prev row's Max
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
        focusPrevRow(activity.id, rowIds);
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
    [activity.id]
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

  const isComplete = activity.status === "complete";
  const targetPct = Math.round(activityProbabilityTarget * 100);

  const hasErrors = Object.keys(errors).length > 0;

  return (
    <div
      ref={setNodeRef}
      className={`grid items-center gap-1 px-1 py-1.5 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50/50 dark:hover:bg-gray-700/50 text-sm ${
        hasErrors ? "bg-red-50/30 dark:bg-red-900/20" : ""
      } ${isDragging ? "opacity-80 bg-blue-50 dark:bg-blue-900/30 z-10 shadow-md" : ""}`}
      style={{
        gridTemplateColumns: GRID_COLUMNS,
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
      <div>
        <input
          ref={nameInputRef}
          data-row-id={activity.id}
          data-field="name"
          type="text"
          value={activity.name}
          onChange={(e) => onUpdate(activity.id, { name: e.target.value })}
          onKeyDown={(e) => handleTabNav(e, "name")}
          className="w-full px-1.5 py-1 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded text-sm focus:border-blue-400 focus:outline-none"
          placeholder="Add an activity name"
        />
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

      {/* Min */}
      <div>
        <input
          data-row-id={activity.id}
          data-field="min"
          type="number"
          defaultValue={activity.min}
          onBlur={(e) => handleBlur("min", e.target.value)}
          onKeyDown={(e) => handleTabNav(e, "min")}
          className={`w-full px-1 py-1 border rounded text-sm tabular-nums text-right dark:bg-gray-700 dark:text-gray-100 ${
            errors["min"] ? "border-red-400 bg-red-50 dark:bg-red-900/30" : "border-gray-200 dark:border-gray-600"
          } focus:border-blue-400 focus:outline-none`}
          step="1"
          min="0"
          title={errors["min"] ?? "Optimistic estimate (days)"}
        />
      </div>

      {/* ML */}
      <div>
        <input
          data-row-id={activity.id}
          data-field="ml"
          type="number"
          defaultValue={activity.mostLikely}
          onBlur={(e) => handleBlur("mostLikely", e.target.value)}
          onKeyDown={(e) => handleTabNav(e, "ml")}
          className={`w-full px-1 py-1 border rounded text-sm tabular-nums text-right dark:bg-gray-700 dark:text-gray-100 ${
            errors["mostLikely"]
              ? "border-red-400 bg-red-50 dark:bg-red-900/30"
              : "border-gray-200 dark:border-gray-600"
          } focus:border-blue-400 focus:outline-none`}
          step="1"
          min="0"
          title={errors["mostLikely"] ?? "Most likely estimate (days)"}
        />
      </div>

      {/* Max */}
      <div>
        <input
          data-row-id={activity.id}
          data-field="max"
          type="number"
          defaultValue={activity.max}
          onBlur={(e) => handleBlur("max", e.target.value)}
          onKeyDown={(e) => handleTabNav(e, "max")}
          className={`w-full px-1 py-1 border rounded text-sm tabular-nums text-right dark:bg-gray-700 dark:text-gray-100 ${
            errors["max"] ? "border-red-400 bg-red-50 dark:bg-red-900/30" : "border-gray-200 dark:border-gray-600"
          } focus:border-blue-400 focus:outline-none`}
          step="1"
          min="0"
          title={errors["max"] ?? "Pessimistic estimate (days)"}
        />
      </div>

      {/* Confidence */}
      <div>
        <ConfidenceLevelSelect
          value={activity.confidenceLevel}
          onChange={(level) =>
            onUpdate(activity.id, { confidenceLevel: level })
          }
        />
      </div>

      {/* Distribution */}
      <div className="flex items-center gap-0.5 group relative">
        <select
          value={activity.distributionType}
          onChange={(e) =>
            onUpdate(activity.id, {
              distributionType: e.target.value as DistributionType,
            })
          }
          className="w-full px-1 py-1 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded text-sm focus:border-blue-400 focus:outline-none"
          tabIndex={-1}
        >
          {DISTRIBUTION_TYPES.map((dt) => (
            <option key={dt} value={dt}>
              {distributionLabel(dt)}
            </option>
          ))}
        </select>
        {recommendation.recommended !== activity.distributionType && (
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
          value={activity.status}
          onChange={(e) =>
            onUpdate(activity.id, {
              status: e.target.value as Activity["status"],
            })
          }
          className="w-full px-1 py-1 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded text-sm focus:border-blue-400 focus:outline-none"
          tabIndex={-1}
        >
          {ACTIVITY_STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </select>
      </div>

      {/* Actual duration (shown when complete) */}
      <div>
        {isComplete ? (
          <input
            type="number"
            defaultValue={activity.actualDuration ?? ""}
            onBlur={(e) => {
              const val = parseInt(e.target.value, 10);
              if (!isNaN(val)) {
                onUpdate(activity.id, { actualDuration: val });
              }
            }}
            className="w-full px-1 py-1 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded text-sm tabular-nums text-right focus:border-blue-400 focus:outline-none"
            placeholder="Act."
            min="0"
            step="1"
            tabIndex={-1}
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

      {/* Actions: Duplicate and Delete */}
      <div className="flex items-center justify-center gap-1">
        {isLocked ? (
          <span className="text-gray-300 dark:text-gray-600 text-xs" title="Scenario is locked">
            🔒
          </span>
        ) : (
          <>
            <button
              onClick={() => onDuplicate(activity.id)}
              className="text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 text-sm transition-colors"
              title="Duplicate activity"
              tabIndex={-1}
              aria-label="Duplicate activity"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
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
          </>
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
