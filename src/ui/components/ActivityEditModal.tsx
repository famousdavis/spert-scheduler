// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useEffect, useId, useRef, useCallback, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import type {
  Activity,
  ConstraintType,
  ConstraintMode,
  ConstraintConflict,
  DeterministicSchedule,
  RSMLevel,
  DistributionType,
  ActivityStatus,
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
import { confirmDialog } from "@ui/hooks/use-confirm-store";
import { useProjectStore } from "@ui/hooks/use-project-store";
import { useWorkCalendar } from "@ui/hooks/use-work-calendar";
import { useDateFormat } from "@ui/hooks/use-date-format";
import { parseDateISO, isWorkingDay, formatDateISO, countWorkingDays, activityEndDate, MAX_CALENDAR_ITERATIONS } from "@core/calendar/calendar";
import { detectConstraintConflict } from "@core/schedule/constraint-utils";
import { distributionLabel, statusLabel } from "@domain/helpers/format-labels";
import { CONSTRAINT_LABELS } from "@domain/helpers/constraint-labels";
import { confidenceApplies, CONFIDENCE_NA_TITLE } from "@domain/helpers/confidence-applies";
import { nameOrUnnamed } from "@domain/helpers/display-name";
import { ChecklistSection } from "@ui/components/ChecklistSection";
import { DeliverablesSection } from "@ui/components/DeliverablesSection";
import {
  ScheduleContextRow,
  Section,
  computeConstraintUpdates,
  computeDescriptionUpdate,
  computeGeneralUpdates,
  computeEstimateUpdates,
  DependenciesDisplaySection,
  ScheduleAnalysisSection,
} from "@ui/components/activity-modal-sections";
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
  // Read from LOCAL state, not the saved activity: switching the distribution inside the
  // modal must grey the Confidence control immediately, before any save.
  const confidenceIsRelevant = confidenceApplies(distributionType);

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
  const [description, setDescription] = useState<string>(activity?.description ?? "");

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
  const baseId = useId();
  const fieldNameId = `${baseId}-name`;
  const fieldNameErrorId = `${baseId}-name-error`;
  const fieldStatusId = `${baseId}-status`;
  const fieldMinId = `${baseId}-min`;
  const fieldMlId = `${baseId}-ml`;
  const fieldMaxId = `${baseId}-max`;
  const fieldConfidenceId = `${baseId}-confidence`;
  const fieldDistributionId = `${baseId}-distribution`;
  const fieldConstraintTypeId = `${baseId}-ctype`;
  const fieldConstraintDateId = `${baseId}-cdate`;
  const fieldConstraintNoteId = `${baseId}-cnote`;
  const fieldNotesId = `${baseId}-notes`;
  const fieldDescriptionId = `${baseId}-description`;
  const fieldDescriptionCounterId = `${baseId}-description-counter`;
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
      // No such activity → the id is the only identifier left. Present but
      // unnamed → the placeholder, which `?? id` could not catch.
      const name = a ? nameOrUnnamed(a.name) : id;
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
      // <input type="date"> produces YYYY-MM-DD or empty; guard against
      // malformed strings that would cause parseDateISO to produce NaN dates.
      if (!raw || !scheduledStartDate || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        setActualFinishDate("");
        setCommittedFinishDate("");
        return;
      }

      // Snap non-working days forward — same pattern as constraint date handler
      const date = parseDateISO(raw);
      let guard = 0;
      while (!isWorkingDay(date, calendar) && guard < MAX_CALENDAR_ITERATIONS) {
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
      const parsed = Number(raw);
      if (isNaN(parsed)) return;
      const val = Math.max(1, Math.floor(parsed));
      setActualDuration(val);
      if (!scheduledStartDate) {
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

  // -- Build field updates (General + Estimates + Constraint) --
  // Reused by both handleSave and hasChanges to avoid duplicated diff logic.
  const buildFieldUpdates = useCallback((): Partial<Activity> => {
    if (!activity) return {};

    // Each section owns its own diff rules, including the two that emit an EXPLICIT
    // `undefined` to clear a stored value (actualDuration, description). Object.assign
    // preserves those own-properties, which is what save and dismiss-detection count.
    return Object.assign(
      {} as Partial<Activity>,
      computeGeneralUpdates(activity, name, status, actualDuration),
      computeEstimateUpdates(activity, min, mostLikely, max, confidenceLevel, distributionType),
      computeConstraintUpdates(activity, constraintType, constraintDate, constraintMode, constraintNote),
      computeDescriptionUpdate(activity, description),
    );
  }, [activity, name, status, actualDuration, min, mostLikely, max, confidenceLevel, distributionType, constraintType, constraintDate, constraintMode, constraintNote, description]);

  // -- Save: only send changed fields --
  const handleSave = useCallback(() => {
    if (!activity) return;

    const updates = buildFieldUpdates();

    // Non-checklist field updates go through normal path (invalidates simulation)
    if (Object.keys(updates).length > 0) {
      updateActivityField(projectId, scenarioId, activityId, updates);
    }

    // Checklist — separate save path to avoid simulation invalidation
    const origChecklist = activity.checklist ?? [];
    const checklistChanged = JSON.stringify(checklist) !== JSON.stringify(origChecklist);
    if (checklistChanged) {
      updateActivityChecklist(projectId, scenarioId, activityId, checklist.length > 0 ? checklist : undefined);
    }

    // Deliverables — same split-save pattern as checklist
    const origDeliverables = activity.deliverables ?? [];
    const deliverablesChanged = JSON.stringify(deliverables) !== JSON.stringify(origDeliverables);
    if (deliverablesChanged) {
      updateActivityDeliverables(projectId, scenarioId, activityId, deliverables.length > 0 ? deliverables : undefined);
    }

    // Notes — same split-save pattern
    const origNotes = activity.notes ?? "";
    if (notes !== origNotes) {
      updateActivityNotes(projectId, scenarioId, activityId, notes.trim() || undefined);
    }

    onClose();
  }, [
    activity,
    buildFieldUpdates,
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

  // Determine if save is valid.
  // `nameMissing` is the same condition surfaced to the user: the Save button was already
  // correctly disabled for an empty name, but nothing said WHY.
  const nameMissing = name.trim().length === 0;
  const isValid =
    name.trim().length > 0 &&
    (!constraintType || (!!constraintType && !!constraintDate && !!constraintMode));

  // -- Dirty check: detect any unsaved changes --
  const hasChanges = useMemo(() => {
    if (!activity) return false;
    // Field updates (General + Estimates + Constraint)
    if (Object.keys(buildFieldUpdates()).length > 0) return true;
    // Qualitative paths
    if (JSON.stringify(checklist) !== JSON.stringify(activity.checklist ?? [])) return true;
    if (JSON.stringify(deliverables) !== JSON.stringify(activity.deliverables ?? [])) return true;
    if (notes !== (activity.notes ?? "")) return true;
    return false;
  }, [activity, buildFieldUpdates, checklist, deliverables, notes]);

  /**
   * Escape and overlay-click. Asks through the app's own dialog host rather than the browser's
   * box (v0.67.12) — and asks TWO DIFFERENT QUESTIONS from one function, which is deliberate.
   *
   * ⚠️ Only the FIRST branch is a three-way. A valid draft can be saved, discarded or kept; an
   * unsaveable one cannot be saved at all, so offering Save there would promise something the app
   * cannot do. That is site 8's own reason and it is NOT the reason `handleCancel` below stays
   * two-way — see the block above the buttons for that one. Anyone "unifying the modal's three
   * prompts" is re-shipping the defect the owner reverted in v0.67.3.
   *
   * The three-way's labels, order and default focus are not settable from here: they live in
   * `UnsavedChangesDialog`, and `askUnsavedChanges()` takes no arguments.
   */
  const handleDismiss = useCallback(async () => {
    if (hasChanges && isValid) {
      const answer = await confirmDialog.askUnsavedChanges();
      if (answer === "save") {
        handleSave();
        return;
      }
      if (answer === "keep") return;
      // "discard" falls through to onClose() below. That outcome did not exist on this route
      // before v0.67.12 — abandoning a valid draft meant reaching for the Cancel button — and
      // closing that gap is what this release is for.
    }
    // Changes exist but the form cannot be saved — before v0.62.0 this fell straight through
    // to onClose(), so dismissing an activity whose name had been cleared threw away
    // EVERY edit with no prompt at all: the unsaved-changes guard was suppressed by the
    // very state that made saving impossible. Warn instead, and default to staying put.
    // ⚠️ THE DATE IS THE POINT, and it is the only edit to v0.62.0's paragraph. This warning is
    // NOT new in v0.67.12 — only the window it appears in is. Undated, the "previously" read as
    // though this release introduced it, and a reader specifically hunting false provenance on
    // this file misread it that way. False provenance here is what shipped v0.67.3.
    if (hasChanges && !isValid) {
      const shouldDiscard = await confirmDialog.ask({
        title: "Discard your changes?",
        // ⚠️ TWO CAUSES, not one. `isValid` fails on an empty name OR on a constraint missing
        // its date or mode, and until v0.67.12 both produced the single sentence "This activity
        // needs a name…" — which, with a perfectly good name and a half-filled constraint, was
        // simply false. It also mattered more in that case than in the other: the empty name
        // renders "Activity name is required." inline beneath the field, whereas an incomplete
        // constraint renders no explanation anywhere, so this prompt is the only place the user
        // is told. Pinned by "names the CONSTRAINT, not the name…" in the test file.
        description: nameMissing
          ? "This activity needs a name, so your changes can't be saved. Discarding them can't be undone."
          : "This activity's constraint needs both a date and a mode, so your changes can't be saved. Discarding them can't be undone.",
        confirmLabel: "Discard",
        // Not the default "Cancel": this modal has a button of its own by that name which does
        // something else, and two controls reading "Cancel" one on top of the other is a
        // question about which one is being answered.
        cancelLabel: "Keep editing",
        destructive: true,
      });
      if (!shouldDiscard) return;
    }
    onClose();
  }, [hasChanges, isValid, nameMissing, handleSave, onClose]);

  /**
   * Cancel's own handler. Deliberately NOT a branch inside handleDismiss — the two controls ask
   * different questions. Escape asks "save?"; Cancel asks "discard?".
   *
   * ⚠️ It must never save, and it cannot — now for TWO independent reasons. handleSave is not
   * referenced here and must not be added; and since v0.67.12 the question goes through
   * `confirmDialog.ask`, which returns Promise<boolean>, so "save" is unrepresentable in the type
   * this function awaits. `tsc` enforces the second in the ship gate. Do NOT route this through
   * `askUnsavedChanges` to "match" Escape: that call's type admits "save", which is exactly the
   * door v0.67.3 came through. v0.67.3 routed Cancel through handleDismiss, whose prompt asks
   * "Save them?" — so OK saved and the only other answer kept editing, leaving no way to abandon
   * a valid draft at all.
   *
   * One wording for both the valid and the invalid case, on purpose. handleDismiss says "can't be
   * saved" for an empty name, which is useful when the question is whether to save; on THIS button
   * it would be misleading, because Cancel never saves and the discard is not a consequence of the
   * missing name. The saveability reason is already on screen anyway — Save is disabled, and the
   * field renders "Activity name is required." with aria-invalid/aria-describedby wired to it.
   *
   * ⚠️ Clearing ONLY the name and pressing Cancel produces NO prompt, and that is correct rather
   * than a missed case: computeGeneralUpdates (activity-modal-sections.tsx) drops a name that
   * trims to empty, so hasChanges is false and there is nothing to discard. This reads like a
   * defect on first inspection and has been raised as one; it is not.
   */
  const handleCancel = useCallback(async () => {
    if (hasChanges) {
      const shouldDiscard = await confirmDialog.ask({
        title: "Discard your unsaved changes?",
        // True of BOTH the valid and the invalid draft, which the one-wording decision above
        // requires. Nothing has been written to the store on this path, so there is no undo entry
        // to offer either — unlike the grid's deletes, where "Undo restores it" is the accurate
        // line. The edits exist only in this component's state and go with it.
        description: "Your edits to this activity are lost, and this can't be undone.",
        confirmLabel: "Discard",
        cancelLabel: "Keep editing",
        destructive: true,
      });
      if (!shouldDiscard) return;
    }
    onClose();
  }, [hasChanges, onClose]);

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
                  <label htmlFor={fieldNameId} className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Name
                  </label>
                  <input
                    id={fieldNameId}
                    name="activityName"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={200}
                    aria-invalid={nameMissing}
                    aria-describedby={nameMissing ? fieldNameErrorId : undefined}
                    className={
                      nameMissing
                        ? "w-full text-sm border border-red-400 dark:border-red-500 rounded px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:border-red-400 focus:outline-none"
                        : "w-full text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:border-blue-400 focus:outline-none"
                    }
                  />
                  {nameMissing && (
                    <p id={fieldNameErrorId} className="text-xs text-red-500 dark:text-red-400 mt-0.5">
                      Activity name is required.
                    </p>
                  )}
                </div>
                <div className="w-32 shrink-0">
                  <label htmlFor={fieldStatusId} className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Status
                  </label>
                  <select
                    id={fieldStatusId}
                    name="activityStatus"
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
                      if (newStatus === "complete" && actualDuration === "" && sa) {
                        // Mirror the bulk Mark-complete path: default to the scheduled
                        // deterministic duration so the activity carries a fixed value.
                        setActualDuration(sa.duration);
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
              {/* Description — full-width scope text below Name/Status. Compact
                  2-row start; drag-taller only (do NOT copy Notes' 5-row min-h). */}
              <div className="mt-3">
                <label htmlFor={fieldDescriptionId} className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Description
                </label>
                <textarea
                  id={fieldDescriptionId}
                  name="activityDescription"
                  aria-describedby={fieldDescriptionCounterId}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={2000}
                  rows={2}
                  placeholder="Plain-language scope — what this activity entails…"
                  className="w-full min-h-[3.5rem] text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 resize-y focus:border-blue-400 focus:outline-none"
                />
                <p id={fieldDescriptionCounterId} className="mt-0.5 text-right text-xs text-gray-400 dark:text-gray-500">
                  {description.length}/2000
                </p>
              </div>
              {/* Schedule context + Actual Duration/Finish (visible when schedule exists) */}
              {scheduledStartDate && sa && (
                <ScheduleContextRow
                  status={status}
                  sa={sa}
                  scheduledStartDate={scheduledStartDate}
                  actualDuration={actualDuration}
                  actualFinishDate={actualFinishDate}
                  committedFinishDate={committedFinishDate}
                  formatDate={formatDate}
                  handleActualDurationChange={handleActualDurationChange}
                  handleActualFinishDateChange={handleActualFinishDateChange}
                  handleActualFinishDateBlur={handleActualFinishDateBlur}
                  setActualDuration={setActualDuration}
                />
              )}
            </Section>

            {/* ── Section 2: Estimates ── */}
            <Section title="Estimates" defaultOpen={false}>
              <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr 1fr 2fr 2fr" }}>
                <div>
                  <label htmlFor={fieldMinId} className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Min
                  </label>
                  <input
                    id={fieldMinId}
                    name="estimateMin"
                    type="number"
                    min={0}
                    step={0.5}
                    value={min}
                    onChange={(e) => setMin(e.target.value === "" ? "" : Number(e.target.value))}
                    className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:border-blue-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor={fieldMlId} className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    ML
                  </label>
                  <input
                    id={fieldMlId}
                    name="estimateMostLikely"
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
                  <label htmlFor={fieldMaxId} className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Max
                  </label>
                  <input
                    id={fieldMaxId}
                    name="estimateMax"
                    type="number"
                    min={0}
                    step={0.5}
                    value={max}
                    onChange={(e) => setMax(e.target.value === "" ? "" : Number(e.target.value))}
                    className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:border-blue-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor={fieldDistributionId} className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Distribution
                  </label>
                  <select
                    id={fieldDistributionId}
                    name="distributionType"
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
                <div>
                  <label htmlFor={fieldConfidenceId} className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Confidence
                  </label>
                  <select
                    id={fieldConfidenceId}
                    name="confidenceLevel"
                    value={confidenceLevel}
                    onChange={(e) => setConfidenceLevel(e.target.value as RSMLevel)}
                    disabled={!confidenceIsRelevant}
                    title={confidenceIsRelevant ? undefined : CONFIDENCE_NA_TITLE}
                    className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {RSM_LEVELS.map((level) => (
                      <option key={level} value={level}>
                        {RSM_LABELS[level]}
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
                    <label htmlFor={fieldConstraintTypeId} className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Type
                    </label>
                    <select
                      id={fieldConstraintTypeId}
                      name="constraintType"
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
                      <label htmlFor={fieldConstraintDateId} className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        Date
                      </label>
                      <input
                        id={fieldConstraintDateId}
                        name="constraintDate"
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
                      <div className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1" role="group" aria-label="Constraint mode">
                        Mode
                      </div>
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
                      <label htmlFor={fieldConstraintNoteId} className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        Note <span className="font-normal text-gray-400 dark:text-gray-500">(optional)</span>
                      </label>
                      <textarea
                        id={fieldConstraintNoteId}
                        name="constraintNote"
                        value={constraintNote ?? ""}
                        onChange={(e) => setConstraintNote(e.target.value || null)}
                        maxLength={500}
                        rows={2}
                        placeholder="Why does this constraint exist?"
                        className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 resize-none focus:border-blue-400 focus:outline-none"
                      />
                      <p className="text-xs text-gray-400 dark:text-gray-500 text-right mt-0.5">
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
                <DependenciesDisplaySection
                  relatedDeps={relatedDeps}
                  activityId={activityId}
                  activityNameById={activityNameById}
                  onEditDependency={onEditDependency}
                  onAddDependency={onAddDependency}
                />
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
              indicatorColor="bg-violet-500 dark:bg-violet-400"
            >
              <textarea
                id={fieldNotesId}
                name="activityNotes"
                aria-label="Activity notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={2000}
                rows={5}
                placeholder="Add notes about this activity…"
                // resize-y exposes the native bottom-right grab handle (vertical only); the
                // browser owns the drag, so releasing the mouse outside the modal still
                // completes correctly. min-h floors the box at its 5-row open height so the
                // user can drag it taller but never shorter than the default.
                className="w-full min-h-[114px] text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 resize-y focus:border-blue-400 focus:outline-none"
              />
              <p className="text-xs text-gray-400 dark:text-gray-500 text-right mt-0.5">
                {notes.length}/2000
              </p>
            </Section>

            {/* ── Section 8: Schedule Analysis (dependency mode only) ── */}
            {dependencyMode && sa && (
              <Section title="Schedule Analysis" defaultOpen={false}>
                <ScheduleAnalysisSection sa={sa} formatDate={formatDate} />
              </Section>
            )}
          </div>

          {/* Actions */}
          <div className="mt-5 flex justify-end gap-2">
            {/*
              ⚠️ THREE DELIBERATE DECISIONS LIVE ON THESE TWO BUTTONS, and every one of them has
              already been changed or proposed for change at least once. Read before touching either.

              1. Cancel PROMPTS, and the prompt is DISCARD-shaped — owner ruling, 2026-09-06:
                 "It would be better to prompt the user and ask them if they want to discard their
                 unsaved changes. That is a safer choice. They might think they hit Save and their
                 changes were saved when in fact they were discarded."
                 ⚠️ The prompt must never offer to SAVE. v0.67.3 routed this button through
                 handleDismiss, whose question is "Save them?" — OK saved, the other answer kept
                 editing, and there was no discard path left anywhere. v0.67.5 replaced it with
                 handleCancel, which cannot save because it does not reference handleSave.
                 ⚠️ This button was a silent onClose() from v0.29.1 to v0.67.2, then handleDismiss
                 in v0.67.3, then briefly onClose() again before this shipped. THREE changes. If a
                 fourth looks obviously right, re-read this block first.

              2. Cancel sits LEFT of Save on purpose — owner ruling, 2026-09-06, an informed
                 DECLINE and not an oversight. The risk was measured before he ruled: a mis-hit
                 Save writes to the store and is Cmd+Z-recoverable, while a mis-hit Cancel destroys
                 local draft state with no recovery hook anywhere in this modal. Keyboard paths
                 were ruled out (nothing autofocuses Cancel; both buttons are type="button", so no
                 Enter-submit), leaving pointer adjacency as the only route. He weighed exactly
                 that and kept the order: "I like the button order. I've never misclicked once
                 using this app. At some point, we have to treat adults as if they're adults."
                 ⚠️ The confirmation in (1) is what he chose INSTEAD of reordering. Do not reorder
                 these buttons on the strength of the misclick argument — it has been made and
                 answered.

              3. Escape and overlay-click keep handleDismiss — owner ruling, 2026-09-06, and it
                 is the original v0.29.1 design, not a later addition. The asymmetry is intended:
                 clicking a control labelled Cancel is deliberate, whereas Escape and a stray click
                 outside can be accidental. ⚠️ That asymmetry is the part of this decision that has
                 NOT changed, and it is the part worth protecting: Escape may offer to save, Cancel
                 may not. Do not collapse them now that both ask through a dialog.
                 ⚠️ ITS KNOWN GAP WAS CLOSED IN v0.67.12 — annotated rather than rewritten, because
                 the reasoning is what dates the decision. It read: "KNOWN GAP, owned not
                 undiscovered: Escape therefore has no discard path of its own — save or keep
                 editing, which is the same shape that made v0.67.3 wrong here. Closing it needs a
                 three-way (save / discard / keep editing), which a native confirm() cannot
                 express. That is tracked separately; do not improvise it here." It was tracked, as
                 WI-6d, and closed there — not improvised. handleDismiss now asks through
                 UnsavedChangesDialog, whose three outcomes are exactly the three named above.

              ⚠️ Do not reinstate handleDismiss on this button on the strength of either past
              incident. That false provenance is what caused v0.67.3:
                • v0.62.0 (0efb637) fixed handleDismiss's invalid-name branch — an emptied name
                  discarding every other edit. Reached by Escape and overlay-click.
                • v0.64.1 (3d3119c) removed the onClose PROP this file was passing down to the
                  dependency section — one line, `onClose={onClose}`. That section called it, which
                  destroyed the editor instead of stacking the dialog. A different call site, and
                  not a call in this button at all.
              Neither ever touched this button. Its line history runs v0.20.0 -> v0.29.1 -> v0.67.3.
            */}
            <button
              type="button"
              onClick={handleCancel}
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
