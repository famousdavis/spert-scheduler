// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useEffect, useRef } from "react";
import type { Activity, Scenario, Calendar, SimulationRun } from "@domain/models/types";
import type { WorkCalendar } from "@core/calendar/work-calendar";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";
import { buildSimulationParams } from "@ui/helpers/build-simulation-params";

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

      const params = buildSimulationParams(
        activitiesRef.current,
        scenario.settings.dependencyMode,
        scenario.settings.probabilityTarget,
        scenario.dependencies,
        scenario.milestones,
        scenario.startDate,
        workCalendar,
      );
      runSimulation(
        activitiesRef.current,
        scenario.settings.trialCount,
        scenario.settings.rngSeed,
        params.deterministicDurations,
        (result) => {
          setSimulationResults(projectId, scenario.id, result);
        },
        params.dependencyParams,
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
    scenario?.milestones,
  ]);
}
