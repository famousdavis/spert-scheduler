// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

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
import type { ScheduleError } from "@ui/hooks/use-schedule";
import { STANDARD_PERCENTILES, RSM_LABELS } from "@domain/models/types";
import { useMemo } from "react";
import {
  distributionLabel,
  statusLabel,
  milestoneHealthTextClass,
  milestoneHealthLabel,
  pluralize,
} from "@domain/helpers/format-labels";
import { CONSTRAINT_LABELS } from "@domain/helpers/constraint-labels";
import { nameOrUnnamed } from "@domain/helpers/display-name";
import { confidenceApplies } from "@domain/helpers/confidence-applies";
import { savedScenarioFlags } from "@ui/helpers/scenario-flags";
import { flagNote, scheduleErrorKind } from "@ui/helpers/flag-sentences";
import { getScheduleErrorBanner } from "@ui/helpers/schedule-error-banner";
import {
  buildComparisonModel,
  type ComparisonCdf,
  type ComparisonFlagNote,
  type ComparisonModel,
} from "@ui/helpers/comparison-model";
import type { Calendar } from "@domain/models/types";
import type { WorkCalendar } from "@core/calendar/work-calendar";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ReferenceLine } from "recharts";
import { axisTick } from "@ui/charts/axis-theme";
import { mergeCdfDatasets, CDF_TARGET_DASH, CDF_TARGET_STROKE } from "@ui/charts/cdf-comparison-data";

