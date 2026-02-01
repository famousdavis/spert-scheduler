import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { Activity, ScheduledActivity } from "@domain/models/types";
import { UnifiedActivityRow } from "./UnifiedActivityRow";
import { GRID_COLUMNS } from "./grid-columns";

interface UnifiedActivityGridProps {
  activities: Activity[];
  scheduledActivities: ScheduledActivity[];
  activityProbabilityTarget: number;
  onUpdate: (activityId: string, updates: Partial<Activity>) => void;
  onDelete: (activityId: string) => void;
  onMove: (fromIndex: number, toIndex: number) => void;
  onAdd: (name: string) => void;
  onValidityChange: (allValid: boolean) => void;
  onBulkMarkComplete?: (
    activityIds: string[],
    scheduledDurations: Map<string, number>
  ) => void;
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
  onBulkMarkComplete,
}: UnifiedActivityGridProps) {
  const [, setInvalidIds] = useState<Set<string>>(new Set());
  const [focusActivityId, setFocusActivityId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const pendingFocus = useRef(false);
  const prevCountRef = useRef(activities.length);

  // When the activities list grows after the Add button was clicked,
  // capture the last activity's ID so we can auto-focus its name input.
  useEffect(() => {
    if (pendingFocus.current && activities.length > prevCountRef.current) {
      const lastActivity = activities[activities.length - 1];
      if (lastActivity) {
        setFocusActivityId(lastActivity.id);
      }
      pendingFocus.current = false;
    }
    prevCountRef.current = activities.length;
  }, [activities]);

  // Clear the focus target after one render cycle so it doesn't
  // re-trigger on subsequent re-renders.
  useEffect(() => {
    if (focusActivityId) {
      const id = requestAnimationFrame(() => setFocusActivityId(null));
      return () => cancelAnimationFrame(id);
    }
  }, [focusActivityId]);

  // Clear selection when activities change
  useEffect(() => {
    setSelectedIds((prev) => {
      const activityIdSet = new Set(activities.map((a) => a.id));
      const next = new Set([...prev].filter((id) => activityIdSet.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [activities]);

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

  const toggleSelect = useCallback((activityId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(activityId)) {
        next.delete(activityId);
      } else {
        next.add(activityId);
      }
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === activities.length) {
        return new Set();
      }
      return new Set(activities.map((a) => a.id));
    });
  }, [activities]);

  const handleBulkComplete = useCallback(() => {
    if (selectedIds.size === 0) return;
    const scheduledDurations = new Map<string, number>();
    for (const sa of scheduledActivities) {
      scheduledDurations.set(sa.activityId, sa.duration);
    }
    if (onBulkMarkComplete) {
      onBulkMarkComplete(Array.from(selectedIds), scheduledDurations);
    } else {
      for (const activityId of selectedIds) {
        const duration = scheduledDurations.get(activityId);
        onUpdate(activityId, {
          status: "complete",
          actualDuration: duration ?? undefined,
        });
      }
    }
    setSelectedIds(new Set());
  }, [selectedIds, scheduledActivities, onBulkMarkComplete, onUpdate]);

  // Build a lookup map from activityId to ScheduledActivity
  const scheduleMap = useMemo(() => {
    const map = new Map<string, ScheduledActivity>();
    for (const sa of scheduledActivities) {
      map.set(sa.activityId, sa);
    }
    return map;
  }, [scheduledActivities]);

  const targetPct = Math.round(activityProbabilityTarget * 100);

  // Summary computations
  const summary = useMemo(() => {
    const totalMin = activities.reduce((sum, a) => sum + a.min, 0);
    const totalML = activities.reduce((sum, a) => sum + a.mostLikely, 0);
    const totalMax = activities.reduce((sum, a) => sum + a.max, 0);
    const totalScheduled = scheduledActivities.reduce(
      (sum, sa) => sum + sa.duration,
      0
    );
    return { totalMin, totalML, totalMax, totalScheduled, count: activities.length };
  }, [activities, scheduledActivities]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = activities.findIndex((a) => a.id === active.id);
      const newIndex = activities.findIndex((a) => a.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        onMove(oldIndex, newIndex);
      }
    }
  };

  const hasSelection = selectedIds.size > 0;
  const incompleteSelectedCount = Array.from(selectedIds).filter(
    (id) => activities.find((a) => a.id === id)?.status !== "complete"
  ).length;

  return (
    <div
      className="bg-white border border-gray-200 rounded-lg overflow-hidden"
      data-activity-grid
    >
      {/* Bulk action toolbar */}
      {hasSelection && (
        <div className="flex items-center gap-3 px-4 py-2 bg-blue-50 border-b border-blue-200">
          <span className="text-sm text-blue-700 font-medium">
            {selectedIds.size} selected
          </span>
          {incompleteSelectedCount > 0 && (
            <button
              onClick={handleBulkComplete}
              className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
            >
              Mark Complete
            </button>
          )}
          <button
            onClick={() => setSelectedIds(new Set())}
            className="px-3 py-1 text-blue-600 text-sm hover:text-blue-800"
          >
            Clear
          </button>
        </div>
      )}

      {/* Header row */}
      <div
        className="grid items-center gap-1 px-1 py-2 bg-gray-50 border-b border-gray-200 text-[11px] font-medium text-gray-500 uppercase tracking-wide"
        style={{
          gridTemplateColumns: GRID_COLUMNS,
        }}
      >
        <div className="flex items-center justify-center">
          <input
            type="checkbox"
            checked={
              activities.length > 0 && selectedIds.size === activities.length
            }
            onChange={toggleSelectAll}
            className="rounded border-gray-300"
            tabIndex={-1}
          />
        </div>
        <div />
        <div className="px-1.5">Name</div>
        <div className="text-right px-1">Dur.</div>
        <div className="px-1">Start</div>
        <div className="px-1">End</div>
        <div className="text-right px-1.5">Min</div>
        <div className="text-right px-1.5">ML</div>
        <div className="text-right px-1.5">Max</div>
        <div className="px-1">Confidence</div>
        <div className="px-1">Distribution</div>
        <div className="px-1">Status</div>
        <div className="px-1 text-center">Actual</div>
        {/* Separator */}
        <div />
        <div className="text-center">
          <span title="Source of duration estimate">Src</span>
        </div>
        <div />
      </div>

      {/* Subheader labels */}
      <div
        className="grid items-center gap-1 px-1 py-0.5 bg-gray-50/50 border-b border-gray-100 text-[9px] text-gray-400"
        style={{
          gridTemplateColumns: GRID_COLUMNS,
        }}
      >
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
        <div />
        <div />
        <div />
        <div />
        <div />
        <div />
        <div />
        <div />
      </div>

      {/* Activity rows */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={activities.map((a) => a.id)}
          strategy={verticalListSortingStrategy}
        >
          {activities.map((activity) => (
            <UnifiedActivityRow
              key={activity.id}
              activity={activity}
              scheduledActivity={scheduleMap.get(activity.id)}
              activityProbabilityTarget={activityProbabilityTarget}
              autoFocusName={activity.id === focusActivityId}
              isSelected={selectedIds.has(activity.id)}
              onToggleSelect={toggleSelect}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onValidityChange={handleValidityChange}
            />
          ))}
        </SortableContext>
      </DndContext>

      {activities.length === 0 && (
        <p className="text-gray-400 text-sm text-center py-8">
          No activities yet. Add one to get started.
        </p>
      )}

      {/* Summary row */}
      {activities.length > 0 && (
        <div
          className="grid items-center gap-1 px-1 py-2 bg-gray-50 border-t border-gray-200 text-sm font-medium text-gray-700"
          style={{
            gridTemplateColumns: GRID_COLUMNS,
          }}
        >
          <div />
          <div />
          <div className="px-1.5 text-gray-500">
            {summary.count} activit{summary.count === 1 ? "y" : "ies"}
          </div>
          <div className="text-right tabular-nums px-1">
            {summary.totalScheduled > 0 ? `${summary.totalScheduled}d` : ""}
          </div>
          <div />
          <div />
          <div className="text-right tabular-nums px-1">{summary.totalMin}</div>
          <div className="text-right tabular-nums px-1">{summary.totalML}</div>
          <div className="text-right tabular-nums px-1">{summary.totalMax}</div>
          <div />
          <div />
          <div />
          <div />
          <div />
          <div />
          <div />
        </div>
      )}

      {/* Add button */}
      <div className="p-2">
        <button
          data-field="add-activity"
          onClick={() => {
            pendingFocus.current = true;
            onAdd("");
          }}
          className="w-full py-2 border-2 border-dashed border-gray-200 rounded-lg text-sm text-gray-400 hover:border-blue-400 hover:text-blue-600 transition-colors"
        >
          + Add Activity
        </button>
      </div>
    </div>
  );
}
