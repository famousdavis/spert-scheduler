// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import type {
  Activity,
  Project,
  Scenario,
  DeterministicSchedule,
  ScheduledActivity,
  MilestoneBufferInfo,
  SimulationRun,
} from "@domain/models/types";
import type { ScheduleBuffer } from "@core/schedule/buffer";
import { STANDARD_PERCENTILES, RSM_LABELS } from "@domain/models/types";
import {
  distributionLabel,
  statusLabel,
  milestoneHealthTextClass,
  milestoneHealthLabel,
} from "@domain/helpers/format-labels";
import { CONSTRAINT_LABELS } from "@domain/helpers/constraint-labels";

function formatSignedBufferDays(buffer: { bufferDays: number } | null): string {
  if (!buffer) return "—";
  return `${buffer.bufferDays > 0 ? "+" : ""}${buffer.bufferDays} days`;
}

function formatSignedLag(lagDays: number): string {
  if (lagDays === 0) return "0";
  return `${lagDays > 0 ? "+" : ""}${lagDays}`;
}

function formatSignedSlackDays(slackDays: number | null | undefined): string {
  if (slackDays === null || slackDays === undefined) return "—";
  return `${slackDays >= 0 ? "+" : ""}${slackDays}d`;
}

type FormatDate = (iso: string) => string;

// -- Project Summary ---------------------------------------------------------

export interface PrintSummarySectionProps {
  project: Project;
  scenario: Scenario;
  schedule: DeterministicSchedule | null;
  buffer: ScheduleBuffer | null;
  bufferedEndDate: string | null;
  formatDate: FormatDate;
}

