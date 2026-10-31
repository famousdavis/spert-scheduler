// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * WI-137 release 2 — PATH PARITY for the Planned pair (owner, R630 ruling 5a): the edits made in
 * the same step — one Edit Activity window visit, in either order, or one bulk Apply — are part of
 * the plan a row keeps when it leaves Planned. So the window and the bulk toolbar keep the pair the
 * grid's Status cell keeps after the same edits were committed first. Driven through the real
 * ProjectPage, on the project v0.80.0 wrote (`planned-dates-v26-fixture.ts`). Today is pinned to Tue
 * 2026-10-27. Every expected date is written out here — counted on the calendar from each row's
 * estimate at P50 — never computed by the code under test.
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

import { ProjectPage } from "@ui/pages/ProjectPage";
import { ConfirmHost } from "@ui/components/ConfirmHost";
import { useConfirmStore } from "@ui/hooks/use-confirm-store";
import { useProjectStore } from "@ui/hooks/use-project-store";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";
import { useNotificationStore } from "@ui/hooks/use-notification-store";
import type { Activity, Project } from "@domain/models/types";
import { PLANNED_DATES_V26_FIXTURE } from "./planned-dates-v26-fixture";

const PID = (JSON.parse(PLANNED_DATES_V26_FIXTURE) as Project).id;
const NAMES: Record<string, string> = { a: "Alpha", b: "Bravo", l: "Lima", k: "Kilo", c: "Charlie", d: "Delta", e: "Echo", f: "Foxtrot" };

const scn = () => useProjectStore.getState().projects.find((p) => p.id === PID)!.scenarios[0]!;
const stored = (id: string): Activity => scn().activities.find((a) => a.id === id)!;
const pairOf = (id: string) => [stored(id).plannedStartDate, stored(id).plannedFinishDate];
const actualsOf = (id: string) => [stored(id).actualStartDate, stored(id).actualFinishDate];

function rowOf(id: string): HTMLElement {
  let el: HTMLElement | null = screen.getByDisplayValue(NAMES[id]!);
  while (el && !el.querySelector('select[aria-label="Activity status"]')) el = el.parentElement;
  return el!;
}
/** The Start and End the grid shows for a row, as ISO. */
function shownDates(id: string): string[] {
  const dates = Array.from(rowOf(id).querySelectorAll("span"))
    .map((s) => s.childNodes[0]?.textContent ?? "")
    .filter((t) => /^\d{2}\/\d{2}\/\d{4}$/.test(t));
  return dates.slice(0, 2).map((t) => `${t.slice(6)}-${t.slice(0, 2)}-${t.slice(3, 5)}`);
}
const setGridStatus = (id: string, value: string) =>
  fireEvent.change(rowOf(id).querySelector('select[aria-label="Activity status"]')!, { target: { value } });
const dlg = () => screen.getByRole("dialog");
const field = (name: string) => dlg().querySelector(`[name="${name}"]`) as HTMLInputElement | HTMLSelectElement;
const set = (name: string, value: string) => fireEvent.change(field(name), { target: { value } });
function openWindow(id: string) {
  fireEvent.click(within(rowOf(id)).getByLabelText("Edit activity"));
  return dlg();
}
const openSection = (title: RegExp) => fireEvent.click(within(dlg()).getByRole("button", { name: title }));
const save = () => fireEvent.click(screen.getByRole("button", { name: "Save" }));
/** The store's own action, as the grid's estimate group commits on blur. */
const commit = (id: string, updates: Partial<Activity>) =>
  act(() => { useProjectStore.getState().updateActivityField(PID, scn().id, id, updates); });
function bulkApply(ids: string[], staged: { distribution?: string; status?: string }) {
  for (const id of ids) fireEvent.click(screen.getByLabelText(`Select activity ${NAMES[id]}`));
  if (staged.distribution) fireEvent.change(screen.getByLabelText("Set distribution for selected activities"), { target: { value: staged.distribution } });
  if (staged.status) fireEvent.change(screen.getByLabelText("Set status for selected activities"), { target: { value: staged.status } });
  fireEvent.click(screen.getByRole("button", { name: "Apply" }));
}

