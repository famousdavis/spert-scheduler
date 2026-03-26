// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import type { Activity, ActivityDependency } from "@domain/models/types";
import { formatDateISO } from "@core/calendar/calendar";

export const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Date string → X coordinate mapping.
 * Uses timestamp ratio within the date range.
 */
export function dateToX(
  dateStr: string,
  minTimestamp: number,
  dateRange: number,
  chartAreaWidth: number,
  leftMargin: number,
): number {
  const ts = new Date(dateStr + "T00:00:00").getTime();
  if (dateRange === 0) return leftMargin + chartAreaWidth / 2;
  const ratio = (ts - minTimestamp) / dateRange;
  return leftMargin + ratio * chartAreaWidth;
}

/** Date label with abbreviated month: "Jun 23, 2026" */
export function longDateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${MONTH_ABBR[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** Compact tick label: "Mar 16" for day-level ticks, "Apr" for month-level. */
export function compactLabel(d: Date, includeDay: boolean): string {
  const mon = MONTH_ABBR[d.getMonth()]!;
  if (!includeDay) return mon;
  return `${mon} ${d.getDate()}`;
}

/**
 * Month tick label: month name only, with 2-digit year appended on the
 * first tick or whenever the year changes (e.g. "Apr '26", then "May", "Jun", …, "Jan '27").
 */
export function monthTickLabel(d: Date, isFirst: boolean, prevYear: number | null): string {
  const mon = MONTH_ABBR[d.getMonth()]!;
  if (isFirst || (prevYear !== null && d.getFullYear() !== prevYear)) {
    return `${mon} '${String(d.getFullYear()).slice(2)}`;
  }
  return mon;
}

/** @deprecated Use formatDateISO from @core/calendar/calendar instead */
export const toISO = formatDateISO;

/**
 * Generate tick marks for the time axis.
 * Chooses daily/weekly/biweekly/monthly ticks depending on date range.
 */
export function generateTicks(
  startDate: string,
  endDate: string,
): { x: string; label: string }[] {
  const start = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");
  const rangeDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
  const ticks: { x: string; label: string }[] = [];

  if (rangeDays <= 14) {
    // Daily ticks
    const d = new Date(start);
    while (d <= end) {
      ticks.push({ x: toISO(d), label: compactLabel(d, true) });
      d.setDate(d.getDate() + 1);
    }
  } else if (rangeDays <= 60) {
    // Weekly ticks (Monday)
    const d = new Date(start);
    while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
    while (d <= end) {
      ticks.push({ x: toISO(d), label: compactLabel(d, true) });
      d.setDate(d.getDate() + 7);
    }
  } else if (rangeDays <= 90) {
    // Biweekly ticks (every other Monday)
    const d = new Date(start);
    while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
    while (d <= end) {
      ticks.push({ x: toISO(d), label: compactLabel(d, true) });
      d.setDate(d.getDate() + 14);
    }
  } else {
    // Monthly ticks (1st of month) — month name only, year on first tick and year changes
    const d = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    let prevYear: number | null = null;
    let isFirst = true;
    while (d <= end) {
      ticks.push({ x: toISO(d), label: monthTickLabel(d, isFirst, prevYear) });
      prevYear = d.getFullYear();
      isFirst = false;
      d.setMonth(d.getMonth() + 1);
    }
  }

  return ticks;
}

/**
 * Return activities in their original grid order.
 * Previously re-sorted by topological order in dependency mode,
 * but this caused a visual mismatch with the activity grid.
 * Dependency arrows render correctly regardless of row order.
 */
export function buildOrderedActivities(
  activities: Activity[],
  _dependencies: ActivityDependency[],
  _dependencyMode: boolean,
): Activity[] {
  return activities;
}
