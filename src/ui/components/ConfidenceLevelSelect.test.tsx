// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * The grid's Confidence dropdown opens on the row's current level.
 *
 * It used to open with the TOP level, "Near certainty", highlighted whatever the button showed:
 * opening reset the highlight to index 0, and so did every change of the filter. The current
 * level only got a paler "selected" tint, and from Medium down it sat below the fold of the list.
 *
 * ⚠️ The highlight has no ARIA state — a class is the only thing that shows it. `highlighted()`
 * reads that class and asserts EXACTLY ONE option carries it, so a restyle fails loudly here
 * instead of matching nothing.
 *
 * ⚠️ jsdom has no layout, so "fully visible" cannot be measured here; that was measured in a
 * browser. What is pinned is the wiring: every open asks for the highlighted option to be scrolled
 * into view — including a second open that starts on the index the last one closed on, which is
 * exactly the open that asks for nothing if the scroll is keyed on the highlight alone.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { ConfidenceLevelSelect } from "./ConfidenceLevelSelect";
import { UnifiedActivityRow } from "./UnifiedActivityRow";
import { RSM_LABELS } from "@domain/models/types";
import type { RSMLevel, SimulationRun } from "@domain/models/types";
import { useProjectStore } from "@ui/hooks/use-project-store";
import { cloudSyncBus } from "@infrastructure/persistence/sync-bus";
import { scrollIntoViewCallLog } from "../../test-stubs";

const FILTER_NAME = "Filter confidence levels";

const trigger = () => document.querySelector<HTMLButtonElement>('[data-field="confidence"]')!;
const filterInput = () => screen.getByRole("textbox", { name: FILTER_NAME });
const isOpen = () => screen.queryByRole("textbox", { name: FILTER_NAME }) !== null;
const optionButtons = () =>
  Array.from(filterInput().closest("div.fixed")!.querySelectorAll<HTMLButtonElement>("button"));
const labelOf = (option: HTMLElement) => option.querySelector("p")!.textContent;
const optionNamed = (label: string) => optionButtons().find((b) => labelOf(b) === label)!;

/** The option Enter would choose. Exactly one, or the read itself fails (see the header). */
function highlighted(): HTMLButtonElement {
  const hits = optionButtons().filter((b) => b.classList.contains("text-blue-700"));
  expect(hits).toHaveLength(1);
  return hits[0]!;
}

const clickTrigger = () => fireEvent.click(trigger());
const press = (key: string) => fireEvent.keyDown(filterInput(), { key });
const typeFilter = (text: string) => fireEvent.change(filterInput(), { target: { value: text } });

