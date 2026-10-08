// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { useCompareRuns } from "./use-compare-runs";
import { runSimulation } from "@app/api/simulation-service";
import { useProjectStore } from "@ui/hooks/use-project-store";
import { useNotificationStore } from "@ui/hooks/use-notification-store";
import {
  bumpSimulationGeneration,
  _resetSimulationGenerationForTests,
} from "@infrastructure/simulation/simulation-cancellation";
import { createProject, createScenario, createActivity } from "@app/api/project-service";
import type { Activity, Project, Scenario, ScenarioSettings, SimulationRun } from "@domain/models/types";

vi.mock("@app/api/simulation-service", () => ({ runSimulation: vi.fn() }));

/**
 * The Compare table's Run, as a state machine over a mocked service — the only place "Running..."
 * can be seen: under jsdom the real service runs synchronously inside the click (no Worker), so a
 * page test never catches a run in flight. The page tests drive the real engine.
 */

const mockRun = vi.mocked(runSimulation);

type Callbacks = {
  onProgress?: (completed: number, total: number) => void;
  onComplete: (result: SimulationRun, elapsedMs: number) => void;
  onError: (message: string) => void;
};

/** The callbacks of every dispatch, in order, so a test can finish each run when it chooses. */
let dispatched: Callbacks[] = [];

beforeEach(() => {
  dispatched = [];
  mockRun.mockReset();
  mockRun.mockImplementation(((_a: unknown, _t: unknown, _s: unknown, _d: unknown, cbs: Callbacks) => {
    dispatched.push(cbs);
    return { cancel: vi.fn() };
  }) as unknown as typeof runSimulation);
  useNotificationStore.setState({ notifications: [] });
  _resetSimulationGenerationForTests();
});

/** An activity as `+ Add Activity` makes it, then patched — never a cast. */
function activityWith(name: string, settings: ScenarioSettings, patch: Partial<Activity>): Activity {
  return { ...createActivity(name, settings), ...patch };
}

/** A scenario with its OWN trial count and seed, distinct from every default. */
function scenarioWith(name: string, settings: Partial<ScenarioSettings>, rows: Partial<Activity>[]): Scenario {
  const s = createScenario(name, "2026-04-06", settings);
  return { ...s, activities: rows.map((patch, i) => activityWith(`${name} row ${i + 1}`, s.settings, patch)) };
}

function storeWith(...scenarios: Scenario[]): Project {
  const project = { ...createProject("Osprey Culvert", "2026-04-06"), scenarios };
  useProjectStore.setState({ projects: [project], loadError: false });
  return project;
}

const RESULT = { id: "r1", percentiles: { 50: 5, 95: 5 }, samples: [5] } as unknown as SimulationRun;

const errorToasts = () =>
  useNotificationStore
    .getState()
    .notifications.filter((n) => n.type === "error")
    .map((n) => n.message);

function mount() {
  const setSimulationResults = vi.fn();
  const hook = renderHook(() => useCompareRuns(setSimulationResults));
  return { hook, setSimulationResults };
}

