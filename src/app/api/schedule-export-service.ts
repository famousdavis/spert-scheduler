// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import type {
  Activity,
  ActivityBand,
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
  bands?: ActivityBand[]; // default [] when absent
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

function formatItemColumn(
  items: { completed: boolean; text: string }[] | undefined,
): { summary: string; details: string } | null {
  if (!items || items.length === 0) return null;
  const done = items.filter((i) => i.completed).length;
  return {
    summary: `${done}/${items.length}`,
    details: items.map((i) => `${i.completed ? "[x]" : "[ ]"} ${i.text}`).join("; "),
  };
}

export interface GridRow {
  activityId: string;
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
  totalFloat?: number | "";
  freeFloat?: number | "";
  tasks?: string;
  taskDetails?: string;
  deliverables?: string;
  deliverableDetails?: string;
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
      activityId: activity.id,
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
    if (settings.dependencyMode) {
      row.totalFloat = sa?.totalFloat ?? "";
      row.freeFloat = sa?.freeFloat ?? "";
    }
    if (predMap) row.predecessors = predMap.get(activity.id) ?? "";
    if (succMap) row.successors = succMap.get(activity.id) ?? "";
    if (settings.dependencyMode) {
      row.constraintType = activity.constraintType ?? "";
      row.constraintDate = activity.constraintDate ? fmt(activity.constraintDate) : "";
      row.constraintMode = activity.constraintMode ?? "";
      row.constraintNote = activity.constraintNote ?? "";
    }
    const taskCol = formatItemColumn(activity.checklist);
    if (taskCol) { row.tasks = taskCol.summary; row.taskDetails = taskCol.details; }
    const delCol = formatItemColumn(activity.deliverables);
    if (delCol) { row.deliverables = delCol.summary; row.deliverableDetails = delCol.details; }
    return row;
  });
}

// ---------------------------------------------------------------------------
// Format-specific exports (re-exported from sibling modules)
// ---------------------------------------------------------------------------

export { exportScheduleCsv } from "./export-csv-formatter";
export { exportScheduleXlsx, xlsxSanitize, mixWithWhite } from "./export-xlsx-formatter";

