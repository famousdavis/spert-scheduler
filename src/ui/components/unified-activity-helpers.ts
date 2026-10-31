// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { Activity, Calendar } from "@domain/models/types";
import type { WorkCalendar } from "@core/calendar/work-calendar";
import { hasAnyConstraint } from "@domain/helpers/constraint-labels";
import { focusField, focusNextRow, focusPrevRow, statusUpdatesFor, keptNoPlan, announceNoPlanKept, type ScheduledDates } from "./activity-row-helpers";

// Re-exported for existing grid-side consumers; the definition moved to the
// domain layer (v0.57.3) so the schedule-export formatters can share it without
// an app → UI import.
export { hasAnyConstraint };

export function constraintBadgeClass(
  hasConstraint: boolean,
  mode: "hard" | "soft" | null | undefined,
  hasWarning: boolean,
): string {
  if (!hasConstraint) {
    return "text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400";
  }
  if (mode === "hard") {
    return "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-600";
  }
  if (hasWarning) {
    return "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-dashed border-amber-300 dark:border-amber-600";
  }
  return "bg-transparent text-gray-500 dark:text-gray-400 border border-dashed border-gray-300 dark:border-gray-600";
}

export function constraintBadgeLabel(
  constraintType: string | null | undefined,
  constraintMode: "hard" | "soft" | null | undefined,
): string {
  if (!constraintType) return "—";
  return `${constraintType}${constraintMode === "soft" ? " S" : ""}`;
}

/**
 * Whether the activity grid should render the Constraint column + cells.
 *
 * Dependency mode always shows it — the column doubles as the per-row
 * "add a constraint" affordance for a feature that's central to that mode.
 * Sequential mode only shows it once at least one activity actually has a
 * constraint, so the freed 88px track flows into the (1fr) Name column the
 * rest of the time.
 */
export function shouldShowConstraintColumn(
  dependencyMode: boolean | undefined,
  activities: Activity[],
): boolean {
  return !!dependencyMode || hasAnyConstraint(activities);
}

export function maxTabTarget(shiftKey: boolean): "ml" | "distribution" {
  if (shiftKey) return "ml";
  // ⚠️ Unconditional since v0.67.0. Distribution now sits before Confidence, and unlike
  // Confidence it is never disabled — so forward-Tab from `max` always lands there,
  // whatever the distribution type. The old `confidenceApplies` parameter chose between
  // the two and is gone; the array swap in buildTabFieldOrder does NOT cover this.
  return "distribution";
}

/** Builds the ordered list of tabbable fields for a row given its current mode. */
export function buildTabFieldOrder(
  heuristicEnabled: boolean | undefined,
  confidenceApplies: boolean,
  isComplete: boolean,
  isInProgress: boolean,
): string[] {
  if (heuristicEnabled) {
    const order = confidenceApplies
      ? ["name", "ml", "distribution", "confidence", "status"]
      : ["name", "ml", "distribution", "status"];
    if (isComplete || isInProgress) order.push("actual");
    return order;
  }
  return (isComplete || isInProgress)
    ? ["name", "min", "ml", "max", "actual"]
    : ["name", "min", "ml", "max"];
}

/** Handles Tab navigation for fields outside the normal tab order (min/max in heuristic mode).
 *  Returns true if navigation was handled; caller should return immediately. */
export function handleOffOrderTabNav(
  e: React.KeyboardEvent,
  currentField: string,
  activityId: string,
  heuristicEnabled: boolean | undefined,
  fieldOrderIdx: number,
  // Unused since v0.67.0: maxTabTarget no longer branches on it, because Distribution
  // now precedes Confidence and is never disabled. Kept in the signature so the grid's
  // call sites are untouched; the `_` prefix is the repo's intentionally-unused marker.
  _confidenceApplies: boolean,
): boolean {
  if (!heuristicEnabled || fieldOrderIdx !== -1) return false;
  e.preventDefault();
  if (currentField === "min") {
    focusField(activityId, e.shiftKey ? "name" : "ml");
  } else if (currentField === "max") {
    focusField(activityId, maxTabTarget(e.shiftKey));
  }
  return true;
}

