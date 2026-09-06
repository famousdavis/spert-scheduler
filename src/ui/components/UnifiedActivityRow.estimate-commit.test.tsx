// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * WI-2 · the COMMIT half: a blur only writes when the number on screen changed.
 *
 * Filed as a display bug; it is a data-loss bug. Before v0.67.2, clicking an estimate cell
 * and clicking away — typing nothing — committed the cell's DOM value over the store,
 * pushed an undo frame, discarded the simulation results and emitted a cloud save. The
 * display half is in `UnifiedActivityRow.estimate-follow.test.tsx`.
 *
 * ⚠️ WHY THE FRACTIONAL FIXTURE IS NOT OPTIONAL. `computeHeuristic` stores real fractions
 * — a row added with the heuristic on at 75 % / 200 % is `{0.75, 1, 2}` — while the cell
 * has always displayed `Math.round`. So the guard has to compare what is ON SCREEN, not
 * what is in the store: a guard comparing the rounded DOM value against the raw stored
 * number passes every integer fixture in this repo and still writes `1` over a stored
 * `0.75`. That was measured on a straw implementation before this one was written. The
 * fractional test below asserts its own premise — store fractional AND cell rounded —
 * before it does anything, so a fixture that quietly lost its fraction cannot pass.
 *
 * ⚠️ `fireEvent.change`, never `el.value = "…"` — the inputs are controlled now and React's
 * value tracker swallows a direct assignment. A swallowed edit reads as a clean pass.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { act, StrictMode, useState } from "react";
import type { Activity, SimulationRun } from "@domain/models/types";
import { useProjectStore } from "@ui/hooks/use-project-store";
import { cloudSyncBus } from "@infrastructure/persistence/sync-bus";
import { UnifiedActivityRow } from "./UnifiedActivityRow";

const cell = (field: string, id: string) =>
  document.querySelector<HTMLInputElement>(`[data-row-id="${id}"][data-field="${field}"]`)!;

/** Typed, never cast. */
function makeActivity(over: Partial<Activity> = {}): Activity {
  return {
    id: "a1",
    name: "Design",
    min: 2,
    mostLikely: 5,
    max: 9,
    confidenceLevel: "mediumConfidence",
    distributionType: "normal",
    status: "planned",
    ...over,
  };
}

interface LiveRowProps {
  pid: string;
  sid: string;
  heuristic?: boolean;
  onValidityChange?: (id: string, valid: boolean) => void;
  spyUpdate?: (id: string, updates: Partial<Activity>) => void;
}

/** Wired as ProjectPage -> UnifiedActivityGrid -> UnifiedActivityRow: the row reads the
 *  store and writes back to it, so a commit feeds itself the next render's props. */
function LiveRow({ pid, sid, heuristic, onValidityChange, spyUpdate }: LiveRowProps) {
  const projects = useProjectStore((s) => s.projects);
  const updateActivityField = useProjectStore((s) => s.updateActivityField);
  const activity = projects
    .find((p) => p.id === pid)!
    .scenarios.find((s) => s.id === sid)!.activities[0];
  if (!activity) return null;
  return (
    <UnifiedActivityRow
      key={activity.id}
      activity={activity}
      activityProbabilityTarget={0.5}
      onUpdate={(activityId, updates) => {
        spyUpdate?.(activityId, updates);
        updateActivityField(pid, sid, activityId, updates);
      }}
      onDelete={() => {}}
      onValidityChange={onValidityChange ?? (() => {})}
      heuristicEnabled={heuristic}
      heuristicMinPercent={75}
      heuristicMaxPercent={200}
    />
  );
}

/** A stand-in for "the scenario has results the user would lose". Typed, not cast: only
 *  its presence is asserted, but a cast here would hide a fixture that stopped being a
 *  SimulationRun at all — and then "the results survived" would be untestable. */
const SIM_MARKER: SimulationRun = {
  id: "sim-1",
  timestamp: "2026-09-05T00:00:00.000Z",
  trialCount: 1,
  seed: "seed",
  engineVersion: "1.1.1",
  percentiles: { 50: 5 },
  histogramBins: [],
  mean: 5,
  standardDeviation: 0,
  minSample: 5,
  maxSample: 5,
  samples: [5],
};

function withSimulationResults(pid: string, sid: string) {
  useProjectStore.setState((state) => ({
    projects: state.projects.map((p) =>
      p.id !== pid
        ? p
        : {
            ...p,
            scenarios: p.scenarios.map((sc) =>
              sc.id === sid ? { ...sc, simulationResults: SIM_MARKER } : sc,
            ),
          },
    ),
  }));
}

