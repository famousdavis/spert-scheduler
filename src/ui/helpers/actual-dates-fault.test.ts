// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import type { ActivityStatus } from "@domain/models/types";
import { actualDatesFault, ACTUAL_DATES_FAULT_FIELD, ACTUAL_DATES_FAULT_LINE, type ActualDatesFault } from "./actual-dates-fault";
import { saveBlockedReason, unsaveableCause, unsaveableDescription } from "./unsaveable-cause";

const TODAY = "2026-10-27";
const START = "2026-10-05";

describe("actualDatesFault (WI-137, 2d) — a decision table", () => {
  const rows: Array<[string, ActivityStatus, string, string, "start" | "finish", ActualDatesFault | null]> = [
    ["Planned: nothing is judged", "planned", "2026-12-01", "2026-09-01", "finish", null],
    ["In Progress, a good start", "inProgress", "2026-10-19", "", "finish", null],
    ["In Progress, no start yet (a row from before v0.80.0)", "inProgress", "", "", "finish", null],
    ["In Progress: a finish draft is not judged (it is not saved)", "inProgress", "2026-10-19", "2026-10-01", "finish", null],
    ["In Progress: start after today", "inProgress", "2026-10-28", "", "start", "startAfterToday"],
    ["In Progress: start today is fine", "inProgress", TODAY, "", "start", null],
    ["In Progress: start before the Start Date", "inProgress", "2026-10-02", "", "start", "startBeforeStartDate"],
    ["In Progress: start ON the Start Date is fine", "inProgress", START, "", "start", null],
    ["Complete, a good pair", "complete", "2026-10-05", "2026-10-23", "finish", null],
    ["Complete, the same day twice", "complete", "2026-10-23", "2026-10-23", "finish", null],
    ["Complete: a finish with no start", "complete", "", "2026-10-23", "finish", "finishWithoutStart"],
    ["Complete: no dates at all (a row from before v0.80.0)", "complete", "", "", "finish", null],
    ["Complete: finish after today", "complete", "2026-10-05", "2026-10-28", "finish", "finishAfterToday"],
    ["Complete: finish before start, the finish typed last", "complete", "2026-10-19", "2026-10-16", "finish", "finishBeforeStart"],
    ["Complete: finish before start, the start typed last", "complete", "2026-10-19", "2026-10-16", "start", "startAfterFinish"],
    ["Complete: a start before the Start Date is named before the order", "complete", "2026-10-01", "2026-09-30", "finish", "startBeforeStartDate"],
  ];
  for (const [name, status, start, finish, lastEdited, expected] of rows) {
    it(name, () => {
      expect(actualDatesFault({ status, start, finish, today: TODAY, scenarioStart: START, lastEdited })).toBe(expected);
    });
  }

  it("each fault names its field and its line", () => {
    expect(ACTUAL_DATES_FAULT_FIELD).toEqual({
      finishWithoutStart: "finish", startBeforeStartDate: "start", startAfterToday: "start",
      finishAfterToday: "finish", startAfterFinish: "start", finishBeforeStart: "finish",
    });
    expect(ACTUAL_DATES_FAULT_LINE.finishWithoutStart).toBe("Enter the Actual Start first.");
    expect(ACTUAL_DATES_FAULT_LINE.finishBeforeStart).toBe("The Actual Finish cannot be before the Actual Start.");
    expect(ACTUAL_DATES_FAULT_LINE.finishAfterToday).toBe("The Actual Finish cannot be after today.");
  });
});

describe("unsaveableCause — the actual dates (WI-137)", () => {
  it("a fault in the dates refuses Save, asked after every older cause", () => {
    expect(unsaveableCause(false, false, null, null, null, true)).toBe("actualDates");
    expect(unsaveableCause(true, false, null, null, null, true)).toBe("name");
    expect(unsaveableCause(false, true, null, null, null, true)).toBe("negativeEstimate");
    expect(unsaveableCause(false, false, "MSO", null, null, true)).toBe("constraintDate");
    expect(unsaveableCause(false, false, null, null, null, false)).toBeNull();
    expect(unsaveableCause(false, false, null, null, null)).toBeNull();
  });

  it("has its reason line and its discard sentence", () => {
    expect(saveBlockedReason("actualDates")).toBe("Save needs the actual dates corrected, as the line under them says.");
    expect(unsaveableDescription("actualDates")).toBe(
      "An actual date can't be saved as it is, so your changes can't be saved. Discarding them can't be undone.",
    );
  });
});
