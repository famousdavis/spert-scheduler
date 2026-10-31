// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type {
  ConstraintProgressNote,
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
  return `${nameOrUnnamed(note.activityName)} started on ${formatDate(note.date)}, before this scenario's Start Date, ${formatDate(note.startDate)}, so the schedule shows it starting on ${formatDate(note.startDate)}.`;
}

/** One stable key per note: an activity has at most one note of each kind per link or constraint. */
export function progressNoteKey(n: ProgressNote): string {
  if (n.kind === "link") return `link-${n.predecessorId}-${n.activityId}-${n.dependencyType}`;
  if (n.kind === "constraint") return `constraint-${n.activityId}`;
  return `start-date-${n.activityId}`;
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

function linkSentence(note: LinkProgressNote, formatDate: (iso: string) => string): string {
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
