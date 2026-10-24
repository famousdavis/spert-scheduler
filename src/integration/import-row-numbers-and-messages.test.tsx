// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * WI-95 — Import Activities: row numbers that match the user's file, and messages in plain words.
 *
 * (d) A FILE's row number is the row its spreadsheet shows — the notes, the blank rows and the
 *     header counted, a quoted cell spanning lines counted once. A PASTE's is its line, the first
 *     line being 1; the screen says so under a paste's table.
 * (h) Each schema check an imported row can fail is a sentence naming the template's column.
 * (i) An unknown Distribution or Status names the value used instead as the app shows it.
 * (m) An unknown Confidence lists the levels as the app shows them, in the template note's order.
 * (b) The table's first row says "ready to import" only when Import can import; otherwise what to do.
 * (f) "No recognizable header row found." shows once.
 *
 * ⚠️ Every row number and sentence below is written out by hand — counted in the fixture's own
 * lines, which the comments beside them number — never taken from the code under test.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ActivityImportSection } from "@ui/components/ActivityImportSection";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";
import { DEFAULT_USER_PREFERENCES, DISTRIBUTION_TYPES } from "@domain/models/types";
import type { ImportApplyParams } from "@ui/hooks/use-project-store";
import type { ImportOutcome } from "@app/api/export-import-service";
import {
  importActivitiesFromCSV,
  parseClipboardTable,
  parseCsvFileRows,
  parsePastedRows,
  readCsvRows,
} from "@app/api/csv-import-service";
import { parseFlatActivityTable } from "@core/import/flat-activity-parser";
import type { CSVImportError, CSVParseResult } from "@core/import/types";

// -- Fixtures -------------------------------------------------------------------

const TEMPLATE = readFileSync(join(process.cwd(), "public", "spert-activity-import-template.csv"), "utf8");

/** The template's A10 row as shipped — line 19 of the file (eight notes, the header, A1–A9 above it). */
const A10 = 'A10,Deploy to Production,1,1,1,uniform,,planned,"A7,A8,A9",Activity';

const HEADER = "Activity ID,Activity Name,Optimistic (Min),Most Likely,Pessimistic (Max),Confidence Level,Predecessors";
const HEADER_TSV = [
  "Activity ID",
  "Activity Name",
  "Optimistic (Min)",
  "Most Likely",
  "Pessimistic (Max)",
  "Distribution",
  "Confidence Level",
  "Status",
  "Predecessors",
].join("\t");
const PARSER_HEADER = ["Activity ID", "Activity Name", "Optimistic (Min)", "Most Likely", "Pessimistic (Max)", "Confidence Level", "Distribution", "Status"];

/** The four sentences for the schema checks an imported row can fail — the whole list (WI-95 (h)). */
const NAME_TOO_LONG = "Activity Name is longer than 200 characters.";
const MIN_ABOVE_ML = "Optimistic (Min) is above Most Likely.";
const ML_ABOVE_MAX = "Most Likely is above Pessimistic (Max).";
const LOGNORMAL_ZERO =
  "A LogNormal activity needs an estimate above zero: Optimistic (Min), Most Likely and Pessimistic (Max) are all 0.";

const FIX_FILE = "Nothing can be imported until every error is fixed. Correct your file, then choose it again.";
const FIX_PASTE = "Nothing can be imported until every error is fixed. Correct your spreadsheet, then paste the rows again.";
const PASTE_NOTE = "Row numbers count the rows you pasted — the first row is row 1.";
const NO_HEADER_SENTENCE = "No recognizable header row found.";
const NO_HEADER =
  "No recognizable header row found. Missing columns: Activity ID, Activity Name, Optimistic (Min), Most Likely, Pessimistic (Max), Confidence Level.";

function csvFile(text: string, name = "plan.csv"): File {
  return new File([text], name, { type: "text/csv" });
}

/** `text` with `find` replaced, once. Throws if `find` is not there exactly once, so a fixture cannot silently stay as it was. */
function replaceOnce(text: string, find: string, replacement: string): string {
  if (text.split(find).length !== 2) throw new Error(`fixture needle not found exactly once: ${find}`);
  return text.replace(find, replacement);
}

function idGen() {
  let n = 0;
  return () => `id-${++n}`;
}

