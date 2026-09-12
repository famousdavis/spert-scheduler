// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * WI-35 — the nine work-calendar mutations must invalidate `simulationResults`.
 *
 * The work calendar is a simulation INPUT, not a display setting: converted and
 * forced work days and the project calendar override all feed
 * `buildWorkCalendar` -> `buildSimulationParams` -> the constraint and
 * milestone offsets the Monte Carlo engine clamps every trial against. A
 * calendar edit that leaves results standing presents numbers computed against
 * the OLD calendar as live ones. Measured during the WI-13 contract round: on a
 * scenario with a binding FNET constraint and an identical `rngSeed`, adding one
 * project holiday moves p50 33 -> 32 and p95 33.666 -> 32.666.
 *
 * The calendar lives on the PROJECT, so every scenario in that project is
 * scheduled against it and every scenario's results go stale together — hence
 * the cross-scenario case below.
 *
 * The last two cases are the over-invalidation guard: a project mutation that is
 * NOT an engine input must still leave results alone. They pass before the fix
 * as well as after, and are here to pin the boundary rather than to fail.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useProjectStore } from "./use-project-store";
import {
  DEFAULT_GANTT_APPEARANCE,
  type Calendar,
  type Project,
  type SimulationRun,
} from "@domain/models/types";

/** A fully-shaped run. Deliberately NOT cast: a cast disables the check that catches fixture errors. */
function makeRun(id: string): SimulationRun {
  return {
    id,
    timestamp: "2026-09-11T00:00:00.000Z",
    trialCount: 1000,
    seed: "seed-wi35",
    engineVersion: "test",
    percentiles: { 50: 33, 95: 33.666 },
    histogramBins: [],
    mean: 33,
    standardDeviation: 1,
    minSample: 30,
    maxSample: 36,
    samples: [32, 33, 34],
  };
}

const HOLIDAY_CALENDAR: Calendar = {
  holidays: [
    {
      id: "hol-wi35",
      name: "Company shutdown",
      startDate: "2026-10-12",
      endDate: "2026-10-12",
    },
  ],
};

/** Create a project whose single scenario carries live results. */
function seed(): { project: Project; scenarioId: string } {
  const project = useProjectStore.getState().addProject("Calendar Invalidation", null);
  const scenarioId = project.scenarios[0]!.id;
  useProjectStore.getState().setSimulationResults(project.id, scenarioId, makeRun("run-1"));
  return { project, scenarioId };
}

function scenarioOf(projectId: string, scenarioId: string) {
  const project = useProjectStore.getState().getProject(projectId)!;
  return project.scenarios.find((s) => s.id === scenarioId)!;
}

function projectOf(projectId: string): Project {
  return useProjectStore.getState().getProject(projectId)!;
}

