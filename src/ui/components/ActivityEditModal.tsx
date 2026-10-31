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
  ProgressNote,
  ScheduledActivity,
} from "@domain/models/types";
import {
  CONSTRAINT_TYPES,
  CONSTRAINT_MODES,
  RSM_LEVELS,
  RSM_LABELS,
  DISTRIBUTION_TYPES,
  ACTIVITY_STATUSES,
  NAME_MAX_LENGTH,
} from "@domain/models/types";
import { confirmDialog } from "@ui/hooks/use-confirm-store";
import { useProjectStore } from "@ui/hooks/use-project-store";
import { useWorkCalendar } from "@ui/hooks/use-work-calendar";
import { useDateFormat } from "@ui/hooks/use-date-format";
import { parseDateISO, isWorkingDay, formatDateISO, activityEndDate } from "@core/calendar/calendar";
import { computeDependencyDurations } from "@core/schedule/deterministic";
import { detectConstraintConflict } from "@core/schedule/constraint-utils";
import { distributionLabel, statusLabel } from "@domain/helpers/format-labels";
import { CONSTRAINT_LABELS } from "@domain/helpers/constraint-labels";
import {
  confidenceInertReason,
  CONFIDENCE_INERT_TITLES,
  distributionIsInert,
  DISTRIBUTION_INERT_TITLE,
} from "@domain/helpers/confidence-applies";
import { nameOrUnnamed } from "@domain/helpers/display-name";
import {
  estimateOrderIssues,
  logNormalHasNoMean,
  LOGNORMAL_NEEDS_ESTIMATE_ABOVE_ZERO,
  type EstimateKey,
} from "@domain/helpers/estimate-rules";
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
import {
  saveBlockedReason,
  unsaveableCause,
  unsaveableDescription,
  type UnsaveableCause,
} from "@ui/helpers/unsaveable-cause";
import { todayISO } from "./activity-row-helpers";
import {
  statusChangeUpdates,
  snapRecordedDate,
  elapsedWorkingDays,
  recordedDuration,
} from "@core/schedule/recorded-progress";
import { actualDatesFault } from "@ui/helpers/actual-dates-fault";
import { progressNoteKey, progressNoteSentence } from "@ui/helpers/progress-note-words";
import { generateId } from "@app/api/id";

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

/**
 * WI-138 (v0.79.28) — the cap each list's Add keeps to (`MAX_CHECKLIST_ITEMS`,
 * `MAX_DELIVERABLE_ITEMS`), and the schema's `.max(50)` for both lists. The box is not shown at the
 * cap and only Add grows a list in this window, so typed text never meets a full list; the check
 * keeps Save's add exactly Add's.
 */
const MAX_LIST_ITEMS = 50;

/**
 * WI-138 (v0.79.28) — what Save adds from a Tasks or Deliverables box: its text, trimmed, or null
 * when it adds nothing (a blank box, or a full list). The ONE trim, read both by Save and by the
 * unsaved-changes check, so the two cannot disagree about whether there is something to add.
 */
function typedItemText(count: number, typed: string): string | null {
  const text = typed.trim();
  return text && count < MAX_LIST_ITEMS ? text : null;
}

/**
 * The list as Save writes it: the box's text appended as Add appends it, or the list unchanged. One
 * function for both lists — a task and a deliverable are the same shape (`types.ts`).
 */
function withTypedItem(items: ChecklistItem[] | DeliverableItem[], typed: string): ChecklistItem[] {
  const text = typedItemText(items.length, typed);
  return text === null ? items : [...items, { id: generateId(), text, completed: false }];
}

/**
 * The Distribution control's look: grey text, with a title saying why, where the drafts carry no
 * uncertainty (`distributionIsInert`) — the grid does the same. It stays ENABLED either way.
 *
 * Unexported and module-level, spread onto the `<select>`: this component sits at the
 * cognitive-complexity threshold, and a ternary in its body would count against it. Two WHOLE
 * class strings, never a fragment assembled at runtime: Tailwind 4 only emits CSS for class
 * names it can read as static text. The greys are the grid's, measured again against this
 * select's own backgrounds (`bg-white`, `dark:bg-gray-700`), because the control is enabled
 * and its text must reach 4.5:1.
 */