/** Every [Min, Most Likely, Max] with each from 0 to `top`. */
function estimateTriples(top: number): [number, number, number][] {
  const values = Array.from({ length: top + 1 }, (_, i) => i);
  return values.flatMap((min) => values.flatMap((ml) => values.map((max): [number, number, number] => [min, ml, max])));
}

/** Each error as [row, message], in the order the result holds them. */
function rowMessages(r: CSVParseResult): [number, string][] {
  return r.errors.map((e) => [e.row, e.message]);
}

// -- (d) A file's rows: the spreadsheet's numbers ---------------------------------------

describe("(d) a FILE's row numbers are the rows its spreadsheet shows", () => {
  it("the template with one bad cell: the error names row 19, the line A10 is on — not row 11", async () => {
    // Premise: A10 is the 19th line of the template as shipped.
    expect(TEMPLATE.split("\n")[18]).toBe(A10);
    const r = await importActivitiesFromCSV(csvFile(replaceOnce(TEMPLATE, A10, A10.replace(",1,1,1,", ",1,one,1,"))));
    expect(r.errors).toEqual([
      { row: 19, column: "Most Likely", message: 'Most Likely must be a non-negative integer, got "one".', severity: "error" },
    ]);
  });

  it("notes and blank rows count, above the header and between rows — in the duplicate message's numbers too", async () => {
    const lines = [
      "# a note", //                    1
      "", //                            2 — an empty line
      HEADER, //                        3
      "A1,Design,1,2,3,Medium,", //     4
      ",,,,,,", //                      5 — a spreadsheet's blank row
      "", //                            6
      "A2,Build,1,two,3,Medium,A1", //  7 — Most Likely is not a number
      "# a note between rows", //       8
      "A3,Test,1,2,3,Medium,A1", //     9
      "A3,Retest,1,2,3,Medium,A1", //  10 — the same Activity ID as row 9
    ];
    const r = await importActivitiesFromCSV(csvFile(lines.join("\n")));
    expect(rowMessages(r)).toEqual([
      [7, 'Most Likely must be a non-negative integer, got "two".'],
      [10, 'Duplicate Activity ID "A3" (also on row 9).'],
      [9, 'Duplicate Activity ID "A3" (also on row 10).'],
    ]);
  });

  it("a quoted cell spanning two lines is ONE row, as in a spreadsheet — the rows below it keep their numbers", async () => {
    const lines = [
      HEADER, //                        row 1
      'A1,"Design', //                  row 2, its first line
      'and plan",1,2,3,Medium,', //            and its second
      "A2,Build,1,two,3,Medium,A1", //  row 3 — on the file's 4th line
    ];
    const r = await importActivitiesFromCSV(csvFile(lines.join("\n")));
    expect(rowMessages(r)).toEqual([[3, 'Most Likely must be a non-negative integer, got "two".']]);
    expect(r.activities.map((a) => a.name)).toEqual(["Design\nand plan"]);
  });

  it("the cycle message names the file's rows", async () => {
    const lines = [
      "# a note", //                 1
      HEADER, //                     2
      "A1,One,1,2,3,Medium,A2", //   3
      "A2,Two,1,2,3,Medium,A1", //   4
    ];
    const r = await importActivitiesFromCSV(csvFile(lines.join("\n")));
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]!.row).toBe(0);
    expect(r.errors[0]!.message).toMatch(/^Dependency cycle detected: /);
    expect(r.errors[0]!.message).toContain("A1 (Row 3)");
    expect(r.errors[0]!.message).toContain("A2 (Row 4)");
  });

  it("the file's own checks number rows the same way, and so does 'Treat first row as data'", async () => {
    // Headerless, under a note and a blank line: row 4 has an eleventh cell, row 5 a Type that is not one.
    const lines = [
      "# my plan, no header row", //                                    1
      "", //                                                            2
      "A1,Design,1,2,3,triangular,,planned,,Activity", //               3
      "A2,Build,1,2,3,triangular,,planned,A1,Activity,extra", //        4 — eleven cells
      "A3,Test,1,2,3,triangular,,planned,A1,Phase", //                  5 — Type "Phase"
    ];
    const records = await readCsvRows(csvFile(lines.join("\n")));
    // The reader keeps every record, so a record's index + 1 is its row.
    expect(records).toEqual([
      ["# my plan", "no header row"],
      [],
      ["A1", "Design", "1", "2", "3", "triangular", "", "planned", "", "Activity"],
      ["A2", "Build", "1", "2", "3", "triangular", "", "planned", "A1", "Activity", "extra"],
      ["A3", "Test", "1", "2", "3", "triangular", "", "planned", "A1", "Phase"],
    ]);
    const r = parseCsvFileRows(records, { assumeDefaultColumnOrder: true });
    expect(rowMessages(r)).toEqual([
      [
        4,
        'This row has more cells than the template\'s ten columns. A cell that contains a comma — for example several predecessors, "A3,A4" — must be in quotes.',
      ],
      [
        5,
        'The Type column takes Activity, Section or nothing. If a cell before it contains a comma — for example several predecessors, "A3,A4" — it must be in quotes.',
      ],
    ]);
  });
});