describe("useCompareRuns — what it dispatches", () => {
  it("the scenario's OWN trial count, seed and params: sequential, with Parkinson's floor", () => {
    const flat = scenarioWith("Heron", { trialCount: 2345, rngSeed: "heron-seed" }, [{ min: 5, mostLikely: 5, max: 5 }]);
    const other = scenarioWith("Egret", { trialCount: 7777, rngSeed: "egret-seed" }, [{ min: 5, mostLikely: 5, max: 5 }]);
    const p = storeWith(other, flat);
    const { hook } = mount();
    act(() => hook.result.current.run(p.id, flat.id, undefined));
    expect(mockRun).toHaveBeenCalledTimes(1);
    const [activities, trials, seed, durations, , dependencyParams, sequentialConstraints] = mockRun.mock.calls[0]!;
    expect(activities).toBe(useProjectStore.getState().getProject(p.id)!.scenarios[1]!.activities);
    expect(trials).toBe(2345);
    expect(seed).toBe("heron-seed");
    expect(durations).toEqual([5]); // a point mass at 5 days: Parkinson's floor is 5
    expect(dependencyParams).toBeUndefined();
    expect(sequentialConstraints).toBeUndefined();
  });

  it("dependency mode: the dependency params, keyed by activity, and no sequential floor", () => {
    const dep = scenarioWith("Plover", { trialCount: 1500, rngSeed: "plover-seed", dependencyMode: true }, [
      { min: 4, mostLikely: 4, max: 4 },
    ]);
    const p = storeWith(dep);
    const { hook } = mount();
    act(() => hook.result.current.run(p.id, dep.id, undefined));
    const [, trials, seed, durations, , dependencyParams] = mockRun.mock.calls[0]!;
    expect([trials, seed, durations]).toEqual([1500, "plover-seed", undefined]);
    expect(dependencyParams).toMatchObject({
      dependencyMode: true,
      dependencies: [],
      deterministicDurationMap: { [dep.activities[0]!.id]: 4 },
    });
  });

  it("Parkinson's law off → no floor (control: the same scenario with it on gets its floor)", () => {
    const off = scenarioWith("Off", { parkinsonsLawEnabled: false }, [{ min: 5, mostLikely: 5, max: 5 }]);
    const p = storeWith(off);
    const { hook } = mount();
    act(() => hook.result.current.run(p.id, off.id, undefined));
    expect(mockRun.mock.calls[0]![3]).toBeUndefined();
    act(() => dispatched[0]!.onComplete(RESULT, 1)); // settle it, or the second run is refused as in flight
    useProjectStore.setState({
      projects: [{ ...p, scenarios: [{ ...off, settings: { ...off.settings, parkinsonsLawEnabled: true } }] }],
    });
    act(() => hook.result.current.run(p.id, off.id, undefined));
    expect(mockRun.mock.calls[1]![3]).toEqual([5]);
  });

  it("reads the scenario LIVE from the store: an edit after mount is what runs", () => {
    const s = scenarioWith("Grebe", { trialCount: 1000, rngSeed: "old-seed" }, [{ min: 5, mostLikely: 5, max: 5 }]);
    const p = storeWith(s);
    const { hook } = mount();
    useProjectStore.setState({
      projects: [{ ...p, scenarios: [{ ...s, settings: { ...s.settings, rngSeed: "new-seed" } }] }],
    });
    act(() => hook.result.current.run(p.id, s.id, undefined));
    expect(mockRun.mock.calls[0]![2]).toBe("new-seed");
  });
});

describe("useCompareRuns — the running set and the status line", () => {
  it("start → complete: running and announced, then stored, settled and announced", () => {
    const s = scenarioWith("Bittern", { trialCount: 1000 }, [{ min: 3, mostLikely: 5, max: 9 }]);
    const p = storeWith(s);
    const { hook, setSimulationResults } = mount();
    act(() => hook.result.current.run(p.id, s.id, undefined));
    expect([...hook.result.current.runningIds]).toEqual([s.id]);
    expect(hook.result.current.runStatus).toBe("Running a simulation for Bittern.");
    expect(setSimulationResults).not.toHaveBeenCalled();

    act(() => dispatched[0]!.onComplete(RESULT, 12));
    expect(setSimulationResults).toHaveBeenCalledTimes(1);
    expect(setSimulationResults).toHaveBeenCalledWith(p.id, s.id, RESULT);
    expect(hook.result.current.runningIds.size).toBe(0);
    expect(hook.result.current.runStatus).toBe("Simulation finished for Bittern.");
  });

  it("complete after the generation moved (a sign-out): nothing stored, the status cleared — control: unmoved, stored", () => {
    const s = scenarioWith("Shag", { trialCount: 1000 }, [{ min: 3, mostLikely: 5, max: 9 }]);
    const p = storeWith(s);
    const { hook, setSimulationResults } = mount();
    act(() => hook.result.current.run(p.id, s.id, undefined));
    bumpSimulationGeneration();
    act(() => dispatched[0]!.onComplete(RESULT, 12));
    expect(setSimulationResults).not.toHaveBeenCalled();
    expect(hook.result.current.runStatus).toBe("");
    expect(hook.result.current.runningIds.size).toBe(0);

    act(() => hook.result.current.run(p.id, s.id, undefined));
    act(() => dispatched[1]!.onComplete(RESULT, 12));
    expect(setSimulationResults).toHaveBeenCalledWith(p.id, s.id, RESULT);
  });

  it("error: the panel's words with the scenario named, the status cleared, the set settled", () => {
    const s = scenarioWith("Gadwall", { trialCount: 1000 }, [{ min: 3, mostLikely: 5, max: 9 }]);
    const p = storeWith(s);
    const { hook, setSimulationResults } = mount();
    act(() => hook.result.current.run(p.id, s.id, undefined));
    expect(hook.result.current.runStatus).toBe("Running a simulation for Gadwall.");
    act(() => dispatched[0]!.onError("Worker crashed"));
    expect(errorToasts()).toEqual(["Simulation failed for Gadwall: Worker crashed"]);
    expect(hook.result.current.runStatus).toBe("");
    expect(hook.result.current.runningIds.size).toBe(0);
    expect(setSimulationResults).not.toHaveBeenCalled();
  });
});

