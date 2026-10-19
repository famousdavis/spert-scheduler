// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * WI-124 on the page (owner ruling, 2026-10-16): each scenario keeps its own Finish Target date, and every surface
 * that shows it follows the ACTIVE scenario — the summary card's date and its colour, the Gantt's line, the printed
 * summary's row and the printed Gantt's line. Whether the Gantt shows the date stays one choice for the project.
 *
 * Every date here is set the way a user sets it, through the summary card's date field, so these tests run the same
 * on a build where the date belonged to the project — and there they fail, at the assertion that reads another
 * scenario's date.
 *
 * WHERE A LINE IS DRAWN is read against a marker known to sit at that date: each scenario carries a milestone dated on
 * the Finish Target it will be given, and the line must stand exactly where that milestone stands, on screen and in
 * print. No expected position is computed here.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

const aiHook = vi.hoisted(() => ({
  sessionState: { sessionActive: false, aiConnected: false },
  startSession: vi.fn(async () => true),
  stopSession: vi.fn(async () => {}),
  changePermissions: vi.fn(),
}));
vi.mock("@ui/hooks/use-ai-connectivity", () => ({ useAiConnectivity: () => aiHook }));
vi.mock("@ui/providers/AuthProvider", () => ({ useAuth: vi.fn(() => ({ user: null })) }));
vi.mock("@ui/providers/StorageProvider", () => ({ useStorage: vi.fn(() => ({ mode: "local", storageReady: true })) }));
vi.mock("@infrastructure/firebase/firebase", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@infrastructure/firebase/firebase")>();
  return { ...actual, isFirebaseAvailable: false };
});

import { ProjectPage } from "./ProjectPage";
import { useProjectStore } from "@ui/hooks/use-project-store";
import { createActivity, createProject, createScenario, addActivityToScenario } from "@app/api/project-service";
import { addMilestone } from "@app/api/milestone-service";
import { runSimulationSync } from "@app/api/simulation-service";
import { serializeExport, validateImport } from "@app/api/export-import-service";
import { buildSimulationParams } from "@ui/helpers/build-simulation-params";
import type { Project, Scenario } from "@domain/models/types";

const PROJECT = "Quillwort Depot Upgrade";
const A = "Marram Plan";
const B = "Sedge Plan";
const START = "2026-11-02";
/** Well after either plan's 80th-percentile finish: green. */
const LATE = "2027-02-26";
/** Before either plan can finish: red. */
const EARLY = "2026-11-10";
const LATE_SHOWN = "02/26/2027";
const EARLY_SHOWN = "11/10/2026";

/** A plan of three activities, a run, and a milestone dated where its Finish Target will be. */
function plan(name: string, anchorName: string, anchorDate: string): Scenario {
  let s = createScenario(name, START);
  for (const [label, min, ml, max] of [["survey", 3, 5, 10], ["build", 4, 6, 12], ["test", 2, 4, 8]] as const) {
    s = addActivityToScenario(s, { ...createActivity(`${name} ${label}`, s.settings), min, mostLikely: ml, max, distributionType: "triangular" });
  }
  s = addMilestone(s, anchorName, anchorDate, `ms-${anchorName.replaceAll(" ", "-")}`);
  const params = buildSimulationParams(
    s.activities, false, s.settings.probabilityTarget, s.dependencies, s.milestones, s.startDate, undefined, true,
  );
  const run = runSimulationSync(s.activities, 2000, `${name}-seed`, params.deterministicDurations, params.dependencyParams, params.sequentialConstraints);
  return { ...s, simulationResults: { ...run, id: `run-${name}` } };
}

function twoPlans(): Project {
  const p = createProject(PROJECT, START);
  return { ...p, scenarios: [plan(A, "Marram Anchor", LATE), plan(B, "Sedge Anchor", EARLY)] };
}

function renderPage(project: Project) {
  useProjectStore.setState({ projects: [project], loadError: false, loadErrors: [], undoStack: [], redoStack: [] });
  return renderRoute(project.id);
}

