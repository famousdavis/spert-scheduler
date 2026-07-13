// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import type { Row, Worksheet } from "exceljs";
import type { ActivityBand } from "@domain/models/types";
import {
  buildSummaryData,
  buildGridRows,
  buildScheduleHeaders,
  type GridRow,
  type ScheduleExportParams,
} from "./schedule-export-service";
import { buildRenderList } from "@ui/helpers/band-utils";

function buildActivityCells(row: GridRow, hasDeps: boolean): (string | number)[] {
  const cells: (string | number)[] = [
    row.num,
    row.name,
    row.min,
    row.mostLikely,
    row.max,
    row.confidence,
    row.distribution,
    row.status,
    row.actual,
    row.duration,
    row.startDate,
    row.endDate,
  ];
  if (hasDeps) {
    cells.push(row.totalFloat ?? "", row.freeFloat ?? "");
    cells.push(
      row.predecessors ?? "", row.successors ?? "",
      row.constraintType ?? "", row.constraintDate ?? "", row.constraintMode ?? "",
      row.constraintNote ?? "",
    );
  }
  // Task details use newlines in XLSX (multiline cells supported)
  cells.push(row.tasks ?? "");
  cells.push(row.taskDetails ? row.taskDetails.replace(/; /g, "\n") : "");
  cells.push(row.deliverables ?? "");
  cells.push(row.deliverableDetails ? row.deliverableDetails.replace(/; /g, "\n") : "");
  cells.push(row.description ?? ""); // Description column (before Type)
  cells.push("Activity"); // Type column
  return cells;
}

type BorderSpec = {
  top: { style: "thin"; color: { argb: string } };
  left: { style: "thin"; color: { argb: string } };
  bottom: { style: "thin"; color: { argb: string } };
  right: { style: "thin"; color: { argb: string } };
};

function writeBandRow(
  ws: Worksheet,
  rowNum: number,
  band: ActivityBand,
  lastCol: number,
  thinBorder: BorderSpec,
): Row {
  const dataRow = ws.getRow(rowNum);
  dataRow.height = 20;

  // Column 1 — no sequence number, no border
  dataRow.getCell(1).value = null;

  // Name cell — column 2
  const nameCell = dataRow.getCell(2);
  nameCell.value = band.name === "" ? null : xlsxSanitize(band.name);
  nameCell.font = { bold: true, size: 13 };

  const fillArgb = band.color
    ? mixWithWhite(band.color, 0.2)
    : "FFF3F4F6"; // light gray fallback
  nameCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fillArgb } };

  if (band.color) {
    const hex = band.color.replace(/^#/, "").toUpperCase();
    nameCell.border = {
      ...thinBorder,
      left: { style: "medium", color: { argb: "FF" + hex } },
    };
  } else {
    nameCell.border = thinBorder;
  }

  // Data cells — intentionally no border (display divider)
  for (let c = 3; c < lastCol; c++) {
    dataRow.getCell(c).value = null;
  }

  // Type cell — column lastCol
  const typeCell = dataRow.getCell(lastCol);
  typeCell.value = "Section";
  typeCell.border = thinBorder;

  return dataRow;
}

/**
 * Guard against Excel formula injection in XLSX cells (OWASP).
 * Mirrors the leading-character check in CSV escaping — prefix strings starting
 * with =, +, -, @, \t, or \r with a single quote so Excel treats them as text.
 * Numbers pass through unchanged (formulas only trigger on string cells).
 */
export function xlsxSanitize(value: string | number): string | number {
  if (typeof value === "number") return value;
  if (/^[=+@\-\t\r]/.test(value)) return "'" + value;
  return value;
}

/**
 * Mix a 6-char hex color with white. `opacity` must be in [0, 1]:
 * 0.2 means 20% color, 80% white. Returns an opaque ARGB string in uppercase
 * (e.g. "FFFFCCCC"), matching the surrounding codebase convention.
 */