function distributionSelectLook(inert: boolean): { className: string; title?: string } {
  return inert
    ? {
        className:
          "w-full text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-300",
        title: DISTRIBUTION_INERT_TITLE,
      }
    : {
        className:
          "w-full text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100",
      };
}

type EstimateDraft = number | "";

/** Every draft is a number — a blank one means the field is still being typed. */
function allNumbers(min: EstimateDraft, mostLikely: EstimateDraft, max: EstimateDraft): [number, number, number] | null {
  return typeof min === "number" && typeof mostLikely === "number" && typeof max === "number"
    ? [min, mostLikely, max]
    : null;
}

/**
 * What is wrong with the three estimates in these drafts, by the field that carries each message —
 * the grid's rules, from the same predicates the schema uses (v0.69.0). Empty while any draft is
 * blank: the triple cannot be judged half-typed.
 */
function draftEstimateIssues(
  min: EstimateDraft,
  mostLikely: EstimateDraft,
  max: EstimateDraft,
  distributionType: DistributionType
): { field: EstimateKey; message: string }[] {
  const triple = allNumbers(min, mostLikely, max);
  if (!triple) return [];
  const issues: { field: EstimateKey; message: string }[] = estimateOrderIssues(...triple);
  if (logNormalHasNoMean(distributionType, ...triple)) {
    issues.push({ field: "max", message: LOGNORMAL_NEEDS_ESTIMATE_ABOVE_ZERO });
  }
  return issues;
}

/**
 * The advisory under the Estimates grid — it warns BEFORE Save (owner, 2026-09-17): the dialog saves
 * an out-of-order or LogNormal-at-zero estimate as typed. Its tail is the owner's wording (R212),
 * chosen because it is true in every case: it is conditional on saving, and Run reads the saved
 * estimates whatever else is on screen. The first draft said "You can still save — the activity is
 * flagged in the grid", which was false twice in v0.69.0 — Save is disabled while the name is empty
 * or an estimate is negative, and a half-typed new row the dialog saved unchanged was not flagged in
 * the grid (its mid-entry stamp still matched) though Run was off. The second no longer holds since
 * v0.70.0 removed the stamp; the first still does. `null` when there is nothing to say.
 */
function estimateAdvisory(issues: { field: EstimateKey; message: string }[]): string | null {
  if (issues.length === 0) return null;
  return `${issues.map((i) => i.message).join(". ")}. If you save it like this, Run stays off until it is fixed.`;
}

/** A negative draft cannot be saved: the next load would reject the whole project (v0.69.0). */
function hasNegativeDraft(min: EstimateDraft, mostLikely: EstimateDraft, max: EstimateDraft): boolean {
  return [min, mostLikely, max].some((v) => typeof v === "number" && v < 0);
}

const NEGATIVE_ESTIMATE_MESSAGE = "Estimates can't be negative. Enter 0 or more.";

/**
 * `aria-invalid` and `aria-describedby` for each estimate input — built once and spread, because
 * this component sits at the cognitive-complexity threshold and six `cond ? … : undefined`
 * attributes measured 15 → 21 here. A field is invalid when it carries an issue or is negative.
 */
function estimateInputAria(
  issues: { field: EstimateKey }[],
  drafts: Record<EstimateKey, EstimateDraft>,
  describedById: string
): Record<EstimateKey, { "aria-invalid"?: true; "aria-describedby"?: string }> {
  const aria = (field: EstimateKey) => {
    const draft = drafts[field];
    const invalid = issues.some((i) => i.field === field) || (typeof draft === "number" && draft < 0);
    return invalid ? { "aria-invalid": true as const, "aria-describedby": describedById } : {};
  };
  return { min: aria("min"), mostLikely: aria("mostLikely"), max: aria("max") };
}

/**
 * Does the SAVED activity have an estimate the grid flags? Decides whether the Estimates section
 * opens by itself (owner, 2026-09-17; R206.3) — only then, so M18's collapsed default stands for
 * every other activity. It reads the saved activity, never the drafts: `Section` reads
 * `defaultOpen` once, at mount, and the modal mounts per open.
 * The collapsed default is deliberate (owner, 2026-09-05): estimates are edited in the grid, and
 * this window is for everything else. Do not open the section by default.
 */