/** Collects ordered, deduplicated row IDs from the nearest activity grid ancestor. */
export function getActivityRowIds(target: HTMLElement): string[] | null {
  const gridEl = target.closest("[data-activity-grid]");
  if (!gridEl) return null;
  return [
    ...new Set(
      Array.from(gridEl.querySelectorAll<HTMLElement>("[data-row-id]"))
        .map((r) => r.getAttribute("data-row-id")!)
    ),
  ];
}

/** Handles Tab navigation that crosses row boundaries (Tab from last field or Shift+Tab from name).
 *  Returns true if cross-row nav was handled; caller should return immediately.
 *
 *  ⚠️ The browser's own Tab is cancelled ONLY when focus actually moved (v0.71.0). Shift+Tab from
 *  the FIRST row's name has no row above it, and cancelling it anyway trapped the keyboard in that
 *  cell (WCAG 2.1.2): now the browser's Shift+Tab carries focus up out of the grid. Tab from the
 *  LAST row's last field was never trapped, because it lands on "+ Add Activity"; it follows the
 *  same rule so that it cannot become so. */
export function handleCrossRowTabNav(
  e: React.KeyboardEvent,
  currentField: string,
  lastField: string | undefined,
  activityId: string,
  heuristicEnabled: boolean | undefined,
): boolean {
  if (!e.shiftKey && currentField === lastField) {
    const rowIds = getActivityRowIds(e.target as HTMLElement);
    if (rowIds && focusNextRow(activityId, rowIds)) e.preventDefault();
    return true;
  }
  if (e.shiftKey && currentField === "name") {
    const rowIds = getActivityRowIds(e.target as HTMLElement);
    if (rowIds && focusPrevRow(activityId, rowIds, heuristicEnabled ? "status" : undefined)) e.preventDefault();
    return true;
  }
  return false;
}

/**
 * Enter in an estimate cell (v0.70.0): commit the row's three estimate cells and LEAVE them. Focus
 * goes where a Tab out of the group's last cell goes — Distribution with the heuristic on; without
 * it, Actual on a started or finished row, else the next row's name or "+ Add Activity" — and when
 * nothing is there to take it, the cell simply blurs. Either way it is that blur that commits: the
 * group commits only as focus leaves it, so an explicit commit here would write twice.
 */
export function leaveEstimateGroup(from: HTMLElement, activityId: string, fieldOrder: string[]): void {
  const last = Math.max(fieldOrder.indexOf("min"), fieldOrder.indexOf("ml"), fieldOrder.indexOf("max"));
  const next = fieldOrder[last + 1];
  if (next !== undefined && focusField(activityId, next)) return;
  const rowIds = next === undefined ? getActivityRowIds(from) : null;
  if (rowIds && focusNextRow(activityId, rowIds)) return;
  from.blur();
}

/** Handles Tab navigation within the current row (Tab forward / Shift+Tab backward). */
export function handleInRowTabNav(
  e: React.KeyboardEvent,
  fieldOrder: string[],
  idx: number,
  activityId: string,
): void {
  const targetField = e.shiftKey ? fieldOrder[idx - 1] : fieldOrder[idx + 1];
  if (targetField) {
    e.preventDefault();
    focusField(activityId, targetField);
  }
}

// -- Bulk apply ---------------------------------------------------------------

/**
 * The DECISION half of the grid's bulk-apply handler, separated from the dispatch half.
 *
 * The handler measured cognitive complexity 25 and lived in a `useCallback` inside a
 * component at 0% coverage. It mixes three different update shapes — shared fields
 * applied to every selection, per-activity actual durations when marking complete, and a
 * per-activity heuristic recalculation — and then fires callbacks for each. Extracting
 * the plan leaves the component doing nothing but dispatch, and makes the routing rules
 * assertable without rendering a grid.
 *
 * ⚠️ `perActivity` is ORDERED and may contain the same id twice: an activity that is both
 * marked complete and heuristic-recalculated gets two entries, exactly as the original
 * issued two `onUpdate` calls. Collapsing them into one merged update would change what
 * a consumer observes, so the list preserves the original call sequence.
 */
