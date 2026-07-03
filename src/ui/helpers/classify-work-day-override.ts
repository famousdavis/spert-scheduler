// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import type { Holiday } from "@domain/models/types";
import type { WorkCalendar } from "@core/calendar/work-calendar";
import { buildHolidaySet } from "@core/calendar/work-calendar";
import { formatDateISO, parseDateISO } from "@core/calendar/calendar";

/**
 * Pure decision logic for the unified work-day override editor
 * (WorkDayOverrideEditor). Extracted from the component so the branching is
 * unit-testable — this repo does not test components directly.
 */

// -- Holiday matching ----------------------------------------------------------

/**
 * All holidays whose [startDate, endDate] range covers the given ISO date.
 * ISO date strings compare lexicographically in chronological order.
 */
export function matchHolidays(date: string, holidays: Holiday[]): Holiday[] {
  return holidays.filter((h) => date >= h.startDate && date <= h.endDate);
}

// -- Add-flow classification ----------------------------------------------------

export type AddDecision =
  | { kind: "duplicate" }
  | { kind: "project-holiday-block" }
  | {
      kind: "global-holiday-confirm";
      holidayNames: string[];
      /**
       * Present only when exactly one holiday matches this date AND it is
       * multi-day. With overlapping holidays there is no single {start, end}
       * pair that represents "convert the whole range" for both, so the bulk
       * affordance is only offered for a single match.
       */
      range?: { start: string; end: string };
    }
  | { kind: "already-workday-noop" }
  // "ok" always means "add to convertedWorkDays". Forced writes only ever
  // happen after the user confirms a global-holiday-confirm decision, and that
  // confirmation is handled directly by the UI, not by re-invoking this
  // classifier.
  | { kind: "ok" };

export function classifyWorkDayAdd(
  date: string,
  ctx: {
    convertedWorkDays: string[];
    forcedWorkDays: string[];
    globalHolidays: Holiday[];
    projectHolidays: Holiday[];
    workCalendar: WorkCalendar;
  }
): AddDecision {
  if (
    ctx.convertedWorkDays.includes(date) ||
    ctx.forcedWorkDays.includes(date)
  ) {
    return { kind: "duplicate" };
  }

  const projectMatches = matchHolidays(date, ctx.projectHolidays);
  if (projectMatches.length > 0) return { kind: "project-holiday-block" };

  const globalMatches = matchHolidays(date, ctx.globalHolidays);
  if (globalMatches.length > 0) {
    const single = globalMatches.length === 1 ? globalMatches[0] : undefined;
    const range =
      single && single.startDate !== single.endDate
        ? { start: single.startDate, end: single.endDate }
        : undefined;
    return {
      kind: "global-holiday-confirm",
      holidayNames: globalMatches.map((h) => h.name),
      range,
    };
  }

  if (ctx.workCalendar.isWorkDay(parseDateISO(date))) {
    return { kind: "already-workday-noop" };
  }

  return { kind: "ok" };
}

// -- Chip status ------------------------------------------------------------------

export type ChipStatus =
  | { active: true }
  | { active: false; reason: "project-holiday" }
  // "global-holiday" is only reachable for a converted-source chip — a
  // forced-source chip can only be inert due to a project holiday, by
  // construction (buildWorkCalendar filters forcedWorkDays against project
  // holidays; anything left in the set overrides global holidays).
  | { active: false; reason: "global-holiday" };

/**
 * A chip's active/inert status is computed from isWorkDay, not from array
 * membership alone — an entry can be present in convertedWorkDays or
 * forcedWorkDays yet no longer be an effective work day (a holiday was added
 * on that date after the entry was created).
 */
export function classifyChipStatus(
  date: string,
  ctx: { projectHolidays: Holiday[]; workCalendar: WorkCalendar }
): ChipStatus {
  if (ctx.workCalendar.isWorkDay(parseDateISO(date))) return { active: true };
  const isProjectHoliday = matchHolidays(date, ctx.projectHolidays).length > 0;
  return {
    active: false,
    reason: isProjectHoliday ? "project-holiday" : "global-holiday",
  };
}

// -- Bulk range eligibility ---------------------------------------------------------

/**
 * Dates within a single global holiday's [start, end] range that the bulk
 * "Convert all N days" action may add to forcedWorkDays. A date is eligible
 * only when the holiday is the sole reason it is currently non-work:
 * (a) not a project holiday (those are absolute),
 * (b) not already present in either override array, and
 * (c) a work day per the work-week mask — a shutdown range spanning a weekend
 *     must not silently force weekend work; overriding the work week is what
 *     convertedWorkDays exists for, one explicit date at a time.
 */
export function computeBulkEligibleDates(
  range: { start: string; end: string },
  ctx: {
    convertedWorkDays: string[];
    forcedWorkDays: string[];
    projectHolidays: Holiday[];
    workDays: number[];
  }
): string[] {
  const projectHolidaySet = buildHolidaySet(ctx.projectHolidays);
  const eligible: string[] = [];
  const end = parseDateISO(range.end);
  const current = parseDateISO(range.start);
  let count = 0;
  while (current <= end) {
    if (++count > 366) {
      throw new Error(
        `Holiday range ${range.start}-${range.end} spans more than 366 days. This should have been rejected by schema validation.`
      );
    }
    const iso = formatDateISO(current);
    const isEligible =
      ctx.workDays.includes(current.getDay()) &&
      !projectHolidaySet.has(iso) &&
      !ctx.convertedWorkDays.includes(iso) &&
      !ctx.forcedWorkDays.includes(iso);
    if (isEligible) eligible.push(iso);
    current.setDate(current.getDate() + 1);
  }
  return eligible;
}
