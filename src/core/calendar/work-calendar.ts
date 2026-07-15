// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import type { Calendar, Holiday } from "@domain/models/types";
import { formatDateISO, isWorkingDay, parseDateISO } from "./calendar";

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
  forcedWorkDays?: Set<string>; // ISO date strings — global-holiday overrides (pre-filtered: never contains project-holiday dates)
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

// -- advanceToNextWorkingDay -------------------------------------------------

/**
 * Prefix shared by the free-standing `calendar.ts` helpers' plain-`Error`
 * iteration-limit messages (`addWorkingDays`/`subtractWorkingDays` →
 * "…- check for excessive consecutive holidays", `countWorkingDays` →
 * "…- date range too large"). Exported so the AI-snapshot classifier
 * (see the connectivity hook) can match those throws by
 * `message.startsWith(CALENDAR_ITERATION_LIMIT_MESSAGE)` against this symbol
 * rather than a duplicated literal that could silently drift.
 */
export const CALENDAR_ITERATION_LIMIT_MESSAGE = "Calendar iteration limit exceeded";

/**
 * True iff `err` is one of this module's two calendar-configuration throw
 * shapes: a `CalendarConfigurationError` instance (all-non-working-days,
 * thrown by `advanceToNextWorkingDay` and friends in this file), or a plain
 * `Error` whose message starts with `CALENDAR_ITERATION_LIMIT_MESSAGE`
 * (thrown by the free-standing `addWorkingDays`/`subtractWorkingDays`/
 * `countWorkingDays` helpers in `calendar.ts`).
 *
 * Centralized here — rather than re-implemented at each call site — so the
 * AI-snapshot classifier and the UI's schedule-error banner can never drift
 * out of sync on what counts as a calendar error. (v0.53.0: a UI-side
 * reimplementation that checked only `instanceof CalendarConfigurationError`
 * shipped in an earlier draft of this fix and missed the second shape; this
 * function exists so that mistake can't be made in a second place.)
 */
export function isCalendarError(err: unknown): boolean {
  return (
    err instanceof CalendarConfigurationError ||
    (err instanceof Error && err.message.startsWith(CALENDAR_ITERATION_LIMIT_MESSAGE))
  );
}

/**
 * Advance a date forward to the next working day, bounded so a calendar with
 * no working days (all-non-working work week, excessive holidays) throws a
 * {@link CalendarConfigurationError} instead of looping forever.
 *
 * Non-mutating: clones the input and returns a new Date. Call sites that
 * previously advanced a date in place must reassign the returned value (or,
 * for a function whose contract is to mutate its argument, copy the result
 * back with `date.setTime(...)`).
 */
export function advanceToNextWorkingDay(
  date: Date,
  calendar?: WorkCalendar | Calendar
): Date {
  const d = new Date(date);
  let iterations = 0;
  while (!isWorkingDay(d, calendar)) {
    if (++iterations > MAX_CALENDAR_ITERATIONS) {
      throw new CalendarConfigurationError(
        "No working day found within the configured calendar — check for an all-non-working work week or excessive holidays."
      );
    }
    d.setDate(d.getDate() + 1);
  }
  return d;
}

// -- ProjectWorkCalendar -----------------------------------------------------

/**
 * v0.19.0 implementation of WorkCalendar.
 * Encapsulates configurable work week, holidays, converted work days, and
 * forced work days (global holidays overridden to work days).
 */
export class ProjectWorkCalendar implements WorkCalendar {
  private readonly workWeekMask: boolean[];
  private readonly holidays: Set<string>;
  private readonly convertedWorkDays: Set<string>;
  private readonly forcedWorkDays: Set<string>;

  constructor(context: WorkDayContext) {
    this.workWeekMask = context.workWeekMask;
    this.holidays = context.holidays;
    this.convertedWorkDays = context.convertedWorkDays;
    this.forcedWorkDays = context.forcedWorkDays ?? new Set();
  }

  /**
   * Priority stack:
   * 1. Forced work day — if in forcedWorkDays, return true (overrides a global
   *    holiday; a project-added holiday is never in this set — see
   *    buildWorkCalendar's filter)
   * 2. Holiday check — if the date is a holiday, return false
   * 3. Converted work day — if in convertedWorkDays, return true
   * 4. Work week mask — consult workWeekMask[date.getDay()]
   */
  isWorkDay(date: Date): boolean {
    const iso = formatDateISO(date);
    if (this.forcedWorkDays.has(iso)) return true;
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
 * Build a ProjectWorkCalendar from raw calendar inputs.
 * This is the single assembly point for the work calendar.
 *
 * Contract: `projectHolidays` must be exactly the project's own holidays (the
 * same array used to derive the project's contribution to the effective
 * holiday set). It is used both to include those holidays in the effective set
 * and to determine forced-work-day eligibility — there is exactly one place a
 * caller supplies project holidays, by design, so the two uses can never fall
 * out of sync. A forcedWorkDays date that is also a project holiday is
 * filtered out here: project holidays are absolute and never overridable.
 */
export function buildWorkCalendar(
  workDays: number[],
  globalHolidays: Holiday[],
  convertedWorkDays: string[],
  overrides: { forcedWorkDays?: string[]; projectHolidays?: Holiday[] } = {}
): ProjectWorkCalendar {
  const { forcedWorkDays = [], projectHolidays = [] } = overrides;
  const globalHolidaySet = buildHolidaySet(globalHolidays);
  const projectHolidaySet = buildHolidaySet(projectHolidays);
  const holidaySet = new Set([...globalHolidaySet, ...projectHolidaySet]);
  const eligibleForced = new Set(
    forcedWorkDays.filter((d) => !projectHolidaySet.has(d))
  );

  return new ProjectWorkCalendar({
    workWeekMask: buildWorkWeekMask(workDays),
    holidays: holidaySet,
    convertedWorkDays: new Set(convertedWorkDays),
    forcedWorkDays: eligibleForced,
  });
}
