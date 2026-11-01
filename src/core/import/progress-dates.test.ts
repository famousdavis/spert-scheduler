// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import type { Activity } from "@domain/models/types";
import {
  chooseDayOrder,
  parseDateCell,
  readRowProgress,
  withImportedCounts,
  type RowDates,
} from "./progress-dates";

// Every expected value below is written out by hand — never computed by calling the code under test.

describe("parseDateCell — one cell", () => {
  const cases: [string, "monthFirst" | "dayFirst", string | "empty" | "number" | "invalid"][] = [
    ["2026-03-02", "monthFirst", "2026-03-02"],
    ["2026/3/2", "dayFirst", "2026-03-02"], // year first is read one way only
    ["03/04/2026", "monthFirst", "2026-03-04"],
    ["03/04/2026", "dayFirst", "2026-04-03"],
    ["3/4/26", "monthFirst", "2026-03-04"], // two-digit year: this century
    ["2-Mar-26", "dayFirst", "2026-03-02"], // P6's default format
    ["02-Mar-2026 A", "monthFirst", "2026-03-02"], // P6's actual-date mark
    ["02-Mar-26*", "monthFirst", "2026-03-02"], // P6's constraint mark
    ["Mon 3/2/26", "monthFirst", "2026-03-02"], // MS Project's default format
    ["3/2/2026 8:00 AM", "monthFirst", "2026-03-02"], // a time pasted from MS Project
    ["Mar 2, 2026", "dayFirst", "2026-03-02"],
    ["March 2 2026", "monthFirst", "2026-03-02"],
    ["2 Sept 2026", "monthFirst", "2026-09-02"],
    ["NA", "monthFirst", "empty"], // MS Project's "no date"
    ["  ", "monthFirst", "empty"],
    ["46083", "monthFirst", "number"], // an Excel serial
    ["31/02/2026", "dayFirst", "invalid"], // 31 February
    ["02/31/2026", "monthFirst", "invalid"],
    ["13/13/2026", "monthFirst", "invalid"],
    ["TBD", "monthFirst", "invalid"],
    ["2-Mrz-26", "monthFirst", "invalid"], // not an English month
  ];
  for (const [raw, order, want] of cases) {
    it(`${JSON.stringify(raw)} read ${order} → ${want}`, () => {
      const got = parseDateCell(raw, order);
      if (want === "empty" || want === "number" || want === "invalid") expect(got).toEqual({ kind: want });
      else expect(got).toEqual({ kind: "date", iso: want });
    });
  }
});

describe("chooseDayOrder — one order for the whole file", () => {
  it("keeps the user's order when nothing proves either", () => {
    expect(chooseDayOrder([{ raw: "03/04/2026", row: 2 }], "monthFirst")).toEqual({ order: "monthFirst" });
  });
  it("switches to day first when a date can only be day first", () => {
    const cells = [{ raw: "03/04/2026", row: 2 }, { raw: "25/03/2026", row: 7 }];
    expect(chooseDayOrder(cells, "monthFirst")).toEqual({ order: "dayFirst", provedBy: { raw: "25/03/2026", row: 7 } });
  });
  it("switches to month first for a DD/MM user when a date can only be month first", () => {
    const cells = [{ raw: "03/25/2026", row: 4 }];
    expect(chooseDayOrder(cells, "dayFirst")).toEqual({ order: "monthFirst", provedBy: { raw: "03/25/2026", row: 4 } });
  });
  it("keeps the user's order when the file proves both", () => {
    const cells = [{ raw: "25/03/2026", row: 2 }, { raw: "03/25/2026", row: 3 }];
    expect(chooseDayOrder(cells, "monthFirst")).toEqual({ order: "monthFirst" });
  });
  it("is not swayed by year-first or named-month dates", () => {
    const cells = [{ raw: "2026-03-25", row: 2 }, { raw: "25-Mar-26", row: 3 }];
    expect(chooseDayOrder(cells, "monthFirst")).toEqual({ order: "monthFirst" });
  });
});

// -- The decision table: Status × which dates → outcome ------------------------------------------

const TODAY = "2026-10-31";

function row(raw: RowDates, statusGiven: "planned" | "inProgress" | "complete" | null, hasActualStartColumn = true) {
  return readRowProgress({ raw, statusGiven, hasActualStartColumn, order: "monthFirst", today: TODAY, row: 5 });
}

