import type { Calendar } from "@domain/models/types";

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
 * Format a "YYYY-MM-DD" ISO string to "MM/DD/YYYY" for display.
 * Pure string transform — no Date object construction, no timezone issues.
 */
export function formatDateDisplay(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${m}/${d}/${y}`;
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
    if (calendar.holidays.includes(iso)) return false;
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
  while (remaining > 0) {
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
  while (remaining > 0) {
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
  const current = new Date(start);
  while (current < end) {
    if (isWorkingDay(current, calendar)) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }
  return count;
}
