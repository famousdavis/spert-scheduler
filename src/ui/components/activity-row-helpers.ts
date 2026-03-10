// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import type { Calendar } from "@domain/models/types";
import { countWorkingDays, parseDateISO, isWorkingDay } from "@core/calendar/calendar";

/**
 * Focus a field in a specific activity row by data attributes.
 */
export function focusField(rowId: string, field: string): boolean {
  const el = document.querySelector<HTMLElement>(
    `[data-row-id="${rowId}"][data-field="${field}"]`
  );
  if (el) {
    el.focus();
    return true;
  }
  return false;
}

/**
 * Focus the Name field of the next activity row.
 * If on the last row, focus the add-activity button instead.
 */
export function focusNextRow(currentRowId: string, activities: string[]): boolean {
  const idx = activities.indexOf(currentRowId);
  if (idx >= 0 && idx < activities.length - 1) {
    return focusField(activities[idx + 1]!, "name");
  }
  // Focus the add-activity button if last row
  const addBtn = document.querySelector<HTMLElement>(
    '[data-field="add-activity"]'
  );
  if (addBtn) {
    addBtn.focus();
    return true;
  }
  return false;
}

/**
 * Focus the last editable field of the previous activity row.
 * Tries "actual" first (for complete rows), then the hint field, then "max".
 */
export function focusPrevRow(
  currentRowId: string,
  activities: string[],
  lastFieldHint?: string
): boolean {
  const idx = activities.indexOf(currentRowId);
  if (idx > 0) {
    const prevRowId = activities[idx - 1]!;
    // Try to focus "actual" first (if prev row is complete), then hint, then "max"
    if (focusField(prevRowId, "actual")) {
      return true;
    }
    if (lastFieldHint && focusField(prevRowId, lastFieldHint)) {
      return true;
    }
    return focusField(prevRowId, "max");
  }
  return false;
}

/**
 * Compute elapsed working days from a scheduled start date to today.
 * Inclusive of both start and today (if today is a working day).
 * Returns at least 1.
 */
export function computeElapsedDays(
  scheduledStartDate: string | undefined,
  calendar?: Calendar
): number {
  if (!scheduledStartDate) return 1;
  const start = parseDateISO(scheduledStartDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (start > today) return 1; // future start → default 1
  const elapsed =
    countWorkingDays(start, today, calendar) +
    (isWorkingDay(today, calendar) ? 1 : 0);
  return Math.max(1, elapsed);
}
