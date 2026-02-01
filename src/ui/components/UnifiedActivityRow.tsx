import { useState, useCallback } from "react";
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

interface UnifiedActivityRowProps {
  activity: Activity;
  scheduledActivity?: ScheduledActivity;
  index: number;
  totalCount: number;
  activityProbabilityTarget: number;
  onUpdate: (activityId: string, updates: Partial<Activity>) => void;
  onDelete: (activityId: string) => void;
  onMove: (fromIndex: number, toIndex: number) => void;
  onValidityChange: (activityId: string, isValid: boolean) => void;
}

type FieldErrors = Partial<Record<string, string>>;

export function UnifiedActivityRow({
  activity,
  scheduledActivity,
  index,
  totalCount,
  activityProbabilityTarget,
  onUpdate,
  onDelete,
  onMove,
  onValidityChange,
}: UnifiedActivityRowProps) {
  const [errors, setErrors] = useState<FieldErrors>({});

  const validateAndUpdate = useCallback(
    (field: string, value: number | string) => {
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
      } else {
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
        validateAndUpdate(field, num);
      }
    },
    [validateAndUpdate]
  );

  const recommendation = recommendDistribution(
    activity.min,
    activity.mostLikely,
    activity.max,
    activity.confidenceLevel
  );

  const isComplete = activity.status === "complete";
  const targetPct = Math.round(activityProbabilityTarget * 100);

  const hasErrors = Object.keys(errors).length > 0;

  return (
    <div
      className={`grid items-center gap-1 px-1 py-1.5 border-b border-gray-100 hover:bg-gray-50/50 text-sm ${
        hasErrors ? "bg-red-50/30" : ""
      }`}
      style={{
        gridTemplateColumns:
          "28px 1fr 64px 64px 64px 140px 120px 96px 56px 1px 60px 90px 90px 44px 28px",
      }}
    >
      {/* Grip handle */}
      <div className="flex flex-col items-center">
        <button
          className="text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing select-none text-base leading-none"
          title="Drag to reorder"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            // Simple click-based reorder: click top half = up, bottom half = down
          }}
        >
          &#x2261;
        </button>
        <div className="flex flex-col -mt-0.5">
          <button
            onClick={() => onMove(index, index - 1)}
            disabled={index === 0}
            className="text-gray-300 hover:text-gray-500 disabled:opacity-20 leading-none"
            style={{ fontSize: "8px" }}
            title="Move up"
          >
            &#9650;
          </button>
          <button
            onClick={() => onMove(index, index + 1)}
            disabled={index === totalCount - 1}
            className="text-gray-300 hover:text-gray-500 disabled:opacity-20 leading-none"
            style={{ fontSize: "8px" }}
            title="Move down"
          >
            &#9660;
          </button>
        </div>
      </div>

      {/* Name */}
      <div>
        <input
          type="text"
          value={activity.name}
          onChange={(e) => onUpdate(activity.id, { name: e.target.value })}
          className="w-full px-1.5 py-1 border border-gray-200 rounded text-sm focus:border-blue-400 focus:outline-none"
          placeholder="Activity name"
        />
      </div>

      {/* Min */}
      <div>
        <input
          type="number"
          defaultValue={activity.min}
          onBlur={(e) => handleBlur("min", e.target.value)}
          className={`w-full px-1.5 py-1 border rounded text-sm tabular-nums text-right ${
            errors["min"] ? "border-red-400 bg-red-50" : "border-gray-200"
          } focus:border-blue-400 focus:outline-none`}
          step="0.5"
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
          className={`w-full px-1.5 py-1 border rounded text-sm tabular-nums text-right ${
            errors["mostLikely"]
              ? "border-red-400 bg-red-50"
              : "border-gray-200"
          } focus:border-blue-400 focus:outline-none`}
          step="0.5"
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
          className={`w-full px-1.5 py-1 border rounded text-sm tabular-nums text-right ${
            errors["max"] ? "border-red-400 bg-red-50" : "border-gray-200"
          } focus:border-blue-400 focus:outline-none`}
          step="0.5"
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
              ? "LN"
              : recommendation.recommended.slice(0, 4)}
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

      {/* Schedule: Duration */}
      <div className="text-right tabular-nums text-gray-700 px-1">
        {scheduledActivity ? (
          <span>{scheduledActivity.duration}d</span>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </div>

      {/* Schedule: Start */}
      <div className="tabular-nums text-gray-600 text-xs px-1">
        {scheduledActivity ? (
          <span>{formatDateDisplay(scheduledActivity.startDate)}</span>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </div>

      {/* Schedule: End */}
      <div className="tabular-nums text-gray-600 text-xs px-1">
        {scheduledActivity ? (
          <span>{formatDateDisplay(scheduledActivity.endDate)}</span>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </div>

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
          onClick={() => onDelete(activity.id)}
          className="text-gray-300 hover:text-red-500 text-sm transition-colors"
          title="Delete activity"
        >
          &#10005;
        </button>
      </div>
    </div>
  );
}
