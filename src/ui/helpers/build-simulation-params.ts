// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { Activity, Calendar, Milestone, ActivityDependency } from "@domain/models/types";
import { advanceToNextWorkingDay, type WorkCalendar } from "@core/calendar/work-calendar";
import type { DependencySimulationParams } from "@core/simulation/worker-client";
import { computeDeterministicDurations, computeDependencyDurations } from "@core/schedule/deterministic";
import { buildMilestoneSimParams } from "@core/schedule/milestone-sim-params";
import { parseDateISO, countWorkingDays } from "@core/calendar/calendar";
import { resolveRecordedProgress } from "@core/schedule/recorded-progress";
import type { SequentialRecordEntry } from "@core/simulation/monte-carlo";

/** Per-activity constraint info for sequential MC (parallel to activities array). */
export type SequentialConstraintEntry = { type: string; offsetFromStart: number; mode: string } | null;

export interface SimulationParams {
  deterministicDurations: number[] | undefined;
  dependencyParams: DependencySimulationParams | undefined;
  sequentialConstraints: SequentialConstraintEntry[] | undefined;
  /** WI-137: dependencies off, only when a row has a record (parallel to activities). */
  sequentialRecords?: SeqRecord[];
}

type SeqRecord = SequentialRecordEntry | null;

/**
 * WI-137: the recorded rows as the simulation needs them — keyed by id (dependencies on) — or
 * nothing at all when no row has a record, so every v25 project's parameters are unchanged.
 */
function recordedProgressParams(
  activities: Activity[],
  startDate: string,
  calendar: Parameters<typeof resolveRecordedProgress>[2],
): { recordedStarts?: Record<string, number>; recordedDurations?: Record<string, number>; seq?: SeqRecord[] } {
  const records = resolveRecordedProgress(activities, startDate, calendar);
  if (records.size === 0) return {};
  const recordedStarts: Record<string, number> = {};
  const recordedDurations: Record<string, number> = {};
  for (const [id, rec] of records) {
    recordedStarts[id] = rec.startOffset;
    if (rec.duration !== undefined) recordedDurations[id] = rec.duration;
  }
  const seq = activities.map((a) => {
    const rec = records.get(a.id);
    return rec ? { startOffset: rec.startOffset, duration: rec.duration } : null;
  });
  return { recordedStarts, recordedDurations, seq };
}

type ConstraintOffsetEntry = { type: string; offsetFromStart: number; mode: string };

/**
 * Resolve each constrained activity's constraint date into a working-day offset from project start.
 * Returns undefined if no activities have constraints (sentinel for "no constraints").
 */
function resolveConstraintOffsets(
  activities: Activity[],
  startDate: string,
  calendar: WorkCalendar | Calendar | undefined,
): Record<string, ConstraintOffsetEntry> | undefined {
  const constrained = activities.filter(
    (a) => a.constraintType && a.constraintDate && a.constraintMode
  );
  if (constrained.length === 0) return undefined;

  let projStart = parseDateISO(startDate);
  projStart = advanceToNextWorkingDay(projStart, calendar);

  const map: Record<string, ConstraintOffsetEntry> = {};
  for (const a of constrained) {
    let cDate = parseDateISO(a.constraintDate!);
    cDate = advanceToNextWorkingDay(cDate, calendar);
    map[a.id] = {
      type: a.constraintType!,
      offsetFromStart: countWorkingDays(projStart, cDate, calendar),
      mode: a.constraintMode!,
    };
  }
  return map;
}

/**
 * Build simulation parameters for either sequential or dependency mode.
 * Pure function — used by both manual run and auto-run to avoid duplication.
 */
export function buildSimulationParams(
  activities: Activity[],
  dependencyMode: boolean,
  probabilityTarget: number,
  dependencies: ActivityDependency[],
  milestones: Milestone[],
  startDate: string,
  calendar: WorkCalendar | Calendar | undefined,
  parkinsonsLawEnabled: boolean,
): SimulationParams {
  if (dependencyMode) {
    const durationMap = computeDependencyDurations(activities, probabilityTarget);
    const durMapRecord: Record<string, number> = {};
    for (const [k, v] of durationMap) durMapRecord[k] = v;

    const msParams = buildMilestoneSimParams(activities, milestones, startDate, calendar);
    const constraintMap = resolveConstraintOffsets(activities, startDate, calendar);
    const { recordedStarts, recordedDurations } = recordedProgressParams(activities, startDate, calendar);

    return {
      deterministicDurations: undefined,
      dependencyParams: {
        dependencyMode: true,
        dependencies,
        deterministicDurationMap: parkinsonsLawEnabled ? durMapRecord : undefined,
        ...msParams,
        constraintMap,
        ...(recordedStarts ? { recordedStarts, recordedDurations } : {}),
      },
      sequentialConstraints: undefined,
    };
  }

  const constraintOffsets = resolveConstraintOffsets(activities, startDate, calendar);
  const sequentialConstraints: SequentialConstraintEntry[] | undefined = constraintOffsets
    ? activities.map((a) => constraintOffsets[a.id] ?? null)
    : undefined;

  const { seq } = recordedProgressParams(activities, startDate, calendar);
  return {
    deterministicDurations: parkinsonsLawEnabled ? computeDeterministicDurations(activities, probabilityTarget) : undefined,
    dependencyParams: undefined,
    sequentialConstraints,
    ...(seq ? { sequentialRecords: seq } : {}),
  };
}