// -- (d) A paste's rows: its lines -------------------------------------------------------

describe("(d) a PASTE's row numbers are its lines, the first line being 1", () => {
  it("a blank line counts", () => {
    const text = [
      HEADER_TSV, //                                          1
      "P1\tPlan\t1\t2\t4\ttriangular\t\tplanned\t", //        2
      "", //                                                  3
      "P2\tBuild\t5\t3\t6\ttriangular\t\tplanned\tP1", //     4 — Min above Most Likely
    ].join("\n");
    const r = parsePastedRows(parseClipboardTable(text));
    expect(r.errors).toEqual([{ row: 4, column: "min", message: MIN_ABOVE_ML, severity: "error" }]);
    expect(r.activities.map((a) => a.name)).toEqual(["Plan"]);
  });

  it("a blank first line: the header is line 2, and it is still found", () => {
    const text = ["", HEADER_TSV, "P1\tPlan\tx\t2\t4\ttriangular\t\tplanned\t"].join("\n");
    expect(parsePastedRows(parseClipboardTable(text)).errors).toEqual([
      { row: 3, column: "Optimistic (Min)", message: 'Optimistic (Min) must be a non-negative integer, got "x".', severity: "error" },
    ]);
  });

  it("Windows line endings and a trailing line end change nothing", () => {
    const lines = [HEADER_TSV, "P1\tPlan\t1\t2\t4\ttriangular\t\tplanned\t", "", "P2\tBuild\t1\tbad\t6\ttriangular\t\tplanned\tP1"];
    const unix = parsePastedRows(parseClipboardTable(lines.join("\n")));
    const windows = parsePastedRows(parseClipboardTable(`${lines.join("\r\n")}\r\n`));
    expect(rowMessages(unix)).toEqual([[4, 'Most Likely must be a non-negative integer, got "bad".']]);
    expect(rowMessages(windows)).toEqual(rowMessages(unix));
  });

  it("'Treat first row as data' numbers a headerless paste's lines the same way", () => {
    const text = ["P1\tPlan\t1\t2\t4\ttriangular\t\tplanned\t", "", "P2\tBuild\t1\ttwo\t4\ttriangular\t\tplanned\tP1"].join("\n");
    expect(parsePastedRows(parseClipboardTable(text), { assumeDefaultColumnOrder: true }).errors).toEqual([
      { row: 3, column: "Most Likely", message: 'Most Likely must be a non-negative integer, got "two".', severity: "error" },
    ]);
  });
});

// -- (h) Schema checks, in words ------------------------------------------------------------

