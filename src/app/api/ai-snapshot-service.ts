// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import type {
  Project,
  Scenario,
  Activity,
  ActivityDependency,
  Milestone,
  ChecklistItem,
  DeliverableItem,
  RSMLevel,
  DistributionType,
  ActivityStatus,
  ScheduledActivity,
  DeterministicSchedule,
  Calendar,
} from "@domain/models/types";
import {
  type WorkCalendar,
  isCalendarError,
} from "@core/calendar/work-calendar";
import {
  computeDeterministicSchedule,
  computeDependencySchedule,
} from "@core/schedule/deterministic";
import {
  detectCycle,
  validateDependencies,
  type ValidationError,
} from "@core/schedule/dependency-graph";
import { computePertMean } from "@core/estimation/spert";

// ---------------------------------------------------------------------------
// The read model the paired AI client consumes via scheduler_get_project.
// ---------------------------------------------------------------------------

export type ScheduleStatus =
  | "ok"
  | "cycle_detected"
  | "invalid_estimate"
  | "calendar_misconfigured"
  | "unknown";

/**
 * Per-activity snapshot. Only `id` and `name` are guaranteed present; every
 * other field may be absent after size-budget truncation (or when the schedule
 * could not be computed).
 */
export interface ActivitySnapshot {
  id: string;
  name: string;
  min?: number;
  mostLikely?: number;
  max?: number;
  confidenceLevel?: RSMLevel;
  distributionType?: DistributionType;
  status?: ActivityStatus;
  milestoneId?: string;
  startDate?: string;
  endDate?: string;
  duration?: number;
  isCritical?: boolean;
  notes?: string;
  checklist?: ChecklistItem[];
  deliverables?: DeliverableItem[];
  description?: string;
  // Set on truncation to preserve the signal that a description exists after the
  // full text is stripped (so the AI knows not to blind-overwrite it).
  hasDescription?: boolean;
}

export interface ScenarioSnapshot {
  id: string;
  name: string;
  locked: boolean;
  dependencyMode: boolean;
  scheduleStatus: ScheduleStatus;
  startDate: string;
  projectEndDate?: string;
  totalDurationDays?: number;
  simulationStatus: "present" | "absent";
  activities: ActivitySnapshot[];
  milestones: Milestone[];
  dependencies: ActivityDependency[];
  dependencyValidationErrors: ValidationError[];
}

export interface ProjectSnapshot {
  projectId: string;
  projectName: string;
  openScenarioId: string | null;
  asOfSeq: number;
  scenarios: ScenarioSnapshot[];
}

export interface ScenarioComputation {
  scheduleStatus: ScheduleStatus;
  schedule?: DeterministicSchedule;
}

// ---------------------------------------------------------------------------
// Pre-classification + schedule computation
// ---------------------------------------------------------------------------

function hasInvalidLogNormal(scenario: Scenario): boolean {
  return scenario.activities.some(
    (a) => a.distributionType === "logNormal" && computePertMean(a.min, a.mostLikely, a.max) <= 0
  );
}

/**
 * Classify a scenario and, when computable, produce its deterministic schedule.
 * Pre-classifies BEFORE computing so the throwing schedule path never runs on a
 * cyclic graph or an invalid logNormal estimate; the compute itself is wrapped
 * in a typed catch that maps both calendar-throw shapes to
 * `calendar_misconfigured` and anything else to `unknown`.
 */
export function classifyAndComputeScenario(
  scenario: Scenario,
  workCalendar?: WorkCalendar | Calendar
): ScenarioComputation {
  const dependencyMode = scenario.settings.dependencyMode ?? false;
  if (dependencyMode && detectCycle(scenario.activities.map((a) => a.id), scenario.dependencies)) {
    return { scheduleStatus: "cycle_detected" };
  }
  if (hasInvalidLogNormal(scenario)) {
    return { scheduleStatus: "invalid_estimate" };
  }
  try {
    const percentile = scenario.settings.probabilityTarget;
    const schedule = dependencyMode
      ? computeDependencySchedule(
          scenario.activities,
          scenario.dependencies,
          scenario.startDate,
          percentile,
          workCalendar,
          scenario.milestones
        )
      : computeDeterministicSchedule(
          scenario.activities,
          scenario.startDate,
          percentile,
          workCalendar
        );
    return { scheduleStatus: "ok", schedule };
  } catch (err) {
    return { scheduleStatus: isCalendarError(err) ? "calendar_misconfigured" : "unknown" };
  }
}