function formatSignedBufferDays(buffer: { bufferDays: number } | null): string {
  if (!buffer) return "—";
  return `${buffer.bufferDays > 0 ? "+" : ""}${buffer.bufferDays} ${pluralize(buffer.bufferDays, "day")}`;
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

// -- Validation errors (WI-58) -----------------------------------------------

export interface PrintValidationBoxProps {
  scenario: Scenario;
  /** The page's typed schedule error: "cannot be calculated" only when it IS a flagged row's estimate. */
  scheduleError: ScheduleError | null;
}

/**
 * The printed scenario's validation errors, at the top of page 1 (WI-58): the validation summary's
 * heading and lines, then what they stop. From the SAVED activities — the paper describes the saved
 * plan, so a cell the grid refused to store prints nothing. Every row, always numbered as the printed
 * Activities table numbers it. Plain text only: print hides every <button>, and the screen summary puts
 * each row's number and name in one.
 */
export function PrintValidationBox({ scenario, scheduleError }: PrintValidationBoxProps) {
  const { activities } = scenario;
  const { probabilityTarget } = scenario.settings;
  const flags = useMemo(() => savedScenarioFlags(activities, probabilityTarget), [activities, probabilityTarget]);
  if (flags.rows.length === 0) return null;
  const note = flagNote(
    {
      scenarioName: scenario.name,
      rows: flags.rows.map((r) => ({ label: `#${r.position} ${r.name}`, messages: r.messages })),
      anyStops: flags.anyStops,
      errorKind: scheduleErrorKind(scheduleError, flags.anyStops),
    },
    "print"
  );
  return (
    <section className="mb-3 print-section-keep border border-amber-300 bg-amber-50 rounded p-2 text-xs text-amber-800">
      <p className="font-semibold">{note.heading}</p>
      <ul className="mt-0.5">
        {note.rows.map((line, i) => (
          <li key={flags.rows[i]!.id}>{line}</li>
        ))}
      </ul>
      <p className="mt-1 font-medium">{note.consequence}</p>
    </section>
  );
}

// -- Schedule error (WI-84) --------------------------------------------------

export interface PrintScheduleErrorBoxProps {
  /** The page's typed schedule error, LIVE — the paper describes the saved plan. */
  scheduleError: ScheduleError | null;
}

/**
 * Why the printout's dates are blank, when the scenario's schedule fails on a dependency cycle or a
 * calendar error (WI-84): the page banner's own heading, message and advice — the words
 * `getScheduleErrorBanner` returns, never a second copy of them. With no flagged thrower it is non-null
 * for exactly those two kinds: an estimate is WI-58's box's to explain, and any other failure shows no
 * banner on the page either. Directly under the header, above WI-58's box and the comparison (owner
 * ruling, 2026-09-28), so a tall comparison can never push it off page 1.
 */
export function PrintScheduleErrorBox({ scheduleError }: PrintScheduleErrorBoxProps) {
  const banner = getScheduleErrorBanner(scheduleError, null);
  if (!banner) return null;
  return (
    <section className="mb-3 print-section-keep border border-red-300 bg-red-50 rounded p-2 text-xs text-red-800">
      <p className="font-semibold">{banner.heading}</p>
      <p className="mt-0.5">{banner.message}</p>
      <p className="mt-1 font-medium">{banner.advice}</p>
    </section>
  );
}

// -- Scenario Comparison (WI-61) ----------------------------------------------

/**
 * The printed S-curves' size. FIXED, because `ResponsiveContainer` measures its parent and the report is
 * `display: none` until the print: measured, a responsive chart printed a blank box. 680 px is as wide as
 * the report's text box allows — A4 at 96 dpi less two 1 cm margins is 718 px, less the report's `p-4`,
 * 686 — and 300 px is the screen's height.
 */
const PRINT_CDF_WIDTH = 680;
const PRINT_CDF_HEIGHT = 300;

/**
 * One dash pattern per curve, so a black-and-white printer can tell them apart — blue and green print as
 * one grey (luma 122 and 128). The first curve is solid; none is the target line's 5 5 or the grid's
 * 3 3. The key shows each curve's pattern.
 */
const PRINT_CURVE_DASHES: readonly (string | undefined)[] = [undefined, "9 4", "2 3"];

/**
 * The S-curves on paper: the screen chart's data, through the same transform, with none of the things a
 * hidden report cannot do. A fixed size; the light theme's ticks whatever `html.dark` says; no entrance
 * animation (it draws with `stroke-dasharray`, so a print taken during it left the lines half-drawn); and
 * no Recharts `<Legend>`, which sizes the plot from a measurement that reads 0 x 0 inside the hidden
 * report, so it printed on the axis labels — the key below is plain elements instead.
 */
function PrintCdfChart({ cdf }: { cdf: ComparisonCdf }) {
  return (
    <LineChart
      width={PRINT_CDF_WIDTH}
      height={PRINT_CDF_HEIGHT}
      data={mergeCdfDatasets(cdf.datasets)}
      margin={{ top: 10, right: 30, left: 0, bottom: 5 }}
    >
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis
        dataKey="value"
        type="number"
        tick={axisTick(false)}
        tickFormatter={(v) => String(Math.round(v))}
        domain={["dataMin", "dataMax"]}
      />
      <YAxis
        tick={axisTick(false)}
        label={{ value: "Probability (%)", angle: -90, position: "insideLeft", fontSize: 12 }}
        domain={[0, 100]}
      />
      {cdf.datasets.map((d, i) => (
        <Line
          key={d.id}
          type="monotone"
          dataKey={d.id}
          name={d.label}
          stroke={d.color}
          strokeDasharray={PRINT_CURVE_DASHES[i]}
          dot={false}
          strokeWidth={2}
          isAnimationActive={false}
        />
      ))}
      <ReferenceLine
        y={cdf.target * 100}
        stroke={CDF_TARGET_STROKE}
        strokeDasharray={CDF_TARGET_DASH}
        strokeWidth={1}
      />
    </LineChart>
  );
}

/** The chart's key, in the table's column order: each curve's colour and dash pattern, then its name. */
function PrintCdfKey({ cdf }: { cdf: ComparisonCdf }) {
  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-0.5 mt-0.5 text-xs text-gray-700">
      {cdf.datasets.map((d, i) => (
        <span key={d.id} className="inline-flex items-center gap-1">
          <svg width="24" height="8" aria-hidden="true">
            <line x1="0" y1="4" x2="24" y2="4" stroke={d.color} strokeWidth="2" strokeDasharray={PRINT_CURVE_DASHES[i]} />
          </svg>
          {d.label}
        </span>
      ))}
    </div>
  );
}

