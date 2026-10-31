// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { nameOrUnnamed } from "@domain/helpers/display-name";
import { pluralize } from "@domain/helpers/format-labels";

/**
 * WI-137 release 2 — the words for an activity's Planned Start and Planned Finish, kept apart from
 * the components so the Edit Activity window, the grid's toast and the bulk toolbar's say the same
 * thing, and a test can hold each sentence.
 */

/**
 * What the pair IS (owner, R630 ruling 5b): the window's two labels carry it as their tooltip and
 * their accessible description. "When it left Planned": the edits made in the same window visit or
 * the same bulk Apply are part of it (ruling 5a), and nothing moves it afterwards — only the one
 * Status rule writes the pair, and only when the activity leaves Planned. WI-154 (owner, R639, C′):
 * the plan's dates, without today's floor, so a late start keeps the date it was late against.
 */
export const PLANNED_DATES_DEFINITION =
  "Planned Start and Planned Finish: the dates the plan gave the activity when it left Planned, without moving work that has not started to today. The schedule does not move them afterwards.";

/**
 * The visible line under an In Progress line whose Planned Start is a dash (ruling 2; Review 33,
 * F5, F14, W3). It names no single cause, because the window cannot tell which one it was: a row
 * started before v0.81.0, a spreadsheet import's started row (`flat-activity-parser.ts` writes a
 * Status and no date) and a reforecast copy's In Progress row (`withoutRecordedDates`) all have
 * none, and so has a row that left Planned while the schedule could not be calculated.
 */
export const NO_PLANNED_START_LINE =
  "No Planned Start was kept for this activity. Planned dates are kept when an activity leaves Planned while the schedule can be calculated, from version 0.81.0 on. One started earlier, imported from a spreadsheet as already started, or carried into a reforecast copy has none.";

/**
 * The toast when a Status change takes activities out of Planned while the schedule cannot be
 * calculated (ruling 7c; Review 33, F4): no Planned date is kept, and the Status change itself is
 * still made. The grid names its one activity; a bulk Apply gives the count.
 */
export function noPlanKeptMessage(count: number, name?: string): string {
  const many = name === undefined && count !== 1;
  const who = name === undefined ? `${count} ${pluralize(count, "activity", "activities")}` : nameOrUnnamed(name);
  return `No Planned dates were kept for ${who}: the schedule could not be calculated when ${many ? "they" : "it"} left Planned. ${many ? "Their" : "Its"} Status changed all the same.`;
}
