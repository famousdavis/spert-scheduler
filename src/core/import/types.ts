// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type {
  Activity,
  ActivityDependency,
  RSMLevel,
  DistributionType,
  ActivityStatus,
  DateFormatPreference,
} from "@domain/models/types";

// -- Intermediate parse row ---------------------------------------------------

export interface FlatActivityRow {
  rowNumber: number;
  userActivityId: string; // user's "A1", "A2" — used only during parsing
  name: string;
  min: number;
  mostLikely: number;
  max: number;
  confidenceLevel: RSMLevel;
  distributionType: DistributionType; // defaulted to "triangular" (a blank or unrecognised cell)
  status: ActivityStatus; // defaulted to "planned"
  predecessorTokens: string[]; // raw strings, e.g. ["A1", "A3+2"]
}

// -- Error / warning ----------------------------------------------------------

export interface CSVImportError {
  /**
   * 0 = global/graph-level error; >0 = the row's number as the user sees it: its row in their
   * spreadsheet for a file (notes, blank rows and the header counted); for a paste, its row in what
   * was pasted (its line in the pasted text, blank lines counted), the first being 1.
   */
  row: number;
  column?: string;
  message: string;
  severity: "error" | "warning";
}

// -- Parse options --------------------------------------------------------------

export interface ParseTableOptions {
  /** Read every row as data, in the template's column order ("Treat first row as data"). */
  assumeDefaultColumnOrder?: boolean;
  /**
   * The number the user sees for each row — `rowNumbers[i]` for `rows[i]` — when rows were left
   * out before parsing (notes, blank rows). Every message that names a row takes it from here.
   * Without it, a row's number is its index + 1.
   */
  rowNumbers?: readonly number[];
  /**
   * WI-150: today, `YYYY-MM-DD`, read from the clock by the caller (the core never reads it). An
   * Actual Start or Actual Finish after it is refused, as the Edit Activity window refuses one.
   */
  today?: string;
  /**
   * WI-150: the importing user's date format. A date such as 03/04/2026 is read in its order unless
   * the file's own dates prove the other order (a day above 12 where the month would be).
   */
  dateFormat?: DateFormatPreference;
}

// -- Parse result -------------------------------------------------------------

export interface CSVParseResult {
  activities: Activity[];
  dependencies: ActivityDependency[];
  errors: CSVImportError[];
  warnings: CSVImportError[];
  /** True when no recognizable header row was detected (UI can offer "assume default order" option) */
  noHeaderDetected?: boolean;
  /**
   * WI-150: whole-file sentences for the preview — neither errors nor warnings, and not counted.
   * Shown only when nothing blocks the import, so every count in them is a count of activities.
   */
  notes?: string[];
  /** WI-150: the earliest Actual Start the imported rows record, `YYYY-MM-DD` — the scenario starts there. */
  earliestActualStart?: string;
}