/** The subset of BulkApplyPayload this planner reads. */
export interface StagedBulkFields {
  confidenceLevel?: Activity["confidenceLevel"];
  distributionType?: Activity["distributionType"];
  status?: Activity["status"];
  recalculateHeuristic?: boolean;
}

export interface BulkApplyPlan {
  /** Applied to every selected id in one go, or null when nothing shared is staged. */
  sharedUpdates: Partial<Activity> | null;
  /** Applied one at a time, in order. May repeat an id — see above. */
  perActivity: { id: string; updates: Partial<Activity> }[];
}

/** Fields that can be applied identically to every selected activity. */
function collectSharedUpdates(staged: StagedBulkFields): Partial<Activity> {
  const shared: Partial<Activity> = {};
  if (staged.confidenceLevel) shared.confidenceLevel = staged.confidenceLevel;
  if (staged.distributionType) shared.distributionType = staged.distributionType;
  // WI-137: no Status here at all — every Status change writes each row's own dates by the one
  // rule (`statusUpdatesFor`), so it is routed per activity through planStatusUpdates.
  return shared;
}

/** A scheduled row as the bulk planner reads it; the dates are optional for callers that have none. */
export interface BulkScheduledRow {
  activityId: string;
  duration: number;
  startDate?: string;
  endDate?: string;
}

function scheduledDatesOf(sa: BulkScheduledRow | undefined): ScheduledDates | undefined {
  if (!sa?.startDate || !sa.endDate) return undefined;
  return { startDate: sa.startDate, endDate: sa.endDate, duration: sa.duration };
}

/**
 * WI-137: each selected row's Status change, by the one rule, from its own schedule — so a bulk
 * change gives each row the actual days and dates the grid's own Status cell would.
 */
function planStatusUpdates(
  status: Activity["status"],
  ids: string[],
  activities: Activity[],
  scheduledActivities: BulkScheduledRow[],
  calendar: WorkCalendar | Calendar | undefined,
): BulkApplyPlan["perActivity"] {
  const scheduled = new Map(scheduledActivities.map((sa) => [sa.activityId, sa]));
  const out: BulkApplyPlan["perActivity"] = [];
  for (const id of ids) {
    const activity = activities.find((a) => a.id === id);
    if (activity) out.push({ id, updates: statusUpdatesFor(activity, status, scheduledDatesOf(scheduled.get(id)), calendar) });
  }
  return out;
}

/** Re-derives min/max from each activity's own mostLikely. */
function planHeuristicUpdates(
  ids: string[],
  activities: Activity[],
  heuristic: { minPercent?: number; maxPercent?: number },
  computeHeuristicFn: (ml: number, minPct: number, maxPct: number) => { min: number; max: number },
): BulkApplyPlan["perActivity"] {
  const out: BulkApplyPlan["perActivity"] = [];
  for (const id of ids) {
    const activity = activities.find((a) => a.id === id);
    // mostLikely of 0 would make both bounds 0, so it is skipped rather than recalculated.
    if (!activity || activity.mostLikely <= 0) continue;
    const { min, max } = computeHeuristicFn(
      activity.mostLikely,
      heuristic.minPercent ?? 50,
      heuristic.maxPercent ?? 200,
    );
    out.push({ id, updates: { min, max } });
  }
  return out;
}

/** A schedule as the bulk planner reads it — the page's `planSchedule` returns one. */
export type BulkPlanSchedule = (changed: Activity[]) => { activities: BulkScheduledRow[] } | null;

/**
 * WI-137 release 2 (owner, R630 ruling 5a): the schedule this Apply's Status change reads — ONE plan
 * per Apply, the page's own schedule function (`planSchedule`) with the Apply's other updates (the
 * shared Confidence and Distribution, the heuristic's Min and Max) applied to the selected rows and
 * their Status unchanged. So a row leaving Planned keeps the dates the schedule would show it with
 * those edits made, as two Applies — the edits first, then the Status — would keep. Dependent rows
 * started in the same Apply each keep their pre-Apply plan (ruling 5b). With none of those updates,
 * a change to Planned, or no `planSchedule` (a caller with no page), it is the schedule given.
 */
