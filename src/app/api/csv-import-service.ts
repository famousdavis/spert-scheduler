// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import Papa from "papaparse";
import {
  COLUMN_LABELS,
  DEFAULT_COLUMN_ORDER,
  parseFlatActivityTable,
  resolveHeaders,
} from "@core/import/flat-activity-parser";
import type { CSVImportError, CSVParseResult } from "@core/import/types";
import { formatDateISO } from "@core/calendar/calendar";
import { generateId } from "@app/api/id";

// -- Constants ----------------------------------------------------------------

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_CLIPBOARD_LENGTH = 5_000_000; // 5 MB of text

// -- Clipboard parsing --------------------------------------------------------

/**
 * Parse tab-separated text (from spreadsheet clipboard paste) into a string[][].
 * Throws on oversized input.
 */
export function parseClipboardTable(text: string): string[][] {
  if (text.length > MAX_CLIPBOARD_LENGTH) {
    throw new Error(
      "Pasted content is too large. Please use CSV file upload for large datasets."
    );
  }
  return text
    .split(/\r?\n/)
    .map((row) => {
      const cells = row.split("\t").map((cell) => cell.trim());
      // Trim trailing ghost columns (Excel/Sheets phantom tab stops)
      while (cells.length > 0 && cells[cells.length - 1] === "") cells.pop();
      return cells;
    })
    .filter((row) => row.length > 0 && row.some((cell) => cell !== ""));
}

// -- CSV file import ----------------------------------------------------------

/**
 * Read a CSV file into its rows: parsed with papaparse, then comment rows, empty rows and each
 * row's trailing empty cells removed. The import screen keeps these rows, so "Treat first row as
 * data" can read the same file again. Throws when the file is over 10 MB, before reading it.
 */
export async function readCsvRows(file: File): Promise<string[][]> {
  // Size guard before reading
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(
      `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 10 MB.`
    );
  }

  // Read file as UTF-8 text
  const text = await readFileAsText(file);

  // Parse CSV with papaparse (quote-safe, handles CRLF, BOM, etc.)
  const parsed = Papa.parse(text, {
    header: false,
    skipEmptyLines: true,
    delimiter: ",",
    quoteChar: '"',
  });

  let rows = parsed.data as string[][];

  // Strip comment rows (first non-empty cell starts with #)
  rows = rows.filter((row) => {
    const first = row[0]?.trim() ?? "";
    return !first.startsWith("#");
  });

  // Filter empty rows
  rows = rows.filter(
    (row) => row.length > 0 && row.some((cell) => (cell ?? "").trim() !== "")
  );

  // Trim ghost columns from each row
  rows = rows.map((row) => {
    const cells = row.map((cell) => (cell ?? "").trim());
    while (cells.length > 0 && cells[cells.length - 1] === "") cells.pop();
    return cells;
  });

  return rows;
}

/**
 * Parse a CSV FILE's rows (from {@link readCsvRows}) and refuse the rows a comma has split.
 *
 * In a file, an unquoted comma inside a cell — "A3,A4" typed without its quotes — splits it in
 * two, and every cell after it moves one column right. The activity parser cannot see that: it
 * reads each column it knows and ignores the rest, so in the template's layout the second
 * predecessor lands in Type and nothing says so. These checks run outside the parser, on the
 * reader's own rows, and their errors join the parse result. Row numbers are the parser's own
 * (index + 1 over the same array), so they match the preview.
 *
 * ⚠️ They see a split only when it leaves a mark: a row longer than its limit, or a Type cell that
 * is not Activity, Section or blank. A refused row stays in `activities`.
 *
 * A paste's rows never come here: they split on tabs only, so no cell spills into the next.
 */
export function parseCsvFileRows(
  rows: string[][],
  options?: { assumeDefaultColumnOrder?: boolean }
): CSVParseResult {
  const result = parseFlatActivityTable(rows, generateId, options);
  const layout = fileLayout(rows, options?.assumeDefaultColumnOrder ?? false);
  if (!layout) return result;
  const refused = [...refuseLongRows(rows, layout), ...refuseTypeCells(rows, layout)];
  return refused.length === 0 ? result : { ...result, errors: [...result.errors, ...refused] };
}