export function mixWithWhite(hex: string, opacity: number): string {
  const h = hex.replace(/^#/, "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const mix = (c: number) => Math.round(c * opacity + 255 * (1 - opacity));
  const toHex = (c: number) => mix(c).toString(16).padStart(2, "0").toUpperCase();
  return `FF${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export async function exportScheduleXlsx(
  params: ScheduleExportParams
): Promise<ArrayBuffer> {
  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Schedule");

  const summary = buildSummaryData(params);
  const rows = buildGridRows(params);
  const hasDeps = params.settings.dependencyMode;
  const pctLabel = `P${Math.round(params.settings.probabilityTarget * 100)}`;

  // Headers are shared with the CSV formatter; lastCol derives from them so a
  // future column can never drift from the title merge / band / totals math.
  const headers = buildScheduleHeaders(hasDeps, pctLabel);
  const lastCol = headers.length;
  // Prose columns that need wrapText, located by header identity (Task Details /
  // Deliverable Details move between cols 14/16 and 22/24 depending on hasDeps).
  const wrapCols = new Set(
    ["Description", "Task Details", "Deliverable Details"]
      .map((h) => headers.indexOf(h))
      .filter((idx) => idx >= 0),
  );

  const rowMap = new Map(rows.map((r) => [r.activityId, r]));
  const renderItems = buildRenderList(params.activities, params.bands ?? []);

  // ---- Styles ----
  const headerFill = {
    type: "pattern" as const,
    pattern: "solid" as const,
    fgColor: { argb: "FFE8ECF0" },
  };
  const keyFill = {
    type: "pattern" as const,
    pattern: "solid" as const,
    fgColor: { argb: "FFF5F5F5" },
  };
  const thinBorder = {
    top: { style: "thin" as const, color: { argb: "FFD0D0D0" } },
    left: { style: "thin" as const, color: { argb: "FFD0D0D0" } },
    bottom: { style: "thin" as const, color: { argb: "FFD0D0D0" } },
    right: { style: "thin" as const, color: { argb: "FFD0D0D0" } },
  };

  // ---- Title row ----
  let rowNum = 1;
  ws.mergeCells(rowNum, 1, rowNum, lastCol);
  const titleCell = ws.getCell(rowNum, 1);
  titleCell.value = xlsxSanitize(`${params.projectName} — ${params.scenarioName}`);
  titleCell.font = { bold: true, size: 14 };
  rowNum++;

  // ---- Summary block ----
  for (const { key, value } of summary) {
    const keyCell = ws.getCell(rowNum, 1);
    keyCell.value = key;
    keyCell.font = { bold: true };
    keyCell.fill = keyFill;
    ws.getCell(rowNum, 2).value = xlsxSanitize(value);
    rowNum++;
  }

  // Blank separator row
  rowNum++;

  // ---- Column headers (built above via buildScheduleHeaders) ----
  const headerRowNum = rowNum;
  const headerRow = ws.getRow(rowNum);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true };
    cell.fill = headerFill;
    cell.border = thinBorder;
  });
  rowNum++;

  // ---- Data rows — iterate render list (activities + bands interleaved) ----
  for (const item of renderItems) {
    if (item.kind === "activity") {
      // Non-null safe: renderItems is built from params.activities, the same source
      // buildGridRows processed; every activity ID maps and only kind==='activity'
      // items reference IDs in that array.
      const row = rowMap.get(item.activity.id)!;
      const cells = buildActivityCells(row, hasDeps);
      const dataRow = ws.getRow(rowNum);
      cells.forEach((val, i) => {
        const cell = dataRow.getCell(i + 1);
        cell.value = val === "" ? null : xlsxSanitize(val);
        cell.border = thinBorder;
        // i is the 0-based array index, aligned with the header index.
        if (wrapCols.has(i)) cell.alignment = { wrapText: true, vertical: "top" };
      });
    } else {
      writeBandRow(ws, rowNum, item.band, lastCol, thinBorder);
    }
    rowNum++;
  }

  // ---- Totals row ----
  const totalMin = Math.round(rows.reduce((s, r) => s + r.min, 0));
  const totalML = Math.round(rows.reduce((s, r) => s + r.mostLikely, 0));
  const totalMax = Math.round(rows.reduce((s, r) => s + r.max, 0));
  const totalDuration = rows.reduce((s, r) => s + r.duration, 0);
  const totalsRow = ws.getRow(rowNum);
  totalsRow.getCell(2).value = "Total";
  totalsRow.getCell(2).font = { bold: true };
  totalsRow.getCell(3).value = totalMin;
  totalsRow.getCell(4).value = totalML;
  totalsRow.getCell(5).value = totalMax;
  totalsRow.getCell(10).value = totalDuration;
  for (let c = 1; c <= lastCol; c++) {
    totalsRow.getCell(c).font = { ...totalsRow.getCell(c).font, bold: true };
    totalsRow.getCell(c).border = thinBorder;
  }

  // ---- Column widths ----
  // Column A holds summary keys (e.g., "Duration (w/o Buffer)") and grid row numbers.
  // Auto-fit to the longest summary key with bold font padding, capped at 28.
  const colAWidth = Math.min(28, Math.max(5, ...summary.map((r) => r.key.length + 4)));
  const widths = [colAWidth, 30, 8, 12, 8, 16, 14, 12, 8, 14, 14, 14];
  if (hasDeps) widths.push(14, 14, 16, 16, 16, 14, 10, 30);
  widths.push(8, 40, 12, 40); // Tasks / Task Details / Deliverables / Deliverable Details
  widths.push(40); // Description column — always present, before Type
  widths.push(10); // Type column — always present
  ws.columns = widths.map((w) => ({ width: w }));

  // ---- Freeze pane at column header row ----
  ws.views = [{ state: "frozen", ySplit: headerRowNum, xSplit: 0 }];

  const buffer = await wb.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}
