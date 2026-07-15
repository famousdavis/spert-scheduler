// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAutoRunSimulation } from "./use-auto-run-simulation";
import { usePreferencesStore } from "./use-preferences-store";
import { buildWorkCalendar } from "@core/calendar/work-calendar";
import { buildSimulationParams } from "@ui/helpers/build-simulation-params";
import { DEFAULT_SCENARIO_SETTINGS } from "@domain/models/types";
import type { Scenario } from "@domain/models/types";

// The retrigger behavior under test lives entirely in the effect's dependency
// array — param building is not what's being verified, so stub it out.
vi.mock("@ui/helpers/build-simulation-params", () => ({
  buildSimulationParams: vi.fn(() => ({
    deterministicDurations: [1],
    dependencyParams: undefined,
    sequentialConstraints: undefined,
  })),
}));

function makeScenario(): Scenario {
  return {
    id: "s1",
    name: "Baseline",
    startDate: "2025-01-06",
    activities: [
      {
        id: "a1",
        name: "Task",
        min: 1,
        mostLikely: 2,
        max: 3,
        confidenceLevel: "mediumConfidence",
        distributionType: "triangular",
        status: "planned",
      },
    ],
    dependencies: [],
    milestones: [],
    settings: { ...DEFAULT_SCENARIO_SETTINGS, rngSeed: "test-seed" },
  };
}

describe("useAutoRunSimulation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    usePreferencesStore.setState({
      preferences: {
        ...usePreferencesStore.getState().preferences,
        autoRunSimulation: true,
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("re-triggers the debounced run when workCalendar identity changes", () => {
    const runSimulation = vi.fn();
    const scenario = makeScenario();
    const cal1 = buildWorkCalendar([1, 2, 3, 4, 5], [], []);
    const props = {
      projectId: "p1",
      scenario,
      allActivitiesValid: true,
      workCalendar: cal1,
      isRunning: false,
      runSimulation,
      setSimulationResults: vi.fn(),
    };
    const { rerender } = renderHook((p) => useAutoRunSimulation(p), {
      initialProps: props,
    });

    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(runSimulation).toHaveBeenCalledTimes(1);

    // Same calendar identity → dependency array unchanged → no re-run.
    rerender({ ...props, workCalendar: cal1 });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(runSimulation).toHaveBeenCalledTimes(1);

    // New calendar identity (e.g. a forced work day was added, a holiday
    // changed, the work-week mask changed) → debounced run fires again.
    const cal2 = buildWorkCalendar([1, 2, 3, 4, 5], [], [], {
      forcedWorkDays: ["2025-01-11"],
    });
    rerender({ ...props, workCalendar: cal2 });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(runSimulation).toHaveBeenCalledTimes(2);
  });

  it("does not run when auto-run is disabled", () => {
    usePreferencesStore.setState({
      preferences: {
        ...usePreferencesStore.getState().preferences,
        autoRunSimulation: false,
      },
    });
    const runSimulation = vi.fn();
    renderHook((p) => useAutoRunSimulation(p), {
      initialProps: {
        projectId: "p1",
        scenario: makeScenario(),
        allActivitiesValid: true,
        workCalendar: buildWorkCalendar([1, 2, 3, 4, 5], [], []),
        isRunning: false,
        runSimulation,
        setSimulationResults: vi.fn(),
      },
    });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(runSimulation).not.toHaveBeenCalled();
  });

  it("swallows a buildSimulationParams throw: no call to runSimulation, no uncaught exception", () => {
    vi.mocked(buildSimulationParams).mockImplementationOnce(() => {
      throw new Error("PERT mean must be > 0, got 0");
    });
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const runSimulation = vi.fn();
    renderHook((p) => useAutoRunSimulation(p), {
      initialProps: {
        projectId: "p1",
        scenario: makeScenario(),
        allActivitiesValid: true,
        workCalendar: buildWorkCalendar([1, 2, 3, 4, 5], [], []),
        isRunning: false,
        runSimulation,
        setSimulationResults: vi.fn(),
      },
    });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(runSimulation).not.toHaveBeenCalled();
    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    consoleWarnSpy.mockRestore();
  });
});
