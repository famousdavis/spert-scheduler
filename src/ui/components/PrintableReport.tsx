// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import type {
  Project,
  Scenario,
  Calendar,
  DeterministicSchedule,
  ScheduledActivity,
  MilestoneBufferInfo,
} from "@domain/models/types";
import type { WorkCalendar } from "@core/calendar/work-calendar";
import type { ScheduleBuffer } from "@core/schedule/buffer";
import { APP_VERSION } from "@app/constants";
import {
  formatDateISO,
  durationToFinishDateISO,
} from "@core/calendar/calendar";
import { useDateFormat } from "@ui/hooks/use-date-format";
import { PrintGanttChart } from "@ui/charts/PrintGanttChart";
import {
  PrintSummarySection,
  PrintActivityTable,
  PrintDescriptionsTable,
  PrintDependenciesTable,
  PrintConstraintsTable,
  PrintItemTable,
  PrintMilestonesTable,
  PrintSimulationResultsSection,
} from "./print-sections";

interface PrintableReportProps {
  project: Project;
  scenario: Scenario;
  schedule: DeterministicSchedule | null;
  scheduledActivities: ScheduledActivity[];
  buffer: ScheduleBuffer | null;
  milestoneBuffers?: Map<string, MilestoneBufferInfo> | null;
  calendar?: WorkCalendar | Calendar;
  criticalPathIds?: Set<string> | null;
  targetRAGColor?: string;
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
  targetRAGColor,
}: PrintableReportProps) {
  const formatDate = useDateFormat();
  const projPct = Math.round(scenario.settings.projectProbabilityTarget * 100);
  const simulationResults = scenario.simulationResults;

  // Buffered finish date, sourced from the MC project-target percentile (agrees with
  // the Percentile Summary by construction). Text surfaces show it whenever a buffer
  // exists — including negative/zero buffers (§7). The print Gantt gets a guarded
  // value: it draws a buffer bar only for a positive buffer (matching the interactive
  // chart), and an unguarded negative value would end the timeline before the last bar.
  const bufferedEndDate = buffer
    ? durationToFinishDateISO(scenario.startDate, buffer.projectTargetDuration, calendar)
    : null;
  const ganttBufferedEndDate = buffer && buffer.bufferDays > 0 ? bufferedEndDate : null;

  return (
    <div className="print-report hidden print:block bg-white text-black p-4 text-xs">
      {/* Header */}
      <div className="border-b-2 border-gray-800 pb-2 mb-3">
        <p className="text-[9px] text-gray-400 tracking-wide uppercase mb-0.5">
          SPERT<span className="text-[6px] align-super">®</span> Scheduler v{APP_VERSION}
        </p>
        <h1 className="text-xl font-bold">{project.name}</h1>
        <p className="text-gray-600 text-xs">Scenario: {scenario.name}</p>
        <p className="text-[10px] text-gray-500 mt-0.5">
          Generated: {formatDate(formatDateISO(new Date()))}
        </p>
      </div>

      <PrintSummarySection
        project={project}
        scenario={scenario}
        schedule={schedule}
        buffer={buffer}
        bufferedEndDate={bufferedEndDate}
        formatDate={formatDate}
      />

      <PrintActivityTable
        scenario={scenario}
        scheduledActivities={scheduledActivities}
        formatDate={formatDate}
      />

      <PrintDescriptionsTable scenario={scenario} />

      <PrintDependenciesTable scenario={scenario} />

      <PrintConstraintsTable scenario={scenario} formatDate={formatDate} />

      <PrintItemTable
        scenario={scenario}
        sectionTitle="Activity Tasks"
        itemLabel="Task"
        itemStatusLabel="Status"
        getItems={(a) => a.checklist}
      />
      <PrintItemTable
        scenario={scenario}
        sectionTitle="Activity Deliverables"
        itemLabel="Deliverable"
        itemStatusLabel="Delivered"
        getItems={(a) => a.deliverables}
      />

      <PrintMilestonesTable
        scenario={scenario}
        milestoneBuffers={milestoneBuffers}
        formatDate={formatDate}
      />

      {/* Gantt Chart (print-friendly) */}
      {schedule && scheduledActivities.length > 0 && (
        <PrintGanttChart
          activities={scenario.activities}
          bands={scenario.bands ?? []}
          scheduledActivities={scheduledActivities}
          projectStartDate={scenario.startDate}
          projectEndDate={schedule.projectEndDate}
          buffer={buffer}
          dependencies={scenario.dependencies}
          dependencyMode={scenario.settings.dependencyMode}
          activityTarget={scenario.settings.probabilityTarget}
          projectTarget={scenario.settings.projectProbabilityTarget}
          calendar={calendar}
          bufferedEndDate={ganttBufferedEndDate}
          formatDate={formatDate}
          milestones={scenario.milestones}
          milestoneBuffers={milestoneBuffers}
          criticalPathIds={criticalPathIds}
          projectName={project.name}
          targetFinishDate={project.targetFinishDate ?? null}
          showTargetOnGantt={project.showTargetOnGantt ?? false}
          targetRAGColor={targetRAGColor}
          ganttAppearance={project.ganttAppearance}
        />
      )}

      {simulationResults && (
        <PrintSimulationResultsSection
          simulationResults={simulationResults}
          projPct={projPct}
        />
      )}

      {/* Footer */}
      <footer className="mt-4 pt-2 border-t border-gray-300 text-[9px] text-gray-500">
        <p>
          Generated by SPERT® Scheduler • SPERT® Monte Carlo Simulation
        </p>
      </footer>
    </div>
  );
}
