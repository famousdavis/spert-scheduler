// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useMemo, useCallback, useRef } from "react";
import type {
  Scenario,
  DeterministicSchedule,
  Calendar,
} from "@domain/models/types";
import type { WorkCalendar } from "@core/calendar/work-calendar";
import type { ScheduleBuffer } from "@core/schedule/buffer";
import { computeScheduleBuffer } from "@core/schedule/buffer";
import { computeSchedule } from "@app/api/schedule-service";
import { computeDependencySchedule } from "@core/schedule/deterministic";
import { cdf } from "@core/analytics/analytics";
import { useDateFormat } from "@ui/hooks/use-date-format";
import { durationToFinishDateISO } from "@core/calendar/calendar";
import { CDFComparisonChart, type CDFDataset } from "@ui/charts/CDFComparisonChart";
import { isCalendarError } from "@core/calendar/work-calendar";
import { isDependencyCycleError } from "@core/schedule/dependency-graph";
import type { ScheduleError } from "@ui/hooks/use-schedule";
import { savedScenarioFlags, type SavedScenarioFlags } from "@ui/helpers/scenario-flags";
import { compareRunNote, flagNote, scheduleErrorKind } from "@ui/helpers/flag-sentences";
import { CopyImageButton } from "./CopyImageButton";

// Color palette for comparison lines
const COMPARISON_COLORS = ["#3b82f6", "#10b981", "#f59e0b"];

function pickBestHighlight(value: number | null, best: number | null): "best" | null {
  if (value === null || best === null) return null;
  return value === best ? "best" : null;
}

function formatSignedBuffer(b: number | null): string | null {
  if (b === null) return null;
  return `${b > 0 ? "+" : ""}${b}`;
}

function highlightClass(highlight: "best" | "worst" | null | undefined): string {
  if (highlight === "best") return "text-green-700 font-semibold";
  if (highlight === "worst") return "text-amber-700";
  return "text-gray-900";
}

interface ScenarioComparison {
  scenario: Scenario;
  schedule: DeterministicSchedule | null;
  buffer: ScheduleBuffer | null;
  /** Typed as the page types it, so a note can tell a cycle or a calendar error from an estimate. */
  error: ScheduleError | null;
  /** What its SAVED activities have flagged (WI-58). */
  flags: SavedScenarioFlags;
}

/**
 * The ON-SCREEN scenario's Run gate, as a pair: which scenario it belongs to, and whether its Run is
 * refused. A refused cell is not in the saved plan, so it never flags a column — but it does refuse
 * that screen's Run, and the grey note must not ask for a run the Run button beside it refuses.
 */
export interface CompareRunGate {
  scenarioId: string | null;
  runBlocked: boolean;
}

interface ScenarioComparisonProps {
  scenarios: Scenario[];
  calendar?: WorkCalendar | Calendar;
  /** The project numbers its activities: a note then leads each row with its `#n` (WI-58). */
  showActivityNumbers?: boolean;
  activeRunGate?: CompareRunGate | null;
}

function computeEntry(
  scenario: Scenario,
  calendar?: WorkCalendar | Calendar
): ScenarioComparison {
  let schedule: DeterministicSchedule | null = null;
  let buffer: ScheduleBuffer | null = null;
  let error: ScheduleError | null = null;

  if (scenario.activities.length > 0) {
    try {
      schedule = scenario.settings.dependencyMode
        ? computeDependencySchedule(
            scenario.activities,
            scenario.dependencies,
            scenario.startDate,
            scenario.settings.probabilityTarget,
            calendar,
            scenario.milestones
          )
        : computeSchedule(
            scenario.activities,
            scenario.startDate,
            scenario.settings.probabilityTarget,
            calendar
          );
    } catch (err) {
      error = {
        message: err instanceof Error ? err.message : String(err),
        isCalendarError: isCalendarError(err),
        isCycleError: isDependencyCycleError(err),
      };
    }
  }

  if (schedule && scenario.simulationResults) {
    buffer = computeScheduleBuffer(
      schedule.spanDays,
      scenario.simulationResults.percentiles,
      scenario.settings.probabilityTarget,
      scenario.settings.projectProbabilityTarget
    );
  }

  const flags = savedScenarioFlags(scenario.activities, scenario.settings.probabilityTarget);
  return { scenario, schedule, buffer, error, flags };
}

