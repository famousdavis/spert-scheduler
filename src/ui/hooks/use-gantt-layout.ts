// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useState, useEffect, useMemo } from "react";
import type { RefObject } from "react";
import type { Activity, ActivityBand, Milestone } from "@domain/models/types";
import { nameOrUnnamed } from "@domain/helpers/display-name";
import {
  RIGHT_MARGIN, TOP_MARGIN,
  MIN_CHART_WIDTH, MIN_TICK_SPACING_PX, TICK_LABEL_PITCH_PX, PROJECT_NAME_HEIGHT,
  TICK_LABEL_FONT_PX, FINISH_LABEL_FONT_PX, TODAY_LABEL_FONT_PX, TODAY_DATE_FONT_PX,
  TARGET_LABEL_FONT_PX, MILESTONE_NAME_FONT_PX, MILESTONE_DATE_FONT_PX,
  MILESTONE_HEADER_PX, MILESTONE_ROW_STEP, MILESTONE_DIAMOND_SIZE,
  LABEL_GAP_PX, DATE_LABEL_SPECIMEN, TARGET_LABEL_TEXT, TODAY_LABEL_TEXT,
} from "@ui/charts/gantt-constants";
import {
  dateToX, generateTicks, suppressOverlappingTicks, computeTodayLine,
  labelHalfWidth, longDateLabel, assignMilestoneRows,
} from "@ui/charts/gantt-utils";
import type { TickLevel, TickObstacle } from "@ui/charts/gantt-utils";
import { buildRenderList, buildActivitySlotMap } from "@ui/helpers/band-utils";
import type { GanttRenderItem } from "@ui/helpers/band-utils";

export interface GanttLayout {
  chartWidth: number;
  chartHeight: number;
  chartAreaWidth: number;
  topMargin: number;
  totalRows: number;
  minTimestamp: number;
  dateRange: number;
  finishX: number;
  finishDate: string;
  todayStr: string;
  todayInRange: boolean;
  todayX: number | null;
  allTicks: { x: string; label: string }[];
  ticks: { x: string; label: string }[];
  milestoneXPositions: number[];
  /** Header row for each milestone's name/date block, in `milestones` order. */
  milestoneRows: number[];
  rowIndex: Map<string, number>;
  barYOffset: number;
  renderItems: GanttRenderItem[];
}

interface UseGanttLayoutArgs {
  orderedActivities: Activity[];
  bands?: ActivityBand[];
  projectStartDate: string;
  furthestDate: string;
  bufferedEndDate: string | null;
  projectEndDate: string;
  showBuffer: boolean;
  milestones: Milestone[];
  showProjectName: boolean;
  projectName: string | undefined;
  svgContainerRef: RefObject<HTMLDivElement | null> | undefined;
  leftMargin: number;
  rowHeight: number;
  barHeight: number;
  fitToWindow?: boolean;
  timelineDensityPx?: number;
  showTargetOnGantt?: boolean;
  targetFinishDate?: string | null;
}

/**
 * Vertical space the milestone header block needs, from its row assignment.
 * Zero without milestones; one row-step more for each row past the first.
 */
function milestoneHeaderHeight(rows: number[]): number {
  if (rows.length === 0) return 0;
  return MILESTONE_HEADER_PX + Math.max(...rows) * MILESTONE_ROW_STEP;
}

