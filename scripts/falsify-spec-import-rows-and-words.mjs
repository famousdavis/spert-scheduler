// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Falsification spec for Import Activities' row numbers and words (WI-95 (b), (d), (f), (h), (i), (m)).
//
// A FILE's row number is the row its spreadsheet shows (notes, blank rows and the header counted; a
// quoted cell spanning lines counted once), a PASTE's is its line; schema failures, an unknown
// Distribution or Status, and an unknown Confidence are named as the app names them; the table's
// first row says "ready to import" only when Import can import; the no-header sentence shows once.
// Each straw restores the old behaviour or a plausible half-fix, and names EXACTLY the tests it must
// fail, written down before the run: read "K failing; named-match K" with K equal to the id's count.
//
// Usage: node scripts/falsify.mjs scripts/falsify-spec-import-rows-and-words.mjs
import { readFileSync } from "node:fs";

const READER = new URL("../src/app/api/csv-import-service.ts", import.meta.url).pathname;
const PARSER = new URL("../src/core/import/flat-activity-parser.ts", import.meta.url).pathname;
const SECTION = new URL("../src/ui/components/ActivityImportSection.tsx", import.meta.url).pathname;
const TESTS = new URL("../src/integration/import-row-numbers-and-messages.test.tsx", import.meta.url).pathname;

// (d) a file
const F1 = "the template with one bad cell: the error names row 19, the line A10 is on — not row 11";
const F2 = "notes and blank rows count, above the header and between rows — in the duplicate message's numbers too";
const F3 = "a quoted cell spanning two lines is ONE row, as in a spreadsheet — the rows below it keep their numbers";
const F4 = "the cycle message names the file's rows";
const F5 = "the file's own checks number rows the same way, and so does 'Treat first row as data'";
// (d) a paste
const P1 = "a blank line counts";
const P2 = "a blank first line: the header is line 2, and it is still found";
const P3 = "Windows line endings and a trailing line end change nothing";
const P4 = "'Treat first row as data' numbers a headerless paste's lines the same way";
// (h) (i) (m)
const H1 = "the four checks, one row each, and two on one row";
const H2 = "a sweep: these four sentences are ALL that reaches the screen from the schema — never Zod's words";
const I1 = "an unknown Distribution or Status names the one used instead";
const M1 = "an unknown Confidence lists the levels people see, in the order of the template's note — and each imports";
// the screen
const S1 = "(d) a FILE's error is listed against the row its spreadsheet shows — 19, not 11";
const S2 = "(d) a PASTE's error is listed against its line, and a note says how pasted rows are counted";
const S3 = "(b) 'ready to import' only when Import can import; an error blocking it says what to do instead";
const S4 =
  "(b) while Import is greyed out for the cloud load, the row counts the activities but does not say 'ready to import'";
const S5 = "(f) 'No recognizable header row found.' shows once, with the columns it looked for, beside its button";
const S6 = "(f) control: an error for the whole import still shows below the table when a header row was found";
const S7 = "(h) two schema checks on one row read as two sentences";
const S8 =
  "(b) the first row's mark is titled 'Not ready to import' while an error blocks the import, and 'Valid' when Import can import";
const S9 = "(b) a paste whose every row is refused still has a first row: the paste's line saying what to do";

// Every named title must be ONE test in the file, or a straw could "match" a failure it did not cause.
const testSource = readFileSync(TESTS, "utf8");
for (const title of [F1, F2, F3, F4, F5, P1, P2, P3, P4, H1, H2, I1, M1, S1, S2, S3, S4, S5, S6, S7, S8, S9]) {
  const n = testSource.split(`it(${JSON.stringify(title)}`).length - 1;
  if (n !== 1) throw new Error(`falsify-spec-import-rows-and-words: ${n} tests titled ${JSON.stringify(title)}`);
}

const escape = (s) => s.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

/** Matches exactly these test titles, as the verbose reporter prints them. */
const only = (...titles) => new RegExp(`> (?:${titles.map(escape).join("|")})$`);

