// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import * as Dialog from "@radix-ui/react-dialog";
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
  DeliverableItem,
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
import { parseDateISO, isWorkingDay, formatDateISO, countWorkingDays, activityEndDate } from "@core/calendar/calendar";
import { detectConstraintConflict } from "@core/schedule/constraint-utils";
import { distributionLabel, statusLabel, dependencyLabel } from "@domain/helpers/format-labels";
import { CONSTRAINT_LABELS } from "@domain/helpers/constraint-labels";
import { ChecklistSection } from "@ui/components/ChecklistSection";
import { DeliverablesSection } from "@ui/components/DeliverablesSection";
import { computeHeuristic } from "@core/estimation/heuristic";
import { computeElapsedDays } from "./activity-row-helpers";

interface ActivityEditModalProps {
  activityId: string;
  scenarioId: string;
  projectId: string;
  onClose: () => void;
  schedule: DeterministicSchedule | undefined;
  dependencyMode?: boolean;
  heuristicEnabled?: boolean;
  heuristicMinPercent?: number;
  heuristicMaxPercent?: number;
  onEditDependency?: (fromId: string, toId: string) => void;
  onAddDependency?: (fromId: string) => void;
  activityNumberMap?: Map<string, number> | null;
}

/** Collapsible section wrapper */
function Section({
  title,
  subtitle,
  defaultOpen = true,
  indicator,
  children,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  indicator?: boolean;
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
        {subtitle && (
          <span className="text-xs font-normal text-gray-400 dark:text-gray-500">{subtitle}</span>
        )}
        {indicator && (
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
        )}
      </button>
      {open && <div className="pb-3 space-y-3">{children}</div>}
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
  heuristicEnabled,
  heuristicMinPercent = 50,
  heuristicMaxPercent = 200,
  onEditDependency,
  onAddDependency,
  activityNumberMap,
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
  const updateActivityDeliverables = useProjectStore((s) => s.updateActivityDeliverables);
  const updateActivityNotes = useProjectStore((s) => s.updateActivityNotes);

  const calendar = useWorkCalendar(projectId);
  const formatDate = useDateFormat();

  // Computed before state declarations — needed for actualFinishDate initializer
  const sa = schedule?.activities.find((a) => a.activityId === activityId);
  const scheduledStartDate = sa?.startDate ?? null;

  // -- Local draft state: General --
  const [name, setName] = useState(activity?.name ?? "");
  const [status, setStatus] = useState<ActivityStatus>(activity?.status ?? "planned");
  const [actualDuration, setActualDuration] = useState<number | "">(activity?.actualDuration ?? "");

  // Actual finish date — ephemeral UI state only, never persisted.
  // Back-calculated from actualDuration on mount when all prerequisites are present.
  // Two pieces of state: `actualFinishDate` is the raw input value (updates on every keystroke),
  // `committedFinishDate` is the post-blur validated value (used for error display).
  const [actualFinishDate, setActualFinishDate] = useState<string>(() => {
    if (
      activity?.status !== "complete" ||
      activity?.actualDuration == null ||
      !scheduledStartDate
    ) {
      return "";
    }
    // activityEndDate(start, duration) = addWorkingDays(start, duration - 1)
    // The PM convention (start day = day 1) is encapsulated inside activityEndDate.
    return formatDateISO(
      activityEndDate(parseDateISO(scheduledStartDate), activity.actualDuration, calendar)
    );
  });
  const [committedFinishDate, setCommittedFinishDate] = useState(actualFinishDate);

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

  // -- Local draft state: Deliverables --
  const [deliverables, setDeliverables] = useState<DeliverableItem[]>(activity?.deliverables ?? []);

  // -- Local draft state: Notes --
  const [notes, setNotes] = useState<string>(activity?.notes ?? "");

  // -- Heuristic auto-fill: when ML changes, recalculate min/max --
  const handleMostLikelyBlur = useCallback(() => {
    if (!heuristicEnabled || mostLikely === "") return;
    const ml = Number(mostLikely);
    if (isNaN(ml) || ml <= 0) return;
    const { min: newMin, max: newMax } = computeHeuristic(ml, heuristicMinPercent, heuristicMaxPercent);
    setMin(newMin);
    setMax(newMax);
  }, [heuristicEnabled, mostLikely, heuristicMinPercent, heuristicMaxPercent]);

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
    (id: string) => {
      const a = allActivities.find((act) => act.id === id);
      const name = a?.name ?? id;
      const num = activityNumberMap?.get(id);
      return num ? `#${num} ${name}` : name;
    },
    [allActivities, activityNumberMap]
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

  // -- Actual finish date → duration (bidirectional sync) --
  // onChange buffers the raw value; onBlur runs snapping + duration computation.
  // This prevents computation errors from intermediate partial dates when typing.
  const handleActualFinishDateChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setActualFinishDate(e.target.value);
    },
    []
  );

  const handleActualFinishDateBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      if (!raw || !scheduledStartDate) {
        setActualFinishDate("");
        setCommittedFinishDate("");
        return;
      }

      // Snap non-working days forward — same pattern as constraint date handler
      const date = parseDateISO(raw);
      let guard = 0;
      while (!isWorkingDay(date, calendar) && guard < 10000) {
        date.setDate(date.getDate() + 1);
        guard++;
      }
      const snapped = formatDateISO(date);
      setActualFinishDate(snapped);
      setCommittedFinishDate(snapped);

      // Validate: finish must not precede scheduled start
      if (snapped < scheduledStartDate) return;

      // The + 1 corrects for countWorkingDays being exclusive of the end date,
      // combined with the PM convention that the start day counts as day 1.
      // Example: start=Monday, finish=Friday → countWorkingDays=4 → duration=5. ✓
      // Round-trip: activityEndDate(Monday, 5) = addWorkingDays(Monday, 4) = Friday. ✓
      const computed =
        countWorkingDays(parseDateISO(scheduledStartDate), date, calendar) + 1;
      setActualDuration(Math.max(1, computed));
    },
    [scheduledStartDate, calendar]
  );

  // -- Actual duration → finish date (bidirectional sync) --
  const handleActualDurationChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      if (raw === "") {
        setActualDuration("");
        setActualFinishDate("");
        setCommittedFinishDate("");
        return;
      }
      const val = Number(raw);
      setActualDuration(val);
      if (!scheduledStartDate || val < 1) {
        setActualFinishDate("");
        setCommittedFinishDate("");
        return;
      }
      // activityEndDate encapsulates the PM convention; no adjustment needed here.
      const computed = formatDateISO(
        activityEndDate(parseDateISO(scheduledStartDate), val, calendar)
      );
      setActualFinishDate(computed);
      setCommittedFinishDate(computed);
    },
    [scheduledStartDate, calendar]
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
    if (status === "complete" || status === "inProgress") {
      if (actualDuration !== "" && actualDuration !== activity.actualDuration) {
        updates.actualDuration = Number(actualDuration);
      }
    } else {
      // Planned — clear actualDuration
      updates.actualDuration = undefined;
    }

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

    // Deliverables — same split-save pattern as checklist
    const origDeliverables = activity.deliverables ?? [];
    const deliverablesChanged = JSON.stringify(deliverables) !== JSON.stringify(origDeliverables);
    const newDeliverables = deliverables.length > 0 ? deliverables : undefined;
    if (deliverablesChanged) {
      updateActivityDeliverables(projectId, scenarioId, activityId, newDeliverables);
    }

    // Notes — same split-save pattern
    const origNotes = activity.notes ?? "";
    const notesChanged = notes !== origNotes;
    const newNotes = notes.trim() || undefined;
    if (notesChanged) {
      updateActivityNotes(projectId, scenarioId, activityId, newNotes);
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
    deliverables,
    notes,
    updateActivityField,
    updateActivityChecklist,
    updateActivityDeliverables,
    updateActivityNotes,
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

  const checklistDoneCount = useMemo(
    () => checklist.filter((item) => item.completed).length,
    [checklist]
  );

  const deliverablesDoneCount = useMemo(
    () => deliverables.filter((item) => item.completed).length,
    [deliverables]
  );

  // Determine if save is valid
  const isValid =
    name.trim().length > 0 &&
    (!constraintType || (!!constraintType && !!constraintDate && !!constraintMode));

  // -- Dirty check: detect any unsaved changes --
  const hasChanges = useMemo(() => {
    if (!activity) return false;
    if (name.trim() !== activity.name) return true;
    if (status !== activity.status) return true;
    if ((status === "complete" || status === "inProgress") && actualDuration !== "" && actualDuration !== activity.actualDuration) return true;
    if (min !== "" && Number(min) !== activity.min) return true;
    if (mostLikely !== "" && Number(mostLikely) !== activity.mostLikely) return true;
    if (max !== "" && Number(max) !== activity.max) return true;
    if (confidenceLevel !== activity.confidenceLevel) return true;
    if (distributionType !== activity.distributionType) return true;
    if ((constraintType ?? null) !== (activity.constraintType ?? null)) return true;
    if ((constraintDate ?? null) !== (activity.constraintDate ?? null)) return true;
    if ((constraintMode ?? null) !== (activity.constraintMode ?? null)) return true;
    if ((constraintNote?.trim() || null) !== (activity.constraintNote ?? null)) return true;
    if (JSON.stringify(checklist) !== JSON.stringify(activity.checklist ?? [])) return true;
    if (JSON.stringify(deliverables) !== JSON.stringify(activity.deliverables ?? [])) return true;
    if (notes !== (activity.notes ?? "")) return true;
    return false;
  }, [activity, name, status, actualDuration, min, mostLikely, max, confidenceLevel, distributionType, constraintType, constraintDate, constraintMode, constraintNote, checklist, deliverables, notes]);

  const handleDismiss = useCallback(() => {
    if (hasChanges && isValid) {
      const shouldSave = window.confirm("You have unsaved changes. Save them?");
      if (shouldSave) {
        handleSave();
        return;
      }
      // Cancel → return to modal (do nothing)
      return;
    }
    onClose();
  }, [hasChanges, isValid, handleSave, onClose]);

  if (!activity) return null;

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) handleDismiss(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-xl z-50 max-h-[85vh] overflow-y-auto">
          <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Edit Activity
          </Dialog.Title>

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
                    onChange={(e) => {
                      const newStatus = e.target.value as ActivityStatus;
                      setStatus(newStatus);
                      if (newStatus === "inProgress" && scheduledStartDate && actualDuration === "") {
                        // Mirror grid behavior: compute elapsed on transition to inProgress
                        setActualDuration(
                          computeElapsedDays(scheduledStartDate, calendar ?? undefined)
                        );
                      }
                      if (newStatus === "planned") {
                        setActualDuration("");
                        setActualFinishDate("");
                        setCommittedFinishDate("");
                      }
                    }}
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
              {/* Schedule context + Actual Duration/Finish (visible when schedule exists) */}
              {scheduledStartDate && (
                <div className={`grid gap-3 ${status === "complete" ? "grid-cols-4" : "grid-cols-3"}`}>
                  {/* Col 1: Scheduled Finish (display only — always) */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Sched. Finish
                    </label>
                    <p className="text-sm text-gray-900 dark:text-gray-100 py-1.5">
                      {formatDate(sa!.endDate)}
                    </p>
                  </div>

                  {/* Col 2: Scheduled Duration (display only — always) */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Sched. Duration
                    </label>
                    <p className="text-sm text-gray-900 dark:text-gray-100 py-1.5">
                      {sa!.duration}d
                    </p>
                  </div>

                  {/* Col 3: Actual Duration — disabled for planned, editable for inProgress + complete */}
                  <div title={
                    status === "planned"
                      ? "Set status to In Progress or Complete to enter actual duration"
                      : status === "inProgress"
                        ? "Working days elapsed since the scheduled start. Used as the minimum floor for simulation trials."
                        : "Total working days from scheduled start to actual finish"
                  }>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Actual Duration
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={actualDuration}
                      placeholder={status === "inProgress" ? "Elapsed" : undefined}
                      onChange={
                        status === "complete"
                          ? handleActualDurationChange
                          : (e) => setActualDuration(e.target.value === "" ? "" : Number(e.target.value))
                      }
                      disabled={status === "planned"}
                      className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:border-blue-400 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>

                  {/* Col 4: Actual Finish Date — complete only */}
                  {status === "complete" && (
                    <div title="Entering a date auto-calculates duration; entering a duration auto-calculates this date">
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        Actual Finish
                      </label>
                      <input
                        type="date"
                        value={actualFinishDate}
                        onChange={handleActualFinishDateChange}
                        onBlur={handleActualFinishDateBlur}
                        min={scheduledStartDate}
                        className={`w-full text-sm border rounded px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:border-blue-400 focus:outline-none ${
                          committedFinishDate && committedFinishDate < scheduledStartDate
                            ? "border-red-400 dark:border-red-500"
                            : "border-gray-300 dark:border-gray-600"
                        }`}
                      />
                      {committedFinishDate && committedFinishDate < scheduledStartDate && (
                        <p className="text-xs text-red-500 dark:text-red-400 mt-0.5">
                          Finish date cannot be before the scheduled start.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </Section>

            {/* ── Section 2: Estimates ── */}
            <Section title="Estimates" defaultOpen={false}>
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
                    onBlur={handleMostLikelyBlur}
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
            <Section title="Scheduling Constraint" defaultOpen={false} indicator={!!constraintType}>
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
              <Section title="Dependencies" defaultOpen={false} indicator={relatedDeps.length > 0}>
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
                              {dependencyLabel(dep.type)}{dep.lagDays !== 0 ? `, ${dep.lagDays > 0 ? "+" : ""}${dep.lagDays}d` : ""}
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
              title="Tasks"
              subtitle={checklist.length > 0 ? `(${checklistDoneCount}/${checklist.length})` : undefined}
              defaultOpen={false}
            >
              <ChecklistSection checklist={checklist} onChange={setChecklist} />
            </Section>

            {/* ── Section 6: Deliverables ── */}
            <Section
              title="Deliverables"
              subtitle={deliverables.length > 0 ? `(${deliverablesDoneCount}/${deliverables.length})` : undefined}
              defaultOpen={false}
            >
              <DeliverablesSection deliverables={deliverables} onChange={setDeliverables} />
            </Section>

            {/* ── Section 7: Notes ── */}
            <Section
              title="Notes"
              defaultOpen={false}
              indicator={!!notes.trim()}
            >
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={2000}
                rows={3}
                placeholder="Add notes about this activity…"
                className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 resize-none focus:border-blue-400 focus:outline-none"
              />
              <p className="text-[10px] text-gray-400 dark:text-gray-500 text-right mt-0.5">
                {notes.length}/2000
              </p>
            </Section>

            {/* ── Section 8: Schedule Analysis (dependency mode only) ── */}
            {dependencyMode && sa && (
              <Section title="Schedule Analysis" defaultOpen={false}>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div className="text-gray-500 dark:text-gray-400">Scheduled Start</div>
                  <div className="text-gray-900 dark:text-gray-100">{formatDate(sa.startDate)}</div>
                  <div className="text-gray-500 dark:text-gray-400">Scheduled Finish</div>
                  <div className="text-gray-900 dark:text-gray-100">{formatDate(sa.endDate)}</div>
                  <div className="text-gray-500 dark:text-gray-400">Duration</div>
                  <div className="text-gray-900 dark:text-gray-100">{sa.duration} working days</div>
                  <div className="text-gray-500 dark:text-gray-400">Total Float</div>
                  <div className="text-gray-900 dark:text-gray-100">
                    {sa.totalFloat === 0
                      ? "Critical path \u2014 0 days float"
                      : `${sa.totalFloat} days`}
                  </div>
                  {sa.freeFloat != null && (
                    <>
                      <div className="text-gray-500 dark:text-gray-400">Free Float</div>
                      <div className="text-gray-900 dark:text-gray-100">{sa.freeFloat} days</div>
                    </>
                  )}
                </div>
              </Section>
            )}
          </div>

          {/* Actions */}
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
            >
              Cancel
            </button>
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
