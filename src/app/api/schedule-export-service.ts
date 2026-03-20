// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import type {
  Activity,
  ActivityDependency,
  Calendar,
  DateFormatPreference,
  DeterministicSchedule,
  Milestone,
  ScenarioSettings,
} from "@domain/models/types";
import type { WorkCalendar } from "@core/calendar/work-calendar";
import { RSM_LABELS } from "@domain/models/types";
import type { ScheduleBuffer } from "@core/schedule/buffer";
import {
  formatDateISO,
  formatDateDisplay,
  parseDateISO,
  addWorkingDays,
} from "@core/calendar/calendar";
import { distributionLabel, statusLabel } from "@domain/helpers/format-labels";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ScheduleExportParams {
  projectName: string;
  scenarioName: string;
  activities: Activity[];
  schedule: DeterministicSchedule;
  buffer: ScheduleBuffer | null;
  settings: ScenarioSettings;
  dependencies: ActivityDependency[];
  milestones: Milestone[]; // included for future use — NOT rendered in v0.18.0
  calendar?: WorkCalendar | Calendar;
  dateFormat: DateFormatPreference;
}

// ---------------------------------------------------------------------------
// Shared builders (used by both XLSX and CSV)
// ---------------------------------------------------------------------------

interface SummaryRow {
  key: string;
  value: string;
}

export function buildSummaryData(params: ScheduleExportParams): SummaryRow[] {
  const {
    projectName,
    scenarioName,
    schedule,
    buffer,
    settings,
    calendar,
    dateFormat,
  } = params;

  const fmt = (iso: string) => formatDateDisplay(iso, dateFormat);

  let bufferedFinish = "N/A";
  let bufferedDuration = "N/A";
  const bufferDaysStr = buffer ? `${buffer.bufferDays}` : "N/A";

  if (buffer && buffer.bufferDays > 0) {
    const endDate = parseDateISO(schedule.projectEndDate);
    const bDate = addWorkingDays(endDate, buffer.bufferDays, calendar);
    bufferedFinish = fmt(formatDateISO(bDate));
    bufferedDuration = `${schedule.totalDurationDays + buffer.bufferDays}`;
  }

  return [
    { key: "Project", value: projectName },
    { key: "Scenario", value: scenarioName },
    { key: "Start Date", value: fmt(params.schedule.activities[0]?.startDate ?? "") },
    { key: "Finish (w/o Buffer)", value: fmt(schedule.projectEndDate) },
    { key: "Duration (w/o Buffer)", value: `${schedule.totalDurationDays} working days` },
    { key: "Finish (w/ Buffer)", value: bufferedFinish },
    { key: "Duration (w/ Buffer)", value: bufferedDuration === "N/A" ? "N/A" : `${bufferedDuration} working days` },
    { key: "Activity Target", value: `P${Math.round(settings.probabilityTarget * 100)}` },
    { key: "Project Target", value: `P${Math.round(settings.projectProbabilityTarget * 100)}` },
    { key: "Schedule Buffer", value: bufferDaysStr === "N/A" ? "N/A" : `${bufferDaysStr} days` },
    { key: "Dependency Mode", value: settings.dependencyMode ? "On" : "Off" },
    { key: "Exported", value: new Date().toISOString() },
  ];
}

export interface GridRow {
  num: number;
  name: string;
  min: number;
  mostLikely: number;
  max: number;
  confidence: string;
  distribution: string;
  status: string;
  actual: number | "";
  duration: number;
  startDate: string;
  endDate: string;
  predecessors?: string;
  successors?: string;
  constraintType?: string;
  constraintDate?: string;
  constraintMode?: string;
  constraintNote?: string;
  tasks?: string;
  taskDetails?: string;
}

function buildActivityIndexMap(activities: Activity[]): Map<string, number> {
  const map = new Map<string, number>();
  activities.forEach((a, i) => map.set(a.id, i + 1));
  return map;
}

function formatDepRef(
  activityIndex: number,
  lagDays: number,
  type: string
): string {
  if (lagDays === 0) return `${activityIndex}${type}`;
  const sign = lagDays > 0 ? "+" : "";
  return `${activityIndex}${type}${sign}${lagDays}d`;
}

export function buildPredecessorMap(
  activities: Activity[],
  dependencies: ActivityDependency[]
): Map<string, string> {
  const indexMap = buildActivityIndexMap(activities);
  const result = new Map<string, string>();
  for (const dep of dependencies) {
    const fromIdx = indexMap.get(dep.fromActivityId);
    if (fromIdx === undefined) continue;
    const ref = formatDepRef(fromIdx, dep.lagDays, dep.type);
    const existing = result.get(dep.toActivityId);
    result.set(dep.toActivityId, existing ? `${existing}, ${ref}` : ref);
  }
  return result;
}

export function buildSuccessorMap(
  activities: Activity[],
  dependencies: ActivityDependency[]
): Map<string, string> {
  const indexMap = buildActivityIndexMap(activities);
  const result = new Map<string, string>();
  for (const dep of dependencies) {
    const toIdx = indexMap.get(dep.toActivityId);
    if (toIdx === undefined) continue;
    const ref = formatDepRef(toIdx, dep.lagDays, dep.type);
    const existing = result.get(dep.fromActivityId);
    result.set(dep.fromActivityId, existing ? `${existing}, ${ref}` : ref);
  }
  return result;
}