describe("readRowProgress — the decision table", () => {
  it("Planned + Actual Start: not imported, with a warning; the row stays Planned", () => {
    const r = row({ actualStart: "10/05/2026" }, "planned");
    expect(r.status).toBe("planned");
    expect(r.fields).toEqual({});
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([{
      row: 5, column: "Status", severity: "warning",
      message: "Status is Planned, so Actual Start was not imported. To keep it, set Status to In Progress or Complete.",
    }]);
  });

  it("Planned + both Actual dates: one warning naming both", () => {
    const r = row({ actualStart: "10/05/2026", actualFinish: "10/09/2026" }, "planned");
    expect(r.warnings.map((w) => w.message)).toEqual([
      "Status is Planned, so Actual Start and Actual Finish were not imported. To keep them, set Status to Complete.",
    ]);
  });

  it("R1 (a), ruled: Planned + a Planned pair — ignored, counted for the file's note, no row warning", () => {
    const r = row({ plannedStart: "11/02/2026", plannedFinish: "11/13/2026" }, "planned");
    expect(r).toEqual({ status: "planned", fields: {}, errors: [], warnings: [], plannedIgnored: true, inferred: false });
  });

  it("In Progress + Actual Start: recorded", () => {
    const r = row({ actualStart: "10/19/2026" }, "inProgress");
    expect(r.fields).toEqual({ actualStartDate: "2026-10-19" });
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it("In Progress with no Actual Start: no record, as before WI-150, and the preview says so", () => {
    const r = row({ actualStart: "" }, "inProgress");
    expect(r.fields).toEqual({});
    expect(r.warnings.map((w) => w.message)).toEqual([
      "Status is In Progress but Actual Start is blank, so no start date is recorded for it.",
    ]);
  });

  it("In Progress with no Actual Start and NO Actual Start column: silent, exactly as before WI-150", () => {
    const r = row({ plannedStart: "", plannedFinish: "" }, "inProgress", false);
    expect(r.warnings).toEqual([]);
    expect(r.fields).toEqual({});
  });

  it("In Progress + Actual Finish: the finish is not imported (the window keeps none), with a warning", () => {
    const r = row({ actualStart: "10/19/2026", actualFinish: "10/23/2026" }, "inProgress");
    expect(r.fields).toEqual({ actualStartDate: "2026-10-19" });
    expect(r.warnings.map((w) => w.message)).toEqual([
      "Status is In Progress, so Actual Finish was not imported. To keep it, set Status to Complete.",
    ]);
  });

  it("Complete + both, in order: both recorded", () => {
    const r = row({ actualStart: "10/05/2026", actualFinish: "10/09/2026" }, "complete");
    expect(r.fields).toEqual({ actualStartDate: "2026-10-05", actualFinishDate: "2026-10-09" });
    expect(r.errors).toEqual([]);
  });

  it("Complete with a start and no finish: refused (stricter than the window, on purpose)", () => {
    const r = row({ actualStart: "10/05/2026", actualFinish: "" }, "complete");
    expect(r.errors).toEqual([{
      row: 5, column: "Actual Finish", severity: "error",
      message: "Status is Complete but Actual Finish is blank. Enter the day it finished, or set Status to In Progress.",
    }]);
  });

  it("a finish without a start: refused, the window's finishWithoutStart", () => {
    const r = row({ actualStart: "", actualFinish: "10/09/2026" }, "complete");
    expect(r.errors.map((e) => e.message)).toEqual([
      "Actual Finish has a date but Actual Start is blank. Enter the Actual Start too, or clear the Actual Finish.",
    ]);
  });

  it("an Actual Start after today: refused", () => {
    const r = row({ actualStart: "11/14/2026" }, "inProgress");
    expect(r.errors).toEqual([{
      row: 5, column: "Actual Start", severity: "error",
      message: 'Actual Start "11/14/2026", read as MM/DD/YYYY (14 November 2026), is after today. An actual date cannot be in the future.',
    }]);
  });

  it("an Actual Finish after today: refused", () => {
    const r = row({ actualStart: "10/05/2026", actualFinish: "11/02/2026" }, "complete");
    expect(r.errors.map((e) => [e.column, e.message])).toEqual([
      ["Actual Finish", 'Actual Finish "11/02/2026", read as MM/DD/YYYY (2 November 2026), is after today. An actual date cannot be in the future.'],
    ]);
  });

  it("today itself is not after today", () => {
    expect(row({ actualStart: "10/31/2026" }, "inProgress").errors).toEqual([]);
  });

  it("an out-of-order pair: refused, naming both", () => {
    const r = row({ actualStart: "03/09/2026", actualFinish: "03/02/2026" }, "complete");
    expect(r.errors.map((e) => e.message)).toEqual(['Actual Finish "03/02/2026" is before Actual Start "03/09/2026" (dates read as MM/DD/YYYY).']);
  });

  it("a start long before any Start Date: recorded — the import sets the Start Date itself", () => {
    expect(row({ actualStart: "01/06/2020" }, "inProgress").fields).toEqual({ actualStartDate: "2020-01-06" });
  });

  it("a started row keeps the file's Planned pair as its plan (owner's view, accepted with R1 (a))", () => {
    const r = row({ actualStart: "10/19/2026", plannedStart: "10/12/2026", plannedFinish: "10/30/2026" }, "inProgress");
    expect(r.fields).toEqual({ actualStartDate: "2026-10-19", plannedStartDate: "2026-10-12", plannedFinishDate: "2026-10-30" });
    expect(r.warnings).toEqual([]);
  });

  it("one Planned date of the two: neither kept, with a warning (both or neither)", () => {
    const r = row({ actualStart: "10/19/2026", plannedStart: "10/12/2026", plannedFinish: "" }, "inProgress");
    expect(r.fields).toEqual({ actualStartDate: "2026-10-19" });
    expect(r.warnings).toEqual([{
      row: 5, column: "Planned Start", severity: "warning",
      message: "Only Planned Start has a date, so neither planned date was imported. An activity keeps both or neither.",
    }]);
  });

  it("an out-of-order Planned pair: neither kept, with a warning", () => {
    const r = row({ actualStart: "10/19/2026", plannedStart: "10/30/2026", plannedFinish: "10/12/2026" }, "inProgress");
    expect(r.fields).toEqual({ actualStartDate: "2026-10-19" });
    expect(r.warnings.map((w) => w.message)).toEqual([
      'Planned Finish "10/12/2026" is before Planned Start "10/30/2026", so neither planned date was imported.',
    ]);
  });

  it("a started row with no Actual Start still keeps its Planned pair", () => {
    const r = row({ actualStart: "", plannedStart: "10/12/2026", plannedFinish: "10/30/2026" }, "inProgress");
    expect(r.fields).toEqual({ plannedStartDate: "2026-10-12", plannedFinishDate: "2026-10-30" });
  });

  it("blank Status + Actual Start: In Progress, inferred", () => {
    const r = row({ actualStart: "10/19/2026", actualFinish: "" }, null);
    expect([r.status, r.inferred]).toEqual(["inProgress", true]);
    expect(r.fields).toEqual({ actualStartDate: "2026-10-19" });
  });

  it("blank Status + both Actual dates: Complete, inferred", () => {
    const r = row({ actualStart: "10/05/2026", actualFinish: "10/09/2026" }, null);
    expect([r.status, r.inferred]).toEqual(["complete", true]);
  });

  it("blank Status + only an Actual Finish: Complete, and refused for the missing start", () => {
    const r = row({ actualStart: "", actualFinish: "10/09/2026" }, null);
    expect(r.status).toBe("complete");
    expect(r.errors.map((e) => e.column)).toEqual(["Actual Finish"]);
  });

  it("blank Status and no dates: Planned, as before WI-150, not counted as inferred", () => {
    expect(row({ actualStart: "", actualFinish: "" }, null)).toEqual({
      status: "planned", fields: {}, errors: [], warnings: [], plannedIgnored: false, inferred: false,
    });
  });

  it("a cell that is not a date: refused, naming the order this file is read in", () => {
    const r = row({ actualStart: "TBD" }, "inProgress");
    expect(r.errors).toEqual([{
      row: 5, column: "Actual Start", severity: "error",
      message: 'Actual Start "TBD" is not a date. Write it as YYYY-MM-DD, or as MM/DD/YYYY as this file\'s dates are read.',
    }]);
  });

  it("an Excel serial: refused with its own sentence; every bad cell of the row is named", () => {
    const r = row({ actualStart: "46083", plannedFinish: "soon" }, "inProgress");
    expect(r.errors.map((e) => e.message)).toEqual([
      'Actual Start "46083" is a number, not a date. In your spreadsheet, format the column as a date and copy it again.',
      'Planned Finish "soon" is not a date. Write it as YYYY-MM-DD, or as MM/DD/YYYY as this file\'s dates are read.',
    ]);
  });
});

// -- At commit: the counts --------------------------------------------------------------------

function activity(extra: Partial<Activity>): Activity {
  return {
    id: "a", name: "A", min: 2, mostLikely: 3, max: 5, confidenceLevel: "mediumConfidence",
    distributionType: "triangular", status: "planned", ...extra,
  };
}

describe("withImportedCounts — the day count, from the dates, at commit", () => {
  it("In Progress: working days from the Actual Start to today, both counted (Mon 19 Oct → Fri 30 Oct = 10)", () => {
    const [a] = withImportedCounts([activity({ status: "inProgress", actualStartDate: "2026-10-19" })], "2026-10-30", undefined);
    expect(a!.actualDuration).toBe(10);
  });
  it("Complete: Actual Start to Actual Finish, both counted (Mon 5 Oct → Fri 9 Oct = 5)", () => {
    const [a] = withImportedCounts(
      [activity({ status: "complete", actualStartDate: "2026-10-05", actualFinishDate: "2026-10-09" })], "2026-10-30", undefined,
    );
    expect(a!.actualDuration).toBe(5);
  });
  it("no Actual Start: no count, as before WI-150", () => {
    const [a] = withImportedCounts([activity({ status: "inProgress" })], "2026-10-30", undefined);
    expect(a!.actualDuration).toBeUndefined();
  });
});

// -- The build's fixes (Review 34; owner, R636). Each pinned with a hand-written value -----------------

function rowIn(
  order: "monthFirst" | "dayFirst", raw: RowDates, statusGiven: "planned" | "inProgress" | "complete" | null,
  hasActualFinishColumn = true,
) {
  return readRowProgress({ raw, statusGiven, hasActualStartColumn: true, hasActualFinishColumn, order, today: TODAY, row: 5 });
}

describe("date forms Review 34 found refused (I-F2, I-W5)", () => {
  const cases: [string, string | "empty"][] = [
    ["02-Mar-26 08:00 A", "2026-03-02"], // I-F2: P6's actual mark after a time
    ["02-Mar-26 08:00*", "2026-03-02"], // I-F2: P6's constraint mark after a time
    ["2-Mar-26 A*", "2026-03-02"], // both of P6's marks
    ["2026-09-21T08:00:00", "2026-09-21"], // I-W5: MS Project XML's form
    ["-", "empty"], // I-W5: a dash for no date
    ["—", "empty"], // an em dash
    ["–", "empty"], // an en dash
  ];
  for (const [raw, want] of cases) {
    it(`${JSON.stringify(raw)} → ${want}`, () => {
      expect(parseDateCell(raw, "monthFirst")).toEqual(want === "empty" ? { kind: "empty" } : { kind: "date", iso: want });
    });
  }
});

describe("T3's advice names the Status that keeps the dates (V-E4)", () => {
  it("an Actual Finish alone on a Planned row: enter the start too, and set Complete", () => {
    expect(row({ actualFinish: "10/09/2026" }, "planned").warnings.map((w) => w.message)).toEqual([
      "Status is Planned, so Actual Finish was not imported. To keep it, enter the Actual Start too and set Status to Complete.",
    ]);
  });
});

describe("a date after today names the day order it was read in (I-F5 = V-W5)", () => {
  it("a DD/MM reading of 10/12/2026 is 10 December", () => {
    expect(rowIn("dayFirst", { actualStart: "10/12/2026" }, "inProgress").errors.map((e) => e.message)).toEqual([
      'Actual Start "10/12/2026", read as DD/MM/YYYY (10 December 2026), is after today. An actual date cannot be in the future.',
    ]);
  });
  it("a year-first date has one reading, so none is named", () => {
    expect(rowIn("dayFirst", { actualStart: "2026-11-14" }, "inProgress").errors.map((e) => e.message)).toEqual([
      'Actual Start "2026-11-14" is after today. An actual date cannot be in the future.',
    ]);
  });
  it("an out-of-order pair of year-first dates names no day order", () => {
    expect(rowIn("dayFirst", { actualStart: "2026-03-09", actualFinish: "2026-03-02" }, "complete").errors.map((e) => e.message)).toEqual([
      'Actual Finish "2026-03-02" is before Actual Start "2026-03-09".',
    ]);
  });
  it("a DD/MM out-of-order pair names the order", () => {
    expect(rowIn("dayFirst", { actualStart: "09/03/2026", actualFinish: "02/03/2026" }, "complete").errors.map((e) => e.message)).toEqual([
      'Actual Finish "02/03/2026" is before Actual Start "09/03/2026" (dates read as DD/MM/YYYY).',
    ]);
  });
});

describe("a cell the row's Status does not keep never blocks the import (V-R2)", () => {
  it("Planned + Planned Start \"TBD\": a warning, and the row imports", () => {
    const r = row({ plannedStart: "TBD", plannedFinish: "11/13/2026" }, "planned");
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([{
      row: 5, column: "Planned Start", severity: "warning",
      message: 'Planned Start "TBD" is not a date, and an activity whose Status is Planned does not keep it, so it was not imported.',
    }]);
  });
  it("In Progress + Actual Finish \"TBD\": a warning; the start is recorded", () => {
    const r = row({ actualStart: "10/19/2026", actualFinish: "TBD" }, "inProgress");
    expect(r.errors).toEqual([]);
    expect(r.fields).toEqual({ actualStartDate: "2026-10-19" });
    expect(r.warnings.map((w) => w.message)).toEqual([
      'Actual Finish "TBD" is not a date, and an activity whose Status is In Progress does not keep it, so it was not imported.',
    ]);
  });
  it("Complete + Planned Start \"TBD\": still an error — a started row keeps its pair", () => {
    expect(row({ actualStart: "10/05/2026", actualFinish: "10/09/2026", plannedStart: "TBD" }, "complete").errors.map((e) => e.column)).toEqual(["Planned Start"]);
  });
  it("a blank Status + Actual Start \"TBD\": still an error — the dates decide that Status", () => {
    expect(row({ actualStart: "TBD" }, null).errors.map((e) => e.column)).toEqual(["Actual Start"]);
  });
});

describe("T2, and a Complete row with no dates (V-W3; owner, D6)", () => {
  it("a file with no Actual Finish column says so", () => {
    expect(rowIn("monthFirst", { actualStart: "10/05/2026" }, "complete", false).errors.map((e) => e.message)).toEqual([
      "Status is Complete but this file has no Actual Finish column. Add one with the day it finished, or set Status to In Progress.",
    ]);
  });
  it("Complete with neither date: still scheduled and simulated from its estimates", () => {
    expect(row({ actualStart: "", actualFinish: "" }, "complete").warnings.map((w) => w.message)).toEqual([
      "Status is Complete but Actual Start and Actual Finish are blank, so it is still scheduled and simulated from its estimates, as if it had not finished. Enter both dates to count it as done.",
    ]);
  });
});

describe("every other date form the importer reads, pinned", () => {
  const cases: [string, "monthFirst" | "dayFirst", string | "empty"][] = [
    ["2026.03.02", "dayFirst", "2026-03-02"], // year first, dots
    ["03-04-2026", "monthFirst", "2026-03-04"], // year last, dashes
    ["03.04.2026", "dayFirst", "2026-04-03"], // year last, dots
    ["N/A", "monthFirst", "empty"],
    ["n/a", "monthFirst", "empty"],
    ["2 March 2026", "monthFirst", "2026-03-02"],
    ["02-MAR-26", "dayFirst", "2026-03-02"], // P6, capitals
    ["Sep. 2, 2026", "monthFirst", "2026-09-02"],
    ["Sept 2, 2026", "dayFirst", "2026-09-02"],
    ["02-Mar-26 *", "monthFirst", "2026-03-02"], // P6's constraint mark after a space
    ["Monday 3/2/26", "monthFirst", "2026-03-02"],
    ["Mon, 3/2/26", "monthFirst", "2026-03-02"],
    ["3/2/2026 08:00", "monthFirst", "2026-03-02"],
    ["3/2/2026 8:00:00 PM", "monthFirst", "2026-03-02"],
    ["Mon 3/2/26 8:00 AM", "monthFirst", "2026-03-02"],
    ["2026-09-21T08:00", "monthFirst", "2026-09-21"],
    ["2028-02-29", "monthFirst", "2028-02-29"], // a leap day
  ];
  for (const [raw, order, want] of cases) {
    it(`${JSON.stringify(raw)} read ${order} → ${want}`, () => {
      expect(parseDateCell(raw, order)).toEqual(want === "empty" ? { kind: "empty" } : { kind: "date", iso: want });
    });
  }
  it('"2/29/2026" is not a day', () => {
    expect(parseDateCell("2/29/2026", "monthFirst")).toEqual({ kind: "invalid" });
  });
});
