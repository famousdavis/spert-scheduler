import { useState, useCallback } from "react";
import type { Activity } from "@domain/models/types";
import { ActivityRow } from "./ActivityRow";

interface ActivityListProps {
  activities: Activity[];
  onUpdate: (activityId: string, updates: Partial<Activity>) => void;
  onDelete: (activityId: string) => void;
  onMove: (fromIndex: number, toIndex: number) => void;
  onAdd: (name: string) => void;
  onValidityChange: (allValid: boolean) => void;
}

export function ActivityList({
  activities,
  onUpdate,
  onDelete,
  onMove,
  onAdd,
  onValidityChange,
}: ActivityListProps) {
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

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="grid grid-cols-12 gap-2 px-8 text-xs font-medium text-gray-500 uppercase tracking-wide">
        <div className="col-span-3">Name</div>
        <div className="col-span-1">Min</div>
        <div className="col-span-1">ML</div>
        <div className="col-span-1">Max</div>
        <div className="col-span-2">Confidence</div>
        <div className="col-span-2">Distribution</div>
        <div className="col-span-2">Status</div>
      </div>

      {/* Activity rows */}
      {activities.map((activity, index) => (
        <ActivityRow
          key={activity.id}
          activity={activity}
          index={index}
          totalCount={activities.length}
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
      <button
        onClick={() => onAdd("New Activity")}
        className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
      >
        + Add Activity
      </button>
    </div>
  );
}
