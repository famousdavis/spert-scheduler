// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import type { Calendar, DateFormatPreference } from "@domain/models/types";
import type { WorkCalendar } from "./work-calendar";

/** Maximum iterations for working day calculations to prevent infinite loops */
const MAX_CALENDAR_ITERATIONS = 10000;

/**
 * Format a Date to "YYYY-MM-DD" string.
 */
export function formatDateISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Format a "YYYY-MM-DD" ISO string for display.
 * Pure string transform — no Date object construction, no timezone issues.
 */
export function formatDateDisplay(
  isoDate: string,
  format: DateFormatPreference = "MM/DD/YYYY"
): string {
  const [y, m, d] = isoDate.split("-");
  switch (format) {
    case "DD/MM/YYYY":
      return `${d}/${m}/${y}`;
    case "YYYY/MM/DD":
      return `${y}/${m}/${d}`;
    case "MM/DD/YYYY":
    default:
      return `${m}/${d}/${y}`;
  }
}

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Format a "YYYY-MM-DD" ISO string for short display in constraint badges.
 * Pure string transform — no Date object construction.
 *
 * - MM/DD/YYYY preference → "Apr 7"
 * - DD/MM/YYYY preference → "7 Apr"
 * - YYYY/MM/DD preference → "04/07"
 */
export function formatDateShort(
  isoDate: string,
  format: DateFormatPreference = "MM/DD/YYYY"
): string {
  const [_y, mStr, dStr] = isoDate.split("-");
  const m = Number(mStr);
  const d = Number(dStr);
  const month = MONTH_ABBR[m - 1]!;
  switch (format) {
    case "DD/MM/YYYY":
      return `${d} ${month}`;
    case "YYYY/MM/DD":
      return `${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}`;
    case "MM/DD/YYYY":
    default:
      return `${month} ${d}`;
  }
}

/**
 * Parse a "YYYY-MM-DD" string into a Date (local timezone, midnight).
 */
export function parseDateISO(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
}

// -- Legacy fallback helpers (production only) --------------------------------

function legacyIsWorkingDay(date: Date, calendar: Calendar): boolean {
  const day = date.getDay();
  if (day === 0 || day === 6) return false;
  const iso = formatDateISO(date);
  if (calendar.holidays.some((h) => iso >= h.startDate && iso <= h.endDate))
    return false;
  return true;
}

function handleLegacyCalendar(calendar: unknown): void {
  if (calendar && !("isWorkDay" in (calendar as object))) {
    if (import.meta.env.DEV) {
      throw new Error(
        "Legacy Calendar passed to isWorkingDay. Migration required. " +
          "Update this call site to pass a WorkCalendar instance."
      );
    }
  }
}

// -- Public API (dual-accept: WorkCalendar | Calendar) ------------------------

/**
 * Check if a date is a working day.
 *
 * Accepts either a WorkCalendar (v0.19.0+) or a legacy Calendar data object.
 * In development, passing a legacy Calendar throws to ensure migration.
 * In production, falls back to Mon-Fri + holiday range scan.
 */
export function isWorkingDay(
  date: Date,
  calendar?: WorkCalendar | Calendar
): boolean {
  if (!calendar) {
    const day = date.getDay();
    return day !== 0 && day !== 6;
  }
  if ("isWorkDay" in calendar) {
    return (calendar as WorkCalendar).isWorkDay(date);
  }
  handleLegacyCalendar(calendar);
  return legacyIsWorkingDay(date, calendar as Calendar);
}

/**
 * Advance N working days forward from a date. The start day is NOT counted.
 *
 * Example: addWorkingDays(Monday, 1) → Tuesday (not Monday).
 *
 * **For activity end dates, use {@link activityEndDate} instead** — it accounts
 * for the PM convention that the start day counts as day 1 of the duration.
 *
 * If days is 0, returns the start date unchanged.
 * Always clones the input — never mutates.
 */
export function addWorkingDays(
  start: Date,
  days: number,
  calendar?: WorkCalendar | Calendar
): Date {
  let result = new Date(start);
  let remaining = days;
  let iterations = 0;
  while (remaining > 0) {
    if (++iterations > MAX_CALENDAR_ITERATIONS) {
      throw new Error(
        "Calendar iteration limit exceeded - check for excessive consecutive holidays"
      );
    }
    result = new Date(result);
    result.setDate(result.getDate() + 1);
    if (isWorkingDay(result, calendar)) {
      remaining--;
    }
  }
  return result;
}

/**
 * Go back N working days from a date. The start day is NOT counted.
 *
 * Example: subtractWorkingDays(Friday, 1) → Thursday (not Friday).
 *
 * **For activity start dates from an end date, use {@link activityStartDate}
 * instead** — it accounts for the PM convention that the end day counts as
 * the last working day of the duration.
 *
 * Always clones the input — never mutates.
 */
export function subtractWorkingDays(
  start: Date,
  days: number,
  calendar?: WorkCalendar | Calendar
): Date {
  let result = new Date(start);
  let remaining = days;
  let iterations = 0;
  while (remaining > 0) {
    if (++iterations > MAX_CALENDAR_ITERATIONS) {
      throw new Error(
        "Calendar iteration limit exceeded - check for excessive consecutive holidays"
      );
    }
    result = new Date(result);
    result.setDate(result.getDate() - 1);
    if (isWorkingDay(result, calendar)) {
      remaining--;
    }
  }
  return result;
}

// -- PM-convention wrappers ---------------------------------------------------
// These encode the project management convention: the start day counts as
// day 1 of the duration, so a 5-day activity Mon→Fri has duration=5 and
// end = addWorkingDays(start, 5 - 1).  The `- 1` lives here so callers
// don't need to remember it.

/**
 * Inclusive end date for an activity with a given duration.
 *
 * A 5-day activity starting Monday returns Friday (same week).
 * The start day counts as day 1.  Duration must be ≥ 1.
 * Always clones the input — never mutates.
 */
export function activityEndDate(
  start: Date,
  duration: number,
  calendar?: WorkCalendar | Calendar,
): Date {
  return addWorkingDays(start, duration - 1, calendar);
}

/**
 * Start date for an activity that ends on `end` (inclusive) with a given duration.
 *
 * A 5-day activity ending Friday returns Monday (same week).
 * Duration must be ≥ 1.
 * Always clones the input — never mutates.
 */
export function activityStartDate(
  end: Date,
  duration: number,
  calendar?: WorkCalendar | Calendar,
): Date {
  return subtractWorkingDays(end, duration - 1, calendar);
}

/**
 * Count working days between two dates (inclusive of start, exclusive of end).
 */
export function countWorkingDays(
  start: Date,
  end: Date,
  calendar?: WorkCalendar | Calendar
): number {
  let count = 0;
  let iterations = 0;
  const current = new Date(start);
  while (current < end) {
    if (++iterations > MAX_CALENDAR_ITERATIONS) {
      throw new Error(
        "Calendar iteration limit exceeded - date range too large"
      );
    }
    if (isWorkingDay(current, calendar)) {
      count++;
    }
    const next = new Date(current);
    next.setDate(next.getDate() + 1);
    current.setTime(next.getTime());
  }
  return count;
}

/**
 * Merge a global (company-wide) calendar with a project-specific calendar.
 * Returns undefined if both inputs are undefined.
 */
export function mergeCalendars(
  global?: Calendar,
  project?: Calendar
): Calendar | undefined {
  if (!global && !project) return undefined;
  return {
    holidays: [
      ...(global?.holidays ?? []),
      ...(project?.holidays ?? []),
    ],
  };
}