// ---------------------------------------------------------------------------
// Recompute cache — ref-equality memo keyed on BOTH scenario and workCalendar
// ---------------------------------------------------------------------------

/**
 * Memoizes {@link classifyAndComputeScenario} per scenario id. A cached entry
 * is only reused when both the scenario reference AND the workCalendar reference
 * are identical to the ones it was computed under — a change to either forces a
 * recompute. `evictAbsent` drops entries for scenario ids no longer present.
 */
export class ScenarioScheduleCache {
  private entries = new Map<
    string,
    { scenario: Scenario; workCalendar: WorkCalendar | Calendar | undefined; computed: ScenarioComputation }
  >();

  compute(scenario: Scenario, workCalendar?: WorkCalendar | Calendar): ScenarioComputation {
    const cached = this.entries.get(scenario.id);
    if (cached && cached.scenario === scenario && cached.workCalendar === workCalendar) {
      return cached.computed;
    }
    const computed = classifyAndComputeScenario(scenario, workCalendar);
    this.entries.set(scenario.id, { scenario, workCalendar, computed });
    return computed;
  }

  evictAbsent(presentIds: Set<string>): void {
    for (const id of [...this.entries.keys()]) {
      if (!presentIds.has(id)) this.entries.delete(id);
    }
  }

  get size(): number {
    return this.entries.size;
  }
}

// ---------------------------------------------------------------------------
// Snapshot assembly
// ---------------------------------------------------------------------------

function buildActivitySnapshot(activity: Activity, scheduled?: ScheduledActivity): ActivitySnapshot {
  const snap: ActivitySnapshot = {
    id: activity.id,
    name: activity.name,
    min: activity.min,
    mostLikely: activity.mostLikely,
    max: activity.max,
    confidenceLevel: activity.confidenceLevel,
    distributionType: activity.distributionType,
    status: activity.status,
  };
  if (activity.milestoneId !== undefined) snap.milestoneId = activity.milestoneId;
  if (scheduled) {
    snap.startDate = scheduled.startDate;
    snap.endDate = scheduled.endDate;
    snap.duration = scheduled.duration;
    if (scheduled.totalFloat !== undefined) snap.isCritical = scheduled.totalFloat === 0;
  }
  if (activity.notes !== undefined) snap.notes = activity.notes;
  if (activity.checklist !== undefined) snap.checklist = activity.checklist;
  if (activity.deliverables !== undefined) snap.deliverables = activity.deliverables;
  if (activity.description !== undefined) snap.description = activity.description;
  return snap;
}

export function buildScenarioSnapshot(
  scenario: Scenario,
  computed: ScenarioComputation
): ScenarioSnapshot {
  const dependencyMode = scenario.settings.dependencyMode ?? false;
  const scheduledById = new Map(
    (computed.schedule?.activities ?? []).map((sa) => [sa.activityId, sa])
  );
  const activities = scenario.activities.map((a) =>
    buildActivitySnapshot(a, scheduledById.get(a.id))
  );
  // Validation errors are surfaced for dependency-mode scenarios only. A cyclic
  // scenario intentionally reports the cycle twice — as scheduleStatus
  // "cycle_detected" and as a "cycle"-type entry here — because dropping either
  // would remove a guard the other relies on.
  const dependencyValidationErrors = dependencyMode
    ? validateDependencies(scenario.activities.map((a) => a.id), scenario.dependencies)
    : [];

  const snap: ScenarioSnapshot = {
    id: scenario.id,
    name: scenario.name,
    locked: scenario.locked ?? false,
    dependencyMode,
    scheduleStatus: computed.scheduleStatus,
    startDate: scenario.startDate,
    simulationStatus: scenario.simulationResults ? "present" : "absent",
    activities,
    milestones: scenario.milestones,
    dependencies: scenario.dependencies,
    dependencyValidationErrors,
  };
  if (computed.schedule) {
    snap.projectEndDate = computed.schedule.projectEndDate;
    snap.totalDurationDays = computed.schedule.totalDurationDays;
  }
  return snap;
}

