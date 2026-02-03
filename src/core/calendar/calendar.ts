import type { Calendar, DateFormatPreference } from "@domain/models/types";

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
    case "YYYY-MM-DD":
      return isoDate;
    case "MM/DD/YYYY":
    default:
      return `${m}/${d}/${y}`;
  }
}

/**
 * Parse a "YYYY-MM-DD" string into a Date (local timezone, midnight).
 */
export function parseDateISO(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
}

/**
 * Check if a date is a working day (Mon-Fri, not a holiday).
 */
export function isWorkingDay(date: Date, calendar?: Calendar): boolean {
  const day = date.getDay();
  if (day === 0 || day === 6) return false; // Sunday or Saturday
  if (calendar) {
    const iso = formatDateISO(date);
    if (calendar.holidays.some((h) => iso >= h.startDate && iso <= h.endDate))
      return false;
  }
  return true;
}

/**
 * Add working days to a start date. Returns the end date.
 * If days is 0, returns the start date unchanged.
 */
export function addWorkingDays(
  start: Date,
  days: number,
  calendar?: Calendar
): Date {
  const result = new Date(start);
  let remaining = days;
  let iterations = 0;
  while (remaining > 0) {
    if (++iterations > MAX_CALENDAR_ITERATIONS) {
      throw new Error(
        "Calendar iteration limit exceeded - check for excessive consecutive holidays"
      );
    }
    result.setDate(result.getDate() + 1);
    if (isWorkingDay(result, calendar)) {
      remaining--;
    }
  }
  return result;
}

/**
 * Subtract working days from a date.
 */
export function subtractWorkingDays(
  start: Date,
  days: number,
  calendar?: Calendar
): Date {
  const result = new Date(start);
  let remaining = days;
  let iterations = 0;
  while (remaining > 0) {
    if (++iterations > MAX_CALENDAR_ITERATIONS) {
      throw new Error(
        "Calendar iteration limit exceeded - check for excessive consecutive holidays"
      );
    }
    result.setDate(result.getDate() - 1);
    if (isWorkingDay(result, calendar)) {
      remaining--;
    }
  }
  return result;
}

/**
 * Count working days between two dates (inclusive of start, exclusive of end).
 */
export function countWorkingDays(
  start: Date,
  end: Date,
  calendar?: Calendar
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
    current.setDate(current.getDate() + 1);
  }
  return count;
}
