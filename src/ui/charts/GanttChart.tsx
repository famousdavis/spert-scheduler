import { useState, useMemo, type RefObject } from "react";
import type {
  Activity,
  ActivityDependency,
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
  ARROW_HEAD_SIZE, MIN_TICK_SPACING_PX, COLORS,
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
  svgContainerRef,
}: GanttChartProps) {
  const formatDate = useDateFormat();
  const [viewMode, setViewMode] = useState<"deterministic" | "uncertainty">(
    "deterministic"
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

  // Compute the furthest date considering all scheduled activities and uncertainty extensions
  const furthestDate = useMemo(() => {
    let latest = timelineEnd;
    for (const sa of scheduledActivities) {
      if (sa.endDate > latest) latest = sa.endDate;
    }
    for (const extEnd of activityExtendedEndDates.values()) {
      if (extEnd > latest) latest = extEnd;
    }
    return latest;
  }, [timelineEnd, scheduledActivities, activityExtendedEndDates]);

  const showBuffer = buffer !== null && buffer.bufferDays > 0 && bufferedEndDate;
  const totalRows = orderedActivities.length + (showBuffer ? 1 : 0);
  const chartHeight = TOP_MARGIN + totalRows * ROW_HEIGHT + 20;

  // Scale chart width based on date range: ~8px per calendar day, min 900
  const minTimestamp = new Date(projectStartDate + "T00:00:00").getTime();
  const maxTimestamp = new Date(furthestDate + "T00:00:00").getTime();
  const dateRange = maxTimestamp - minTimestamp;
  const calendarDays = dateRange / (1000 * 60 * 60 * 24);
  const chartWidth = Math.max(
    MIN_CHART_WIDTH,
    LEFT_MARGIN + RIGHT_MARGIN + Math.ceil(calendarDays * 8)
  );
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

  const ticks = useMemo(() => {
    if (allTicks.length === 0 || dateRange === 0) return allTicks;
    const filtered: typeof allTicks = [];
    let lastX = -Infinity;
    for (const tick of allTicks) {
      const x = dateToX(tick.x, minTimestamp, dateRange, chartAreaWidth);
      // Suppress ticks that collide with the finish date label
      // Wider exclusion zone for the long-form finish date label
      if (Math.abs(x - finishX) < MIN_TICK_SPACING_PX * 1.5) continue;
      if (x - lastX >= MIN_TICK_SPACING_PX) {
        filtered.push(tick);
        lastX = x;
      }
    }
    return filtered;
  }, [allTicks, minTimestamp, dateRange, chartAreaWidth, finishX]);

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
                  stroke={c.hatchActivity}
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
          </defs>

          {/* Vertical grid lines at tick positions */}
          {ticks.map((tick, i) => {
            const x = dateToX(tick.x, minTimestamp, dateRange, chartAreaWidth);
            return (
              <g key={i}>
                <line
                  x1={x}
                  y1={TOP_MARGIN}
                  x2={x}
                  y2={chartHeight - 10}
                  stroke={c.gridLine}
                  strokeWidth="1"
                />
                <text
                  x={x}
                  y={TOP_MARGIN - 8}
                  textAnchor="middle"
                  fontSize="10"
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
                y1={TOP_MARGIN}
                x2={finishX}
                y2={chartHeight - 10}
                stroke={c.finishLine}
                strokeWidth="2"
                strokeDasharray="6 3"
              />
              <text
                x={finishX}
                y={TOP_MARGIN - 8}
                textAnchor="middle"
                fontSize="10"
                fontWeight="600"
                fill={c.finishText}
              >
                {longDateLabel(finishDate)}
              </text>
            </g>
          )}

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

              // Arrow from right edge of predecessor bar to back of arrowhead at successor bar
              const barEndX = dateToX(
                fromSa.endDate,
                minTimestamp,
                dateRange,
                chartAreaWidth
              );
              const fromY =
                TOP_MARGIN + fromRow * ROW_HEIGHT + ROW_HEIGHT / 2;
              const toX = dateToX(
                toSa.startDate,
                minTimestamp,
                dateRange,
                chartAreaWidth
              );
              const toY =
                TOP_MARGIN + toRow * ROW_HEIGHT + ROW_HEIGHT / 2;

              // Arrowhead tip touches the successor bar exactly (refX=0, tip at +ARROW_HEAD_SIZE)
              const endX = toX - ARROW_HEAD_SIZE;
              // Control points push outward so the curve extends horizontally before bending
              const dy = Math.abs(toY - fromY);
              const curvature = Math.max(24, dy * 0.5);
              const path = `M${barEndX},${fromY} C${barEndX + curvature},${fromY} ${endX - curvature},${toY} ${endX},${toY}`;

              return (
                <g key={`dep-${i}`}>
                  <path
                    d={path}
                    stroke={c.arrow}
                    strokeWidth="2.5"
                    fill="none"
                    markerEnd="url(#arrowhead)"
                  />
                  {dep.lagDays !== 0 && (
                    <text
                      x={(barEndX + toX) / 2}
                      y={(fromY + toY) / 2 - 4}
                      textAnchor="middle"
                      fontSize="9"
                      fill={c.arrow}
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

            const y = TOP_MARGIN + idx * ROW_HEIGHT;
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

            const isComplete = act.status === "complete";
            const barColor = isComplete ? c.barComplete : c.barPlanned;

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
                  fontSize="11"
                  fill={c.text}
                  className="pointer-events-none"
                >
                  {act.name.length > 22
                    ? act.name.slice(0, 20) + "..."
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
                    stroke={c.hatchActivity}
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
                const y = TOP_MARGIN + bufIdx * ROW_HEIGHT;
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
                      fontSize="11"
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
