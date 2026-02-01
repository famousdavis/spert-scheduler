import { useState, useCallback, useRef } from "react";
import type { Activity, SimulationRun } from "@domain/models/types";
import { runSimulation } from "@app/api/simulation-service";
import type { SimulationHandle } from "@core/simulation/worker-client";

export interface SimulationState {
  isRunning: boolean;
  progress: { completed: number; total: number } | null;
  error: string | null;
  elapsedMs: number | null;
}

export function useSimulation() {
  const [state, setState] = useState<SimulationState>({
    isRunning: false,
    progress: null,
    error: null,
    elapsedMs: null,
  });

  const handleRef = useRef<SimulationHandle | null>(null);

  const run = useCallback(
    (
      activities: Activity[],
      trialCount: number,
      rngSeed: string,
      deterministicDurations: number[] | undefined,
      onComplete: (result: SimulationRun, elapsedMs: number) => void
    ) => {
      setState({
        isRunning: true,
        progress: null,
        error: null,
        elapsedMs: null,
      });

      handleRef.current = runSimulation(activities, trialCount, rngSeed, deterministicDurations, {
        onProgress: (completed, total) => {
          setState((prev) => ({
            ...prev,
            progress: { completed, total },
          }));
        },
        onComplete: (result, elapsedMs) => {
          setState({
            isRunning: false,
            progress: null,
            error: null,
            elapsedMs,
          });
          handleRef.current = null;
          onComplete(result, elapsedMs);
        },
        onError: (message) => {
          setState({
            isRunning: false,
            progress: null,
            error: message,
            elapsedMs: null,
          });
          handleRef.current = null;
        },
      });
    },
    []
  );

  const cancel = useCallback(() => {
    handleRef.current?.cancel();
    handleRef.current = null;
    setState({
      isRunning: false,
      progress: null,
      error: null,
      elapsedMs: null,
    });
  }, []);

  return { ...state, run, cancel };
}
