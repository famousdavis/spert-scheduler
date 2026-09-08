// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useState, useCallback, useMemo, useRef } from "react";
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
  ActivityBand,
  Calendar,
  ScheduledActivity,
} from "@domain/models/types";
import { computeHeuristic } from "@core/estimation/heuristic";
import type { BulkApplyPayload } from "./BulkActionToolbar";
import type { WorkCalendar } from "@core/calendar/work-calendar";
import { UnifiedActivityRow } from "./UnifiedActivityRow";
import { BandHeaderRow } from "./BandHeaderRow";
import { BulkActionToolbar } from "./BulkActionToolbar";
import {
  GRID_COLUMNS,
  GRID_COLUMNS_WITH_CONSTRAINT,
  GRID_COLUMN_LIST,
  GRID_COLUMN_LIST_WITH_CONSTRAINT,
  NAME_COLUMN_MIN_PX,
  NAME_COLUMN_MIN_WITH_IDS_PX,
  gridMinWidthPx,
} from "./grid-columns";
import { shouldShowConstraintColumn, planBulkApply } from "./unified-activity-helpers";
import { buildRenderList, deriveReorderResult } from "@ui/helpers/band-utils";
import { useGridFocus, useGridSelection } from "@ui/hooks/use-grid-state";
import { confirmDialog } from "@ui/hooks/use-confirm-store";
import { focusNextRow } from "./activity-row-helpers";

interface UnifiedActivityGridProps {
  activities: Activity[];
  bands: ActivityBand[];
  scheduledActivities: ScheduledActivity[];
  activityProbabilityTarget: number;
  onUpdate: (activityId: string, updates: Partial<Activity>) => void;
  onDelete: (activityId: string) => void;
  onAdd: (name: string) => void;
  onInsertAfterActivity?: (afterActivityId: string) => string | null;
  onInsertAfterBand?: (bandId: string) => string | null;
  onAddBand: () => void;
  onDeleteBand: (bandId: string) => void;
  onUpdateBand: (bandId: string, updates: Partial<ActivityBand>) => void;
  onReorderWithBands: (
    activities: Activity[],
    bands: ActivityBand[],
  ) => void;
  onValidityChange: (allValid: boolean) => void;
  onBulkUpdate?: (activityIds: string[], updates: Partial<Activity>) => void;
  onBulkDelete?: (activityIds: string[]) => void;
  isScenarioLocked?: boolean;
  heuristicEnabled?: boolean;
  heuristicMinPercent?: number;
  heuristicMaxPercent?: number;
  calendar?: WorkCalendar | Calendar;
  dependencyMode?: boolean;
  onEditActivity?: (activityId: string) => void;
  constraintWarningIds?: Set<string>;
  activityNumberMap?: Map<string, number> | null;
}

