import type {
  Project,
  Scenario,
  DeterministicSchedule,
  ScheduledActivity,
} from "@domain/models/types";
import type { ScheduleBuffer } from "@core/schedule/buffer";
import { STANDARD_PERCENTILES } from "@domain/models/types";
import {
  parseDateISO,
  addWorkingDays,
  formatDateISO,
} from "@core/calendar/calendar";
import { useDateFormat } from "@ui/hooks/use-date-format";
import { distributionLabel, statusLabel } from "@ui/helpers/format-labels";
import { RSM_LABELS } from "@domain/models/types";

interface PrintableReportProps {
  project: Project;
  scenario: Scenario;
  schedule: DeterministicSchedule | null;
  scheduledActivities: ScheduledActivity[];
  buffer: ScheduleBuffer | null;
}

export function PrintableReport({
  project,
  scenario,
  schedule,
  scheduledActivities,
  buffer,
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
            project.globalCalendarOverride
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
