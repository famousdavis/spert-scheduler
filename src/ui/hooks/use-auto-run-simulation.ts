// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useEffect, useRef } from "react";
import type { Activity, Scenario, Calendar, SimulationRun } from "@domain/models/types";
import type { WorkCalendar } from "@core/calendar/work-calendar";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";
import { buildSimulationParams, type SimulationParams } from "@ui/helpers/build-simulation-params";
import { currentSimulationGeneration } from "@infrastructure/simulation/simulation-cancellation";

interface UseAutoRunSimulationArgs {
  projectId: string | undefined;
  scenario: Scenario | undefined;
  allActivitiesValid: boolean;
  workCalendar: WorkCalendar | Calendar | undefined;
  isRunning: boolean;
  runSimulation: (
    activities: Activity[],
    trialCount: number,
    rngSeed: string,
    deterministicDurations: number[] | undefined,
    onComplete: (result: SimulationRun, elapsedMs: number) => void,
    dependencyParams?: import("@core/simulation/worker-client").DependencySimulationParams,
    sequentialConstraints?: ({ type: string; offsetFromStart: number; mode: string } | null)[],
  ) => void;
  setSimulationResults: (projectId: string, scenarioId: string, result: SimulationRun) => void;
}

/**
 * Encapsulates the debounced auto-run simulation effect.
 * Fires 500ms after scenario data changes when auto-run is enabled.
 */
export function useAutoRunSimulation({
  projectId,
  scenario,
  allActivitiesValid,
  workCalendar,
  isRunning,
  runSimulation,
  setSimulationResults,
}: UseAutoRunSimulationArgs): void {
  const autoRunSimulation = usePreferencesStore(
    (s) => s.preferences.autoRunSimulation,
  );
  const autoRunTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const activitiesRef = useRef(scenario?.activities);
  // eslint-disable-next-line react-hooks/refs -- intentional latest-value ref latch, read in the debounced effect (not during render)
  activitiesRef.current = scenario?.activities;

  useEffect(() => {
    if (
      !autoRunSimulation ||
      !allActivitiesValid ||
      !scenario ||
      scenario.activities.length === 0 ||
      isRunning
    ) {
      return;
    }

    clearTimeout(autoRunTimerRef.current);
    autoRunTimerRef.current = setTimeout(() => {
      if (!projectId || !activitiesRef.current || activitiesRef.current.length === 0)
        return;

      let params: SimulationParams;
      try {
        params = buildSimulationParams(
          activitiesRef.current,
          scenario.settings.dependencyMode,
          scenario.settings.probabilityTarget,
          scenario.dependencies,
          scenario.milestones,
          scenario.startDate,
          workCalendar,
          scenario.settings.parkinsonsLawEnabled ?? true,
        );
      } catch (err) {
        // Silent to the user (see rationale below) but not silent to the developer:
        // this is the plan's single most important non-obvious decision, and a
        // regression here (e.g. this catch starting to swallow something it
        // shouldn't) should at least be visible in devtools. Not optional — always log.
        console.warn(
          "[auto-run] buildSimulationParams threw; skipping this debounced run:",
          err instanceof Error ? err.message : err
        );
        return;
      }
      // v0.42.6 (M2): capture the generation at the moment the worker is
      // dispatched. If sign-out fires while the worker is in flight, the
      // cleanup registry bumps the generation and the captured value no
      // longer matches — the result is dropped before touching the store.
      const startGen = currentSimulationGeneration();
      runSimulation(
        activitiesRef.current,
        scenario.settings.trialCount,
        scenario.settings.rngSeed,
        params.deterministicDurations,
        (result) => {
          if (currentSimulationGeneration() !== startGen) return;
          setSimulationResults(projectId, scenario.id, result);
        },
        params.dependencyParams,
        params.sequentialConstraints,
      );
    }, 500);

    return () => clearTimeout(autoRunTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    autoRunSimulation,
    allActivitiesValid,
    scenario?.activities,
    scenario?.dependencies,
    scenario?.settings.dependencyMode,
    scenario?.settings.probabilityTarget,
    scenario?.settings.projectProbabilityTarget,
    scenario?.settings.trialCount,
    scenario?.settings.rngSeed,
    scenario?.settings.parkinsonsLawEnabled,
    scenario?.milestones,
    // Recompute when calendar inputs change (converted/forced work days,
    // project holidays, global calendar, work-week mask) — workCalendar is the
    // memoized value from useWorkCalendar(), stable across unrelated renders.
    workCalendar,
  ]);
}
