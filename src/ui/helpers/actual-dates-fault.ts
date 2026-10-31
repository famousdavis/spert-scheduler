// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { ActivityStatus } from "@domain/models/types";

/** What is wrong with the Edit Activity window's Actual Start and Actual Finish, if anything (WI-137). */
export type ActualDatesFault =
  | "finishWithoutStart"
  | "startBeforeStartDate"
  | "startAfterToday"
  | "finishAfterToday"
  | "startAfterFinish"
  | "finishBeforeStart";

/**
 * The first fault in the two date drafts, or `null`. The window refuses to save while there is one
 * (`unsaveableCause`'s `actualDates`), so no impossible pair is ever stored: a finish with no start
 * (the schedule could not use it), a start before the scenario's Start Date, a date after today,
 * or a finish before its start. A Planned row saves no dates and an In Progress row no finish, so
 * those drafts are not judged. `lastEdited` names which of an out-of-order pair is at fault.
 * All dates are `YYYY-MM-DD`, so they compare as strings.
 */
export function actualDatesFault(args: {
  status: ActivityStatus;
  start: string;
  finish: string;
  today: string;
  scenarioStart: string | undefined;
  lastEdited: "start" | "finish";
}): ActualDatesFault | null {
  if (args.status === "planned") return null;
  const { start, today, scenarioStart } = args;
  const finish = args.status === "complete" ? args.finish : "";
  if (finish && !start) return "finishWithoutStart";
  if (start && scenarioStart && start < scenarioStart) return "startBeforeStartDate";
  if (start > today) return "startAfterToday";
  if (finish > today) return "finishAfterToday";
  if (start && finish && finish < start) return args.lastEdited === "start" ? "startAfterFinish" : "finishBeforeStart";
  return null;
}

/** The field each fault marks `aria-invalid` and describes. */
export const ACTUAL_DATES_FAULT_FIELD: Record<ActualDatesFault, "start" | "finish"> = {
  finishWithoutStart: "finish",
  startBeforeStartDate: "start",
  startAfterToday: "start",
  finishAfterToday: "finish",
  startAfterFinish: "start",
  finishBeforeStart: "finish",
};

/** The red line under the dates, tied to the field at fault by `aria-describedby`. */
export const ACTUAL_DATES_FAULT_LINE: Record<ActualDatesFault, string> = {
  finishWithoutStart: "Enter the Actual Start first.",
  startBeforeStartDate: "The Actual Start cannot be before this scenario's Start Date.",
  startAfterToday: "The Actual Start cannot be after today.",
  finishAfterToday: "The Actual Finish cannot be after today.",
  startAfterFinish: "The Actual Start cannot be after the Actual Finish.",
  finishBeforeStart: "The Actual Finish cannot be before the Actual Start.",
};
