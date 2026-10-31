// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * WI-137 release 2 — the three paths the schedule's progress notes travel from the project page,
 * each pinned by a test that goes red when its line is removed (DESIGN §8.3; Review 33, G1):
 * ProjectPage → GanttSection (the screen Gantt's dashed arrow), PrintableReport → PrintGanttChart
 * (the printed Gantt's), and PrintableReport's own Progress Notes section. On the project v0.80.0
 * wrote (`planned-dates-v26-fixture.ts`): Bravo started on 10-19, before Alpha finished on 10-23,
 * so the one note is that link's, Alpha → Bravo. Today is pinned to Tue 2026-10-27.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render } from "@testing-library/react";
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

import { ProjectPage } from "@ui/pages/ProjectPage";
import { useProjectStore } from "@ui/hooks/use-project-store";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";
import type { Project } from "@domain/models/types";
import { PLANNED_DATES_V26_FIXTURE } from "./planned-dates-v26-fixture";

const PID = (JSON.parse(PLANNED_DATES_V26_FIXTURE) as Project).id;

function renderPage(): HTMLElement {
  localStorage.clear();
  localStorage.setItem(`spert:project:local:${PID}`, PLANNED_DATES_V26_FIXTURE);
  localStorage.setItem("spert:project-index:local", JSON.stringify([PID]));
  useProjectStore.setState({ projects: [], loadError: false, loadErrors: [], undoStack: [], redoStack: [] });
  useProjectStore.getState().loadProjects();
  return render(
    <MemoryRouter initialEntries={[`/project/${PID}`]}>
      <Routes><Route path="/project/:id" element={<ProjectPage />} /></Routes>
    </MemoryRouter>,
  ).container;
}
/** The dashes of the dependency arrows drawn on screen, and in the printed report. */
const dashes = (paths: Element[]) => paths.map((p) => p.getAttribute("stroke-dasharray")).filter((d) => d !== null);
const screenArrows = (c: HTMLElement) => Array.from(c.querySelectorAll("path[marker-end]")).filter((p) => !p.closest(".print-report"));
const printArrows = (c: HTMLElement) => Array.from(c.querySelectorAll(".print-report path[marker-end]"));

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-10-27T12:00:00"), toFake: ["Date"] });
  usePreferencesStore.setState((st) => ({ preferences: { ...st.preferences, dateFormat: "MM/DD/YYYY", autoRunSimulation: false } }));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("the progress notes reach each place that shows them", () => {
  it("ProjectPage → GanttSection: the screen Gantt draws the overtaken link dashed, with its legend entry", () => {
    const c = renderPage();
    expect(screenArrows(c).length).toBe(5);
    expect(dashes(screenArrows(c))).toEqual(["5 3"]);
    const legend = Array.from(c.querySelectorAll("span")).filter((s) => s.textContent === "Link overtaken by an actual date");
    expect(legend.filter((s) => !s.closest(".print-report")).length).toBeGreaterThan(0); // the screen legend's entry
  });

  it("PrintableReport → PrintGanttChart: the printed Gantt draws it dashed too", () => {
    const c = renderPage();
    expect(printArrows(c).length).toBe(5);
    expect(dashes(printArrows(c))).toEqual(["3 2"]);
  });

  it("PrintableReport places the Progress Notes section, with the note's sentence", () => {
    const c = renderPage();
    const report = c.querySelector(".print-report")!;
    const headings = Array.from(report.querySelectorAll("h2")).map((h) => h.textContent?.trim());
    expect(headings).toContain("Progress Notes (1)");
    expect(report.textContent).toContain("Bravo started on 10/19/2026, before Alpha finished on 10/23/2026. The schedule keeps the start you recorded.");
  });
});
