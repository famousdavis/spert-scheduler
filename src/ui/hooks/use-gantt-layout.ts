// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useState, useEffect, useMemo } from "react";
import type { RefObject } from "react";
import type { Activity, Milestone } from "@domain/models/types";
import { formatDateISO } from "@core/calendar/calendar";
import {
  RIGHT_MARGIN, TOP_MARGIN,
  MIN_CHART_WIDTH, MIN_TICK_SPACING_PX, PROJECT_NAME_HEIGHT,
} from "@ui/charts/gantt-constants";
import { dateToX, generateTicks } from "@ui/charts/gantt-utils";

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
  const chartWidth = pxPerDay < MIN_PX_PER_DAY
    ? leftMargin + RIGHT_MARGIN + Math.ceil(calendarDays * MIN_PX_PER_DAY)
    : targetWidth;
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

  // Generate ticks with collision suppression
  const allTicks = useMemo(
    () => generateTicks(projectStartDate, furthestDate),
    [projectStartDate, furthestDate],
  );
  const ticks = useMemo(() => {
    if (allTicks.length === 0 || dateRange === 0) return allTicks;
    const filtered: typeof allTicks = [];
    let lastX = -Infinity;
    for (const tick of allTicks) {
      const x = dateToX(tick.x, minTimestamp, dateRange, chartAreaWidth, leftMargin);
      if (Math.abs(x - finishX) < MIN_TICK_SPACING_PX * 1.5) continue;
      if (milestoneXPositions.some((mx) => Math.abs(x - mx) < MIN_TICK_SPACING_PX)) continue;
      if (todayX !== null && Math.abs(x - todayX) < MIN_TICK_SPACING_PX) continue;
      if (x - lastX >= MIN_TICK_SPACING_PX) {
        filtered.push(tick);
        lastX = x;
      }
    }
    return filtered;
  }, [allTicks, minTimestamp, dateRange, chartAreaWidth, leftMargin, finishX, milestoneXPositions, todayX]);

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