/**
 * Read a CSV file and parse it, with the file checks.
 * Throws when the file is over 10 MB (see {@link readCsvRows}).
 */
export async function importActivitiesFromCSV(
  file: File
): Promise<CSVParseResult> {
  return parseCsvFileRows(await readCsvRows(file));
}

// -- File row checks ----------------------------------------------------------

const LONG_ROW_HEADED =
  'This row has more cells than there are column headings. A cell that contains a comma — for example several predecessors, "A3,A4" — must be in quotes. If the extra cells are a column of your own, give that column a heading.';

const LONG_ROW_HEADERLESS =
  'This row has more cells than the template\'s ten columns. A cell that contains a comma — for example several predecessors, "A3,A4" — must be in quotes.';

const TYPE_NOT_RECOGNIZED =
  'The Type column takes Activity, Section or nothing. If a cell before it contains a comma — for example several predecessors, "A3,A4" — it must be in quotes.';

/** What a FILE's data rows are checked against. */
interface FileLayout {
  /** The first data row's index: 1 below a header row, 0 when the first row is data. */
  firstDataIndex: number;
  /** The most cells a data row may hold. */
  cellLimit: number;
  longRowMessage: string;
  /** The Type column's index, or undefined when the file has no Type column. */
  typeIndex: number | undefined;
}

/**
 * A file's layout, or null when its first row is not a header row the parser could read — the
 * parser's own error stands alone then, and "Treat first row as data" is the way on.
 */
function fileLayout(rows: string[][], firstRowIsData: boolean): FileLayout | null {
  if (firstRowIsData) {
    // The template's ten columns: the headerless order, then Type.
    return {
      firstDataIndex: 0,
      cellLimit: DEFAULT_COLUMN_ORDER.length + 1,
      longRowMessage: LONG_ROW_HEADERLESS,
      typeIndex: DEFAULT_COLUMN_ORDER.length,
    };
  }
  const header = rows[0];
  if (header === undefined) return null;
  const resolved = resolveHeaders(header);
  if ("missingFields" in resolved) return null;
  return {
    firstDataIndex: 1,
    cellLimit: header.length, // the reader has already trimmed its trailing empty cells
    longRowMessage: LONG_ROW_HEADED,
    typeIndex: resolved.headers.type,
  };
}

/** An error for each data row with more cells than the file's layout allows. */
function refuseLongRows(rows: string[][], layout: FileLayout): CSVImportError[] {
  const refused: CSVImportError[] = [];
  for (let i = layout.firstDataIndex; i < rows.length; i++) {
    if (rows[i]!.length > layout.cellLimit) {
      refused.push({ row: i + 1, message: layout.longRowMessage, severity: "error" });
    }
  }
  return refused;
}

/** An error for each data row whose Type cell is not Activity, Section or blank. */
function refuseTypeCells(rows: string[][], layout: FileLayout): CSVImportError[] {
  const { typeIndex } = layout;
  if (typeIndex === undefined) return [];
  const refused: CSVImportError[] = [];
  for (let i = layout.firstDataIndex; i < rows.length; i++) {
    const type = (rows[i]![typeIndex] ?? "").trim().toLowerCase();
    if (type !== "" && type !== "activity" && type !== "section") {
      refused.push({
        row: i + 1,
        column: COLUMN_LABELS.type,
        message: TYPE_NOT_RECOGNIZED,
        severity: "error",
      });
    }
  }
  return refused;
}

// -- Scenario name helpers ----------------------------------------------------

/**
 * Derive a default scenario name from a CSV filename or fall back to date.
 */
export function getDefaultScenarioName(
  source: "file" | "clipboard",
  filename?: string
): string {
  if (source === "file" && filename) {
    const rawName = filename.replace(/\.[^.]+$/, ""); // strip extension
    const sanitized = rawName.replace(/[^a-zA-Z0-9 _-]/g, "_").slice(0, 200);
    return sanitized || `Imported — ${formatDateISO(new Date())}`;
  }
  return `Imported — ${formatDateISO(new Date())}`;
}

// -- Internal helpers ---------------------------------------------------------

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsText(file, "UTF-8");
  });
}