export const testFile = "src/integration/import-row-numbers-and-messages.test.tsx";
export const mutations = [
  // -- (d) a file's rows ---------------------------------------------------------------------------
  {
    // Empty lines skipped by the reader again: every row below one moves up.
    id: "X1  the reader skips empty lines again  [expect 2: F2, F5]",
    file: READER,
    find: "    skipEmptyLines: false,",
    replace: "    skipEmptyLines: true,",
    expectFailing: only(F2, F5),
  },
  {
    // The half-fix: the file's rows are numbered, but the numbers never reach the parser.
    id: "X2  a file's row numbers not passed to the parser  [expect 5: F1, F2, F4, S1, S3]",
    file: READER,
    find: "  const result = parseFlatActivityTable(rows, generateId, { ...options, rowNumbers });",
    replace: "  const result = parseFlatActivityTable(rows, generateId, options);",
    expectFailing: only(F1, F2, F4, S1, S3),
  },
  {
    // The file's own checks keep counting the rows they were handed.
    id: "X3  the long-row check numbers by position  [expect 1: F5]",
    file: READER,
    find: "      refused.push({ row: layout.rowNumbers[i]!, message: layout.longRowMessage, severity: \"error\" });",
    replace: "      refused.push({ row: i + 1, message: layout.longRowMessage, severity: \"error\" });",
    expectFailing: only(F5),
  },
  {
    id: "X4  the Type check numbers by position  [expect 1: F5]",
    file: READER,
    find: "        row: layout.rowNumbers[i]!,\n        column: COLUMN_LABELS.type,",
    replace: "        row: i + 1,\n        column: COLUMN_LABELS.type,",
    expectFailing: only(F5),
  },
  {
    // The parser ignores the numbers it is given: a file AND a paste renumbered.
    id: "X5  the parser ignores rowNumbers  [expect 10: F1, F2, F4, P1, P2, P3, P4, S1, S2, S3]",
    file: PARSER,
    find: "    const rowNum = options?.rowNumbers?.[i] ?? i + 1; // the row number the user sees",
    replace: "    const rowNum = i + 1; // the row number the user sees",
    expectFailing: only(F1, F2, F4, P1, P2, P3, P4, S1, S2, S3),
  },
  {
    // A quoted cell no longer kept whole — the way a reader that splits lines first would read it.
    // Not a likely edit; it is here to show F3 can fail. The template's quoted predecessors split too.
    id: "X7  a quoted cell read as its lines  [expect 6: F1, F3, S1, S3, S4, S8]", // S8 added by AMEND-1, its set measured
    file: READER,
    find: "  const parsed = Papa.parse(text, {",
    replace: '  const parsed = Papa.parse(text.replaceAll(\'"\', ""), {',
    expectFailing: only(F1, F3, S1, S3, S4, S8),
  },
  // -- (d) a paste's rows ----------------------------------------------------------------------------
  {
    // The old paste reader: blank lines dropped before anything is numbered.
    id: "X6  a paste's blank lines dropped before numbering  [expect 5: P1, P2, P3, P4, S2]",
    file: READER,
    find: '  return text.split(/\\r?\\n/).map((row) => trimCells(row.split("\\t")));',
    replace: '  return text.split(/\\r?\\n/).map((row) => trimCells(row.split("\\t"))).filter((row) => row.length > 0);',
    expectFailing: only(P1, P2, P3, P4, S2),
  },
  {
    // The note under a FILE's table instead of a paste's.
    id: "X18 the pasted-lines note on the wrong source  [expect 2: S1, S2]",
    file: SECTION,
    find: '{importState.source.kind === "paste" && allErrors.some((e) => e.row > 0) && (',
    replace: '{importState.source.kind === "file" && allErrors.some((e) => e.row > 0) && (',
    expectFailing: only(S1, S2),
  },
  // -- (h) (i) (m) words --------------------------------------------------------------------------------
  {
    id: "X8  Zod's own words reach the screen again  [expect 6: H1, H2, P1, S2, S7, S9]", // S9 added by AMEND-1, its set measured
    file: PARSER,
    find: "          message: schemaIssueMessage(issue),",
    replace: "          message: issue.message,",
    expectFailing: only(H1, H2, P1, S2, S7, S9),
  },
  {
    // The name check missed: the fallback names the column but keeps Zod's words.
    id: "X9  the over-long name not recognised  [expect 2: H1, H2]",
    file: PARSER,
    find: '  if (field === "name" && issue.code === "too_big") {',
    replace: '  if (field === "title" && issue.code === "too_big") {',
    expectFailing: only(H1, H2),
  },
  {
    id: "X10 the Distribution warning names the internal value  [expect 1: I1]",
    file: PARSER,
    find: "${distributionLabel(distributionType)} will be used instead.",
    replace: "${distributionType} will be used instead.",
    expectFailing: only(I1),
  },
  {
    id: "X11 the Status warning names the internal value  [expect 1: I1]",
    file: PARSER,
    find: "${statusLabel(status)} will be used instead.",
    replace: "${status} will be used instead.",
    expectFailing: only(I1),
  },
  {
    id: "X12 the Confidence list is the map's keys again  [expect 1: M1]",
    file: PARSER,
    find: 'const CONFIDENCE_ACCEPTED = RSM_LEVELS.map((level) => RSM_LABELS[level]).join(", ");',
    replace: 'const CONFIDENCE_ACCEPTED = Object.keys(CONFIDENCE_MAP).join(", ");',
    expectFailing: only(M1),
  },
  {
    // Two sentences on one row joined as before.
    id: "X19 one row's messages joined by '; ' again  [expect 1: S7]",
    file: SECTION,
    find: '{issues.map((i) => i.message).join(" ")}',
    replace: '{issues.map((i) => i.message).join("; ")}',
    expectFailing: only(S7),
  },
  // -- (b) the table's first row ------------------------------------------------------------------------
  {
    // THE defect: "ready to import" while an error blocks the import.
    id: "X13 'ready to import' despite errors  [expect 4: S3, S6, S8, S9]", // S8, S9 added by AMEND-1, its set measured
    file: SECTION,
    find: "  if (result.errors.length > 0) return { blocked: true, text: FIX_BEFORE_IMPORT[source.kind] };\n",
    replace: "",
    expectFailing: only(S3, S6, S8, S9),
  },
  {
    id: "X14 'ready to import' while Import is greyed out  [expect 1: S4]",
    file: SECTION,
    find: "  return { blocked: false, text: importBlocked ? valid : `${valid} ready to import` };",
    replace: "  return { blocked: false, text: `${valid} ready to import` };",
    expectFailing: only(S4),
  },
  {
    // A paste told to choose its file again.
    id: "X15 one line for a file and a paste  [expect 3: S3, S6, S9]", // S9 added by AMEND-1, its set measured
    file: SECTION,
    find: "  if (result.errors.length > 0) return { blocked: true, text: FIX_BEFORE_IMPORT[source.kind] };",
    replace: "  if (result.errors.length > 0) return { blocked: true, text: FIX_BEFORE_IMPORT.file };",
    expectFailing: only(S3, S6, S9),
  },
  // -- (f) the no-header sentence, once -------------------------------------------------------------------
  {
    // THE defect: the message below the table as well as in its box.
    id: "X16 the no-header message below the table again  [expect 1: S5]",
    file: SECTION,
    find: "{!previewResult.noHeaderDetected &&\n              globalErrors.map((e, i) => (",
    replace: "{globalErrors.map((e, i) => (",
    expectFailing: only(S5),
  },
  {
    // The half-fix: the box keeps its own sentence, and the columns it looked for are shown nowhere.
    id: "X17 the box's fixed sentence back  [expect 1: S5]",
    file: SECTION,
    find:
      '                {globalErrors.map((e, i) => (\n                  <p key={`no-header-${i}`} className="text-sm text-amber-800 dark:text-amber-300">\n                    {e.message}\n                  </p>\n                ))}',
    replace: '                <p className="text-sm text-amber-800 dark:text-amber-300">No recognizable header row found.</p>',
    expectFailing: only(S5),
  },
  // -- (b) the first row's mark, and a paste with every row refused ---------------------------------
  {
    // The blocked row keeps the ready row's hover title: a ✗ that says "Valid".
    id: "X20 the blocked first row's mark titled 'Valid' again  [expect 1: S8]",
    file: SECTION,
    find: 'title="Not ready to import"',
    replace: 'title="Valid"',
    expectFailing: only(S8),
  },
  {
    // As on main: no first row unless some activity was parsed, so a paste whose every row is refused
    // lists its errors with nothing saying the import is blocked or what to do.
    id: "X21 a paste with every row refused shows no first row, as on main  [expect 1: S9]",
    file: SECTION,
    find: "  if (result.noHeaderDetected) return null;",
    replace: "  if (result.noHeaderDetected || result.activities.length === 0) return null;",
    expectFailing: only(S9),
  },
];
