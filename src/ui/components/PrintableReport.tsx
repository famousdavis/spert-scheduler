// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useMemo } from "react";
import type {
  Project,
  Scenario,
  Calendar,
  DeterministicSchedule,
  ScheduledActivity,
  MilestoneBufferInfo,
} from "@domain/models/types";
import type { ScheduleBuffer } from "@core/schedule/buffer";
import { STANDARD_PERCENTILES } from "@domain/models/types";
import {
  parseDateISO,
  addWorkingDays,
  formatDateISO,
} from "@core/calendar/calendar";
import {
  PRINT_LEFT, PRINT_RIGHT, PRINT_TOP, PRINT_ROW, PRINT_BAR_H,
  PRINT_BAR_RADIUS, PRINT_ARROW_SIZE, PRINT_MIN_TICK_PX,
  PRINT_PROJECT_NAME_H, PRINT_MILESTONE_EXTRA_TOP,
  COLORS, MILESTONE_COLORS,
} from "@ui/charts/gantt-constants";
import { dateToX, buildOrderedActivities, generateTicks, longDateLabel } from "@ui/charts/gantt-utils";
import { useDateFormat } from "@ui/hooks/use-date-format";
import { distributionLabel, statusLabel } from "@ui/helpers/format-labels";
import { RSM_LABELS } from "@domain/models/types";

interface PrintableReportProps {
  project: Project;
  scenario: Scenario;
  schedule: DeterministicSchedule | null;
  scheduledActivities: ScheduledActivity[];
  buffer: ScheduleBuffer | null;
  milestoneBuffers?: Map<string, MilestoneBufferInfo> | null;
  calendar?: Calendar;
  criticalPathIds?: Set<string> | null;
}

