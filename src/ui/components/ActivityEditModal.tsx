// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type {
  ConstraintType,
  ConstraintMode,
  ConstraintConflict,
  DeterministicSchedule,
  RSMLevel,
  DistributionType,
  ActivityStatus,
  Activity,
  ChecklistItem,
} from "@domain/models/types";
import {
  CONSTRAINT_TYPES,
  CONSTRAINT_MODES,
  RSM_LEVELS,
  RSM_LABELS,
  DISTRIBUTION_TYPES,
  ACTIVITY_STATUSES,
} from "@domain/models/types";
import { useProjectStore } from "@ui/hooks/use-project-store";
import { useWorkCalendar } from "@ui/hooks/use-work-calendar";
import { useDateFormat } from "@ui/hooks/use-date-format";
import { parseDateISO, isWorkingDay, formatDateISO } from "@core/calendar/calendar";
import { detectConstraintConflict } from "@core/schedule/constraint-utils";
import { distributionLabel, statusLabel } from "@domain/helpers/format-labels";
import { generateId } from "@app/api/id";

/** Human-readable labels for constraint types. */
const CONSTRAINT_LABELS: Record<ConstraintType, string> = {
  MSO: "Must Start On",
  MFO: "Must Finish On",
  SNET: "Start No Earlier Than",
  SNLT: "Start No Later Than",
  FNET: "Finish No Earlier Than",
  FNLT: "Finish No Later Than",
};

interface ActivityEditModalProps {
  activityId: string;
  scenarioId: string;
  projectId: string;
  onClose: () => void;
  schedule: DeterministicSchedule | undefined;
  dependencyMode?: boolean;
  onEditDependency?: (fromId: string, toId: string) => void;
  onAddDependency?: (fromId: string) => void;
}

/** Collapsible section wrapper */
function Section({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-gray-200 dark:border-gray-700">
      <button
        type="button"
        className="w-full flex items-center gap-2 py-2 text-sm font-medium text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400"
        onClick={() => setOpen((o) => !o)}
      >
        <svg
          className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-90" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        {title}
      </button>
      {open && <div className="pb-3 space-y-3">{children}</div>}
    </div>
  );
}

const MAX_CHECKLIST_ITEMS = 20;