describe("(h) each schema check an imported row can fail is a sentence naming its column", () => {
  it("the four checks, one row each, and two on one row", () => {
    const r = parseFlatActivityTable(
      [
        PARSER_HEADER,
        ["A1", "N".repeat(201), "1", "2", "3", "Medium", "normal", "planned"], //  2 — 201 characters
        ["A2", "Two", "5", "4", "9", "Medium", "normal", "planned"], //            3 — Min above Most Likely
        ["A3", "Three", "1", "6", "5", "Medium", "normal", "planned"], //          4 — Most Likely above Max
        ["A4", "Four", "9", "6", "5", "Medium", "normal", "planned"], //           5 — both
        ["A5", "Five", "0", "0", "0", "Medium", "logNormal", "planned"], //        6 — LogNormal, all 0
        ["A6", "N".repeat(200), "0", "0", "0", "Medium", "triangular", "planned"], // 7 — control: 200 is allowed
      ],
      idGen()
    );
    expect(r.errors).toEqual([
      { row: 2, column: "name", message: NAME_TOO_LONG, severity: "error" },
      { row: 3, column: "min", message: MIN_ABOVE_ML, severity: "error" },
      { row: 4, column: "mostLikely", message: ML_ABOVE_MAX, severity: "error" },
      { row: 5, column: "min", message: MIN_ABOVE_ML, severity: "error" },
      { row: 5, column: "mostLikely", message: ML_ABOVE_MAX, severity: "error" },
      { row: 6, column: "max", message: LOGNORMAL_ZERO, severity: "error" },
    ]);
    expect(r.activities.map((a) => a.name.length)).toEqual([200]);
  });

  it("a sweep: these four sentences are ALL that reaches the screen from the schema — never Zod's words", () => {
    // Every distribution × every Min / Most Likely / Max in 0–3 × names around the limit — and a
    // cell over the 1,000-character cap. A schema failure's column is the field's key.
    const SCHEMA_KEYS = new Set(["id", "name", "min", "mostLikely", "max", "confidenceLevel", "distributionType", "status"]);
    const seen = new Map<string, number>();
    const all: CSVImportError[] = [];
    for (const distribution of DISTRIBUTION_TYPES) {
      for (const length of [1, 199, 200, 201, 1500]) {
        for (const [min, ml, max] of estimateTriples(3)) {
          const row = ["A1", "x".repeat(length), String(min), String(ml), String(max), "Medium", distribution, "planned"];
          const r = parseFlatActivityTable([PARSER_HEADER, row], idGen());
          all.push(...r.errors, ...r.warnings);
          for (const e of r.errors.filter((x) => SCHEMA_KEYS.has(x.column ?? ""))) seen.set(e.message, (seen.get(e.message) ?? 0) + 1);
        }
      }
    }
    // Exactly the four, each reached — so the sweep cannot pass without reaching them.
    expect([...seen.keys()].sort()).toEqual([LOGNORMAL_ZERO, MIN_ABOVE_ML, ML_ABOVE_MAX, NAME_TOO_LONG].sort());
    expect(all.filter((e) => /Too big|Too small|Invalid|expected/.test(e.message))).toEqual([]);
  });
});

// -- (i) and (m): the words people see --------------------------------------------------------

describe("(i) (m) Distribution, Status and Confidence are named as the app shows them", () => {
  it("an unknown Distribution or Status names the one used instead", () => {
    const r = parseFlatActivityTable(
      [
        PARSER_HEADER,
        ["A1", "One", "1", "2", "3", "Medium", "Weibull", "planned"], //   2
        ["A2", "Two", "1", "2", "3", "", "triangular", "someday"], //      3
      ],
      idGen()
    );
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([
      { row: 2, column: "Distribution", message: 'Unrecognized distribution "Weibull". Triangular will be used instead.', severity: "warning" },
      { row: 3, column: "Status", message: 'Unrecognized status "someday". Planned will be used instead.', severity: "warning" },
    ]);
    // Control: what the sentences say is what is imported.
    expect(r.activities.map((a) => [a.distributionType, a.status])).toEqual([
      ["triangular", "planned"],
      ["triangular", "planned"],
    ]);
  });

  it("an unknown Confidence lists the levels people see, in the order of the template's note — and each imports", () => {
    const r = parseFlatActivityTable([PARSER_HEADER, ["A1", "One", "1", "2", "3", "Super High", "normal", "planned"]], idGen());
    const listed = "Near certainty, Very high, High, Medium-high, Medium, Medium-low, Low, Very low, Extremely low, Guesstimate";
    expect(r.errors).toEqual([
      {
        row: 2,
        column: "Confidence Level",
        message: `Unrecognized confidence level "Super High". Accepted values: ${listed}.`,
        severity: "error",
      },
    ]);

    // The template's note lists the same ten in the same order; it writes two without their hyphens.
    const note = TEMPLATE.split("\n").find((line) => line.startsWith("# Confidence Level: "));
    expect(note).toBe(
      "# Confidence Level: Near Certainty, Very High, High, Medium High, Medium, Medium Low, Low, Very Low, Extremely Low, Guesstimate"
    );
    const squash = (s: string) => s.toLowerCase().replace(/[\s-]/g, "");
    expect(listed.split(", ").map(squash)).toEqual(note!.slice("# Confidence Level: ".length).split(", ").map(squash));

    // Every value the message offers is one the importer takes.
    for (const level of listed.split(", ")) {
      const one = parseFlatActivityTable([PARSER_HEADER, ["A1", "One", "1", "2", "3", level, "normal", "planned"]], idGen());
      expect(one.errors, level).toEqual([]);
    }
  });
});