export function UnifiedActivityGrid({
  activities,
  bands,
  scheduledActivities,
  activityProbabilityTarget,
  onUpdate,
  onDelete,
  onAdd,
  onInsertAfterActivity,
  onInsertAfterBand,
  onAddBand,
  onDeleteBand,
  onUpdateBand,
  onReorderWithBands,
  onValidityChange,
  onBulkUpdate,
  onBulkDelete,
  isScenarioLocked,
  heuristicEnabled,
  heuristicMinPercent,
  heuristicMaxPercent,
  calendar,
  dependencyMode,
  onEditActivity,
  constraintWarningIds,
  activityNumberMap,
}: UnifiedActivityGridProps) {
  const showConstraintColumn = shouldShowConstraintColumn(dependencyMode, activities);
  const gridCols = showConstraintColumn ? GRID_COLUMNS_WITH_CONSTRAINT : GRID_COLUMNS;
  // WI-8: the width every container is held to, so `1fr` cannot resolve differently in
  // each of them. `activityNumberMap` is the only source of the `#N` label, so its
  // presence is exactly the condition under which the name column needs the wider floor.
  const gridMinWidth = gridMinWidthPx(
    showConstraintColumn ? GRID_COLUMN_LIST_WITH_CONSTRAINT : GRID_COLUMN_LIST,
    activityNumberMap ? NAME_COLUMN_MIN_WITH_IDS_PX : NAME_COLUMN_MIN_PX
  );
  const [, setInvalidIds] = useState<Set<string>>(new Set());
  // Global drag suppression for the insert-strip overlay. Wired through
  // DndContext callbacks below. `useDndContext()` can't be used here because
  // the provider is rendered inside this component's JSX return — calling it
  // at component scope would yield the default (empty) context. Per-row
  // `useDndContext()` would force every row to re-render on every drag tick;
  // local state confines re-renders to drag start/end only.
  const [isAnyDragging, setIsAnyDragging] = useState(false);
  const { focusActivityId, focusBandId, signalActivityAdd, signalBandAdd, signalActivityAddById } =
    useGridFocus(activities, bands);
  const { selectedIds, toggleSelect, toggleSelectAll, clearSelection } =
    useGridSelection(activities);

  // The header's select-all checkbox — the focus destination for BOTH bulk paths, because it
  // is rendered unconditionally and so outlives the toolbar that opens them. Declared up here
  // beside the selection state it belongs to, rather than beside its first consumer, because
  // `handleBulkApply` and `handleBulkDelete` sit on either side of it.
  const selectAllRef = useRef<HTMLInputElement>(null);

  const handleInsertAfterActivity = useCallback(
    (afterActivityId: string) => {
      if (!onInsertAfterActivity) return;
      const newId = onInsertAfterActivity(afterActivityId);
      if (newId) signalActivityAddById(newId);
    },
    [onInsertAfterActivity, signalActivityAddById],
  );

  const handleInsertAfterBand = useCallback(
    (bandId: string) => {
      if (!onInsertAfterBand) return;
      const newId = onInsertAfterBand(bandId);
      if (newId) signalActivityAddById(newId);
    },
    [onInsertAfterBand, signalActivityAddById],
  );

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

  const handleBulkApply = useCallback(
    (staged: BulkApplyPayload) => {
      if (selectedIds.size === 0) return;
      const ids = Array.from(selectedIds);

      const plan = planBulkApply(
        staged,
        ids,
        activities,
        scheduledActivities,
        {
          enabled: heuristicEnabled,
          minPercent: heuristicMinPercent,
          maxPercent: heuristicMaxPercent,
        },
        computeHeuristic,
      );

      if (plan.sharedUpdates) {
        if (onBulkUpdate) onBulkUpdate(ids, plan.sharedUpdates);
        else for (const id of ids) onUpdate(id, plan.sharedUpdates);
      }
      for (const { id, updates } of plan.perActivity) onUpdate(id, updates);

      clearSelection();
      // WI-6c — the toolbar that hosts the Apply button unmounts with the selection, exactly
      // as it does for a confirmed bulk delete, so the opener cannot be restored to. The
      // header checkbox is rendered unconditionally and survives.
      //
      // ⚠️ THE TAIL IS HERE, NOT IN THE TOOLBAR, AND UNCONDITIONAL, FOR ONE REASON: this is
      // the single point every apply path converges on. The heuristic question's two answers
      // both reach it (Cancel there means "keep min/max", not "abort"), and so does an apply
      // that asks nothing at all — which dropped focus to `<body>` just as the dialog paths
      // do. "Focus lands somewhere sane on both branches" is therefore a property of the
      // shape rather than of two tails someone has to remember to keep in step.
      //
      // `queueMicrotask` for the reason spelled out in `handleDeleteActivity` below: rAF runs
      // no callback at all in a non-painting Chromium tab, and none for ~16 ms in jsdom.
      //
      // ⚠️ KNOWN AND DELIBERATE: this lands on the checkbox for the two buttons and for
      // Escape, but NOT when the dialog is dismissed by clicking the overlay. Measured in
      // Chromium, with the listener trace rather than inferred:
      //
      //   pointerdown:BUTTON → focusin:"Select all activities" → mousedown → focusout:BODY
      //
      // The tail fires and succeeds; the browser's own `mousedown` default action, from the
      // SAME physical click that dismissed the dialog, then blurs it because the pointer
      // landed on a non-focusable part of the page. It is not a timing bug and deferring
      // further does not fix it — it would mean stealing focus back from where the user just
      // pointed, which is worse than leaving it there. A mouse user who clicks the backdrop
      // has chosen a location; the tail exists for the paths where they have not.
      queueMicrotask(() => {
        selectAllRef.current?.focus();
      });
    },
    [selectedIds, scheduledActivities, activities, onBulkUpdate, onUpdate,
     heuristicEnabled, heuristicMinPercent, heuristicMaxPercent, clearSelection],
  );

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
    const totalMin = Math.round(activities.reduce((sum, a) => sum + a.min, 0));
    const totalML = Math.round(activities.reduce((sum, a) => sum + a.mostLikely, 0));
    const totalMax = Math.round(activities.reduce((sum, a) => sum + a.max, 0));
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

  const renderItems = useMemo(
    () => buildRenderList(activities, bands),
    [activities, bands],
  );

  const sortableIds = useMemo(
    () =>
      renderItems.map((item) =>
        item.kind === "activity" ? item.activity.id : item.band.id,
      ),
    [renderItems],
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const result = deriveReorderResult(
      renderItems,
      String(active.id),
      String(over.id),
    );
    if (!result) return;
    onReorderWithBands(result.activities, result.bands);
  };

  const hasSelection = selectedIds.size > 0;

  // WI-6b — the two delete confirmations are hosted HERE, not in the row and not in the
  // toolbar, because the focus destination each one owes needs knowledge only the grid has:
  // the row's neighbours, and the header checkbox that outlives the toolbar. Neither opener
  // survives its own confirmed action, so `ConfirmDialog`'s captured-`activeElement` restore
  // reaches a detached node and focus would land on `<body>`; the call site names the
  // destination instead. Same parent-hosted shape as `ProjectPage.handleDeleteScenario`.
  const handleDeleteActivity = useCallback(
    async (activityId: string) => {
      // Snapshot BEFORE the delete: `focusNextRow` reads the pre-delete order to find which
      // activity will occupy the vacated slot, and that row is still mounted afterwards.
      const orderBeforeDelete = activities.map((a) => a.id);
      const ok = await confirmDialog.ask({
        title: "Delete this activity?",
        description:
          "The activity and any dependencies referring to it are removed from this scenario. Undo restores it.",
        confirmLabel: "Delete",
        destructive: true,
      });
      if (!ok) return;
      onDelete(activityId);
      // ⚠️ `queueMicrotask`, NOT `requestAnimationFrame`. This is the mechanism
      // `ConfirmDialog.test.tsx` P7 actually measured (its `SiteManagedFocus` calls
      // `queueMicrotask`), and a browser probe on 2026-09-06 confirmed the store update has
      // already committed by the time it runs: the deleted row was out of the DOM and its
      // successor mounted. rAF was tried first and is WORSE for two reasons — Chromium does
      // not run frame callbacks in a non-painting tab (so it never fired at all under
      // automation, which reads exactly like a focus bug), and it costs a frame for nothing.
      // WARNING: this lands the caret in a TEXT INPUT, where ProjectPage's Ctrl+Z handler
      // defers to the field (R2). That is why the copy above says "Undo restores it" and
      // does NOT name the shortcut — the shortcut is the one thing untrue in this state.
      queueMicrotask(() => {
        focusNextRow(activityId, orderBeforeDelete);
      });
    },
    [activities, onDelete],
  );

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    const ok = await confirmDialog.ask({
      title: `Delete ${count} selected activit${count === 1 ? "y" : "ies"}?`,
      description:
        "The selected activities and any dependencies referring to them are removed from this scenario. Undo restores them.",
      confirmLabel: "Delete",
      destructive: true,
    });
    // WARNING: `clearSelection()` stays BELOW this guard on purpose. Dismissing must change
    // NOTHING, and a selection silently emptied by saying "no" is a behaviour change nobody
    // asked for. Pinned in UnifiedActivityGrid.bulk-delete.test.tsx.
    if (!ok) return;
    if (onBulkDelete) {
      onBulkDelete(Array.from(selectedIds));
    } else {
      for (const activityId of selectedIds) {
        onDelete(activityId);
      }
    }
    clearSelection();
    // The toolbar that opened this unmounts with the selection, so its Delete button cannot
    // be restored to. The header checkbox is rendered unconditionally and survives.
    // `queueMicrotask` for the reason given in `handleDeleteActivity` above.
    queueMicrotask(() => {
      selectAllRef.current?.focus();
    });
  }, [selectedIds, onBulkDelete, onDelete, clearSelection]);

  return (
    <div
      className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
      data-activity-grid
    >
      {/* Bulk action toolbar - hidden when scenario is locked */}
      {hasSelection && !isScenarioLocked && (
        <BulkActionToolbar
          selectedCount={selectedIds.size}
          onApply={handleBulkApply}
          onBulkDelete={handleBulkDelete}
          onClearSelection={clearSelection}
          heuristicEnabled={heuristicEnabled}
          heuristicMinPercent={heuristicMinPercent}
          heuristicMaxPercent={heuristicMaxPercent}
        />
      )}

      {/* WI-8 — one scroll container around every grid.
          The five containers share a column template *string*, not a layout: `1fr` is
          `minmax(auto, 1fr)` and resolves per container against that container's own
          content, so below a certain width they floor at different values and the
          columns drift apart. Holding them all to one enforced width removes the
          disagreement, and scrolling replaces the clipping that used to hide Status,
          Actual and Src with no affordance.
          The toolbar and the Add buttons stay outside: they are not column-aligned. */}
      <div className="overflow-x-auto">
        <div style={{ minWidth: gridMinWidth }}>
          {/* Header row */}
          <div
            className="grid items-center gap-1 px-1 py-2 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide"
            style={{
              gridTemplateColumns: gridCols,
            }}
          >
            <div className="flex items-center justify-center">
              <input
                ref={selectAllRef}
                type="checkbox"
                name="selectAllActivities"
                aria-label="Select all activities"
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
            {showConstraintColumn && <div className="px-1">Constraint</div>}
            <div className="text-right px-1.5">Min</div>
            <div className="text-right px-1.5">ML</div>
            <div className="text-right px-1.5">Max</div>
            <div className="px-1">Distribution</div>
            <div className="px-1">Confidence</div>
            <div className="px-1">Status</div>
            <div className="px-1 text-center" title="Working days elapsed (In Progress) or total (Complete)">Actual</div>
            {/* Separator */}
            <div />
            <div className="text-center">
              <span title="Source of duration estimate">Src</span>
            </div>
            <div />
          </div>

          {/* Subheader labels */}
          <div
            className="grid items-center gap-1 px-1 py-0.5 bg-gray-50/50 dark:bg-gray-700/50 border-b border-gray-100 dark:border-gray-700 text-xs text-gray-400 dark:text-gray-500"
            style={{
              gridTemplateColumns: gridCols,
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
            {showConstraintColumn && <div />}
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
            onDragStart={() => setIsAnyDragging(true)}
            onDragEnd={(e) => {
              setIsAnyDragging(false);
              handleDragEnd(e);
            }}
            onDragCancel={() => setIsAnyDragging(false)}
          >
            <SortableContext
              items={sortableIds}
              strategy={verticalListSortingStrategy}
            >
              {renderItems.map((item, idx) => {
                const isLastRow = idx === renderItems.length - 1;
                if (item.kind === "activity") {
                  const activity = item.activity;
                  return (
                    <UnifiedActivityRow
                      key={activity.id}
                      activity={activity}
                      activityNumber={activityNumberMap?.get(activity.id)}
                      scheduledActivity={scheduleMap.get(activity.id)}
                      activityProbabilityTarget={activityProbabilityTarget}
                      autoFocusName={activity.id === focusActivityId}
                      isSelected={selectedIds.has(activity.id)}
                      onToggleSelect={toggleSelect}
                      onUpdate={onUpdate}
                      onDelete={handleDeleteActivity}
                      onValidityChange={handleValidityChange}
                      isLocked={isScenarioLocked}
                      heuristicEnabled={heuristicEnabled}
                      heuristicMinPercent={heuristicMinPercent}
                      heuristicMaxPercent={heuristicMaxPercent}
                      calendar={calendar}
                      showConstraintColumn={showConstraintColumn}
                      onEditActivity={onEditActivity}
                      hasConstraintWarning={constraintWarningIds?.has(activity.id)}
                      onInsertAfterActivity={
                        isScenarioLocked
                          ? undefined
                          : () => handleInsertAfterActivity(activity.id)
                      }
                      isLastRow={isLastRow}
                      isAnyDragging={isAnyDragging}
                    />
                  );
                }
                return (
                  <BandHeaderRow
                    key={item.band.id}
                    band={item.band}
                    locked={!!isScenarioLocked}
                    showConstraintColumn={showConstraintColumn}
                    onUpdate={onUpdateBand}
                    onDelete={onDeleteBand}
                    autoFocus={item.band.id === focusBandId}
                    onInsertAfterBand={
                      isScenarioLocked
                        ? undefined
                        : () => handleInsertAfterBand(item.band.id)
                    }
                    isLastRow={isLastRow}
                    isAnyDragging={isAnyDragging}
                  />
                );
              })}
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
                gridTemplateColumns: gridCols,
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
              {showConstraintColumn && <div />}
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
        </div>
      </div>

      {/* Add buttons */}
      <div className="p-2 flex gap-2">
        <button
          data-field="add-activity"
          onClick={() => {
            if (isScenarioLocked) return;
            signalActivityAdd();
            onAdd("");
          }}
          disabled={isScenarioLocked}
          className="flex-[2] py-2 border-2 border-dashed border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-400 dark:text-gray-500 hover:border-blue-400 dark:hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 focus:border-blue-400 dark:focus:border-blue-500 focus:text-blue-600 dark:focus:text-blue-400 focus:outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-gray-200 dark:disabled:hover:border-gray-600 disabled:hover:text-gray-400 dark:disabled:hover:text-gray-500"
        >
          + Add Activity
        </button>
        <button
          data-field="add-section"
          onClick={() => {
            if (isScenarioLocked) return;
            signalBandAdd();
            onAddBand();
          }}
          disabled={isScenarioLocked}
          aria-label="Add section header"
          className="flex-1 py-2 border border-dashed border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-400 dark:text-gray-500 hover:border-blue-400 dark:hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 focus:border-blue-400 dark:focus:border-blue-500 focus:text-blue-600 dark:focus:text-blue-400 focus:outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-gray-200 dark:disabled:hover:border-gray-700 disabled:hover:text-gray-400 dark:disabled:hover:text-gray-500"
        >
          + Section
        </button>
      </div>
    </div>
  );
}
