// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * The Compare table's Run at the PAGE (v0.75.0), on the REAL engine. Under jsdom the Worker cannot be
 * created, so `runSimulation` falls back to a synchronous run: a click completes its run inside the
 * click, and these tests never see "Running..." (the hook's own test does, over a mocked service).
 *
 * ⚠️ EVERY SCENARIO HERE CARRIES A 3/5/9 ACTIVITY. `createActivity`'s default 1/1/1 is a point mass:
 * every percentile is 1.0 whatever the trials or the seed, so a "same numbers" test built on it
 * passes even when the run ignores the scenario's own trial count. `createScenario` mints a fresh
 * seed for each scenario; the trial count is set low (the schema's minimum is 1,000) to keep it fast.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

const aiHook = vi.hoisted(() => ({
  sessionState: { sessionActive: false, aiConnected: false },
  startSession: vi.fn(async () => true),
  stopSession: vi.fn(async () => {}),
  changePermissions: vi.fn(),
}));
vi.mock("@ui/hooks/use-ai-connectivity", () => ({
  useAiConnectivity: () => aiHook,
}));
vi.mock("@ui/providers/AuthProvider", () => ({
  useAuth: vi.fn(() => ({ user: null })),
}));
vi.mock("@ui/providers/StorageProvider", () => ({
  useStorage: vi.fn(() => ({ mode: "local", storageReady: true })),
}));

import { ProjectPage } from "./ProjectPage";
import { useProjectStore } from "@ui/hooks/use-project-store";
import { useNotificationStore } from "@ui/hooks/use-notification-store";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";
import { createProject, createActivity, createScenario } from "@app/api/project-service";
import { DEFAULT_USER_PREFERENCES, type Activity, type Project, type Scenario } from "@domain/models/types";

const BASE = "Pelican Baseline";
const REBID = "Cormorant Rebid";

function scenarioOf(name: string): Scenario {
  const s = createScenario(name, "2026-04-06", { trialCount: 1000 });
  const task: Activity = { ...createActivity(`${name} task`, s.settings), min: 3, mostLikely: 5, max: 9 };
  return { ...s, activities: [task] };
}

/** Two unrun scenarios; the first is the one on screen when the page opens. */
function twoScenarios(): { p: Project; base: Scenario; rebid: Scenario } {
  const base = scenarioOf(BASE);
  const rebid = scenarioOf(REBID);
  return { p: { ...createProject("Gannet Breakwater", "2026-04-06"), scenarios: [base, rebid] }, base, rebid };
}

function renderPage(p: Project) {
  useProjectStore.setState({ projects: [p], loadError: false });
  return render(
    <MemoryRouter initialEntries={[`/project/${p.id}`]}>
      <Routes>
        <Route path="/project/:id" element={<ProjectPage />} />
      </Routes>
    </MemoryRouter>
  );
}

/** Compare on and both ticked. The scenario on screen is chosen by its tab, never by a tick. */
function compareBoth() {
  fireEvent.click(screen.getByRole("button", { name: "Compare" }));
  fireEvent.click(screen.getByRole("checkbox", { name: `Compare scenario ${BASE}` }));
  fireEvent.click(screen.getByRole("checkbox", { name: `Compare scenario ${REBID}` }));
}

/** The SCREEN Compare box — the always-mounted printed report carries a second comparison. */
function compareBox(): HTMLElement {
  const heading = screen
    .getAllByText("Scenario Comparison")
    .find((el) => el.tagName === "H3" && !el.closest(".print-report"));
  expect(heading).toBeDefined();
  return heading!.parentElement!.parentElement!;
}

/** A row's value cells in the SCREEN table, by its label. */
function rowValues(label: string): string[] {
  const row = Array.from(compareBox().querySelectorAll("tbody tr")).find(
    (tr) => tr.querySelector("td")?.textContent?.trim() === label
  );
  expect(row).toBeDefined();
  return Array.from(row!.querySelectorAll("td"))
    .slice(1)
    .map((td) => td.textContent?.trim() ?? "");
}

const runIn = (box: HTMLElement, name: string) => within(box).queryByRole("button", { name: `Run simulation for ${name}` });
const tab = (name: string) => screen.getByRole("button", { name });
const stored = (projectId: string, scenarioId: string) =>
  useProjectStore.getState().getProject(projectId)!.scenarios.find((s) => s.id === scenarioId)!;

function errorToasts(): string[] {
  return useNotificationStore
    .getState()
    .notifications.filter((n) => n.type === "error")
    .map((n) => n.message);
}

function cell(aid: string, field: "min" | "ml" | "max"): HTMLInputElement {
  return document.querySelector<HTMLInputElement>(`[data-row-id="${aid}"][data-field="${field}"]`)!;
}

beforeEach(() => {
  localStorage.clear();
  useProjectStore.setState({ projects: [], loadError: false, undoStack: [], redoStack: [] });
  useNotificationStore.setState({ notifications: [] });
  usePreferencesStore.setState({ preferences: { ...DEFAULT_USER_PREFERENCES } });
});

describe("a Run for each scenario in Compare (v0.75.0)", () => {
  it("runs the scenario where it is: its column fills, the tab on screen stays, focus is on its header, and the status says so", () => {
    const { p, rebid } = twoScenarios();
    renderPage(p);
    expect(tab(BASE)).toHaveAttribute("aria-current", "true");
    compareBoth();
    expect(rowValues("P50")).toEqual(["—", "—"]);

    fireEvent.click(runIn(compareBox(), REBID)!);

    const results = stored(p.id, rebid.id).simulationResults;
    expect(results).toBeDefined();
    expect(rowValues("P50")).toEqual(["—", results!.percentiles[50]!.toFixed(1)]);
    expect(tab(BASE)).toHaveAttribute("aria-current", "true");
    expect(tab(REBID)).not.toHaveAttribute("aria-current");
    const box = compareBox();
    expect(document.activeElement).toBe(within(box).getByRole("columnheader", { name: REBID }));
    expect(within(box).getByRole("status").textContent).toBe(`Simulation finished for ${REBID}.`);
    // Its Run is gone; the other scenario's is still offered.
    expect(runIn(box, REBID)).toBeNull();
    expect(runIn(box, BASE)).not.toBeNull();
  });

  it("gives the numbers the scenario's own Run Simulation gives: its trials and its seed", () => {
    const { p, base, rebid } = twoScenarios();
    renderPage(p);
    compareBoth();
    fireEvent.click(runIn(compareBox(), REBID)!);
    fireEvent.click(runIn(compareBox(), BASE)!); // the scenario on screen, from Compare too
    const rebidFromCompare = stored(p.id, rebid.id).simulationResults!;
    // The control: two seeds give two sets of numbers, so "identical" below is a claim that can fail.
    expect(rebidFromCompare.percentiles).not.toEqual(stored(p.id, base.id).simulationResults!.percentiles);

    fireEvent.click(tab(REBID));
    fireEvent.click(screen.getByRole("button", { name: "Run Simulation" }));
    const rebidFromPanel = stored(p.id, rebid.id).simulationResults!;
    expect(rebidFromPanel).not.toBe(rebidFromCompare); // a second run landed
    expect(rebidFromPanel.percentiles).toEqual(rebidFromCompare.percentiles);
  });

  it("the LIVE gate: a cell the press's blur refuses stops the on-screen scenario's Run in the still-held row", async () => {
    const { p, base } = twoScenarios();
    renderPage(p);
    compareBoth();
    const aid = base.activities[0]!.id;
    act(() => cell(aid, "min").focus());
    fireEvent.change(cell(aid, "min"), { target: { value: "-5" } });

    fireEvent.pointerDown(window);
    act(() => cell(aid, "min").blur()); // the press's blur refuses the entry
    expect(cell(aid, "min")).toHaveAttribute("aria-invalid", "true");
    const heldRun = runIn(compareBox(), BASE);
    expect(heldRun).not.toBeNull(); // painted from the pre-press gate
    fireEvent.click(heldRun!);
    expect(errorToasts()).toEqual([
      `Simulation not run. Fix this activity first: ${BASE} task (Min: Enter 0 or more.).`,
    ]);
    expect(stored(p.id, base.id).simulationResults).toBeUndefined();

    fireEvent.pointerUp(window);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(runIn(compareBox(), BASE)).toBeNull();
    expect(runIn(compareBox(), REBID)).not.toBeNull(); // the other scenario's Run stands
  });
});
