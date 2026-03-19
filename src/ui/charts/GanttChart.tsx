// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useState, useMemo, useCallback, type RefObject } from "react";
import type {
  Activity,
  ActivityDependency,
  Milestone,
  MilestoneBufferInfo,
  ScheduledActivity,
  Calendar,
  GanttViewMode,
} from "@domain/models/types";
import type { WorkCalendar } from "@core/calendar/work-calendar";
import type { ScheduleBuffer } from "@core/schedule/buffer";
import {
  addWorkingDays,
  parseDateISO,
  formatDateISO,
} from "@core/calendar/calendar";
import { computeActivityUncertaintyDays } from "@core/schedule/deterministic";
import { useDateFormat } from "@ui/hooks/use-date-format";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";
import { useGanttLayout } from "@ui/hooks/use-gantt-layout";
import {
  LEFT_MARGIN, ROW_HEIGHT,
  BAR_HEIGHT, BAR_Y_OFFSET, BAR_RADIUS,
  ARROW_HEAD_SIZE, PROJECT_NAME_HEIGHT,
  COLORS, MILESTONE_COLORS,
} from "./gantt-constants";
import {
  dateToX, longDateLabel, buildOrderedActivities,
} from "./gantt-utils";
import { GanttSvgDefs } from "./GanttSvgDefs";
import { GanttLegend } from "./GanttLegend";

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
}: GanttChartProps) {
  const formatDate = useDateFormat();
  const viewMode: GanttViewMode = usePreferencesStore((s) => s.preferences.ganttViewMode) ?? "deterministic";
  const showToday = usePreferencesStore((s) => s.preferences.ganttShowToday) ?? true;
  const showCriticalPath = usePreferencesStore((s) => s.preferences.ganttShowCriticalPath) ?? true;
  const showProjectName = usePreferencesStore((s) => s.preferences.ganttShowProjectName) ?? false;
  const showArrows = usePreferencesStore((s) => s.preferences.ganttShowArrows) ?? true;
  const updatePreferences = usePreferencesStore((s) => s.updatePreferences);
  const setViewMode = useCallback(
    (mode: GanttViewMode) => updatePreferences({ ganttViewMode: mode }),
    [updatePreferences],
  );
  const setShowToday = useCallback(
    (v: boolean) => updatePreferences({ ganttShowToday: v }),
    [updatePreferences],
  );
  const setShowCriticalPath = useCallback(
    (v: boolean) => updatePreferences({ ganttShowCriticalPath: v }),
    [updatePreferences],
  );
  const setShowProjectName = useCallback(
    (v: boolean) => updatePreferences({ ganttShowProjectName: v }),
    [updatePreferences],
  );
  const setShowArrows = useCallback(
    (v: boolean) => updatePreferences({ ganttShowArrows: v }),
    [updatePreferences],
  );
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    text: string;
  } | null>(null);

  // Detect dark mode
  const isDark =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark");
  const c = isDark ? COLORS.dark : COLORS.light;
  const mc = isDark ? MILESTONE_COLORS.dark : MILESTONE_COLORS.light;

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

  // Row ordering: topological in dependency mode, array order otherwise
  const orderedActivities = useMemo(
    () => buildOrderedActivities(activities, dependencies, dependencyMode),
    [activities, dependencies, dependencyMode],
  );

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
  });
  const {
    chartWidth, chartHeight, chartAreaWidth, topMargin,
    minTimestamp, dateRange, finishX, finishDate,
    todayX, ticks, rowIndex,
  } = layout;

  if (activities.length === 0) {
    return (
      <p className="text-sm text-gray-400 dark:text-gray-500 italic">
        Add activities to see Gantt chart.
      </p>
    );
  }

  return (
    <div>
      {/* View toggle */}
      <div className="flex items-center gap-2 mb-3">
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
      </div>

      {/* Chart SVG — horizontally scrollable */}
      <div ref={svgContainerRef} className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
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
            c={c}
            showBuffer={showBuffer}
            showCriticalPath={showCriticalPath}
            hasCriticalPath={!!(dependencyMode && criticalPathIds && criticalPathIds.size > 0)}
          />

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

          {/* Vertical grid lines at tick positions */}
          {ticks.map((tick, i) => {
            const x = dateToX(tick.x, minTimestamp, dateRange, chartAreaWidth);
            return (
              <g key={i}>
                <line
                  x1={x}
                  y1={topMargin}
                  x2={x}
                  y2={chartHeight - 10}
                  stroke={c.gridLine}
                  strokeWidth="1"
                />
                <text
                  x={x}
                  y={topMargin - 8}
                  textAnchor="middle"
                  fontSize="11"
                  fill={c.textMuted}
                >
                  {tick.label}
                </text>
              </g>
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
                y={topMargin - 8}
                textAnchor="middle"
                fontSize="11"
                fontWeight="500"
                fill={c.todayText}
              >
                Today
              </text>
            </g>
          )}

          {/* Milestone vertical lines and diamonds */}
          {milestones.map((m) => {
            if (dateRange === 0) return null;
            const mx = dateToX(m.targetDate, minTimestamp, dateRange, chartAreaWidth);
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

          {/* Dependency arrows (rendered before bars so bars paint on top) */}
          {dependencyMode && showArrows &&
            dependencies.map((dep, i) => {
              const fromRow = rowIndex.get(dep.fromActivityId);
              const toRow = rowIndex.get(dep.toActivityId);
              const fromSa = scheduleMap.get(dep.fromActivityId);
              const toSa = scheduleMap.get(dep.toActivityId);

              if (
                fromRow === undefined ||
                toRow === undefined ||
                !fromSa ||
                !toSa
              )
                return null;

              // Arrow anchors depend on dependency type
              const fromDate = dep.type === "SS" ? fromSa.startDate : fromSa.endDate;
              const toDate = dep.type === "FF" ? toSa.endDate : toSa.startDate;
              const barEndX = dateToX(
                fromDate,
                minTimestamp,
                dateRange,
                chartAreaWidth
              );
              const fromY =
                topMargin + fromRow * ROW_HEIGHT + ROW_HEIGHT / 2;
              const toX = dateToX(
                toDate,
                minTimestamp,
                dateRange,
                chartAreaWidth
              );
              const toY =
                topMargin + toRow * ROW_HEIGHT + ROW_HEIGHT / 2;

              // Stub right from bar end, then curve to arrowhead
              const STUB = 7;
              const stubX = barEndX + STUB;
              const dyAbs = Math.abs(toY - fromY);
              const dySigned = toY - fromY; // positive = going down

              let path: string;
              if (dep.type === "FF") {
                // FF: U-turn — exit right, curve out, approach target's right end from right
                const endX = toX + ARROW_HEAD_SIZE;
                const rightX = Math.max(stubX, endX) + Math.max(15, dyAbs * 0.3);
                path = `M${barEndX},${fromY} L${stubX},${fromY} C${rightX},${fromY} ${rightX},${toY} ${endX},${toY}`;
              } else {
                const endX = toX - ARROW_HEAD_SIZE;
                if (endX >= stubX + 10) {
                  // Normal case: enough horizontal room for a wide S-curve
                  const spread = Math.max(20, dyAbs * 0.45);
                  path = `M${barEndX},${fromY} L${stubX},${fromY} C${stubX + spread},${fromY} ${endX - spread},${toY} ${endX},${toY}`;
                } else {
                  // Overlap case: bars overlap in time — flat descent then turn
                  // right into arrowhead from the left
                  const loopExt = Math.max(30, dyAbs * 0.5);
                  path = `M${barEndX},${fromY} L${stubX},${fromY} C${stubX + loopExt},${fromY + dySigned * 0.3} ${endX - loopExt},${toY} ${endX},${toY}`;
                }
              }

              const isCriticalEdge =
                showCriticalPath &&
                criticalPathIds?.has(dep.fromActivityId) &&
                criticalPathIds?.has(dep.toActivityId);
              const arrowColor = isCriticalEdge ? c.criticalPath : c.arrow;
              const arrowMarker = isCriticalEdge ? "url(#arrowhead-critical)" : "url(#arrowhead)";

              return (
                <g key={`dep-${i}`}>
                  <path
                    d={path}
                    stroke={arrowColor}
                    strokeWidth="2"
                    fill="none"
                    markerEnd={arrowMarker}
                  />
                  {dep.lagDays !== 0 && (
                    <text
                      x={(barEndX + toX) / 2}
                      y={(fromY + toY) / 2 - 4}
                      textAnchor="middle"
                      fontSize="9"
                      fill={arrowColor}
                      fontWeight="600"
                      className="pointer-events-none"
                    >
                      {dep.lagDays > 0 ? "+" : ""}
                      {dep.lagDays}d
                    </text>
                  )}
                </g>
              );
            })}

          {/* Activity rows */}
          {orderedActivities.map((act, idx) => {
            const sa = scheduleMap.get(act.id);
            if (!sa) return null;

            const y = topMargin + idx * ROW_HEIGHT;
            const barY = y + BAR_Y_OFFSET;
            const barX = dateToX(
              sa.startDate,
              minTimestamp,
              dateRange,
              chartAreaWidth
            );
            const barEndX = dateToX(
              sa.endDate,
              minTimestamp,
              dateRange,
              chartAreaWidth
            );
            const barWidth = Math.max(4, barEndX - barX);

            const barColor =
              act.status === "complete" ? c.barComplete :
              act.status === "inProgress" ? c.barInProgress :
              c.barPlanned;

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
                chartAreaWidth
              );
            }

            return (
              <g key={act.id}>
                {/* Row background on hover area */}
                <rect
                  x={0}
                  y={y}
                  width={chartWidth}
                  height={ROW_HEIGHT}
                  fill="transparent"
                  onMouseEnter={(e) => {
                    setTooltip({
                      x: e.clientX,
                      y: e.clientY,
                      text: `${act.name}: ${formatDate(sa.startDate)} – ${formatDate(sa.endDate)} (${sa.duration}d)`,
                    });
                  }}
                  onMouseMove={(e) =>
                    setTooltip((prev) =>
                      prev ? { ...prev, x: e.clientX, y: e.clientY } : null
                    )
                  }
                  onMouseLeave={() => setTooltip(null)}
                />

                {/* Activity name */}
                <text
                  x={LEFT_MARGIN - 8}
                  y={y + ROW_HEIGHT / 2}
                  textAnchor="end"
                  dominantBaseline="central"
                  fontSize="12"
                  fill={c.text}
                  className="pointer-events-none"
                >
                  {act.name.length > 38
                    ? act.name.slice(0, 36) + "..."
                    : act.name}
                </text>

                {/* Hatched bar (uncertainty extension) — behind solid */}
                {showHatch && (
                  <rect
                    x={barEndX}
                    y={barY}
                    width={Math.max(2, hatchEndX - barEndX)}
                    height={BAR_HEIGHT}
                    rx={BAR_RADIUS}
                    fill={`url(#hatch-${act.id})`}
                    stroke={act.status === "inProgress" ? c.hatchInProgress : c.hatchActivity}
                    strokeWidth="1"
                  />
                )}

                {/* Solid bar */}
                <rect
                  x={barX}
                  y={barY}
                  width={barWidth}
                  height={BAR_HEIGHT}
                  rx={BAR_RADIUS}
                  fill={barColor}
                  stroke={barColor}
                  strokeWidth="1"
                />

                {/* Critical path indicator — left stripe */}
                {showCriticalPath && dependencyMode && criticalPathIds?.has(act.id) && (
                  <rect
                    x={barX}
                    y={barY}
                    width={4}
                    height={BAR_HEIGHT}
                    rx={BAR_RADIUS}
                    fill={c.criticalPath}
                    className="pointer-events-none"
                  />
                )}

                {/* Duration label inside bar */}
                {barWidth > 30 && (
                  <text
                    x={barX + barWidth / 2}
                    y={barY + BAR_HEIGHT / 2}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize="10"
                    fill="#ffffff"
                    fontWeight="600"
                    className="pointer-events-none"
                  >
                    {sa.duration}d
                  </text>
                )}

                {/* Constraint indicator icon */}
                {act.constraintType && (() => {
                  const isStart = act.constraintType === "MSO" || act.constraintType === "SNET" || act.constraintType === "SNLT";
                  const iconX = isStart ? barX - 2 : barX + barWidth - 6;
                  const iconColor = act.constraintMode === "hard" ? "#3b82f6" : "#9ca3af";
                  return (
                    <g
                      className="cursor-pointer"
                      onClick={() => onEditActivity?.(act.id)}
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
                const y = topMargin + bufIdx * ROW_HEIGHT;
                const barY = y + BAR_Y_OFFSET;
                const bufStartX = dateToX(
                  projectEndDate,
                  minTimestamp,
                  dateRange,
                  chartAreaWidth
                );
                const bufEndX = dateToX(
                  bufferedEndDate,
                  minTimestamp,
                  dateRange,
                  chartAreaWidth
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
                      x={LEFT_MARGIN - 8}
                      y={y + ROW_HEIGHT / 2}
                      textAnchor="end"
                      dominantBaseline="central"
                      fontSize="12"
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
                      height={BAR_HEIGHT}
                      rx={BAR_RADIUS}
                      fill="url(#hatch-buffer)"
                      stroke={c.hatchBuffer}
                      strokeWidth="1"
                    />

                    {/* Buffer duration label */}
                    {bufWidth > 30 && (
                      <text
                        x={bufStartX + bufWidth / 2}
                        y={barY + BAR_HEIGHT / 2}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize="11"
                        fill={isDark ? "#fbbf24" : "#92400e"}
                        fontWeight="700"
                        className="pointer-events-none"
                      >
                        +{buffer!.bufferDays}d
                      </text>
                    )}
                  </>
                );
              })()}
            </g>
          )}

        </svg>

        <GanttLegend
          c={c}
          mc={mc}
          viewMode={viewMode}
          showCriticalPath={showCriticalPath}
          dependencyMode={dependencyMode}
          hasCriticalPath={!!(criticalPathIds && criticalPathIds.size > 0)}
          showToday={showToday}
          todayVisible={todayX !== null}
          hasMilestones={milestones.length > 0}
          hasConstraints={activities.some((a) => a.constraintType != null)}
          datePrepared={formatDate(formatDateISO(new Date()))}
        />
      </div>

      {/* Tooltip portal */}
      {tooltip && (
        <div
          className="fixed z-50 px-2 py-1 text-xs bg-gray-900 text-white rounded shadow-lg pointer-events-none"
          style={{ left: tooltip.x + 12, top: tooltip.y - 20 }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
}