function seed(estimates: Pick<Activity, "min" | "mostLikely" | "max">) {
  localStorage.clear();
  useProjectStore.setState({ projects: [], undoStack: [], redoStack: [] });
  const s = useProjectStore.getState();
  const project = s.addProject("WI-2", null);
  const sid = project.scenarios[0]!.id;
  s.addActivity(project.id, sid, "Design");
  const aid = useProjectStore.getState().getProject(project.id)!.scenarios[0]!.activities[0]!.id;
  useProjectStore.getState().updateActivityField(project.id, sid, aid, estimates);
  // `addProject`/`addActivity` push frames of their own, so the counts below are taken
  // as deltas from a deliberately cleared stack rather than from an assumed zero.
  useProjectStore.setState({ undoStack: [], redoStack: [] });
  return { pid: project.id, sid, aid };
}

const stored = (pid: string, sid: string) => {
  const a = useProjectStore.getState().getProject(pid)!.scenarios.find((s) => s.id === sid)!
    .activities[0]!;
  return { min: a.min, ml: a.mostLikely, max: a.max };
};

const simResults = (pid: string, sid: string) =>
  useProjectStore.getState().getProject(pid)!.scenarios.find((s) => s.id === sid)!
    .simulationResults;

function minOnDisk(pid: string): number | undefined {
  for (const k of Object.keys(localStorage)) {
    const raw = localStorage.getItem(k);
    if (!raw?.includes(pid)) continue;
    try {
      const parsed: unknown = JSON.parse(raw);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      for (const proj of arr as { id?: string; scenarios?: { activities?: Activity[] }[] }[]) {
        if (proj?.id === pid) return proj.scenarios?.[0]?.activities?.[0]?.min;
      }
    } catch { /* not a project blob */ }
  }
  return undefined;
}

/** Look at a cell and look away again, typing nothing. The whole defect, as a gesture. */
function lookAndLookAway(field: string, id: string) {
  act(() => { cell(field, id).focus(); });
  act(() => { cell(field, id).blur(); });
}

/** Focus, type, blur — the ordinary edit, through the tracker-aware setter RTL uses. */
function typeInto(field: string, id: string, value: string) {
  const el = cell(field, id);
  act(() => { el.focus(); });
  fireEvent.change(el, { target: { value } });
  act(() => { el.blur(); });
}

