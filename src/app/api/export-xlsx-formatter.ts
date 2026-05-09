// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import {
  buildSummaryData,
  buildGridRows,
  type ScheduleExportParams,
} from "./schedule-export-service";

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
  const lastCol = hasDeps ? 24 : 16;
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

  // ---- Column headers ----
  const headerRowNum = rowNum;
  const headers = [
    "#",
    "Activity Name",
    "Min",
    "Most Likely",
    "Max",
    "Confidence",
    "Distribution",
    "Status",
    "Actual",
    `Duration (${pctLabel})`,
    "Start Date",
    "End Date",
  ];
  if (hasDeps) {
    headers.push("Total Float (days)", "Free Float (days)");
    headers.push("Predecessors", "Successors", "Constraint Type", "Constraint Date", "Constraint Mode", "Constraint Note");
  }
  headers.push("Tasks", "Task Details", "Deliverables", "Deliverable Details");

  const headerRow = ws.getRow(rowNum);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true };
    cell.fill = headerFill;
    cell.border = thinBorder;
  });
  rowNum++;

  // ---- Data rows ----
  for (const row of rows) {
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
    cells.push(
      row.taskDetails
        ? row.taskDetails.replace(/; /g, "\n")
        : ""
    );
    cells.push(row.deliverables ?? "");
    cells.push(
      row.deliverableDetails
        ? row.deliverableDetails.replace(/; /g, "\n")
        : ""
    );
    const dataRow = ws.getRow(rowNum);
    cells.forEach((val, i) => {
      const cell = dataRow.getCell(i + 1);
      cell.value = val === "" ? null : xlsxSanitize(val);
      cell.border = thinBorder;
    });
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
  widths.push(8, 40, 12, 40);
  ws.columns = widths.map((w) => ({ width: w }));

  // ---- Freeze pane at column header row ----
  ws.views = [{ state: "frozen", ySplit: headerRowNum, xSplit: 0 }];

  const buffer = await wb.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}
