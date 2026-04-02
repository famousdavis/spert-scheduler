// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useState, useEffect, useMemo, useCallback, useRef, type RefObject } from "react";
import type {
  Activity,
  ActivityDependency,
  Milestone,
  MilestoneBufferInfo,
  ScheduledActivity,
  Calendar,
} from "@domain/models/types";
import type { WorkCalendar } from "@core/calendar/work-calendar";
import type { ScheduleBuffer } from "@core/schedule/buffer";
import {
  addWorkingDays,
  parseDateISO,
  formatDateISO,
} from "@core/calendar/calendar";
import { computeActivityUncertaintyDays } from "@core/schedule/deterministic";
import { dependencyLabel } from "@domain/helpers/format-labels";
import { useDateFormat } from "@ui/hooks/use-date-format";
import { useGanttPreferences } from "@ui/hooks/use-gantt-preferences";
import { useGanttLayout } from "@ui/hooks/use-gantt-layout";
import type { ResolvedGanttAppearance } from "./gantt-constants";
import {
  BAR_RADIUS,
  ARROW_HEAD_SIZE, PROJECT_NAME_HEIGHT,
  COLORS, MILESTONE_COLORS, TARGET_COLORS, TARGET_DASH_PATTERNS,
} from "./gantt-constants";
import {
  dateToX, longDateLabel, computeWeekendShadingRects,
} from "./gantt-utils";
import { GanttSvgDefs } from "./GanttSvgDefs";
import { GanttLegend } from "./GanttLegend";

/** Gantt chart toolbar: view mode toggle, visibility checkboxes, appearance panel button */
function GanttToolbar({
  viewMode, setViewMode,
  dependencyMode, criticalPathIds,
  showCriticalPath, setShowCriticalPath,
  showArrows, setShowArrows,
  showToday, setShowToday,
  showProjectName, setShowProjectName,
  projectName,
  showActivityNumbers, onToggleActivityNumbers,
  showTargetOnGantt, onToggleShowTarget, hasTargetDate,
  appearancePanelOpen, onToggleAppearancePanel,
}: {
  viewMode: string;
  setViewMode: (v: "deterministic" | "uncertainty") => void;
  dependencyMode: boolean;
  criticalPathIds?: Set<string> | null;
  showCriticalPath: boolean;
  setShowCriticalPath: (v: boolean) => void;
  showArrows: boolean;
  setShowArrows: (v: boolean) => void;
  showToday: boolean;
  setShowToday: (v: boolean) => void;
  showProjectName: boolean;
  setShowProjectName: (v: boolean) => void;
  projectName?: string;
  showActivityNumbers?: boolean;
  onToggleActivityNumbers?: (v: boolean) => void;
  showTargetOnGantt?: boolean;
  onToggleShowTarget?: (v: boolean) => void;
  hasTargetDate?: boolean;
  appearancePanelOpen: boolean;
  onToggleAppearancePanel: () => void;
}) {
  return (
    <div className="flex items-center gap-2 mb-3 flex-wrap">
      <div className="inline-flex rounded-md border border-gray-300 dark:border-gray-600 text-sm overflow-hidden">
        <button
          className={`px-3 py-1 transition-colors ${
            viewMode === "deterministic"
              ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200 font-medium"
              : "text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          }`}
          onClick={() => setViewMode("deterministic")}
        >
          Deterministic
        </button>
        <button
          className={`px-3 py-1 border-l border-gray-300 dark:border-gray-600 transition-colors ${
            viewMode === "uncertainty"
              ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200 font-medium"
              : "text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          }`}
          onClick={() => setViewMode("uncertainty")}
        >
          With Uncertainty
        </button>
      </div>
      {dependencyMode && criticalPathIds && criticalPathIds.size > 0 && (
        <label className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showCriticalPath}
            onChange={(e) => setShowCriticalPath(e.target.checked)}
            className="rounded border-gray-300 dark:border-gray-600 text-red-600 focus:ring-red-500"
          />
          Critical path
        </label>
      )}
      {dependencyMode && (
        <label className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showArrows}
            onChange={(e) => setShowArrows(e.target.checked)}
            className="rounded border-gray-300 dark:border-gray-600 text-gray-600 focus:ring-gray-500"
          />
          Arrows
        </label>
      )}
      <label className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={showToday}
          onChange={(e) => setShowToday(e.target.checked)}
          className="rounded border-gray-300 dark:border-gray-600 text-violet-600 focus:ring-violet-500"
        />
        Today
      </label>
      {projectName && (
        <label className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showProjectName}
            onChange={(e) => setShowProjectName(e.target.checked)}
            className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
          />
          Project name
        </label>
      )}
      <label className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={showActivityNumbers ?? false}
          onChange={(e) => onToggleActivityNumbers?.(e.target.checked)}
          className="rounded border-gray-300 dark:border-gray-600 text-teal-600 focus:ring-teal-500"
        />
        Show Activity IDs
      </label>
      {onToggleShowTarget && (
        <label
          className={`flex items-center gap-1.5 text-sm cursor-pointer select-none ${hasTargetDate ? "text-gray-600 dark:text-gray-300" : "text-gray-400 dark:text-gray-500 cursor-not-allowed"}`}
          title={hasTargetDate ? undefined : "Set a Finish Target date in the project summary to enable this option"}
        >
          <input
            type="checkbox"
            checked={!!showTargetOnGantt}
            onChange={(e) => onToggleShowTarget(e.target.checked)}
            disabled={!hasTargetDate}
            className="rounded border-gray-300 dark:border-gray-600 text-amber-600 focus:ring-amber-500 disabled:opacity-50"
          />
          Show Finish Target Date
        </label>
      )}
      {/* Appearance panel toggle */}
      <button
        type="button"
        className={`ml-auto p-1.5 rounded transition-colors ${
          appearancePanelOpen
            ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200"
            : "text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
        }`}
        onClick={onToggleAppearancePanel}
        title="Appearance settings"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
        </svg>
      </button>
    </div>
  );
}

