// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import { parseFlatActivityTable } from "./flat-activity-parser";
import type { ParseTableOptions } from "./types";

// WI-150 — the parser reads an activity's four dates. Expected values are written out by hand.

let seq = 0;
const idGen = () => `id-${++seq}`;
const TODAY = "2026-10-31";

function parse(rows: string[][], options: ParseTableOptions = {}) {
  seq = 0;
  return parseFlatActivityTable(rows, idGen, { today: TODAY, ...options });
}

/** A P6 sheet, as the P6 & MS Project guide builds it, with the four date columns and P6's Start column along. */
const P6_HEADER = [
  "Activity ID", "Activity Name", "Optimistic (Min)", "Most Likely", "Pessimistic (Max)", "Confidence Level",
  "Activity Status", "Planned Start", "Planned Finish", "Actual Start", "Actual Finish", "Start",
];
const P6_ROWS = [
  ["A1", "Design", "2", "3", "5", "", "Completed", "05-Oct-26", "08-Oct-26", "05-Oct-26", "09-Oct-26", "05-Oct-26 A"],
  ["A2", "Build", "5", "8", "12", "", "In Progress", "12-Oct-26", "23-Oct-26", "13-Oct-26", "", "13-Oct-26 A"],
  ["A3", "Test", "3", "5", "9", "", "Not Started", "02-Nov-26", "13-Nov-26", "", "", "02-Nov-26"],
  ["A4", "Deploy", "1", "1", "2", "", "Not Started", "16-Nov-26", "17-Nov-26", "", "", "16-Nov-26"],
];

describe("a P6 sheet with the four date columns", () => {
  const r = parse([P6_HEADER, ...P6_ROWS]);

  it("imports every row, with no error or warning", () => {
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.activities.map((a) => a.name)).toEqual(["Design", "Build", "Test", "Deploy"]);
  });

  it("reads P6's Activity Status heading and its words", () => {
    expect(r.activities.map((a) => a.status)).toEqual(["complete", "inProgress", "planned", "planned"]);
  });

  it("records the Actual dates, and keeps a started row's Planned pair as its plan", () => {
    const [design, build] = r.activities;
    expect([design!.actualStartDate, design!.actualFinishDate]).toEqual(["2026-10-05", "2026-10-09"]);
    expect([design!.plannedStartDate, design!.plannedFinishDate]).toEqual(["2026-10-05", "2026-10-08"]);
    expect([build!.actualStartDate, build!.actualFinishDate]).toEqual(["2026-10-13", undefined]);
    expect([build!.plannedStartDate, build!.plannedFinishDate]).toEqual(["2026-10-12", "2026-10-23"]);
  });

  it("R1 (a): a not-started row keeps no date at all", () => {
    for (const a of r.activities.slice(2)) {
      expect([a.actualStartDate, a.actualFinishDate, a.plannedStartDate, a.plannedFinishDate]).toEqual([
        undefined, undefined, undefined, undefined,
      ]);
    }
  });

  it("says, once, that the not-started rows' Planned dates were not imported", () => {
    expect(r.notes).toEqual([
      "Planned Start and Planned Finish were not imported for 2 activities that have not started (Status Planned). Scheduler schedules these activities itself, and keeps an activity's Planned Start and Planned Finish from its own plan when the activity starts.",
    ]);
  });

  it("names the earliest Actual Start, where the scenario will start", () => {
    expect(r.earliestActualStart).toBe("2026-10-05");
  });

  it("does not read the Start column the guide tells users to bring along", () => {
    const withoutStart = parse([P6_HEADER.slice(0, -1), ...P6_ROWS.map((row) => row.slice(0, -1))]);
    expect(withoutStart.activities).toEqual(r.activities);
  });
});

describe("a sheet with none of the four columns parses exactly as before WI-150", () => {
  const r = parse([
    ["Activity ID", "Activity Name", "Min", "Most Likely", "Max", "Confidence Level", "Status"],
    ["A1", "Design", "2", "3", "5", "", "complete"],
    ["A2", "Build", "2", "3", "5", "", "inProgress"],
    ["A3", "Test", "2", "3", "5", "", ""],
  ]);
  it("no dates, no notes, no warnings; the statuses as given, a blank one Planned", () => {
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.notes).toEqual([]);
    expect(r.earliestActualStart).toBeUndefined();
    expect(r.activities.map((a) => a.status)).toEqual(["complete", "inProgress", "planned"]);
    for (const a of r.activities) {
      expect(Object.keys(a).sort()).toEqual(
        ["confidenceLevel", "distributionType", "id", "max", "min", "mostLikely", "name", "status"],
      );
    }
  });
});