export function PrintableReport({
  project,
  scenario,
  schedule,
  scheduledActivities,
  buffer,
  milestoneBuffers,
  calendar,
  criticalPathIds,
}: PrintableReportProps) {
  const formatDate = useDateFormat();
  const actPct = Math.round(scenario.settings.probabilityTarget * 100);
  const projPct = Math.round(scenario.settings.projectProbabilityTarget * 100);
  const simulationResults = scenario.simulationResults;

  // Compute buffered finish date
  const bufferedEndDate =
    schedule && buffer && buffer.bufferDays > 0
      ? formatDateISO(
          addWorkingDays(
            parseDateISO(schedule.projectEndDate),
            buffer.bufferDays,
            calendar
          )
        )
      : null;

  return (
    <div className="print-report hidden print:block bg-white text-black p-4 text-xs">
      {/* Header */}
      <div className="border-b-2 border-gray-800 pb-2 mb-3">
        <h1 className="text-xl font-bold">{project.name}</h1>
        <p className="text-gray-600 text-xs">Scenario: {scenario.name}</p>
        <p className="text-[10px] text-gray-500 mt-0.5">
          Generated: {formatDate(formatDateISO(new Date()))}
        </p>
      </div>

      {/* Summary Section */}
      <section className="mb-3 print-section-keep">
        <h2 className="text-base font-semibold border-b border-gray-300 pb-1 mb-2">
          Project Summary
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <table className="w-full text-xs">
              <tbody>
                <tr>
                  <td className="py-0.5 text-gray-600">Start Date:</td>
                  <td className="py-0.5 font-medium">{formatDate(scenario.startDate)}</td>
                </tr>
                <tr>
                  <td className="py-0.5 text-gray-600">Finish (w/o Buffer):</td>
                  <td className="py-0.5 font-medium">
                    {schedule ? formatDate(schedule.projectEndDate) : "—"}
                  </td>
                </tr>
                <tr>
                  <td className="py-0.5 text-gray-600">Finish (w/Buffer):</td>
                  <td className="py-0.5 font-medium">
                    {bufferedEndDate ? formatDate(bufferedEndDate) : "—"}
                  </td>
                </tr>
                <tr>
                  <td className="py-0.5 text-gray-600">Duration:</td>
                  <td className="py-0.5 font-medium">
                    {schedule ? `${schedule.totalDurationDays} working days` : "—"}
                  </td>
                </tr>
                <tr>
                  <td className="py-0.5 text-gray-600">Duration (w/Buffer):</td>
                  <td className="py-0.5 font-medium">
                    {schedule && buffer && buffer.bufferDays > 0
                      ? `${schedule.totalDurationDays + buffer.bufferDays} working days`
                      : "—"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div>
            <table className="w-full text-xs">
              <tbody>
                <tr>
                  <td className="py-0.5 text-gray-600">Activity Target:</td>
                  <td className="py-0.5 font-medium">P{actPct}</td>
                </tr>
                <tr>
                  <td className="py-0.5 text-gray-600">Project Target:</td>
                  <td className="py-0.5 font-medium">P{projPct}</td>
                </tr>
                <tr>
                  <td className="py-0.5 text-gray-600">Schedule Buffer:</td>
                  <td className="py-0.5 font-medium">
                    {buffer
                      ? `${buffer.bufferDays > 0 ? "+" : ""}${buffer.bufferDays} days`
                      : "—"}
                  </td>
                </tr>
                <tr>
                  <td className="py-0.5 text-gray-600">Simulation Trials:</td>
                  <td className="py-0.5 font-medium">
                    {scenario.settings.trialCount.toLocaleString()}
                  </td>
                </tr>
                <tr>
                  <td className="py-0.5 text-gray-600">RNG Seed:</td>
                  <td className="py-0.5 font-mono text-[9px]">
                    {scenario.settings.rngSeed.slice(0, 16)}...
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Activity Table */}
      <section className="mb-3">
        <h2 className="text-base font-semibold border-b border-gray-300 pb-1 mb-2">
          Activities ({scenario.activities.length})
        </h2>
        <table className="w-full text-[9px] border-collapse">
          <thead>
            <tr className="border-b-2 border-gray-400 text-left">
              <th className="py-1 pr-1">#</th>
              <th className="py-1 pr-1">Name</th>
              <th className="py-1 pr-1 text-center">Dur.</th>
              <th className="py-1 pr-1">Start</th>
              <th className="py-1 pr-1">Finish</th>
              <th className="py-1 pr-1 text-center">Min</th>
              <th className="py-1 pr-1 text-center">ML</th>
              <th className="py-1 pr-1 text-center">Max</th>
              <th className="py-1 pr-1">Confidence</th>
              <th className="py-1 pr-1">Distribution</th>
              <th className="py-1">Status</th>
            </tr>
          </thead>
          <tbody>
            {scenario.activities.map((activity, idx) => {
              const scheduled = scheduledActivities.find(
                (s) => s.activityId === activity.id
              );
              return (
                <tr key={activity.id} className="border-b border-gray-200">
                  <td className="py-0.5 pr-1 text-gray-500">{idx + 1}</td>
                  <td className="py-0.5 pr-1 font-medium">{activity.name}</td>
                  <td className="py-0.5 pr-1 text-center tabular-nums font-medium">
                    {scheduled ? `${Math.round(scheduled.duration)}d` : "—"}
                  </td>
                  <td className="py-0.5 pr-1 tabular-nums">
                    {scheduled ? formatDate(scheduled.startDate) : "—"}
                  </td>
                  <td className="py-0.5 pr-1 tabular-nums">
                    {scheduled ? formatDate(scheduled.endDate) : "—"}
                  </td>
                  <td className="py-0.5 pr-1 text-center tabular-nums">
                    {activity.min}
                  </td>
                  <td className="py-0.5 pr-1 text-center tabular-nums">
                    {activity.mostLikely}
                  </td>
                  <td className="py-0.5 pr-1 text-center tabular-nums">
                    {activity.max}
                  </td>
                  <td className="py-0.5 pr-1">
                    {RSM_LABELS[activity.confidenceLevel]}
                  </td>
                  <td className="py-0.5 pr-1">
                    {distributionLabel(activity.distributionType)}
                  </td>
                  <td className="py-0.5">
                    {statusLabel(activity.status)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* Dependencies (when dependency mode is on) */}
      {scenario.settings.dependencyMode && scenario.dependencies.length > 0 && (
        <section className="mb-3">
          <h2 className="text-base font-semibold border-b border-gray-300 pb-1 mb-2">
            Dependencies ({scenario.dependencies.length})
          </h2>
          <table className="w-full text-[9px] border-collapse">
            <thead>
              <tr className="border-b-2 border-gray-400 text-left">
                <th className="py-1 pr-1">#</th>
                <th className="py-1 pr-1">Predecessor</th>
                <th className="py-1 pr-1 text-center">→</th>
                <th className="py-1 pr-1">Successor</th>
                <th className="py-1 pr-1 text-center">Type</th>
                <th className="py-1">Lag (days)</th>
              </tr>
            </thead>
            <tbody>
              {scenario.dependencies.map((dep, idx) => {
                const fromName =
                  scenario.activities.find((a) => a.id === dep.fromActivityId)
                    ?.name ?? "Unknown";
                const toName =
                  scenario.activities.find((a) => a.id === dep.toActivityId)
                    ?.name ?? "Unknown";
                return (
                  <tr key={idx} className="border-b border-gray-200">
                    <td className="py-0.5 pr-1 text-gray-500">{idx + 1}</td>
                    <td className="py-0.5 pr-1 font-medium">{fromName}</td>
                    <td className="py-0.5 pr-1 text-center text-gray-400">→</td>
                    <td className="py-0.5 pr-1 font-medium">{toName}</td>
                    <td className="py-0.5 pr-1 text-center">{dep.type}</td>
                    <td className="py-0.5 tabular-nums">
                      {dep.lagDays !== 0
                        ? `${dep.lagDays > 0 ? "+" : ""}${dep.lagDays}`
                        : "0"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {/* Milestones (when dependency mode is on and milestones exist) */}
      {scenario.settings.dependencyMode && scenario.milestones.length > 0 && (
        <section className="mb-3 print-section-keep">
          <h2 className="text-base font-semibold border-b border-gray-300 pb-1 mb-2">
            Milestones ({scenario.milestones.length})
          </h2>
          <table className="w-full text-[9px] border-collapse">
            <thead>
              <tr className="border-b-2 border-gray-400 text-left">
                <th className="py-1 pr-1">#</th>
                <th className="py-1 pr-1">Name</th>
                <th className="py-1 pr-1">Target Date</th>
                <th className="py-1 pr-1 text-center">Buffer</th>
                <th className="py-1 pr-1 text-center">Slack</th>
                <th className="py-1">Health</th>
              </tr>
            </thead>
            <tbody>
              {scenario.milestones.map((ms, idx) => {
                const info = milestoneBuffers?.get(ms.id);
                return (
                  <tr key={ms.id} className="border-b border-gray-200">
                    <td className="py-0.5 pr-1 text-gray-500">{idx + 1}</td>
                    <td className="py-0.5 pr-1 font-medium">{ms.name}</td>
                    <td className="py-0.5 pr-1 tabular-nums">{formatDate(ms.targetDate)}</td>
                    <td className="py-0.5 pr-1 text-center tabular-nums">
                      {info?.bufferDays !== null && info?.bufferDays !== undefined ? `${info.bufferDays}d` : "—"}
                    </td>
                    <td className="py-0.5 pr-1 text-center tabular-nums">
                      {info?.slackDays !== null && info?.slackDays !== undefined
                        ? `${info.slackDays >= 0 ? "+" : ""}${info.slackDays}d`
                        : "—"}
                    </td>
                    <td className="py-0.5">
                      {info ? (
                        <span className={
                          info.health === "green" ? "text-green-700" :
                          info.health === "amber" ? "text-amber-700" :
                          "text-red-700 font-medium"
                        }>
                          {info.health === "green" ? "On Track" : info.health === "amber" ? "Warning" : "At Risk"}
                        </span>
                      ) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {/* Gantt Chart (print-friendly) */}
      {schedule && scheduledActivities.length > 0 && (
        <PrintGanttChart
          activities={scenario.activities}
          scheduledActivities={scheduledActivities}
          projectStartDate={scenario.startDate}
          projectEndDate={schedule.projectEndDate}
          buffer={buffer}
          dependencies={scenario.dependencies}
          dependencyMode={scenario.settings.dependencyMode}
          activityTarget={scenario.settings.probabilityTarget}
          projectTarget={scenario.settings.projectProbabilityTarget}
          calendar={calendar}
          bufferedEndDate={bufferedEndDate}
          formatDate={formatDate}
          milestones={scenario.milestones}
          milestoneBuffers={milestoneBuffers}
          criticalPathIds={criticalPathIds}
          projectName={project.name}
        />
      )}

      {/* Simulation Results */}
      {simulationResults && (
        <section className="mb-3 print-section-keep">
          <h2 className="text-base font-semibold border-b border-gray-300 pb-1 mb-2">
            Monte Carlo Simulation Results
          </h2>
          <div className="grid grid-cols-2 gap-4">
            {/* Statistics */}
            <div>
              <h3 className="font-medium mb-1 text-xs">Statistics</h3>
              <table className="w-full text-xs">
                <tbody>
                  <tr>
                    <td className="py-0.5 text-gray-600">Mean:</td>
                    <td className="py-0.5 font-medium tabular-nums">
                      {simulationResults.mean.toFixed(2)} days
                    </td>
                  </tr>
                  <tr>
                    <td className="py-0.5 text-gray-600">Standard Deviation:</td>
                    <td className="py-0.5 font-medium tabular-nums">
                      {simulationResults.standardDeviation.toFixed(2)} days
                    </td>
                  </tr>
                  <tr>
                    <td className="py-0.5 text-gray-600">Min:</td>
                    <td className="py-0.5 font-medium tabular-nums">
                      {simulationResults.minSample.toFixed(2)} days
                    </td>
                  </tr>
                  <tr>
                    <td className="py-0.5 text-gray-600">Max:</td>
                    <td className="py-0.5 font-medium tabular-nums">
                      {simulationResults.maxSample.toFixed(2)} days
                    </td>
                  </tr>
                  <tr>
                    <td className="py-0.5 text-gray-600">Trial Count:</td>
                    <td className="py-0.5 font-medium tabular-nums">
                      {simulationResults.trialCount.toLocaleString()}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Percentiles */}
            <div>
              <h3 className="font-medium mb-1 text-xs">Percentiles</h3>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-gray-300">
                    <th className="py-0.5 text-left text-gray-600">Percentile</th>
                    <th className="py-0.5 text-right text-gray-600">Duration (days)</th>
                  </tr>
                </thead>
                <tbody>
                  {STANDARD_PERCENTILES.map((p) => {
                    const isTarget = p === projPct;
                    return (
                      <tr
                        key={p}
                        className={`border-b border-gray-100 ${
                          isTarget ? "bg-gray-100 font-semibold" : ""
                        }`}
                      >
                        <td className="py-0.5">
                          P{p}
                          {isTarget && (
                            <span className="ml-1 text-[9px]">(Target)</span>
                          )}
                        </td>
                        <td className="py-0.5 text-right tabular-nums">
                          {simulationResults.percentiles[p]?.toFixed(1) ?? "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="mt-4 pt-2 border-t border-gray-300 text-[9px] text-gray-500">
        <p>
          Generated by SPERT Scheduler • Statistical PERT Monte Carlo Simulation
        </p>
      </footer>
    </div>
  );
}

// --- Print-only Gantt Chart (full parity with interactive, deterministic view) ---

interface PrintGanttChartProps {
  activities: import("@domain/models/types").Activity[];
  scheduledActivities: ScheduledActivity[];
  projectStartDate: string;
  projectEndDate: string;
  buffer: ScheduleBuffer | null;
  dependencies: import("@domain/models/types").ActivityDependency[];
  dependencyMode: boolean;
  activityTarget: number;
  projectTarget: number;
  calendar?: import("@domain/models/types").Calendar;
  bufferedEndDate: string | null;
  formatDate: (iso: string) => string;
  milestones?: import("@domain/models/types").Milestone[];
  milestoneBuffers?: Map<string, MilestoneBufferInfo> | null;
  criticalPathIds?: Set<string> | null;
  projectName?: string;
}

function PrintGanttChart({
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
  let endDate = bufferedEndDate ?? projectEndDate;
  if (milestones) {
    for (const ms of milestones) {
      if (ms.targetDate > endDate) endDate = ms.targetDate;
    }
  }

  // Dynamic top margin
  let topMargin = PRINT_TOP;
  if (projectName) topMargin += PRINT_PROJECT_NAME_H;
  if (milestones.length > 0) topMargin += PRINT_MILESTONE_EXTRA_TOP;

  const totalRows = ordered.length + (showBuffer ? 1 : 0);
  const chartW = 700;
  const chartH = topMargin + totalRows * PRINT_ROW + 8;
  const areaW = chartW - PRINT_LEFT - PRINT_RIGHT;

  const minTs = new Date(projectStartDate + "T00:00:00").getTime();
  const maxTs = new Date(endDate + "T00:00:00").getTime();
  const range = maxTs - minTs;

  const toX = (d: string) => dateToX(d, minTs, range, areaW, PRINT_LEFT);

  // Finish line
  const finishDate = bufferedEndDate ?? projectEndDate;
  const finishX = toX(finishDate);

  // Today line
  const todayStr = formatDateISO(new Date());
  const todayInRange = range > 0 && todayStr >= projectStartDate && todayStr <= endDate;
  const todayX = todayInRange ? toX(todayStr) : null;

  // Milestone X positions for tick suppression
  const milestoneXPositions = milestones.map((m) => toX(m.targetDate));

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
  }, [allTicks, range, finishX, milestoneXPositions, todayX]);

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
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-[6px] text-gray-600">
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
      </div>
    </section>
  );
}
