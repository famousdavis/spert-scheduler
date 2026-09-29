// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { Scenario, DeterministicSchedule, Calendar } from "@domain/models/types";
import type { WorkCalendar } from "@core/calendar/work-calendar";
import type { ScheduleBuffer } from "@core/schedule/buffer";
import { computeScheduleBuffer } from "@core/schedule/buffer";
import { computeSchedule } from "@app/api/schedule-service";
import { computeDependencySchedule } from "@core/schedule/deterministic";
import { cdf } from "@core/analytics/analytics";
import { durationToFinishDateISO } from "@core/calendar/calendar";
import { isCalendarError } from "@core/calendar/work-calendar";
import { isDependencyCycleError } from "@core/schedule/dependency-graph";
import type { ScheduleError } from "@ui/hooks/use-schedule";
import { savedScenarioFlags, type SavedScenarioFlags } from "@ui/helpers/scenario-flags";
import { compareRunNote, scheduleErrorKind, type FlagNoteInput } from "@ui/helpers/flag-sentences";
import type { CDFDataset } from "@ui/charts/cdf-comparison-data";

// Color palette for comparison lines
const COMPARISON_COLORS = ["#3b82f6", "#10b981", "#f59e0b"];

/**
 * The ON-SCREEN scenario's Run gate, as a pair: which scenario it belongs to, and whether its Run is
 * refused. A refused cell is not in the saved plan, so it never flags a column — but it does refuse
 * that screen's Run, and the grey note must not ask for a run the Run button beside it refuses.
 */
export interface CompareRunGate {
  scenarioId: string | null;
  runBlocked: boolean;
}

export interface ComparisonModelInput {
  scenarios: readonly Scenario[];
  calendar?: WorkCalendar | Calendar;
  /** The project numbers its activities: a note then leads each row with its `#n` (WI-58). */
  showActivityNumbers: boolean;
  /**
   * The screen passes ITS Run gate. Paper passes `null`: it describes the SAVED plan (owner ruling,
   * 2026-09-27), so an entry the grid refused to store never leaves a scenario out of the grey note.
   */
  runGate: CompareRunGate | null;
  /** The page's date formatter (`useDateFormat()`), passed in so the model stays pure. */
  formatDate: (iso: string) => string;
}

export interface ComparisonColumn {
  id: string;
  name: string;
  /** How many rows of its SAVED plan are flagged (WI-58): "N flagged" under its name. */
  flaggedCount: number;
}

export interface ComparisonRow {
  label: string;
  values: (string | null)[];
  highlights?: ("best" | null)[];
}

/** One flagged scenario's note, as the sentence builder's input: each renderer picks its surface. */
export interface ComparisonFlagNote {
  scenarioId: string;
  /** The flagged rows' activity IDs, in the note's order (the renderers' keys). */
  rowIds: string[];
  input: FlagNoteInput;
}

export interface ComparisonCdf {
  /** Scenarios with samples, in column order, coloured by their place among the curves. */
  datasets: CDFDataset[];
  /** The dashed line's probability: the FIRST curve's Project target. */
  target: number;
  caption: string;
}

/**
 * What the comparison SAYS, for the screen's table and the printed one (WI-61): one model, two
 * renderers, so the words and the marks come from one code path by construction.
 */
export interface ComparisonModel {
  columns: ComparisonColumn[];
  rows: ComparisonRow[];
  flagNotes: ComparisonFlagNote[];
  /** The grey note, or null. */
  runNote: string | null;
  /** The red note, or null. */
  failNote: string | null;
  /** The S-curves, or null when fewer than two compared scenarios have results. */
  cdf: ComparisonCdf | null;
}

interface ComparisonEntry {
  scenario: Scenario;
  schedule: DeterministicSchedule | null;
  buffer: ScheduleBuffer | null;
  /** Typed as the page types it, so a note can tell a cycle or a calendar error from an estimate. */
  error: ScheduleError | null;
  /** What its SAVED activities have flagged (WI-58). */
  flags: SavedScenarioFlags;
}

function computeEntry(scenario: Scenario, calendar?: WorkCalendar | Calendar): ComparisonEntry {
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

function bestOf(values: (number | null)[], mode: "min" | "max"): number | null {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length === 0) return null;
  return mode === "min" ? Math.min(...nums) : Math.max(...nums);
}

function pickBestHighlight(value: number | null, best: number | null): "best" | null {
  if (value === null || best === null) return null;
  return value === best ? "best" : null;
}

