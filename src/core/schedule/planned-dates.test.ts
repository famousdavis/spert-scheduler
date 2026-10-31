// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import type { Activity, ActivityStatus } from "@domain/models/types";
import { statusChangeUpdates, type StatusChangeContext } from "./recorded-progress";

/**
 * WI-137 release 2 — the Planned Start and Planned Finish, as the one Status rule keeps them
 * (owner, R625: "Freeze the start and finish dates (b)"). Today is Tue 2026-10-27; the schedule
 * shows the row 10-19 .. 10-30 (10 days) unless a row says otherwise. Every expected value is
 * written out here, never computed by the rule under test.
 */
const SCHEDULED: StatusChangeContext = {
  today: "2026-10-27", scheduledStart: "2026-10-19", scheduledFinish: "2026-10-30", scheduledDuration: 10, calendar: undefined,
};
const NO_SCHEDULE: StatusChangeContext = { today: "2026-10-27", calendar: undefined };

function row(status: ActivityStatus, extra: Partial<Activity> = {}): Activity {
  return {
    id: "x", name: "X", min: 9, mostLikely: 10, max: 11, confidenceLevel: "mediumConfidence",
    distributionType: "uniform", status, ...extra,
  };
}

const PAIR = { plannedStartDate: "2026-10-12", plannedFinishDate: "2026-10-23" };

/** [name, row, to, context, the Planned pair the result carries — "absent" means the keys are not in it] */
type PairOut = { plannedStartDate: string | undefined; plannedFinishDate: string | undefined } | "absent";
const rows: [string, Activity, ActivityStatus, StatusChangeContext, PairOut][] = [
  ["Planned → In Progress keeps the schedule's start and finish", row("planned"), "inProgress", SCHEDULED,
    { plannedStartDate: "2026-10-19", plannedFinishDate: "2026-10-30" }],
  ["Planned → Complete, not yet due, keeps them too", row("planned"), "complete", SCHEDULED,
    { plannedStartDate: "2026-10-19", plannedFinishDate: "2026-10-30" }],
  ["Planned → Complete, already due: the plan and the actuals are the same dates", row("planned"), "complete",
    { ...SCHEDULED, scheduledStart: "2026-10-05", scheduledFinish: "2026-10-16" },
    { plannedStartDate: "2026-10-05", plannedFinishDate: "2026-10-16" }],
  ["Planned → In Progress with no schedule (a cycle, a calendar error): none kept", row("planned"), "inProgress", NO_SCHEDULE,
    { plannedStartDate: undefined, plannedFinishDate: undefined }],
  ["Planned → Complete with no schedule: none kept", row("planned"), "complete", NO_SCHEDULE,
    { plannedStartDate: undefined, plannedFinishDate: undefined }],
  ["a start without a finish is no schedule: none kept", row("planned"), "inProgress",
    { ...SCHEDULED, scheduledFinish: undefined }, { plannedStartDate: undefined, plannedFinishDate: undefined }],
  ["a Planned row carrying a pair (an import) gets the schedule's, never its own", row("planned", PAIR), "inProgress", SCHEDULED,
    { plannedStartDate: "2026-10-19", plannedFinishDate: "2026-10-30" }],
  ["… and with no schedule that pair is cleared, not kept", row("planned", PAIR), "complete", NO_SCHEDULE,
    { plannedStartDate: undefined, plannedFinishDate: undefined }],
  ["In Progress → Complete leaves the pair as it is", row("inProgress", { ...PAIR, actualStartDate: "2026-10-19" }), "complete", SCHEDULED, "absent"],
  ["Complete → In Progress leaves it too", row("complete", { ...PAIR, actualStartDate: "2026-10-19", actualFinishDate: "2026-10-23" }), "inProgress", SCHEDULED, "absent"],
  ["a row started before v0.81.0 set to Complete gets NO pair — never today's schedule (no back-fill)",
    row("inProgress", { actualStartDate: "2026-10-19" }), "complete", SCHEDULED, "absent"],
  ["a row started before v0.80.0 (no date at all) set to Complete gets none either",
    row("inProgress", { actualDuration: 3 }), "complete", SCHEDULED, "absent"],
  ["In Progress → Planned clears it", row("inProgress", { ...PAIR, actualStartDate: "2026-10-19" }), "planned", SCHEDULED,
    { plannedStartDate: undefined, plannedFinishDate: undefined }],
  ["Complete → Planned clears it", row("complete", { ...PAIR, actualStartDate: "2026-10-19", actualFinishDate: "2026-10-23" }), "planned", SCHEDULED,
    { plannedStartDate: undefined, plannedFinishDate: undefined }],
];

describe("the Planned pair, by the one Status rule — a decision table", () => {
  for (const [name, activity, to, ctx, expected] of rows) {
    it(name, () => {
      const u = statusChangeUpdates(activity, to, ctx);
      if (expected === "absent") {
        expect("plannedStartDate" in u || "plannedFinishDate" in u).toBe(false);
      } else {
        expect(["plannedStartDate" in u, "plannedFinishDate" in u]).toEqual([true, true]);
        expect({ plannedStartDate: u.plannedStartDate, plannedFinishDate: u.plannedFinishDate }).toStrictEqual(expected);
      }
    });
  }

  it("no change of Status writes nothing at all", () => {
    for (const s of ["planned", "inProgress", "complete"] as const) {
      expect(statusChangeUpdates(row(s, PAIR), s, SCHEDULED)).toStrictEqual({});
    }
  });

  it("the Actual dates are exactly as release 1 wrote them: the capture is beside them, never instead", () => {
    expect(statusChangeUpdates(row("planned"), "inProgress", SCHEDULED)).toStrictEqual({
      plannedStartDate: "2026-10-19", plannedFinishDate: "2026-10-30",
      actualStartDate: "2026-10-27", actualFinishDate: undefined, actualDuration: 1,
    });
  });
});
