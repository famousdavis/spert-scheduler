import { useState, useEffect, useMemo, type RefObject } from "react";
import type {
  Activity,
  ActivityDependency,
  Milestone,
  MilestoneBufferInfo,
  ScheduledActivity,
  Calendar,
} from "@domain/models/types";
import type { ScheduleBuffer } from "@core/schedule/buffer";
import {
  addWorkingDays,
  parseDateISO,
  formatDateISO,
} from "@core/calendar/calendar";
import { computeActivityUncertaintyDays } from "@core/schedule/deterministic";
import { useDateFormat } from "@ui/hooks/use-date-format";
import {
  LEFT_MARGIN, RIGHT_MARGIN, TOP_MARGIN, ROW_HEIGHT,
  BAR_HEIGHT, BAR_Y_OFFSET, BAR_RADIUS, MIN_CHART_WIDTH,
  ARROW_HEAD_SIZE, MIN_TICK_SPACING_PX, PROJECT_NAME_HEIGHT,
  COLORS, MILESTONE_COLORS,
} from "./gantt-constants";
import {
  dateToX, longDateLabel, generateTicks, buildOrderedActivities,
} from "./gantt-utils";

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
  calendar?: Calendar;
  milestones?: Milestone[];
  milestoneBuffers?: Map<string, MilestoneBufferInfo> | null;
  criticalPathIds?: Set<string> | null;
  projectName?: string;
  svgContainerRef?: RefObject<HTMLDivElement | null>;
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
}: GanttChartProps) {
  const formatDate = useDateFormat();
  const [viewMode, setViewMode] = useState<"deterministic" | "uncertainty">(
    "deterministic"
  );
  const [showToday, setShowToday] = useState(true);
  const [showCriticalPath, setShowCriticalPath] = useState(true);
  const [showProjectName, setShowProjectName] = useState(false);
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

  // Measure container width for responsive chart sizing
  const [containerWidth, setContainerWidth] = useState(0);
  useEffect(() => {
    const el = svgContainerRef?.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    setContainerWidth(el.clientWidth);
    return () => observer.disconnect();
  }, [svgContainerRef]);

  const showBuffer = buffer !== null && buffer.bufferDays > 0 && bufferedEndDate;
  const totalRows = orderedActivities.length + (showBuffer ? 1 : 0);
  // Extra top margin when milestones exist so name + date labels clear the tick row
  let topMargin = milestones.length > 0 ? TOP_MARGIN + 26 : TOP_MARGIN;
  if (showProjectName && projectName) topMargin += PROJECT_NAME_HEIGHT;
  const chartHeight = topMargin + totalRows * ROW_HEIGHT + 20;

  // Scale chart width: fit container, only scroll when bars would be unreadably small
  const minTimestamp = new Date(projectStartDate + "T00:00:00").getTime();
  const maxTimestamp = new Date(furthestDate + "T00:00:00").getTime();
  const dateRange = maxTimestamp - minTimestamp;
  const calendarDays = dateRange / (1000 * 60 * 60 * 24);
  const MIN_PX_PER_DAY = 2;
  const targetWidth = containerWidth > 0 ? containerWidth : MIN_CHART_WIDTH;
  const availableChartArea = targetWidth - LEFT_MARGIN - RIGHT_MARGIN;
  const pxPerDay = calendarDays > 0 ? availableChartArea / calendarDays : 8;
  const chartWidth = pxPerDay < MIN_PX_PER_DAY
    ? LEFT_MARGIN + RIGHT_MARGIN + Math.ceil(calendarDays * MIN_PX_PER_DAY)
    : targetWidth;
  const chartAreaWidth = chartWidth - LEFT_MARGIN - RIGHT_MARGIN;

  // Generate ticks then filter out any that are too close in pixel space
  const allTicks = useMemo(
    () => generateTicks(projectStartDate, furthestDate),
    [projectStartDate, furthestDate]
  );

  // Finish line date: buffered end if available, otherwise project end
  const finishDate = bufferedEndDate ?? projectEndDate;
  const finishX = dateRange > 0
    ? dateToX(finishDate, minTimestamp, dateRange, chartAreaWidth)
    : 0;

  // Milestone X positions for tick suppression
  const milestoneXPositions = useMemo(() => {
    if (dateRange === 0) return [];
    return milestones.map((m) =>
      dateToX(m.targetDate, minTimestamp, dateRange, chartAreaWidth)
    );
  }, [milestones, minTimestamp, dateRange, chartAreaWidth]);

  // Today line X position — only when today falls within the project timeline
  const todayStr = formatDateISO(new Date());
  const todayInRange = dateRange > 0 && todayStr >= projectStartDate && todayStr <= furthestDate;
  const todayX = todayInRange
    ? dateToX(todayStr, minTimestamp, dateRange, chartAreaWidth)
    : null;

  const ticks = useMemo(() => {
    if (allTicks.length === 0 || dateRange === 0) return allTicks;
    const filtered: typeof allTicks = [];
    let lastX = -Infinity;
    for (const tick of allTicks) {
      const x = dateToX(tick.x, minTimestamp, dateRange, chartAreaWidth);
      // Suppress ticks that collide with the finish date label
      // Wider exclusion zone for the long-form finish date label
      if (Math.abs(x - finishX) < MIN_TICK_SPACING_PX * 1.5) continue;
      // Suppress ticks that collide with milestone labels
      if (milestoneXPositions.some((mx) => Math.abs(x - mx) < MIN_TICK_SPACING_PX)) continue;
      // Suppress ticks that collide with today line label
      if (todayX !== null && Math.abs(x - todayX) < MIN_TICK_SPACING_PX) continue;
      if (x - lastX >= MIN_TICK_SPACING_PX) {
        filtered.push(tick);
        lastX = x;
      }
    }
    return filtered;
  }, [allTicks, minTimestamp, dateRange, chartAreaWidth, finishX, milestoneXPositions, todayX]);

  // Build row index map for dependency arrows
  const rowIndex = useMemo(() => {
    const m = new Map<string, number>();
    orderedActivities.forEach((a, i) => m.set(a.id, i));
    return m;
  }, [orderedActivities]);

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
          {/* Hatching pattern definitions */}
          <defs>
            {orderedActivities.map((act) => (
              <pattern
                key={`hatch-${act.id}`}
                id={`hatch-${act.id}`}
                patternUnits="userSpaceOnUse"
                width="8"
                height="8"
                patternTransform="rotate(45)"
              >
                <line
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="8"
                  stroke={act.status === "inProgress" ? c.hatchInProgress : c.hatchActivity}
                  strokeWidth="4"
                />
              </pattern>
            ))}
            {showBuffer && (
              <pattern
                id="hatch-buffer"
                patternUnits="userSpaceOnUse"
                width="8"
                height="8"
                patternTransform="rotate(45)"
              >
                <line
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="8"
                  stroke={c.hatchBuffer}
                  strokeWidth="4"
                />
              </pattern>
            )}
            {/* Arrowhead marker — userSpaceOnUse prevents scaling by stroke width */}
            <marker
              id="arrowhead"
              markerUnits="userSpaceOnUse"
              markerWidth={ARROW_HEAD_SIZE}
              markerHeight={ARROW_HEAD_SIZE}
              refX="0"
              refY={ARROW_HEAD_SIZE / 2}
              orient="auto"
            >
              <polygon
                points={`0 0, ${ARROW_HEAD_SIZE} ${ARROW_HEAD_SIZE / 2}, 0 ${ARROW_HEAD_SIZE}`}
                fill={c.arrow}
              />
            </marker>
            {/* Critical path arrowhead marker */}
            {showCriticalPath && dependencyMode && criticalPathIds && criticalPathIds.size > 0 && (
              <marker
                id="arrowhead-critical"
                markerUnits="userSpaceOnUse"
                markerWidth={ARROW_HEAD_SIZE}
                markerHeight={ARROW_HEAD_SIZE}
                refX="0"
                refY={ARROW_HEAD_SIZE / 2}
                orient="auto"
              >
                <polygon
                  points={`0 0, ${ARROW_HEAD_SIZE} ${ARROW_HEAD_SIZE / 2}, 0 ${ARROW_HEAD_SIZE}`}
                  fill={c.criticalPath}
                />
              </marker>
            )}
          </defs>

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
          {dependencyMode &&
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

              // Arrow from right edge of predecessor bar to left side of successor bar
              const barEndX = dateToX(
                fromSa.endDate,
                minTimestamp,
                dateRange,
                chartAreaWidth
              );
              const fromY =
                topMargin + fromRow * ROW_HEIGHT + ROW_HEIGHT / 2;
              const toX = dateToX(
                toSa.startDate,
                minTimestamp,
                dateRange,
                chartAreaWidth
              );
              const toY =
                topMargin + toRow * ROW_HEIGHT + ROW_HEIGHT / 2;

              // Stub right from bar end, then cubic Bezier swerve down to arrowhead
              const STUB = 7;
              const stubX = barEndX + STUB;
              const endX = toX - ARROW_HEAD_SIZE;
              const dyAbs = Math.abs(toY - fromY);
              const dySigned = toY - fromY; // positive = going down

              let path: string;
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
                  onMouseEnter={(e) =>
                    setTooltip({
                      x: e.clientX,
                      y: e.clientY,
                      text: `${act.name}: ${formatDate(sa.startDate)} – ${formatDate(sa.endDate)} (${sa.duration}d)`,
                    })
                  }
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
                  {act.name.length > 25
                    ? act.name.slice(0, 23) + "..."
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

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-3 py-2 text-xs text-gray-600 dark:text-gray-400 border-t border-gray-100 dark:border-gray-700">
          {/* Status colors */}
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: c.barPlanned }} />
            Planned
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: c.barInProgress }} />
            In Progress
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: c.barComplete }} />
            Complete
          </span>

          {/* Critical path */}
          {showCriticalPath && dependencyMode && criticalPathIds && criticalPathIds.size > 0 && (
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block w-3 h-3 rounded-sm"
                style={{ backgroundColor: c.barPlanned, borderLeft: `4px solid ${c.criticalPath}` }}
              />
              Critical Path
            </span>
          )}

          {/* Uncertainty hatching */}
          {viewMode === "uncertainty" && (
            <span className="flex items-center gap-1.5">
              <svg width="12" height="12" className="inline-block">
                <defs>
                  <pattern id="legend-hatch" patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(45)">
                    <line x1="0" y1="0" x2="0" y2="4" stroke={c.hatchActivity} strokeWidth="2" />
                  </pattern>
                </defs>
                <rect width="12" height="12" rx="1" fill="url(#legend-hatch)" stroke={c.hatchActivity} strokeWidth="0.5" />
              </svg>
              Uncertainty
            </span>
          )}

          {/* Finish line */}
          <span className="flex items-center gap-1.5">
            <svg width="12" height="12" className="inline-block">
              <line x1="6" y1="0" x2="6" y2="12" stroke={c.finishLine} strokeWidth="2" strokeDasharray="3 1.5" />
            </svg>
            Finish
          </span>

          {/* Today line */}
          {showToday && todayX !== null && (
            <span className="flex items-center gap-1.5">
              <svg width="12" height="12" className="inline-block">
                <line x1="6" y1="0" x2="6" y2="12" stroke={c.todayLine} strokeWidth="1.5" strokeDasharray="2 1" />
              </svg>
              Today
            </span>
          )}

          {/* Milestones */}
          {milestones.length > 0 && (
            <span className="flex items-center gap-1.5">
              <svg width="12" height="12" className="inline-block">
                <polygon points="6,1 11,6 6,11 1,6" fill={mc.diamond} />
              </svg>
              Milestone
            </span>
          )}
        </div>
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