/**
 * Build the whole-project snapshot. Pass a persistent {@link
 * ScenarioScheduleCache} to reuse unchanged scenario computations across builds
 * (the recompute-scope optimization); omit it for a one-shot build.
 */
export function buildProjectSnapshot(
  project: Project,
  workCalendar: WorkCalendar | Calendar | undefined,
  openScenarioId: string | null,
  asOfSeq: number,
  cache?: ScenarioScheduleCache
): ProjectSnapshot {
  const scheduleCache = cache ?? new ScenarioScheduleCache();
  scheduleCache.evictAbsent(new Set(project.scenarios.map((s) => s.id)));
  const scenarios = project.scenarios.map((s) =>
    buildScenarioSnapshot(s, scheduleCache.compute(s, workCalendar))
  );
  return {
    projectId: project.id,
    projectName: project.name,
    openScenarioId,
    asOfSeq,
    scenarios,
  };
}

// ---------------------------------------------------------------------------
// Size discipline — soft budget, progressive truncation
// ---------------------------------------------------------------------------

export const DEFAULT_SNAPSHOT_BUDGET_BYTES = 700 * 1024;

function estimateBytes(snapshot: ProjectSnapshot): number {
  // JSON string length is a close proxy for the serialized payload size and a
  // sufficient measure for a soft budget.
  return JSON.stringify(snapshot).length;
}

function mapActivities(
  snapshot: ProjectSnapshot,
  fn: (a: ActivitySnapshot) => ActivitySnapshot
): ProjectSnapshot {
  return {
    ...snapshot,
    scenarios: snapshot.scenarios.map((s) => ({ ...s, activities: s.activities.map(fn) })),
  };
}

function stripQualitative(a: ActivitySnapshot): ActivitySnapshot {
  const rest = { ...a };
  // Preserve the existence signal before dropping the text (see hasDescription).
  if (rest.description) rest.hasDescription = true;
  delete rest.notes;
  delete rest.checklist;
  delete rest.deliverables;
  delete rest.description;
  return rest;
}

function minimalActivity(a: ActivitySnapshot): ActivitySnapshot {
  const m: ActivitySnapshot = { id: a.id, name: a.name };
  if (a.startDate !== undefined) m.startDate = a.startDate;
  if (a.endDate !== undefined) m.endDate = a.endDate;
  if (a.duration !== undefined) m.duration = a.duration;
  if (a.isCritical !== undefined) m.isCritical = a.isCritical;
  if (a.hasDescription) m.hasDescription = a.hasDescription;
  return m;
}

/**
 * Trim the snapshot toward a soft byte budget. Never drops schedule totals,
 * critical-path flags, or dependencyValidationErrors. Stage 1 strips qualitative
 * text (notes/checklist/deliverables) from every activity; stage 2 reduces
 * NON-critical activities to id/name/schedule only. Returns the most-reduced
 * form even if still over budget (soft, not hard).
 */
export function truncateSnapshotToBudget(
  snapshot: ProjectSnapshot,
  budgetBytes: number = DEFAULT_SNAPSHOT_BUDGET_BYTES
): ProjectSnapshot {
  if (estimateBytes(snapshot) <= budgetBytes) return snapshot;
  const stripped = mapActivities(snapshot, stripQualitative);
  if (estimateBytes(stripped) <= budgetBytes) return stripped;
  return mapActivities(stripped, (a) => (a.isCritical ? a : minimalActivity(a)));
}
