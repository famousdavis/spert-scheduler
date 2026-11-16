// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { Holiday } from "@domain/models/types";
import type { WorkCalendar } from "@core/calendar/work-calendar";
import { classifyChipStatus } from "@ui/helpers/classify-work-day-override";

/**
 * WI-174 (v0.87.0): the words beside each calendar's name on the Calendar page, where every calendar is one
 * line, closed until it is opened. Each summary is a list of PARTS: the row shows them joined by a "·" that
 * screen readers do not read, and speaks a comma between them (owner, ruling 7).
 */

/** "1 holiday" / "N holidays". A holiday spanning several days counts once, as the holiday list shows it. */
export function holidaysWords(count: number): string {
  return count === 1 ? "1 holiday" : `${count} holidays`;
}

/** The latest end date of any holiday (ISO dates compare as text), or null when there is none. */
export function lastHolidayDate(holidays: readonly Holiday[]): string | null {
  let last: string | null = null;
  for (const h of holidays) {
    if (last === null || h.endDate > last) last = h.endDate;
  }
  return last;
}

/**
 * Company Holidays: "No holidays", or the count and the last date covered, "12 holidays, through 12/31/2026"
 * (owner, ruling 10), the date in the user's Date Format.
 */
export function companyCalendarSummary(holidays: readonly Holiday[], formatDate: (iso: string) => string): string[] {
  const last = lastHolidayDate(holidays);
  if (last === null) return ["No holidays"];
  return [`${holidaysWords(holidays.length)}, through ${formatDate(last)}`];
}

/**
 * The dates `WorkDayOverrideEditor` shows as chips: the two lists merged, a date in both shown once.
 */
export function overrideChipDates(converted: readonly string[], forced: readonly string[]): string[] {
  return [...new Set([...converted, ...forced])];
}

/**
 * How many of those chips are NOT in effect, by the rule the chips themselves use (`classifyChipStatus`), so the
 * summary and the struck-through chips cannot disagree (owner, ruling 5).
 */
export function notInEffectCount(
  dates: readonly string[],
  ctx: { projectHolidays: Holiday[]; workCalendar: WorkCalendar },
): number {
  return dates.filter((date) => !classifyChipStatus(date, ctx).active).length;
}

/**
 * A project: its holidays, then its converted work days and how many of them are not in effect; a part with
 * nothing to count is left out, and with neither, "No changes" (owner, ruling 5).
 */
export function projectCalendarSummary(holidays: number, converted: number, notInEffect: number): string[] {
  const parts: string[] = [];
  if (holidays > 0) parts.push(holidaysWords(holidays));
  if (converted > 0) {
    const days = converted === 1 ? "1 converted work day" : `${converted} converted work days`;
    parts.push(notInEffect > 0 ? `${days}, ${notInEffect} not in effect` : days);
  }
  return parts.length === 0 ? ["No changes"] : parts;
}