function statusScheduleRows(
  status: Activity["status"],
  activities: Activity[],
  scheduledActivities: BulkScheduledRow[],
  edits: BulkApplyPlan["perActivity"],
  planSchedule: BulkPlanSchedule | undefined,
): BulkScheduledRow[] {
  if (!planSchedule || status === "planned" || edits.length === 0) return scheduledActivities;
  const byId = new Map<string, Partial<Activity>>();
  for (const { id, updates } of edits) byId.set(id, { ...byId.get(id), ...updates });
  const changed = activities.filter((a) => byId.has(a.id)).map((a) => ({ ...a, ...byId.get(a.id) }));
  return planSchedule(changed)?.activities ?? [];
}

export function planBulkApply(
  staged: StagedBulkFields,
  ids: string[],
  activities: Activity[],
  scheduledActivities: BulkScheduledRow[],
  heuristic: { enabled?: boolean; minPercent?: number; maxPercent?: number },
  computeHeuristicFn: (ml: number, minPct: number, maxPct: number) => { min: number; max: number },
  calendar?: WorkCalendar | Calendar,
  planSchedule?: BulkPlanSchedule,
): BulkApplyPlan {
  const shared = collectSharedUpdates(staged);
  const heuristicUpdates = staged.recalculateHeuristic && heuristic.enabled
    ? planHeuristicUpdates(ids, activities, heuristic, computeHeuristicFn)
    : [];
  // The edits this Apply makes besides the Status, row by row: the plan schedule is computed with them.
  const edits = [...(Object.keys(shared).length > 0 ? ids.map((id) => ({ id, updates: shared })) : []), ...heuristicUpdates];

  const perActivity: BulkApplyPlan["perActivity"] = [
    ...(staged.status
      ? planStatusUpdates(staged.status, ids, activities,
        statusScheduleRows(staged.status, activities, scheduledActivities, edits, planSchedule), calendar)
      : []),
    ...heuristicUpdates,
  ];

  return {
    sharedUpdates: Object.keys(shared).length > 0 ? shared : null,
    perActivity,
  };
}

/**
 * WI-137: a whole plan as ONE update per selected row — the shared fields, then that row's own
 * updates in the plan's order (a later entry for the same row wins, as the separate calls did).
 * Rows with nothing to change are left out.
 */
export function bulkUpdatesById(ids: string[], plan: BulkApplyPlan): Map<string, Partial<Activity>> {
  const byId = new Map<string, Partial<Activity>>();
  for (const id of ids) if (plan.sharedUpdates) byId.set(id, { ...plan.sharedUpdates });
  for (const { id, updates } of plan.perActivity) byId.set(id, { ...byId.get(id), ...updates });
  return byId;
}

/**
 * Sends a bulk plan to the grid's callbacks. With `onBulkUpdateEach` (the project page) the whole
 * Apply is ONE store write, so ONE undo step whatever it changed, however many rows (WI-137; it was
 * one step per row for every Complete, and would have been for every Status). Without it, as before:
 * the shared fields in one call, then each row's own.
 */
export function dispatchBulkPlan(
  ids: string[],
  plan: BulkApplyPlan,
  callbacks: {
    onBulkUpdateEach?: (updatesById: Map<string, Partial<Activity>>) => void;
    onBulkUpdate?: (activityIds: string[], updates: Partial<Activity>) => void;
    onUpdate: (activityId: string, updates: Partial<Activity>) => void;
  },
): void {
  const { onBulkUpdateEach, onBulkUpdate, onUpdate } = callbacks;
  // WI-137 release 2 (ruling 7c): ONE toast for the rows that left Planned with no Planned dates kept.
  announceNoPlanKept(plan.perActivity.filter((e) => keptNoPlan(e.updates)).length);
  if (onBulkUpdateEach) {
    onBulkUpdateEach(bulkUpdatesById(ids, plan));
    return;
  }
  if (plan.sharedUpdates) {
    if (onBulkUpdate) onBulkUpdate(ids, plan.sharedUpdates);
    else for (const id of ids) onUpdate(id, plan.sharedUpdates);
  }
  for (const { id, updates } of plan.perActivity) onUpdate(id, updates);
}