// -- The screen -----------------------------------------------------------------------------------

function renderSection(importBlocked = false) {
  const importProjects = vi.fn(
    (_params: ImportApplyParams): ImportOutcome => ({ added: 1, replaced: 0, copied: 0, skipped: 0, driftSkipped: [], errors: [] })
  );
  const view = render(
    <MemoryRouter>
      <ActivityImportSection
        projects={[]}
        importProjects={importProjects}
        importScenarioToProject={vi.fn()}
        importBlocked={importBlocked}
      />
    </MemoryRouter>
  );
  return { ...view, importProjects };
}

function pickFile(text: string, name = "plan.csv"): void {
  fireEvent.change(screen.getByLabelText("Activity import CSV file"), { target: { files: [csvFile(text, name)] } });
}

function paste(text: string): void {
  fireEvent.change(screen.getByLabelText("Paste spreadsheet data"), { target: { value: text } });
}

/** The preview table's cells for a row number, or null when that row is not listed. */
function previewRow(row: number | "—"): string[] | null {
  for (const tr of screen.queryAllByRole("row")) {
    const cells = within(tr).queryAllByRole("cell").map((c) => (c.textContent ?? "").replace(/\s+/g, " ").trim());
    if (cells[0] === String(row)) return cells;
  }
  return null;
}

/** The table's first row — its text, after the "—" and the mark. */
function summaryText(): string | null {
  return previewRow("—")?.[2] ?? null;
}

/** The table's first row's mark cell — the ✓ or ✗ after its "—" — or null when there is no first row. */
function summaryMark(): HTMLElement | null {
  for (const tr of screen.queryAllByRole("row")) {
    const cells = within(tr).queryAllByRole("cell");
    if ((cells[0]?.textContent ?? "").trim() === "—") return cells[1] ?? null;
  }
  return null;
}

function importButton(): HTMLButtonElement | null {
  return screen.queryByRole("button", { name: "Import Activities" }) as HTMLButtonElement | null;
}

beforeEach(() => {
  usePreferencesStore.setState({ preferences: { ...DEFAULT_USER_PREFERENCES } });
});

