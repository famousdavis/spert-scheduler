import { useState, useCallback } from "react";
import type { Activity, RSMLevel, DistributionType } from "@domain/models/types";
import {
  RSM_LEVELS,
  RSM_LABELS,
  DISTRIBUTION_TYPES,
  ACTIVITY_STATUSES,
} from "@domain/models/types";
import { ActivitySchema } from "@domain/schemas/project.schema";
import { recommendDistribution } from "@core/recommendation/recommendation";

interface ActivityRowProps {
  activity: Activity;
  index: number;
  totalCount: number;
  onUpdate: (activityId: string, updates: Partial<Activity>) => void;
  onDelete: (activityId: string) => void;
  onMove: (fromIndex: number, toIndex: number) => void;
  onValidityChange: (activityId: string, isValid: boolean) => void;
}

type FieldErrors = Partial<Record<string, string>>;

export function ActivityRow({
  activity,
  index,
  totalCount,
  onUpdate,
  onDelete,
  onMove,
  onValidityChange,
}: ActivityRowProps) {
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

  return (
    <div className="border border-gray-200 rounded-lg p-3 bg-white">
      <div className="flex items-start gap-3">
        {/* Reorder buttons */}
        <div className="flex flex-col gap-0.5 pt-1">
          <button
            onClick={() => onMove(index, index - 1)}
            disabled={index === 0}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-30 text-xs"
            title="Move up"
          >
            &#9650;
          </button>
          <button
            onClick={() => onMove(index, index + 1)}
            disabled={index === totalCount - 1}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-30 text-xs"
            title="Move down"
          >
            &#9660;
          </button>
        </div>

        {/* Main content */}
        <div className="flex-1 grid grid-cols-12 gap-2 items-start">
          {/* Name */}
          <div className="col-span-3">
            <input
              type="text"
              value={activity.name}
              onChange={(e) => onUpdate(activity.id, { name: e.target.value })}
              className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
              placeholder="Activity name"
            />
          </div>

          {/* Min / ML / Max */}
          <div className="col-span-1">
            <input
              type="number"
              defaultValue={activity.min}
              onBlur={(e) => handleBlur("min", e.target.value)}
              className={`w-full px-2 py-1 border rounded text-sm tabular-nums ${
                errors["min"] ? "border-red-400" : "border-gray-300"
              }`}
              step="0.5"
              min="0"
              placeholder="Min"
            />
            {errors["min"] && (
              <p className="text-red-500 text-xs mt-0.5">{errors["min"]}</p>
            )}
          </div>

          <div className="col-span-1">
            <input
              type="number"
              defaultValue={activity.mostLikely}
              onBlur={(e) => handleBlur("mostLikely", e.target.value)}
              className={`w-full px-2 py-1 border rounded text-sm tabular-nums ${
                errors["mostLikely"] ? "border-red-400" : "border-gray-300"
              }`}
              step="0.5"
              min="0"
              placeholder="ML"
            />
            {errors["mostLikely"] && (
              <p className="text-red-500 text-xs mt-0.5">
                {errors["mostLikely"]}
              </p>
            )}
          </div>

          <div className="col-span-1">
            <input
              type="number"
              defaultValue={activity.max}
              onBlur={(e) => handleBlur("max", e.target.value)}
              className={`w-full px-2 py-1 border rounded text-sm tabular-nums ${
                errors["max"] ? "border-red-400" : "border-gray-300"
              }`}
              step="0.5"
              min="0"
              placeholder="Max"
            />
          </div>

          {/* Confidence */}
          <div className="col-span-2">
            <select
              value={activity.confidenceLevel}
              onChange={(e) =>
                onUpdate(activity.id, {
                  confidenceLevel: e.target.value as RSMLevel,
                })
              }
              className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
            >
              {RSM_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {RSM_LABELS[level]}
                </option>
              ))}
            </select>
          </div>

          {/* Distribution */}
          <div className="col-span-2">
            <div className="flex items-center gap-1">
              <select
                value={activity.distributionType}
                onChange={(e) =>
                  onUpdate(activity.id, {
                    distributionType: e.target.value as DistributionType,
                  })
                }
                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
              >
                {DISTRIBUTION_TYPES.map((dt) => (
                  <option key={dt} value={dt}>
                    {dt === "logNormal" ? "LogNormal" : dt.charAt(0).toUpperCase() + dt.slice(1)}
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
                  className="shrink-0 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-xs hover:bg-amber-200"
                  title={recommendation.rationale}
                >
                  Rec: {recommendation.recommended === "logNormal" ? "LN" : recommendation.recommended.slice(0, 4)}
                </button>
              )}
            </div>
          </div>

          {/* Status */}
          <div className="col-span-2 flex items-center gap-2">
            <select
              value={activity.status}
              onChange={(e) =>
                onUpdate(activity.id, {
                  status: e.target.value as Activity["status"],
                })
              }
              className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
            >
              {ACTIVITY_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s === "inProgress" ? "In Progress" : s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
            {isComplete && (
              <input
                type="number"
                defaultValue={activity.actualDuration ?? ""}
                onBlur={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val)) {
                    onUpdate(activity.id, { actualDuration: val });
                  }
                }}
                className="w-16 px-2 py-1 border border-gray-300 rounded text-sm tabular-nums"
                placeholder="Actual"
                min="0"
                step="1"
              />
            )}
            <button
              onClick={() => onDelete(activity.id)}
              className="text-red-400 hover:text-red-600 text-sm shrink-0"
              title="Delete activity"
            >
              &#10005;
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
