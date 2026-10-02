// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  getDefaultScenarioName,
  importActivitiesFromCSV,
  parseCsvFileRows,
  readCsvRows,
} from "./csv-import-service";
import type { CSVParseResult } from "@core/import/types";

/**
 * The CSV reader (v0.74.0): its rows, the 10 MB guard in front of them, and the checks that
 * refuse a FILE row a comma has split. The messages are spelled out here, not imported — they are
 * what the user reads.
 */

const TEMPLATE = readFileSync(join(process.cwd(), "public", "spert-activity-import-template.csv"), "utf8");

/** The template's A6 row as shipped: two predecessors, quoted. */
const A6_QUOTED = 'A6,Testing,3,5,10,triangular,,planned,"A3,A4",Activity';

const LONG_ROW_HEADED =
  'This row has more cells than there are column headings. A cell that contains a comma — for example several predecessors, "A3,A4" — must be in quotes. If the extra cells are a column of your own, give that column a heading.';
const LONG_ROW_HEADERLESS =
  'This row has more cells than the template\'s ten columns. A cell that contains a comma — for example several predecessors, "A3,A4" — must be in quotes.';
const TYPE_NOT_RECOGNIZED =
  'The Type column takes Activity, Section or nothing. If a cell before it contains a comma — for example several predecessors, "A3,A4" — it must be in quotes.';

function csvFile(text: string, name = "plan.csv"): File {
  return new File([text], name, { type: "text/csv" });
}

/** `text` with `find` replaced, once. Throws if `find` is not there, so a fixture cannot silently stay as it was. */
function replaceOnce(text: string, find: string, replacement: string): string {
  if (!text.includes(find)) throw new Error(`fixture needle not found: ${find}`);
  return text.replace(find, replacement);
}

/** The template with its A6 row replaced. */
function templateWithA6(row: string): string {
  return replaceOnce(TEMPLATE, A6_QUOTED, row);
}

/** Each error as [row, message], in the order the result holds them. */
function rowMessages(r: CSVParseResult): [number, string][] {
  return r.errors.map((e) => [e.row, e.message]);
}

