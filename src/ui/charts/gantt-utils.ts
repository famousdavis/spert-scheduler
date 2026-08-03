// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

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
 * Auto-select tick level for short ranges when the caller does not provide one.
 * The layout hook always provides an explicit level for ranges > 540 days.
 */
function selectAutoTickLevel(rangeDays: number): TickLevel {
  if (rangeDays <= 14) return "daily";
  if (rangeDays <= 60) return "weekly";
  if (rangeDays <= 90) return "biweekly";
  if (rangeDays <= 540) return "monthly";
  return "quarterly"; // fallback; layout hook should always provide for >540 days
}

type Tick = { x: string; label: string };
type TickGenerator = (start: Date, end: Date) => Tick[];

function generateDailyTicks(start: Date, end: Date): Tick[] {
  const ticks: Tick[] = [];
  const d = new Date(start);
  while (d <= end) {
    ticks.push({ x: formatDateISO(d), label: compactLabel(d, true) });
    d.setDate(d.getDate() + 1);
  }
  return ticks;
}

function generateWeeklyTicks(start: Date, end: Date): Tick[] {
  const ticks: Tick[] = [];
  const d = new Date(start);
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
  while (d <= end) {
    ticks.push({ x: formatDateISO(d), label: compactLabel(d, true) });
    d.setDate(d.getDate() + 7);
  }
  return ticks;
}

function generateBiweeklyTicks(start: Date, end: Date): Tick[] {
  const ticks: Tick[] = [];
  const d = new Date(start);
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
  while (d <= end) {
    ticks.push({ x: formatDateISO(d), label: compactLabel(d, true) });
    d.setDate(d.getDate() + 14);
  }
  return ticks;
}

function generateMonthlyTicks(start: Date, end: Date): Tick[] {
  const ticks: Tick[] = [];
  const d = new Date(start.getFullYear(), start.getMonth() + 1, 1);
  let prevYear: number | null = null;
  let isFirst = true;
  while (d <= end) {
    ticks.push({ x: formatDateISO(d), label: monthTickLabel(d, isFirst, prevYear) });
    prevYear = d.getFullYear();
    isFirst = false;
    d.setMonth(d.getMonth() + 1);
  }
  return ticks;
}

function generateQuarterlyTicks(start: Date, end: Date): Tick[] {
  const ticks: Tick[] = [];
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
  return ticks;
}

function generateSemiannualTicks(start: Date, end: Date): Tick[] {
  const ticks: Tick[] = [];
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
  return ticks;
}

function generateAnnualTicks(start: Date, end: Date): Tick[] {
  const ticks: Tick[] = [];
  const d = new Date(start.getFullYear() + 1, 0, 1);
  while (d <= end) {
    ticks.push({ x: formatDateISO(d), label: String(d.getFullYear()) });
    d.setFullYear(d.getFullYear() + 1);
  }
  return ticks;
}

const TICK_GENERATORS: Record<TickLevel, TickGenerator> = {
  daily: generateDailyTicks,
  weekly: generateWeeklyTicks,
  biweekly: generateBiweeklyTicks,
  monthly: generateMonthlyTicks,
  quarterly: generateQuarterlyTicks,
  semiannual: generateSemiannualTicks,
  annual: generateAnnualTicks,
};

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
): Tick[] {
  const start = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");
  const rangeDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
  const level: TickLevel = tickLevel ?? selectAutoTickLevel(rangeDays);
  return TICK_GENERATORS[level](start, end);
}

export interface TickSuppressionParams {
  minTimestamp: number;
  dateRange: number;
  chartAreaWidth: number;
  leftMargin: number;
  finishX: number;
  milestoneXPositions: number[];
  todayX: number | null;
  targetX?: number | null;
  todayProximityPx: number;
  elementProximityPx: number;
  minSpacingPx: number;
}

/** Returns true if the tick at position x should be suppressed given the current context. */
function shouldSuppressTick(x: number, isFirst: boolean, lastX: number, p: TickSuppressionParams): boolean {
  if (p.todayX !== null && Math.abs(x - p.todayX) < p.todayProximityPx) return true;
  if (isFirst) return false;
  if (Math.abs(x - p.finishX) < p.elementProximityPx) return true;
  if (p.targetX != null && Math.abs(x - p.targetX) < p.elementProximityPx) return true;
  if (p.milestoneXPositions.some((mx) => Math.abs(x - mx) < p.elementProximityPx)) return true;
  if (x - lastX < p.minSpacingPx) return true;
  return false;
}

