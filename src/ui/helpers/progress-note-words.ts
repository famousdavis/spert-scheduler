// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type {
  ConstraintProgressNote,
  DataDateProgressNote,
  DependencyType,
  LinkProgressNote,
  ProgressNote,
} from "@domain/models/types";
import { nameOrUnnamed } from "@domain/helpers/display-name";
import { CONSTRAINT_LABELS } from "@domain/helpers/constraint-labels";
import { pluralize } from "@domain/helpers/format-labels";

/**
 * WI-137: the sentence a neutral progress note shows — on the project page (`ProgressNotesPanel`)
 * and in the Edit Activity window alike. Composed here from the note's FIELDS, never by rewriting a
 * sentence the engine wrote, so a date inside an activity's name ("Cutover 2026-11-15") is shown as
 * typed, and every date the note names goes through the user's date format.
 */
export function progressNoteSentence(note: ProgressNote, formatDate: (iso: string) => string): string {
  if (note.kind === "link") return linkSentence(note, formatDate);
  if (note.kind === "constraint") return constraintSentence(note, formatDate);
  if (note.kind === "data-date") return dataDateSentence([note], formatDate);
  return `${nameOrUnnamed(note.activityName)} started on ${formatDate(note.date)}, before this scenario's Start Date, ${formatDate(note.startDate)}, so the schedule shows it starting on ${formatDate(note.startDate)}.`;
}

/** One stable key per note: an activity has at most one note of each kind per link or constraint. */
export function progressNoteKey(n: ProgressNote): string {
  if (n.kind === "link") return `link-${n.predecessorId}-${n.activityId}-${n.dependencyType}`;
  if (n.kind === "constraint") return `constraint-${n.activityId}`;
  if (n.kind === "data-date") return `data-date-${n.activityId}`;
  return `start-date-${n.activityId}`;
}

/** The names a grouped line shows before "and N more". */
const NAMES_SHOWN = 3;