export function useGanttLayout({
  orderedActivities,
  bands = [],
  projectStartDate,
  furthestDate,
  bufferedEndDate,
  projectEndDate,
  showBuffer,
  milestones,
  showProjectName,
  projectName,
  svgContainerRef,
  leftMargin,
  rowHeight,
  barHeight,
  fitToWindow,
  timelineDensityPx,
  showTargetOnGantt,
  targetFinishDate,
}: UseGanttLayoutArgs): GanttLayout {
  // Measure container width for responsive chart sizing
  const [containerWidth, setContainerWidth] = useState(0);
  useEffect(() => {
    const el = svgContainerRef?.current;
    if (!el) return;
    // Read initial width
    setContainerWidth(el.clientWidth);
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [svgContainerRef]);

  const renderItems = useMemo(
    () => buildRenderList(orderedActivities, bands),
    [orderedActivities, bands]
  );

  const activitySlotMap = useMemo(
    () => buildActivitySlotMap(renderItems),
    [renderItems]
  );

  const totalRows = renderItems.length + (showBuffer ? 1 : 0);

  // Scale chart width
  // ⚠️ WIDTH IS COMPUTED BEFORE `topMargin`, and the order is load-bearing: the header
  // height now depends on whether the milestone names crowd, which depends on their x
  // positions, which depend on the chart width. Nothing here reads `topMargin`, so the
  // dependency is acyclic — but moving `topMargin` back above this would silently make
  // the stagger read a stale width.
  const minTimestamp = new Date(projectStartDate + "T00:00:00").getTime();
  const maxTimestamp = new Date(furthestDate + "T00:00:00").getTime();
  const dateRange = maxTimestamp - minTimestamp;
  const calendarDays = dateRange / (1000 * 60 * 60 * 24);
  const MIN_PX_PER_DAY = 2;
  const targetWidth = containerWidth > 0 ? containerWidth : MIN_CHART_WIDTH;
  const availableChartArea = targetWidth - leftMargin - RIGHT_MARGIN;
  const pxPerDay = calendarDays > 0 ? availableChartArea / calendarDays : 8;
  let chartWidth: number;
  if (fitToWindow) {
    // Fit to Window: compress the full timeline into the container.
    // Bypasses MIN_PX_PER_DAY floor — no horizontal scroll.
    chartWidth = targetWidth;
  } else {
    chartWidth = pxPerDay < MIN_PX_PER_DAY
      ? leftMargin + RIGHT_MARGIN + Math.ceil(calendarDays * MIN_PX_PER_DAY)
      : targetWidth;
  }
  const chartAreaWidth = chartWidth - leftMargin - RIGHT_MARGIN;

  // Finish line
  const finishDate = bufferedEndDate ?? projectEndDate;
  const finishX = dateRange > 0
    ? dateToX(finishDate, minTimestamp, dateRange, chartAreaWidth, leftMargin)
    : 0;

  // Milestone X positions — the diamond centres, which are also each label block's centre.
  const milestoneXPositions = useMemo(() => {
    if (dateRange === 0) return [];
    return milestones.map((m) =>
      dateToX(m.targetDate, minTimestamp, dateRange, chartAreaWidth, leftMargin),
    );
  }, [milestones, minTimestamp, dateRange, chartAreaWidth, leftMargin]);

  // Which header row each milestone's labels sit on. All zeros unless names crowd.
  const milestoneRows = useMemo(
    () =>
      assignMilestoneRows(
        milestones.map((m, i) => ({
          x: milestoneXPositions[i] ?? 0,
          halfWidth: Math.max(
            labelHalfWidth(nameOrUnnamed(m.name), MILESTONE_NAME_FONT_PX),
            labelHalfWidth(DATE_LABEL_SPECIMEN, MILESTONE_DATE_FONT_PX),
          ),
        })),
        LABEL_GAP_PX,
      ),
    [milestones, milestoneXPositions],
  );

  // Header height. The milestone block claims one extra row only when it uses one, so a
  // chart whose milestones do not crowd is exactly as tall as it was before v0.67.14.
  const topMargin =
    TOP_MARGIN
    + milestoneHeaderHeight(milestoneRows)
    + (showProjectName && projectName ? PROJECT_NAME_HEIGHT : 0);
  const chartHeight = topMargin + totalRows * rowHeight + 20;

  // Today line. `now` is passed explicitly to computeTodayLine — the same helper the print
  // chart uses — rather than each chart reading the clock inline. See its JSDoc.
  const { todayStr, todayInRange, todayX } = computeTodayLine(
    new Date(),
    projectStartDate,
    furthestDate,
    dateRange,
    (d) => dateToX(d, minTimestamp, dateRange, chartAreaWidth, leftMargin),
  );

  // Finish Target X — an obstacle for tick suppression.
  //
  // ⚠️ THE REASON THIS COMMENT USED TO GIVE IS FALSE, and it was repeated in the
  // changelog and in a test. It said the branch stops a tick GRIDLINE merging with the
  // target's dashed line. Gridlines are drawn from `allTicks` and suppression never
  // touches them, so the branch has never created that clearance and never could.
  //
  // ⚠️ IT IS STILL NOT DEAD, WHICH IS A DIFFERENT CLAIM. Measured on browser em boxes,
  // the `Target` label cleared the 11px tick band by 1.0px and the 12px band by −0.05 —
  // so v0.67.14's legibility raise would have put it INSIDE the tick lane. (A 0.72/0.22
  // INK model reads ~3.6px and concludes the opposite; the em box is the measure jsdom
  // and the browser agree on.) It moved into the marker lane for real clearance, and it
  // stays an obstacle because 3.0px of margin is a margin, not a proof.
  const targetX = (showTargetOnGantt && targetFinishDate && dateRange > 0)
    ? dateToX(targetFinishDate, minTimestamp, dateRange, chartAreaWidth, leftMargin)
    : null;

  // Compute tick level — direct mapping for ranges >540 days
  const rangeDays = calendarDays;
  const densityPx = timelineDensityPx ?? MIN_TICK_SPACING_PX;
  const tickLevel: TickLevel | undefined = useMemo(() => {
    if (rangeDays <= 540) return undefined; // auto-select in generateTicks
    // Dense = monthly, Normal = quarterly, Sparse = semiannual
    if (densityPx <= 50) return "monthly";
    if (densityPx >= 90) return "semiannual";
    return "quarterly";
  }, [rangeDays, densityPx]);

  // Generate ticks with collision suppression
  const allTicks = useMemo(
    () => generateTicks(projectStartDate, furthestDate, tickLevel),
    [projectStartDate, furthestDate, tickLevel],
  );
  /**
   * Everything a tick label has to share the header band with, each carrying the
   * half-width of what it actually draws.
   *
   * ⚠️ THE MILESTONE OBSTACLE IS THE DIAMOND, NOT THE DATE LABEL, and that is the
   * whole point of the lane change. The date used to sit 3px above the tick baseline,
   * inside the tick band, so a tick had to clear the date's ~28px half-width; it now
   * sits in its own lane and only the 6px diamond still reaches the tick band. That is
   * why raising this from a blanket 40px did NOT cost the chart its tick labels.
   *
   * ⚠️ The target label stays an obstacle even though its band clears the tick band —
   * by 3.0px, which is a margin and not a proof. Its recorded rationale (that it stops
   * a tick GRIDLINE merging with the target line) is false: gridlines are drawn from
   * `allTicks` and suppression never touches them. The branch is kept for the
   * clearance, not for the reason its history gives.
   */
  const obstacles = useMemo<TickObstacle[]>(() => {
    const out: TickObstacle[] = [
      { x: finishX, halfWidth: labelHalfWidth(longDateLabel(finishDate), FINISH_LABEL_FONT_PX) },
    ];
    if (todayX !== null) {
      out.push({
        x: todayX,
        halfWidth: Math.max(
          labelHalfWidth(TODAY_LABEL_TEXT, TODAY_LABEL_FONT_PX),
          labelHalfWidth(DATE_LABEL_SPECIMEN, TODAY_DATE_FONT_PX),
        ),
      });
    }
    if (targetX != null) {
      out.push({ x: targetX, halfWidth: labelHalfWidth(TARGET_LABEL_TEXT, TARGET_LABEL_FONT_PX) });
    }
    for (const mx of milestoneXPositions) out.push({ x: mx, halfWidth: MILESTONE_DIAMOND_SIZE });
    return out;
  }, [finishX, finishDate, todayX, targetX, milestoneXPositions]);

  const ticks = useMemo(() =>
    suppressOverlappingTicks(allTicks, {
      minTimestamp,
      dateRange,
      chartAreaWidth,
      leftMargin,
      obstacles,
      tickFontPx: TICK_LABEL_FONT_PX,
      labelGapPx: LABEL_GAP_PX,
      minSpacingPx: TICK_LABEL_PITCH_PX,
    }),
    [allTicks, minTimestamp, dateRange, chartAreaWidth, leftMargin, obstacles]);

  // Bar Y offset
  const barYOffset = (rowHeight - barHeight) / 2;

  // Row index map for dependency arrows. Bands are excluded as KEYS but counted as
  // POSITIONS, so the value is the activity's true render-list row — [a1, band, a2]
  // puts a2 at 2, not 1. That is required, not incidental: arrows derive Y from this
  // index, and a map that skipped band rows would aim them at the wrong rows.
  // (This comment used to read "slot-aware (skips band rows)", which says the opposite
  // of what the code does and misled a reader. See band-utils.ts#buildActivitySlotMap.)
  const rowIndex = activitySlotMap;

  return {
    chartWidth,
    chartHeight,
    chartAreaWidth,
    topMargin,
    totalRows,
    minTimestamp,
    dateRange,
    finishX,
    finishDate,
    todayStr,
    todayInRange,
    todayX,
    allTicks,
    ticks,
    milestoneXPositions,
    milestoneRows,
    rowIndex,
    barYOffset,
    renderItems,
  };
}