function savedEstimatesFlagged(activity: Activity | undefined): boolean {
  if (!activity) return false;
  const { min, mostLikely, max, distributionType } = activity;
  return draftEstimateIssues(min, mostLikely, max, distributionType).length > 0;
}

/**
 * The Date field's `aria-invalid` and `aria-describedby` while it is empty under a chosen Type —
 * built here and spread, for the complexity reason above `estimateInputAria` (v0.73.3).
 */
function constraintDateAria(
  constraintDate: string | null,
  errorId: string
): { "aria-invalid"?: true; "aria-describedby"?: string } {
  return constraintDate ? {} : { "aria-invalid": true, "aria-describedby": errorId };
}

/** The window's progress drafts: the two dates and the count, as the inputs hold them. */
interface ProgressDrafts {
  actualStartDate: string;
  actualFinishDate: string;
  actualDuration: number | "";
}

/**
 * WI-137: the window's Status change, by THE rule (`statusChangeUpdates`) applied to its drafts.
 * A field the rule leaves out keeps its draft — a row started before v0.80.0 set to Complete keeps
 * its count and gets no dates — so only the keys the rule returns are taken. Module level, so the
 * component's complexity does not move.
 */
function statusChangeDrafts(
  activity: Activity,
  status: ActivityStatus,
  newStatus: ActivityStatus,
  drafts: ProgressDrafts,
  sa: ScheduledActivity | undefined,
  calendar: Parameters<typeof statusChangeUpdates>[2]["calendar"],
): ProgressDrafts {
  const draft: Activity = {
    ...activity,
    status,
    actualStartDate: drafts.actualStartDate || undefined,
    actualFinishDate: drafts.actualFinishDate || undefined,
    actualDuration: drafts.actualDuration === "" ? undefined : drafts.actualDuration,
  };
  const u = statusChangeUpdates(draft, newStatus, {
    today: todayISO(),
    scheduledStart: sa?.startDate,
    scheduledFinish: sa?.endDate,
    scheduledDuration: sa?.duration,
    calendar,
  });
  return {
    actualStartDate: "actualStartDate" in u ? (u.actualStartDate ?? "") : drafts.actualStartDate,
    actualFinishDate: "actualFinishDate" in u ? (u.actualFinishDate ?? "") : drafts.actualFinishDate,
    actualDuration: "actualDuration" in u ? (u.actualDuration ?? "") : drafts.actualDuration,
  };
}

/** This activity's neutral notes, as the window shows them. */
function activityNoteSentences(
  notes: ProgressNote[] | undefined,
  activityId: string,
  formatDate: (iso: string) => string,
): { key: string; sentence: string }[] {
  return (notes ?? [])
    .filter((n) => n.activityId === activityId)
    .map((n) => ({ key: progressNoteKey(n), sentence: progressNoteSentence(n, formatDate) }));
}