/**
 * Filters tick array to suppress labels that would crowd milestone markers,
 * the finish line, today's line, or each other.
 * Callers pass raw layout primitives rather than a toX callback to preserve
 * per-param memoization stability.
 */
export function suppressOverlappingTicks(
  allTicks: Tick[],
  p: TickSuppressionParams,
): Tick[] {
  if (allTicks.length === 0 || p.dateRange === 0) return allTicks;
  const filtered: Tick[] = [];
  let lastX = -Infinity;
  for (let i = 0; i < allTicks.length; i++) {
    const tick = allTicks[i]!;
    const x = dateToX(tick.x, p.minTimestamp, p.dateRange, p.chartAreaWidth, p.leftMargin);
    if (shouldSuppressTick(x, i === 0, lastX, p)) continue;
    filtered.push(tick);
    lastX = x;
  }
  return filtered;
}

/**
 * Compute coalesced non-work-day shading rectangles for the Gantt chart.
 * Iterates the visible date range, groups consecutive non-work days into
 * single spans, and converts each span to an {x, width} pair in chart
 * coordinates. Spans narrower than minRectWidth (default 1px) are dropped.
 */
/** A run of consecutive non-working days. `endIso` is EXCLUSIVE — the first working day after it. */
export interface NonWorkSpan {
  start: Date;
  endIso: string;
}

/**
 * Group consecutive non-working days in the visible range into spans.
 *
 * Calendar logic only — knows nothing about pixels. Paired with `spanToRect`, which is
 * geometry only and knows nothing about calendars.
 */
export function collectNonWorkSpans(
  calendar: WorkCalendar,
  projectStartDate: string,
  furthestDate: string,
): NonWorkSpan[] {
  const spans: NonWorkSpan[] = [];
  const end = new Date(furthestDate + "T00:00:00");
  const oneDay = 1000 * 60 * 60 * 24;
  let d = new Date(projectStartDate + "T00:00:00");
  let spanStart: Date | null = null;

  while (d <= end) {
    const iso = formatDateISO(d);
    if (!calendar.isWorkDay(d)) {
      if (!spanStart) spanStart = new Date(d);
    } else if (spanStart) {
      spans.push({ start: spanStart, endIso: iso });
      spanStart = null;
    }
    d = new Date(d.getTime() + oneDay);
  }
  // A range ending on a non-working day closes at the day AFTER the last one, so the
  // final span has the same exclusive-end meaning as every other.
  if (spanStart) {
    spans.push({ start: spanStart, endIso: formatDateISO(new Date(end.getTime() + oneDay)) });
  }
  return spans;
}

/**
 * Convert one non-work span to an `{x, width}` pair in chart coordinates, or `null` when
 * it would be narrower than `minRectWidth`.
 *
 * Geometry only — see `collectNonWorkSpans`.
 */
export function spanToRect(
  span: NonWorkSpan,
  minTimestamp: number,
  dateRange: number,
  chartAreaWidth: number,
  leftMargin: number,
  minRectWidth: number,
): { x: number; width: number } | null {
  const x1 = dateToX(formatDateISO(span.start), minTimestamp, dateRange, chartAreaWidth, leftMargin);
  const x2 = dateToX(span.endIso, minTimestamp, dateRange, chartAreaWidth, leftMargin);
  return x2 - x1 >= minRectWidth ? { x: x1, width: x2 - x1 } : null;
}