function load(edit?: (activities: Activity[]) => Activity[]) {
  const project = JSON.parse(PLANNED_DATES_V26_FIXTURE) as Project;
  if (edit) project.scenarios[0]!.activities = edit(project.scenarios[0]!.activities);
  localStorage.clear();
  localStorage.setItem(`spert:project:local:${PID}`, JSON.stringify(project));
  localStorage.setItem("spert:project-index:local", JSON.stringify([PID]));
  useProjectStore.setState({ projects: [], loadError: false, loadErrors: [], undoStack: [], redoStack: [] });
  useProjectStore.getState().loadProjects();
}
let unmount: () => void = () => {};
function renderPage() {
  unmount();
  unmount = render(
    <MemoryRouter initialEntries={[`/project/${PID}`]}>
      <Routes><Route path="/project/:id" element={<ProjectPage />} /></Routes>
      <ConfirmHost />
    </MemoryRouter>,
  ).unmount;
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-10-27T12:00:00"), toFake: ["Date"] });
  usePreferencesStore.setState((st) => ({ preferences: { ...st.preferences, dateFormat: "MM/DD/YYYY", autoRunSimulation: false } }));
  useConfirmStore.setState({ pending: null });
  useNotificationStore.setState({ notifications: [] });
  unmount = () => {};
});
afterEach(() => {
  unmount();
  vi.useRealTimers();
});

describe("the Edit Activity window keeps the grid path's pair for the same edits (ruling 5a)", () => {
  // Charlie: Uniform 9–11 (10 days at P50), after Bravo; the grid shows 11/02 – 11/13. Most Likely
  // 20 and Max 21 make it Uniform 9–21: 15 days, Mon 11/02 – Fri 11/20.
  const NEW_ESTIMATE_PLAN = ["2026-11-02", "2026-11-20"];

  it("V's case — the grid, the estimate committed first, then the Status: 11/02 – 11/20", () => {
    load();
    renderPage();
    expect(shownDates("c")).toEqual(["2026-11-02", "2026-11-13"]);
    commit("c", { mostLikely: 20, max: 21 });
    setGridStatus("c", "inProgress");
    expect(pairOf("c")).toEqual(NEW_ESTIMATE_PLAN);
  });

  for (const order of ["the estimate, then the Status", "the Status, then the estimate"] as const) {
    it(`… and the window, one sitting, ${order}: the same pair, shown at once and saved`, () => {
      load();
      renderPage();
      openWindow("c");
      openSection(/Estimates/);
      const estimate = () => { set("estimateMax", "21"); set("estimateMostLikely", "20"); };
      if (order === "the estimate, then the Status") estimate();
      set("activityStatus", "inProgress");
      if (order === "the Status, then the estimate") estimate();
      expect(dlg().textContent).toContain("Planned Start11/02/2026");
      save();
      expect([stored("c").status, stored("c").mostLikely, ...pairOf("c")]).toEqual(["inProgress", 20, ...NEW_ESTIMATE_PLAN]);
    });
  }

  // A hard Start No Earlier Than Mon 11/09 on Charlie: 10 days, 11/09 – 11/20.
  const SNET_PLAN = ["2026-11-09", "2026-11-20"];

  it("a constraint — the grid path: committed, then the Status", () => {
    load();
    renderPage();
    commit("c", { constraintType: "SNET", constraintMode: "hard", constraintDate: "2026-11-09" });
    setGridStatus("c", "inProgress");
    expect(pairOf("c")).toEqual(SNET_PLAN);
  });

  it("… and the window, the constraint set in the same sitting as the Status: the same pair", () => {
    load();
    renderPage();
    openWindow("c");
    set("activityStatus", "inProgress");
    openSection(/Scheduling Constraint/);
    set("constraintType", "SNET");
    set("constraintDate", "2026-11-09");
    save();
    expect([stored("c").constraintType, stored("c").constraintMode, ...pairOf("c")]).toEqual(["SNET", "hard", ...SNET_PLAN]);
  });

  // Delta, due 10/16, is set Complete: v0.80.0's default for an overdue Planned row is its scheduled
  // dates (ruling 5). Most Likely 5, Min 4, Max 6 — Uniform 4–6, 5 days — make them 10/05 – 10/09.
  const SHORTER_PLAN = ["2026-10-05", "2026-10-09"];

  it("v0.80.0's Complete defaults read the same plan as the pair: the grid path", () => {
    load();
    renderPage();
    commit("d", { min: 4, mostLikely: 5, max: 6 });
    setGridStatus("d", "complete");
    expect([...pairOf("d"), ...actualsOf("d")]).toEqual([...SHORTER_PLAN, ...SHORTER_PLAN]);
  });

  it("… and the window, the estimate first: the same pair, and the same actual dates", () => {
    load();
    renderPage();
    openWindow("d");
    openSection(/Estimates/);
    set("estimateMin", "4");
    set("estimateMostLikely", "5");
    set("estimateMax", "6");
    set("activityStatus", "complete");
    expect([(field("actualStartDate") as HTMLInputElement).value, (field("actualFinishDate") as HTMLInputElement).value]).toEqual(SHORTER_PLAN);
    save();
    expect([...pairOf("d"), ...actualsOf("d")]).toEqual([...SHORTER_PLAN, ...SHORTER_PLAN]);
  });
});