function bestOf(
  values: (number | null)[],
  mode: "min" | "max"
): number | null {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length === 0) return null;
  return mode === "min" ? Math.min(...nums) : Math.max(...nums);
}

/**
 * Picks the best cell(s) of a row from the strings the row actually DISPLAYS,
 * rather than from the underlying numbers.
 *
 * ⚠️ WI-41 (2026-09-12): the "Mean" row showed `323.3` against `323.3` — two visibly
 * identical numbers — and bolded only one of them, because the row rendered
 * `m.toFixed(1)` while the winner was chosen from the raw means, which differed in the
 * second decimal. Deriving the highlight from the displayed string makes that whole
 * class of mismatch unrepresentable rather than patched: two cells showing the same
 * string necessarily carry the same highlight among the contenders, because they are
 * the same input.
 *
 * Pass the SAME array to a row's `values` and to this function — that is what closes
 * the gap; two parallel arrays would just be a second place to diverge.
 *
 * Scope: `String(n)` round-trips every double exactly, so the rows formatted with it
 * ("Duration (days)", "Duration w/Buffer") highlight identically under this helper and
 * under the raw-number comparison it replaced. `toFixed` is the only lossy formatter
 * in this table, which is why "Mean" was the only row affected.
 *
 * ⚠️ NO BEST WITHOUT A RIVAL (WI-60): a row marks nothing unless at least TWO of its
 * cells have a value. `bestOf` filters blanks out, so a lone value is its own minimum —
 * with one scenario run and one not, the run scenario's "Duration w/Buffer" and "Mean"
 * were marked best against an empty cell. Ties still mark every tied cell, and an unrun
 * scenario still competes on "Duration (days)", where it has a real value.
 *
 * ⚠️ A FLAGGED SCENARIO DOES NOT COMPETE (WI-58): the table must never crown a plan the
 * app refuses to simulate. Its value still DISPLAYS; `contenders[i]` false keeps it out of
 * the contest, so the others compete among themselves — and with two compared and one
 * flagged, nothing is marked (WI-60's rule, above). The marks depend only on the values and
 * the flags, never on the order of the columns.
 */
function highlightBestDisplayed(
  displayed: (string | null)[],
  mode: "min" | "max",
  contenders: readonly boolean[]
): ("best" | null)[] {
  const parsed = displayed.map((s, i) => {
    if (s === null || !contenders[i]) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  });
  if (parsed.filter((v) => v !== null).length < 2) return parsed.map(() => null);
  const best = bestOf(parsed, mode);
  return parsed.map((v) => pickBestHighlight(v, best));
}

/** The error's kind, as the schedule-error banner decides it; an estimate only with a flagged thrower. */
function kindOf(e: ScenarioComparison) {
  return scheduleErrorKind(e.error, e.flags.anyStops);
}

/**
 * Can this scenario be run from its own screen? It has activities, no flagged row, and a schedule
 * that computes — and, for the scenario on screen, a Run button that is not refused by a cell the
 * grid would not store (the gate is that SCREEN's, so the note never asks for a run it refuses).
 */
function canRun(e: ScenarioComparison, gate: CompareRunGate | null): boolean {
  if (e.scenario.activities.length === 0 || e.flags.rows.length > 0 || e.error) return false;
  return !(gate?.runBlocked && gate.scenarioId === e.scenario.id);
}

function runNoteOf(entries: ScenarioComparison[], gate: CompareRunGate | null): string | null {
  const runnable = entries.map((e) => canRun(e, gate));
  const unrun = entries.filter((e, i) => runnable[i] && !e.scenario.simulationResults);
  return compareRunNote(
    unrun.map((e) => e.scenario.name),
    runnable.every(Boolean)
  );
}

/**
 * One flagged scenario's note (WI-58), in the owner's words: its name and the summary's heading in
 * medium weight, then the rows and what they stop. One row reads as one sentence run; several put each
 * row on its own line — at most three, as the Run toast — because Compare is a summary and the full
 * list is one tab away.
 */
