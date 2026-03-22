// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import type {
  Activity,
  ActivityDependency,
  RSMLevel,
  DistributionType,
  ActivityStatus,
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
  distributionType: DistributionType; // defaulted to "normal"
  status: ActivityStatus; // defaulted to "planned"
  predecessorTokens: string[]; // raw strings, e.g. ["A1", "A3+2"]
}

// -- Error / warning ----------------------------------------------------------

export interface CSVImportError {
  row: number; // 0 = global/graph-level error; >0 = specific row
  column?: string;
  message: string;
  severity: "error" | "warning";
}

// -- Parse result -------------------------------------------------------------

export interface CSVParseResult {
  activities: Activity[];
  dependencies: ActivityDependency[];
  errors: CSVImportError[];
  warnings: CSVImportError[];
  /** True when no recognizable header row was detected (UI can offer "assume default order" option) */
  noHeaderDetected?: boolean;
}
