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
