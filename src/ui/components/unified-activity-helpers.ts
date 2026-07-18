// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import type { Activity } from "@domain/models/types";
import { hasAnyConstraint } from "@domain/helpers/constraint-labels";
import { focusField, focusNextRow, focusPrevRow } from "./activity-row-helpers";

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
 * constraint, so the freed 80px track flows into the (1fr) Name column the
 * rest of the time.
 */
export function shouldShowConstraintColumn(
  dependencyMode: boolean | undefined,
  activities: Activity[],
): boolean {
  return !!dependencyMode || hasAnyConstraint(activities);
}

export function maxTabTarget(shiftKey: boolean, confidenceApplies: boolean): "ml" | "confidence" | "distribution" {
  if (shiftKey) return "ml";
  return confidenceApplies ? "confidence" : "distribution";
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
      ? ["name", "ml", "confidence", "distribution", "status"]
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
  confidenceApplies: boolean,
): boolean {
  if (!heuristicEnabled || fieldOrderIdx !== -1) return false;
  e.preventDefault();
  if (currentField === "min") {
    focusField(activityId, e.shiftKey ? "name" : "ml");
  } else if (currentField === "max") {
    focusField(activityId, maxTabTarget(e.shiftKey, confidenceApplies));
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
 *  Returns true if cross-row nav was handled; caller should return immediately. */
export function handleCrossRowTabNav(
  e: React.KeyboardEvent,
  currentField: string,
  lastField: string | undefined,
  activityId: string,
  heuristicEnabled: boolean | undefined,
): boolean {
  if (!e.shiftKey && currentField === lastField) {
    e.preventDefault();
    const rowIds = getActivityRowIds(e.target as HTMLElement);
    if (rowIds) focusNextRow(activityId, rowIds);
    return true;
  }
  if (e.shiftKey && currentField === "name") {
    e.preventDefault();
    const rowIds = getActivityRowIds(e.target as HTMLElement);
    if (rowIds) focusPrevRow(activityId, rowIds, heuristicEnabled ? "status" : undefined);
    return true;
  }
  return false;
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
