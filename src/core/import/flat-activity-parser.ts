// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import type {
  Activity,
  ActivityDependency,
  RSMLevel,
  DistributionType,
  ActivityStatus,
} from "@domain/models/types";
import { DEFAULT_SCENARIO_SETTINGS } from "@domain/models/types";
import { ActivitySchema } from "@domain/schemas/project.schema";
import { detectCycle } from "@core/schedule/dependency-graph";
import type { FlatActivityRow, CSVImportError, CSVParseResult } from "./types";

// -- Normalization helpers ----------------------------------------------------

const normalizeKey = (s: string): string =>
  s.toLowerCase().replace(/\s+/g, "");

const CONFIDENCE_MAP: Record<string, RSMLevel> = {
  nearcertainty: "nearCertainty",
  veryhigh: "veryHighConfidence",
  high: "highConfidence",
  mediumhigh: "mediumHighConfidence",
  medium: "mediumConfidence",
  mediumlow: "mediumLowConfidence",
  low: "lowConfidence",
  verylow: "veryLowConfidence",
  extremelylow: "extremelyLowConfidence",
  guesstimate: "guesstimate",
};

const CONFIDENCE_ACCEPTED = Object.keys(CONFIDENCE_MAP).join(", ");

const DISTRIBUTION_MAP: Record<string, DistributionType> = {
  normal: "normal",
  lognormal: "logNormal",
  triangular: "triangular",
  uniform: "uniform",
};

const STATUS_MAP: Record<string, ActivityStatus> = {
  planned: "planned",
  inprogress: "inProgress",
  complete: "complete",
};

// -- Security helpers ---------------------------------------------------------

/** Maximum character length for a single CSV cell before truncation. */
const MAX_CELL_LENGTH = 1000;

/** Truncate a string for display in error/warning messages. */
function truncate(val: string, max = 80): string {
  return val.length > max ? val.slice(0, max) + "\u2026" : val;
}

// -- Header resolution --------------------------------------------------------

// All alias values must be pre-normalized (lowercase, no whitespace) to match normalizeKey output
const HEADER_ALIASES: Record<string, string[]> = {
  activityId: ["activityid", "id", "taskid"],
  name: ["activityname", "name", "task"],
  min: ["optimistic", "optimisticmin", "min", "optimistic(min)"],
  mostLikely: ["mostlikely", "ml", "likely"],
  max: ["pessimistic", "max", "pessimisticmax", "pessimistic(max)"],
  confidence: ["confidence", "confidencelevel"],
  distribution: ["distribution"],
  status: ["status"],
  predecessors: ["predecessors", "depends", "dependencies", "predecessor"],
};

const REQUIRED_FIELDS = [
  "activityId",
  "name",
  "min",
  "mostLikely",
  "max",
  "confidence",
] as const;

/** Default column order when no header is detected and user opts to treat first row as data */
const DEFAULT_COLUMN_ORDER = [
  "activityId",
  "name",
  "min",
  "mostLikely",
  "max",
  "confidence",
  "distribution",
  "status",
  "predecessors",
] as const;

interface HeaderMap {
  [field: string]: number; // field name → column index
}

function resolveHeaders(
  headerRow: string[]
): { headers: HeaderMap } | { missingFields: string[] } {
  const headers: HeaderMap = {};
  const normalizedCells = headerRow.map((cell) => normalizeKey(cell));

  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const idx = normalizedCells.findIndex((cell) => aliases.includes(cell));
    if (idx !== -1) {
      headers[field] = idx;
    }
  }

  const missing = REQUIRED_FIELDS.filter((f) => !(f in headers));
  if (missing.length > 0) {
    return { missingFields: missing };
  }

  return { headers };
}

// -- Predecessor token regex --------------------------------------------------

// Activity IDs in predecessor tokens use [A-Za-z0-9_] (no hyphens) to avoid
// ambiguity with lag syntax like "A2-2" (ID "A2", lag -2).
// eslint-disable-next-line sonarjs/concise-regex -- explicit character class intentional — documents hyphen exclusion
const PREDECESSOR_REGEX = /^([A-Za-z0-9_]+)([+-]\d+)?$/;

// -- Excel date detection (warning, not error) --------------------------------

const MONTH_ABBREV_DATE = /^\d{1,2}-[A-Za-z]{3}$/; // "1-Mar"
const FULL_DATE_PATTERN = /^\d{1,2}\/\d{1,2}\/\d{4}$/; // "1/15/2026"

// -- Main parser --------------------------------------------------------------

