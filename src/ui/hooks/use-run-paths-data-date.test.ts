// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCompareRuns } from "./use-compare-runs";
import { useAutoRunSimulation } from "./use-auto-run-simulation";
import { runSimulation } from "@app/api/simulation-service";
import { useProjectStore } from "@ui/hooks/use-project-store";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";
import { _resetSimulationGenerationForTests } from "@infrastructure/simulation/simulation-cancellation";
import { DEFAULT_SCENARIO_SETTINGS } from "@domain/models/types";
import type { Activity, Project, Scenario } from "@domain/models/types";

vi.mock("@app/api/simulation-service", () => ({ runSimulation: vi.fn(() => ({ cancel: vi.fn() })) }));

/**
 * WI-154 (Review 35, verification G3 and G5) — every path that starts a simulation reads today the
 * way the page does, so the forecast it stores is the schedule's: the auto-run (and it runs again on
 * a new day) and Compare's Run. Done (Complete, recorded, 5 days) then Next (5 days, not started),
 * dependencies off; Start Date Mon 10/05. Today Tue 10/27 is 16 working days on; Wed 10/28, 17.
 * The data date's offset is the run's ninth argument.
 */
const act5 = (id: string, overrides: Partial<Activity> = {}): Activity => ({
  id, name: id, min: 5, mostLikely: 5, max: 5, confidenceLevel: "mediumConfidence", distributionType: "uniform", status: "planned", ...overrides,
});
const SCENARIO: Scenario = {
  id: "s1", name: "Baseline", startDate: "2026-10-05", dependencies: [], milestones: [],
  activities: [act5("Done", { status: "complete", actualStartDate: "2026-10-05", actualFinishDate: "2026-10-09", actualDuration: 5 }), act5("Next")],
  settings: { ...DEFAULT_SCENARIO_SETTINGS, rngSeed: "wi154" },
} as Scenario;
const OFFSET = 8;

beforeEach(() => {
  vi.mocked(runSimulation).mockClear();
  _resetSimulationGenerationForTests();
});

describe("Compare's Run reads today (G5)", () => {
  beforeEach(() => { vi.useFakeTimers({ now: new Date("2026-10-27T12:00:00"), toFake: ["Date"] }); });
  afterEach(() => { vi.useRealTimers(); });

  it("sends the data date's offset, 16", () => {
    const project = { id: "p1", name: "P", scenarios: [SCENARIO] } as unknown as Project;
    useProjectStore.setState({ projects: [project], loadError: false });
    const { result } = renderHook(() => useCompareRuns(vi.fn()));
    act(() => result.current.run("p1", "s1", undefined));
    expect(vi.mocked(runSimulation).mock.calls[0]![OFFSET]).toBe(16);
  });
});

describe("the auto-run reads today, and runs again on a new day (G3)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-10-27T12:00:00") });
    usePreferencesStore.setState({ preferences: { ...usePreferencesStore.getState().preferences, autoRunSimulation: true } });
  });
  afterEach(() => { vi.useRealTimers(); });

  it("16 on Tue 10/27; on Wed 10/28 it runs again, with 17", () => {
    const run = vi.fn();
    const props = {
      projectId: "p1", scenario: SCENARIO, allActivitiesValid: true, workCalendar: undefined,
      isRunning: false, runSimulation: run, setSimulationResults: vi.fn(), today: "2026-10-27",
    };
    const { rerender } = renderHook((p) => useAutoRunSimulation(p), { initialProps: props });
    act(() => { vi.advanceTimersByTime(600); });
    rerender({ ...props, today: "2026-10-28" });
    act(() => { vi.advanceTimersByTime(600); });
    expect(run.mock.calls.map((c) => c[OFFSET])).toEqual([16, 17]);
  });
});