function formatSignedBuffer(b: number | null): string | null {
  if (b === null) return null;
  return `${b > 0 ? "+" : ""}${b}`;
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
function kindOf(e: ComparisonEntry) {
  return scheduleErrorKind(e.error, e.flags.anyStops);
}

/**
 * Can this scenario be run from its own screen? It has activities, no flagged row, and a schedule
 * that computes — and, for the scenario on screen, a Run button that is not refused by a cell the
 * grid would not store (the gate is that SCREEN's, so the note never asks for a run it refuses).
 * With no gate (paper), the saved plan alone decides.
 */
function canRun(e: ComparisonEntry, gate: CompareRunGate | null): boolean {
  if (e.scenario.activities.length === 0 || e.flags.rows.length > 0 || e.error) return false;
  return !(gate?.runBlocked && gate.scenarioId === e.scenario.id);
}

function runNoteOf(entries: ComparisonEntry[], gate: CompareRunGate | null): string | null {
  const runnable = entries.map((e) => canRun(e, gate));
  const unrun = entries.filter((e, i) => runnable[i] && !e.scenario.simulationResults);
  return compareRunNote(
    unrun.map((e) => e.scenario.name),
    runnable.every(Boolean)
  );
}

function rowsOf(entries: ComparisonEntry[], calendar: WorkCalendar | Calendar | undefined, formatDate: (iso: string) => string): ComparisonRow[] {
  // A flagged scenario displays its values but does not compete for "best" (WI-58).
  const contenders = entries.map((e) => e.flags.rows.length === 0);
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
  const means = entries.map((e) => e.scenario.simulationResults?.mean ?? null);
  const stdDevs = entries.map((e) => e.scenario.simulationResults?.standardDeviation ?? null);

  // The displayed strings for the three highlighted rows. Each is handed to BOTH the
  // row's `values` and `highlightBestDisplayed`, so display and comparison cannot drift
  // apart (WI-41 — see the helper).
  const durationValues = durations.map((d) => (d !== null ? String(d) : null));
  const totalDurationValues = totalDurations.map((d) => (d !== null ? String(d) : null));
  const meanValues = means.map((m) => (m !== null ? m.toFixed(1) : null));

  const percentileKeys = [50, 75, 90, 95];

  return [
    {
      label: "Start Date",
      values: entries.map((e) => formatDate(e.scenario.startDate)),
    },
    {
      label: "End Date (no buffer)",
      values: entries.map((e) => (e.schedule ? formatDate(e.schedule.projectEndDate) : null)),
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
      values: entries.map((e) => `P${Math.round(e.scenario.settings.probabilityTarget * 100)}`),
    },
    {
      label: "Project Target",
      values: entries.map((e) => `P${Math.round(e.scenario.settings.projectProbabilityTarget * 100)}`),
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
}

/**
 * The S-curves: the compared scenarios that have samples, in column order. The dashed line is the
 * FIRST curve's Project target; when the curves' targets differ, the caption names whose it is
 * (owner ruling, 2026-09-28) — one line, one label, true for the scenario it names. Both are judged
 * among the DRAWN curves only: a compared scenario without results draws no curve, so it never owns
 * the line (the target used to come from the first column, curve or not).
 */
function cdfOf(entries: ComparisonEntry[]): ComparisonCdf | null {
  const withSamples = entries.filter((e) => e.scenario.simulationResults?.samples);
  if (withSamples.length < 2) return null;
  const datasets = withSamples.map((e, idx) => ({
    id: e.scenario.id,
    label: e.scenario.name,
    points: cdf(
      new Float64Array(e.scenario.simulationResults!.samples),
      300 // Use fewer points for comparison chart
    ),
    color: COMPARISON_COLORS[idx % COMPARISON_COLORS.length]!,
  }));
  const pOf = (e: ComparisonEntry) => Math.round(e.scenario.settings.projectProbabilityTarget * 100);
  const first = withSamples[0]!;
  const shared = withSamples.every((e) => pOf(e) === pOf(first));
  const whose = shared ? "" : `${first.scenario.name}'s `;
  return {
    datasets,
    target: first.scenario.settings.projectProbabilityTarget,
    caption: `Duration (days) · Dashed line: ${whose}P${pOf(first)} target`,
  };
}

export function buildComparisonModel({
  scenarios,
  calendar,
  showActivityNumbers,
  runGate,
  formatDate,
}: ComparisonModelInput): ComparisonModel {
  const entries = scenarios.map((s) => computeEntry(s, calendar));
  const flagNotes = entries
    .filter((e) => e.flags.rows.length > 0)
    .map((e) => ({
      scenarioId: e.scenario.id,
      rowIds: e.flags.rows.map((r) => r.id),
      input: {
        scenarioName: e.scenario.name,
        rows: e.flags.rows.map((r) => ({
          label: showActivityNumbers ? `#${r.position} ${r.name}` : r.name,
          messages: r.messages,
        })),
        anyStops: e.flags.anyStops,
        errorKind: kindOf(e),
      },
    }));
  // The red note keeps today's words for every failure EXCEPT a flagged row's own estimate, which the
  // scenario's amber note already states in the summary's words (and without the engine's jargon).
  const failing = entries.filter((e) => e.error && kindOf(e) !== "estimate");
  const failures = failing.map((e) => `${e.scenario.name} (${e.error!.message})`).join("; ");
  return {
    columns: entries.map((e) => ({ id: e.scenario.id, name: e.scenario.name, flaggedCount: e.flags.rows.length })),
    rows: rowsOf(entries, calendar, formatDate),
    flagNotes,
    runNote: runNoteOf(entries, runGate),
    failNote: failing.length > 0 ? `Could not compute a schedule for: ${failures}` : null,
    cdf: cdfOf(entries),
  };
}