describe("an MS Project sheet: no Status column, NA for no date, MS Project's own date format", () => {
  const r = parse([
    ["ID", "Activity Name", "Min", "Most Likely", "Max", "Confidence Level", "Actual Start", "Actual Finish"],
    ["1", "Design", "2", "3", "5", "", "Mon 10/5/26", "Fri 10/9/26"],
    ["2", "Build", "5", "8", "12", "", "Tue 10/13/26", "NA"],
    ["3", "Test", "3", "5", "9", "", "NA", "NA"],
  ]);
  it("takes each row's Status from its Actual dates", () => {
    expect(r.errors).toEqual([]);
    expect(r.activities.map((a) => [a.status, a.actualStartDate, a.actualFinishDate])).toEqual([
      ["complete", "2026-10-05", "2026-10-09"],
      ["inProgress", "2026-10-13", undefined],
      ["planned", undefined, undefined],
    ]);
  });
  it("says so once", () => {
    expect(r.notes).toEqual([
      "2 activities have no Status but an Actual Start, so they are imported as In Progress, or as Complete when there is an Actual Finish too.",
    ]);
  });
});

describe("a file written day first, read by a user whose date format is month first", () => {
  const r = parse(
    [
      ["Activity ID", "Activity Name", "Min", "Most Likely", "Max", "Confidence Level", "Status", "Actual Start"],
      ["A1", "Design", "2", "3", "5", "", "In Progress", "05/10/2026"],
      ["A2", "Build", "2", "3", "5", "", "In Progress", "13/10/2026"],
    ],
    { dateFormat: "MM/DD/YYYY" },
  );
  it("reads every date day first, because one of them can only be", () => {
    expect(r.activities.map((a) => a.actualStartDate)).toEqual(["2026-10-05", "2026-10-13"]);
  });
  it("and says why, naming the cell and its row", () => {
    expect(r.notes).toEqual([
      'Dates are read as DD/MM/YYYY, because "13/10/2026" on row 3 cannot be MM/DD/YYYY, your date format.',
    ]);
  });
  it("a DD/MM user reading the same file needs no note", () => {
    const own = parse(
      [
        ["Activity ID", "Activity Name", "Min", "Most Likely", "Max", "Confidence Level", "Status", "Actual Start"],
        ["A1", "Design", "2", "3", "5", "", "In Progress", "05/10/2026"],
      ],
      { dateFormat: "DD/MM/YYYY" },
    );
    expect([own.activities[0]!.actualStartDate, own.notes]).toEqual(["2026-10-05", []]);
  });
});

describe("a refused date blocks the import, on its own row", () => {
  it("names the row the user sees and the column", () => {
    const r = parse(
      [
        ["Activity ID", "Activity Name", "Min", "Most Likely", "Max", "Confidence Level", "Status", "Actual Start"],
        ["A1", "Design", "2", "3", "5", "", "In Progress", "11/14/2026"],
      ],
      { rowNumbers: [4, 5] },
    );
    expect(r.activities).toEqual([]);
    expect(r.errors).toEqual([{
      row: 5, column: "Actual Start", severity: "error",
      message: 'Actual Start "11/14/2026", read as MM/DD/YYYY (14 November 2026), is after today. An actual date cannot be in the future.',
    }]);
  });
});

describe("a headerless paste never reads a date", () => {
  it("the template's column order is unchanged, so a cell past Predecessors is not a date", () => {
    const r = parse([["A1", "Design", "2", "3", "5", "", "", "inProgress", "", "10/05/2026"]], {
      assumeDefaultColumnOrder: true,
    });
    expect(r.errors).toEqual([]);
    expect(r.activities[0]!.status).toBe("inProgress");
    expect(r.activities[0]!.actualStartDate).toBeUndefined();
  });
});

// -- The build's fixes (Review 34; owner, R636) --------------------------------------------------------