describe("useCompareRuns — what it refuses", () => {
  it("a scenario with NO activities → no dispatch (control: one with an activity → a dispatch)", () => {
    const empty = createScenario("Empty", "2026-04-06");
    const full = scenarioWith("Full", {}, [{ min: 3, mostLikely: 5, max: 9 }]);
    const p = storeWith(empty, full);
    const { hook } = mount();
    act(() => hook.result.current.run(p.id, empty.id, undefined));
    expect(mockRun).not.toHaveBeenCalled();
    expect(hook.result.current.runningIds.size).toBe(0);
    act(() => hook.result.current.run(p.id, full.id, undefined));
    expect(mockRun).toHaveBeenCalledTimes(1);
  });

  it("a scenario that is gone, or a project that is gone → no dispatch", () => {
    const s = scenarioWith("Tern", {}, [{ min: 3, mostLikely: 5, max: 9 }]);
    const p = storeWith(s);
    const { hook } = mount();
    act(() => hook.result.current.run(p.id, "no-such-scenario", undefined));
    act(() => hook.result.current.run("no-such-project", s.id, undefined));
    expect(mockRun).not.toHaveBeenCalled();
    act(() => hook.result.current.run(p.id, s.id, undefined));
    expect(mockRun).toHaveBeenCalledTimes(1);
  });

  it("a FLAGGED saved plan → the Run-blocked toast and no dispatch", () => {
    const flagged = scenarioWith("Skua", {}, [{ min: 12, mostLikely: 10, max: 20, distributionType: "normal" }]);
    const p = storeWith(flagged);
    const { hook } = mount();
    act(() => hook.result.current.run(p.id, flagged.id, undefined));
    expect(mockRun).not.toHaveBeenCalled();
    expect(errorToasts()).toEqual([
      "Simulation not run. Fix this activity first: Skua row 1 (Min is above Most Likely).",
    ]);
    expect(hook.result.current.runStatus).toBe("");
  });

  it("WI-105: a FLAGGED plan in a project that numbers its activities → each row by its #N in ITS scenario", () => {
    // The flagged row is the SECOND of its scenario, and the only flagged one: its place in its own
    // grid is 2, its place among the flagged is 1. The other scenario is the one a page would show.
    const shown = scenarioWith("Gull", {}, [{ min: 3, mostLikely: 5, max: 9 }]);
    const flagged = scenarioWith("Skua", {}, [
      { min: 3, mostLikely: 5, max: 9 },
      { min: 12, mostLikely: 10, max: 20, distributionType: "normal" },
    ]);
    const project: Project = { ...createProject("Osprey Culvert", "2026-04-06"), showActivityIds: true, scenarios: [shown, flagged] };
    useProjectStore.setState({ projects: [project], loadError: false });
    const { hook } = mount();
    act(() => hook.result.current.run(project.id, flagged.id, undefined));
    expect(mockRun).not.toHaveBeenCalled();
    expect(errorToasts()).toEqual([
      "Simulation not run. Fix this activity first: #2 Skua row 2 (Min is above Most Likely).",
    ]);
  });

  it("a second run of an id already in flight → no second dispatch, even in the same task", () => {
    const s = scenarioWith("Smew", {}, [{ min: 3, mostLikely: 5, max: 9 }]);
    const p = storeWith(s);
    const { hook } = mount();
    act(() => {
      hook.result.current.run(p.id, s.id, undefined);
      hook.result.current.run(p.id, s.id, undefined);
    });
    expect(mockRun).toHaveBeenCalledTimes(1);
    act(() => hook.result.current.run(p.id, s.id, undefined));
    expect(mockRun).toHaveBeenCalledTimes(1);
    // Control: once it settles, the same id runs again.
    act(() => dispatched[0]!.onComplete(RESULT, 1));
    act(() => hook.result.current.run(p.id, s.id, undefined));
    expect(mockRun).toHaveBeenCalledTimes(2);
  });

  it("two ids → two dispatches, both running at once, each settling on its own", () => {
    const a = scenarioWith("Avocet", {}, [{ min: 3, mostLikely: 5, max: 9 }]);
    const b = scenarioWith("Stilt", {}, [{ min: 3, mostLikely: 5, max: 9 }]);
    const p = storeWith(a, b);
    const { hook, setSimulationResults } = mount();
    act(() => {
      hook.result.current.run(p.id, a.id, undefined);
      hook.result.current.run(p.id, b.id, undefined);
    });
    expect(mockRun).toHaveBeenCalledTimes(2);
    expect([...hook.result.current.runningIds].sort()).toEqual([a.id, b.id].sort());
    act(() => dispatched[1]!.onComplete(RESULT, 1));
    expect([...hook.result.current.runningIds]).toEqual([a.id]);
    expect(setSimulationResults).toHaveBeenCalledWith(p.id, b.id, RESULT);
  });
});