describe("work-calendar mutations invalidate simulationResults (WI-35)", () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.setState({ projects: [], undoStack: [], redoStack: [], loadError: false });
  });

  it("setProjectCalendar clears results", () => {
    const { project, scenarioId } = seed();
    expect(scenarioOf(project.id, scenarioId).simulationResults?.id).toBe("run-1");

    useProjectStore.getState().setProjectCalendar(project.id, HOLIDAY_CALENDAR);

    expect(projectOf(project.id).globalCalendarOverride?.holidays).toHaveLength(1);
    expect(scenarioOf(project.id, scenarioId).simulationResults).toBeUndefined();
  });

  it("setConvertedWorkDays clears results", () => {
    const { project, scenarioId } = seed();
    expect(scenarioOf(project.id, scenarioId).simulationResults?.id).toBe("run-1");

    useProjectStore.getState().setConvertedWorkDays(project.id, ["2026-10-10"]);

    expect(projectOf(project.id).convertedWorkDays).toEqual(["2026-10-10"]);
    expect(scenarioOf(project.id, scenarioId).simulationResults).toBeUndefined();
  });

  it("addConvertedWorkDay clears results", () => {
    const { project, scenarioId } = seed();
    expect(scenarioOf(project.id, scenarioId).simulationResults?.id).toBe("run-1");

    useProjectStore.getState().addConvertedWorkDay(project.id, "2026-10-10");

    expect(projectOf(project.id).convertedWorkDays).toEqual(["2026-10-10"]);
    expect(scenarioOf(project.id, scenarioId).simulationResults).toBeUndefined();
  });

  it("removeConvertedWorkDay clears results", () => {
    const { project, scenarioId } = seed();
    useProjectStore.getState().setConvertedWorkDays(project.id, ["2026-10-10"]);
    // Re-arm: the seeding mutation is itself one of the nine.
    useProjectStore.getState().setSimulationResults(project.id, scenarioId, makeRun("run-2"));
    expect(scenarioOf(project.id, scenarioId).simulationResults?.id).toBe("run-2");

    useProjectStore.getState().removeConvertedWorkDay(project.id, "2026-10-10");

    expect(projectOf(project.id).convertedWorkDays).toEqual([]);
    expect(scenarioOf(project.id, scenarioId).simulationResults).toBeUndefined();
  });

  it("setForcedWorkDays clears results", () => {
    const { project, scenarioId } = seed();
    expect(scenarioOf(project.id, scenarioId).simulationResults?.id).toBe("run-1");

    useProjectStore.getState().setForcedWorkDays(project.id, ["2026-10-12"]);

    expect(projectOf(project.id).forcedWorkDays).toEqual(["2026-10-12"]);
    expect(scenarioOf(project.id, scenarioId).simulationResults).toBeUndefined();
  });

  it("addForcedWorkDay clears results", () => {
    const { project, scenarioId } = seed();
    expect(scenarioOf(project.id, scenarioId).simulationResults?.id).toBe("run-1");

    useProjectStore.getState().addForcedWorkDay(project.id, "2026-10-12");

    expect(projectOf(project.id).forcedWorkDays).toEqual(["2026-10-12"]);
    expect(scenarioOf(project.id, scenarioId).simulationResults).toBeUndefined();
  });

  it("removeForcedWorkDay clears results", () => {
    const { project, scenarioId } = seed();
    useProjectStore.getState().setForcedWorkDays(project.id, ["2026-10-12"]);
    useProjectStore.getState().setSimulationResults(project.id, scenarioId, makeRun("run-2"));
    expect(scenarioOf(project.id, scenarioId).simulationResults?.id).toBe("run-2");

    useProjectStore.getState().removeForcedWorkDay(project.id, "2026-10-12");

    expect(projectOf(project.id).forcedWorkDays).toEqual([]);
    expect(scenarioOf(project.id, scenarioId).simulationResults).toBeUndefined();
  });

  it("removeWorkDayOverride clears results", () => {
    const { project, scenarioId } = seed();
    useProjectStore.getState().setConvertedWorkDays(project.id, ["2026-10-10"]);
    useProjectStore.getState().setForcedWorkDays(project.id, ["2026-10-10"]);
    useProjectStore.getState().setSimulationResults(project.id, scenarioId, makeRun("run-2"));
    expect(scenarioOf(project.id, scenarioId).simulationResults?.id).toBe("run-2");

    useProjectStore.getState().removeWorkDayOverride(project.id, "2026-10-10");

    expect(projectOf(project.id).convertedWorkDays).toEqual([]);
    expect(projectOf(project.id).forcedWorkDays).toEqual([]);
    expect(scenarioOf(project.id, scenarioId).simulationResults).toBeUndefined();
  });

  it("upgradeToForcedWorkDay clears results", () => {
    const { project, scenarioId } = seed();
    useProjectStore.getState().setConvertedWorkDays(project.id, ["2026-10-10"]);
    useProjectStore.getState().setSimulationResults(project.id, scenarioId, makeRun("run-2"));
    expect(scenarioOf(project.id, scenarioId).simulationResults?.id).toBe("run-2");

    useProjectStore.getState().upgradeToForcedWorkDay(project.id, "2026-10-10");

    expect(projectOf(project.id).convertedWorkDays).toEqual([]);
    expect(projectOf(project.id).forcedWorkDays).toEqual(["2026-10-10"]);
    expect(scenarioOf(project.id, scenarioId).simulationResults).toBeUndefined();
  });

  it("a calendar change clears EVERY scenario in the project, not just one", () => {
    const project = useProjectStore.getState().addProject("Two Scenarios", null);
    const first = project.scenarios[0]!.id;
    useProjectStore.getState().addScenario(project.id, "Alternate", "2026-10-01");
    const second = projectOf(project.id).scenarios[1]!.id;
    expect(second).not.toBe(first);

    useProjectStore.getState().setSimulationResults(project.id, first, makeRun("run-first"));
    useProjectStore.getState().setSimulationResults(project.id, second, makeRun("run-second"));
    expect(scenarioOf(project.id, first).simulationResults?.id).toBe("run-first");
    expect(scenarioOf(project.id, second).simulationResults?.id).toBe("run-second");

    useProjectStore.getState().addForcedWorkDay(project.id, "2026-10-12");

    expect(scenarioOf(project.id, first).simulationResults).toBeUndefined();
    expect(scenarioOf(project.id, second).simulationResults).toBeUndefined();
  });

  // -- Over-invalidation guards. These PASS before the fix as well as after. ---

  it("renameProject does NOT clear results — a name is not an engine input", () => {
    const { project, scenarioId } = seed();

    useProjectStore.getState().renameProject(project.id, "Renamed");

    expect(projectOf(project.id).name).toBe("Renamed");
    expect(scenarioOf(project.id, scenarioId).simulationResults?.id).toBe("run-1");
  });

  it("updateGanttAppearance does NOT clear results — appearance is display only", () => {
    const { project, scenarioId } = seed();

    useProjectStore
      .getState()
      .updateGanttAppearance(project.id, { ...DEFAULT_GANTT_APPEARANCE, weekendShading: false });

    expect(projectOf(project.id).ganttAppearance?.weekendShading).toBe(false);
    expect(scenarioOf(project.id, scenarioId).simulationResults?.id).toBe("run-1");
  });
});