export function buildGridRows(params: ScheduleExportParams): GridRow[] {
  const { activities, schedule, settings, dependencies, dateFormat } = params;
  const fmt = (iso: string) => formatDateDisplay(iso, dateFormat);
  const scheduledMap = new Map(
    schedule.activities.map((sa) => [sa.activityId, sa])
  );
  const predMap = settings.dependencyMode
    ? buildPredecessorMap(activities, dependencies)
    : undefined;
  const succMap = settings.dependencyMode
    ? buildSuccessorMap(activities, dependencies)
    : undefined;

  return activities.map((activity, i) => {
    const sa = scheduledMap.get(activity.id);
    const showActual =
      activity.status === "complete" || activity.status === "inProgress";
    const usesConfidence =
      activity.distributionType === "normal" || activity.distributionType === "logNormal";
    const row: GridRow = {
      num: i + 1,
      name: activity.name,
      min: activity.min,
      mostLikely: activity.mostLikely,
      max: activity.max,
      confidence: usesConfidence ? RSM_LABELS[activity.confidenceLevel] : "",
      distribution: distributionLabel(activity.distributionType),
      status: statusLabel(activity.status),
      actual: showActual && activity.actualDuration !== undefined
        ? activity.actualDuration
        : "",
      duration: sa?.duration ?? 0,
      startDate: sa ? fmt(sa.startDate) : "",
      endDate: sa ? fmt(sa.endDate) : "",
    };
    if (predMap) row.predecessors = predMap.get(activity.id) ?? "";
    if (succMap) row.successors = succMap.get(activity.id) ?? "";
    if (settings.dependencyMode) {
      row.constraintType = activity.constraintType ?? "";
      row.constraintDate = activity.constraintDate ? fmt(activity.constraintDate) : "";
      row.constraintMode = activity.constraintMode ?? "";
      row.constraintNote = activity.constraintNote ?? "";
    }
    if (activity.checklist && activity.checklist.length > 0) {
      const done = activity.checklist.filter((c) => c.completed).length;
      row.tasks = `${done}/${activity.checklist.length}`;
      row.taskDetails = activity.checklist
        .map((c) => `${c.completed ? "[x]" : "[ ]"} ${c.text}`)
        .join("; ");
    }
    return row;
  });
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

function csvEscape(value: string | number): string {
  let str = String(value);
  // Guard against CSV formula injection: prefix cells starting with =, +, @, or -
  if (/^[=+@-]/.test(str)) {
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
    headers.push("Predecessors", "Successors", "Constraint Type", "Constraint Date", "Constraint Mode", "Constraint Note");
  }
  headers.push("Tasks", "Task Details");
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
      cells.push(
        row.predecessors ?? "", row.successors ?? "",
        row.constraintType ?? "", row.constraintDate ?? "", row.constraintMode ?? "",
        row.constraintNote ?? "",
      );
    }
    cells.push(row.tasks ?? "", row.taskDetails ?? "");
    lines.push(cells.map(csvEscape).join(","));
  }

  // Totals row
  const totalMin = rows.reduce((s, r) => s + r.min, 0);
  const totalML = rows.reduce((s, r) => s + r.mostLikely, 0);
  const totalMax = rows.reduce((s, r) => s + r.max, 0);
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
    totalCells.push("", "", "", "", "", "");
  }
  totalCells.push("", "");
  lines.push(totalCells.map(csvEscape).join(","));

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// XLSX export (ExcelJS loaded lazily)
// ---------------------------------------------------------------------------

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
  const lastCol = hasDeps ? 20 : 14;
  ws.mergeCells(rowNum, 1, rowNum, lastCol);
  const titleCell = ws.getCell(rowNum, 1);
  titleCell.value = `${params.projectName} — ${params.scenarioName}`;
  titleCell.font = { bold: true, size: 14 };
  rowNum++;

  // ---- Summary block ----
  for (const { key, value } of summary) {
    const keyCell = ws.getCell(rowNum, 1);
    keyCell.value = key;
    keyCell.font = { bold: true };
    keyCell.fill = keyFill;
    ws.getCell(rowNum, 2).value = value;
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
    headers.push("Predecessors", "Successors", "Constraint Type", "Constraint Date", "Constraint Mode", "Constraint Note");
  }
  headers.push("Tasks", "Task Details");

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
    const dataRow = ws.getRow(rowNum);
    cells.forEach((val, i) => {
      const cell = dataRow.getCell(i + 1);
      cell.value = val === "" ? null : val;
      cell.border = thinBorder;
    });
    rowNum++;
  }

  // ---- Totals row ----
  const totalMin = rows.reduce((s, r) => s + r.min, 0);
  const totalML = rows.reduce((s, r) => s + r.mostLikely, 0);
  const totalMax = rows.reduce((s, r) => s + r.max, 0);
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
  if (hasDeps) widths.push(16, 16, 16, 14, 10, 30);
  widths.push(8, 40);
  ws.columns = widths.map((w) => ({ width: w }));

  // ---- Freeze pane at column header row ----
  ws.views = [{ state: "frozen", ySplit: headerRowNum, xSplit: 0 }];

  const buffer = await wb.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}
