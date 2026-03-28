// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import type { WorkCalendar } from "@core/calendar/work-calendar";
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
 * Shared helper: appends 2-digit year on the first tick or when the year changes.
 * Used by monthTickLabel, quarterlyTickLabel, and semiannualTickLabel.
 */
function tickLabelWithYear(period: string, d: Date, isFirst: boolean, prevYear: number | null): string {
  if (isFirst || (prevYear !== null && d.getFullYear() !== prevYear)) {
    return `${period} '${String(d.getFullYear()).slice(2)}`;
  }
  return period;
}

/**
 * Month tick label: month name only, with 2-digit year appended on the
 * first tick or whenever the year changes (e.g. "Apr '26", then "May", "Jun", …, "Jan '27").
 */
export function monthTickLabel(d: Date, isFirst: boolean, prevYear: number | null): string {
  return tickLabelWithYear(MONTH_ABBR[d.getMonth()]!, d, isFirst, prevYear);
}

/**
 * Quarterly tick label: quarter name with 2-digit year on the first
 * tick or whenever the year changes — e.g. "Q1 '26", "Q2", "Q3", "Q4",
 * "Q1 '27". Quarter from month: Jan=Q1, Apr=Q2, Jul=Q3, Oct=Q4.
 */
export function quarterlyTickLabel(d: Date, isFirst: boolean, prevYear: number | null): string {
  return tickLabelWithYear(`Q${Math.floor(d.getMonth() / 3) + 1}`, d, isFirst, prevYear);
}

/**
 * Semi-annual tick label: "H1 '26" (Jan–Jun), "H2" (Jul–Dec).
 * Year on first tick and year-change boundaries.
 */
export function semiannualTickLabel(d: Date, isFirst: boolean, prevYear: number | null): string {
  return tickLabelWithYear(`H${d.getMonth() < 6 ? 1 : 2}`, d, isFirst, prevYear);
}


export type TickLevel = "daily" | "weekly" | "biweekly" | "monthly" | "quarterly" | "semiannual" | "annual";

/**
 * Count the number of quarterly ticks (Jan 1, Apr 1, Jul 1, Oct 1) that
 * would be generated between start and end dates.
 */
export function countQuarterlyTicks(startDate: string, endDate: string): number {
  const start = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");
  const d = new Date(start);
  while (d.getDate() !== 1 || d.getMonth() % 3 !== 0) {
    d.setDate(1);
    d.setMonth(d.getMonth() + 1);
  }
  let count = 0;
  while (d <= end) {
    count++;
    d.setMonth(d.getMonth() + 3);
  }
  return count;
}

/**
 * Count the number of semi-annual ticks (Jan 1 and Jul 1) that
 * would be generated between start and end dates.
 */
export function countSemiannualTicks(startDate: string, endDate: string): number {
  const start = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");
  const d = new Date(start);
  // Advance to first Jan 1 or Jul 1 on or after start
  while (d.getDate() !== 1 || (d.getMonth() !== 0 && d.getMonth() !== 6)) {
    d.setDate(1);
    d.setMonth(d.getMonth() + 1);
  }
  let count = 0;
  while (d <= end) {
    count++;
    d.setMonth(d.getMonth() + 6);
  }
  return count;
}

/**
 * Generate tick marks for the time axis at a given tick level.
 * Levels ≤ monthly are auto-selected from date range.
 * Levels > monthly (quarterly, semiannual, annual) are passed in by the
 * layout hook, which decides density based on available pixel width.
 */
