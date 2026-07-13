// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import {
  buildSummaryData,
  buildGridRows,
  buildScheduleHeaders,
  type ScheduleExportParams,
} from "./schedule-export-service";
import { buildRenderList } from "@ui/helpers/band-utils";

function csvEscape(value: string | number): string {
  let str = String(value);
  // Guard against CSV formula injection (OWASP): prefix cells starting with =, +, @, -, \t, or \r
  if (/^[=+@\-\t\r]/.test(str)) {
    str = "'" + str;
  }
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportScheduleCsv(params: ScheduleExportParams): string {
  const lines: string[] = [];
  const summary = buildSummaryData(params);
  const rows = buildGridRows(params);
  const hasDeps = params.settings.dependencyMode;
  const pctLabel = `P${Math.round(params.settings.probabilityTarget * 100)}`;

  const rowMap = new Map(rows.map((r) => [r.activityId, r]));
  const renderItems = buildRenderList(params.activities, params.bands ?? []);

  // Summary block
  for (const { key, value } of summary) {
    lines.push(`${csvEscape(key)},${csvEscape(value)}`);
  }
  lines.push("");

  // Column headers (shared with the XLSX formatter — keep byte-identical)
  const headers = buildScheduleHeaders(hasDeps, pctLabel);
  lines.push(headers.map(csvEscape).join(","));

  // Data rows — iterate render list (activities + bands interleaved)
  for (const item of renderItems) {
    if (item.kind === "activity") {
      const row = rowMap.get(item.activity.id);
      if (!row) continue; // safety: should never fire — renderItems built from params.activities
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
      cells.push(row.tasks ?? "", row.taskDetails ?? "", row.deliverables ?? "", row.deliverableDetails ?? "");
      cells.push(row.description ?? "");
      cells.push("Activity");
      lines.push(cells.map(csvEscape).join(","));
    } else {
      // Band row: blank cells except Activity Name (col 1) and Type (last col)
      const cells = headers.map(() => "");
      cells[1] = item.band.name;
      cells[cells.length - 1] = "Section";
      lines.push(cells.map(csvEscape).join(","));
    }
  }

  // Totals row — built from `rows` (activities only); bands automatically excluded
  const totalMin = Math.round(rows.reduce((s, r) => s + r.min, 0));
  const totalML = Math.round(rows.reduce((s, r) => s + r.mostLikely, 0));
  const totalMax = Math.round(rows.reduce((s, r) => s + r.max, 0));
  const totalDuration = rows.reduce((s, r) => s + r.duration, 0);
  const totalCells: (string | number)[] = [
    "",
    "Total",
    totalMin,
    totalML,
    totalMax,
    "",
    "",
    "",
    "",
    totalDuration,
    "",
    "",
  ];
  if (hasDeps) {
    totalCells.push("", "", "", "", "", "", "", "");
  }
  totalCells.push("", "", "", ""); // Tasks / Task Details / Deliverables / Deliverable Details
  totalCells.push(""); // Description column
  totalCells.push(""); // Type column
  lines.push(totalCells.map(csvEscape).join(","));

  return lines.join("\n");
}
