// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useCallback, useRef, useState } from "react";
import type { Calendar, SimulationRun } from "@domain/models/types";
import type { WorkCalendar } from "@core/calendar/work-calendar";
import { runSimulation } from "@app/api/simulation-service";
import { useProjectStore } from "@ui/hooks/use-project-store";
import { buildSimulationParams, type SimulationParams } from "@ui/helpers/build-simulation-params";
import { savedScenarioFlags } from "@ui/helpers/scenario-flags";
import { runBlockedMessage } from "@ui/helpers/run-blocked-message";
import { currentSimulationGeneration } from "@infrastructure/simulation/simulation-cancellation";
import { toast } from "@ui/hooks/use-notification-store";

type SetSimulationResults = (projectId: string, scenarioId: string, results: SimulationRun) => void;

/** No Compare run in flight: one set for every render, so a held copy never sees a change that isn't. */
const NOTHING_RUNNING: ReadonlySet<string> = new Set();

export interface CompareRuns {
  /** The scenarios whose Compare run is in flight. State: a new set on every change, stable between. */
  runningIds: ReadonlySet<string>;
  /** What the last Compare run did, in words for the table's live region; `""` when nothing to say. */
  runStatus: string;
  run: (projectId: string, scenarioId: string, calendar: WorkCalendar | Calendar | undefined) => void;
}

/**
 * The Compare table's Run (owner, 2026-10-02): run a compared scenario WHERE IT IS, the tab on
 * screen unchanged, with that scenario's own trials and seed — so its numbers are the ones its own
 * Run Simulation button would produce. Each run is independent; several can be in flight at once,
 * because `runSimulation` makes one Worker per call.
 *
 * ⚠️ IT READS THE SCENARIO LIVE FROM THE STORE, never from the table's props: the table is painted
 * from inputs held while a pointer is down, and a run must start from what is saved now. The row
 * offers no Run for a flagged or empty plan, so the refusals below are reached only by a change that
 * lands between the paint and the click — a collaborator's edit, an AI operation.
 *
 * Like the panel's Run, it pushes no undo frame and checks no lock, and a result that arrives after
 * sign-out is discarded (the generation check). No effect sets state here, and nothing is cancelled
 * on unmount — neither does `useSimulation`; a result still lands in the store.
 */
export function useCompareRuns(setSimulationResults: SetSimulationResults): CompareRuns {
  const [runningIds, setRunningIds] = useState<ReadonlySet<string>>(NOTHING_RUNNING);
  const [runStatus, setRunStatus] = useState("");
  // The running set's mirror, read and written synchronously: two clicks in one task must not
  // both dispatch, and state would not show the first click to the second.
  const runningRef = useRef(new Set<string>());

  const settle = useCallback((scenarioId: string) => {
    runningRef.current.delete(scenarioId);
    setRunningIds(new Set(runningRef.current));
  }, []);

  const run = useCallback(
    (projectId: string, scenarioId: string, calendar: WorkCalendar | Calendar | undefined) => {
      if (runningRef.current.has(scenarioId)) return;
      const scenario = useProjectStore.getState().getProject(projectId)?.scenarios.find((s) => s.id === scenarioId);
      // An empty scenario's run completes with every sample 0 and would be stored as a result; the
      // panel's Run refuses it too.
      if (!scenario || scenario.activities.length === 0) return;
      const flags = savedScenarioFlags(scenario.activities, scenario.settings.probabilityTarget);
      if (flags.rows.length > 0) {
        toast.error(runBlockedMessage(flags.rows.map((row) => ({ id: row.id, name: row.name, messages: [...row.messages] }))));
        return;
      }
      let params: SimulationParams;
      try {
        params = buildSimulationParams(
          scenario.activities,
          scenario.settings.dependencyMode,
          scenario.settings.probabilityTarget,
          scenario.dependencies,
          scenario.milestones,
          scenario.startDate,
          calendar,
          scenario.settings.parkinsonsLawEnabled ?? true,
        );
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
        return;
      }
      const name = scenario.name;
      // Captured at dispatch: a sign-out bumps it, and a result from before is then discarded.
      const startGen = currentSimulationGeneration();
      runningRef.current.add(scenarioId);
      setRunningIds(new Set(runningRef.current));
      setRunStatus(`Running a simulation for ${name}.`);
      runSimulation(
        scenario.activities,
        scenario.settings.trialCount,
        scenario.settings.rngSeed,
        params.deterministicDurations,
        {
          onComplete: (result) => {
            settle(scenarioId);
            if (currentSimulationGeneration() !== startGen) {
              setRunStatus("");
              return;
            }
            setSimulationResults(projectId, scenarioId, result);
            setRunStatus(`Simulation finished for ${name}.`);
          },
          onError: (message) => {
            settle(scenarioId);
            setRunStatus("");
            toast.error(`Simulation failed for ${name}: ${message}`);
          },
        },
        params.dependencyParams,
        params.sequentialConstraints,
      );
    },
    [setSimulationResults, settle],
  );

  return { runningIds, runStatus, run };
}
