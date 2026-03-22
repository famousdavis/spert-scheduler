// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import Papa from "papaparse";
import { parseFlatActivityTable } from "@core/import/flat-activity-parser";
import type { CSVParseResult } from "@core/import/types";
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
 * Read a CSV file, parse with papaparse, and run through the activity parser.
 * Returns a CSVParseResult with activities, dependencies, errors, and warnings.
 */
export async function importActivitiesFromCSV(
  file: File
): Promise<CSVParseResult> {
  // Size guard before reading
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      activities: [],
      dependencies: [],
      errors: [
        {
          row: 0,
          message: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 10 MB.`,
          severity: "error",
        },
      ],
      warnings: [],
    };
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

  return parseFlatActivityTable(rows, generateId);
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
    return sanitized || `Imported — ${new Date().toISOString().slice(0, 10)}`;
  }
  return `Imported — ${new Date().toISOString().slice(0, 10)}`;
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
