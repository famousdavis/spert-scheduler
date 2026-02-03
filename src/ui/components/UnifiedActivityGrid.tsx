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
import type {
  Activity,
  ScheduledActivity,
  RSMLevel,
  DistributionType,
} from "@domain/models/types";
import {
  RSM_LEVELS,
  RSM_LABELS,
  DISTRIBUTION_TYPES,
} from "@domain/models/types";
import { UnifiedActivityRow } from "./UnifiedActivityRow";
import { GRID_COLUMNS } from "./grid-columns";
import { distributionLabel } from "@ui/helpers/format-labels";

interface UnifiedActivityGridProps {
  activities: Activity[];
  scheduledActivities: ScheduledActivity[];
  activityProbabilityTarget: number;
  onUpdate: (activityId: string, updates: Partial<Activity>) => void;
  onDelete: (activityId: string) => void;
  onDuplicate: (activityId: string) => void;
  onMove: (fromIndex: number, toIndex: number) => void;
  onAdd: (name: string) => void;
  onValidityChange: (allValid: boolean) => void;
  onBulkUpdate?: (activityIds: string[], updates: Partial<Activity>) => void;
  onBulkDelete?: (activityIds: string[]) => void;
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
  onDuplicate,
  onMove,
  onAdd,
  onValidityChange,
  onBulkUpdate,
  onBulkDelete,
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

  const handleBulkConfidenceChange = useCallback(
    (level: RSMLevel) => {
      if (selectedIds.size === 0) return;
      if (onBulkUpdate) {
        onBulkUpdate(Array.from(selectedIds), { confidenceLevel: level });
      } else {
        for (const activityId of selectedIds) {
          onUpdate(activityId, { confidenceLevel: level });
        }
      }
    },
    [selectedIds, onBulkUpdate, onUpdate]
  );

  const handleBulkDistributionChange = useCallback(
    (type: DistributionType) => {
      if (selectedIds.size === 0) return;
      if (onBulkUpdate) {
        onBulkUpdate(Array.from(selectedIds), { distributionType: type });
      } else {
        for (const activityId of selectedIds) {
          onUpdate(activityId, { distributionType: type });
        }
      }
    },
    [selectedIds, onBulkUpdate, onUpdate]
  );

  const handleBulkDelete = useCallback(() => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    if (!window.confirm(`Delete ${count} selected activit${count === 1 ? 'y' : 'ies'}?`)) {
      return;
    }
    if (onBulkDelete) {
      onBulkDelete(Array.from(selectedIds));
    } else {
      for (const activityId of selectedIds) {
        onDelete(activityId);
      }
    }
    setSelectedIds(new Set());
  }, [selectedIds, onBulkDelete, onDelete]);

  return (
    <div
      className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
      data-activity-grid
    >
      {/* Bulk action toolbar */}
      {hasSelection && (
        <div className="flex flex-wrap items-center gap-3 px-4 py-2 bg-blue-50 dark:bg-blue-900/30 border-b border-blue-200 dark:border-blue-800">
          <span className="text-sm text-blue-700 dark:text-blue-300 font-medium">
            {selectedIds.size} selected
          </span>

          {/* Confidence level dropdown */}
          <select
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) {
                handleBulkConfidenceChange(e.target.value as RSMLevel);
                e.target.value = "";
              }
            }}
            className="px-2 py-1 text-sm border border-blue-300 dark:border-blue-600 rounded bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:border-blue-500"
          >
            <option value="" disabled>Set Confidence...</option>
            {RSM_LEVELS.map((level) => (
              <option key={level} value={level}>
                {RSM_LABELS[level]}
              </option>
            ))}
          </select>

          {/* Distribution type dropdown */}
          <select
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) {
                handleBulkDistributionChange(e.target.value as DistributionType);
                e.target.value = "";
              }
            }}
            className="px-2 py-1 text-sm border border-blue-300 dark:border-blue-600 rounded bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:border-blue-500"
          >
            <option value="" disabled>Set Distribution...</option>
            {DISTRIBUTION_TYPES.map((dt) => (
              <option key={dt} value={dt}>
                {distributionLabel(dt)}
              </option>
            ))}
          </select>

          {incompleteSelectedCount > 0 && (
            <button
              onClick={handleBulkComplete}
              className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
            >
              Mark Complete
            </button>
          )}

          <button
            onClick={handleBulkDelete}
            className="px-3 py-1 text-red-600 dark:text-red-400 text-sm hover:text-red-800 dark:hover:text-red-300"
          >
            Delete
          </button>

          <button
            onClick={() => setSelectedIds(new Set())}
            className="px-3 py-1 text-blue-600 dark:text-blue-400 text-sm hover:text-blue-800 dark:hover:text-blue-300"
          >
            Clear
          </button>
        </div>
      )}

      {/* Header row */}
      <div
        className="grid items-center gap-1 px-1 py-2 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600 text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide"
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
            className="rounded border-gray-300 dark:border-gray-600 dark:bg-gray-700"
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
        className="grid items-center gap-1 px-1 py-0.5 bg-gray-50/50 dark:bg-gray-700/50 border-b border-gray-100 dark:border-gray-700 text-[9px] text-gray-400 dark:text-gray-500"
        style={{
          gridTemplateColumns: GRID_COLUMNS,
        }}
      >
        <div />
        <div />
        <div />
        <div className="text-right px-1 text-gray-400 dark:text-gray-500">
          P{targetPct}
        </div>
        <div className="px-1 text-gray-400 dark:text-gray-500">Scheduled</div>
        <div className="px-1 text-gray-400 dark:text-gray-500">Scheduled</div>
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
              onDuplicate={onDuplicate}
              onValidityChange={handleValidityChange}
            />
          ))}
        </SortableContext>
      </DndContext>

      {activities.length === 0 && (
        <p className="text-gray-400 dark:text-gray-500 text-sm text-center py-8">
          No activities yet. Add one to get started.
        </p>
      )}

      {/* Summary row */}
      {activities.length > 0 && (
        <div
          className="grid items-center gap-1 px-1 py-2 bg-gray-50 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300"
          style={{
            gridTemplateColumns: GRID_COLUMNS,
          }}
        >
          <div />
          <div />
          <div className="px-1.5 text-gray-500 dark:text-gray-400">
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
          className="w-full py-2 border-2 border-dashed border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-400 dark:text-gray-500 hover:border-blue-400 dark:hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
        >
          + Add Activity
        </button>
      </div>
    </div>
  );
}
