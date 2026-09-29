// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { TOAST_NAMED_LIMIT } from "@ui/helpers/run-blocked-message";

/**
 * Why a scenario's schedule could not be calculated, decided as the schedule-error banner decides it
 * (`getScheduleErrorBanner`): a dependency cycle first, then a calendar error, then an estimate — and an
 * estimate only when a flagged row's own distribution cannot be built. Anything else is "other".
 */
export type ScheduleErrorKind = "none" | "estimate" | "cycle" | "calendar" | "other";

/** The two booleans the page's typed `ScheduleError` carries; enough to classify it. */
export interface ClassifiableError {
  isCycleError: boolean;
  isCalendarError: boolean;
}

export function scheduleErrorKind(error: ClassifiableError | null, anyStops: boolean): ScheduleErrorKind {
  if (!error) return "none";
  if (error.isCycleError) return "cycle";
  if (error.isCalendarError) return "calendar";
  return anyStops ? "estimate" : "other";
}

/**
 * Where the sentences are shown: a note under the Compare table ("compare"), the same note in the
 * printed comparison ("compare-print" — Compare's words, EVERY row: paper has no tab to go to for the
 * rest, WI-61), or the box on a printout's first page ("print").
 */
export type FlagSurface = "compare" | "compare-print" | "print";

export interface FlagNoteRow {
  /** `#7 Organizational Change Management Program`, or the name alone — numbered by the CALLER, per surface. */
  label: string;
  /** The validation summary's messages for this row. */
  messages: readonly string[];
}

export interface FlagNoteInput {
  scenarioName: string;
  rows: readonly FlagNoteRow[];
  /** Some row's distribution cannot be built. */
  anyStops: boolean;
  errorKind: ScheduleErrorKind;
}

export interface FlagNote {
  /** Compare: `Fast-track: 1 activity has validation errors.` · print: `1 activity has validation errors`. */
  heading: string;
  /** One line per row, in the summary's words. Compare shows at most `TOAST_NAMED_LIMIT`; paper, every row. */
  rows: string[];
  /** Compare only, past the limit: `and 2 more.` */
  more: string | null;
  /** What the flags stop, until they are fixed. */
  consequence: string;
}

/**
 * The validation summary's heading, word for word (`ValidationSummary.tsx`). A novice cannot tell two
 * differently worded rules apart, so no surface may say the same thing in new words (WI-15's rule).
 */
export function validationErrorsHeading(count: number): string {
  return `${count} activit${count === 1 ? "y has" : "ies have"} validation errors`;
}

/** A note's sentence ends with a period — unless its last message already does (`Enter 0 or more.`). */
function asSentence(text: string): string {
  return text.endsWith(".") ? text : `${text}.`;
}

const CONSEQUENCES: Record<"compare" | "print", { calculate: string; calculateAll: string; simulate: string; simulateAll: string }> = {
  compare: {
    calculate: "Its schedule cannot be calculated until this is fixed.",
    calculateAll: "Its schedule cannot be calculated. It cannot be simulated until these are fixed.",
    simulate: "It cannot be simulated until this is fixed.",
    simulateAll: "It cannot be simulated until these are fixed.",
  },
  print: {
    calculate: "This scenario's schedule cannot be calculated until this is fixed.",
    calculateAll: "This scenario's schedule cannot be calculated. It cannot be simulated until these are fixed.",
    simulate: "This scenario cannot be simulated until this is fixed.",
    simulateAll: "This scenario cannot be simulated until these are fixed.",
  },
};

/**
 * What a flagged scenario's saved plan stops (WI-58). "cannot be calculated" — the banner's words — only
 * when the schedule's error IS a flagged row's estimate: a cycle or a calendar error fails the schedule
 * with every estimate fine, so there the rows stop the simulation only, and the red note says the rest.
 */
function consequenceOf(input: FlagNoteInput, surface: FlagSurface): string {
  const words = CONSEQUENCES[surface === "print" ? "print" : "compare"];
  const one = input.rows.length === 1;
  if (input.errorKind === "estimate" && input.anyStops) {
    return one ? words.calculate : words.calculateAll;
  }
  return one ? words.simulate : words.simulateAll;
}

/**
 * The sentences for a flagged scenario (WI-58): ONE builder for the Compare notes and the print box, so
 * the two cannot drift. Built from the validation summary's own heading and lines, and the banner's
 * "cannot be calculated". Compare writes sentences (each ending with one period); print follows the
 * summary's own layout (a heading and lines with no period, then one sentence).
 */
export function flagNote(input: FlagNoteInput, surface: FlagSurface): FlagNote {
  const heading = validationErrorsHeading(input.rows.length);
  const lines = input.rows.map((row) => `${row.label}: ${row.messages.join("; ")}`);
  const consequence = consequenceOf(input, surface);
  if (surface === "print") {
    return { heading, rows: lines, more: null, consequence };
  }
  const shown = surface === "compare" ? lines.slice(0, TOAST_NAMED_LIMIT) : lines;
  const hidden = lines.length - shown.length;
  return {
    heading: `${input.scenarioName}: ${heading}.`,
    rows: shown.map(asSentence),
    more: hidden > 0 ? `and ${hidden} more.` : null,
    consequence,
  };
}

/**
 * The grey note under the Compare table, when some compared scenario has no results and CAN be run.
 * Today's words only when EVERY compared scenario can be run; otherwise the ones that can, by name —
 * a flagged, empty or failing scenario cannot, so "all scenarios" would ask for a run the app refuses
 * (owner ruling, 2026-09-27). `null` when nothing can be run.
 */
export function compareRunNote(runnableUnrun: readonly string[], everyCanRun: boolean): string | null {
  if (runnableUnrun.length === 0) return null;
  if (everyCanRun) return "Run simulation on all scenarios for complete comparison data.";
  if (runnableUnrun.length === 1) {
    return `Run simulation on ${runnableUnrun[0]} to add its results to the comparison.`;
  }
  const names = `${runnableUnrun.slice(0, -1).join(", ")} and ${runnableUnrun[runnableUnrun.length - 1]}`;
  return `Run simulation on ${names} to add their results to the comparison.`;
}