function FlagNoteView({ entry, showActivityNumbers }: { entry: ScenarioComparison; showActivityNumbers: boolean }) {
  const { rows } = entry.flags;
  const note = flagNote(
    {
      scenarioName: entry.scenario.name,
      rows: rows.map((r) => ({
        label: showActivityNumbers ? `#${r.position} ${r.name}` : r.name,
        messages: r.messages,
      })),
      anyStops: entry.flags.anyStops,
      errorKind: kindOf(entry),
    },
    "compare"
  );
  if (note.rows.length === 1 && !note.more) {
    return (
      <p className="px-4 py-2 text-xs text-amber-700 border-t border-gray-100">
        <span className="font-medium text-amber-800">{note.heading}</span> {note.rows[0]} {note.consequence}
      </p>
    );
  }
  return (
    <div className="px-4 py-2 text-xs text-amber-700 border-t border-gray-100 space-y-0.5">
      <p className="font-medium text-amber-800">{note.heading}</p>
      {note.rows.map((line, i) => (
        <p key={rows[i]!.id}>{line}</p>
      ))}
      {note.more && <p>{note.more}</p>}
      <p>{note.consequence}</p>
    </div>
  );
}

/**
 * The notes under the table, in this order: one amber note per flagged scenario (column order), the
 * grey run note, the red note. ⚠️ The wrapper is `w-0 min-w-full` so the notes WRAP AT THE TABLE'S
 * WIDTH and never widen the box — or the copied image — around it: a note contributes nothing to the
 * captured region's width, then stretches to it (WI-58; measured: the engine's error note had widened
 * the box from 404 to 1,216 px, and the copied image with it).
 * ⚠️ Inside the captured region: light colours only, NO `dark:` variant (see the note on tableRef).
 */
function ComparisonNotes({
  entries,
  showActivityNumbers,
  activeRunGate,
}: {
  entries: ScenarioComparison[];
  showActivityNumbers: boolean;
  activeRunGate: CompareRunGate | null;
}) {
  const flagged = entries.filter((e) => e.flags.rows.length > 0);
  const runNote = runNoteOf(entries, activeRunGate);
  // The red note keeps today's words for every failure EXCEPT a flagged row's own estimate, which the
  // scenario's amber note already states in the summary's words (and without the engine's jargon).
  const failing = entries.filter((e) => e.error && kindOf(e) !== "estimate");
  if (flagged.length === 0 && !runNote && failing.length === 0) return null;
  return (
    <div className="w-0 min-w-full">
      {flagged.map((e) => (
        <FlagNoteView key={e.scenario.id} entry={e} showActivityNumbers={showActivityNumbers} />
      ))}
      {runNote && (
        <p className="px-4 py-2 text-xs text-gray-500 border-t border-gray-100">{runNote}</p>
      )}
      {failing.length > 0 && (
        <p className="px-4 py-2 text-xs text-red-700 border-t border-gray-100">
          Could not compute a schedule for:{" "}
          {failing.map((e) => `${e.scenario.name} (${e.error!.message})`).join("; ")}
        </p>
      )}
    </div>
  );
}