/** Save's `aria-describedby`, naming the line beside it while Save is off (v0.73.3). Spread, as above. */
function saveBlockedAria(saveBlocked: UnsaveableCause | null, reasonId: string): { "aria-describedby"?: string } {
  return saveBlocked ? { "aria-describedby": reasonId } : {};
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

  const activityTarget = useProjectStore((s) => {
    const project = s.projects.find((p) => p.id === projectId);
    return project?.scenarios.find((sc) => sc.id === scenarioId)?.settings.probabilityTarget ?? 0.5;
  });

  // WI-137: an Actual Start before the scenario's Start Date is refused here (the schedule could only clamp it).
  const scenarioStartDate = useProjectStore((s) => {
    const project = s.projects.find((p) => p.id === projectId);
    return project?.scenarios.find((sc) => sc.id === scenarioId)?.startDate;
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

  // WI-137: the Actual Start and Actual Finish are STORED now. A row a v25 build wrote has neither,
  // and its drafts start EMPTY — never back-calculated from the scheduled start (that would save the
  // old rule's output as a recorded date the first time the window is saved for any reason).
  // `actualFinishDate` is the input's value; its blur snaps it to a working day and recounts.
  const [actualStartDate, setActualStartDate] = useState<string>(activity?.actualStartDate ?? "");
  const [actualFinishDate, setActualFinishDate] = useState<string>(activity?.actualFinishDate ?? "");
  // The start as last committed — on open, at a Status change, at a blur. Elapsed days are recounted
  // only when a blur brings a DIFFERENT start (Review 32, R3): tabbing through the window on a later
  // day must not replace a count the user typed.
  const [committedStartDate, setCommittedStartDate] = useState(actualStartDate);
  // Which date was typed last, so an out-of-order pair marks the field just edited.
  const [lastEditedDate, setLastEditedDate] = useState<"start" | "finish">("finish");

  /**
   * SCHED. FINISH, on every row that shows it (WI-137; owner, 2026-10-30): the working day the row's
   * SCHEDULED duration ends on, counted on the scenario's calendar from its Actual Start — or, with
   * none recorded (a v25 row), from its scheduled start. An In Progress row's schedule already puts
   * it there: its Sched. Finish is `sa.endDate`, Actual Start + Sched. Dur. A Complete row's schedule
   * finish IS its Actual Finish, so for that row the window counts it here, from the estimate at the
   * Activity Target — what `resolveActivityDuration` gives the same row as Planned — never from the
   * actual count. The engine is not asked for anything new.
   */
  const completeRowSchedFinish = useMemo(() => {
    if (!activity || status !== "complete") return undefined;
    const start = /^\d{4}-\d{2}-\d{2}$/.test(actualStartDate) ? actualStartDate : sa?.startDate;
    if (!start) return undefined;
    const planned = computeDependencyDurations([{ ...activity, status: "planned" }], activityTarget).get(activity.id) ?? 1;
    return formatDateISO(activityEndDate(parseDateISO(start), planned, calendar));
  }, [activity, sa, status, actualStartDate, activityTarget, calendar]);

  // -- Local draft state: Estimates --
  const [min, setMin] = useState<number | "">(activity?.min ?? "");
  const [mostLikely, setMostLikely] = useState<number | "">(activity?.mostLikely ?? "");
  const [max, setMax] = useState<number | "">(activity?.max ?? "");
  const [confidenceLevel, setConfidenceLevel] = useState<RSMLevel>(activity?.confidenceLevel ?? "mediumConfidence");
  const [distributionType, setDistributionType] = useState<DistributionType>(activity?.distributionType ?? "normal");
  // Read from LOCAL state, not the saved activity: switching the distribution, or editing
  // Min and Max, must update the Confidence field immediately, before any save. The dialog
  // never edits an sdOverride, so that one comes from the activity.
  const confidenceInert = confidenceInertReason(distributionType, min, max, activity?.sdOverride);

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
  // WI-138 (v0.79.28): the "Add a task…" box's text, held here rather than in the section so Save
  // can add a task typed but not added, and `hasChanges` can count it.
  const [newTaskText, setNewTaskText] = useState("");

  // -- Local draft state: Deliverables --
  const [deliverables, setDeliverables] = useState<DeliverableItem[]>(activity?.deliverables ?? []);
  // WI-138 (v0.79.28): the "Add a deliverable…" box's text, held here for the same reason.
  const [newDeliverableText, setNewDeliverableText] = useState("");

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
  const fieldEstimateNoteId = `${baseId}-estimate-note`;
  const fieldConfidenceId = `${baseId}-confidence`;
  const fieldDistributionId = `${baseId}-distribution`;
  const fieldConstraintTypeId = `${baseId}-ctype`;
  const fieldConstraintDateId = `${baseId}-cdate`;
  const fieldConstraintDateErrorId = `${baseId}-cdate-error`;
  const fieldConstraintNoteId = `${baseId}-cnote`;
  const fieldNotesId = `${baseId}-notes`;
  const fieldDescriptionId = `${baseId}-description`;
  const fieldDescriptionCounterId = `${baseId}-description-counter`;
  const saveBlockedId = `${baseId}-save-blocked`;
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

  // WI-137: the count is taken from the ACTUAL START draft only — never the scheduled start, which
  // would store a finish worked out from a start that may have moved (Review 32, §1.5). With no
  // Actual Start the finish is kept as typed and refused, "Enter the Actual Start first."
  const handleActualFinishDateBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      setLastEditedDate("finish");
      // <input type="date"> produces YYYY-MM-DD or empty; guard against
      // malformed strings that would cause parseDateISO to produce NaN dates.
      if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        setActualFinishDate("");
        return;
      }
      // A finish on a non-working day moves BACK to the last working day (it was done by then).
      const snapped = snapRecordedDate(raw, "finish", calendar);
      setActualFinishDate(snapped);
      if (!actualStartDate || snapped < actualStartDate) return; // refused: the red line says why
      setActualDuration(recordedDuration(actualStartDate, snapped, calendar));
    },
    [actualStartDate, calendar]
  );

  // WI-137: the Actual Start. A non-working day moves FORWARD; the count follows it — but only when
  // the start's VALUE changed, never on a blur alone.
  const handleActualStartDateBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      setLastEditedDate("start");
      if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        setActualStartDate(committedStartDate);
        return;
      }
      const snapped = snapRecordedDate(raw, "start", calendar);
      setActualStartDate(snapped);
      if (snapped === committedStartDate) return;
      setCommittedStartDate(snapped);
      if (status === "inProgress") setActualDuration(elapsedWorkingDays(snapped, todayISO(), calendar));
      if (status === "complete" && actualFinishDate && actualFinishDate >= snapped) {
        setActualDuration(recordedDuration(snapped, actualFinishDate, calendar));
      }
    },
    [committedStartDate, status, actualFinishDate, calendar]
  );

  // -- Actual duration → finish date (bidirectional sync) --
  const handleActualDurationChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      if (raw === "") {
        setActualDuration("");
        setActualFinishDate("");
        return;
      }
      const parsed = Number(raw);
      if (isNaN(parsed)) return;
      const val = Math.max(1, Math.floor(parsed));
      setActualDuration(val);
      // WI-137: the finish follows the count only from a recorded Actual Start. With none (a row from
      // before v0.80.0), the count is written alone, as v0.79.36 stored it.
      if (!actualStartDate) return;
      // activityEndDate encapsulates the PM convention; no adjustment needed here.
      setActualFinishDate(formatDateISO(activityEndDate(parseDateISO(actualStartDate), val, calendar)));
    },
    [actualStartDate, calendar]
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
      computeGeneralUpdates(activity, name, status, actualDuration, actualStartDate, actualFinishDate),
      computeEstimateUpdates(activity, min, mostLikely, max, confidenceLevel, distributionType),
      computeConstraintUpdates(activity, constraintType, constraintDate, constraintMode, constraintNote),
      computeDescriptionUpdate(activity, description),
    );
  }, [activity, name, status, actualDuration, actualStartDate, actualFinishDate, min, mostLikely, max, confidenceLevel, distributionType, constraintType, constraintDate, constraintMode, constraintNote, description]);

  // -- Save: only send changed fields --
  const handleSave = useCallback(() => {
    if (!activity) return;

    const updates = buildFieldUpdates();

    // Non-checklist field updates go through normal path (invalidates simulation)
    if (Object.keys(updates).length > 0) {
      updateActivityField(projectId, scenarioId, activityId, updates);
    }

    // WI-138 (v0.79.28): a task or deliverable typed in its box but not added is added here, as
    // Add would add it. Computed into locals, not set into state: state set here could not be
    // read back before the two saves below.
    const finalChecklist = withTypedItem(checklist, newTaskText);
    const finalDeliverables = withTypedItem(deliverables, newDeliverableText);

    // Checklist — separate save path to avoid simulation invalidation
    const origChecklist = activity.checklist ?? [];
    const checklistChanged = JSON.stringify(finalChecklist) !== JSON.stringify(origChecklist);
    if (checklistChanged) {
      updateActivityChecklist(projectId, scenarioId, activityId, finalChecklist.length > 0 ? finalChecklist : undefined);
    }

    // Deliverables — same split-save pattern as checklist
    const origDeliverables = activity.deliverables ?? [];
    const deliverablesChanged = JSON.stringify(finalDeliverables) !== JSON.stringify(origDeliverables);
    if (deliverablesChanged) {
      updateActivityDeliverables(projectId, scenarioId, activityId, finalDeliverables.length > 0 ? finalDeliverables : undefined);
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
    newTaskText,
    newDeliverableText,
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
  // ⚠️ Derived here, after the hooks, on purpose. Placed beside `confidenceInert` above, among the
  // useState calls, this one line made the React Compiler report four
  // `react-hooks/preserve-manual-memoization` errors on `handleTypeChange` (it inferred the
  // constraint setters as dependencies); here it reports none. Measured 2026-09-18; the
  // mechanism is not known, so re-measure before moving it.
  const distributionInert = distributionIsInert(min, mostLikely, max, distributionType, activity?.sdOverride);
  // v0.69.0 — also derived here, after the hooks, for the reason in the note above. What the
  // drafts' three estimates break (advisory only: Save stays enabled), and whether one is
  // negative (refused: the next load would reject the whole project).
  const estimateIssues = draftEstimateIssues(min, mostLikely, max, distributionType);
  const estimateNote = estimateAdvisory(estimateIssues);
  const negativeEstimate = hasNegativeDraft(min, mostLikely, max);
  const estimateAria = estimateInputAria(estimateIssues, { min, mostLikely, max }, fieldEstimateNoteId);

  // v0.73.3 — the first reason Save is off, or null; `isValid` is derived from it, so Save's state
  // and the line beside it cannot disagree. Here, beside the old `isValid`, for the note above.
  // WI-137: the two recorded dates, judged as the window would save them.
  const dateFault = actualDatesFault({
    status, start: actualStartDate, finish: actualFinishDate, today: todayISO(),
    scenarioStart: scenarioStartDate, lastEdited: lastEditedDate,
  });
  const saveBlocked = unsaveableCause(
    nameMissing, negativeEstimate, constraintType, constraintDate, constraintMode, dateFault !== null,
  );
  const isValid = saveBlocked === null;

  // -- Dirty check: detect any unsaved changes --
  const hasChanges = useMemo(() => {
    if (!activity) return false;
    // Field updates (General + Estimates + Constraint)
    if (Object.keys(buildFieldUpdates()).length > 0) return true;
    // Qualitative paths
    if (JSON.stringify(checklist) !== JSON.stringify(activity.checklist ?? [])) return true;
    if (JSON.stringify(deliverables) !== JSON.stringify(activity.deliverables ?? [])) return true;
    // WI-138 (v0.79.28): text in a Tasks or Deliverables box that Save would add is a change too,
    // so Cancel and Escape ask before it is lost.
    if (typedItemText(checklist.length, newTaskText) !== null) return true;
    if (typedItemText(deliverables.length, newDeliverableText) !== null) return true;
    if (notes !== (activity.notes ?? "")) return true;
    return false;
  }, [activity, buildFieldUpdates, checklist, deliverables, newTaskText, newDeliverableText, notes]);

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
    if (hasChanges && saveBlocked) {
      const shouldDiscard = await confirmDialog.ask({
        title: "Discard your changes?",
        // ⚠️ TWO CAUSES, not one. `isValid` fails on an empty name OR on a constraint missing
        // its date or mode, and until v0.67.12 both produced the single sentence "This activity
        // needs a name…" — which, with a perfectly good name and a half-filled constraint, was
        // simply false. It also mattered more in that case than in the other: the empty name
        // renders "Activity name is required." inline beneath the field, whereas an incomplete
        // constraint renders no explanation anywhere, so this prompt is the only place the user
        // is told. Pinned by "names the CONSTRAINT, not the name…" in the test file.
        // v0.69.0: THREE causes — a negative estimate joined them, so the sentence is chosen by
        // a helper rather than a nested ternary.
        // v0.73.3 (2026-10-01): this prompt is no longer the only place the user is told. The
        // window itself now says why — under the empty Date field, and beside the disabled Save.
        // The sentence comes from `unsaveableDescription`, reading the same cause as that line,
        // so the two cannot disagree; and "and a mode" went from the constraint sentence, because
        // Mode cannot be missing (choosing a Type fills it, and a radio cannot be unchecked).
        description: unsaveableDescription(saveBlocked),
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
  }, [hasChanges, isValid, saveBlocked, handleSave, onClose]);

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
        {/*
          ⚠️ ONLY THE SECTIONS SCROLL. The title and the Save/Cancel row sit OUTSIDE the scroller,
          in a flex column capped at 85vh (v0.70.1; 88vh since v0.80.0, for the Actual dates). Until then this whole box was the scroller,
          footer included: at 1280×720 it is 612 px tall, and with only the sections that open by
          default its content measured 659–684 px, flagged or not (684 for every activity in the
          sample project). So Save and Cancel sat cut off by the box's bottom edge or wholly below
          it, and a click aimed at Save's centre landed on the overlay and asked about unsaved
          changes.
          ⚠️ Do not put the footer back inside the scroller, and do not move the box's overflow
          back onto Dialog.Content; ActivityEditModal.test.tsx pins both.
          The box's p-6 moved onto its three parts, so the spacing is unchanged when nothing
          scrolls: the title's pb-2 + the scroller's pt-1 are the old mt-3, and the scroller's
          pb-1 + the footer's pt-4 are the old mt-5. The scroller keeps a little of each gap, and
          its side gutters, as its OWN padding, so a focus ring at its edge is not clipped.
          aria-describedby={undefined} is Radix's documented opt-out for a dialog whose title
          names it: no one sentence describes a form this long, and without it Radix warns on
          every open. ⚠️ It goes AFTER className: dialog-stacking.test.ts reads only a className
          written straight after the tag name, and this layer vanished from its z-index check
          when the attribute came first.
        */}
        <Dialog.Content
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-xl z-50 max-h-[88vh] flex flex-col"
          aria-describedby={undefined}
        >
          <Dialog.Title className="shrink-0 px-6 pt-6 pb-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
            Edit Activity
          </Dialog.Title>

          <div className="min-h-0 overflow-y-auto px-6 pt-1 pb-1 space-y-0">
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
                    maxLength={NAME_MAX_LENGTH}
                    aria-invalid={nameMissing}
                    aria-describedby={nameMissing ? fieldNameErrorId : undefined}
                    className={
                      nameMissing
                        ? "w-full text-sm border border-red-400 dark:border-red-500 rounded px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:border-red-400 focus:outline-none"
                        : "w-full text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:border-blue-400 focus:outline-none"
                    }
                  />
                  {nameMissing && (
                    <p id={fieldNameErrorId} className="text-xs text-red-700 dark:text-red-400 mt-0.5">
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
                      // WI-137: the grid's rule, applied to this window's drafts.
                      const newStatus = e.target.value as ActivityStatus;
                      const next = statusChangeDrafts(
                        activity, status, newStatus, { actualStartDate, actualFinishDate, actualDuration }, sa, calendar ?? undefined,
                      );
                      setStatus(newStatus);
                      setActualStartDate(next.actualStartDate);
                      setCommittedStartDate(next.actualStartDate);
                      setActualFinishDate(next.actualFinishDate);
                      setActualDuration(next.actualDuration);
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
                <p id={fieldDescriptionCounterId} className="mt-0.5 text-right text-xs text-gray-500 dark:text-gray-400">
                  {description.length}/2000
                </p>
              </div>
              {/* Schedule context + the Actual dates and count — shown with or without a schedule (WI-137) */}
              <ScheduleContextRow
                status={status}
                sa={sa}
                scheduledStartDate={scheduledStartDate}
                actualDuration={actualDuration}
                actualStartDate={actualStartDate}
                setActualStartDate={setActualStartDate}
                handleActualStartDateBlur={handleActualStartDateBlur}
                today={todayISO()}
                progressNotes={activityNoteSentences(schedule?.progressNotes, activityId, formatDate)}
                completeSchedFinish={completeRowSchedFinish}
                dateFault={dateFault}
                dependencyMode={!!dependencyMode}
                actualFinishDate={actualFinishDate}
                formatDate={formatDate}
                handleActualDurationChange={handleActualDurationChange}
                handleActualFinishDateChange={handleActualFinishDateChange}
                handleActualFinishDateBlur={handleActualFinishDateBlur}
                setActualDuration={setActualDuration}
              />
            </Section>

            {/* ── Section 2: Estimates ── */}
            {/* Opens by itself only when the SAVED estimates are flagged (v0.69.0). */}
            <Section title="Estimates" defaultOpen={savedEstimatesFlagged(activity)}>
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
                    {...estimateAria.min}
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
                    {...estimateAria.mostLikely}
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
                    {...estimateAria.max}
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
                    {...distributionSelectLook(distributionInert)}
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
                  {/* Where Confidence cannot apply, a dash in place of the level. A disabled
                      <select> would still show its selected level, so the dash is a separate
                      element — an <output>, because the label above must still resolve to it
                      (a <span> is not labelable), and it is not focusable, so it leaves the tab
                      order. `aria-live="off"` because an <output> is implicitly a polite live
                      region (role "status"), which would announce the dash whenever the
                      distribution changes; what a screen reader actually says is UNVERIFIED.
                      Two `&&` guards, not a ternary: this component sits at the
                      cognitive-complexity threshold. */}
                  {confidenceInert && (
                    <output
                      id={fieldConfidenceId}
                      aria-live="off"
                      title={CONFIDENCE_INERT_TITLES[confidenceInert]}
                      className="block w-full text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 opacity-40 cursor-not-allowed"
                    >
                      —
                    </output>
                  )}
                  {!confidenceInert && (
                    <select
                      id={fieldConfidenceId}
                      name="confidenceLevel"
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
                  )}
                </div>
              </div>
              {/* v0.69.0 — what the estimates break, said before Save. The negative line refuses
                  Save (the `nameMissing` precedent); the advisory does not. Always rendered, and
                  empty when there is nothing to say, so the inputs' aria-describedby resolves. */}
              <div id={fieldEstimateNoteId}>
                {negativeEstimate && (
                  <p className="text-xs text-red-700 dark:text-red-400">{NEGATIVE_ESTIMATE_MESSAGE}</p>
                )}
                {estimateNote && (
                  <p role="status" className="mt-1 rounded bg-amber-50 dark:bg-amber-900/30 px-2 py-1 text-xs text-amber-800 dark:text-amber-200">
                    {estimateNote}
                  </p>
                )}
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
                        {...constraintDateAria(constraintDate, fieldConstraintDateErrorId)}
                        className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      />
                      {dateAdjustedNote && (
                        <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                          {dateAdjustedNote}
                        </p>
                      )}
                      {!constraintDate && (
                        <p id={fieldConstraintDateErrorId} className="text-xs text-red-700 dark:text-red-400 mt-1">
                          Choose a date, or click Clear constraint to remove it.
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
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
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
                        Note <span className="font-normal text-gray-500 dark:text-gray-400">(optional)</span>
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
                      <p className="text-xs text-gray-500 dark:text-gray-400 text-right mt-0.5">
                        {(constraintNote ?? "").length}/500
                      </p>
                    </div>
                  )}

                  {/* Clear button */}
                  {constraintType && (
                    <button
                      type="button"
                      onClick={handleClearConstraint}
                      className="text-xs text-green-700 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300"
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
              <ChecklistSection
                checklist={checklist}
                onChange={setChecklist}
                newTaskText={newTaskText}
                onNewTaskTextChange={setNewTaskText}
              />
            </Section>

            {/* ── Section 6: Deliverables ── */}
            <Section
              title="Deliverables"
              subtitle={deliverables.length > 0 ? `(${deliverablesDoneCount}/${deliverables.length})` : undefined}
              defaultOpen={false}
            >
              <DeliverablesSection
                deliverables={deliverables}
                onChange={setDeliverables}
                newText={newDeliverableText}
                onNewTextChange={setNewDeliverableText}
              />
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
              <p className="text-xs text-gray-500 dark:text-gray-400 text-right mt-0.5">
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

          {/* Actions — outside the scroller, so always on screen */}
          <div className="shrink-0 px-6 pt-4 pb-6 flex justify-end gap-2">
            {saveBlocked && (
              <p id={saveBlockedId} className="mr-auto self-center text-sm text-amber-700 dark:text-amber-300">
                {saveBlockedReason(saveBlocked)}
              </p>
            )}
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
              {...saveBlockedAria(saveBlocked, saveBlockedId)}
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
