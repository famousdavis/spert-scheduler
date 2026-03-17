// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useCallback, useMemo } from "react";
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
import { formatDateISO } from "@core/calendar/calendar";
import {
  PRINT_LEFT, PRINT_RIGHT, PRINT_TOP, PRINT_ROW, PRINT_BAR_H,
  PRINT_BAR_RADIUS, PRINT_ARROW_SIZE, PRINT_MIN_TICK_PX,
  PRINT_PROJECT_NAME_H, PRINT_MILESTONE_EXTRA_TOP,
  COLORS, MILESTONE_COLORS,
} from "./gantt-constants";
import { dateToX, buildOrderedActivities, generateTicks, longDateLabel } from "./gantt-utils";

export interface PrintGanttChartProps {
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
  bufferedEndDate: string | null;
  formatDate: (iso: string) => string;
  milestones?: Milestone[];
  milestoneBuffers?: Map<string, MilestoneBufferInfo> | null;
  criticalPathIds?: Set<string> | null;
  projectName?: string;
}

export function PrintGanttChart({
  activities,
  scheduledActivities,
  projectStartDate,
  projectEndDate,
  buffer,
  dependencies,
  dependencyMode,
  bufferedEndDate,
  formatDate,
  milestones = [],
  milestoneBuffers,
  criticalPathIds,
  projectName,
}: PrintGanttChartProps) {
  const c = COLORS.light;
  const mc = MILESTONE_COLORS.light;

  const scheduleMap = useMemo(() => {
    const m = new Map<string, ScheduledActivity>();
    for (const sa of scheduledActivities) m.set(sa.activityId, sa);
    return m;
  }, [scheduledActivities]);

  const ordered = useMemo(
    () => buildOrderedActivities(activities, dependencies, dependencyMode),
    [activities, dependencies, dependencyMode],
  );

  // Row index map for dependency arrows
  const rowIndex = useMemo(() => {
    const m = new Map<string, number>();
    ordered.forEach((a, i) => m.set(a.id, i));
    return m;
  }, [ordered]);

  const showBuffer = buffer && buffer.bufferDays > 0 && bufferedEndDate;
  const endDate = milestones.reduce(
    (d, ms) => (ms.targetDate > d ? ms.targetDate : d),
    bufferedEndDate ?? projectEndDate,
  );

  // Dynamic top margin
  const topMargin = PRINT_TOP
    + (projectName ? PRINT_PROJECT_NAME_H : 0)
    + (milestones.length > 0 ? PRINT_MILESTONE_EXTRA_TOP : 0);

  const totalRows = ordered.length + (showBuffer ? 1 : 0);
  const chartW = 700;
  const chartH = topMargin + totalRows * PRINT_ROW + 8;
  const areaW = chartW - PRINT_LEFT - PRINT_RIGHT;

  const minTs = new Date(projectStartDate + "T00:00:00").getTime();
  const maxTs = new Date(endDate + "T00:00:00").getTime();
  const range = maxTs - minTs;

  const toX = useCallback(
    (d: string) => dateToX(d, minTs, range, areaW, PRINT_LEFT),
    [minTs, range, areaW],
  );

  // Finish line
  const finishDate = bufferedEndDate ?? projectEndDate;
  const finishX = toX(finishDate);

  // Today line
  const todayStr = formatDateISO(new Date());
  const todayInRange = range > 0 && todayStr >= projectStartDate && todayStr <= endDate;
  const todayX = todayInRange ? toX(todayStr) : null;

  // Milestone X positions for tick suppression
  const milestoneXPositions = useMemo(
    () => milestones.map((m) => toX(m.targetDate)),
    [milestones, toX],
  );

  // Ticks with suppression
  const allTicks = useMemo(
    () => generateTicks(projectStartDate, endDate),
    [projectStartDate, endDate],
  );
  const ticks = useMemo(() => {
    if (allTicks.length === 0 || range === 0) return allTicks;
    const filtered: typeof allTicks = [];
    let lastX = -Infinity;
    for (const tick of allTicks) {
      const x = toX(tick.x);
      if (Math.abs(x - finishX) < PRINT_MIN_TICK_PX * 1.5) continue;
      if (milestoneXPositions.some((mx) => Math.abs(x - mx) < PRINT_MIN_TICK_PX)) continue;
      if (todayX !== null && Math.abs(x - todayX) < PRINT_MIN_TICK_PX) continue;
      if (x - lastX >= PRINT_MIN_TICK_PX) {
        filtered.push(tick);
        lastX = x;
      }
    }
    return filtered;
  }, [allTicks, range, toX, finishX, milestoneXPositions, todayX]);

  const hasCriticalPath = dependencyMode && criticalPathIds && criticalPathIds.size > 0;

  return (
    <section className="mb-3 print-section-keep">
      <h2 className="text-base font-semibold border-b border-gray-300 pb-1 mb-2">
        Gantt Chart
      </h2>
      <svg width={chartW} height={chartH} viewBox={`0 0 ${chartW} ${chartH}`}>
        {/* Arrowhead marker definitions */}
        <defs>
          <marker id="print-arrowhead" markerUnits="userSpaceOnUse"
            markerWidth={PRINT_ARROW_SIZE} markerHeight={PRINT_ARROW_SIZE}
            refX="0" refY={PRINT_ARROW_SIZE / 2} orient="auto">
            <polygon
              points={`0 0, ${PRINT_ARROW_SIZE} ${PRINT_ARROW_SIZE / 2}, 0 ${PRINT_ARROW_SIZE}`}
              fill={c.arrow}
            />
          </marker>
          {hasCriticalPath && (
            <marker id="print-arrowhead-critical" markerUnits="userSpaceOnUse"
              markerWidth={PRINT_ARROW_SIZE} markerHeight={PRINT_ARROW_SIZE}
              refX="0" refY={PRINT_ARROW_SIZE / 2} orient="auto">
              <polygon
                points={`0 0, ${PRINT_ARROW_SIZE} ${PRINT_ARROW_SIZE / 2}, 0 ${PRINT_ARROW_SIZE}`}
                fill={c.criticalPath}
              />
            </marker>
          )}
        </defs>

        {/* Project name header */}
        {projectName && (
          <text x={8} y={PRINT_PROJECT_NAME_H - 4} textAnchor="start"
            fontSize="10" fontWeight="700" fill={c.text}>
            {projectName.length > 80 ? projectName.slice(0, 78) + "\u2026" : projectName}
          </text>
        )}

        {/* Tick grid lines + labels */}
        {ticks.map((tick, i) => {
          const x = toX(tick.x);
          return (
            <g key={`tick-${i}`}>
              <line x1={x} y1={topMargin} x2={x} y2={chartH - 4}
                stroke={c.gridLine} strokeWidth="0.5" />
              <text x={x} y={topMargin - 4} textAnchor="middle"
                fontSize="5" fill={c.textMuted}>
                {tick.label}
              </text>
            </g>
          );
        })}

        {/* Finish line */}
        {range > 0 && (
          <g>
            <line x1={finishX} y1={topMargin} x2={finishX} y2={chartH - 4}
              stroke={c.finishLine} strokeWidth="1" strokeDasharray="4 2" />
            <text x={finishX} y={topMargin - 4} textAnchor="middle"
              fontSize="5" fontWeight="600" fill={c.finishText}>
              {longDateLabel(finishDate)}
            </text>
          </g>
        )}

        {/* Today line */}
        {todayX !== null && (
          <g>
            <line x1={todayX} y1={topMargin} x2={todayX} y2={chartH - 4}
              stroke={c.todayLine} strokeWidth="0.75" strokeDasharray="3 1.5" />
            <text x={todayX} y={topMargin - 4} textAnchor="middle"
              fontSize="5" fontWeight="500" fill={c.todayText}>
              Today
            </text>
          </g>
        )}

        {/* Activity rows */}
        {ordered.map((act, idx) => {
          const sa = scheduleMap.get(act.id);
          if (!sa) return null;
          const y = topMargin + idx * PRINT_ROW;
          const barY = y + (PRINT_ROW - PRINT_BAR_H) / 2;
          const x1 = toX(sa.startDate);
          const x2 = toX(sa.endDate);
          const w = Math.max(2, x2 - x1);
          const barColor =
            act.status === "complete" ? c.barComplete :
            act.status === "inProgress" ? c.barInProgress :
            c.barPlanned;
          return (
            <g key={act.id}>
              <text x={PRINT_LEFT - 4} y={y + PRINT_ROW / 2} textAnchor="end"
                dominantBaseline="central" fontSize="7" fill={c.text}>
                {act.name.length > 18 ? act.name.slice(0, 16) + "\u2026" : act.name}
              </text>
              <rect x={x1} y={barY} width={w} height={PRINT_BAR_H}
                rx={PRINT_BAR_RADIUS} fill={barColor} />
              {/* Critical path left stripe */}
              {hasCriticalPath && criticalPathIds!.has(act.id) && (
                <rect x={x1} y={barY} width={3} height={PRINT_BAR_H}
                  rx={PRINT_BAR_RADIUS} fill={c.criticalPath} />
              )}
              {w > 20 && (
                <text x={x1 + w / 2} y={barY + PRINT_BAR_H / 2} textAnchor="middle"
                  dominantBaseline="central" fontSize="6" fill="#fff" fontWeight="600">
                  {sa.duration}d
                </text>
              )}
            </g>
          );
        })}

        {/* Buffer row */}
        {showBuffer && bufferedEndDate && (
          <g>
            {(() => {
              const y = topMargin + ordered.length * PRINT_ROW;
              const barY = y + (PRINT_ROW - PRINT_BAR_H) / 2;
              const x1 = toX(projectEndDate);
              const x2 = toX(bufferedEndDate);
              const w = Math.max(2, x2 - x1);
              return (
                <>
                  <text x={PRINT_LEFT - 4} y={y + PRINT_ROW / 2} textAnchor="end"
                    dominantBaseline="central" fontSize="7" fill={c.textMuted} fontStyle="italic">
                    Buffer
                  </text>
                  <rect x={x1} y={barY} width={w} height={PRINT_BAR_H}
                    rx={PRINT_BAR_RADIUS} fill="#fbbf24" fillOpacity="0.7" stroke="#fbbf24" strokeWidth="0.5" />
                  {w > 20 && (
                    <text x={x1 + w / 2} y={barY + PRINT_BAR_H / 2} textAnchor="middle"
                      dominantBaseline="central" fontSize="6" fill="#92400e" fontWeight="600">
                      +{buffer!.bufferDays}d
                    </text>
                  )}
                </>
              );
            })()}
          </g>
        )}

        {/* Milestone markers */}
        {milestones.map((ms) => {
          const info = milestoneBuffers?.get(ms.id);
          const x = toX(ms.targetDate);
          const healthColor = info ? mc[info.health] : mc.line;
          const ds = 4;
          return (
            <g key={`ms-${ms.id}`}>
              <line x1={x} y1={topMargin - 2} x2={x} y2={topMargin + totalRows * PRINT_ROW}
                stroke={healthColor} strokeWidth="0.5" strokeDasharray="2 2" opacity={0.7} />
              <polygon
                points={`${x},${topMargin - 2 - ds} ${x + ds},${topMargin - 2} ${x},${topMargin - 2 + ds} ${x - ds},${topMargin - 2}`}
                fill={healthColor}
              />
              <text x={x} y={topMargin - 2 - ds - 10} textAnchor="middle"
                fontSize="5" fill={healthColor} fontWeight="600">
                {ms.name}
              </text>
              <text x={x} y={topMargin - 2 - ds - 4} textAnchor="middle"
                fontSize="4" fill={healthColor}>
                {formatDate(ms.targetDate)}
              </text>
            </g>
          );
        })}

        {/* Dependency arrows */}
        {dependencyMode && dependencies.map((dep, i) => {
          const fromRow = rowIndex.get(dep.fromActivityId);
          const toRow = rowIndex.get(dep.toActivityId);
          const fromSa = scheduleMap.get(dep.fromActivityId);
          const toSa = scheduleMap.get(dep.toActivityId);
          if (fromRow === undefined || toRow === undefined || !fromSa || !toSa) return null;

          const barEndX = toX(fromSa.endDate);
          const fromY = topMargin + fromRow * PRINT_ROW + PRINT_ROW / 2;
          const toStartX = toX(toSa.startDate);
          const toY = topMargin + toRow * PRINT_ROW + PRINT_ROW / 2;

          const STUB = 4;
          const stubX = barEndX + STUB;
          const endX = toStartX - PRINT_ARROW_SIZE;
          const dyAbs = Math.abs(toY - fromY);
          const dySigned = toY - fromY;

          let path: string;
          if (endX >= stubX + 6) {
            const spread = Math.max(12, dyAbs * 0.45);
            path = `M${barEndX},${fromY} L${stubX},${fromY} C${stubX + spread},${fromY} ${endX - spread},${toY} ${endX},${toY}`;
          } else {
            const loopExt = Math.max(18, dyAbs * 0.5);
            path = `M${barEndX},${fromY} L${stubX},${fromY} C${stubX + loopExt},${fromY + dySigned * 0.3} ${endX - loopExt},${toY} ${endX},${toY}`;
          }

          const isCriticalEdge = hasCriticalPath &&
            criticalPathIds!.has(dep.fromActivityId) && criticalPathIds!.has(dep.toActivityId);
          const arrowColor = isCriticalEdge ? c.criticalPath : c.arrow;
          const arrowMarker = isCriticalEdge ? "url(#print-arrowhead-critical)" : "url(#print-arrowhead)";

          return (
            <g key={`dep-${i}`}>
              <path d={path} stroke={arrowColor} strokeWidth="1" fill="none" markerEnd={arrowMarker} />
              {dep.lagDays !== 0 && (
                <text x={(barEndX + toStartX) / 2} y={(fromY + toY) / 2 - 2}
                  textAnchor="middle" fontSize="4" fill={arrowColor} fontWeight="600">
                  {dep.lagDays > 0 ? "+" : ""}{dep.lagDays}d
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-[6px] text-gray-600 print-section-keep">
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: c.barPlanned }} />
          Planned
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: c.barInProgress }} />
          In Progress
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: c.barComplete }} />
          Complete
        </span>
        {hasCriticalPath && (
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-sm"
              style={{ backgroundColor: c.barPlanned, borderLeft: `2px solid ${c.criticalPath}` }} />
            Critical Path
          </span>
        )}
        <span className="flex items-center gap-1">
          <svg width="8" height="8" className="inline-block">
            <line x1="4" y1="0" x2="4" y2="8" stroke={c.finishLine} strokeWidth="1.5" strokeDasharray="2 1" />
          </svg>
          Finish
        </span>
        {todayInRange && (
          <span className="flex items-center gap-1">
            <svg width="8" height="8" className="inline-block">
              <line x1="4" y1="0" x2="4" y2="8" stroke={c.todayLine} strokeWidth="1" strokeDasharray="1.5 0.75" />
            </svg>
            Today
          </span>
        )}
        {milestones.length > 0 && (
          <span className="flex items-center gap-1">
            <svg width="8" height="8" className="inline-block">
              <polygon points="4,0.5 7.5,4 4,7.5 0.5,4" fill={mc.diamond} />
            </svg>
            Milestone
          </span>
        )}
        <span className="ml-auto text-gray-400">
          Date prepared: {formatDate(formatDateISO(new Date()))}
        </span>
      </div>
    </section>
  );
}
