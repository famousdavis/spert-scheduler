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
import { countWorkingDays, durationToFinishDateISO, parseDateISO } from "@core/calendar/calendar";
import { scenarioDataDate, staleResults } from "@core/schedule/recorded-progress";
import { todayISO } from "@ui/components/activity-row-helpers";
import { staleScenariosSentence } from "@ui/helpers/stale-results-words";
import { isCalendarError } from "@core/calendar/work-calendar";
import { pluralize } from "@domain/helpers/format-labels";
import { isDependencyCycleError } from "@core/schedule/dependency-graph";
import type { ScheduleError } from "@ui/hooks/use-schedule";
import { savedScenarioFlags, type SavedScenarioFlags } from "@ui/helpers/scenario-flags";
import { compareCurveNote, compareRunNote, scheduleErrorKind, type FlagNoteInput } from "@ui/helpers/flag-sentences";
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
  /**
   * WI-154: today, `YYYY-MM-DD`, local — the page's (`useToday`), so the comparison moves on at
   * midnight with it. Omitted: read from the clock.
   */
  today?: string;
}

export interface ComparisonColumn {
  id: string;
  name: string;
  /** How many rows of its SAVED plan are flagged (WI-58): "N flagged" under its name. */
  flaggedCount: number;
  /**
   * The screen's table offers a Run under its name: it CAN run (`canRun`, with the screen's gate)
   * and draws no curve — it has no results, or results whose samples were not stored.
   *
   * ⚠️ THE RUN ROW AND THE GREY NOTE AGREE IN EVERY STATE, because both are built from the same
   * per-scenario predicates (`offersRun`): the columns offered a Run are exactly the runnable
   * scenarios without results, plus the runnable scenarios whose results have no samples. The
   * note's first sentence names the first group — or says "all scenarios" when that group is every
   * compared scenario — and its second sentence names the second. Paper renders no Run row and
   * ignores this field; it prints the note, built the same way with no gate.
   */
  offerRun: boolean;
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
  /**
   * How to read the buffer-use rows (WI-125): which column they are measured against, and why a cell has
   * no number. Null when the rows are not shown — except, with the rows hidden, the line saying how to show
   * them when the first column records more progress than a later one (a later status update sits first).
   */
  bufferNote: string | null;
  /** The grey note, or null. */
  runNote: string | null;
  /** The red note, or null. */
  failNote: string | null;
  /**
   * WI-154 (owner, R639, decision 3): the compared scenarios whose results were simulated on an
   * earlier data date — shown as not run, and named here — or null.
   */
  staleNote: string | null;
  /** The S-curves, or null when fewer than two compared scenarios have results WITH samples. */
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

function computeEntry(scenario: Scenario, calendar: WorkCalendar | Calendar | undefined, today: string): ComparisonEntry {
  let schedule: DeterministicSchedule | null = null;
  let buffer: ScheduleBuffer | null = null;
  let error: ScheduleError | null = null;

  if (scenario.activities.length > 0) {
    // WI-154: the same data date, by the same scope, as the project page.
    const dataDate = scenarioDataDate(scenario.activities, today);
    try {
      schedule = scenario.settings.dependencyMode
        ? computeDependencySchedule(
            scenario.activities,
            scenario.dependencies,
            scenario.startDate,
            scenario.settings.probabilityTarget,
            calendar,
            scenario.milestones,
            dataDate,
          )
        : computeSchedule(
            scenario.activities,
            scenario.startDate,
            scenario.settings.probabilityTarget,
            calendar,
            dataDate,
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

/**
 * Does it draw an S-curve? Only when its results carry at least one sample. A save to this browser
 * drops the samples unless "store full simulation data" is on (the default is off), so after a
 * reload a run scenario can keep its percentiles and have no samples — `[]`, which is truthy, and
 * which used to draw a flat line along the axis's 0.
 */
function drawsCurve(e: ComparisonEntry): boolean {
  return (e.scenario.simulationResults?.samples.length ?? 0) > 0;
}

/** A Run is offered under its name: it can run, and draws no curve (see `ComparisonColumn.offerRun`). */
function offersRun(e: ComparisonEntry, gate: CompareRunGate | null): boolean {
  return canRun(e, gate) && !drawsCurve(e);
}

/**
 * The grey note: the scenarios offered a Run, and nothing else. Those without results are asked for
 * by name — or as "all scenarios" when that is every compared scenario; those whose results lost
 * their samples get the curve sentence. One space between the two.
 */
function runNoteOf(entries: ComparisonEntry[], gate: CompareRunGate | null): string | null {
  const offered = entries.filter((e) => offersRun(e, gate));
  const unrun = offered.filter((e) => !e.scenario.simulationResults);
  const curveless = offered.filter((e) => e.scenario.simulationResults);
  const sentences = [
    compareRunNote(unrun.map((e) => e.scenario.name), unrun.length === entries.length),
    compareCurveNote(curveless.map((e) => e.scenario.name)),
  ].filter((s): s is string => s !== null);
  return sentences.length > 0 ? sentences.join(" ") : null;
}

// -- Buffer use, measured against the first column (WI-125) ---------------------------------------

/** The project's work calendar, as the model is given it. */
type CompareCalendar = WorkCalendar | Calendar;

/**
 * What a scenario records as done: its activities In Progress or Complete, and the working days the
 * grid's Actual cell holds for them (the elapsed days, or the actual duration).
 */
function progressOf(scenario: Scenario): { started: number; days: number } {
  const done = scenario.activities.filter((a) => a.status !== "planned");
  return { started: done.length, days: done.reduce((sum, a) => sum + (a.actualDuration ?? 0), 0) };
}

/**
 * A later column reads as a STATUS UPDATE of the first — the one comparison in which "buffer used"
 * means something — when it records progress the first does not: more activities In Progress or
 * Complete, or more working days entered on them. An alternative plan copied from the same scenario
 * records no more than its source, so it shows no buffer use (WI-125's D4; the rule's one false
 * negative is a status update that only re-estimates, its one false positive an alternative plan placed
 * FIRST with a status update of another plan after it).
 */
function recordsProgressBeyond(later: Scenario, first: Scenario): boolean {
  const l = progressOf(later);
  const f = progressOf(first);
  return l.started > f.started || l.days > f.days;
}

/** Working days from `fromISO` to `toISO` on the work calendar (start counted, end not); below 0 when `toISO` is earlier. */
function workingDaysFrom(fromISO: string, toISO: string, calendar?: CompareCalendar): number {
  if (toISO >= fromISO) return countWorkingDays(parseDateISO(fromISO), parseDateISO(toISO), calendar);
  return -countWorkingDays(parseDateISO(toISO), parseDateISO(fromISO), calendar);
}

/** The first column as the reference: its End Date (no buffer), and its Buffer (days) if it has one. */
interface BufferReference {
  name: string;
  endDate: string;
  buffer: number | null;
}

interface BufferCells {
  used: string | null;
  left: string | null;
  pct: string | null;
}

const NO_CELLS: BufferCells = { used: null, left: null, pct: null };

/**
 * One column's three cells. Left is the first column's buffer less the days used — so used + left is
 * the first column's displayed Buffer (days) in every column, by construction (WI-41's lesson: the table
 * never contradicts itself) — and it is also the working days from this column's End Date (no buffer) to
 * the first column's End Date (w/buffer). With no buffer above 0 there is nothing to be left of.
 */
function bufferCellsOf(used: number, buffer: number | null): BufferCells {
  if (buffer === null || buffer <= 0) return { used: String(used), left: null, pct: null };
  return { used: String(used), left: String(buffer - used), pct: `${Math.round((used / buffer) * 100)}%` };
}

const onOff = (on: boolean) => (on ? "on" : "off");
const targetOf = (s: Scenario) => `P${Math.round(s.settings.probabilityTarget * 100)}`;

/** Why nothing can be measured against the first column, or null when it can be the reference. */
function firstColumnReason(first: ComparisonEntry): string | null {
  const lead = `Buffer use is measured against the first column, ${first.scenario.name},`;
  if (first.flags.rows.length > 0) {
    return `${lead} which has validation errors: fix them, then run simulation on ${first.scenario.name}.`;
  }
  if (first.scenario.activities.length === 0) return `${lead} which has no activities.`;
  if (!first.schedule) return `${lead} whose schedule cannot be calculated.`;
  return null;
}

/**
 * Why a later column shows no number, or null when it can. A setting that moves the planned finish — the
 * Activity Target (every planned duration) or Dependencies (how the dates are worked out) — makes the two
 * End Dates (no buffer) different plans, not a slip. The Project Target and Parkinson's Law move only the
 * simulation, so only the first column's own buffer: they need no reason.
 */
function laterColumnReason(later: ComparisonEntry, first: ComparisonEntry): string | null {
  const l = later.scenario;
  const f = first.scenario;
  if (!recordsProgressBeyond(l, f)) {
    return `${l.name} records no more progress than ${f.name} (activities In Progress or Complete), so it is read as another plan, not a status update, and shows no buffer use.`;
  }
  if (later.flags.rows.length > 0) return `Fix ${l.name}'s validation errors to see its buffer use.`;
  if (!later.schedule) return `${l.name}'s schedule cannot be calculated, so its buffer use cannot be shown.`;
  if (targetOf(l) !== targetOf(f)) {
    return `${l.name}'s Activity Target is ${targetOf(l)} and ${f.name}'s is ${targetOf(f)}, which moves every planned duration: set them the same to see ${l.name}'s buffer use.`;
  }
  if (l.settings.dependencyMode !== f.settings.dependencyMode) {
    return `Dependencies is ${onOff(l.settings.dependencyMode)} for ${l.name} and ${onOff(f.settings.dependencyMode)} for ${f.name}, which changes how the End Date (no buffer) is worked out: set it the same for both to see ${l.name}'s buffer use.`;
  }
  return null;
}

/** The note's first sentences: what the rows are measured against, and what the first column's buffer allows. */
function referenceSentence(ref: BufferReference): string {
  const used = `the working days a column's End Date (no buffer) has moved past ${ref.name}'s — below 0, days were recovered.`;
  if (ref.buffer === null) {
    return `Buffer used is measured against the first column, ${ref.name}: ${used} Buffer left and Buffer used (%) need ${ref.name}'s buffer: run simulation on ${ref.name} to calculate it.`;
  }
  if (ref.buffer <= 0) {
    return `Buffer used is measured against the first column, ${ref.name}: ${used} ${ref.name}'s Buffer (days) is ${ref.buffer === 0 ? "0" : "below 0"}, so it has no buffer for a column to use.`;
  }
  return `Buffer used and Buffer left are measured against the first column, ${ref.name}, and its ${ref.buffer} buffer ${pluralize(ref.buffer, "day")}. Used: ${used} Left: ${ref.buffer} less used. A column's own Buffer (days) is recalculated from the work still ahead, so it is not its buffer left.`;
}

/** The column that records the least progress — the likeliest baseline among those given. */
function leastProgress(entries: ComparisonEntry[]): ComparisonEntry {
  return entries.reduce((least, e) => (recordsProgressBeyond(least.scenario, e.scenario) && !recordsProgressBeyond(e.scenario, least.scenario) ? e : least));
}

/**
 * With the rows hidden: when the first column records progress a later one lacks, a later status update
 * probably sits first (its tab was dragged before its source's) — say how to see its buffer use, naming the
 * column that records the least progress as the one to move.
 */
function reorderHint(first: ComparisonEntry, later: ComparisonEntry[]): string | null {
  const behind = later.filter((e) => recordsProgressBeyond(first.scenario, e.scenario));
  if (behind.length === 0) return null;
  const f = first.scenario.name;
  const b = leastProgress(behind).scenario.name;
  return `Buffer use is measured against the first column. To see ${f}'s use of ${b}'s buffer, drag ${b}'s tab to the left of ${f}'s.`;
}

interface BufferUseModel {
  rows: ComparisonRow[];
  note: string | null;
}

/** The three buffer-use rows and their note, or none — see `recordsProgressBeyond` for when they show. */
function bufferUseOf(entries: ComparisonEntry[], calendar?: CompareCalendar): BufferUseModel {
  const [first, ...later] = entries;
  if (!first || later.length === 0) return { rows: [], note: null };
  if (!later.some((e) => recordsProgressBeyond(e.scenario, first.scenario))) {
    return { rows: [], note: reorderHint(first, later) };
  }
  const blocked = firstColumnReason(first);
  const ref: BufferReference | null = blocked
    ? null
    : { name: first.scenario.name, endDate: first.schedule!.projectEndDate, buffer: first.buffer?.bufferDays ?? null };
  const reasons: string[] = [];
  const cells = entries.map((e, i) => {
    if (!ref) return NO_CELLS;
    if (i === 0) return bufferCellsOf(0, ref.buffer);
    const reason = laterColumnReason(e, first);
    if (reason) {
      reasons.push(reason);
      return NO_CELLS;
    }
    return bufferCellsOf(workingDaysFrom(ref.endDate, e.schedule!.projectEndDate, calendar), ref.buffer);
  });
  const lead = ref ? referenceSentence(ref) : blocked!;
  return {
    rows: [
      { label: "Buffer used (days)", values: cells.map((c) => c.used) },
      { label: "Buffer left (days)", values: cells.map((c) => c.left) },
      { label: "Buffer used (%)", values: cells.map((c) => c.pct) },
    ],
    note: [lead, ...reasons].join(" "),
  };
}

function rowsOf(entries: ComparisonEntry[], calendar: WorkCalendar | Calendar | undefined, formatDate: (iso: string) => string, bufferRows: ComparisonRow[]): ComparisonRow[] {
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
      // Each scenario's own Finish Target date (WI-132; per scenario since v0.78.0), in the summary
      // card's words and in its order: right after Start Date (v0.78.4). An INPUT, not a result, so it
      // never competes for "best": no `highlights`.
      label: "Finish Target",
      values: entries.map((e) => (e.scenario.targetFinishDate ? formatDate(e.scenario.targetFinishDate) : null)),
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
    // WI-125: how much of the FIRST column's buffer a later status update has used — right after the
    // buffer it counts against. Never highlighted: less used is not a better plan, only a later reading.
    ...bufferRows,
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
 * Since v0.75.0 "have samples" means AT LEAST ONE (`drawsCurve`): results whose samples were not
 * stored draw no curve either, where they used to draw a flat line along the axis's 0.
 */
function cdfOf(entries: ComparisonEntry[]): ComparisonCdf | null {
  const withSamples = entries.filter(drawsCurve);
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
  today = todayISO(),
}: ComparisonModelInput): ComparisonModel {
  // WI-154: results from an earlier data date are not compared — each such scenario is shown as not
  // run (so the screen offers its Run), and the stale note names it. The store is never written.
  const stale = scenarios.map((s) => staleResults(s, today, calendar));
  const entries = scenarios.map((s, i) => computeEntry(stale[i] ? { ...s, simulationResults: undefined } : s, calendar, today));
  const staleNames = scenarios.filter((_, i) => stale[i]).map((s) => s.name);
  const firstStale = stale.find((x) => x !== null);
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
  const bufferUse = bufferUseOf(entries, calendar);
  return {
    columns: entries.map((e) => ({
      id: e.scenario.id,
      name: e.scenario.name,
      flaggedCount: e.flags.rows.length,
      offerRun: offersRun(e, runGate),
    })),
    rows: rowsOf(entries, calendar, formatDate, bufferUse.rows),
    flagNotes,
    bufferNote: bufferUse.note,
    runNote: runNoteOf(entries, runGate),
    failNote: failing.length > 0 ? `Could not compute a schedule for: ${failures}` : null,
    staleNote: firstStale ? staleScenariosSentence(staleNames, firstStale.dataDate, formatDate, "before comparing") : null,
    cdf: cdfOf(entries),
  };
}
