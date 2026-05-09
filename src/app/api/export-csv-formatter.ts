// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import {
  buildSummaryData,
  buildGridRows,
  type ScheduleExportParams,
} from "./schedule-export-service";

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

  // Summary block
  for (const { key, value } of summary) {
    lines.push(`${csvEscape(key)},${csvEscape(value)}`);
  }
  lines.push("");

  // Column headers
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
  lines.push(headers.map(csvEscape).join(","));

  // Data rows
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
    cells.push(row.tasks ?? "", row.taskDetails ?? "", row.deliverables ?? "", row.deliverableDetails ?? "");
    lines.push(cells.map(csvEscape).join(","));
  }

  // Totals row
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
  totalCells.push("", "", "", "");
  lines.push(totalCells.map(csvEscape).join(","));

  return lines.join("\n");
}