interface GanttChartProps {
  activities: Activity[];
  scheduledActivities: ScheduledActivity[];
  projectStartDate: string;
  projectEndDate: string;
  buffer: ScheduleBuffer | null;
  dependencies: ActivityDependency[];
  dependencyMode: boolean;
  activityTarget: number;
  projectTarget: number;
  calendar?: WorkCalendar | Calendar;
  milestones?: Milestone[];
  milestoneBuffers?: Map<string, MilestoneBufferInfo> | null;
  criticalPathIds?: Set<string> | null;
  projectName?: string;
  svgContainerRef?: RefObject<HTMLDivElement | null>;
  onEditActivity?: (activityId: string) => void;
  onEditDependency?: (fromActivityId: string, toActivityId: string) => void;
  onRenameActivity?: (activityId: string, newName: string) => void;
  isLocked?: boolean;
  showActivityNumbers?: boolean;
  onToggleActivityNumbers?: (v: boolean) => void;
  targetFinishDate?: string | null;
  showTargetOnGantt?: boolean;
  targetRAGColor?: string;
  onToggleShowTarget?: (v: boolean) => void;
  hasTargetDate?: boolean;
  resolvedAppearance: ResolvedGanttAppearance;
  appearancePanelOpen: boolean;
  onToggleAppearancePanel: () => void;
}

