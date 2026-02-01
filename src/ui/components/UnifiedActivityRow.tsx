import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type {
  Activity,
  RSMLevel,
  DistributionType,
  ScheduledActivity,
} from "@domain/models/types";
import {
  RSM_LEVELS,
  RSM_LABELS,
  DISTRIBUTION_TYPES,
  ACTIVITY_STATUSES,
} from "@domain/models/types";
import { ActivitySchema } from "@domain/schemas/project.schema";
import { recommendDistribution } from "@core/recommendation/recommendation";
import { formatDateDisplay } from "@core/calendar/calendar";
import { GRID_COLUMNS } from "./grid-columns";

interface UnifiedActivityRowProps {
  activity: Activity;
  scheduledActivity?: ScheduledActivity;
  activityProbabilityTarget: number;
  autoFocusName?: boolean;
  onUpdate: (activityId: string, updates: Partial<Activity>) => void;
  onDelete: (activityId: string) => void;
  onValidityChange: (activityId: string, isValid: boolean) => void;
}

type FieldErrors = Partial<Record<string, string>>;

export function UnifiedActivityRow({
  activity,
  scheduledActivity,
  activityProbabilityTarget,
  autoFocusName,
  onUpdate,
  onDelete,
  onValidityChange,
}: UnifiedActivityRowProps) {
  const nameInputRef = useRef<HTMLInputElement>(null);

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
  // If estimates are already differentiated, treat all three as touched so
  // editing any single field triggers validation immediately.
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
        // Only show cross-field errors once all three estimate fields have been visited
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
      className={`grid items-center gap-1 px-1 py-1.5 border-b border-gray-100 hover:bg-gray-50/50 text-sm ${
        hasErrors ? "bg-red-50/30" : ""
      } ${isDragging ? "opacity-80 bg-blue-50 z-10 shadow-md" : ""}`}
      style={{
        gridTemplateColumns: GRID_COLUMNS,
        ...sortableStyle,
      }}
    >
      {/* Grip handle */}
      <div className="flex items-center justify-center">
        <button
          className="text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing select-none text-base leading-none"
          title="Drag to reorder"
          {...attributes}
          {...listeners}
        >
          &#x2261;
        </button>
      </div>

      {/* Name */}
      <div>
        <input
          ref={nameInputRef}
          type="text"
          value={activity.name}
          onChange={(e) => onUpdate(activity.id, { name: e.target.value })}
          className="w-full px-1.5 py-1 border border-gray-200 rounded text-sm focus:border-blue-400 focus:outline-none"
          placeholder="Add an activity name"
        />
      </div>

      {/* Schedule: Duration */}
      <div className="text-right tabular-nums text-gray-700 px-1">
        {scheduledActivity ? (
          <span>{scheduledActivity.duration}d</span>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </div>

      {/* Schedule: Start */}
      <div className="tabular-nums text-gray-700 text-sm px-1">
        {scheduledActivity ? (
          <span>{formatDateDisplay(scheduledActivity.startDate)}</span>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </div>

      {/* Schedule: End */}
      <div className="tabular-nums text-gray-700 text-sm px-1">
        {scheduledActivity ? (
          <span>{formatDateDisplay(scheduledActivity.endDate)}</span>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </div>

      {/* Min */}
      <div>
        <input
          type="number"
          defaultValue={activity.min}
          onBlur={(e) => handleBlur("min", e.target.value)}
          className={`w-full px-1 py-1 border rounded text-sm tabular-nums text-right ${
            errors["min"] ? "border-red-400 bg-red-50" : "border-gray-200"
          } focus:border-blue-400 focus:outline-none`}
          step="1"
          min="0"
          title={errors["min"] ?? "Optimistic estimate (days)"}
        />
      </div>

      {/* ML */}
      <div>
        <input
          type="number"
          defaultValue={activity.mostLikely}
          onBlur={(e) => handleBlur("mostLikely", e.target.value)}
          className={`w-full px-1 py-1 border rounded text-sm tabular-nums text-right ${
            errors["mostLikely"]
              ? "border-red-400 bg-red-50"
              : "border-gray-200"
          } focus:border-blue-400 focus:outline-none`}
          step="1"
          min="0"
          title={errors["mostLikely"] ?? "Most likely estimate (days)"}
        />
      </div>

      {/* Max */}
      <div>
        <input
          type="number"
          defaultValue={activity.max}
          onBlur={(e) => handleBlur("max", e.target.value)}
          className={`w-full px-1 py-1 border rounded text-sm tabular-nums text-right ${
            errors["max"] ? "border-red-400 bg-red-50" : "border-gray-200"
          } focus:border-blue-400 focus:outline-none`}
          step="1"
          min="0"
          title={errors["max"] ?? "Pessimistic estimate (days)"}
        />
      </div>

      {/* Confidence */}
      <div>
        <select
          value={activity.confidenceLevel}
          onChange={(e) =>
            onUpdate(activity.id, {
              confidenceLevel: e.target.value as RSMLevel,
            })
          }
          className="w-full px-1 py-1 border border-gray-200 rounded text-sm focus:border-blue-400 focus:outline-none"
        >
          {RSM_LEVELS.map((level) => (
            <option key={level} value={level}>
              {RSM_LABELS[level]}
            </option>
          ))}
        </select>
      </div>

      {/* Distribution */}
      <div className="flex items-center gap-0.5">
        <select
          value={activity.distributionType}
          onChange={(e) =>
            onUpdate(activity.id, {
              distributionType: e.target.value as DistributionType,
            })
          }
          className="w-full px-1 py-1 border border-gray-200 rounded text-sm focus:border-blue-400 focus:outline-none"
        >
          {DISTRIBUTION_TYPES.map((dt) => (
            <option key={dt} value={dt}>
              {dt === "logNormal"
                ? "LogNormal"
                : dt === "normal"
                  ? "T-Normal"
                  : dt.charAt(0).toUpperCase() + dt.slice(1)}
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
            className="shrink-0 px-1 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] hover:bg-amber-200"
            title={recommendation.rationale}
          >
            {recommendation.recommended === "logNormal"
              ? "LogN"
              : recommendation.recommended === "normal"
                ? "Norm"
                : recommendation.recommended === "uniform"
                  ? "Uni"
                  : "Tri"}
          </button>
        )}
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
          className="w-full px-1 py-1 border border-gray-200 rounded text-sm focus:border-blue-400 focus:outline-none"
        >
          {ACTIVITY_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s === "inProgress"
                ? "In Progress"
                : s.charAt(0).toUpperCase() + s.slice(1)}
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
            className="w-full px-1 py-1 border border-gray-200 rounded text-sm tabular-nums text-right focus:border-blue-400 focus:outline-none"
            placeholder="Act."
            min="0"
            step="1"
          />
        ) : (
          <span className="text-gray-300 text-xs px-1">—</span>
        )}
      </div>

      {/* Separator */}
      <div className="h-6 bg-gray-200" />

      {/* Source badge */}
      <div className="text-center">
        {scheduledActivity ? (
          scheduledActivity.isActual ? (
            <span className="text-green-600 text-[10px] font-medium bg-green-50 px-1.5 py-0.5 rounded">
              Actual
            </span>
          ) : (
            <span className="text-blue-600 text-[10px] bg-blue-50 px-1.5 py-0.5 rounded">
              P{targetPct}
            </span>
          )
        ) : null}
      </div>

      {/* Delete */}
      <div className="text-center">
        <button
          onClick={() => {
            if (window.confirm("Are you sure you want to delete this activity?")) {
              onDelete(activity.id);
            }
          }}
          className="text-red-400 hover:text-red-600 text-sm transition-colors"
          title="Delete activity"
        >
          &#10005;
        </button>
      </div>
    </div>
  );
}
