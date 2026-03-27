// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useCallback, useMemo } from "react";
import type {
  Activity,
  ActivityDependency,
  GanttAppearanceSettings,
  Milestone,
  MilestoneBufferInfo,
  ScheduledActivity,
  Calendar,
} from "@domain/models/types";
import type { WorkCalendar } from "@core/calendar/work-calendar";
import type { ScheduleBuffer } from "@core/schedule/buffer";
import { formatDateISO } from "@core/calendar/calendar";
import {
  PRINT_RIGHT, PRINT_TOP,
  PRINT_BAR_RADIUS, PRINT_ARROW_SIZE, PRINT_MIN_TICK_PX, TODAY_PROXIMITY_PX,
  PRINT_PROJECT_NAME_H, PRINT_MILESTONE_EXTRA_TOP,
  COLORS, MILESTONE_COLORS, TARGET_COLORS, TARGET_DASH_PATTERNS,
  resolveGanttAppearance,
} from "./gantt-constants";
import { dateToX, buildOrderedActivities, generateTicks, longDateLabel, computeWeekendShadingRects } from "./gantt-utils";
import type { TickLevel } from "./gantt-utils";

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
  targetFinishDate?: string | null;
  showTargetOnGantt?: boolean;
  targetRAGColor?: string;
  ganttAppearance?: GanttAppearanceSettings;
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
  calendar,
  milestones = [],
  milestoneBuffers,
  criticalPathIds,
  projectName,
  targetFinishDate,
  showTargetOnGantt,
  targetRAGColor,
  ganttAppearance,
}: PrintGanttChartProps) {
  // Resolve appearance (print is always light mode)
  const ra = resolveGanttAppearance(ganttAppearance, false);

  const c = COLORS.light;
  const mc = MILESTONE_COLORS.light;
  const tc = TARGET_COLORS.light;

  // Font size scale factor relative to default (12)
  const fontScale = ra.nameFontSize / 12;

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
  const chartH = topMargin + totalRows * ra.printRowHeight + 8;
  const areaW = chartW - ra.printLeftMargin - PRINT_RIGHT;

  const minTs = new Date(projectStartDate + "T00:00:00").getTime();
  const maxTs = new Date(endDate + "T00:00:00").getTime();
  const range = maxTs - minTs;

  const toX = useCallback(
    (d: string) => dateToX(d, minTs, range, areaW, ra.printLeftMargin),
    [minTs, range, areaW, ra.printLeftMargin],
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

  // Compute tick level — direct mapping for ranges >540 days
  const printRangeDays = range / (1000 * 60 * 60 * 24);
  const printDensityPx = Math.max(ra.timelineDensityPx, PRINT_MIN_TICK_PX);
  const tickLevel: TickLevel | undefined = useMemo(() => {
    if (printRangeDays <= 540) return undefined;
    // Dense = monthly, Normal = quarterly, Sparse = semiannual
    if (ra.timelineDensityPx <= 50) return "monthly";
    if (ra.timelineDensityPx >= 90) return "semiannual";
    return "quarterly";
  }, [printRangeDays, ra.timelineDensityPx]);

  // Ticks with suppression
  const allTicks = useMemo(
    () => generateTicks(projectStartDate, endDate, tickLevel),
    [projectStartDate, endDate, tickLevel],
  );
  const ticks = useMemo(() => {
    if (allTicks.length === 0 || range === 0) return allTicks;
    const filtered: typeof allTicks = [];
    let lastX = -Infinity;
    const PRINT_ELEMENT_PROXIMITY_PX = 25;
    const PRINT_TODAY_PROXIMITY_PX = Math.round(TODAY_PROXIMITY_PX * 0.56);
    for (let i = 0; i < allTicks.length; i++) {
      const tick = allTicks[i]!;
      const x = toX(tick.x);
      // Today proximity — all ticks (see use-gantt-layout.ts for rationale)
      if (todayX !== null && Math.abs(x - todayX) < PRINT_TODAY_PROXIMITY_PX) continue;
      if (i > 0) {
        if (Math.abs(x - finishX) < PRINT_ELEMENT_PROXIMITY_PX) continue;
        if (milestoneXPositions.some((mx) => Math.abs(x - mx) < PRINT_ELEMENT_PROXIMITY_PX)) continue;
        if (x - lastX < printDensityPx) continue;
      }
      filtered.push(tick);
      lastX = x;
    }
    return filtered;
  }, [allTicks, range, toX, finishX, milestoneXPositions, todayX, printDensityPx]);

  const hasCriticalPath = dependencyMode && criticalPathIds && criticalPathIds.size > 0;

  // Terminal activities: no successor dependency
  const terminalIds = useMemo(() => {
    if (!dependencyMode || dependencies.length === 0) return null;
    const hasSuccessor = new Set(dependencies.map(d => d.fromActivityId));
    return new Set(activities.filter(a => !hasSuccessor.has(a.id)).map(a => a.id));
  }, [dependencyMode, dependencies, activities]);
  const hasTerminals = terminalIds !== null && terminalIds.size > 0;

  // Weekend / non-work day shading rects
  const weekendShadingRects = useMemo(() => {
    if (!ra.weekendShading || range === 0) return [];
    if (!calendar || !('isWorkDay' in calendar)) return [];
    // Skip when day width is too small for print
    const dayWidth = areaW / (range / (1000 * 60 * 60 * 24));
    if (dayWidth < 1.5) return [];
    return computeWeekendShadingRects(
      calendar as WorkCalendar, projectStartDate, endDate,
      minTs, range, areaW, ra.printLeftMargin, 0.5,
    );
  }, [ra.weekendShading, range, calendar, projectStartDate, endDate, minTs, areaW, ra.printLeftMargin]);

  // Bar label helper
  const barLabelText = useCallback((sa: ScheduledActivity): string | null => {
    if (ra.barLabel === "duration") return `${sa.duration}d`;
    if (ra.barLabel === "dates") return formatDate(sa.endDate);
    return null;
  }, [ra.barLabel, formatDate]);

  // Scaled font sizes
  const fs7 = Math.round(7 * fontScale);
  const fs5 = Math.round(5 * fontScale);
  const fs4 = Math.round(4 * fontScale);

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
          {/* Buffer hatching pattern */}
          <pattern id="print-hatch-buffer" patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="4" stroke={c.hatchBuffer} strokeWidth="2" />
          </pattern>
          {/* Activity hatching patterns */}
          <pattern id="print-hatch-planned" patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(45)">
            <rect width="4" height="4" fill="white" fillOpacity="0.3" />
            <line x1="0" y1="0" x2="0" y2="4" stroke={ra.barPlanned} strokeWidth="2" strokeOpacity="0.4" />
          </pattern>
          <pattern id="print-hatch-inprogress" patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(45)">
            <rect width="4" height="4" fill="white" fillOpacity="0.3" />
            <line x1="0" y1="0" x2="0" y2="4" stroke={ra.barInProgress} strokeWidth="2" strokeOpacity="0.4" />
          </pattern>
          {hasCriticalPath && (
            <marker id="print-arrowhead-critical" markerUnits="userSpaceOnUse"
              markerWidth={PRINT_ARROW_SIZE} markerHeight={PRINT_ARROW_SIZE}
              refX="0" refY={PRINT_ARROW_SIZE / 2} orient="auto">
              <polygon
                points={`0 0, ${PRINT_ARROW_SIZE} ${PRINT_ARROW_SIZE / 2}, 0 ${PRINT_ARROW_SIZE}`}
                fill={ra.criticalPath}
              />
            </marker>
          )}
        </defs>

        {/* Weekend / non-work day shading — first layer */}
        {weekendShadingRects.map((rect, i) => (
          <rect
            key={`shade-${i}`}
            x={rect.x}
            y={topMargin}
            width={rect.width}
            height={chartH - topMargin - 4}
            fill="rgba(0,0,0,0.04)"
          />
        ))}

        {/* Project name header */}
        {projectName && (
          <text x={8} y={PRINT_PROJECT_NAME_H - 4} textAnchor="start"
            fontSize="10" fontWeight="700" fill={c.text}>
            {projectName.length > 80 ? projectName.slice(0, 78) + "\u2026" : projectName}
          </text>
        )}

        {/* Tick grid lines (all ticks, including label-suppressed) */}
        {allTicks.map((tick, i) => {
          const x = toX(tick.x);
          return (
            <line key={`grid-${i}`} x1={x} y1={topMargin} x2={x} y2={chartH - 4}
              stroke={c.gridLine} strokeWidth="0.5" />
          );
        })}
        {/* Tick labels (only where spacing permits) */}
        {ticks.map((tick, i) => {
          const x = toX(tick.x);
          const hasYear = tick.label.includes("'") || /^\d{4}$/.test(tick.label);
          return (
            <text key={`label-${i}`} x={x} y={topMargin - 4} textAnchor="middle"
              fontSize={fs5} fill={c.textMuted} fontWeight={hasYear ? "bold" : undefined}>
              {tick.label}
            </text>
          );
        })}

        {/* Finish line */}
        {range > 0 && (
          <g>
            <line x1={finishX} y1={topMargin} x2={finishX} y2={chartH - 4}
              stroke={c.finishLine} strokeWidth="1" strokeDasharray="4 2" />
            <text x={finishX} y={topMargin - 4} textAnchor="middle"
              fontSize={fs5} fontWeight="600" fill={c.finishText}>
              {longDateLabel(finishDate)}
            </text>
          </g>
        )}

        {/* Today line */}
        {todayX !== null && (
          <g>
            <line x1={todayX} y1={topMargin} x2={todayX} y2={chartH - 4}
              stroke={c.todayLine} strokeWidth="0.75" strokeDasharray="3 1.5" />
            <text x={todayX} y={topMargin - 9} textAnchor="middle"
              fontSize={fs5} fontWeight="500" fill={c.todayText}>
              Today
            </text>
            <text x={todayX} y={topMargin - 3} textAnchor="middle"
              fontSize={fs4} fill={c.todayText}>
              {formatDate(todayStr)}
            </text>
          </g>
        )}

        {/* Finish Target line */}
        {showTargetOnGantt && targetFinishDate && range > 0 && (() => {
          const targetX = toX(targetFinishDate);
          if (targetX < ra.printLeftMargin || targetX > ra.printLeftMargin + areaW) return null;
          const ragKey = targetRAGColor ?? "gray";
          const color = tc[ragKey as keyof typeof tc] ?? tc.gray;
          const dash = TARGET_DASH_PATTERNS[ragKey] ?? TARGET_DASH_PATTERNS.gray;
          return (
            <g>
              <line x1={targetX} y1={topMargin} x2={targetX} y2={chartH - 4}
                stroke={color} strokeWidth="0.75" strokeDasharray={dash} />
              <text x={targetX} y={topMargin - 11} textAnchor="middle"
                fontSize={fs5} fontWeight="500" fill={color}>
                Target
              </text>
            </g>
          );
        })()}

        {/* Dependency arrows — rendered before bars so bars paint on top */}
        {dependencyMode && dependencies.map((dep, i) => {
          const fromRow = rowIndex.get(dep.fromActivityId);
          const toRow = rowIndex.get(dep.toActivityId);
          const fromSa = scheduleMap.get(dep.fromActivityId);
          const toSa = scheduleMap.get(dep.toActivityId);
          if (fromRow === undefined || toRow === undefined || !fromSa || !toSa) return null;

          const fromDate = dep.type === "SS" ? fromSa.startDate : fromSa.endDate;
          const toDate = dep.type === "FF" ? toSa.endDate : toSa.startDate;
          const barEndX = toX(fromDate);
          const fromY = topMargin + fromRow * ra.printRowHeight + ra.printRowHeight / 2;
          const toStartX = toX(toDate);
          const toY = topMargin + toRow * ra.printRowHeight + ra.printRowHeight / 2;

          const STUB = 4;
          const stubX = barEndX + STUB;
          const dyAbs = Math.abs(toY - fromY);
          const dySigned = toY - fromY;

          let path: string;
          if (dep.type === "FF") {
            const endX = toStartX + PRINT_ARROW_SIZE;
            const rightX = Math.max(stubX, endX) + Math.max(10, dyAbs * 0.3);
            path = `M${barEndX},${fromY} L${stubX},${fromY} C${rightX},${fromY} ${rightX},${toY} ${endX},${toY}`;
          } else {
            const endX = toStartX - PRINT_ARROW_SIZE;
            if (endX >= stubX + 6) {
              const spread = Math.max(12, dyAbs * 0.45);
              path = `M${barEndX},${fromY} L${stubX},${fromY} C${stubX + spread},${fromY} ${endX - spread},${toY} ${endX},${toY}`;
            } else {
              const loopExt = Math.max(18, dyAbs * 0.5);
              path = `M${barEndX},${fromY} L${stubX},${fromY} C${stubX + loopExt},${fromY + dySigned * 0.3} ${endX - loopExt},${toY} ${endX},${toY}`;
            }
          }

          const isCriticalEdge = hasCriticalPath &&
            criticalPathIds!.has(dep.fromActivityId) && criticalPathIds!.has(dep.toActivityId);
          const arrowColor = isCriticalEdge ? ra.criticalPath : c.arrow;
          const arrowMarker = isCriticalEdge ? "url(#print-arrowhead-critical)" : "url(#print-arrowhead)";

          return (
            <g key={`dep-${i}`}>
              <path d={path} stroke={arrowColor} strokeWidth="1" fill="none" markerEnd={arrowMarker} />
              {dep.lagDays !== 0 && (
                <text x={(barEndX + toStartX) / 2} y={(fromY + toY) / 2 - 2}
                  textAnchor="middle" fontSize={fs4} fill={arrowColor} fontWeight="600">
                  {dep.lagDays > 0 ? "+" : ""}{dep.lagDays}d
                </text>
              )}
            </g>
          );
        })}

        {/* Activity rows */}
        {ordered.map((act, idx) => {
          const sa = scheduleMap.get(act.id);
          if (!sa) return null;
          const y = topMargin + idx * ra.printRowHeight;
          const barY = y + (ra.printRowHeight - ra.printBarHeight) / 2;
          const x1 = toX(sa.startDate);
          const x2 = toX(sa.endDate);
          const w = Math.max(2, x2 - x1);
          const barColor =
            act.status === "complete" ? ra.barComplete :
            act.status === "inProgress" ? ra.barInProgress :
            ra.barPlanned;
          return (
            <g key={act.id}>
              <text x={ra.printLeftMargin - 4} y={y + ra.printRowHeight / 2} textAnchor="end"
                dominantBaseline="central" fontSize={fs7} fill={c.text}>
                {act.name.length > ra.printNameCharLimit ? act.name.slice(0, ra.printNameCharLimit - 2) + "\u2026" : act.name}
              </text>
              <rect x={x1} y={barY} width={w} height={ra.printBarHeight}
                rx={PRINT_BAR_RADIUS} fill={barColor} />
              {/* Critical path left stripe */}
              {hasCriticalPath && criticalPathIds!.has(act.id) && (
                <rect x={x1} y={barY} width={3} height={ra.printBarHeight}
                  rx={PRINT_BAR_RADIUS} fill={ra.criticalPath} />
              )}
              {/* Terminal activity right stripe */}
              {hasTerminals && terminalIds!.has(act.id) && (
                <rect x={x1 + w - 3} y={barY} width={3} height={ra.printBarHeight}
                  rx={PRINT_BAR_RADIUS} fill={c.terminal} />
              )}
              {(() => {
                const label = barLabelText(sa);
                if (!label) return null;
                const estWidth = label.length * ra.printBarLabelFontSize * 0.6 + 4;
                if (estWidth > w) return null;
                return (
                  <text x={x1 + w / 2} y={barY + ra.printBarHeight / 2} textAnchor="middle"
                    dominantBaseline="central" fontSize={ra.printBarLabelFontSize} fill="#fff" fontWeight="600">
                    {label}
                  </text>
                );
              })()}
              {/* Constraint indicator */}
              {act.constraintType && (() => {
                const isStart = act.constraintType === "MSO" || act.constraintType === "SNET" || act.constraintType === "SNLT";
                const iconX = isStart ? x1 - 1 : x1 + w - 4;
                return (
                  <rect x={iconX} y={barY - 2} width={5} height={5} rx={1}
                    fill={act.constraintMode === "hard" ? "#3b82f6" : "#9ca3af"}
                    opacity={act.constraintMode === "soft" ? 0.5 : 0.9} />
                );
              })()}
            </g>
          );
        })}

        {/* Buffer row */}
        {showBuffer && bufferedEndDate && (
          <g>
            {(() => {
              const y = topMargin + ordered.length * ra.printRowHeight;
              const barY = y + (ra.printRowHeight - ra.printBarHeight) / 2;
              const x1 = toX(projectEndDate);
              const x2 = toX(bufferedEndDate);
              const w = Math.max(2, x2 - x1);
              return (
                <>
                  <text x={ra.printLeftMargin - 4} y={y + ra.printRowHeight / 2} textAnchor="end"
                    dominantBaseline="central" fontSize={fs7} fill={c.textMuted} fontStyle="italic">
                    Schedule Buffer
                  </text>
                  <rect x={x1} y={barY} width={w} height={ra.printBarHeight}
                    rx={PRINT_BAR_RADIUS} fill="url(#print-hatch-buffer)" stroke={c.hatchBuffer} strokeWidth="0.5" />
                  {(() => {
                    const bufLabel = `+${buffer!.bufferDays}d`;
                    const bufFontSize = Math.min(ra.printBarLabelFontSize + 1, ra.printBarHeight - 4);
                    const estW = bufLabel.length * bufFontSize * 0.6 + 4;
                    if (estW > w) return null;
                    return (
                      <text x={x1 + w / 2} y={barY + ra.printBarHeight / 2} textAnchor="middle"
                        dominantBaseline="central" fontSize={bufFontSize} fill="#92400e" fontWeight="600"
                        stroke="#ffffff" strokeWidth="1.5" paintOrder="stroke fill">
                        {bufLabel}
                      </text>
                    );
                  })()}
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
              <line x1={x} y1={topMargin - 2} x2={x} y2={topMargin + totalRows * ra.printRowHeight}
                stroke={healthColor} strokeWidth="0.5" strokeDasharray="2 2" opacity={0.7} />
              <polygon
                points={`${x},${topMargin - 2 - ds} ${x + ds},${topMargin - 2} ${x},${topMargin - 2 + ds} ${x - ds},${topMargin - 2}`}
                fill={healthColor}
              />
              <text x={x} y={topMargin - 2 - ds - 10} textAnchor="middle"
                fontSize={fs5} fill={healthColor} fontWeight="600">
                {ms.name}
              </text>
              <text x={x} y={topMargin - 2 - ds - 4} textAnchor="middle"
                fontSize={fs4} fill={healthColor}>
                {formatDate(ms.targetDate)}
              </text>
            </g>
          );
        })}

      </svg>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-[6px] text-gray-600 print-section-keep">
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: ra.barComplete }} />
          Complete
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: ra.barInProgress }} />
          In Progress
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: ra.barPlanned }} />
          Planned
        </span>
        {hasCriticalPath && (
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-sm"
              style={{ backgroundColor: ra.barPlanned, borderLeft: `2px solid ${ra.criticalPath}` }} />
            Critical Path
          </span>
        )}
        {hasTerminals && (
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-sm"
              style={{ backgroundColor: ra.barPlanned, borderRight: `2px solid ${c.terminal}` }} />
            Terminal
          </span>
        )}
        {todayInRange && (
          <span className="flex items-center gap-1">
            <svg width="8" height="8" className="inline-block">
              <line x1="4" y1="0" x2="4" y2="8" stroke={c.todayLine} strokeWidth="1" strokeDasharray="1.5 0.75" />
            </svg>
            Today
          </span>
        )}
        <span className="flex items-center gap-1">
          <svg width="8" height="8" className="inline-block">
            <line x1="4" y1="0" x2="4" y2="8" stroke={c.finishLine} strokeWidth="1.5" strokeDasharray="2 1" />
          </svg>
          Finish
        </span>
        {showTargetOnGantt && targetFinishDate && (() => {
          const ragKey = targetRAGColor ?? "gray";
          const color = tc[ragKey as keyof typeof tc] ?? tc.gray;
          const dash = TARGET_DASH_PATTERNS[ragKey] ?? TARGET_DASH_PATTERNS.gray;
          return (
            <span className="flex items-center gap-1">
              <svg width="8" height="8" className="inline-block">
                <line x1="4" y1="0" x2="4" y2="8" stroke={color} strokeWidth="1" strokeDasharray={dash} />
              </svg>
              Target
            </span>
          );
        })()}
        {milestones.length > 0 && (
          <span className="flex items-center gap-1">
            <svg width="8" height="8" className="inline-block">
              <polygon points="4,0.5 7.5,4 4,7.5 0.5,4" fill={mc.diamond} />
            </svg>
            Milestone
          </span>
        )}
        {ra.weekendShading && (
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-sm border border-gray-300" style={{ backgroundColor: "rgba(0,0,0,0.04)" }} />
            Non-work day
          </span>
        )}
        <span className="ml-auto text-gray-400">
          Date prepared: {formatDate(formatDateISO(new Date()))}
        </span>
      </div>
    </section>
  );
}