describe("the bulk toolbar keeps, in ONE Apply, the pair two Applies keep (ruling 5a)", () => {
  // Echo, after Delta (10/05 – 10/16), so it starts Mon 10/19. Review 33's P2: Normal 5/6/30 — the
  // SPERT mean (5 + 4·6 + 30) / 6 = 9.83, 10 days at P50: 10/19 – 10/30. Triangular 5/6/30 at P50:
  // 30 − √(0.5 · 25 · 24) = 12.68, so 13 days: 10/19 – 11/04.
  const normal = (acts: Activity[]) =>
    acts.map((a) => (a.id === "e" ? { ...a, distributionType: "normal" as const, min: 5, mostLikely: 6, max: 30 } : a));
  const TRIANGULAR_PLAN = ["2026-10-19", "2026-11-04"];
  // WI-154: the fixture holds a record, so the grid SHOWS work that has not started from today, Tue
  // 10/27: Delta (10 days) 10/27 – Mon 11/09, so Echo from Tue 11/10 — 10 days to Mon 11/23, or 13
  // (Triangular) to Thu 11/26. The pair is still the plan before that floor (owner, R639, C′).
  const SHOWN_TRIANGULAR = ["2026-11-10", "2026-11-26"];

  it("a Distribution staged with the Status: the plan has the new Distribution", () => {
    load(normal);
    renderPage();
    expect(shownDates("e")).toEqual(["2026-11-10", "2026-11-23"]);
    bulkApply(["e"], { distribution: "triangular", status: "inProgress" });
    expect([stored("e").distributionType, stored("e").status, ...pairOf("e")]).toEqual(["triangular", "inProgress", ...TRIANGULAR_PLAN]);
  });

  it("… the same as two Applies, the Distribution first and then the Status", () => {
    load(normal);
    renderPage();
    bulkApply(["e"], { distribution: "triangular" });
    expect(shownDates("e")).toEqual(SHOWN_TRIANGULAR);
    bulkApply(["e"], { status: "inProgress" });
    expect([stored("e").distributionType, stored("e").status, ...pairOf("e")]).toEqual(["triangular", "inProgress", ...TRIANGULAR_PLAN]);
  });

  it("a dependent chain started in one Apply keeps each row's pre-Apply plan, unchanged (ruling 5b)", () => {
    load();
    renderPage();
    bulkApply(["d", "e", "f"], { status: "inProgress" });
    expect([pairOf("d"), pairOf("e"), pairOf("f")]).toEqual([
      ["2026-10-05", "2026-10-16"], ["2026-10-19", "2026-10-30"], ["2026-11-02", "2026-11-13"],
    ]);
  });
});