export function ScenarioComparisonTable({
  scenarios,
  calendar,
  showActivityNumbers = false,
  activeRunGate = null,
}: ScenarioComparisonProps) {
  const formatDate = useDateFormat();
  const tableRef = useRef<HTMLDivElement>(null);
  const cdfRef = useRef<HTMLDivElement>(null);
  const entries = useMemo(
    () => scenarios.map((s) => computeEntry(s, calendar)),
    [scenarios, calendar]
  );
  // A flagged scenario displays its values but does not compete for "best" (WI-58).
  const contenders = entries.map((e) => e.flags.rows.length === 0);

  // Format duration as finish date for CDF tooltip (uses first scenario's start date)
  const firstStartDate = scenarios[0]?.startDate;
  const formatDurationAsDate = useCallback(
    (days: number): string => {
      if (!firstStartDate) return "";
      const finish = durationToFinishDateISO(firstStartDate, days, calendar);
      return finish ? formatDate(finish) : "";
    },
    [firstStartDate, calendar, formatDate]
  );

  // Build CDF datasets for scenarios with simulation results
  const cdfDatasets = useMemo<CDFDataset[]>(() => {
    return entries
      .filter((e) => e.scenario.simulationResults?.samples)
      .map((e, idx) => ({
        label: e.scenario.name,
        points: cdf(
          new Float64Array(e.scenario.simulationResults!.samples),
          300 // Use fewer points for comparison chart
        ),
        color: COMPARISON_COLORS[idx % COMPARISON_COLORS.length]!,
      }));
  }, [entries]);

  // Get the first scenario's project probability target for the reference line
  const probabilityTarget =
    scenarios[0]?.settings.projectProbabilityTarget ?? 0.95;

  const durations = entries.map((e) => e.schedule?.totalDurationDays ?? null);
  const buffers = entries.map((e) => e.buffer?.bufferDays ?? null);
  // ⚠️ NO FALLBACK TO THE UNBUFFERED DURATION (WI-43, 2026-09-12). This row is
  // labelled "Duration w/Buffer"; when there is no buffer it must blank, exactly as
  // its two siblings above and below already do (`buffers`, and "End Date (w/buffer)").
  // Until v0.67.16 it fell back to `e.schedule.totalDurationDays` — a DIFFERENT
  // quantity under a label promising a buffered one — and because `bestOf` then
  // compared that smaller number against the others' genuinely buffered ones, an
  // un-simulated scenario was green-bolded as the winner (measured: 294 against a run
  // scenario's 351). Blanking removes the cell from the contest on its own: `bestOf`
  // filters nulls. (That left the run scenario to win alone; since WI-60 a row with
  // one value marks nothing — see `highlightBestDisplayed`.)
  const totalDurations = entries.map((e) =>
    e.buffer ? Math.round(e.buffer.projectTargetDuration) : null
  );
  const constraintDelays = entries.map((e) => {
    if (!e.schedule || !e.buffer) return null;
    const hasErrorConflict = e.schedule.constraintConflicts?.some((c) => c.severity === "error") ?? false;
    if (hasErrorConflict) return null;
    return e.buffer.deterministicSpan - e.schedule.totalDurationDays;
  });
  const anyConstraintDelay = constraintDelays.some((d) => d !== null && d > 0);
  const means = entries.map(
    (e) => e.scenario.simulationResults?.mean ?? null
  );
  const stdDevs = entries.map(
    (e) => e.scenario.simulationResults?.standardDeviation ?? null
  );

  // The displayed strings for the three highlighted rows. Each is handed to BOTH the
  // row's `values` and `highlightBestDisplayed`, so display and comparison cannot drift
  // apart (WI-41 — see the helper).
  const durationValues = durations.map((d) => (d !== null ? String(d) : null));
  const totalDurationValues = totalDurations.map((d) =>
    d !== null ? String(d) : null
  );
  const meanValues = means.map((m) => (m !== null ? m.toFixed(1) : null));

  const percentileKeys = [50, 75, 90, 95];

  type RowDef = {
    label: string;
    values: (string | null)[];
    highlights?: ("best" | "worst" | null)[];
  };

  const rows: RowDef[] = [
    {
      label: "Start Date",
      values: entries.map((e) => formatDate(e.scenario.startDate)),
    },
    {
      label: "End Date (no buffer)",
      values: entries.map((e) =>
        e.schedule ? formatDate(e.schedule.projectEndDate) : null
      ),
    },
    {
      label: "Duration (days)",
      values: durationValues,
      highlights: highlightBestDisplayed(durationValues, "min", contenders),
    },
    {
      // ⚠️ DELIBERATELY NOT HIGHLIGHTED, and it is not an oversight (WI-41, 2026-09-12).
      // More buffer is not unambiguously better: a large buffer means the simulation
      // found a wide spread, which is as likely to signal an uncertain plan as a safe
      // one. Marking a "best" here would make the table assert a preference the app
      // has no basis for — doubly so because this row is DERIVED from the two either
      // side of it, both of which are highlighted or blank on their own terms.
      label: "Buffer (days)",
      values: buffers.map(formatSignedBuffer),
    },
    ...(anyConstraintDelay
      ? [{
          label: "Constraint Delay (days)",
          values: constraintDelays.map((d) => (d !== null ? String(d) : null)),
        }]
      : []),
    {
      label: "End Date (w/buffer)",
      values: entries.map((e) => {
        if (!e.buffer) return null;
        const buffered = durationToFinishDateISO(
          e.scenario.startDate,
          e.buffer.projectTargetDuration,
          calendar
        );
        return buffered ? formatDate(buffered) : null;
      }),
    },
    {
      label: "Duration w/Buffer",
      values: totalDurationValues,
      highlights: highlightBestDisplayed(totalDurationValues, "min", contenders),
    },
    {
      label: "Activity Target",
      values: entries.map(
        (e) => `P${Math.round(e.scenario.settings.probabilityTarget * 100)}`
      ),
    },
    {
      label: "Project Target",
      values: entries.map(
        (e) =>
          `P${Math.round(e.scenario.settings.projectProbabilityTarget * 100)}`
      ),
    },
    {
      label: "Mean",
      values: meanValues,
      highlights: highlightBestDisplayed(meanValues, "min", contenders),
    },
    {
      label: "Standard Deviation",
      values: stdDevs.map((s) => (s !== null ? s.toFixed(1) : null)),
    },
    ...percentileKeys.map((pct) => ({
      label: `P${pct}`,
      values: entries.map((e) => {
        const val = e.scenario.simulationResults?.percentiles[pct];
        return val !== undefined ? val.toFixed(1) : null;
      }),
    })),
  ];

  return (
    <div className="inline-block bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden [overflow-anchor:none]">
      {/* Comparison table — header bar (chrome, not in screenshot) above the
          captured region. Matches the GanttSection pattern: label on the left,
          copy button on the right. */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Scenario Comparison
        </h3>
        <CopyImageButton
          targetRef={tableRef}
          title="Copy comparison table as image"
        />
      </div>
      {/* Explicit bg-white + inline-block on the captured element: html2canvas 1.4.1
          can fail to compute bounds on a bare div inside an inline-block/overflow-hidden
          parent, producing "Failed to copy image to clipboard" for the table button.

          ⚠️ THE bg-white IS ALSO DELIBERATE FOR THEMING, and must stay (WI-3, v0.66.1).
          `copyChartAsPng` passes `backgroundColor: "#ffffff"` to html2canvas, which forces
          the canvas BACKDROP white but does not touch element colours. A captured region
          that followed the dark theme would put light text on that white backdrop —
          unreadable, and worse than a dark PNG. Only the CHROME around this region follows
          the theme. */}
      <div ref={tableRef} className="inline-block bg-white">
        <table className="text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-2 text-gray-500 font-medium whitespace-nowrap">
                Metric
              </th>
              {entries.map((e) => (
                <th
                  key={e.scenario.id}
                  className="text-right px-4 py-2 text-gray-900 font-semibold whitespace-nowrap min-w-[120px]"
                >
                  {e.scenario.name}
                  {/* A <div>, not a span: its own line, and a block the accessible name
                      separates with a space ("Fast-track 1 flagged"). The grid bar's words. */}
                  {e.flags.rows.length > 0 && (
                    <div className="text-xs font-medium text-amber-700">
                      {e.flags.rows.length} flagged
                    </div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.label}
                className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}
              >
                <td className="px-4 py-1.5 text-gray-600 whitespace-nowrap">
                  {row.label}
                </td>
                {row.values.map((val, j) => {
                  const highlight = row.highlights?.[j];
                  return (
                    <td
                      key={j}
                      className={`px-4 py-1.5 text-right tabular-nums whitespace-nowrap ${highlightClass(highlight)}`}
                    >
                      {val ?? <span className="text-gray-300">&mdash;</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <ComparisonNotes
          entries={entries}
          showActivityNumbers={showActivityNumbers}
          activeRunGate={activeRunGate}
        />
      </div>

      {/* CDF Comparison Chart — same chrome pattern. The existing h4 inside the
          chart moves up into the header (so it isn't duplicated) and the ref'd
          region contains only the chart. */}
      {cdfDatasets.length >= 2 && (
        <>
          <div className="flex items-center justify-between px-4 py-2 border-t border-gray-200 dark:border-gray-700 border-b border-gray-100 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Cumulative Distribution Comparison
            </h3>
            <CopyImageButton
              targetRef={cdfRef}
              title="Copy distribution comparison as image"
            />
          </div>
          {/* Captured by html2canvas — stays light in both themes; see the note on
              tableRef above. */}
          <div ref={cdfRef} className="p-4 bg-white">
            <CDFComparisonChart
              datasets={cdfDatasets}
              probabilityTarget={probabilityTarget}
              formatDurationAsDate={formatDurationAsDate}
            />
          </div>
        </>
      )}
    </div>
  );
}