/** Sortable checklist item row */
function SortableChecklistRow({
  item,
  onToggle,
  onTextChange,
  onRemove,
}: {
  item: ChecklistItem;
  onToggle: (id: string) => void;
  onTextChange: (id: string, text: string) => void;
  onRemove: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-1.5 group"
    >
      <button
        type="button"
        className="text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 cursor-grab shrink-0 touch-none"
        {...attributes}
        {...listeners}
      >
        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
          <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
          <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
          <circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
        </svg>
      </button>
      <input
        type="checkbox"
        checked={item.completed}
        onChange={() => onToggle(item.id)}
        className="shrink-0 rounded border-gray-300 dark:border-gray-600 text-blue-600"
      />
      <input
        type="text"
        value={item.text}
        onChange={(e) => onTextChange(item.id, e.target.value)}
        maxLength={200}
        className={`flex-1 min-w-0 text-sm border border-transparent hover:border-gray-300 dark:hover:border-gray-600 focus:border-blue-400 rounded px-1.5 py-0.5 bg-transparent text-gray-900 dark:text-gray-100 focus:outline-none ${
          item.completed ? "line-through text-gray-400 dark:text-gray-500" : ""
        }`}
      />
      <button
        type="button"
        onClick={() => onRemove(item.id)}
        className="shrink-0 text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
        title="Remove task"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

export function ActivityEditModal({
  activityId,
  scenarioId,
  projectId,
  onClose,
  schedule,
  dependencyMode,
  onEditDependency,
  onAddDependency,
}: ActivityEditModalProps) {
  // -- Store selectors --
  const activity = useProjectStore((s) => {
    const project = s.projects.find((p) => p.id === projectId);
    const scenario = project?.scenarios.find((sc) => sc.id === scenarioId);
    return scenario?.activities.find((a) => a.id === activityId);
  });

  const allActivities = useProjectStore((s) => {
    const project = s.projects.find((p) => p.id === projectId);
    const scenario = project?.scenarios.find((sc) => sc.id === scenarioId);
    return scenario?.activities ?? [];
  });

  const dependencies = useProjectStore((s) => {
    const project = s.projects.find((p) => p.id === projectId);
    const scenario = project?.scenarios.find((sc) => sc.id === scenarioId);
    return scenario?.dependencies ?? [];
  });

  const updateActivityField = useProjectStore((s) => s.updateActivityField);
  const updateActivityChecklist = useProjectStore((s) => s.updateActivityChecklist);

  const calendar = useWorkCalendar(projectId);
  const formatDate = useDateFormat();

  // -- Local draft state: General --
  const [name, setName] = useState(activity?.name ?? "");
  const [status, setStatus] = useState<ActivityStatus>(activity?.status ?? "planned");
  const [actualDuration, setActualDuration] = useState<number | "">(activity?.actualDuration ?? "");

  // -- Local draft state: Estimates --
  const [min, setMin] = useState<number | "">(activity?.min ?? "");
  const [mostLikely, setMostLikely] = useState<number | "">(activity?.mostLikely ?? "");
  const [max, setMax] = useState<number | "">(activity?.max ?? "");
  const [confidenceLevel, setConfidenceLevel] = useState<RSMLevel>(activity?.confidenceLevel ?? "mediumConfidence");
  const [distributionType, setDistributionType] = useState<DistributionType>(activity?.distributionType ?? "normal");

  // -- Local draft state: Constraint --
  const [constraintType, setConstraintType] = useState<ConstraintType | null>(
    activity?.constraintType ?? null
  );
  const [constraintDate, setConstraintDate] = useState<string | null>(
    activity?.constraintDate ?? null
  );
  const [constraintMode, setConstraintMode] = useState<ConstraintMode | null>(
    activity?.constraintMode ?? null
  );
  const [constraintNote, setConstraintNote] = useState<string | null>(
    activity?.constraintNote ?? null
  );
  const [dateAdjustedNote, setDateAdjustedNote] = useState<string | null>(null);

  // -- Local draft state: Checklist --
  const [checklist, setChecklist] = useState<ChecklistItem[]>(activity?.checklist ?? []);
  const [newTaskText, setNewTaskText] = useState("");
  const newTaskInputRef = useRef<HTMLInputElement>(null);

  // dnd-kit sensors for checklist reorder
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // -- Conflict preview (200ms debounce) --
  const [conflictPreview, setConflictPreview] = useState<ConstraintConflict | null>(null);
  const conflictTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!constraintType || !constraintDate || !constraintMode) {
      setConflictPreview(null); // eslint-disable-line react-hooks/set-state-in-effect
      return;
    }

    clearTimeout(conflictTimerRef.current);
    conflictTimerRef.current = setTimeout(() => {
      const sa = schedule?.activities.find((a) => a.activityId === activityId);
      if (!sa) {
        setConflictPreview(null);
        return;
      }

      const esNet = sa.startDate;
      const efNet = sa.endDate;
      const lsNet = sa.lateStartNet ?? sa.startDate;
      const lfNet = sa.lateFinishNet ?? sa.endDate;

      const conflict = detectConstraintConflict(
        esNet,
        efNet,
        lsNet,
        lfNet,
        constraintType,
        constraintDate,
        constraintMode,
        activityId,
        activity?.name ?? "",
        calendar,
      );
      setConflictPreview(conflict);
    }, 200);

    return () => clearTimeout(conflictTimerRef.current);
  }, [constraintType, constraintDate, constraintMode, schedule, activityId, activity?.name, calendar]);

  // -- Milestone anchor guard --
  const hasMilestoneAnchor = !!activity?.startsAtMilestoneId;

  // -- Dependencies involving this activity --
  const relatedDeps = useMemo(() => {
    return dependencies.filter(
      (d) => d.fromActivityId === activityId || d.toActivityId === activityId
    );
  }, [dependencies, activityId]);

  const activityNameById = useCallback(
    (id: string) => allActivities.find((a) => a.id === id)?.name ?? id,
    [allActivities]
  );

  // -- Date picker handler: snap non-working days --
  const handleDateChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      if (!raw) {
        setConstraintDate(null);
        setDateAdjustedNote(null);
        return;
      }

      const date = parseDateISO(raw);
      let guard = 0;
      while (!isWorkingDay(date, calendar) && guard < 10000) {
        date.setDate(date.getDate() + 1);
        guard++;
      }
      const normalized = formatDateISO(date);

      setConstraintDate(normalized);
      if (normalized !== raw) {
        setDateAdjustedNote(
          `Adjusted from ${formatDate(raw)} to ${formatDate(normalized)} (non-working day)`
        );
      } else {
        setDateAdjustedNote(null);
      }
    },
    [calendar, formatDate]
  );

  // -- Type change: auto-set mode to "hard" if first selection --
  const handleTypeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const val = e.target.value;
      if (!val) {
        setConstraintType(null);
        setConstraintMode(null);
        setConstraintDate(null);
        setConstraintNote(null);
        setDateAdjustedNote(null);
        setConflictPreview(null);
        return;
      }
      const newType = val as ConstraintType;
      setConstraintType(newType);
      if (!constraintMode) {
        setConstraintMode("hard");
      }
    },
    [constraintMode]
  );

  // -- Save: only send changed fields --
  const handleSave = useCallback(() => {
    if (!activity) return;

    const updates: Partial<Activity> = {};

    // General
    if (name.trim() && name.trim() !== activity.name) updates.name = name.trim();
    if (status !== activity.status) updates.status = status;
    if (status === "complete" && actualDuration !== "" && actualDuration !== activity.actualDuration) {
      updates.actualDuration = Number(actualDuration);
    }
    if (status !== "complete") updates.actualDuration = undefined;

    // Estimates
    if (min !== "" && Number(min) !== activity.min) updates.min = Number(min);
    if (mostLikely !== "" && Number(mostLikely) !== activity.mostLikely) updates.mostLikely = Number(mostLikely);
    if (max !== "" && Number(max) !== activity.max) updates.max = Number(max);
    if (confidenceLevel !== activity.confidenceLevel) updates.confidenceLevel = confidenceLevel;
    if (distributionType !== activity.distributionType) updates.distributionType = distributionType;

    // Constraint
    updates.constraintType = constraintType ?? null;
    updates.constraintDate = constraintType ? (constraintDate ?? null) : null;
    updates.constraintMode = constraintType ? (constraintMode ?? null) : null;
    updates.constraintNote = constraintType ? (constraintNote?.trim() || null) : null;

    // Checklist — compare to detect changes (separate save path to avoid simulation invalidation)
    const origChecklist = activity.checklist ?? [];
    const checklistChanged = JSON.stringify(checklist) !== JSON.stringify(origChecklist);
    const newChecklist = checklist.length > 0 ? checklist : undefined;

    // Non-checklist field updates go through normal path (invalidates simulation)
    if (Object.keys(updates).length > 0) {
      updateActivityField(projectId, scenarioId, activityId, updates);
    }

    // Checklist changes go through dedicated path (preserves simulation results)
    if (checklistChanged) {
      updateActivityChecklist(projectId, scenarioId, activityId, newChecklist);
    }

    onClose();
  }, [
    activity,
    name,
    status,
    actualDuration,
    min,
    mostLikely,
    max,
    confidenceLevel,
    distributionType,
    constraintType,
    constraintDate,
    constraintMode,
    constraintNote,
    checklist,
    updateActivityField,
    updateActivityChecklist,
    projectId,
    scenarioId,
    activityId,
    onClose,
  ]);

  // -- Clear constraint --
  const handleClearConstraint = useCallback(() => {
    setConstraintType(null);
    setConstraintDate(null);
    setConstraintMode(null);
    setConstraintNote(null);
    setDateAdjustedNote(null);
    setConflictPreview(null);
  }, []);

  // -- Checklist handlers --
  const handleAddTask = useCallback(() => {
    const text = newTaskText.trim();
    if (!text || checklist.length >= MAX_CHECKLIST_ITEMS) return;
    setChecklist((prev) => [...prev, { id: generateId(), text, completed: false }]);
    setNewTaskText("");
    requestAnimationFrame(() => newTaskInputRef.current?.focus());
  }, [newTaskText, checklist.length]);

  const handleToggleTask = useCallback((id: string) => {
    setChecklist((prev) =>
      prev.map((item) => (item.id === id ? { ...item, completed: !item.completed } : item))
    );
  }, []);

  const handleTaskTextChange = useCallback((id: string, text: string) => {
    setChecklist((prev) =>
      prev.map((item) => (item.id === id ? { ...item, text } : item))
    );
  }, []);

  const handleRemoveTask = useCallback((id: string) => {
    setChecklist((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const handleChecklistDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setChecklist((prev) => {
      const oldIndex = prev.findIndex((item) => item.id === active.id);
      const newIndex = prev.findIndex((item) => item.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      const next = [...prev];
      const [moved] = next.splice(oldIndex, 1);
      next.splice(newIndex, 0, moved!);
      return next;
    });
  }, []);

  const checklistDoneCount = useMemo(
    () => checklist.filter((item) => item.completed).length,
    [checklist]
  );

  // Determine if save is valid
  const isValid =
    name.trim().length > 0 &&
    (!constraintType || (!!constraintType && !!constraintDate && !!constraintMode));

  if (!activity) return null;

  // Scheduled dates for context display
  const sa = schedule?.activities.find((a) => a.activityId === activityId);

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-xl z-50 max-h-[85vh] overflow-y-auto">
          <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Edit Activity
          </Dialog.Title>

          {/* Scheduled dates context */}
          {sa && (
            <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 flex gap-4">
              <span>Start: {formatDate(sa.startDate)}</span>
              <span>End: {formatDate(sa.endDate)}</span>
              {sa.totalFloat != null && (
                <span>Float: {sa.totalFloat}d</span>
              )}
            </div>
          )}

          <div className="mt-3 space-y-0">
            {/* ── Section 1: General ── */}
            <Section title="General" defaultOpen>
              {/* Name + Status (side-by-side) */}
              <div className="flex gap-3">
                <div className="flex-1 min-w-0">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={200}
                    className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:border-blue-400 focus:outline-none"
                  />
                </div>
                <div className="w-32 shrink-0">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Status
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as ActivityStatus)}
                    className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  >
                    {ACTIVITY_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {statusLabel(s)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {/* Actual Duration (only when complete) */}
              {status === "complete" && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Actual Duration (working days)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={actualDuration}
                    onChange={(e) => setActualDuration(e.target.value === "" ? "" : Number(e.target.value))}
                    className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:border-blue-400 focus:outline-none"
                  />
                </div>
              )}
            </Section>

            {/* ── Section 2: Estimates ── */}
            <Section title="Estimates" defaultOpen>
              <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr 1fr 2fr 2fr" }}>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Min
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={min}
                    onChange={(e) => setMin(e.target.value === "" ? "" : Number(e.target.value))}
                    className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:border-blue-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    ML
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={mostLikely}
                    onChange={(e) => setMostLikely(e.target.value === "" ? "" : Number(e.target.value))}
                    className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:border-blue-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Max
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={max}
                    onChange={(e) => setMax(e.target.value === "" ? "" : Number(e.target.value))}
                    className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:border-blue-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Confidence
                  </label>
                  <select
                    value={confidenceLevel}
                    onChange={(e) => setConfidenceLevel(e.target.value as RSMLevel)}
                    className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  >
                    {RSM_LEVELS.map((level) => (
                      <option key={level} value={level}>
                        {RSM_LABELS[level]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Distribution
                  </label>
                  <select
                    value={distributionType}
                    onChange={(e) => setDistributionType(e.target.value as DistributionType)}
                    className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  >
                    {DISTRIBUTION_TYPES.map((dt) => (
                      <option key={dt} value={dt}>
                        {distributionLabel(dt)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </Section>

            {/* ── Section 3: Scheduling Constraint ── */}
            <Section title="Scheduling Constraint" defaultOpen={false}>
              {hasMilestoneAnchor ? (
                <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-3">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Scheduling constraints are not available when a milestone anchor is set.
                    Remove the milestone anchor in the Milestone panel to enable constraints.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Constraint Type */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Type
                    </label>
                    <select
                      value={constraintType ?? ""}
                      onChange={handleTypeChange}
                      className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    >
                      <option value="">None</option>
                      {CONSTRAINT_TYPES.map((ct) => (
                        <option key={ct} value={ct}>
                          {ct} — {CONSTRAINT_LABELS[ct]}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Constraint Date */}
                  {constraintType && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        Date
                      </label>
                      <input
                        type="date"
                        value={constraintDate ?? ""}
                        onChange={handleDateChange}
                        className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      />
                      {dateAdjustedNote && (
                        <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                          {dateAdjustedNote}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Constraint Mode */}
                  {constraintType && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        Mode
                      </label>
                      <div className="flex gap-4">
                        {CONSTRAINT_MODES.map((mode) => (
                          <label key={mode} className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="radio"
                              name="constraintMode"
                              value={mode}
                              checked={constraintMode === mode}
                              onChange={() => setConstraintMode(mode)}
                              className="text-blue-600"
                            />
                            <span className="text-sm text-gray-700 dark:text-gray-300 capitalize">
                              {mode}
                            </span>
                          </label>
                        ))}
                      </div>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        {constraintMode === "hard"
                          ? "Hard: overrides computed dates. May cause conflicts."
                          : "Soft: advisory only. Violations shown as warnings."}
                      </p>
                    </div>
                  )}

                  {/* Note */}
                  {constraintType && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        Note <span className="font-normal text-gray-400 dark:text-gray-500">(optional)</span>
                      </label>
                      <textarea
                        value={constraintNote ?? ""}
                        onChange={(e) => setConstraintNote(e.target.value || null)}
                        maxLength={500}
                        rows={2}
                        placeholder="Why does this constraint exist?"
                        className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 resize-none focus:border-blue-400 focus:outline-none"
                      />
                      <p className="text-[10px] text-gray-400 dark:text-gray-500 text-right mt-0.5">
                        {(constraintNote ?? "").length}/500
                      </p>
                    </div>
                  )}

                  {/* Clear button */}
                  {constraintType && (
                    <button
                      type="button"
                      onClick={handleClearConstraint}
                      className="text-xs text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300"
                    >
                      Clear constraint
                    </button>
                  )}

                  {/* Conflict preview */}
                  {conflictPreview && (
                    <div
                      className={`rounded p-3 text-sm ${
                        conflictPreview.severity === "error"
                          ? "bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300"
                          : "bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 text-amber-700 dark:text-amber-300"
                      }`}
                    >
                      <p className="font-medium text-xs mb-1">
                        {conflictPreview.severity === "error" ? "Conflict" : "Warning"}
                      </p>
                      <p className="text-xs">
                        {conflictPreview.message.replace(/\d{4}-\d{2}-\d{2}/g, (m) => formatDate(m))}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </Section>

            {/* ── Section 4: Dependencies (only in dependency mode) ── */}
            {dependencyMode && (
              <Section title="Dependencies" defaultOpen={false}>
                {relatedDeps.length === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-gray-500">
                    No dependencies involving this activity.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {relatedDeps.map((dep) => {
                      const isPred = dep.toActivityId === activityId;
                      const otherId = isPred ? dep.fromActivityId : dep.toActivityId;
                      return (
                        <div
                          key={`${dep.fromActivityId}-${dep.toActivityId}`}
                          className="flex items-center justify-between gap-2 px-2 py-1.5 rounded bg-gray-50 dark:bg-gray-700/50 text-sm"
                        >
                          <div className="flex-1 min-w-0">
                            <span className="text-xs text-gray-400 dark:text-gray-500">
                              {isPred ? "Pred:" : "Succ:"}
                            </span>{" "}
                            <span className="text-gray-700 dark:text-gray-300 truncate">
                              {activityNameById(otherId)}
                            </span>
                            <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
                              {dep.type}{dep.lagDays !== 0 ? ` ${dep.lagDays > 0 ? "+" : ""}${dep.lagDays}d` : ""}
                            </span>
                          </div>
                          {onEditDependency && (
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                onEditDependency(dep.fromActivityId, dep.toActivityId);
                              }}
                              className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 shrink-0"
                            >
                              Edit
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {onAddDependency && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onAddDependency(activityId);
                    }}
                    className="mt-2 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                  >
                    + Add Dependency
                  </button>
                )}
              </Section>
            )}

            {/* ── Section 5: Tasks (Checklist) ── */}
            <Section
              title={`Tasks${checklist.length > 0 ? ` (${checklistDoneCount}/${checklist.length})` : ""}`}
              defaultOpen={false}
            >
              {checklist.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500">
                  No tasks added.
                </p>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleChecklistDragEnd}
                >
                  <SortableContext
                    items={checklist.map((item) => item.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-1">
                      {checklist.map((item) => (
                        <SortableChecklistRow
                          key={item.id}
                          item={item}
                          onToggle={handleToggleTask}
                          onTextChange={handleTaskTextChange}
                          onRemove={handleRemoveTask}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}

              {/* Add task input */}
              {checklist.length < MAX_CHECKLIST_ITEMS && (
                <div className="flex items-center gap-1.5 mt-2">
                  <input
                    ref={newTaskInputRef}
                    type="text"
                    value={newTaskText}
                    onChange={(e) => setNewTaskText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddTask(); } }}
                    maxLength={200}
                    placeholder="Add a task…"
                    className="flex-1 min-w-0 text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-blue-400 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleAddTask}
                    disabled={!newTaskText.trim()}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 disabled:opacity-40 shrink-0"
                  >
                    Add
                  </button>
                </div>
              )}

              {checklist.length > 0 && (
                <p className="text-[10px] text-gray-400 dark:text-gray-500 text-right mt-1">
                  {checklist.length}/{MAX_CHECKLIST_ITEMS}
                </p>
              )}
            </Section>
          </div>

          {/* Actions */}
          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild>
              <button
                type="button"
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              >
                Cancel
              </button>
            </Dialog.Close>
            <button
              type="button"
              disabled={!isValid}
              onClick={handleSave}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