describe("a FILE row that a comma has split", () => {
  it("is refused when the split makes it longer than the header row — at the preview's row number", async () => {
    // A6 written as the user meant it, without its quotes: A3 lands in Predecessors, A4 in Type,
    // and "Activity" in an eleventh cell. Before v0.74.0 this imported, without A4, and silently.
    const split = await importActivitiesFromCSV(csvFile(templateWithA6("A6,Testing,3,5,10,triangular,,planned,A3,A4,Activity")));
    // Row 7: the reader drops the template's eight # lines, so A6 — line 15 of the file — is the
    // seventh row the parser numbers, the header being row 1.
    expect(rowMessages(split)).toEqual([
      [7, LONG_ROW_HEADED],
      [7, TYPE_NOT_RECOGNIZED],
    ]);

    // Control: the template as shipped, the same cell quoted — nothing refused, all 13 dependencies.
    const asShipped = await importActivitiesFromCSV(csvFile(TEMPLATE));
    expect(asShipped.errors).toEqual([]);
    expect(asShipped.dependencies).toHaveLength(13);
  });

  it("numbers a refused row exactly as the parser numbers its own errors", async () => {
    // A6 split AND given a Min the parser itself refuses: the reader's error and the parser's
    // must name the same row, or the preview would point at two rows for one line.
    const r = await importActivitiesFromCSV(csvFile(templateWithA6("A6,Testing,x,5,10,triangular,,planned,A3,A4,Activity")));
    const parsers = r.errors.find((e) => e.column === "Optimistic (Min)");
    const readers = r.errors.find((e) => e.message === LONG_ROW_HEADED);
    expect(parsers?.row).toBe(7);
    expect(readers?.row).toBe(7);
  });

  it("is refused when the split fills a blank or absent Type cell instead — the row is then no longer than the header", async () => {
    // Type blank: the reader trims the trailing empty cell, so the row has ten cells, as many as
    // the header — too short to be refused for its length. A4 is in Type.
    const blankType = await importActivitiesFromCSV(csvFile(templateWithA6("A6,Testing,3,5,10,triangular,,planned,A3,A4,")));
    expect(rowMessages(blankType)).toEqual([[7, TYPE_NOT_RECOGNIZED]]);
    expect(blankType.errors[0]?.column).toBe("Type");

    // Type absent altogether: the same.
    const absentType = await importActivitiesFromCSV(csvFile(templateWithA6("A6,Testing,3,5,10,triangular,,planned,A3,A4")));
    expect(rowMessages(absentType)).toEqual([[7, TYPE_NOT_RECOGNIZED]]);

    // Control: every Type the importer takes — Activity, Section, blank — in any capitals.
    let takes = templateWithA6('A6,Testing,3,5,10,triangular,,planned,"A3,A4",ACTIVITY');
    takes = replaceOnce(takes, 'A7,Security Review,2,2,5,uniform,,planned,"A5,A6",Activity', 'A7,Security Review,2,2,5,uniform,,planned,"A5,A6",');
    takes = replaceOnce(takes, "S1,Phase 2: Implementation,,,,,,,,Section", "S1,Phase 2: Implementation,,,,,,,,section");
    const taken = await importActivitiesFromCSV(csvFile(takes));
    expect(taken.errors).toEqual([]);
    expect(taken.activities).toHaveLength(10);
  });

  it("is refused by its length in a file with no Type column — the limit is the file's own header row", async () => {
    const header = "Activity ID,Activity Name,Optimistic (Min),Most Likely,Pessimistic (Max),Distribution,Confidence Level,Status,Predecessors";
    const rows = ["A1,Design,1,2,3,triangular,,planned,", "A2,Build,1,2,3,triangular,,planned,A1", "A3,Test,1,2,3,triangular,,planned,A1"];
    const split = await importActivitiesFromCSV(csvFile([header, ...rows, "A4,Ship,1,2,3,triangular,,planned,A2,A3"].join("\n")));
    expect(rowMessages(split)).toEqual([[5, LONG_ROW_HEADED]]);

    // Control: the same cell quoted.
    const quoted = await importActivitiesFromCSV(csvFile([header, ...rows, 'A4,Ship,1,2,3,triangular,,planned,"A2,A3"'].join("\n")));
    expect(quoted.errors).toEqual([]);
    expect(quoted.dependencies).toHaveLength(4);
  });
});

describe("a FILE's own extra column", () => {
  const lines = TEMPLATE.split("\n");
  const header = lines.find((l) => l.startsWith("Activity ID"))!;
  const activityRows = lines.filter((l) => /^A\d+,/.test(l));
  const sectionRow = lines.find((l) => l.startsWith("S1,"))!;

  it("with no heading, refuses every row it has a cell in; given a heading, refuses none", async () => {
    expect(activityRows).toHaveLength(10);
    const unheaded = await importActivitiesFromCSV(
      csvFile([header, ...activityRows.map((r) => `${r},a note`), sectionRow].join("\n"))
    );
    // Rows 2 to 11 — the ten activities. The Section row has no note, so it is not refused.
    expect(rowMessages(unheaded)).toEqual(activityRows.map((_, i) => [i + 2, LONG_ROW_HEADED]));

    // Control, and the message's own remedy: the same column, given a heading.
    const headed = await importActivitiesFromCSV(
      csvFile([`${header},Notes`, ...activityRows.map((r) => `${r},a note`), sectionRow].join("\n"))
    );
    expect(headed.errors).toEqual([]);
    expect(headed.activities).toHaveLength(10);
    expect(headed.dependencies).toHaveLength(13);
  });

  it("where the checks stop: a split whose second half lands in a column of the user's own is not refused", async () => {
    // A CHARACTERISATION, not a requirement — it records the limit of the checks, so that nothing
    // claims more for them. The row's cell "A1,A2" is unquoted and Notes is blank: A2 moves into
    // Notes, the row is no longer than the headings, and there is no Type cell to hold a stray
    // value. If a later check closes this, change these assertions on purpose.
    const notes = "Activity ID,Activity Name,Optimistic (Min),Most Likely,Pessimistic (Max),Distribution,Confidence Level,Status,Predecessors,Notes";
    const rows = ["A1,Design,1,2,3,triangular,,planned,,", "A2,Build,1,2,3,triangular,,planned,A1,"];
    const split = await importActivitiesFromCSV(csvFile([notes, ...rows, "A3,Test,1,2,3,triangular,,planned,A1,A2"].join("\n")));
    expect(split.errors).toEqual([]);
    expect(split.dependencies).toHaveLength(2); // A2 → A3 is lost

    // Control: the same cell quoted keeps both predecessors.
    const quoted = await importActivitiesFromCSV(csvFile([notes, ...rows, 'A3,Test,1,2,3,triangular,,planned,"A1,A2"'].join("\n")));
    expect(quoted.errors).toEqual([]);
    expect(quoted.dependencies).toHaveLength(3);
  });
});

