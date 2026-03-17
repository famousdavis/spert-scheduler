// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import type { Holiday } from "@domain/models/types";
import { formatDateISO, parseDateISO } from "./calendar";

/** Maximum iterations for working day calculations to prevent infinite loops */
const MAX_CALENDAR_ITERATIONS = 10000;

// -- Error class -------------------------------------------------------------

/**
 * Thrown when the calendar configuration has no valid work days,
 * causing scheduling loops to exhaust iteration limits.
 */
export class CalendarConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalendarConfigurationError";
  }
}

// -- WorkCalendar interface --------------------------------------------------

/**
 * Abstraction for all work-day logic. The scheduler depends only on this
 * interface — never on a concrete implementation.
 *
 * v0.19.0: ProjectWorkCalendar
 * Future: ResourceCalendar, TaskCalendar, CompositeCalendar
 */
export interface WorkCalendar {
  isWorkDay(date: Date): boolean;
  nextWorkDay(date: Date): Date;
  addWorkDays(date: Date, n: number): Date;
}

// -- WorkDayContext -----------------------------------------------------------

/**
 * Assembled once per scheduling operation. Avoids repeated store lookups
 * inside tight date-arithmetic loops.
 */
export interface WorkDayContext {
  workWeekMask: boolean[]; // precomputed length-7 array
  holidays: Set<string>; // ISO date strings
  convertedWorkDays: Set<string>; // ISO date strings
  forcedWorkDays?: Set<string>; // reserved — planned v0.20.0
}

// -- buildWorkWeekMask -------------------------------------------------------

/**
 * Build a 7-element boolean mask from an array of active work day indices.
 * Each entry is 0=Sun, 1=Mon, ..., 6=Sat.
 */
export function buildWorkWeekMask(workDays: number[]): boolean[] {
  const mask = Array(7).fill(false) as boolean[];
  for (const d of workDays) mask[d] = true;
  if (mask.length !== 7) {
    throw new Error("buildWorkWeekMask: mask must have exactly 7 entries");
  }
  return mask;
}

// -- buildHolidaySet ---------------------------------------------------------

/**
 * Expand Holiday[] ranges into a flat Set of individual ISO date strings.
 * Each multi-day holiday (startDate–endDate) is expanded into individual entries.
 */
export function buildHolidaySet(holidays: Holiday[]): Set<string> {
  const set = new Set<string>();
  for (const h of holidays) {
    if (h.startDate === h.endDate) {
      set.add(h.startDate);
    } else {
      // Expand range
      const start = parseDateISO(h.startDate);
      const end = parseDateISO(h.endDate);
      const current = new Date(start);
      let count = 0;
      while (current <= end) {
        if (++count > 366) {
          throw new Error(
            `Holiday "${h.name}" spans more than 366 days. This should have been rejected by schema validation.`
          );
        }
        set.add(formatDateISO(current));
        const next = new Date(current);
        next.setDate(next.getDate() + 1);
        current.setTime(next.getTime());
      }
    }
  }
  return set;
}

// -- ProjectWorkCalendar -----------------------------------------------------

/**
 * v0.19.0 implementation of WorkCalendar.
 * Encapsulates configurable work week, holidays, and converted work days.
 */
export class ProjectWorkCalendar implements WorkCalendar {
  private readonly workWeekMask: boolean[];
  private readonly holidays: Set<string>;
  private readonly convertedWorkDays: Set<string>;

  constructor(context: WorkDayContext) {
    this.workWeekMask = context.workWeekMask;
    this.holidays = context.holidays;
    this.convertedWorkDays = context.convertedWorkDays;
  }

  /**
   * Priority stack:
   * 1. Holiday check — if the date is a holiday, return false (holidays always win)
   * 2. Converted work day — if in convertedWorkDays, return true
   * 3. Work week mask — consult workWeekMask[date.getDay()]
   */
  isWorkDay(date: Date): boolean {
    const iso = formatDateISO(date);
    if (this.holidays.has(iso)) return false;
    if (this.convertedWorkDays.has(iso)) return true;
    return this.workWeekMask[date.getDay()]!;
  }

  /**
   * Returns the next work day after the given date.
   * Always clones the input — never mutates.
   */
  nextWorkDay(date: Date): Date {
    let current = new Date(date);
    for (let i = 0; i < MAX_CALENDAR_ITERATIONS; i++) {
      current = new Date(current);
      current.setDate(current.getDate() + 1);
      if (this.isWorkDay(current)) return current;
    }
    throw new CalendarConfigurationError(
      "No work days found within scheduling range. Check your work week configuration."
    );
  }

  /**
   * Add n working days to a date. Returns the end date.
   * If n is 0, returns the date unchanged.
   * Always clones the input — never mutates.
   */
  addWorkDays(date: Date, n: number): Date {
    let current = new Date(date);
    let remaining = n;
    let iterations = 0;
    while (remaining > 0) {
      if (++iterations > MAX_CALENDAR_ITERATIONS) {
        throw new CalendarConfigurationError(
          "No work days found within scheduling range. Check your work week configuration."
        );
      }
      current = new Date(current);
      current.setDate(current.getDate() + 1);
      if (this.isWorkDay(current)) {
        remaining--;
      }
    }
    return current;
  }
}

// -- Factory -----------------------------------------------------------------

/**
 * Build a ProjectWorkCalendar from raw data.
 * This is the single assembly point for the work calendar.
 */
export function buildWorkCalendar(
  workDays: number[],
  holidays: Holiday[],
  convertedWorkDays: string[]
): ProjectWorkCalendar {
  return new ProjectWorkCalendar({
    workWeekMask: buildWorkWeekMask(workDays),
    holidays: buildHolidaySet(holidays),
    convertedWorkDays: new Set(convertedWorkDays),
  });
}
