import { useState, useCallback } from "react";
import type { Activity, ScheduledActivity } from "@domain/models/types";
import { UnifiedActivityRow } from "./UnifiedActivityRow";

interface UnifiedActivityGridProps {
  activities: Activity[];
  scheduledActivities: ScheduledActivity[];
  activityProbabilityTarget: number;
  onUpdate: (activityId: string, updates: Partial<Activity>) => void;
  onDelete: (activityId: string) => void;
  onMove: (fromIndex: number, toIndex: number) => void;
  onAdd: (name: string) => void;
  onValidityChange: (allValid: boolean) => void;
}

export function UnifiedActivityGrid({
  activities,
  scheduledActivities,
  activityProbabilityTarget,
  onUpdate,
  onDelete,
  onMove,
  onAdd,
  onValidityChange,
}: UnifiedActivityGridProps) {
  const [, setInvalidIds] = useState<Set<string>>(new Set());

  const handleValidityChange = useCallback(
    (activityId: string, isValid: boolean) => {
      setInvalidIds((prev) => {
        const next = new Set(prev);
        if (isValid) {
          next.delete(activityId);
        } else {
          next.add(activityId);
        }
        onValidityChange(next.size === 0);
        return next;
      });
    },
    [onValidityChange]
  );

  // Build a lookup map from activityId to ScheduledActivity
  const scheduleMap = new Map<string, ScheduledActivity>();
  for (const sa of scheduledActivities) {
    scheduleMap.set(sa.activityId, sa);
  }

  const targetPct = Math.round(activityProbabilityTarget * 100);

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      {/* Header row */}
      <div
        className="grid items-center gap-1 px-1 py-2 bg-gray-50 border-b border-gray-200 text-[11px] font-medium text-gray-500 uppercase tracking-wide"
        style={{
          gridTemplateColumns:
            "28px 1fr 64px 64px 64px 140px 120px 96px 56px 1px 60px 90px 90px 44px 28px",
        }}
      >
        <div />
        <div className="px-1.5">Name</div>
        <div className="text-right px-1.5">Min</div>
        <div className="text-right px-1.5">ML</div>
        <div className="text-right px-1.5">Max</div>
        <div className="px-1">Confidence</div>
        <div className="px-1">Distribution</div>
        <div className="px-1">Status</div>
        <div className="px-1 text-center">Actual</div>
        {/* Separator */}
        <div />
        <div className="text-right px-1">Dur.</div>
        <div className="px-1">Start</div>
        <div className="px-1">End</div>
        <div className="text-center">
          <span title="Source of duration estimate">Src</span>
        </div>
        <div />
      </div>

      {/* Subheader labels */}
      <div
        className="grid items-center gap-1 px-1 py-0.5 bg-gray-50/50 border-b border-gray-100 text-[9px] text-gray-400"
        style={{
          gridTemplateColumns:
            "28px 1fr 64px 64px 64px 140px 120px 96px 56px 1px 60px 90px 90px 44px 28px",
        }}
      >
        <div />
        <div />
        <div />
        <div />
        <div />
        <div />
        <div />
        <div />
        <div />
        <div />
        <div className="text-right px-1 text-gray-400">
          P{targetPct}
        </div>
        <div className="px-1 text-gray-400">Scheduled</div>
        <div className="px-1 text-gray-400">Scheduled</div>
        <div />
        <div />
      </div>

      {/* Activity rows */}
      {activities.map((activity, index) => (
        <UnifiedActivityRow
          key={activity.id}
          activity={activity}
          scheduledActivity={scheduleMap.get(activity.id)}
          index={index}
          totalCount={activities.length}
          activityProbabilityTarget={activityProbabilityTarget}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onMove={onMove}
          onValidityChange={handleValidityChange}
        />
      ))}

      {activities.length === 0 && (
        <p className="text-gray-400 text-sm text-center py-8">
          No activities yet. Add one to get started.
        </p>
      )}

      {/* Add button */}
      <div className="p-2">
        <button
          onClick={() => onAdd("New Activity")}
          className="w-full py-2 border-2 border-dashed border-gray-200 rounded-lg text-sm text-gray-400 hover:border-blue-400 hover:text-blue-600 transition-colors"
        >
          + Add Activity
        </button>
      </div>
    </div>
  );
}