export function generateTicks(
  startDate: string,
  endDate: string,
  tickLevel?: TickLevel,
): { x: string; label: string }[] {
  const start = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");
  const rangeDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
  const ticks: { x: string; label: string }[] = [];

  // Auto-select level for short ranges when not explicitly provided
  const level: TickLevel = tickLevel ?? (
    rangeDays <= 14 ? "daily" :
    rangeDays <= 60 ? "weekly" :
    rangeDays <= 90 ? "biweekly" :
    rangeDays <= 540 ? "monthly" :
    "quarterly" // fallback; layout hook should always provide for >540
  );

  if (level === "daily") {
    const d = new Date(start);
    while (d <= end) {
      ticks.push({ x: formatDateISO(d), label: compactLabel(d, true) });
      d.setDate(d.getDate() + 1);
    }
  } else if (level === "weekly") {
    const d = new Date(start);
    while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
    while (d <= end) {
      ticks.push({ x: formatDateISO(d), label: compactLabel(d, true) });
      d.setDate(d.getDate() + 7);
    }
  } else if (level === "biweekly") {
    const d = new Date(start);
    while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
    while (d <= end) {
      ticks.push({ x: formatDateISO(d), label: compactLabel(d, true) });
      d.setDate(d.getDate() + 14);
    }
  } else if (level === "monthly") {
    const d = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    let prevYear: number | null = null;
    let isFirst = true;
    while (d <= end) {
      ticks.push({ x: formatDateISO(d), label: monthTickLabel(d, isFirst, prevYear) });
      prevYear = d.getFullYear();
      isFirst = false;
      d.setMonth(d.getMonth() + 1);
    }
  } else if (level === "quarterly") {
    const firstQ = new Date(start);
    while (firstQ.getDate() !== 1 || firstQ.getMonth() % 3 !== 0) {
      firstQ.setDate(1);
      firstQ.setMonth(firstQ.getMonth() + 1);
    }
    const d = new Date(firstQ);
    let prevYear: number | null = null;
    let isFirst = true;
    while (d <= end) {
      ticks.push({ x: formatDateISO(d), label: quarterlyTickLabel(d, isFirst, prevYear) });
      prevYear = d.getFullYear();
      isFirst = false;
      d.setMonth(d.getMonth() + 3);
    }
  } else if (level === "semiannual") {
    const d = new Date(start);
    // Advance to first Jan 1 or Jul 1 on or after start
    while (d.getDate() !== 1 || (d.getMonth() !== 0 && d.getMonth() !== 6)) {
      d.setDate(1);
      d.setMonth(d.getMonth() + 1);
    }
    let prevYear: number | null = null;
    let isFirst = true;
    while (d <= end) {
      ticks.push({ x: formatDateISO(d), label: semiannualTickLabel(d, isFirst, prevYear) });
      prevYear = d.getFullYear();
      isFirst = false;
      d.setMonth(d.getMonth() + 6);
    }
  } else {
    // annual
    const d = new Date(start.getFullYear() + 1, 0, 1);
    while (d <= end) {
      ticks.push({ x: formatDateISO(d), label: String(d.getFullYear()) });
      d.setFullYear(d.getFullYear() + 1);
    }
  }

  return ticks;
}

/**
 * Compute coalesced non-work-day shading rectangles for the Gantt chart.
 * Iterates the visible date range, groups consecutive non-work days into
 * single spans, and converts each span to an {x, width} pair in chart
 * coordinates. Spans narrower than minRectWidth (default 1px) are dropped.
 */
export function computeWeekendShadingRects(
  calendar: WorkCalendar,
  projectStartDate: string,
  furthestDate: string,
  minTimestamp: number,
  dateRange: number,
  chartAreaWidth: number,
  leftMargin: number,
  minRectWidth = 1,
): { x: number; width: number }[] {
  if (dateRange === 0) return [];
  const rects: { x: number; width: number }[] = [];
  const start = new Date(projectStartDate + "T00:00:00");
  const end = new Date(furthestDate + "T00:00:00");
  const oneDay = 1000 * 60 * 60 * 24;
  let d = new Date(start);
  let spanStart: Date | null = null;

  while (d <= end) {
    const iso = formatDateISO(d);
    if (!calendar.isWorkDay(d)) {
      if (!spanStart) spanStart = new Date(d);
    } else {
      if (spanStart) {
        const x1 = dateToX(formatDateISO(spanStart), minTimestamp, dateRange, chartAreaWidth, leftMargin);
        const x2 = dateToX(iso, minTimestamp, dateRange, chartAreaWidth, leftMargin);
        if (x2 - x1 >= minRectWidth) rects.push({ x: x1, width: x2 - x1 });
        spanStart = null;
      }
    }
    d = new Date(d.getTime() + oneDay);
  }
  // Close trailing span
  if (spanStart) {
    const x1 = dateToX(formatDateISO(spanStart), minTimestamp, dateRange, chartAreaWidth, leftMargin);
    const endNext = new Date(end.getTime() + oneDay);
    const x2 = dateToX(formatDateISO(endNext), minTimestamp, dateRange, chartAreaWidth, leftMargin);
    if (x2 - x1 >= minRectWidth) rects.push({ x: x1, width: x2 - x1 });
  }
  return rects;
}