/** A flagged scenario's note, in Compare's words — and EVERY row: paper has no tab to go to for the rest. */
function PrintFlagNote({ flag }: { flag: ComparisonFlagNote }) {
  const note = flagNote(flag.input, "compare-print");
  if (note.rows.length === 1) {
    return (
      <p className="mt-1 text-xs text-amber-700">
        <span className="font-medium text-amber-800">{note.heading}</span> {note.rows[0]} {note.consequence}
      </p>
    );
  }
  return (
    <div className="mt-1 text-xs text-amber-700">
      <p className="font-medium text-amber-800">{note.heading}</p>
      {note.rows.map((line, i) => (
        <p key={flag.rowIds[i]}>{line}</p>
      ))}
      <p>{note.consequence}</p>
    </div>
  );
}

/**
 * The screen's table, as the paper sets it: the report's 12 px, and headers that WRAP — on screen they
 * are `whitespace-nowrap`, and a table wider than the paper made Chrome shrink every page (measured: 77 %
 * with three 44-character names). Kept whole.
 */
function PrintComparisonTable({ model }: { model: ComparisonModel }) {
  return (
    <table className="text-xs border-collapse print-section-keep">
      <thead>
        <tr className="bg-gray-50 border-b border-gray-200">
          <th className="text-left px-2.5 py-0.5 text-gray-500 font-medium whitespace-nowrap">Metric</th>
          {model.columns.map((col) => (
            <th key={col.id} className="text-right px-2.5 py-0.5 text-gray-900 font-semibold [overflow-wrap:anywhere]">
              {col.name}
              {col.flaggedCount > 0 && (
                <div className="text-xs font-medium text-amber-700">{col.flaggedCount} flagged</div>
              )}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {model.rows.map((row, i) => (
          <tr key={row.label} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
            <td className="px-2.5 py-0.5 text-gray-600 whitespace-nowrap">{row.label}</td>
            {row.values.map((val, j) => (
              <td
                key={j}
                className={`px-2.5 py-0.5 text-right tabular-nums whitespace-nowrap ${row.highlights?.[j] === "best" ? "text-green-700 font-semibold" : "text-gray-900"}`}
              >
                {val ?? <span className="text-gray-300">&mdash;</span>}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export interface PrintComparisonSectionProps {
  /** The LIVE compared scenarios — two or three — in column order. */
  scenarios: Scenario[];
  calendar?: WorkCalendar | Calendar;
  showActivityNumbers: boolean;
  /** The scenario whose report follows: the one on screen. */
  reportScenarioName: string;
  formatDate: FormatDate;
}

/**
 * The comparison, printed (WI-61): the screen's table and its notes, then its S-curves whenever the
 * screen shows them, then the line naming the scenario whose report follows. From the SAME model as the
 * screen's table, so the words and the marks come from one code path — with the SAVED plan's Run gate
 * (none: a cell the grid refused to store never leaves a scenario out of the grey note) and every flagged
 * row (owner rulings, 2026-09-27 and 2026-09-28).
 * ⚠️ A BLOCK, not the screen's inline-block, and not kept whole: an inline-block cannot break, so a tall
 * comparison jumped whole to the next page and left page 1 with the header alone. The table and the
 * S-curves are each kept whole; the notes break between lines; the title never ends a page.
 */
export function PrintComparisonSection({
  scenarios,
  calendar,
  showActivityNumbers,
  reportScenarioName,
  formatDate,
}: PrintComparisonSectionProps) {
  const model = useMemo(
    () => buildComparisonModel({ scenarios, calendar, showActivityNumbers, runGate: null, formatDate }),
    [scenarios, calendar, showActivityNumbers, formatDate]
  );
  return (
    <section className="mb-3">
      <h2 className="text-base font-semibold border-b border-gray-300 pb-1 mb-2 print-comparison-title">
        Scenario Comparison
      </h2>
      <PrintComparisonTable model={model} />
      {model.flagNotes.map((f) => (
        <PrintFlagNote key={f.scenarioId} flag={f} />
      ))}
      {model.runNote && <p className="mt-1 text-xs text-gray-500">{model.runNote}</p>}
      {model.failNote && <p className="mt-1 text-xs text-red-700">{model.failNote}</p>}
      {model.cdf && (
        <div className="mt-3 print-section-keep bg-white" style={{ width: PRINT_CDF_WIDTH }}>
          <h3 className="text-sm font-semibold text-gray-700 mb-1">Cumulative Distribution Comparison</h3>
          <PrintCdfChart cdf={model.cdf} />
          <PrintCdfKey cdf={model.cdf} />
          <p className="text-xs text-gray-500 text-center mt-0.5">{model.cdf.caption}</p>
        </div>
      )}
      <p className="mt-2 text-xs">The rest of this report describes {reportScenarioName}.</p>
    </section>
  );
}

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
                  {schedule ? `${schedule.totalDurationDays} working ${pluralize(schedule.totalDurationDays, "day")}` : "—"}
                </td>
              </tr>
              <tr>
                <td className="py-0.5 text-gray-600">Duration (w/Buffer):</td>
                <td className="py-0.5 font-medium">
                  {buffer ? `${Math.round(buffer.projectTargetDuration)} working ${pluralize(Math.round(buffer.projectTargetDuration), "day")}` : "—"}
                </td>
              </tr>
              {showConstraintDelay && (
                <tr>
                  <td className="py-0.5 text-gray-600">Constraint Delay:</td>
                  <td className="py-0.5 font-medium">+{constraintDelayDays} working {pluralize(constraintDelayDays, "day")}</td>
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
            <th className="py-1 pr-1">Distribution</th>
            <th className="py-1 pr-1">Confidence</th>
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
                <td className="py-0.5 pr-1 font-medium">{nameOrUnnamed(activity.name)}</td>
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
                  {distributionLabel(activity.distributionType)}
                </td>
                <td className="py-0.5 pr-1">
                  {confidenceApplies(activity.distributionType)
                    ? RSM_LABELS[activity.confidenceLevel]
                    : "—"}
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
            const fromAct = scenario.activities.find((a) => a.id === dep.fromActivityId);
            const toAct = scenario.activities.find((a) => a.id === dep.toActivityId);
            // "Unknown" = no such activity; "(unnamed)" = present but nameless.
            // Two different facts — `?? "Unknown"` could not tell them apart.
            const fromName = fromAct ? nameOrUnnamed(fromAct.name) : "Unknown";
            const toName = toAct ? nameOrUnnamed(toAct.name) : "Unknown";
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
                <td className="py-0.5 pr-1 font-medium">{nameOrUnnamed(activity.name)}</td>
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
                <td className="py-0.5 pr-1 font-medium align-top">{nameOrUnnamed(activity.name)}</td>
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

  // No `print-section-keep`: these lists usually run past a page, and the keep only made each
  // one start on a new page, leaving the page before it part-empty. The four other long tables
  // (Activities, Dependencies, Constraints, Descriptions) already flow. `.print-item-group`
  // keeps each activity together, and `.print-item-title` keeps the title with its table.
  return (
    <section className="mb-3">
      <h2 className="text-base font-semibold border-b border-gray-300 pb-1 mb-2 print-item-title">
        {sectionTitle}
      </h2>
      <table className="w-full text-[9px] border-collapse">
        <thead>
          <tr className="border-b-2 border-gray-400 text-left">
            <th className="py-1 pr-1 w-[70%]">{itemLabel}</th>
            <th className="py-1 text-center w-[30%]">{itemStatusLabel}</th>
          </tr>
        </thead>
        {/* One <tbody> per activity, so the print stylesheet can keep an activity's
            name row on the same page as its items (`.print-item-group`). */}
        {activities.map((activity) => {
          const items = getItems(activity)!;
          const doneCount = items.filter((i) => i.completed).length;
          return (
            <tbody key={activity.id} className="print-item-group">
              <tr className="border-b border-gray-300 bg-gray-50">
                <td colSpan={2} className="py-0.5 pr-1 font-medium">
                  {nameOrUnnamed(activity.name)}
                  <span className="ml-2 text-gray-500 font-normal tabular-nums">
                    ({doneCount}/{items.length})
                  </span>
                </td>
              </tr>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-gray-200">
                  <td className="py-0.5 pr-1 pl-3">{item.text}</td>
                  <td className="py-0.5 text-center">
                    {item.completed ? "✓" : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          );
        })}
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
                <td className="py-0.5 pr-1 font-medium">{nameOrUnnamed(ms.name)}</td>
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
