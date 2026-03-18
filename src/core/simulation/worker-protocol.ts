// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import type { Activity, ActivityDependency, SimulationRun } from "@domain/models/types";

// -- Main thread --> Worker ---------------------------------------------------

export interface SimulationRequest {
  type: "simulation:start";
  payload: {
    activities: Activity[];
    trialCount: number;
    rngSeed: string;
    deterministicDurations?: number[];
    /** When true, use dependency-aware simulation. */
    dependencyMode?: boolean;
    /** Dependencies for dependency-aware simulation. */
    dependencies?: ActivityDependency[];
    /** Per-activity deterministic durations (Parkinson floors), keyed by activity ID. */
    deterministicDurationMap?: Record<string, number>;
    /** Map of milestoneId → activity IDs assigned to that milestone (serialized as Record). */
    milestoneActivityIds?: Record<string, string[]>;
    /** Map of activityId → earliest start offset in working days (serialized as Record). */
    activityEarliestStart?: Record<string, number>;
    /** Map of activityId → constraint info for MC per-trial clamping (serialized as Record). */
    constraintMap?: Record<string, { type: string; offsetFromStart: number; mode: string }>;
  };
}

// -- Worker --> Main thread ---------------------------------------------------

export interface SimulationProgress {
  type: "simulation:progress";
  payload: {
    completedTrials: number;
    totalTrials: number;
  };
}

export interface SimulationResult {
  type: "simulation:result";
  payload: SimulationRun & { elapsedMs: number };
}

export interface SimulationError {
  type: "simulation:error";
  payload: {
    message: string;
  };
}

export type WorkerOutgoingMessage =
  | SimulationProgress
  | SimulationResult
  | SimulationError;
