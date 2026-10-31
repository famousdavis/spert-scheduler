// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * WI-154 — the project page, on the project v0.80.0 wrote (`planned-dates-v26-fixture.ts`: Start Date
 * Mon 10/05, recorded starts, Delta not started). Today is pinned to Tue 10/27, 16 working days on.
 *  - The Run button sends the data date's offset (Review 35, verification G3).
 *  - Results simulated on an earlier data date are shown as not run, with one sentence, on the page
 *    and in print — and the store keeps them (owner, R639, decision 3: never write on read).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, within, act } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

vi.mock("@ui/hooks/use-ai-connectivity", () => ({
  useAiConnectivity: () => ({
    sessionState: { sessionActive: false, aiConnected: false },
    startSession: async () => true,
    stopSession: async () => {},
    changePermissions: () => {},
  }),
}));
vi.mock("@ui/providers/AuthProvider", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@ui/providers/StorageProvider", () => ({ useStorage: () => ({ mode: "local", storageReady: true }) }));
vi.mock("@app/api/simulation-service", () => ({ runSimulation: vi.fn(() => ({ cancel: vi.fn() })), runSimulationSync: vi.fn() }));

import { ProjectPage } from "@ui/pages/ProjectPage";
import { ConfirmHost } from "@ui/components/ConfirmHost";
import { runSimulation } from "@app/api/simulation-service";
import { useProjectStore } from "@ui/hooks/use-project-store";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";
import type { Project, SimulationRun } from "@domain/models/types";
import { PLANNED_DATES_V26_FIXTURE } from "./planned-dates-v26-fixture";

const PID = (JSON.parse(PLANNED_DATES_V26_FIXTURE) as Project).id;
const scn = () => useProjectStore.getState().projects.find((p) => p.id === PID)!.scenarios[0]!;
const STALE_SENTENCE =
  "The last simulation was run on 10/26/2026. Work that has not started is now scheduled no earlier than 10/27/2026, so run the simulation again to bring the forecast up to date.";

function load(simulatedOn?: [number, number]) {
  localStorage.clear();
  localStorage.setItem(`spert:project:local:${PID}`, PLANNED_DATES_V26_FIXTURE);
  localStorage.setItem("spert:project-index:local", JSON.stringify([PID]));
  useProjectStore.setState({ projects: [], loadError: false, loadErrors: [], undoStack: [], redoStack: [] });
  useProjectStore.getState().loadProjects();
  if (!simulatedOn) return;
  const run = {
    id: "r", timestamp: new Date(2026, simulatedOn[0] - 1, simulatedOn[1], 15, 0, 0).toISOString(), trialCount: 1000, seed: "s",
    engineVersion: "1.1.1", percentiles: { 50: 30, 95: 33 }, histogramBins: [], mean: 30.5, standardDeviation: 1.2,
    minSample: 29, maxSample: 34, samples: [30, 31],
  } as SimulationRun;
  useProjectStore.getState().setSimulationResults(PID, scn().id, run);
}
function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/project/${PID}`]}>
      <Routes><Route path="/project/:id" element={<ProjectPage />} /></Routes>
      <ConfirmHost />
    </MemoryRouter>,
  ).container;
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-10-27T12:00:00"), toFake: ["Date"] });
  usePreferencesStore.setState((st) => ({ preferences: { ...st.preferences, dateFormat: "MM/DD/YYYY", autoRunSimulation: false } }));
  vi.mocked(runSimulation).mockClear();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("the project page, with a data date", () => {
  it("the Run button sends the data date's offset: 16", () => {
    load();
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Run Simulation" }));
    expect(vi.mocked(runSimulation).mock.calls[0]![8]).toBe(16);
  });

  it("results simulated yesterday (Mon 10/26) are shown as not run, with the sentence, on the page and in print — and kept", () => {
    load([10, 26]);
    const c = renderPage();
    expect(screen.getAllByRole("status").filter((n) => n.textContent === STALE_SENTENCE)).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Export CSV" })).toBeNull(); // shown only with results
    const printed = c.querySelector(".print-report")!.textContent!;
    expect([printed.includes(`Simulation Results${STALE_SENTENCE}`), printed.includes("30.50 days")]).toEqual([true, false]);
    expect(scn().simulationResults?.mean).toBe(30.5); // never written on read
  });

  it("Review 35, E4/E5: Delta's window gives the page's words for its passed Must Start On, never \"Constraint date held\"", async () => {
    load();
    act(() => {
      useProjectStore.getState().updateActivityField(PID, scn().id, "d", { constraintType: "MSO", constraintDate: "2026-10-12", constraintMode: "hard" });
    });
    renderPage();
    let row: HTMLElement | null = screen.getByDisplayValue("Delta");
    while (row && !row.querySelector('select[aria-label="Activity status"]')) row = row.parentElement;
    fireEvent.click(within(row!).getByLabelText("Edit activity"));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Scheduling Constraint/ }));
    await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
    const text = screen.getByRole("dialog").textContent!;
    expect([
      text.includes("Delta: Must Start On 10/12/2026 has passed, and Delta has not started, so the schedule starts it today, 10/27/2026."),
      text.includes("Constraint date held"),
    ]).toEqual([true, false]);
  });

  it("results simulated today are shown as they are, with no sentence", () => {
    load([10, 27]);
    renderPage();
    expect(screen.getByRole("button", { name: "Export CSV" })).toBeTruthy();
    expect(screen.queryByText(STALE_SENTENCE)).toBeNull();
  });
});