/**
 * Compute coalesced non-work-day shading rectangles for the Gantt chart.
 *
 * ⚠️ DECOMPOSED §3.3 (2026-08-03), from cc 18 to 8 / 1 / 1. Two variants were MEASURED on a
 * skeleton before a line moved, not estimated:
 *
 *   A  lift only the rect math, loop keeps span tracking  → residual cc 14
 *   B  split calendar logic from geometry (this one)      → 8 / 1 / 1
 *
 * **A was rejected for landing at 14, not merely for being worse.** That is one point under
 * the lint threshold — the band where a finding exists and the metric never mentions it
 * again, which is §3.6's entire thesis. If you are wondering why the rect math was not just
 * lifted inline: it was measured, it clears, and it clears into the blind spot.
 *
 * The seam is real rather than convenient. BOTH charts call this, and §3.3 exists to keep a
 * 679-line parallel implementation aligned — so a narrower, more explicit shared contract is
 * a benefit to the parity problem, not just to this function.
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
  return collectNonWorkSpans(calendar, projectStartDate, furthestDate)
    .map((span) => spanToRect(span, minTimestamp, dateRange, chartAreaWidth, leftMargin, minRectWidth))
    .filter((r): r is { x: number; width: number } => r !== null);
}


// -- Activity row geometry ----------------------------------------------------

export interface ActivityRowGeometry {
  /** Top of the row band. */
  y: number;
  /** Top of the bar within the row. */
  barY: number;
  barX: number;
  barEndX: number;
  /** Floored at 4px so a zero-duration activity is still visible. */
  barWidth: number;
  barColor: string;
  showHatch: boolean;
  /** Right edge of the uncertainty hatching; equals barEndX when not hatching. */
  hatchEndX: number;
  hatchStrokeColor: string;
}

/**
 * All the arithmetic and colour selection for one Gantt activity row.
 *
 * ⚠️ Takes PRIMITIVES rather than a `ResolvedGanttAppearance`, deliberately. This module
 * imports only from `@core` and stays that way; a `ra` parameter would pull a UI type into
 * it for five field reads. It also makes the function testable without constructing an
 * appearance object.
 *
 * Paired with `GanttActivityRow`, which renders these values and computes none of them.
 */
export function computeActivityRowGeometry(args: {
  idx: number;
  startDate: string;
  endDate: string;
  status: string;
  topMargin: number;
  rowHeight: number;
  barYOffset: number;
  leftMargin: number;
  minTimestamp: number;
  dateRange: number;
  chartAreaWidth: number;
  barPlanned: string;
  barComplete: string;
  barInProgress: string;
  viewMode: string;
  hatchedDays: number | undefined;
  extEndDate: string | undefined;
}): ActivityRowGeometry {
  const toX = (d: string) =>
    dateToX(d, args.minTimestamp, args.dateRange, args.chartAreaWidth, args.leftMargin);

  const y = args.topMargin + args.idx * args.rowHeight;
  const barX = toX(args.startDate);
  const barEndX = toX(args.endDate);

  let barColor = args.barPlanned;
  if (args.status === "complete") barColor = args.barComplete;
  else if (args.status === "inProgress") barColor = args.barInProgress;

  const showHatch = Boolean(
    args.viewMode === "uncertainty" &&
      args.hatchedDays !== undefined &&
      args.hatchedDays > 0 &&
      args.extEndDate,
  );

  return {
    y,
    barY: y + args.barYOffset,
    barX,
    barEndX,
    barWidth: Math.max(4, barEndX - barX),
    barColor,
    showHatch,
    hatchEndX: showHatch && args.extEndDate ? toX(args.extEndDate) : barEndX,
    hatchStrokeColor: args.status === "inProgress" ? args.barInProgress : args.barPlanned,
  };
}

// -- Today line ---------------------------------------------------------------

export interface TodayLine {
  /** Today as an ISO date, in local time. */
  todayStr: string;
  /** Whether today falls within the chart's date span, inclusive of both ends. */
  todayInRange: boolean;
  /** X position, or null when out of range or the span has zero width. */
  todayX: number | null;
}

