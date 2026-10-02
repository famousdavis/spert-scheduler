// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Falsification spec for the v0.74.0 import release (WI-91, WI-92 (a)-(f), WI-66, WI-95 (g)):
//
//   ActivityImportSection.test.tsx — "Treat first row as data" reads its preview's own rows, and
//     re-checks a FILE's; no empty import from Ctrl+Enter; plurals; the Column cell; the local
//     date; the heuristic preferences.
//   csv-import-service.test.ts — the file checks (a row longer than its limit, a Type cell that is
//     not Activity, Section or blank), their row numbers, the 10 MB guard, the default name's date.
//   flat-activity-parser.test.ts and export-column-order-roundtrip.test.ts — the missing-column
//     messages name headings, not keys.
//
// Each straw names EXACTLY the tests it must fail, and no others, written down before the run.
// Read "K failing; named-match K" with K EQUAL to the number named in the id — not merely ✔: the
// runner passes a straw on any named match, so a straw that fails one of two named tests reads
// "1 failing; named-match 1", and an EXTRA failure shows only as "failing" above "named-match".
//
// I12-I14 go beyond one straw per behaviour: the two date sites in the reader's module, and the
// paste half of the re-read check (a paste's rows must NOT go through the file checks).
//
// Scope is the whole suite (src/): the label straws fail tests in three files.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const SECTION = new URL("../src/ui/components/ActivityImportSection.tsx", import.meta.url).pathname;
const READER = new URL("../src/app/api/csv-import-service.ts", import.meta.url).pathname;
const PARSER = new URL("../src/core/import/flat-activity-parser.ts", import.meta.url).pathname;
const SRC = new URL("../src/", import.meta.url).pathname;

// ActivityImportSection.test.tsx
const M1 = "a headerless FILE, then the button: the file's own rows, named for the file";
const M2 = "a headed paste in the box, then a headerless FILE and the button: still the file's rows";
const M2B =
  "a headerless paste previewed first, then a headerless FILE and the button: the FILE's rows are imported, not the paste's";
const REREAD_CHECKED =
  "re-reading a FILE refuses a row longer than the template's ten columns; re-reading a paste does not";
const SHORTCUT = "Ctrl+Enter on a header-only paste imports nothing and stores nothing; with one row it imports";
const SUMMARY_PLURALS = "the summary line says 1 activity, 1 dependency, 1 error, 1 warning — and the plural otherwise";
const COLUMN_CELL =
  "the third column is headed Column, and a schema failure's row shows the heading there, not the internal key";
const LOCAL_DATE_COMMIT = "starts on, and is named for, the LOCAL date";
const HEURISTIC = "takes the three heuristic preferences, as a new project does";

// csv-import-service.test.ts
const SPLIT_LONG = "is refused when the split makes it longer than the header row — at the preview's row number";
const ROW_NUMBER = "numbers a refused row exactly as the parser numbers its own errors";
const SPLIT_TYPE =
  "is refused when the split fills a blank or absent Type cell instead — the row is then no longer than the header";
const NO_TYPE_COLUMN = "is refused by its length in a file with no Type column — the limit is the file's own header row";
const UNHEADED_COLUMN = "with no heading, refuses every row it has a cell in; given a heading, refuses none";
const HEADERLESS_FILE = "refuses a row longer than the template's ten columns, and a tenth cell that is not a Type";
const SIZE = "refuses a file over 10 MB before reading it";
const LOCAL_DATE_NAME = "is the LOCAL date, for a paste and for a file named only '.csv'";

// flat-activity-parser.test.ts and export-column-order-roundtrip.test.ts
const MISSING_HEADER = "errors on missing required header";
const MISSING_LABELS = "both missing-column messages name the template's headings";
const ROUNDTRIP_CONTROL = "control: the parser DOES reject a file missing a required column";
const ROUNDTRIP_SCHEDULE = "is refused for a missing activityId — before column order is ever consulted";
const ROUNDTRIP_BEFORE = "was refused identically BEFORE the swap, so the swap did not cause this";

// Every named title must be ONE test in the suite: a title shared with another test would let a
// straw "match" a failure it did not cause. Checked when the spec loads, before any run.
const testSources = readdirSync(SRC, { recursive: true })
  .filter((f) => /\.test\.tsx?$/.test(f))
  .map((f) => readFileSync(path.join(SRC, f), "utf8"));
for (const title of [
  M1, M2, M2B, REREAD_CHECKED, SHORTCUT, SUMMARY_PLURALS, COLUMN_CELL, LOCAL_DATE_COMMIT, HEURISTIC,
  SPLIT_LONG, ROW_NUMBER, SPLIT_TYPE, NO_TYPE_COLUMN, UNHEADED_COLUMN, HEADERLESS_FILE, SIZE, LOCAL_DATE_NAME,
  MISSING_HEADER, MISSING_LABELS, ROUNDTRIP_CONTROL, ROUNDTRIP_SCHEDULE, ROUNDTRIP_BEFORE,
]) {
  const n = testSources.reduce((sum, src) => sum + src.split(`it(${JSON.stringify(title)}`).length - 1, 0);
  if (n !== 1) throw new Error(`falsify-spec-import-release: ${n} tests titled ${JSON.stringify(title)}`);
}

const escape = (s) => s.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

/** Matches exactly these test titles, as the verbose reporter prints them. */
const only = (...titles) => new RegExp(`> (?:${titles.map(escape).join("|")})$`);