describe("a headerless FILE's rows read with the first row as data", () => {
  // The template's first four rows, with no header row.
  const HEADERLESS = [
    "A1,Define Requirements,3,5,7,normal,Medium,planned,,Activity",
    "A2,Design Database,4,7,10,normal,High,planned,A1,Activity",
    "A3,Build API,5,10,30,logNormal,Low,planned,A2,Activity",
    "A4,Frontend Development,4,8,15,triangular,,planned,A2,Activity",
  ];

  async function rowsOf(lines: string[]): Promise<string[][]> {
    return readCsvRows(csvFile(lines.join("\n")));
  }

  it("refuses a row longer than the template's ten columns, and a tenth cell that is not a Type", async () => {
    const rows = await rowsOf([
      HEADERLESS[0]!,
      HEADERLESS[1]!,
      "A3,Build API,5,10,30,logNormal,Low,planned,A2,Activity,extra",
      "A4,Frontend Development,4,8,15,triangular,,planned,A2,A3",
    ]);
    const r = parseCsvFileRows(rows, { assumeDefaultColumnOrder: true });
    // Rows count from the first, since it is data: the eleven-cell row is row 3.
    expect(rowMessages(r)).toEqual([
      [3, LONG_ROW_HEADERLESS],
      [4, TYPE_NOT_RECOGNIZED],
    ]);

    // Control: the same rows as the template writes them — ten cells, Type Activity.
    const asTemplate = parseCsvFileRows(await rowsOf(HEADERLESS), { assumeDefaultColumnOrder: true });
    expect(asTemplate.errors).toEqual([]);
    expect(asTemplate.activities).toHaveLength(4);
  });
});

describe("the 10 MB guard in front of every file read", () => {
  const LIMIT = 10 * 1024 * 1024;

  it("refuses a file over 10 MB before reading it", async () => {
    await expect(readCsvRows(csvFile("a".repeat(LIMIT + 1)))).rejects.toThrow(
      "File too large (10.0 MB). Maximum is 10 MB."
    );
    // The convenience wrapper reads through the same guard.
    await expect(importActivitiesFromCSV(csvFile("a".repeat(LIMIT + 1)))).rejects.toThrow("File too large");

    // Control: a file of exactly 10 MB is read.
    const atLimit = await readCsvRows(csvFile("a".repeat(LIMIT)));
    expect(atLimit).toHaveLength(1);
    expect(atLimit[0]?.[0]?.length).toBe(LIMIT);
  });
});

describe("the default scenario name's date", () => {
  const TZ = process.env.TZ;

  afterEach(() => {
    vi.useRealTimers();
    process.env.TZ = TZ;
  });

  it("is the LOCAL date, for a paste and for a file named only '.csv'", () => {
    // 20:38 on 1 October in New York is already 2 October in UTC: until v0.74.0 an import made
    // that evening was named, and started, a day early.
    process.env.TZ = "America/New_York";
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-02T00:38:00Z"));

    // Control: at this instant, in this zone, the two dates really differ.
    expect(new Date().toISOString().slice(0, 10)).toBe("2026-10-02");
    expect(new Date().getDate()).toBe(1);

    expect(getDefaultScenarioName("clipboard")).toBe("Imported — 2026-10-01");
    expect(getDefaultScenarioName("file", ".csv")).toBe("Imported — 2026-10-01");
    // A file with a usable name is named for it, whatever the date.
    expect(getDefaultScenarioName("file", "Q3 plan.csv")).toBe("Q3 plan");
  });
});