/**
 * The one piece of Gantt layout that is genuinely identical in both charts, and the only
 * one that reads the clock.
 *
 * ⚠️ `now` is a PARAMETER, deliberately. Both charts previously called `new Date()` inline
 * — `use-gantt-layout.ts` and `PrintGanttChart.tsx` each with their own copy — so the same
 * wall-clock dependency existed twice and neither had chosen it. Owner decision
 * (2026-08-01): keep the today-line on printed reports, and pass `now` in, so the
 * dependency is explicit at one call site per chart instead of buried in two.
 *
 * Measured before the change: the same project rendered on 2026-04-15 versus 2027-01-01
 * produced 4 dashed lines and a "Today" label versus 2 and none. That is real behaviour
 * either way; passing `now` makes it visible rather than removing it.
 *
 * ⚠️ NOT a wider layout unification, and the difference matters. The two charts' assemblies
 * are not the same computation: the interactive one sizes itself from a measured container
 * with a 2px/day floor and a fit-to-window override, while the print one is a fixed 700px;
 * their margins are parallel constants, not shared ones (`RIGHT_MARGIN` 40 vs `PRINT_RIGHT`
 * 20 — the parity oracle corrected that belief); and they derive their end dates
 * differently. Forcing those into one function would take about ten parameters and be
 * worse code.
 *
 * ⚠️ BOTH CHARTS USE THIS, AND PRINTGANTTCHART PAYS TWO SUPPRESSIONS FOR IT.
 * Wiring it into the print chart costs two `react-hooks/preserve-manual-memoization`
 * findings — "Compilation Skipped: Existing memoization could not be preserved". Isolated
 * by measurement, not guessed: helper alone 8, interactive-only 8, print-only 10, both 10.
 *
 * The trigger is NOT the clock. `todayX` arrives from an IMPORTED call and feeds a
 * `useMemo`; React Compiler cannot prove an imported function is pure, so it stops
 * preserving that component's manual memoization and bails on the WHOLE component — which
 * is why an unrelated memo also reports. Tried and rejected, each measured: destructuring
 * vs named access, passing primitives instead of the memoized `toX`, and `now` as a prop
 * with a `new Date()` default. The component already contains an inline `new Date()`
 * elsewhere that never caused a bail.
 *
 * The two are SUPPRESSED with specific reasons rather than left as duplication, following
 * the directive already in that file at the printDensityPx memo — same file, same rule,
 * same print-only-context reasoning. Net lint is unchanged at 8, and the duplication that
 * had already produced one bug in this pair (the "skips band rows" comment, wrong in both
 * files because nothing pinned the contract but prose) is gone.
 *
 * ⚠️⚠️ CORRECTED 2026-08-03 — WHAT FOLLOWED HERE WAS AN EXPLANATION, NOT A MEASUREMENT,
 * AND IT WAS WRONG. The 8/8/10/10/8 ladder above is real. The sentence beside it —
 * that the bail happens *because* a value from an imported call feeds a `useMemo`, and
 * that any extraction from `GanttChart` must therefore hoist assembled geometry to a prop
 * — was an inference about WHY, written next to a measurement and inheriting its
 * authority. It has now been measured and it does not hold.
 *
 * Measured in `GanttChart`, with the premise asserted first (removing one suppression here
 * produces a finding, so "0 findings" is meaningful):
 *
 *   this exact shape — imported call at component top level, result in a const,
 *   declared in a memo's deps and used in its body ................ 0 findings
 *   a sub-component consuming memoized parent values as props ..... 0 findings
 *   `PrintGanttChart` with its suppressions removed ................ 3 findings
 *   ...and with the `computeTodayLine` call removed too ............ 1 finding
 *
 * So `computeTodayLine` accounts for 2 of this file's 3, with `printDensityPx`
 * pre-existing — exactly as recorded above. That part is accurate. But the SAME shape
 * costs 0 in `GanttChart`, which means the trigger is a property of the COMPONENT, not of
 * the code shape.
 *
 * ⚠️ CONSEQUENCE: this constraint cannot be reasoned about from its description. It can
 * only be measured at the site. Do not predict a bail from this note — run
 * `npx eslint <file>` on the contemplated change and count
 * `react-hooks/preserve-manual-memoization` findings. §3.3's GanttChart:952 split was
 * unblocked that way and introduced none.
 */
export function computeTodayLine(
  now: Date,
  projectStartDate: string,
  furthestDate: string,
  dateRange: number,
  toX: (isoDate: string) => number,
): TodayLine {
  const todayStr = formatDateISO(now);
  const todayInRange =
    dateRange > 0 && todayStr >= projectStartDate && todayStr <= furthestDate;
  return {
    todayStr,
    todayInRange,
    todayX: todayInRange ? toX(todayStr) : null,
  };
}