function renderRoute(projectId: string) {
  return render(
    <MemoryRouter initialEntries={[`/project/${projectId}`]}>
      <Routes>
        <Route path="/project/:id" element={<ProjectPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const card = () => document.querySelector('input[name="targetFinishDate"]') as HTMLInputElement;
const setDate = (value: string) => fireEvent.change(card(), { target: { value } });
const box = () => document.querySelector('input[name="ganttShowTargetDate"]') as HTMLInputElement;
const switchTo = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
const screenGantt = () => document.querySelector('svg[data-gantt-chart="interactive"]');
const printGantt = () => document.querySelector('svg[data-gantt-chart="print"]');

/** The summary card's colour: the one token of the date's text colour, by name. */
function cardColour(): string {
  const tokens = card().className.split(/\s+/);
  const named: Record<string, string> = {
    "text-green-700": "green",
    "text-amber-700": "amber",
    "text-red-600": "red",
    "text-blue-700": "no run",
    "text-gray-500": "no date",
  };
  return tokens.filter((t) => t in named).map((t) => named[t]).join(" ") || "none";
}

/** The x of the text that reads exactly `text` in a chart, or null. */
function xOfText(svg: Element | null, text: string): string | null {
  const found = [...(svg?.querySelectorAll("text") ?? [])].find((t) => t.textContent === text);
  return found?.getAttribute("x") ?? null;
}

/** The Finish Target line's label — "Target" — and its x; null when no line is drawn. */
const lineX = (svg: Element | null) => xOfText(svg, "Target");

/** The line stands exactly where the milestone named `anchor` stands — and that milestone is drawn. */
function expectLineAt(svg: Element | null, anchor: string): void {
  const at = xOfText(svg, anchor);
  expect(at, `${anchor} is drawn`).not.toBeNull();
  expect(lineX(svg), `the Finish Target line at ${anchor}`).toBe(at);
}

/** The chart is drawn, without a Finish Target line. */
function expectNoLine(svg: Element | null): void {
  expect(svg, "the chart is drawn").not.toBeNull();
  expect(lineX(svg), "no Finish Target line").toBeNull();
}

/** The dash the line is drawn with: the chart's RAG pattern. */
function lineDash(svg: Element | null): string | null {
  const label = [...(svg?.querySelectorAll("text") ?? [])].find((t) => t.textContent === "Target");
  return label?.previousElementSibling?.getAttribute("stroke-dasharray") ?? null;
}

/** The printed summary's Finish Target row. */
function printedRow(): string | null {
  const cells = [...document.querySelectorAll(".print-report td")];
  return cells.find((c) => c.textContent === "Finish Target:")?.nextElementSibling?.textContent ?? null;
}

const scenarioIn = (projectId: string, name: string): Scenario =>
  useProjectStore.getState().projects.find((p) => p.id === projectId)!.scenarios.find((s) => s.name === name)!;

beforeEach(() => {
  localStorage.clear();
  useProjectStore.setState({ projects: [], loadError: false, loadErrors: [], undoStack: [], redoStack: [] });
});

afterEach(() => {
  cleanup();
});

describe("each scenario's own Finish Target date", () => {
  it("keeps its own through a switch between scenarios", () => {
    renderPage(twoPlans());
    setDate(LATE);
    switchTo(B);
    expect(card().value).toBe("");
    setDate(EARLY);
    switchTo(A);
    expect(card().value).toBe(LATE);
    switchTo(B);
    expect(card().value).toBe(EARLY);
  });

  it("keeps its own through a reload of the page", () => {
    const project = twoPlans();
    renderPage(project);
    setDate(LATE);
    switchTo(B);
    setDate(EARLY);
    cleanup();
    useProjectStore.setState({ projects: [] });
    renderRoute(project.id);
    expect(card().value).toBe(EARLY);
    switchTo(A);
    expect(card().value).toBe(LATE);
  });

  it("keeps its own through an export and an import", () => {
    const project = twoPlans();
    renderPage(project);
    setDate(LATE);
    switchTo(B);
    setDate(EARLY);
    const exported = serializeExport(useProjectStore.getState().projects);
    const imported = validateImport(exported, []);
    expect(imported.success).toBe(true);
    if (!imported.success) return;
    const dates = imported.projects[0]!.scenarios.map((s) => (s as unknown as Record<string, unknown>).targetFinishDate);
    expect(dates).toEqual([LATE, EARLY]);
  });
});

describe("every surface follows the active scenario", () => {
  it("the card's date and colour, the Gantt's line, the printed row and the printed Gantt's line", () => {
    renderPage(twoPlans());
    setDate(EARLY);
    expect(cardColour()).toBe("red");
    setDate(LATE); // the same scenario, the same run: the colour must follow the new date
    expect(cardColour()).toBe("green");
    fireEvent.click(box());
    expectLineAt(screenGantt(), "Marram Anchor");
    expect(lineDash(screenGantt())).toBe("8 4");
    expect(printedRow()).toBe(LATE_SHOWN);
    expectLineAt(printGantt(), "Marram Anchor");

    switchTo(B);
    setDate(EARLY);
    expect(card().value).toBe(EARLY);
    expect(cardColour()).toBe("red");
    expectLineAt(screenGantt(), "Sedge Anchor");
    expect(lineDash(screenGantt())).toBe("2 3");
    expect(printedRow()).toBe(EARLY_SHOWN);
    expectLineAt(printGantt(), "Sedge Anchor");

    switchTo(A);
    expect(card().value).toBe(LATE);
    expect(cardColour()).toBe("green");
    expectLineAt(screenGantt(), "Marram Anchor");
    expect(printedRow()).toBe(LATE_SHOWN);
    expectLineAt(printGantt(), "Marram Anchor");
  });

  it("control: setting a date keeps the scenario's run", () => {
    const project = twoPlans();
    renderPage(project);
    setDate(LATE);
    expect(scenarioIn(project.id, A).simulationResults?.id).toBe(`run-${A}`);
    expect(cardColour()).toBe("green");
  });
});

describe("the Gantt's Finish Target box: one choice for the project", () => {
  // ⚠️ Read that the box is ENABLED where the scenario has a date: in this test environment a click toggles even a
  // disabled checkbox, so the choice and the line can come out right while a user could not check the box at all.
  it("is unchecked and disabled in a scenario with no date, while the project's choice is on", () => {
    renderPage(twoPlans());
    setDate(LATE);
    expect(box().disabled).toBe(false);
    fireEvent.click(box());
    expect(box().checked).toBe(true);
    switchTo(B);
    expect(box().disabled).toBe(true);
    expect(box().checked).toBe(false);
    expectNoLine(screenGantt());
    expectNoLine(printGantt());
    switchTo(A);
    expect(box().disabled).toBe(false);
    expect(box().checked).toBe(true);
    expect(lineX(screenGantt())).not.toBeNull();
  });

  it("stays on when one scenario's date is cleared and another's is left; off when the last is cleared (owner ruling, 2026-10-18)", () => {
    renderPage(twoPlans());
    setDate(LATE);
    fireEvent.click(box());
    switchTo(B);
    setDate(EARLY);
    setDate("");
    switchTo(A);
    expect(box().checked).toBe(true);
    expectLineAt(screenGantt(), "Marram Anchor");

    setDate("");
    setDate(LATE);
    expect(box().checked).toBe(false);
    expectNoLine(screenGantt());
  });

  it("where the scenario has no date, its tooltip says to set that scenario's date in the summary card — or to unlock a locked scenario first", () => {
    const project = twoPlans();
    renderPage({ ...project, scenarios: [project.scenarios[0]!, { ...project.scenarios[1]!, locked: true }] });
    const tooltip = () => box().closest("label")!.getAttribute("title");
    expect(tooltip(), "no date").toBe("Set this scenario’s Finish Target date in the summary card to enable this option");
    setDate(LATE);
    expect(tooltip(), "a date").toBeNull();
    switchTo(B);
    expect(card().disabled, "the locked scenario's own date field is greyed").toBe(true);
    expect(tooltip(), "no date, locked").toBe("Unlock this scenario to set its Finish Target date and enable this option");
    switchTo(A);
    const tab = screen.getByRole("button", { name: A }).parentElement!;
    fireEvent.click(within(tab).getByRole("button", { name: "Lock scenario" }));
    expect(card().disabled, "now locked").toBe(true);
    expect(tooltip(), "a date, locked").toBeNull();
  });

  it("control: a project of one scenario, as before — clearing the date turns the choice off, setting it again does not turn it on", () => {
    const p = createProject(PROJECT, START);
    renderPage({ ...p, scenarios: [plan(A, "Marram Anchor", LATE)] });
    setDate(LATE);
    expect(box().disabled).toBe(false);
    fireEvent.click(box());
    expect(lineX(screenGantt())).not.toBeNull();
    setDate("");
    expect(box().checked).toBe(false);
    expect(box().disabled).toBe(true);
    setDate(LATE);
    expect(box().disabled).toBe(false);
    expect(box().checked).toBe(false);
    expectNoLine(screenGantt());
  });
});

describe("a locked scenario, and undo", () => {
  it("control: a locked scenario's date field is disabled", () => {
    const project = twoPlans();
    renderPage({ ...project, scenarios: [{ ...project.scenarios[0]!, locked: true }, project.scenarios[1]!] });
    expect(card().disabled).toBe(true);
  });

  it("a date set in another scenario leaves the locked scenario's own", () => {
    const project = twoPlans();
    renderPage(project);
    setDate(LATE);
    const tab = screen.getByRole("button", { name: A }).parentElement!;
    fireEvent.click(within(tab).getByRole("button", { name: "Lock scenario" }));
    expect(card().disabled).toBe(true);
    switchTo(B);
    setDate(EARLY);
    switchTo(A);
    expect(card().value).toBe(LATE);
  });

  it("Ctrl+Z restores the scenario's previous date and leaves the other's; Ctrl+Shift+Z puts it back", () => {
    renderPage(twoPlans());
    setDate(LATE);
    switchTo(B);
    setDate(EARLY);
    switchTo(A);
    setDate("2027-03-31");
    fireEvent.keyDown(document, { key: "z", ctrlKey: true });
    expect(card().value).toBe(LATE);
    switchTo(B);
    expect(card().value).toBe(EARLY);
    switchTo(A);
    fireEvent.keyDown(document, { key: "z", ctrlKey: true, shiftKey: true });
    expect(card().value).toBe("2027-03-31");
  });
});