describe("the Start column is never read, wherever it sits (Review 34, V-G2)", () => {
  it("Start BEFORE Actual Start: Start's dates are not recorded", () => {
    const r = parse([
      ["Activity ID", "Activity Name", "Min", "Most Likely", "Max", "Confidence Level", "Status", "Start", "Actual Start"],
      ["A1", "Design", "2", "3", "5", "", "In Progress", "05-Oct-26 A", "06-Oct-26"],
    ]);
    expect(r.activities.map((a) => a.actualStartDate)).toEqual(["2026-10-06"]);
  });
  it("the MS Project guide's sheet, Start and no Actual Start: no date read, the row stays Planned", () => {
    const r = parse([
      ["ID", "Activity Name", "Min", "Most Likely", "Max", "Confidence Level", "Start"],
      ["1", "Design", "2", "3", "5", "", "Mon 10/5/26"],
    ]);
    expect(r.errors).toEqual([]);
    expect(r.activities.map((a) => [a.status, a.actualStartDate])).toEqual([["planned", undefined]]);
    expect(r.earliestActualStart).toBeUndefined();
  });
});

describe("an unrecognized Status word on a row with Actual dates takes its Status from them (owner, D3)", () => {
  const r = parse([
    ["ID", "Activity Name", "Min", "Most Likely", "Max", "Confidence Level", "Status", "Actual Start", "Actual Finish"],
    ["1", "Build", "2", "3", "5", "", "Late", "10/13/26", "NA"],
    ["2", "Design", "2", "3", "5", "", "On Schedule", "10/05/26", "10/09/26"],
    ["3", "Test", "2", "3", "5", "", "Future Task", "NA", "NA"],
  ]);
  it("In Progress from an Actual Start, Complete from both, Planned with neither", () => {
    expect(r.errors).toEqual([]);
    expect(r.activities.map((a) => [a.status, a.actualStartDate, a.actualFinishDate])).toEqual([
      ["inProgress", "2026-10-13", undefined],
      ["complete", "2026-10-05", "2026-10-09"],
      ["planned", undefined, undefined],
    ]);
  });
  it("each says so in its own warning, and none is counted as a blank Status", () => {
    expect(r.warnings.map((w) => [w.row, w.message])).toEqual([
      [2, 'Unrecognized status "Late". Its Actual Start makes it In Progress.'],
      [3, 'Unrecognized status "On Schedule". Its Actual Start and Actual Finish make it Complete.'],
      [4, 'Unrecognized status "Future Task". Planned will be used instead.'],
    ]);
    expect(r.notes).toEqual([]);
  });
});

describe("the day order is chosen from the rows the parser reads (Review 34, V-W2)", () => {
  const head = ["Activity ID", "Activity Name", "Min", "Most Likely", "Max", "Confidence Level", "Status", "Actual Start", "Type"];
  const design = ["A1", "Design", "2", "3", "5", "", "In Progress", "05/10/2026", ""];
  it("a # note row's date does not choose it", () => {
    const r = parse([head, ["# written 25/12/2026", "", "", "", "", "", "", "25/12/2026", ""], design]);
    expect([r.activities[0]!.actualStartDate, r.notes]).toEqual(["2026-05-10", []]);
  });
  it("a section row's date does not choose it", () => {
    const r = parse([head, ["S", "Phase 1", "", "", "", "", "", "25/12/2026", "section"], design]);
    expect([r.activities[0]!.actualStartDate, r.notes]).toEqual(["2026-05-10", []]);
  });
  it("a row past the 500th the parser reads does not choose it", () => {
    const many = Array.from({ length: 500 }, (_, i) => [`A${i}`, `Task ${i}`, "2", "3", "5", "", "In Progress", "05/10/2026", ""]);
    const r = parse([head, ...many, ["Z", "Late", "2", "3", "5", "", "In Progress", "25/10/2026", ""]]);
    expect(r.activities[0]!.actualStartDate).toBe("2026-05-10");
    expect(r.notes).toEqual([]);
  });
});

describe("T2's words in a file with no Actual Finish column (Review 34, V-W3)", () => {
  it("names the missing column", () => {
    const r = parse([
      ["Activity ID", "Activity Name", "Min", "Most Likely", "Max", "Confidence Level", "Status", "Actual Start"],
      ["A1", "Design", "2", "3", "5", "", "Complete", "10/05/2026"],
    ]);
    expect(r.errors.map((e) => e.message)).toEqual([
      "Status is Complete but this file has no Actual Finish column. Add one with the day it finished, or set Status to In Progress.",
    ]);
  });
});