describe("the screen", () => {
  it("(d) a FILE's error is listed against the row its spreadsheet shows — 19, not 11", async () => {
    renderSection();
    pickFile(replaceOnce(TEMPLATE, A10, A10.replace(",1,1,1,", ",1,one,1,")), "spert-activity-import-template.csv");
    await waitFor(() => expect(previewRow(19)).not.toBeNull());
    expect(previewRow(19)).toEqual(["19", "✗", "Most Likely", 'Most Likely must be a non-negative integer, got "one".']);
    expect(previewRow(11)).toBeNull();
    // A file's rows are its spreadsheet's: no note about pasted lines.
    expect(screen.queryByText(PASTE_NOTE)).toBeNull();
  });

  it("(d) a PASTE's error is listed against its line, and a note says how pasted rows are counted", async () => {
    renderSection();
    paste([HEADER_TSV, "P1\tPlan\t1\t2\t4\ttriangular\t\tplanned\t", "", "P2\tBuild\t5\t3\t6\ttriangular\t\tplanned\tP1"].join("\n"));
    await waitFor(() => expect(previewRow(4)).not.toBeNull());
    expect(previewRow(4)).toEqual(["4", "✗", "Optimistic (Min)", MIN_ABOVE_ML]);
    expect(screen.getByText(PASTE_NOTE)).toBeInTheDocument();
  });

  it("(b) 'ready to import' only when Import can import; an error blocking it says what to do instead", async () => {
    renderSection();
    // A10 names a predecessor that does not exist: A10 is still among the parsed activities AND listed as an error.
    pickFile(replaceOnce(TEMPLATE, A10, A10.replace('"A7,A8,A9"', '"A7,A8,A99"')), "spert-activity-import-template.csv");
    await waitFor(() => expect(previewRow(19)).not.toBeNull());
    expect(summaryText()).toBe(FIX_FILE);
    expect(previewRow("—")?.[1]).toBe("✗");
    expect(importButton()).toBeNull();
    expect(screen.queryByText(/ready to import|valid activit/)).toBeNull();

    // A paste's error: the same, in a paste's words.
    paste([HEADER_TSV, "P1\tPlan\t1\t2\t4\ttriangular\t\tplanned\tP9"].join("\n"));
    await waitFor(() => expect(summaryText()).toBe(FIX_PASTE));
    expect(importButton()).toBeNull();

    // Control: the template as shipped can be imported, and says so.
    pickFile(TEMPLATE, "spert-activity-import-template.csv");
    await waitFor(() => expect(summaryText()).toBe("10 valid activities ready to import"));
    expect(previewRow("—")?.[1]).toBe("✓");
    expect(importButton()?.disabled).toBe(false);
  });

  it("(b) while Import is greyed out for the cloud load, the row counts the activities but does not say 'ready to import'", async () => {
    renderSection(true);
    pickFile(TEMPLATE, "spert-activity-import-template.csv");
    await waitFor(() => expect(summaryText()).toBe("10 valid activities"));
    expect(importButton()?.disabled).toBe(true);
    expect(screen.queryByText(/ready to import/)).toBeNull();
  });

  it("(f) 'No recognizable header row found.' shows once, with the columns it looked for, beside its button", async () => {
    const { container } = renderSection();
    const headerless = TEMPLATE.split("\n").filter((line) => /^A\d+,/.test(line));
    expect(headerless).toHaveLength(10);
    pickFile(headerless.join("\n"), "no-header.csv");
    await screen.findByRole("button", { name: "Treat first row as data and assume default column order" });
    expect((container.textContent ?? "").split(NO_HEADER_SENTENCE)).toHaveLength(2);
    expect(screen.getByText(NO_HEADER)).toBeInTheDocument();
  });

  it("(f) control: an error for the whole import still shows below the table when a header row was found", async () => {
    renderSection();
    paste([HEADER_TSV, "P1\tPlan\t1\t2\t4\ttriangular\t\tplanned\tP2", "P2\tBuild\t1\t2\t4\ttriangular\t\tplanned\tP1"].join("\n"));
    await screen.findByText(/^Dependency cycle detected: /);
    expect(summaryText()).toBe(FIX_PASTE);
  });

  it("(h) two schema checks on one row read as two sentences", async () => {
    renderSection();
    paste([HEADER_TSV, "P1\tPlan\t9\t6\t5\ttriangular\t\tplanned\t"].join("\n"));
    await waitFor(() => expect(previewRow(2)).not.toBeNull());
    expect(previewRow(2)?.[3]).toBe(`${MIN_ABOVE_ML} ${ML_ABOVE_MAX}`);
  });

  it("(b) the first row's mark is titled 'Not ready to import' while an error blocks the import, and 'Valid' when Import can import", async () => {
    renderSection();
    // A10's Min above its Most Likely (5, 1, 1): one error, on row 19.
    pickFile(replaceOnce(TEMPLATE, A10, A10.replace(",1,1,1,", ",5,1,1,")), "spert-activity-import-template.csv");
    await waitFor(() => expect(summaryText()).toBe(FIX_FILE));
    expect(within(summaryMark()!).getByTitle("Not ready to import")).toHaveTextContent("✗");
    expect(within(summaryMark()!).queryByTitle("Valid")).toBeNull();

    // The template as shipped: ready to import, and its mark says so.
    pickFile(TEMPLATE, "spert-activity-import-template.csv");
    await waitFor(() => expect(summaryText()).toBe("10 valid activities ready to import"));
    expect(within(summaryMark()!).getByTitle("Valid")).toHaveTextContent("✓");
    expect(within(summaryMark()!).queryByTitle("Not ready to import")).toBeNull();
  });

  it("(b) a paste whose every row is refused still has a first row: the paste's line saying what to do", async () => {
    renderSection();
    // Line 2, the only row: Min above Most Likely, so no activity is left to import.
    paste([HEADER_TSV, "P1\tPlan\t5\t3\t6\ttriangular\t\tplanned\t"].join("\n"));
    await waitFor(() => expect(previewRow(2)).not.toBeNull());
    expect(previewRow(2)).toEqual(["2", "✗", "Optimistic (Min)", MIN_ABOVE_ML]);
    expect(summaryText()).toBe(FIX_PASTE);
    expect(previewRow("—")?.[1]).toBe("✗");
    expect(importButton()).toBeNull();
  });
});
