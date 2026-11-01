// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { ActivityStatus } from "@domain/models/types";

/** What is wrong with an activity's Actual Start and Actual Finish, if anything (WI-137). */
export type ActualDatesFault =
  | "finishWithoutStart"
  | "startBeforeStartDate"
  | "startAfterToday"
  | "finishAfterToday"
  | "startAfterFinish"
  | "finishBeforeStart";

/**
 * The first fault in the two dates, or `null`. The Edit Activity window refuses to save while there
 * is one (`unsaveableCause`'s `actualDates`), and the CSV importer refuses the row (WI-150), so no
 * impossible pair is ever stored by either: a finish with no start (the schedule could not use it),
 * a start before the scenario's Start Date, a date after today, or a finish before its start. A
 * Planned row saves no dates and an In Progress row no finish, so those are not judged.
 * `lastEdited` names which of an out-of-order pair is at fault. `scenarioStart` is left out by the
 * importer: an import sets the scenario's Start Date itself. All dates are `YYYY-MM-DD`, so they
 * compare as strings.
 *
 * Moved here from `ui/helpers/actual-dates-fault.ts` (WI-150), unchanged, so the importer in
 * `/core` can ask the same question the window asks; that file re-exports it.
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