export const testFile = "src/";
export const mutations = [
  {
    // The button reads the paste box again, as it did before v0.74.0.
    id: "I1  the button re-reads the paste box  [expect 4: M1, M2, M2B, REREAD_CHECKED]",
    file: SECTION,
    find: "        const next = firstRowAsData(preview);",
    replace:
      '        const next = firstRowAsData({ ...preview, rows: parseClipboardTable(pasteText), source: { kind: "paste" } });',
    expectFailing: only(M1, M2, M2B, REREAD_CHECKED),
  },
  {
    id: "I2  the empty-import guard removed  [expect 1: SHORTCUT]",
    file: SECTION,
    find: "if (result.errors.length > 0 || result.activities.length === 0) return;",
    replace: "if (result.errors.length > 0) return;",
    expectFailing: only(SHORTCUT),
  },
  {
    id: "I3  the commit's start date back on UTC  [expect 1: LOCAL_DATE_COMMIT]",
    file: SECTION,
    find: "startDate: formatDateISO(new Date()),",
    replace: "startDate: new Date().toISOString().slice(0, 10),",
    expectFailing: only(LOCAL_DATE_COMMIT),
  },
  {
    id: "I4  one heuristic preference dropped  [expect 1: HEURISTIC]",
    file: SECTION,
    find: "      heuristicMinPercent: preferences.defaultHeuristicMinPercent,\n",
    replace: "",
    expectFailing: only(HEURISTIC),
  },
  {
    id:
      "I5  resolveHeaders returns keys again  [expect 5: MISSING_HEADER, MISSING_LABELS, ROUNDTRIP_CONTROL, ROUNDTRIP_SCHEDULE, ROUNDTRIP_BEFORE]",
    file: PARSER,
    find: "return { missingFields: missing.map((f) => COLUMN_LABELS[f]) };",
    replace: "return { missingFields: missing };",
    expectFailing: only(MISSING_HEADER, MISSING_LABELS, ROUNDTRIP_CONTROL, ROUNDTRIP_SCHEDULE, ROUNDTRIP_BEFORE),
  },
  {
    id: "I6  the Column cell shows the raw key again  [expect 1: COLUMN_CELL]",
    file: SECTION,
    find: '{columnLabel(issues[0]?.column ?? "—")}',
    replace: '{issues[0]?.column ?? "—"}',
    expectFailing: only(COLUMN_CELL),
  },
  {
    id:
      "I7  the row-length check removed  [expect 6: SPLIT_LONG, ROW_NUMBER, NO_TYPE_COLUMN, UNHEADED_COLUMN, HEADERLESS_FILE, REREAD_CHECKED]",
    file: READER,
    find: "const refused = [...refuseLongRows(rows, layout), ...refuseTypeCells(rows, layout)];",
    replace: "const refused = [...refuseTypeCells(rows, layout)];",
    expectFailing: only(SPLIT_LONG, ROW_NUMBER, NO_TYPE_COLUMN, UNHEADED_COLUMN, HEADERLESS_FILE, REREAD_CHECKED),
  },
  {
    id: "I8  the headerless limit raised by one  [expect 2: HEADERLESS_FILE, REREAD_CHECKED]",
    file: READER,
    find: "cellLimit: DEFAULT_COLUMN_ORDER.length + 1,",
    replace: "cellLimit: DEFAULT_COLUMN_ORDER.length + 2,",
    expectFailing: only(HEADERLESS_FILE, REREAD_CHECKED),
  },
  {
    id: "I9  the 10 MB guard removed  [expect 1: SIZE]",
    file: READER,
    find:
      "  // Size guard before reading\n" +
      "  if (file.size > MAX_FILE_SIZE_BYTES) {\n" +
      "    throw new Error(\n" +
      "      `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 10 MB.`\n" +
      "    );\n" +
      "  }\n",
    replace: "",
    expectFailing: only(SIZE),
  },
  {
    id: "I10 the summary's activity noun on its default plural  [expect 1: SUMMARY_PLURALS]",
    file: SECTION,
    find: '{pluralize(previewResult.activities.length, "activity", "activities")}',
    replace: '{pluralize(previewResult.activities.length, "activity")}',
    expectFailing: only(SUMMARY_PLURALS),
  },
  {
    id: "I11 the Type check removed  [expect 3: SPLIT_LONG, SPLIT_TYPE, HEADERLESS_FILE]",
    file: READER,
    find: "const refused = [...refuseLongRows(rows, layout), ...refuseTypeCells(rows, layout)];",
    replace: "const refused = [...refuseLongRows(rows, layout)];",
    expectFailing: only(SPLIT_LONG, SPLIT_TYPE, HEADERLESS_FILE),
  },
  {
    id: "I12 a file named only '.csv' back on the UTC date  [expect 1: LOCAL_DATE_NAME]",
    file: READER,
    find: "return sanitized || `Imported — ${formatDateISO(new Date())}`;",
    replace: "return sanitized || `Imported — ${new Date().toISOString().slice(0, 10)}`;",
    expectFailing: only(LOCAL_DATE_NAME),
  },
  {
    id: "I13 a paste's default name back on the UTC date  [expect 2: LOCAL_DATE_NAME, LOCAL_DATE_COMMIT]",
    file: READER,
    find: "  return `Imported — ${formatDateISO(new Date())}`;",
    replace: "  return `Imported — ${new Date().toISOString().slice(0, 10)}`;",
    expectFailing: only(LOCAL_DATE_NAME, LOCAL_DATE_COMMIT),
  },
  {
    // A paste's rows split on tabs only; sending them through the file checks would refuse a
    // paste's eleventh column, which loses nothing.
    id: "I14 a paste's re-read sent through the file checks  [expect 1: REREAD_CHECKED]",
    file: SECTION,
    find: "    result: parseFlatActivityTable(rows, generateId, options),",
    replace: "    result: parseCsvFileRows(rows, options),",
    expectFailing: only(REREAD_CHECKED),
  },
];