export function PrintSummarySection({
  project,
  scenario,
  schedule,
  buffer,
  bufferedEndDate,
  formatDate,
}: PrintSummarySectionProps) {
  const actPct = Math.round(scenario.settings.probabilityTarget * 100);
  const projPct = Math.round(scenario.settings.projectProbabilityTarget * 100);

  // Constraint-delay disclosure (idle working days on hard date constraints / milestone
  // floors). Suppressed on error-conflicted schedules — decomposition out of warranty.
  const hasErrorConflict =
    schedule?.constraintConflicts?.some((c) => c.severity === "error") ?? false;
  const constraintDelayDays =
    schedule && buffer ? buffer.deterministicSpan - schedule.totalDurationDays : null;
  const showConstraintDelay =
    constraintDelayDays !== null && constraintDelayDays > 0 && !hasErrorConflict;

  return (
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
                <td className="py-0.5 text-gray-600">Finish Target:</td>
                <td className="py-0.5 font-medium">
                  {project.targetFinishDate ? formatDate(project.targetFinishDate) : "—"}
                </td>
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
                  {buffer ? `${Math.round(buffer.projectTargetDuration)} working days` : "—"}
                </td>
              </tr>
              {showConstraintDelay && (
                <tr>
                  <td className="py-0.5 text-gray-600">Constraint Delay:</td>
                  <td className="py-0.5 font-medium">+{constraintDelayDays} working days</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div>
          {/* eslint-disable-next-line sonarjs/table-header -- presentation layout table, no logical header row */}
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
                  {formatSignedBufferDays(buffer)}
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
              <tr>
                <td className="py-0.5 text-gray-600">Parkinson&apos;s Law:</td>
                <td className="py-0.5 font-medium">
                  {(scenario.settings.parkinsonsLawEnabled ?? true) ? "Enabled" : "Disabled"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

// -- Activity Table ----------------------------------------------------------

export interface PrintActivityTableProps {
  scenario: Scenario;
  scheduledActivities: ScheduledActivity[];
  formatDate: FormatDate;
}

export function PrintActivityTable({
  scenario,
  scheduledActivities,
  formatDate,
}: PrintActivityTableProps) {
  return (
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
                  {activity.distributionType === "normal" || activity.distributionType === "logNormal"
                    ? RSM_LABELS[activity.confidenceLevel]
                    : "—"}
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
  );
}

// -- Dependencies Table ------------------------------------------------------

export interface PrintDependenciesTableProps {
  scenario: Scenario;
}

export function PrintDependenciesTable({ scenario }: PrintDependenciesTableProps) {
  if (!scenario.settings.dependencyMode || scenario.dependencies.length === 0) {
    return null;
  }
  return (
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
                  {formatSignedLag(dep.lagDays)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

// -- Constraints Table -------------------------------------------------------

export interface PrintConstraintsTableProps {
  scenario: Scenario;
  formatDate: FormatDate;
}

export function PrintConstraintsTable({
  scenario,
  formatDate,
}: PrintConstraintsTableProps) {
  const constrained = scenario.activities.filter((a) => a.constraintType != null);
  if (constrained.length === 0) return null;
  return (
    <section className="mb-3">
      <h2 className="text-base font-semibold border-b border-gray-300 pb-1 mb-2">
        Constraints ({constrained.length})
      </h2>
      <table className="w-full text-[9px] border-collapse">
        <thead>
          <tr className="border-b-2 border-gray-400 text-left">
            <th className="py-1 pr-1">#</th>
            <th className="py-1 pr-1">Activity</th>
            <th className="py-1 pr-1">Type</th>
            <th className="py-1 pr-1">Date</th>
            <th className="py-1 pr-1">Mode</th>
            <th className="py-1">Note</th>
          </tr>
        </thead>
        <tbody>
          {scenario.activities
            .map((a, i) => ({ activity: a, num: i + 1 }))
            .filter(({ activity }) => activity.constraintType != null)
            .map(({ activity, num }, idx) => (
              <tr key={idx} className="border-b border-gray-200">
                <td className="py-0.5 pr-1 text-gray-500">{num}</td>
                <td className="py-0.5 pr-1 font-medium">{activity.name}</td>
                <td className="py-0.5 pr-1">
                  {activity.constraintType} — {CONSTRAINT_LABELS[activity.constraintType!]}
                </td>
                <td className="py-0.5 pr-1 tabular-nums">
                  {activity.constraintDate ? formatDate(activity.constraintDate) : "—"}
                </td>
                <td className="py-0.5 pr-1 capitalize">{activity.constraintMode ?? "—"}</td>
                <td className="py-0.5 text-gray-600">{activity.constraintNote ?? ""}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </section>
  );
}

export interface PrintDescriptionsTableProps {
  scenario: Scenario;
}

export function PrintDescriptionsTable({ scenario }: PrintDescriptionsTableProps) {
  const described = scenario.activities.filter((a) => a.description?.trim());
  if (described.length === 0) return null;
  return (
    <section className="mb-3">
      <h2 className="text-base font-semibold border-b border-gray-300 pb-1 mb-2">
        Descriptions ({described.length})
      </h2>
      <table className="w-full text-[9px] border-collapse">
        <thead>
          <tr className="border-b-2 border-gray-400 text-left">
            <th className="py-1 pr-1 w-6">#</th>
            <th className="py-1 pr-1 w-1/4">Activity</th>
            <th className="py-1">Description</th>
          </tr>
        </thead>
        <tbody>
          {scenario.activities
            .map((a, i) => ({ activity: a, num: i + 1 }))
            .filter(({ activity }) => activity.description?.trim())
            .map(({ activity, num }, idx) => (
              <tr key={idx} className="border-b border-gray-200">
                <td className="py-0.5 pr-1 text-gray-500 align-top">{num}</td>
                <td className="py-0.5 pr-1 font-medium align-top">{activity.name}</td>
                <td className="py-0.5 text-gray-600 whitespace-pre-wrap">{activity.description}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </section>
  );
}

// -- Item Table (Tasks / Deliverables shared shape) --------------------------

export interface PrintItemTableProps {
  scenario: Scenario;
  sectionTitle: string;
  itemLabel: string;
  itemStatusLabel: string;
  getItems: (a: Activity) => { id: string; text: string; completed: boolean }[] | undefined;
}

/** Renders a checklist-style table (Tasks or Deliverables). Returns `null`
 *  when no activity has any items of the requested kind. */
export function PrintItemTable({
  scenario,
  sectionTitle,
  itemLabel,
  itemStatusLabel,
  getItems,
}: PrintItemTableProps) {
  const activities = scenario.activities.filter((a) => {
    const items = getItems(a);
    return items && items.length > 0;
  });
  if (activities.length === 0) return null;

  return (
    <section className="mb-3 print-section-keep">
      <h2 className="text-base font-semibold border-b border-gray-300 pb-1 mb-2">
        {sectionTitle}
      </h2>
      <table className="w-full text-[9px] border-collapse">
        <thead>
          <tr className="border-b-2 border-gray-400 text-left">
            <th className="py-1 pr-1 w-[70%]">{itemLabel}</th>
            <th className="py-1 text-center w-[30%]">{itemStatusLabel}</th>
          </tr>
        </thead>
        <tbody>
          {activities.flatMap((activity) => {
            const items = getItems(activity)!;
            const doneCount = items.filter((i) => i.completed).length;
            return [
              <tr key={`${activity.id}-header`} className="border-b border-gray-300 bg-gray-50">
                <td colSpan={2} className="py-0.5 pr-1 font-medium">
                  {activity.name}
                  <span className="ml-2 text-gray-500 font-normal tabular-nums">
                    ({doneCount}/{items.length})
                  </span>
                </td>
              </tr>,
              ...items.map((item) => (
                <tr key={`${activity.id}-${item.id}`} className="border-b border-gray-200">
                  <td className="py-0.5 pr-1 pl-3">{item.text}</td>
                  <td className="py-0.5 text-center">
                    {item.completed ? "✓" : "—"}
                  </td>
                </tr>
              )),
            ];
          })}
        </tbody>
      </table>
    </section>
  );
}

// -- Milestones Table --------------------------------------------------------

export interface PrintMilestonesTableProps {
  scenario: Scenario;
  milestoneBuffers?: Map<string, MilestoneBufferInfo> | null;
  formatDate: FormatDate;
}

export function PrintMilestonesTable({
  scenario,
  milestoneBuffers,
  formatDate,
}: PrintMilestonesTableProps) {
  if (!scenario.settings.dependencyMode || scenario.milestones.length === 0) {
    return null;
  }
  return (
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
                  {formatSignedSlackDays(info?.slackDays)}
                </td>
                <td className="py-0.5">
                  {info ? (
                    <span className={milestoneHealthTextClass(info.health)}>
                      {milestoneHealthLabel(info.health)}
                    </span>
                  ) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

// -- Simulation Results ------------------------------------------------------

export interface PrintSimulationResultsSectionProps {
  simulationResults: SimulationRun;
  projPct: number;
}

export function PrintSimulationResultsSection({
  simulationResults,
  projPct,
}: PrintSimulationResultsSectionProps) {
  return (
    <section className="mb-3 print-section-keep">
      <h2 className="text-base font-semibold border-b border-gray-300 pb-1 mb-2">
        Monte Carlo Simulation Results
      </h2>
      <div className="grid grid-cols-2 gap-4">
        {/* Statistics */}
        <div>
          <h3 className="font-medium mb-1 text-xs">Statistics</h3>
          {/* eslint-disable-next-line sonarjs/table-header -- presentation layout table, no logical header row */}
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
  );
}