/** "A", "A and B", "A, B and C", "A, B, C and 2 more activities". */
function nameList(names: string[]): string {
  const shown = names.slice(0, NAMES_SHOWN);
  const more = names.length - shown.length;
  if (more > 0) return `${shown.join(", ")} and ${more} more ${pluralize(more, "activity", "activities")}`;
  return shown.length === 1 ? shown[0]! : `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
}

/** WI-154: the rule behind the data date's line — it applies only once a start is recorded (Review 35, W2). */
const DATA_DATE_RULE = "Once a start is recorded in a scenario, work that has not started is not scheduled before today.";

/** "today, 10/27/2026", or on a weekend or holiday "on 11/02/2026, the next working day" (W3). */
function dataDateWhen(note: DataDateProgressNote, formatDate: (iso: string) => string): string {
  return note.date === note.today
    ? `today, ${formatDate(note.date)}`
    : `on ${formatDate(note.date)}, the next working day`;
}

/**
 * WI-154: the rows the data date moved. One row (the Edit Activity window, or a lone row): its own
 * dates. Several (the project page and print): ONE line, naming the first three — a large import
 * can float dozens, and the panel has no cap (Review 34, R2).
 */
function dataDateSentence(notes: DataDateProgressNote[], formatDate: (iso: string) => string): string {
  const first = notes[0]!;
  if (notes.length === 1) {
    return `${nameOrUnnamed(first.activityName)} has not started, and ${formatDate(first.logicStart)} has passed, so the schedule starts it ${dataDateWhen(first, formatDate)}. ${DATA_DATE_RULE}`;
  }
  const names = nameList(notes.map((n) => nameOrUnnamed(n.activityName)));
  return `${names} have not started, so the schedule starts them ${dataDateWhen(first, formatDate)}, not on days that have passed. ${DATA_DATE_RULE}`;
}

/** A link note whose predecessor has not started (WI-154: Review 35, interactions G3). */
function isOutOfSequence(n: ProgressNote): n is LinkProgressNote {
  return n.kind === "link" && !!n.predecessorNotStarted;
}

/**
 * Several such notes: ONE line on the page and in print, naming the activities that started, the
 * first three (G3 — an import with out-of-sequence progress can add one per link). The Edit Activity
 * window shows each of its row's notes in full.
 */
function outOfSequenceLine(notes: LinkProgressNote[]): string {
  const names = [...new Set(notes.map((n) => nameOrUnnamed(n.activityName)))];
  const rule = "the schedule does not hold work that has started back for work that has not.";
  const one = names.length === 1;
  const after = notes.some((n) => n.workAfter) ? ` ${followWords(one)}` : "";
  if (notes[0]!.sequential) {
    return `${nameList(names)} ${one ? "has" : "have"} started, but the activity above ${one ? "it" : "each of them"} has not: ${rule}${after}`;
  }
  return one
    ? `${names[0]} has started, but some of its predecessors have not: ${rule}${after}`
    : `${nameList(names)} have started, but some of their predecessors have not: ${rule}${after}`;
}

/**
 * WI-154 (owner, 2026-10-31, Q2): the work after such an activity is not held back for that work on
 * its account either — the schedule's progress override, which can make a forecast finish earlier.
 */
function followWords(one: boolean): string {
  return `Work after ${one ? "it" : "them"} is not held back for that work on ${one ? "its" : "their"} account either.`;
}

/** One out-of-sequence note on the page or in print, with Q2's sentence when work follows it. */
function outOfSequenceSentence(note: LinkProgressNote, formatDate: (iso: string) => string): string {
  const own = progressNoteSentence(note, formatDate);
  if (!note.workAfter) return own;
  const succ = nameOrUnnamed(note.activityName);
  const pred = nameOrUnnamed(note.predecessorName);
  return note.sequential
    ? `${own} The activity below ${succ} is not held back for ${pred} on its account either.`
    : `${own} Work after ${succ} is not held back for ${pred} on its account either.`;
}

/**
 * The lines a list of notes shows on the project page and in print: one per note, except the
 * data date's and (several of them) the out-of-sequence ones, which are each ONE line where the
 * first of them stands.
 */
export function progressNoteLines(
  notes: readonly ProgressNote[], formatDate: (iso: string) => string,
): { key: string; sentence: string }[] {
  const dataDate = notes.filter((n): n is DataDateProgressNote => n.kind === "data-date");
  const outOfSequence = notes.filter(isOutOfSequence);
  const grouped = outOfSequence.length > 1;
  const lines: { key: string; sentence: string }[] = [];
  for (const n of notes) {
    if (n.kind === "data-date") {
      if (n === dataDate[0]) lines.push({ key: "data-date", sentence: dataDateSentence(dataDate, formatDate) });
    } else if (grouped && isOutOfSequence(n)) {
      if (n === outOfSequence[0]) lines.push({ key: "out-of-sequence", sentence: outOfSequenceLine(outOfSequence) });
    } else if (isOutOfSequence(n)) {
      lines.push({ key: progressNoteKey(n), sentence: outOfSequenceSentence(n, formatDate) });
    } else {
      lines.push({ key: progressNoteKey(n), sentence: progressNoteSentence(n, formatDate) });
    }
  }
  return lines;
}

const LINK_TYPE_WORDS: Record<DependencyType, string> = {
  FS: "finish-to-start",
  SS: "start-to-start",
  FF: "finish-to-finish",
};

/** "3 days' lag", "1 day's lag", "2 days' lead". */
function lagWords(lagDays: number): string {
  const n = Math.abs(lagDays);
  const unit = pluralize(n, "day's", "days'");
  return `${n} ${unit} ${lagDays > 0 ? "lag" : "lead"}`;
}

function keeps(event: "start" | "finish"): string {
  return event === "start" ? "The schedule keeps the start you recorded." : "The schedule keeps the dates you recorded.";
}

/**
 * WI-154 (Review 35, verification E4 and interactions W7): the predecessor has not started, so the
 * words never say it started or finished — they give its dates as scheduled.
 */
function notStartedSentence(
  note: LinkProgressNote, scheduled: { start: string; finish: string }, formatDate: (iso: string) => string,
): string {
  const succ = nameOrUnnamed(note.activityName);
  const pred = note.sequential
    ? `${nameOrUnnamed(note.predecessorName)}, the activity above it,`
    : `its predecessor ${nameOrUnnamed(note.predecessorName)}`;
  const when = scheduled.start === scheduled.finish
    ? `scheduled for ${formatDate(scheduled.start)}`
    : `scheduled from ${formatDate(scheduled.start)} to ${formatDate(scheduled.finish)}`;
  const holds = "The schedule does not hold work that has started back for work that has not.";
  if (note.unrecorded) {
    return `${succ} is ${note.unrecorded === "complete" ? "complete" : "in progress"}, but ${pred} has not started (it is ${when}). ${holds}`;
  }
  if (note.forecast) return `${succ} has started, but ${pred} has not (it is ${when}). ${holds}`;
  const verb = note.event === "start" ? "started" : "finished";
  return `${succ} ${verb} on ${formatDate(note.date)}, but ${pred} has not started (it is ${when}). ${keeps(note.event)}`;
}

function linkSentence(note: LinkProgressNote, formatDate: (iso: string) => string): string {
  if (note.predecessorNotStarted) return notStartedSentence(note, note.predecessorNotStarted, formatDate);
  const succ = nameOrUnnamed(note.activityName);
  const pred = nameOrUnnamed(note.predecessorName);
  const verb = note.event === "start" ? "started" : "finished";
  const date = formatDate(note.date);
  // With a lag or a lead, the predecessor's own date is not what the link allowed: name the date
  // it did allow, or the sentence says "before" a date the activity is after (Review 32, E2).
  if (note.lagDays !== 0) {
    const link = `${LINK_TYPE_WORDS[note.dependencyType]}, ${lagWords(note.lagDays)}`;
    return `${succ} ${verb} on ${date}; its link from ${pred} (${link}) allowed ${formatDate(note.allowedDate)} at the earliest. ${keeps(note.event)}`;
  }
  const who = note.sequential ? `${pred}, the activity above it,` : pred;
  const predDate = formatDate(note.predecessorDate);
  if (note.dependencyType === "SS") {
    return `${succ} started on ${date}, before ${who} started on ${predDate}. ${keeps("start")}`;
  }
  if (note.date === note.predecessorDate) return sameDaySentence(note, succ, who, formatDate);
  const predEnd = note.predecessorComplete
    ? `finished on ${predDate}`
    : `finished (it is scheduled to finish on ${predDate})`;
  return `${succ} ${verb} on ${date}, before ${who} ${predEnd}. ${keeps(note.event)}`;
}

/**
 * WI-137 release 2 (owner, R625): a start ON the predecessor's finish day. A finish-to-start link
 * without lag allows the NEXT working day, so the note is real — but "before B finished on 10/30"
 * beside a start on 10/30 reads as a contradiction. Only FS without lag reaches here: SS and FF need
 * a strictly earlier date, and a lag or a lead takes the sentence above, which names no predecessor
 * date. So the sentence names the day it allowed instead (the lag sentence's own form).
 */
function sameDaySentence(
  note: LinkProgressNote, succ: string, who: string, formatDate: (iso: string) => string,
): string {
  const predDay = note.predecessorComplete ? `${who} finished` : `${who} is scheduled to finish`;
  const allowed = formatDate(note.allowedDate);
  const why = note.sequential
    ? `with dependencies off, it could start on ${allowed} at the earliest`
    : `its finish-to-start link allowed ${allowed} at the earliest`;
  return `${succ} started on ${formatDate(note.date)}, the day ${predDay}; ${why}. ${keeps("start")}`;
}

function constraintSentence(note: ConstraintProgressNote, formatDate: (iso: string) => string): string {
  const name = nameOrUnnamed(note.activityName);
  const verb = note.event === "start" ? "started" : "finished";
  const label = CONSTRAINT_LABELS[note.constraintType];
  const type = note.constraintType;
  let relation = "after";
  if (type === "MSO" || type === "MFO") relation = "not on";
  else if (type === "SNET" || type === "FNET") relation = "before";
  return `${name} ${verb} on ${formatDate(note.date)}, ${relation} its ${label} date, ${formatDate(note.constraintDate)}. ${keeps(note.event)}`;
}