function renderSelect(value: RSMLevel) {
  const onChange = vi.fn<(level: RSMLevel) => void>();
  render(<ConfidenceLevelSelect value={value} onChange={onChange} data-field="confidence" />);
  return onChange;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("the Confidence dropdown opens on the row's current level", () => {
  it.each([
    ["nearCertainty", 0],
    ["mediumConfidence", 4],
    ["lowConfidence", 6],
    ["guesstimate", 9],
  ] as const)("opens %s highlighted at index %i, unfiltered, and scrolls it into view", (level, index) => {
    renderSelect(level);
    const mark = scrollIntoViewCallLog().length;
    clickTrigger();

    const option = highlighted();
    expect(labelOf(option)).toBe(RSM_LABELS[level]);
    expect(optionButtons().indexOf(option)).toBe(index);
    expect(filterInput()).toHaveValue("");

    const last = scrollIntoViewCallLog().slice(mark).at(-1);
    expect(last?.element).toBe(option);
    expect(last?.options).toEqual({ block: "nearest" });
  });

  it("moves the arrow keys from the current level, not from the top", () => {
    renderSelect("mediumConfidence");
    clickTrigger();

    press("ArrowDown");
    expect(labelOf(highlighted())).toBe("Medium-low");
    press("ArrowUp");
    press("ArrowUp");
    expect(labelOf(highlighted())).toBe("Medium-high");
  });

  it("keeps the current level highlighted while the filter still matches it", () => {
    renderSelect("mediumConfidence");
    clickTrigger();
    typeFilter("med");

    // Premise: Medium is in the narrowed list and NOT first, so a reset to the first match fails.
    expect(optionButtons().map(labelOf)).toEqual(["Medium-high", "Medium", "Medium-low"]);
    expect(labelOf(highlighted())).toBe("Medium");
  });

  it("highlights the first match when the filter excludes the current level", () => {
    renderSelect("mediumConfidence");
    clickTrigger();
    typeFilter("low");

    expect(optionButtons().map(labelOf)).toEqual(["Medium-low", "Low", "Very low", "Extremely low"]);
    expect(labelOf(highlighted())).toBe("Medium-low");
  });

  it("goes back to the current level when the filter is cleared", () => {
    renderSelect("mediumConfidence");
    clickTrigger();
    typeFilter("low");
    typeFilter("");

    expect(optionButtons()).toHaveLength(10);
    expect(labelOf(highlighted())).toBe("Medium");
  });

  it("reopens on the current level, unfiltered, after closing while filtered", () => {
    // The filter outlives a close — the component stays mounted, only the list unmounts — so
    // reopening CHANGES the filter back to empty. Anything that re-zeroes the highlight on a
    // filter change then lands after the open and puts it back on "Near certainty".
    renderSelect("mediumConfidence");
    clickTrigger();
    typeFilter("low");
    press("Escape");
    expect(isOpen()).toBe(false);

    clickTrigger();
    expect(filterInput()).toHaveValue("");
    expect(labelOf(highlighted())).toBe("Medium");
  });

  it("gives the highlighted level's description the darker grey its blue tint needs", () => {
    // Contrast itself was measured in a browser (jsdom computes no colour): the lighter grey is
    // under 4.5:1 on the highlight's tint. This pins which row gets which grey.
    renderSelect("mediumConfidence");
    clickTrigger();
    const description = (option: HTMLElement) => option.querySelectorAll("p")[1]!;
    const option = highlighted();

    expect(description(option)).toHaveClass("text-gray-600");
    const others = optionButtons().filter((b) => b !== option);
    expect(others).toHaveLength(9);
    for (const other of others) expect(description(other)).toHaveClass("text-gray-500");
  });

  it("scrolls the highlight into view again on a second open that starts on the same index", () => {
    // Guesstimate is the last level, the one furthest below the fold. Closing leaves the
    // highlight on it, so the second open sets the SAME index: the list is new and starts at the
    // top, and only the open itself can ask for the scroll.
    renderSelect("guesstimate");
    clickTrigger();
    press("Escape");

    const mark = scrollIntoViewCallLog().length;
    clickTrigger();
    const option = highlighted();
    expect(labelOf(option)).toBe("Guesstimate");
    expect(scrollIntoViewCallLog().slice(mark).at(-1)?.element).toBe(option);
  });
});

// ---------------------------------------------------------------------------
// Choosing the level a row already has: in the grid, against the real store
// ---------------------------------------------------------------------------

/** Typed, not cast: only its presence is asserted, and a cast would hide a fixture that had
 *  stopped being a SimulationRun — "the results survived" would then prove nothing. */
const SIM_MARKER: SimulationRun = {
  id: "sim-1",
  timestamp: "2026-09-19T00:00:00.000Z",
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

/** Wired as ProjectPage -> UnifiedActivityGrid -> UnifiedActivityRow, so the row re-renders
 *  from whatever the store now holds. */
function LiveRow({ pid, sid }: { pid: string; sid: string }) {
  const projects = useProjectStore((s) => s.projects);
  const updateActivityField = useProjectStore((s) => s.updateActivityField);
  const activity = projects.find((p) => p.id === pid)!.scenarios.find((s) => s.id === sid)!
    .activities[0];
  if (!activity) return null;
  return (
    <UnifiedActivityRow
      activity={activity}
      activityProbabilityTarget={0.5}
      onUpdate={(activityId, updates) => updateActivityField(pid, sid, activityId, updates)}
      onDelete={() => {}}
      onValidityChange={() => {}}
    />
  );
}

/** One T-Normal activity with a range — so Confidence applies — at Medium, with results. */
function seed() {
  localStorage.clear();
  useProjectStore.setState({ projects: [], undoStack: [], redoStack: [] });
  const project = useProjectStore.getState().addProject("Confidence", null);
  const sid = project.scenarios[0]!.id;
  useProjectStore.getState().addActivity(project.id, sid, "Design");
  const aid = useProjectStore.getState().getProject(project.id)!.scenarios[0]!.activities[0]!.id;
  useProjectStore.getState().updateActivityField(project.id, sid, aid, {
    min: 2,
    mostLikely: 5,
    max: 9,
    distributionType: "normal",
    confidenceLevel: "mediumConfidence",
  });
  useProjectStore.setState((state) => ({
    projects: state.projects.map((p) =>
      p.id !== project.id
        ? p
        : {
            ...p,
            scenarios: p.scenarios.map((sc) =>
              sc.id === sid ? { ...sc, simulationResults: SIM_MARKER } : sc,
            ),
          },
    ),
    // Seeding pushed frames of its own; the counts below are deltas from a cleared stack.
    undoStack: [],
    redoStack: [],
  }));
  return { pid: project.id, sid };
}

function scenario(pid: string, sid: string) {
  return useProjectStore.getState().getProject(pid)!.scenarios.find((s) => s.id === sid)!;
}

/** Everything a write leaves behind: the level, the results, an undo frame, a save. */
async function watchWrites(pid: string, sid: string) {
  // Drain the saves seeding queued (they are deferred to a microtask) before listening.
  await act(async () => { await Promise.resolve(); });
  const saves: string[] = [];
  const off = cloudSyncBus.subscribe((e) => saves.push(`${e.type}:${e.projectId}`));
  const setItem = vi.spyOn(Storage.prototype, "setItem");
  return async () => {
    await act(async () => { await Promise.resolve(); });
    off();
    return {
      level: scenario(pid, sid).activities[0]!.confidenceLevel,
      resultsKept: scenario(pid, sid).simulationResults === SIM_MARKER,
      undoFrames: useProjectStore.getState().undoStack.length,
      cloudSaves: saves.length,
      diskWrites: setItem.mock.calls.filter(([key]) => String(key).includes(pid)).length,
    };
  };
}

describe("choosing the level a row already has writes nothing", () => {
  beforeEach(() => { localStorage.clear(); });

  it("open then Enter, and a click on the current level, leave the scenario exactly as it was", async () => {
    const { pid, sid } = seed();
    render(<LiveRow pid={pid} sid={sid} />);
    const read = await watchWrites(pid, sid);

    clickTrigger();
    expect(labelOf(highlighted())).toBe("Medium");
    press("Enter");
    expect(isOpen()).toBe(false);
    expect(document.activeElement).toBe(trigger());

    clickTrigger();
    fireEvent.click(optionNamed("Medium"));
    expect(isOpen()).toBe(false);

    expect(await read()).toEqual({
      level: "mediumConfidence",
      resultsKept: true,
      undoFrames: 0,
      cloudSaves: 0,
      diskWrites: 0,
    });
  });

  it("still writes a different level: it clears the results and can be undone, as before", async () => {
    // Also the control for the test above: the same instruments, on a gesture that DOES write,
    // so their zeros there cannot come from instruments that see nothing.
    const { pid, sid } = seed();
    render(<LiveRow pid={pid} sid={sid} />);
    const read = await watchWrites(pid, sid);

    clickTrigger();
    fireEvent.click(optionNamed("Low"));

    expect(await read()).toEqual({
      level: "lowConfidence",
      resultsKept: false,
      undoFrames: 1,
      cloudSaves: 1,
      diskWrites: 1,
    });

    act(() => { useProjectStore.getState().undo(); });
    expect(scenario(pid, sid).activities[0]!.confidenceLevel).toBe("mediumConfidence");
  });
});
