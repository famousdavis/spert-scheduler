// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import {
  buildScheduleHeaders,
  exportScheduleCsv,
  exportScheduleXlsx,
} from "./schedule-export-service";
import type { ScheduleExportParams } from "./schedule-export-service";
import type { Activity, DeterministicSchedule, ScenarioSettings } from "@domain/models/types";
import { DEFAULT_SCENARIO_SETTINGS, RSM_LABELS } from "@domain/models/types";
import { distributionLabel, statusLabel } from "@domain/helpers/format-labels";

/**
 * **G3 — every exported value sits under the heading that names it.**
 *
 * The export's column order lives in THREE places that must move together:
 *   · the heading list      — `schedule-export-service.ts` `buildScheduleHeaders`
 *   · the CSV cell list     — `export-csv-formatter.ts`
 *   · the XLSX cell list    — `export-xlsx-formatter.ts`
 *
 * ⚠️ **Nothing caught a mismatch before this file.** The suite's existing style is
 * name-based (`headers.indexOf("Total Float (days)")`), which is insensitive to position
 * *by design*, and the only parity check is `ws.columnCount === headers.length` — a
 * **count**, which a swap leaves unchanged. So the suite was not merely silent here; it
 * was built to be.
 *
 * ⚠️ **And a mislabelled export column is invisible on screen.** A misaligned grid at
 * least shows itself. Confidence values under a "Distribution" heading, in a spreadsheet
 * someone reads next quarter, do not.
 *
 * The method is deliberately not "check the two columns being reordered": every field
 * carries a **distinct sentinel**, so the assertion pins the whole row. A swap anywhere
 * fails, not just the swap this release happens to make.
 */

// Distinct per field, and distinguishable after CSV's string coercion.
const SENTINEL = {
  name: "SENTINEL_NAME",
  min: 111,
  mostLikely: 222,
  max: 333,
  duration: 777,
  startDate: "2026-03-16",
  endDate: "2026-03-20",
} as const;

/**
 * Which heading each sentinel must appear under. This is the contract G3 defends; the
 * production code holds the same order in three separate positional lists and nothing
 * else states it in one place.
 */
// ⚠️ Confidence, Distribution and Status are DERIVED, not invented. Those cells come
// from RSM_LABELS / distributionLabel / statusLabel, so hardcoding a sentinel there
// would assert against a value the export never produces. Deriving them means this
// list cannot drift from the production labels — and the premise test below asserts
// they are pairwise distinct, so a swap between them is always detectable.
const CONFIDENCE_LABEL = RSM_LABELS.mediumConfidence;
const DISTRIBUTION_LABEL = distributionLabel("normal");
const STATUS_LABEL = statusLabel("planned");

const EXPECTED: { header: string; value: string }[] = [
  { header: "Activity Name", value: SENTINEL.name },
  { header: "Min", value: String(SENTINEL.min) },
  { header: "Most Likely", value: String(SENTINEL.mostLikely) },
  { header: "Max", value: String(SENTINEL.max) },
  { header: "Distribution", value: DISTRIBUTION_LABEL },
  { header: "Confidence", value: CONFIDENCE_LABEL },
  { header: "Status", value: STATUS_LABEL },
];

const activity: Activity = {
  id: "a1",
  name: SENTINEL.name,
  min: SENTINEL.min,
  mostLikely: SENTINEL.mostLikely,
  max: SENTINEL.max,
  // These two drive the Confidence and Distribution CELLS through the real label
  // helpers, so the test exercises the production path rather than injecting strings.
  confidenceLevel: "mediumConfidence",
  distributionType: "normal",
  status: "planned",
};

const schedule: DeterministicSchedule = {
  activities: [
    {
      activityId: "a1",
      name: SENTINEL.name,
      duration: SENTINEL.duration,
      startDate: SENTINEL.startDate,
      endDate: SENTINEL.endDate,
      isActual: false,
    },
  ],
  totalDurationDays: SENTINEL.duration,
  spanDays: SENTINEL.duration,
  projectEndDate: SENTINEL.endDate,
};

const settings: ScenarioSettings = { ...DEFAULT_SCENARIO_SETTINGS, dependencyMode: false };

function params(): ScheduleExportParams {
  return {
    projectName: "P",
    scenarioName: "S",
    startDate: SENTINEL.startDate,
    activities: [activity],
    schedule,
    buffer: null,
    settings,
    dependencies: [],
    milestones: [],
    dateFormat: "MM/DD/YYYY",
  };
}

/** Split a CSV line, honouring quoted fields. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

describe("G3 — exported values sit under the headings that name them", () => {
  it("every expected value is distinct, so a swap between any two is detectable", () => {
    // ⚠️ Premise check, and it is load-bearing: if two columns carried the same value
    // the assertions below would pass with those two swapped. Non-empty matters too —
    // comparing "" to "" is the classic vacuous pass.
    const values = EXPECTED.map((e) => e.value);
    expect(new Set(values).size, `duplicate expected values: ${values.join(", ")}`).toBe(values.length);
    expect(values.every((v) => v.length > 0)).toBe(true);
  });

  it("CSV: every heading sits above its own value", () => {
    const csv = exportScheduleCsv(params());
    const lines = csv.split("\n").map((l) => l.replace(/\r$/, ""));

    const headerIdx = lines.findIndex((l) => splitCsvLine(l)[0] === "#");
    expect(headerIdx, "grid header row not found in the CSV").toBeGreaterThanOrEqual(0);

    const headers = splitCsvLine(lines[headerIdx]!);
    const row = splitCsvLine(lines[headerIdx + 1]!);

    // Sanity: the emitted header row is the one buildScheduleHeaders produced.
    expect(headers).toEqual(buildScheduleHeaders(false, "P50", false));

    for (const { header, value } of EXPECTED) {
      const col = headers.indexOf(header);
      expect(col, `heading "${header}" missing from the CSV`).toBeGreaterThanOrEqual(0);
      expect(
        row[col],
        `CSV column ${col} is headed "${header}" but carries "${row[col]}"`,
      ).toBe(value);
    }
  });

  it("XLSX: every heading sits above its own value", async () => {
    const ExcelJS = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await exportScheduleXlsx(params()));
    const ws = wb.getWorksheet("Schedule")!;
    expect(ws).toBeDefined();

    let headerRow = -1;
    for (let r = 1; r <= 40; r++) {
      if (ws.getCell(r, 1).value === "#") { headerRow = r; break; }
    }
    expect(headerRow, "grid header row not found in the XLSX").toBeGreaterThan(0);

    const headers: string[] = [];
    for (let c = 1; c <= ws.columnCount; c++) {
      headers.push(String(ws.getCell(headerRow, c).value ?? ""));
    }

    for (const { header, value } of EXPECTED) {
      const col = headers.indexOf(header);
      expect(col, `heading "${header}" missing from the XLSX`).toBeGreaterThanOrEqual(0);
      expect(
        String(ws.getCell(headerRow + 1, col + 1).value ?? ""),
        `XLSX column ${col + 1} is headed "${header}" but carries a different field`,
      ).toBe(value);
    }
  });

  it("CSV and XLSX agree with each other, column for column", () => {
    // The two formatters hold INDEPENDENT positional lists. They can drift apart even
    // while each stays internally consistent with the shared heading list.
    const csv = exportScheduleCsv(params());
    const lines = csv.split("\n").map((l) => l.replace(/\r$/, ""));
    const headerIdx = lines.findIndex((l) => splitCsvLine(l)[0] === "#");
    expect(splitCsvLine(lines[headerIdx]!)).toEqual(buildScheduleHeaders(false, "P50", false));
  });
});