export function GanttChart({
  activities,
  scheduledActivities,
  projectStartDate,
  projectEndDate,
  buffer,
  dependencies,
  dependencyMode,
  activityTarget,
  projectTarget,
  calendar,
  milestones = [],
  milestoneBuffers,
  criticalPathIds,
  projectName,
  svgContainerRef,
  onEditActivity,
  onEditDependency,
  onRenameActivity,
  isLocked,
  showActivityNumbers,
  onToggleActivityNumbers,
  targetFinishDate,
  showTargetOnGantt,
  targetRAGColor,
  onToggleShowTarget,
  hasTargetDate,
  resolvedAppearance: ra,
  appearancePanelOpen,
  onToggleAppearancePanel,
}: GanttChartProps) {
  const formatDate = useDateFormat();
  const {
    viewMode, showToday, showCriticalPath, showProjectName, showArrows,
    setViewMode, setShowToday, setShowCriticalPath, setShowProjectName, setShowArrows,
  } = useGanttPreferences();
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    text: string;
  } | null>(null);

  // Inline name editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  // Cancel editing if scenario becomes locked
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isLocked) setEditingId(null); // NOSONAR — intentional reset on lock state change
  }, [isLocked]);

  const commitRename = useCallback(() => {
    if (!editingId) return;
    const trimmed = editValue.trim();
    const original = activities.find((a) => a.id === editingId)?.name;
    if (trimmed && trimmed !== original) {
      onRenameActivity?.(editingId, trimmed);
    }
    setEditingId(null);
  }, [editingId, editValue, activities, onRenameActivity]);

  const cancelRename = useCallback(() => {
    setEditingId(null);
  }, []);

  // Arrow hover state for dependency interactivity
  const [hoveredDep, setHoveredDep] = useState<{ from: string; to: string } | null>(null);

  // Detect dark mode
  const isDark =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark");
  const c = isDark ? COLORS.dark : COLORS.light;
  const mc = isDark ? MILESTONE_COLORS.dark : MILESTONE_COLORS.light;
  const tc = isDark ? TARGET_COLORS.dark : TARGET_COLORS.light;

  // Uncertainty data
  const uncertaintyMap = useMemo(
    () => computeActivityUncertaintyDays(activities, activityTarget, projectTarget),
    [activities, activityTarget, projectTarget]
  );

  // Compute buffered end date
  const bufferedEndDate = useMemo(() => {
    if (!buffer || buffer.bufferDays <= 0) return null;
    return formatDateISO(
      addWorkingDays(parseDateISO(projectEndDate), buffer.bufferDays, calendar)
    );
  }, [projectEndDate, buffer, calendar]);

  // Activities are rendered in their original grid order.
  // Dependency arrows render correctly regardless of row order.
  const orderedActivities = activities;

  // Activity numbering map — uses original array order (not orderedActivities) to match grid
  const activityIndexMap = useMemo(() => {
    if (!showActivityNumbers) return null;
    const map = new Map<string, number>();
    activities.forEach((a, i) => map.set(a.id, i + 1));
    return map;
  }, [showActivityNumbers, activities]);

  // Map scheduled activities by ID for quick lookup
  const scheduleMap = useMemo(() => {
    const m = new Map<string, ScheduledActivity>();
    for (const sa of scheduledActivities) m.set(sa.activityId, sa);
    return m;
  }, [scheduledActivities]);

  // Determine the timeline span
  const timelineEnd = bufferedEndDate ?? projectEndDate;

  // For uncertainty mode, compute extended end dates per activity
  const activityExtendedEndDates = useMemo(() => {
    if (viewMode !== "uncertainty") return new Map<string, string>();
    const m = new Map<string, string>();
    for (const act of orderedActivities) {
      const sa = scheduleMap.get(act.id);
      const u = uncertaintyMap.get(act.id);
      if (sa && u && u.hatchedDays > 0) {
        const extEnd = formatDateISO(
          addWorkingDays(parseDateISO(sa.endDate), u.hatchedDays, calendar)
        );
        m.set(act.id, extEnd);
      }
    }
    return m;
  }, [viewMode, orderedActivities, scheduleMap, uncertaintyMap, calendar]);

  // Compute the furthest date considering all scheduled activities, uncertainty extensions, and milestones
  const furthestDate = useMemo(() => {
    let latest = timelineEnd;
    for (const sa of scheduledActivities) {
      if (sa.endDate > latest) latest = sa.endDate;
    }
    for (const extEnd of activityExtendedEndDates.values()) {
      if (extEnd > latest) latest = extEnd;
    }
    for (const m of milestones) {
      if (m.targetDate > latest) latest = m.targetDate;
    }
    return latest;
  }, [timelineEnd, scheduledActivities, activityExtendedEndDates, milestones]);

  const showBuffer = !!(buffer && buffer.bufferDays > 0 && bufferedEndDate);

  const layout = useGanttLayout({
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
    leftMargin: ra.leftMargin,
    rowHeight: ra.rowHeight,
    barHeight: ra.barHeight,
    fitToWindow: ra.fitToWindow,
    timelineDensityPx: ra.timelineDensityPx,
  });
  const {
    chartWidth, chartHeight, chartAreaWidth, topMargin,
    minTimestamp, dateRange, finishX, finishDate,
    todayX, todayStr, allTicks, ticks, rowIndex, barYOffset,
  } = layout;

  // Pre-compute arrow path geometry so both visual and hit-area passes share it
  const arrowPaths = useMemo(() => {
    if (!dependencyMode) return [];
    return dependencies.map((dep) => {
      const fromRow = rowIndex.get(dep.fromActivityId);
      const toRow = rowIndex.get(dep.toActivityId);
      const fromSa = scheduleMap.get(dep.fromActivityId);
      const toSa = scheduleMap.get(dep.toActivityId);
      if (fromRow === undefined || toRow === undefined || !fromSa || !toSa) return null;

      const fromDate = dep.type === "SS" ? fromSa.startDate : fromSa.endDate;
      const toDate = dep.type === "FF" ? toSa.endDate : toSa.startDate;
      const barEndX = dateToX(fromDate, minTimestamp, dateRange, chartAreaWidth, ra.leftMargin);
      const fromY = topMargin + fromRow * ra.rowHeight + ra.rowHeight / 2;
      const toX = dateToX(toDate, minTimestamp, dateRange, chartAreaWidth, ra.leftMargin);
      const toY = topMargin + toRow * ra.rowHeight + ra.rowHeight / 2;

      const STUB = 7;
      const stubX = barEndX + STUB;
      const dyAbs = Math.abs(toY - fromY);
      const dySigned = toY - fromY;

      let path: string;
      if (dep.type === "FF") {
        const endX = toX + ARROW_HEAD_SIZE;
        const rightX = Math.max(stubX, endX) + Math.max(15, dyAbs * 0.3);
        path = `M${barEndX},${fromY} L${stubX},${fromY} C${rightX},${fromY} ${rightX},${toY} ${endX},${toY}`;
      } else {
        const endX = toX - ARROW_HEAD_SIZE;
        if (endX >= stubX + 10) {
          const spread = Math.max(20, dyAbs * 0.45);
          path = `M${barEndX},${fromY} L${stubX},${fromY} C${stubX + spread},${fromY} ${endX - spread},${toY} ${endX},${toY}`;
        } else {
          const loopExt = Math.max(30, dyAbs * 0.5);
          path = `M${barEndX},${fromY} L${stubX},${fromY} C${stubX + loopExt},${fromY + dySigned * 0.3} ${endX - loopExt},${toY} ${endX},${toY}`;
        }
      }

      const isCriticalEdge = showCriticalPath &&
        criticalPathIds?.has(dep.fromActivityId) && criticalPathIds?.has(dep.toActivityId);
      const fromName = activities.find((a) => a.id === dep.fromActivityId)?.name ?? "";
      const toName = activities.find((a) => a.id === dep.toActivityId)?.name ?? "";
      const lagLabel = dep.lagDays !== 0 ? (dep.lagDays > 0 ? `, +${dep.lagDays}d` : `, ${dep.lagDays}d`) : "";
      const label = `${fromName} → ${toName}, ${dependencyLabel(dep.type)}${lagLabel}`;

      return { dep, path, barEndX, toX, fromY, toY, isCriticalEdge, label };
    }).filter(Boolean) as Array<{
      dep: ActivityDependency; path: string; barEndX: number; toX: number;
      fromY: number; toY: number; isCriticalEdge: boolean; label: string;
    }>;
  }, [dependencyMode, dependencies, rowIndex, scheduleMap, minTimestamp, dateRange,
    chartAreaWidth, topMargin, ra.leftMargin, ra.rowHeight, showCriticalPath, criticalPathIds, activities]);

  // Terminal activities: no successor dependency (only meaningful when deps exist)
  const terminalIds = useMemo(() => {
    if (!dependencyMode || dependencies.length === 0) return null;
    const hasSuccessor = new Set(dependencies.map(d => d.fromActivityId));
    return new Set(activities.filter(a => !hasSuccessor.has(a.id)).map(a => a.id));
  }, [dependencyMode, dependencies, activities]);

  // Weekend / non-work day shading rects (coalesced consecutive days)
  const weekendShadingRects = useMemo(() => {
    if (!ra.weekendShading || dateRange === 0) return [];
    if (!calendar || !('isWorkDay' in calendar)) return [];
    return computeWeekendShadingRects(
      calendar as WorkCalendar, projectStartDate, furthestDate,
      minTimestamp, dateRange, chartAreaWidth, ra.leftMargin,
    );
  }, [ra.weekendShading, ra.leftMargin, dateRange, calendar, projectStartDate, furthestDate, minTimestamp, chartAreaWidth]);

  // Bar label helper
  const barLabelText = useCallback((sa: ScheduledActivity): string | null => {
    if (ra.barLabel === "duration") return `${sa.duration}d`;
    if (ra.barLabel === "dates") return formatDate(sa.endDate);
    return null;
  }, [ra.barLabel, formatDate]);

  if (activities.length === 0) {
    return (
      <p className="text-sm text-gray-400 dark:text-gray-500 italic">
        Add activities to see Gantt chart.
      </p>
    );
  }

  return (
    <div>
      <GanttToolbar
        viewMode={viewMode} setViewMode={setViewMode}
        dependencyMode={dependencyMode} criticalPathIds={criticalPathIds}
        showCriticalPath={showCriticalPath} setShowCriticalPath={setShowCriticalPath}
        showArrows={showArrows} setShowArrows={setShowArrows}
        showToday={showToday} setShowToday={setShowToday}
        showProjectName={showProjectName} setShowProjectName={setShowProjectName}
        projectName={projectName}
        showActivityNumbers={showActivityNumbers} onToggleActivityNumbers={onToggleActivityNumbers}
        showTargetOnGantt={showTargetOnGantt} onToggleShowTarget={onToggleShowTarget} hasTargetDate={hasTargetDate}
        appearancePanelOpen={appearancePanelOpen} onToggleAppearancePanel={onToggleAppearancePanel}
      />

      {/* Chart SVG — horizontally scrollable */}
      <div ref={svgContainerRef} className={`relative border border-gray-200 dark:border-gray-700 rounded-lg${ra.fitToWindow ? "" : " overflow-x-auto"}`}>
        <svg
          width={chartWidth}
          height={chartHeight}
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="select-none"
          style={{ background: c.bg }}
          onMouseLeave={() => setTooltip(null)}
        >
          <GanttSvgDefs
            orderedActivities={orderedActivities}
            c={{ barPlanned: ra.barPlanned, barInProgress: ra.barInProgress, hatchBuffer: c.hatchBuffer, arrow: c.arrow, arrowHover: c.arrowHover, arrowHoverCritical: c.arrowHoverCritical, criticalPath: ra.criticalPath }}
            showBuffer={showBuffer}
            showCriticalPath={showCriticalPath}
            hasCriticalPath={!!(dependencyMode && criticalPathIds && criticalPathIds.size > 0)}
          />

          {/* Weekend / non-work day shading — first layer (behind everything) */}
          {weekendShadingRects.map((rect, i) => (
            <rect
              key={`shade-${i}`}
              x={rect.x}
              y={topMargin}
              width={rect.width}
              height={chartHeight - topMargin - 10}
              fill={ra.shadingColor}
            />
          ))}

          {/* Row guide lines — faint horizontal lines every 3 rows */}
          {ra.rowGuideLines && orderedActivities.map((_, idx) => {
            if ((idx + 1) % 3 !== 0 || idx + 1 >= orderedActivities.length) return null;
            const y = topMargin + (idx + 1) * ra.rowHeight;
            return (
              <line
                key={`guide-${idx}`}
                x1={0}
                y1={y}
                x2={chartWidth}
                y2={y}
                stroke={c.gridLine}
                strokeWidth="1"
                opacity={0.35}
              />
            );
          })}

          {/* Project name header */}
          {showProjectName && projectName && (
            <text
              x={12}
              y={PROJECT_NAME_HEIGHT - 8}
              textAnchor="start"
              fontSize="16"
              fontWeight="700"
              fill={c.text}
              className="pointer-events-none"
            >
              {projectName.length > 60 ? projectName.slice(0, 58) + "\u2026" : projectName}
            </text>
          )}

          {/* Vertical grid lines at ALL tick positions (including suppressed labels) */}
          {allTicks.map((tick, i) => {
            const x = dateToX(tick.x, minTimestamp, dateRange, chartAreaWidth, ra.leftMargin);
            return (
              <line key={`grid-${i}`}
                x1={x} y1={topMargin} x2={x} y2={chartHeight - 10}
                stroke={c.gridLine} strokeWidth="1"
              />
            );
          })}
          {/* Tick labels (only where spacing permits) */}
          {ticks.map((tick, i) => {
            const x = dateToX(tick.x, minTimestamp, dateRange, chartAreaWidth, ra.leftMargin);
            const hasYear = tick.label.includes("'") || /^\d{4}$/.test(tick.label);
            return (
              <text key={`label-${i}`}
                x={x} y={topMargin - 8}
                textAnchor="middle" fontSize="11" fill={c.textMuted}
                fontWeight={hasYear ? "bold" : undefined}
              >
                {tick.label}
              </text>
            );
          })}

          {/* Green finish line with date label */}
          {dateRange > 0 && (
            <g>
              <line
                x1={finishX}
                y1={topMargin}
                x2={finishX}
                y2={chartHeight - 10}
                stroke={c.finishLine}
                strokeWidth="2"
                strokeDasharray="6 3"
              />
              <text
                x={finishX}
                y={topMargin - 8}
                textAnchor="middle"
                fontSize="12"
                fontWeight="600"
                fill={c.finishText}
              >
                {longDateLabel(finishDate)}
              </text>
            </g>
          )}

          {/* Today's date line */}
          {showToday && todayX !== null && (
            <g>
              <line
                x1={todayX}
                y1={topMargin}
                x2={todayX}
                y2={chartHeight - 10}
                stroke={c.todayLine}
                strokeWidth="1.5"
                strokeDasharray="4 2"
              />
              <text
                x={todayX}
                y={topMargin - 18}
                textAnchor="middle"
                fontSize="11"
                fontWeight="500"
                fill={c.todayText}
              >
                Today
              </text>
              <text
                x={todayX}
                y={topMargin - 6}
                textAnchor="middle"
                fontSize="10"
                fill={c.todayText}
              >
                {formatDate(todayStr)}
              </text>
            </g>
          )}

          {/* Finish Target line */}
          {showTargetOnGantt && targetFinishDate && dateRange > 0 && (() => {
            const targetX = dateToX(targetFinishDate, minTimestamp, dateRange, chartAreaWidth, ra.leftMargin);
            // Omit entirely when out of visible chart area
            if (targetX < ra.leftMargin || targetX > ra.leftMargin + chartAreaWidth) return null;
            const ragKey = targetRAGColor ?? "gray";
            const color = tc[ragKey as keyof typeof tc] ?? tc.gray;
            const dash = TARGET_DASH_PATTERNS[ragKey] ?? TARGET_DASH_PATTERNS.gray;
            const targetTooltip = `Finish Target: ${formatDate(targetFinishDate)}`;
            return (
              <g
                onMouseEnter={(e) => setTooltip({ x: e.clientX, y: e.clientY, text: targetTooltip })}
                onMouseMove={(e) => setTooltip({ x: e.clientX, y: e.clientY, text: targetTooltip })}
                onMouseLeave={() => setTooltip(null)}
              >
                {/* Invisible wider hit area for easier hovering */}
                <line
                  x1={targetX}
                  y1={topMargin}
                  x2={targetX}
                  y2={chartHeight - 10}
                  stroke="transparent"
                  strokeWidth="8"
                />
                <line
                  x1={targetX}
                  y1={topMargin}
                  x2={targetX}
                  y2={chartHeight - 10}
                  stroke={color}
                  strokeWidth="1.5"
                  strokeDasharray={dash}
                />
                <text
                  x={targetX}
                  y={topMargin - 22}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="500"
                  fill={color}
                >
                  Target
                </text>
              </g>
            );
          })()}

          {/* Milestone vertical lines and diamonds */}
          {milestones.map((m) => {
            if (dateRange === 0) return null;
            const mx = dateToX(m.targetDate, minTimestamp, dateRange, chartAreaWidth, ra.leftMargin);
            const bufferInfo = milestoneBuffers?.get(m.id);
            const healthColor = bufferInfo
              ? mc[bufferInfo.health]
              : mc.line;
            const diamondSize = 6;

            return (
              <g key={`ms-${m.id}`}>
                {/* Vertical dashed line */}
                <line
                  x1={mx}
                  y1={topMargin}
                  x2={mx}
                  y2={chartHeight - 10}
                  stroke={healthColor}
                  strokeWidth="1.5"
                  strokeDasharray="4 3"
                  opacity={0.7}
                />
                {/* Diamond marker at top */}
                <polygon
                  points={`${mx},${topMargin - 2 - diamondSize} ${mx + diamondSize},${topMargin - 2} ${mx},${topMargin - 2 + diamondSize} ${mx - diamondSize},${topMargin - 2}`}
                  fill={healthColor}
                />
                {/* Milestone name above diamond */}
                <text
                  x={mx}
                  y={topMargin - 2 - diamondSize - 15}
                  textAnchor="middle"
                  fontSize="12"
                  fill={healthColor}
                  fontWeight="600"
                  className="pointer-events-none"
                >
                  {m.name}
                </text>
                {/* Target date below name */}
                <text
                  x={mx}
                  y={topMargin - 2 - diamondSize - 3}
                  textAnchor="middle"
                  fontSize="10"
                  fill={healthColor}
                  className="pointer-events-none"
                >
                  {formatDate(m.targetDate)}
                </text>
              </g>
            );
          })}

          {/* Dependency arrows — visible paths only (rendered before bars so bars paint on top) */}
          {showArrows && arrowPaths.map((ap, i) => {
            const isHovered = hoveredDep?.from === ap.dep.fromActivityId && hoveredDep?.to === ap.dep.toActivityId;
            const arrowColor = isHovered
              ? (ap.isCriticalEdge ? c.arrowHoverCritical : c.arrowHover)
              : (ap.isCriticalEdge ? ra.criticalPath : c.arrow);
            const arrowMarker = isHovered
              ? (ap.isCriticalEdge ? "url(#arrowhead-critical-hover)" : "url(#arrowhead-hover)")
              : (ap.isCriticalEdge ? "url(#arrowhead-critical)" : "url(#arrowhead)");
            return (
              <g key={`dep-${i}`}>
                <path d={ap.path} stroke={arrowColor} strokeWidth={isHovered ? "3" : "2"}
                  fill="none" markerEnd={arrowMarker}
                  className="pointer-events-none transition-all duration-100" />
                {ap.dep.lagDays !== 0 && (
                  <text x={(ap.barEndX + ap.toX) / 2} y={(ap.fromY + ap.toY) / 2 - 4}
                    textAnchor="middle" fontSize="9" fill={arrowColor} fontWeight="600"
                    className="pointer-events-none">
                    {ap.dep.lagDays > 0 ? "+" : ""}{ap.dep.lagDays}d
                  </text>
                )}
              </g>
            );
          })}

          {/* Activity rows */}
          {orderedActivities.map((act, idx) => {
            const sa = scheduleMap.get(act.id);
            if (!sa) return null;

            const y = topMargin + idx * ra.rowHeight;
            const barY = y + barYOffset;
            const barX = dateToX(
              sa.startDate,
              minTimestamp,
              dateRange,
              chartAreaWidth,
              ra.leftMargin,
            );
            const barEndX = dateToX(
              sa.endDate,
              minTimestamp,
              dateRange,
              chartAreaWidth,
              ra.leftMargin,
            );
            const barWidth = Math.max(4, barEndX - barX);

            const barColor =
              act.status === "complete" ? ra.barComplete :
              act.status === "inProgress" ? ra.barInProgress :
              ra.barPlanned;

            const uncertainty = uncertaintyMap.get(act.id);
            const extEndDate = activityExtendedEndDates.get(act.id);
            const showHatch =
              viewMode === "uncertainty" &&
              uncertainty &&
              uncertainty.hatchedDays > 0 &&
              extEndDate;

            let hatchEndX = barEndX;
            if (showHatch && extEndDate) {
              hatchEndX = dateToX(
                extEndDate,
                minTimestamp,
                dateRange,
                chartAreaWidth,
                ra.leftMargin,
              );
            }

            const hatchStrokeColor = act.status === "inProgress" ? ra.barInProgress : ra.barPlanned;

            return (
              <g key={act.id}>
                {/* Row background on hover area */}
                <rect
                  x={0}
                  y={y}
                  width={chartWidth}
                  height={ra.rowHeight}
                  fill="transparent"
                  onMouseEnter={(e) => {
                    const tooltipName = activityIndexMap ? `#${activityIndexMap.get(act.id)} ${act.name}` : act.name;
                    let text: string;
                    if (dependencyMode && sa.totalFloat != null) {
                      const floatLabel = sa.totalFloat === 0 ? "Critical path" : `${sa.totalFloat}d`;
                      const freeFloatLabel = sa.freeFloat != null && sa.freeFloat < sa.totalFloat ? `\nFree Float: ${sa.freeFloat}d` : "";
                      text = `${tooltipName}\n${formatDate(sa.startDate)} – ${formatDate(sa.endDate)} (${sa.duration}d)\nTotal Float: ${floatLabel}${freeFloatLabel}`;
                    } else {
                      text = `${tooltipName}: ${formatDate(sa.startDate)} – ${formatDate(sa.endDate)} (${sa.duration}d)`;
                    }
                    setTooltip({
                      x: e.clientX,
                      y: e.clientY,
                      text,
                    });
                  }}
                  onMouseMove={(e) =>
                    setTooltip((prev) =>
                      prev ? { ...prev, x: e.clientX, y: e.clientY } : null
                    )
                  }
                  onMouseLeave={() => setTooltip(null)}
                />

                {/* Activity name — clickable for inline rename when unlocked */}
                <text
                  x={ra.leftMargin - 8}
                  y={y + ra.rowHeight / 2}
                  textAnchor="end"
                  dominantBaseline="central"
                  fontSize={ra.nameFontSize}
                  fill={c.text}
                  className={!isLocked && onRenameActivity ? "cursor-pointer" : "pointer-events-none"}
                  style={editingId === act.id ? { display: "none" } : undefined}
                  onClick={!isLocked && onRenameActivity ? () => {
                    setEditingId(act.id);
                    setEditValue(act.name);
                  } : undefined}
                >
                  {(() => {
                    const dn = activityIndexMap ? `#${activityIndexMap.get(act.id)} ${act.name}` : act.name;
                    return dn.length > ra.nameCharLimit ? dn.slice(0, ra.nameCharLimit - 2) + "..." : dn;
                  })()}
                </text>

                {/* Hatched bar (uncertainty extension) — behind solid */}
                {showHatch && (
                  <rect
                    x={barEndX}
                    y={barY}
                    width={Math.max(2, hatchEndX - barEndX)}
                    height={ra.barHeight}
                    rx={BAR_RADIUS}
                    fill={`url(#hatch-${act.id})`}
                    stroke={hatchStrokeColor}
                    strokeWidth="1"
                    strokeOpacity="0.4"
                  />
                )}

                {/* Solid bar — clickable to open activity editor */}
                <rect
                  x={barX}
                  y={barY}
                  width={barWidth}
                  height={ra.barHeight}
                  rx={BAR_RADIUS}
                  fill={barColor}
                  stroke={barColor}
                  strokeWidth="1"
                  className={!isLocked && onEditActivity ? "cursor-pointer" : ""}
                  onClick={!isLocked && onEditActivity ? (e) => {
                    e.stopPropagation();
                    onEditActivity(act.id);
                  } : undefined}
                />

                {/* Critical path indicator — left stripe */}
                {showCriticalPath && dependencyMode && criticalPathIds?.has(act.id) && (
                  <rect
                    x={barX}
                    y={barY}
                    width={4}
                    height={ra.barHeight}
                    rx={BAR_RADIUS}
                    fill={ra.criticalPath}
                    className="pointer-events-none"
                  />
                )}

                {/* Terminal activity indicator — right stripe */}
                {terminalIds?.has(act.id) && (
                  <rect
                    x={barX + barWidth - 4}
                    y={barY}
                    width={4}
                    height={ra.barHeight}
                    rx={BAR_RADIUS}
                    fill={c.terminal}
                    className="pointer-events-none"
                  />
                )}

                {/* Bar label — only render if text fits within bar width */}
                {(() => {
                  const label = barLabelText(sa);
                  if (!label) return null;
                  const estWidth = label.length * ra.barLabelFontSize * 0.6 + 8;
                  if (estWidth > barWidth) return null;
                  return (
                    <text
                      x={ra.barLabel === "dates" ? barX + barWidth - 4 : barX + barWidth / 2}
                      y={barY + ra.barHeight / 2}
                      textAnchor={ra.barLabel === "dates" ? "end" : "middle"}
                      dominantBaseline="central"
                      fontSize={ra.barLabelFontSize}
                      fill="#ffffff"
                      fontWeight="600"
                      className="pointer-events-none"
                    >
                      {label}
                    </text>
                  );
                })()}

                {/* Constraint indicator icon */}
                {act.constraintType && (() => {
                  const isStart = act.constraintType === "MSO" || act.constraintType === "SNET" || act.constraintType === "SNLT";
                  const iconX = isStart ? barX - 2 : barX + barWidth - 6;
                  const iconColor = act.constraintMode === "hard" ? "#3b82f6" : "#9ca3af";
                  return (
                    <g
                      className={!isLocked && onEditActivity ? "cursor-pointer" : ""}
                      onClick={!isLocked && onEditActivity ? (e) => { e.stopPropagation(); onEditActivity(act.id); } : undefined}
                    >
                      <rect
                        x={iconX}
                        y={barY - 3}
                        width={8}
                        height={8}
                        rx={2}
                        fill={iconColor}
                        opacity={act.constraintMode === "soft" ? 0.5 : 0.9}
                      />
                      <text
                        x={iconX + 4}
                        y={barY + 1}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize="6"
                        fill="#ffffff"
                        fontWeight="700"
                        className="pointer-events-none"
                      >
                        C
                      </text>
                    </g>
                  );
                })()}

              </g>
            );
          })}

          {/* Schedule Buffer row */}
          {showBuffer && bufferedEndDate && (
            <g>
              {(() => {
                const bufIdx = orderedActivities.length;
                const y = topMargin + bufIdx * ra.rowHeight;
                const barY = y + barYOffset;
                const bufStartX = dateToX(
                  projectEndDate,
                  minTimestamp,
                  dateRange,
                  chartAreaWidth,
                  ra.leftMargin,
                );
                const bufEndX = dateToX(
                  bufferedEndDate,
                  minTimestamp,
                  dateRange,
                  chartAreaWidth,
                  ra.leftMargin,
                );
                const bufWidth = Math.max(4, bufEndX - bufStartX);

                return (
                  <>
                    {/* Separator line */}
                    <line
                      x1={0}
                      y1={y - 1}
                      x2={chartWidth}
                      y2={y - 1}
                      stroke={c.gridLine}
                      strokeWidth="1"
                      strokeDasharray="4 2"
                    />

                    {/* Label */}
                    <text
                      x={ra.leftMargin - 8}
                      y={y + ra.rowHeight / 2}
                      textAnchor="end"
                      dominantBaseline="central"
                      fontSize={ra.nameFontSize}
                      fill={c.textMuted}
                      fontStyle="italic"
                      className="pointer-events-none"
                    >
                      Schedule Buffer
                    </text>

                    {/* Hatched buffer bar */}
                    <rect
                      x={bufStartX}
                      y={barY}
                      width={bufWidth}
                      height={ra.barHeight}
                      rx={BAR_RADIUS}
                      fill="url(#hatch-buffer)"
                      stroke={c.hatchBuffer}
                      strokeWidth="1"
                    />

                    {/* Buffer duration label — only render if text fits */}
                    {(() => {
                      const bufLabel = `+${buffer!.bufferDays}d`;
                      const bufFontSize = Math.min(ra.barLabelFontSize + 1, ra.barHeight - 6);
                      const estW = bufLabel.length * bufFontSize * 0.6 + 8;
                      if (estW > bufWidth) return null;
                      return (
                        <text
                          x={bufStartX + bufWidth / 2}
                          y={barY + ra.barHeight / 2}
                          textAnchor="middle"
                          dominantBaseline="central"
                          fontSize={bufFontSize}
                          fill={isDark ? "#fbbf24" : "#92400e"}
                          fontWeight="700"
                          stroke={isDark ? "#1f2937" : "#ffffff"}
                          strokeWidth="3"
                          paintOrder="stroke fill"
                          className="pointer-events-none"
                        >
                          {bufLabel}
                        </text>
                      );
                    })()}
                  </>
                );
              })()}
            </g>
          )}

          {/* Dependency arrow hit areas — rendered AFTER bars so they sit on top for mouse events */}
          {showArrows && arrowPaths.map((ap, i) => (
            <path
              key={`dep-hit-${i}`}
              d={ap.path}
              stroke="transparent"
              strokeWidth="10"
              fill="none"
              style={{ pointerEvents: isLocked ? "none" : "stroke" }}
              className={!isLocked && onEditDependency ? "cursor-pointer" : ""}
              onMouseEnter={!isLocked ? (e) => {
                setHoveredDep({ from: ap.dep.fromActivityId, to: ap.dep.toActivityId });
                setTooltip({ x: e.clientX, y: e.clientY, text: ap.label });
              } : undefined}
              onMouseMove={!isLocked ? (e) =>
                setTooltip((prev) => prev ? { ...prev, x: e.clientX, y: e.clientY } : null)
              : undefined}
              onMouseLeave={!isLocked ? () => { setHoveredDep(null); setTooltip(null); } : undefined}
              onClick={!isLocked && onEditDependency ? () =>
                onEditDependency(ap.dep.fromActivityId, ap.dep.toActivityId)
              : undefined}
            />
          ))}

        </svg>

        {/* Inline name editing overlay — positioned absolutely over the SVG */}
        {editingId && (() => {
          const idx = orderedActivities.findIndex((a) => a.id === editingId);
          if (idx === -1) return null;
          const inputTop = topMargin + idx * ra.rowHeight + (ra.rowHeight - 24) / 2;
          return (
            <input
              ref={editInputRef}
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={() => commitRename()}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); commitRename(); }
                if (e.key === "Escape") { e.preventDefault(); cancelRename(); }
              }}
              autoFocus
              maxLength={200}
              className="absolute bg-white dark:bg-gray-800 border border-blue-500 rounded px-1.5 text-sm text-right text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
              style={{
                top: inputTop,
                left: 4,
                width: ra.leftMargin - 12,
                height: 24,
                fontSize: ra.nameFontSize,
                zIndex: 10,
              }}
            />
          );
        })()}

        <GanttLegend
          c={{ ...c, barPlanned: ra.barPlanned, barInProgress: ra.barInProgress, barComplete: ra.barComplete, criticalPath: ra.criticalPath }}
          mc={mc}
          viewMode={viewMode}
          showCriticalPath={showCriticalPath}
          dependencyMode={dependencyMode}
          hasCriticalPath={!!(criticalPathIds && criticalPathIds.size > 0)}
          showToday={showToday}
          todayVisible={todayX !== null}
          hasMilestones={milestones.length > 0}
          hasConstraints={activities.some((a) => a.constraintType != null)}
          hasTerminals={terminalIds !== null && terminalIds.size > 0}
          datePrepared={formatDate(formatDateISO(new Date()))}
          showTarget={showTargetOnGantt && !!targetFinishDate}
          targetColor={tc[(targetRAGColor ?? "gray") as keyof typeof tc] ?? tc.gray}
          targetDash={TARGET_DASH_PATTERNS[targetRAGColor ?? "gray"] ?? TARGET_DASH_PATTERNS.gray}
          weekendShading={ra.weekendShading}
        />
      </div>

      {/* Tooltip portal */}
      {tooltip && (
        <div
          className="fixed z-50 px-2 py-1 text-xs bg-gray-900 text-white rounded shadow-lg pointer-events-none whitespace-pre-line"
          style={{ left: tooltip.x + 12, top: tooltip.y - 20 }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
}
