// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useState, useEffect, useMemo } from "react";
import type { RefObject } from "react";
import type { Activity, Milestone } from "@domain/models/types";
import { formatDateISO } from "@core/calendar/calendar";
import {
  RIGHT_MARGIN, TOP_MARGIN,
  MIN_CHART_WIDTH, MIN_TICK_SPACING_PX, TODAY_PROXIMITY_PX, PROJECT_NAME_HEIGHT,
} from "@ui/charts/gantt-constants";
import { dateToX, generateTicks, suppressOverlappingTicks } from "@ui/charts/gantt-utils";
import type { TickLevel } from "@ui/charts/gantt-utils";

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
  rowIndex: Map<string, number>;
  barYOffset: number;
}

interface UseGanttLayoutArgs {
  orderedActivities: Activity[];
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
}

export function useGanttLayout({
  orderedActivities,
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
}: UseGanttLayoutArgs): GanttLayout {
  // Measure container width for responsive chart sizing
  const [containerWidth, setContainerWidth] = useState(0);
  useEffect(() => {
    const el = svgContainerRef?.current;
    if (!el) return;
    // Read initial width
    setContainerWidth(el.clientWidth); // eslint-disable-line react-hooks/set-state-in-effect -- sync with DOM measurement
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [svgContainerRef]);

  const totalRows = orderedActivities.length + (showBuffer ? 1 : 0);
  let topMargin = milestones.length > 0 ? TOP_MARGIN + 26 : TOP_MARGIN;
  if (showProjectName && projectName) topMargin += PROJECT_NAME_HEIGHT;
  const chartHeight = topMargin + totalRows * rowHeight + 20;

  // Scale chart width
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

  // Milestone X positions for tick suppression
  const milestoneXPositions = useMemo(() => {
    if (dateRange === 0) return [];
    return milestones.map((m) =>
      dateToX(m.targetDate, minTimestamp, dateRange, chartAreaWidth, leftMargin),
    );
  }, [milestones, minTimestamp, dateRange, chartAreaWidth, leftMargin]);

  // Today line
  const todayStr = formatDateISO(new Date());
  const todayInRange = dateRange > 0 && todayStr >= projectStartDate && todayStr <= furthestDate;
  const todayX = todayInRange
    ? dateToX(todayStr, minTimestamp, dateRange, chartAreaWidth, leftMargin)
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
  const ticks = useMemo(() =>
    suppressOverlappingTicks(allTicks, {
      minTimestamp,
      dateRange,
      chartAreaWidth,
      leftMargin,
      finishX,
      milestoneXPositions,
      todayX,
      todayProximityPx: TODAY_PROXIMITY_PX,
      elementProximityPx: 40,  // was MIN_LABEL_PX = 40 (inline const in original useMemo body)
      minSpacingPx: 40,         // was MIN_LABEL_PX = 40 (same value, same inline const)
    }),
    [allTicks, minTimestamp, dateRange, chartAreaWidth, leftMargin, finishX, milestoneXPositions, todayX]);

  // Bar Y offset
  const barYOffset = (rowHeight - barHeight) / 2;

  // Row index map for dependency arrows
  const rowIndex = useMemo(() => {
    const m = new Map<string, number>();
    orderedActivities.forEach((a, i) => m.set(a.id, i));
    return m;
  }, [orderedActivities]);

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
    rowIndex,
    barYOffset,
  };
}