export function parseFlatActivityTable(
  rows: string[][],
  idGen: () => string = () => crypto.randomUUID(),
  options?: { assumeDefaultColumnOrder?: boolean }
): CSVParseResult {
  const errors: CSVImportError[] = [];
  const warnings: CSVImportError[] = [];

  if (rows.length === 0) {
    errors.push({ row: 0, message: "No data to import.", severity: "error" });
    return { activities: [], dependencies: [], errors, warnings };
  }

  // -- Pass 0: Header resolution ----------------------------------------------

  let headers: HeaderMap;
  let dataStartIndex: number;

  if (options?.assumeDefaultColumnOrder) {
    // Treat first row as data, use default column order
    headers = {};
    DEFAULT_COLUMN_ORDER.forEach((field, i) => {
      headers[field] = i;
    });
    dataStartIndex = 0;
  } else {
    const result = resolveHeaders(rows[0]!);
    if ("missingFields" in result) {
      // Check if the first row might be data (not a header)
      const firstRowLooksLikeData =
        rows[0]!.length >= 6 && /^\d+$/.test((rows[0]![2] ?? "").trim());
      if (firstRowLooksLikeData) {
        errors.push({
          row: 0,
          message: `No recognizable header row found. Missing columns: ${result.missingFields.join(", ")}.`,
          severity: "error",
        });
        return {
          activities: [],
          dependencies: [],
          errors,
          warnings,
          noHeaderDetected: true,
        };
      }
      errors.push({
        row: 0,
        message: `Missing required column${result.missingFields.length > 1 ? "s" : ""}: ${result.missingFields.join(", ")}.`,
        severity: "error",
      });
      return { activities: [], dependencies: [], errors, warnings };
    }
    headers = result.headers;
    dataStartIndex = 1;
  }

  // -- Pass 1: Row parse + UUID + Zod -----------------------------------------

  const flatRows: FlatActivityRow[] = [];
  const activities: Activity[] = [];
  const activityIdMap = new Map<string, string>(); // userId → UUID
  const uuidToRowInfo = new Map<
    string,
    { userId: string; row: number; name: string }
  >();
  const duplicateCheck = new Map<string, number>(); // userId → first row number
  let rowLimitReached = false;

  for (let i = dataStartIndex; i < rows.length; i++) {
    const row = rows[i]!;
    const rowNum = i + 1; // 1-based for user display

    // Skip comment rows
    const firstCell = row[0]?.trim() ?? "";
    if (firstCell.startsWith("#")) continue;

    // Skip empty rows
    if (row.every((cell) => cell.trim() === "")) continue;

    // Early-exit: stop processing once the activity limit is reached.
    // The post-loop limit check uses rowLimitReached to produce the user-facing error.
    if (activities.length >= 500) {
      rowLimitReached = true;
      break;
    }

    // Cap individual cell lengths to prevent oversized values from reaching
    // downstream processing (regex, error messages, Zod validation).
    const cappedRow = row.map((c) => c.length > MAX_CELL_LENGTH ? c.slice(0, MAX_CELL_LENGTH) : c);

    // Extract cells
    const rawActivityId = (
      cappedRow[headers.activityId!] ?? ""
    ).trim();
    const rawName = (cappedRow[headers.name!] ?? "").trim();
    const rawMin = (cappedRow[headers.min!] ?? "").trim();
    const rawML = (cappedRow[headers.mostLikely!] ?? "").trim();
    const rawMax = (cappedRow[headers.max!] ?? "").trim();
    const rawConfidence = (cappedRow[headers.confidence!] ?? "").trim();
    const rawDistribution =
      headers.distribution !== undefined
        ? (cappedRow[headers.distribution] ?? "").trim()
        : "";
    const rawStatus =
      headers.status !== undefined
        ? (cappedRow[headers.status] ?? "").trim()
        : "";
    const rawPredecessors =
      headers.predecessors !== undefined
        ? (cappedRow[headers.predecessors] ?? "").trim()
        : "";

    // Basic field presence
    if (!rawActivityId) {
      errors.push({
        row: rowNum,
        column: "Activity ID",
        message: "Activity ID is required.",
        severity: "error",
      });
      continue;
    }
    if (!rawName) {
      errors.push({
        row: rowNum,
        column: "Activity Name",
        message: "Activity Name is required.",
        severity: "error",
      });
      continue;
    }

    // Excel date detection on Activity ID
    if (MONTH_ABBREV_DATE.test(rawActivityId)) {
      warnings.push({
        row: rowNum,
        column: "Activity ID",
        message: `Activity ID "${truncate(rawActivityId)}" looks like an Excel-converted date. Check your spreadsheet.`,
        severity: "warning",
      });
    } else if (FULL_DATE_PATTERN.test(rawActivityId)) {
      warnings.push({
        row: rowNum,
        column: "Activity ID",
        message: `Activity ID "${truncate(rawActivityId)}" looks like a date. Check your spreadsheet.`,
        severity: "warning",
      });
    }

    // Parse and validate numeric durations
    const minVal = Number(rawMin);
    const mlVal = Number(rawML);
    const maxVal = Number(rawMax);

    if (rawMin === "" || !Number.isInteger(minVal) || minVal < 0) {
      errors.push({
        row: rowNum,
        column: "Optimistic (Min)",
        message: `Optimistic (Min) must be a non-negative integer, got "${truncate(rawMin)}".`,
        severity: "error",
      });
      continue;
    }
    if (rawML === "" || !Number.isInteger(mlVal) || mlVal < 0) {
      errors.push({
        row: rowNum,
        column: "Most Likely",
        message: `Most Likely must be a non-negative integer, got "${truncate(rawML)}".`,
        severity: "error",
      });
      continue;
    }
    if (rawMax === "" || !Number.isInteger(maxVal) || maxVal < 0) {
      errors.push({
        row: rowNum,
        column: "Pessimistic (Max)",
        message: `Pessimistic (Max) must be a non-negative integer, got "${truncate(rawMax)}".`,
        severity: "error",
      });
      continue;
    }

    // Normalize distribution (optional — default to "normal") — parsed before
    // confidence because empty confidence is allowed for triangular/uniform
    let distributionType: DistributionType = DEFAULT_SCENARIO_SETTINGS.defaultDistributionType;
    if (rawDistribution) {
      const distKey = normalizeKey(rawDistribution);
      const mapped = DISTRIBUTION_MAP[distKey];
      if (mapped) {
        distributionType = mapped;
      } else {
        warnings.push({
          row: rowNum,
          column: "Distribution",
          message: `Unrecognized distribution "${truncate(rawDistribution)}". Defaulting to "normal".`,
          severity: "warning",
        });
      }
    }

    // Normalize confidence level — empty is allowed for triangular/uniform
    // (confidence only affects T-Normal and LogNormal)
    let confidenceLevel: RSMLevel;
    if (!rawConfidence) {
      if (distributionType === "triangular" || distributionType === "uniform") {
        confidenceLevel = DEFAULT_SCENARIO_SETTINGS.defaultConfidenceLevel;
      } else {
        errors.push({
          row: rowNum,
          column: "Confidence Level",
          message: `Confidence Level is required for ${distributionType === "logNormal" ? "LogNormal" : "T-Normal"} distribution.`,
          severity: "error",
        });
        continue;
      }
    } else {
      const confKey = normalizeKey(rawConfidence);
      const mapped = CONFIDENCE_MAP[confKey];
      if (!mapped) {
        errors.push({
          row: rowNum,
          column: "Confidence Level",
          message: `Unrecognized confidence level "${truncate(rawConfidence)}". Accepted values: ${CONFIDENCE_ACCEPTED}.`,
          severity: "error",
        });
        continue;
      }
      confidenceLevel = mapped;
    }

    // Normalize status (optional — default to "planned")
    let status: ActivityStatus = "planned";
    if (rawStatus) {
      const statusKey = normalizeKey(rawStatus);
      const mapped = STATUS_MAP[statusKey];
      if (mapped) {
        status = mapped;
      } else {
        warnings.push({
          row: rowNum,
          column: "Status",
          message: `Unrecognized status "${truncate(rawStatus)}". Defaulting to "planned".`,
          severity: "warning",
        });
      }
    }

    // Generate UUID BEFORE safeParse (schema requires id)
    const uuid = idGen();

    // Build activity object for Zod validation
    const activityObj = {
      id: uuid,
      name: rawName,
      min: minVal,
      mostLikely: mlVal,
      max: maxVal,
      confidenceLevel,
      distributionType,
      status,
    };

    const parseResult = ActivitySchema.safeParse(activityObj);
    if (!parseResult.success) {
      for (const issue of parseResult.error.issues) {
        errors.push({
          row: rowNum,
          column: issue.path.length > 0 ? String(issue.path[0]) : undefined,
          message: issue.message,
          severity: "error",
        });
      }
      continue;
    }

    // Duplicate Activity ID check
    const existingRow = duplicateCheck.get(rawActivityId);
    if (existingRow !== undefined) {
      errors.push({
        row: rowNum,
        column: "Activity ID",
        message: `Duplicate Activity ID "${truncate(rawActivityId)}" (also on row ${existingRow}).`,
        severity: "error",
      });
      // Also flag the original row if not already flagged
      if (existingRow === duplicateCheck.get(rawActivityId)) {
        errors.push({
          row: existingRow,
          column: "Activity ID",
          message: `Duplicate Activity ID "${truncate(rawActivityId)}" (also on row ${rowNum}).`,
          severity: "error",
        });
      }
      continue;
    }
    duplicateCheck.set(rawActivityId, rowNum);

    // Parse predecessor tokens
    const predecessorTokens = rawPredecessors
      ? rawPredecessors
          .split(",")
          .map((t) => t.trim())
          .filter((t) => t !== "")
      : [];

    // Build FlatActivityRow
    const flatRow: FlatActivityRow = {
      rowNumber: rowNum,
      userActivityId: rawActivityId,
      name: rawName,
      min: minVal,
      mostLikely: mlVal,
      max: maxVal,
      confidenceLevel,
      distributionType,
      status,
      predecessorTokens,
    };
    flatRows.push(flatRow);

    // Store validated activity
    activities.push(parseResult.data as Activity);

    // Populate maps
    activityIdMap.set(rawActivityId, uuid);
    uuidToRowInfo.set(uuid, {
      userId: rawActivityId,
      row: rowNum,
      name: rawName,
    });
  }

  // -- Pass 2: Predecessor resolution -----------------------------------------

  const dependencies: ActivityDependency[] = [];

  for (const flatRow of flatRows) {
    const successorUuid = activityIdMap.get(flatRow.userActivityId);
    if (!successorUuid) continue; // shouldn't happen, but guard

    for (const token of flatRow.predecessorTokens) {
      const match = PREDECESSOR_REGEX.exec(token);
      if (!match) {
        errors.push({
          row: flatRow.rowNumber,
          column: "Predecessors",
          message: `Invalid predecessor token "${truncate(token)}". Expected format: A1 or A1+3 or A1-2.`,
          severity: "error",
        });
        continue;
      }

      const predUserId = match[1]!;
      const lagStr = match[2]; // e.g. "+3" or "-2" or undefined
      const lagDays = lagStr ? parseInt(lagStr, 10) : 0;

      // Lag range check
      if (lagDays < -365 || lagDays > 365) {
        errors.push({
          row: flatRow.rowNumber,
          column: "Predecessors",
          message: `Lag for predecessor "${truncate(predUserId)}" is ${lagDays} days. Lag must be between -365 and 365.`,
          severity: "error",
        });
        continue;
      }

      // Resolve predecessor
      const predUuid = activityIdMap.get(predUserId);
      if (!predUuid) {
        errors.push({
          row: flatRow.rowNumber,
          column: "Predecessors",
          message: `Predecessor "${truncate(predUserId)}" not found. Check the Activity ID.`,
          severity: "error",
        });
        continue;
      }

      // Self-dependency check
      if (predUuid === successorUuid) {
        errors.push({
          row: flatRow.rowNumber,
          column: "Predecessors",
          message: `Activity "${truncate(flatRow.userActivityId)}" cannot depend on itself.`,
          severity: "error",
        });
        continue;
      }

      dependencies.push({
        fromActivityId: predUuid,
        toActivityId: successorUuid,
        type: "FS",
        lagDays,
      });
    }
  }

  // -- Pass 3: Cycle detection ------------------------------------------------

  if (errors.length === 0 && dependencies.length > 0) {
    const activityIds = activities.map((a) => a.id);
    const cycle = detectCycle(activityIds, dependencies);
    if (cycle) {
      const names = cycle.map((uuid) => {
        const info = uuidToRowInfo.get(uuid);
        return info ? `${info.userId} (Row ${info.row})` : uuid;
      });
      errors.push({
        row: 0,
        message: `Dependency cycle detected: ${names.join(" → ")}`,
        severity: "error",
      });
    }
  }

  // -- Limits check -----------------------------------------------------------

  if (activities.length > 500 || rowLimitReached) {
    errors.push({
      row: 0,
      message:
        "Import contains more than 500 activities. The maximum per scenario is 500.",
      severity: "error",
    });
  }
  if (dependencies.length > 2000) {
    errors.push({
      row: 0,
      message:
        "Import contains more than 2,000 dependencies. The maximum per scenario is 2,000.",
      severity: "error",
    });
  }

  return { activities, dependencies, errors, warnings };
}