describe("UnifiedActivityRow — a blur that changes nothing writes nothing", () => {
  beforeEach(() => { localStorage.clear(); });

  it("leaves a fractional stored estimate alone when the cell is only looked at", async () => {
    // ⚠️ THE HEADLINE GESTURE, AS ONE TEST. Several conjuncts on one look, because no
    // subset of them can fail at HEAD in the right direction. In particular, "the cell
    // shows the store" passes at HEAD *because the blur wrote the cell into the store*.
    const { pid, sid, aid } = seed({ min: 0.75, mostLikely: 1, max: 2 });
    render(<LiveRow pid={pid} sid={sid} />);

    // PREMISE, asserted rather than assumed: the store really is fractional and the cell
    // really is showing the rounded integer. Without this the test could pass on a
    // fixture that never had a fraction in it.
    expect({ store: stored(pid, sid).min, shows: cell("min", aid).value }).toEqual({
      store: 0.75,
      shows: "1",
    });

    // Drain the microtask-deferred emits queued by seeding, then prove the subscription
    // is live before asserting that nothing arrives on it.
    await act(async () => { await Promise.resolve(); });
    const events: string[] = [];
    const off = cloudSyncBus.subscribe((e) => events.push(`${e.type}:${e.projectId}`));
    act(() => {
      useProjectStore.getState().updateActivityField(pid, sid, aid, { max: 3 });
    });
    await act(async () => { await Promise.resolve(); });
    const control = [...events];
    events.length = 0;

    withSimulationResults(pid, sid);
    const frames = useProjectStore.getState().undoStack.length;
    const redos = useProjectStore.getState().redoStack.length;

    lookAndLookAway("min", aid);
    await act(async () => { await Promise.resolve(); });
    off();

    expect({
      control,
      storeMin: stored(pid, sid).min,
      onDisk: minOnDisk(pid),
      cellShows: cell("min", aid).value,
      newFrames: useProjectStore.getState().undoStack.length - frames,
      redosLost: redos - useProjectStore.getState().redoStack.length,
      simulationKept: simResults(pid, sid) !== undefined,
      cloudEmits: events,
    }).toEqual({
      control: [`save:${pid}`],
      storeMin: 0.75,
      onDisk: 0.75,
      cellShows: "1",
      newFrames: 0,
      redosLost: 0,
      simulationKept: true,
      cloudEmits: [],
    });
  });

  it("writes nothing when the user tabs through all three cells of a row", () => {
    // The row's main keyboard path with the heuristic off — one click and four Tab
    // presses — runs through exactly these three cells. Before v0.67.2 that wrote three
    // times and pushed three undo frames.
    const { pid, sid, aid } = seed({ min: 2, mostLikely: 5, max: 9 });
    render(<LiveRow pid={pid} sid={sid} />);
    const frames = useProjectStore.getState().undoStack.length;

    lookAndLookAway("min", aid);
    lookAndLookAway("ml", aid);
    lookAndLookAway("max", aid);

    expect({
      store: stored(pid, sid),
      newFrames: useProjectStore.getState().undoStack.length - frames,
    }).toEqual({ store: { min: 2, ml: 5, max: 9 }, newFrames: 0 });
  });

  it("does not re-apply a stale value across two look-and-look-away cycles", () => {
    // An external write lands while the cell is focused (undo, cloud echo, AI Connect, a
    // collaborator). Both cycles matter and only the second discriminates: a cell that
    // buffers from focus is clean on cycle one and commits the suppressed stale value on
    // cycle two, with the user still having typed nothing at all.
    const { pid, sid, aid } = seed({ min: 2, mostLikely: 5, max: 9 });
    render(<LiveRow pid={pid} sid={sid} />);

    act(() => { cell("ml", aid).focus(); });
    act(() => {
      useProjectStore.getState().updateActivityField(pid, sid, aid, { mostLikely: 13 });
    });
    const whileFocused = cell("ml", aid).value;
    act(() => { cell("ml", aid).blur(); });
    const afterCycleOne = stored(pid, sid).ml;

    lookAndLookAway("ml", aid);

    expect({
      whileFocused,
      afterCycleOne,
      afterCycleTwo: stored(pid, sid).ml,
      shows: cell("ml", aid).value,
    }).toEqual({ whileFocused: "13", afterCycleOne: 13, afterCycleTwo: 13, shows: "13" });
  });

  it("does not let a look at ML rewrite all three estimates when the heuristic is on", () => {
    // The amplification: one stale cell rewrote THREE stored fields. Opt-in — the
    // heuristic ships off — but the arithmetic is the app's own 75 % / 200 %.
    const { pid, sid, aid } = seed({ min: 5, mostLikely: 18, max: 20 });
    render(<LiveRow pid={pid} sid={sid} heuristic />);

    // The external write the cell must follow (an undo, in the app).
    act(() => {
      useProjectStore.getState().updateActivityField(pid, sid, aid, { mostLikely: 12 });
    });
    expect(cell("ml", aid).value).toBe("12");

    lookAndLookAway("ml", aid);

    expect(stored(pid, sid)).toEqual({ min: 5, ml: 12, max: 20 });
  });

  it("keeps the touched-field gate sequence that a blur-through produces", () => {
    // ⚠️ Constraint 5, and the reason the no-op guard sits at the store write rather than
    // in the cell. An all-equal activity starts with NO field marked touched, because
    // min <= mostLikely <= max cannot be judged until all three are known. A guard that
    // made the cell skip `onBlur` entirely would also skip the touch marking, and this
    // sequence would silently become [] — an invalid estimate that is never reported.
    const onValidityChange = vi.fn();
    const spyUpdate = vi.fn();
    const { pid, sid, aid } = seed({ min: 5, mostLikely: 5, max: 5 });
    render(<LiveRow pid={pid} sid={sid} onValidityChange={onValidityChange} spyUpdate={spyUpdate} />);

    typeInto("min", aid, "9"); // out of order: min > mostLikely
    typeInto("ml", aid, "5"); // re-typed, unchanged
    typeInto("max", aid, "5"); // re-typed, unchanged

    expect({
      validity: onValidityChange.mock.calls.map((c) => c[1]),
      writes: spyUpdate.mock.calls.map((c) => c[1]),
    }).toEqual({ validity: [false], writes: [{ min: 9 }] });
  });

  it("calls onUpdate exactly once per commit under StrictMode", () => {
    // M12. `handleBlur`'s plain-edit branch called the store from INSIDE a setState
    // updater, which React double-invokes in development — so every estimate edit pushed
    // two undo frames on the dev server and the first Cmd+Z looked like it did nothing.
    //
    // ⚠️ The edit has to CHANGE the value. Pinned with a no-op look instead, this reads 2
    // before the fix and 0 after — a number that moves for the wrong reason and says
    // nothing about the updater. `controlRuns` exercises the same mechanism (a state
    // updater) in the same tree; if it is not 2 the harness is not double-invoking and
    // the pin is vacuous.
    const onRun = vi.fn();
    function Control({ run }: { run: () => void }) {
      const [, setN] = useState(0);
      return (
        <button type="button" data-testid="strictmode-control" onClick={() => setN((n) => { run(); return n + 1; })}>
          control
        </button>
      );
    }

    const onUpdate = vi.fn();
    render(
      <StrictMode>
        <Control run={onRun} />
        <UnifiedActivityRow
          activity={makeActivity({ min: 10, mostLikely: 13, max: 20 })}
          activityProbabilityTarget={0.5}
          onUpdate={onUpdate}
          onDelete={vi.fn()}
          onValidityChange={vi.fn()}
        />
      </StrictMode>,
    );

    fireEvent.click(document.querySelector<HTMLButtonElement>("[data-testid='strictmode-control']")!);
    typeInto("min", "a1", "4");

    expect({ commits: onUpdate.mock.calls.length, controlRuns: onRun.mock.calls.length }).toEqual({
      commits: 1,
      controlRuns: 2,
    });
  });
});
