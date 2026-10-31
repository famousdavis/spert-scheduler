// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * Review 33 (verification) — DESIGN §1.3's transition table, driven through the REAL page:
 * the grid's Status cell, the Edit Activity window and the bulk toolbar, all on ProjectPage,
 * from a project WRITTEN BY v0.80.0's own code (`planned-dates-v26-fixture.ts`) and loaded
 * through this build's own local load gate. "Pair" = plannedStartDate / plannedFinishDate.
 * Today is pinned to Tue 2026-10-27; dates read MM/DD/YYYY.
 *
 * Adopted into v0.81.0 (WI-137 release 2) as the review wrote it, with four tests turned to the
 * owner's rulings (R630): the §9 timing (ruling 5a — the plan holds the same sitting's edits), the
 * Planned row that carries a pair (Review 33, E1 — no prompt, the pair kept), and the two
 * no-schedule tests (ruling 7c — the toast on the grid and bulk paths).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, within, act } from "@testing-library/react";
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

import { ProjectPage } from "@ui/pages/ProjectPage";
import { ConfirmHost } from "@ui/components/ConfirmHost";
import { useConfirmStore } from "@ui/hooks/use-confirm-store";
import { useProjectStore } from "@ui/hooks/use-project-store";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";
import { useNotificationStore } from "@ui/hooks/use-notification-store";
import type { Activity, Project } from "@domain/models/types";
import { serializeExport, validateImport } from "@app/api/export-import-service";
import { sanitizeForFirestore, stripSimulationResultsForCloud } from "@infrastructure/firebase/firestore-sanitize";
import { ProjectSchema } from "@domain/schemas/project.schema";
import { PLANNED_DATES_V26_FIXTURE } from "./planned-dates-v26-fixture";

const RAW_V26 = PLANNED_DATES_V26_FIXTURE;
const PID = (JSON.parse(RAW_V26) as Project).id;
/** The review's reading log — a no-op here, so each test reads as the review wrote it. */
const log = (_line: string): void => undefined;
/** The info toasts shown so far, oldest first (ruling 7c). */
const infoToasts = () => useNotificationStore.getState().notifications.filter((n) => n.type === "info").map((n) => n.message);

const proj = () => useProjectStore.getState().projects.find((p) => p.id === PID)!;
const scn = () => proj().scenarios[0]!;
const stored = (id: string): Activity => scn().activities.find((a) => a.id === id)!;
/** Every row that carries ANY planned key, in the store (a key with undefined counts as a key). */
const pairCensus = () => scn().activities.filter((a) => "plannedStartDate" in a || "plannedFinishDate" in a)
  .map((a) => [a.id, a.status, a.plannedStartDate ?? null, a.plannedFinishDate ?? null]);
/** …and in what is actually SAVED (localStorage). */
const savedCensus = () => {
  const raw = localStorage.getItem(`spert:project:local:${PID}`);
  const p = JSON.parse(raw!) as Project;
  return p.scenarios[0]!.activities.filter((a) => a.plannedStartDate || a.plannedFinishDate)
    .map((a) => [a.id, a.plannedStartDate ?? null, a.plannedFinishDate ?? null]);
};
const withPair = () => scn().activities.filter((a) => a.plannedStartDate || a.plannedFinishDate).map((a) => [a.id, a.plannedStartDate ?? null, a.plannedFinishDate ?? null]);

const NAMES: Record<string, string> = { a: "Alpha", b: "Bravo", l: "Lima", k: "Kilo", c: "Charlie", d: "Delta", e: "Echo", f: "Foxtrot" };
const ORDER = ["a", "b", "l", "k", "c", "d", "e", "f"];
const statusCell = (id: string) => screen.getAllByLabelText("Activity status")[ORDER.indexOf(id)] as HTMLSelectElement;
function rowOf(id: string): HTMLElement {
  let el: HTMLElement | null = screen.getByDisplayValue(NAMES[id]!);
  while (el && !el.querySelector('select[aria-label="Activity status"]')) el = el.parentElement;
  return el!;
}
/** The Start and End the grid SHOWS for a row, as ISO — what the user saw when they clicked. */
function shownDates(id: string): [string, string] {
  const dates = Array.from(rowOf(id).querySelectorAll("span"))
    .map((s) => s.childNodes[0]?.textContent ?? "")
    .filter((t) => /^\d{2}\/\d{2}\/\d{4}$/.test(t));
  const iso = (t: string) => `${t.slice(6)}-${t.slice(0, 2)}-${t.slice(3, 5)}`;
  return [iso(dates[0]!), iso(dates[1]!)];
}
const setGridStatus = (id: string, value: string) => fireEvent.change(statusCell(id), { target: { value } });
function openWindow(id: string) {
  fireEvent.click(within(rowOf(id)).getByLabelText("Edit activity"));
  return screen.getByRole("dialog");
}
const dlg = () => screen.getByRole("dialog");
const winStatus = () => dlg().querySelector('select[name="activityStatus"]') as HTMLSelectElement;
const winLine = () => Array.from((dlg().querySelector('input[name="actualDuration"]')!.closest(".grid") as HTMLElement).children)
  .map((c) => c.textContent);
const clickButton = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
const reload = () => act(() => { loadLikeTheApp(); });
function bulk(ids: string[], status: string) {
  for (const id of ids) fireEvent.click(screen.getByLabelText(`Select activity ${NAMES[id]}`));
  fireEvent.change(screen.getByLabelText("Set status for selected activities"), { target: { value: status } });
  clickButton("Apply");
}

function loadLikeTheApp() {
  localStorage.clear();
  localStorage.setItem(`spert:project:local:${PID}`, RAW_V26);
  localStorage.setItem("spert:project-index:local", JSON.stringify([PID]));
  useProjectStore.setState({ projects: [], loadError: false, loadErrors: [], undoStack: [], redoStack: [] });
  useProjectStore.getState().loadProjects();
}
function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/project/${PID}`]}>
      <Routes><Route path="/project/:id" element={<ProjectPage />} /></Routes>
      <ConfirmHost />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-10-27T12:00:00"), toFake: ["Date"] });
  usePreferencesStore.setState((st) => ({ preferences: { ...st.preferences, dateFormat: "MM/DD/YYYY", autoRunSimulation: false } }));
  useConfirmStore.setState({ pending: null });
  useNotificationStore.setState({ notifications: [] });
  loadLikeTheApp();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("loading what v0.80.0 wrote", () => {
  it("migrates 26 → 27 with NO pair on any row (no back-fill at load)", () => {
    expect(JSON.parse(RAW_V26).schemaVersion).toBe(26);
    expect(proj().schemaVersion).toBe(27);
    expect(pairCensus()).toEqual([]);
    expect(useProjectStore.getState().loadErrors).toEqual([]);
  });
});

describe("the grid's Status cell", () => {
  it("every legacy started row, through every started↔started change: NO pair, ever", () => {
    renderPage();
    for (const [id, to] of [["a", "inProgress"], ["a", "complete"], ["b", "complete"], ["b", "inProgress"], ["l", "complete"], ["k", "inProgress"], ["k", "complete"], ["l", "inProgress"]] as const) {
      setGridStatus(id, to);
      expect([id, stored(id).status]).toEqual([id, to]);
      expect(pairCensus()).toEqual([]);
    }
    expect(savedCensus()).toEqual([]);
    log(`grid legacy started<->started: census ${JSON.stringify(pairCensus())} saved ${JSON.stringify(savedCensus())}`);
  });

  it("Planned → In Progress captures what the grid SHOWED; → Planned clears it; Planned → Complete captures", () => {
    renderPage();
    const shownC = shownDates("c");
    setGridStatus("c", "inProgress");
    expect([stored("c").plannedStartDate, stored("c").plannedFinishDate]).toEqual(shownC);
    expect(withPair()).toEqual([["c", ...shownC]]);
    expect(savedCensus()).toEqual([["c", ...shownC]]);
    // The schedule now starts C on its Actual Start (today); the pair does not move.
    const nowC = shownDates("c");
    log(`grid c: shown before ${shownC} -> pair ${[stored("c").plannedStartDate, stored("c").plannedFinishDate]}; shown after ${nowC}`);
    expect(nowC[0]).toBe("2026-10-27");
    setGridStatus("c", "complete");
    expect([stored("c").plannedStartDate, stored("c").plannedFinishDate]).toEqual(shownC); // In Progress → Complete keeps
    setGridStatus("c", "planned");
    expect(pairCensus()).toEqual([["c", "planned", null, null]]); // keys present, values undefined
    expect(savedCensus()).toEqual([]); // and gone from what is saved
    const shownD = shownDates("d");
    setGridStatus("d", "complete");
    expect([stored("d").plannedStartDate, stored("d").plannedFinishDate]).toEqual(shownD);
    log(`grid d Planned->Complete: shown ${shownD} pair ${[stored("d").plannedStartDate, stored("d").plannedFinishDate]} actual ${[stored("d").actualStartDate, stored("d").actualFinishDate]}`);
  });

  it("a legacy row taken to Planned and back by the grid gets the LINK-placed plan — a fresh Planned → started change", () => {
    renderPage();
    setGridStatus("b", "planned");
    const shownB = shownDates("b");
    setGridStatus("b", "inProgress");
    log(`grid b legacy -> Planned (shown ${shownB}) -> In Progress: pair ${[stored("b").plannedStartDate, stored("b").plannedFinishDate]} actualStart ${stored("b").actualStartDate}`);
    expect([stored("b").plannedStartDate, stored("b").plannedFinishDate]).toEqual(shownB);
    expect(stored("b").plannedStartDate).not.toBe("2026-10-19"); // never the old Actual Start
  });
});

describe("the Edit Activity window", () => {
  it("legacy rows: a dash read 'none kept'; every Status walk and Save writes NO pair", () => {
    renderPage();
    openWindow("b");
    expect(winLine()[0]).toBe("Planned Start—none kept");
    fireEvent.change(winStatus(), { target: { value: "planned" } });
    fireEvent.change(winStatus(), { target: { value: "inProgress" } });
    expect(winLine()[0]).toBe("Planned Start—none kept"); // the toggle trap: never the record-placed schedule
    fireEvent.change(winStatus(), { target: { value: "complete" } });
    clickButton("Save");
    expect([stored("b").status, ...pairCensus()]).toEqual(["complete"]);
    for (const [id, walk] of [["a", ["inProgress"]], ["k", ["inProgress", "complete"]], ["l", ["planned", "complete"]]] as const) {
      openWindow(id);
      for (const s of walk) fireEvent.change(winStatus(), { target: { value: s } });
      clickButton("Save");
      expect([id, stored(id).status, pairCensus()]).toEqual([id, walk[walk.length - 1], []]);
    }
    expect(savedCensus()).toEqual([]);
  });

  it("a Planned row: the window shows the grid's dates as the plan; Cancel writes nothing; Save writes them", async () => {
    renderPage();
    const shownC = shownDates("c");
    openWindow("c");
    fireEvent.change(winStatus(), { target: { value: "inProgress" } });
    const fmt = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8)}/${iso.slice(0, 4)}`;
    expect(winLine()[0]).toBe(`Planned Start${fmt(shownC[0])}`);
    clickButton("Cancel");
    // A changed window asks before it discards (a second Radix dialog on top of the window).
    const ask = screen.getAllByRole("dialog").find((d) => d.textContent?.includes("Discard your unsaved changes?"))!;
    log(`window c Cancel: asks "${ask.querySelector("h2")?.textContent}"; buttons ${within(ask).getAllByRole("button").map((b) => b.textContent)}`);
    const discard = within(ask).getAllByRole("button").find((b) => /discard/i.test(b.textContent ?? ""))!;
    await act(async () => { fireEvent.click(discard); });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect([stored("c").status, pairCensus()]).toEqual(["planned", []]);
    openWindow("c");
    fireEvent.change(winStatus(), { target: { value: "complete" } });
    expect(winLine()[1]).toBe(`Planned Finish${fmt(shownC[1])}`);
    clickButton("Save");
    expect(withPair()).toEqual([["c", ...shownC]]);
  });

  it("a row WITH a pair, toggled to Planned and back in one sitting, keeps its own pair (never its Actual Start)", () => {
    renderPage();
    const shownC = shownDates("c");
    setGridStatus("c", "inProgress"); // captured by the grid
    openWindow("c");
    fireEvent.change(winStatus(), { target: { value: "planned" } });
    fireEvent.change(winStatus(), { target: { value: "complete" } });
    clickButton("Save");
    expect([stored("c").status, stored("c").plannedStartDate, stored("c").plannedFinishDate]).toEqual(["complete", ...shownC]);
    expect(stored("c").plannedStartDate).not.toBe(stored("c").actualStartDate);
  });

  it("§9 timing (ruling 5a): an estimate edited in the same sitting IS in the plan, in either order", () => {
    renderPage();
    const shownC = shownDates("c");
    for (const order of ["status-first", "estimate-first"] as const) {
      reload();
      openWindow("c");
      fireEvent.click(within(dlg()).getByRole("button", { name: /Estimates/ }));
      const ml = dlg().querySelector('input[name="estimateMostLikely"]') as HTMLInputElement;
      const mx = dlg().querySelector('input[name="estimateMax"]') as HTMLInputElement;
      const edit = () => { fireEvent.change(mx, { target: { value: "21" } }); fireEvent.change(ml, { target: { value: "20" } }); };
      if (order === "estimate-first") edit();
      fireEvent.change(winStatus(), { target: { value: "inProgress" } });
      if (order === "status-first") edit();
      clickButton("Save");
      log(`window c ${order}: ML ${stored("c").mostLikely} pair ${[stored("c").plannedStartDate, stored("c").plannedFinishDate]} (grid showed ${shownC})`);
      // Ruled (R630, 5a): the grid path's pair for the same edits — "grid c estimate-then-status".
      expect([stored("c").mostLikely, stored("c").plannedStartDate, stored("c").plannedFinishDate]).toEqual([20, "2026-11-02", "2026-11-20"]);
    }
    expect(shownC).toEqual(["2026-11-02", "2026-11-13"]); // what the grid showed before the edit — no longer the plan
  });
});

describe("the bulk toolbar", () => {
  it("legacy started rows through Complete and In Progress: NO pair", () => {
    renderPage();
    bulk(["a", "b", "l", "k"], "complete");
    expect(pairCensus()).toEqual([]);
    bulk(["a", "b", "l", "k"], "inProgress");
    expect(pairCensus()).toEqual([]);
    expect(savedCensus()).toEqual([]);
  });

  it("a dependent chain started in ONE Apply: each row its pre-Apply plan — compared with the grid one row at a time", () => {
    renderPage();
    const shown = { d: shownDates("d"), e: shownDates("e"), f: shownDates("f") };
    bulk(["d", "e", "f"], "inProgress");
    const viaBulk = withPair();
    expect(viaBulk).toEqual([["d", ...shown.d], ["e", ...shown.e], ["f", ...shown.f]]);
    // The same three by the grid, one at a time: each click reschedules the page first.
    reload();
    const viaGrid: (string | null)[][] = [];
    for (const id of ["d", "e", "f"]) {
      const s = shownDates(id);
      setGridStatus(id, "inProgress");
      viaGrid.push([id, ...s]);
    }
    expect(withPair()).toEqual(viaGrid);
    log(`bulk chain d,e,f: ${JSON.stringify(viaBulk)}`);
    log(`grid chain d,e,f one at a time: ${JSON.stringify(withPair())}`);
  });
});

describe("no schedule", () => {
  it("a dependency cycle: Planned → In Progress by grid, window and bulk keeps NONE (keys cleared)", () => {
    // f → d closes d → e → f → d. Written as the store would hold it.
    useProjectStore.setState((st) => ({
      projects: st.projects.map((p) => (p.id !== PID ? p : { ...p, scenarios: [{ ...p.scenarios[0]!, dependencies: [...p.scenarios[0]!.dependencies, { fromActivityId: "f", toActivityId: "d", type: "FS", lagDays: 0 }] }] })),
    }));
    renderPage();
    expect(screen.getAllByText(/cycle|circular/i).length).toBeGreaterThan(0);
    setGridStatus("c", "inProgress");
    expect(pairCensus()).toEqual([["c", "inProgress", null, null]]);
    // Ruled (R630, 7c): the grid says so — and the Status change itself is made.
    expect(infoToasts()).toEqual(["No Planned dates were kept for Charlie: the schedule could not be calculated when it left Planned. Its Status changed all the same."]);
    openWindow("d");
    fireEvent.change(winStatus(), { target: { value: "inProgress" } });
    expect(winLine()[0]).toBe("Planned Start—none kept");
    clickButton("Save");
    expect(infoToasts()).toHaveLength(1); // the window says it with the dash and its line, not a toast
    bulk(["e", "f"], "complete");
    expect(withPair()).toEqual([]);
    // … and the bulk toolbar, in ONE toast with the count.
    expect(infoToasts().slice(1)).toEqual(["No Planned dates were kept for 2 activities: the schedule could not be calculated when they left Planned. Their Status changed all the same."]);
    expect([stored("c").status, stored("d").status, stored("e").status, stored("f").status]).toEqual(["inProgress", "inProgress", "complete", "complete"]);
  });

  it("a calendar that cannot schedule (no working day in the week): NONE", () => {
    usePreferencesStore.setState((st) => ({ preferences: { ...st.preferences, workDays: [] } }));
    renderPage();
    const banner = screen.queryAllByText(/calendar|working day/i).map((e) => e.textContent).slice(0, 2);
    log(`calendar error banner: ${JSON.stringify(banner)}`);
    setGridStatus("c", "inProgress");
    expect(withPair()).toEqual([]);
    usePreferencesStore.setState((st) => ({ preferences: { ...st.preferences, workDays: [1, 2, 3, 4, 5] } }));
    // Ruled (R630, 7c): the toast, and the Status change made all the same. (Asked after the work
    // week is restored, so a failure here cannot leave the tests after it with no working day.)
    expect(stored("c").status).toBe("inProgress");
    expect(infoToasts()).toEqual(["No Planned dates were kept for Charlie: the schedule could not be calculated when it left Planned. Its Status changed all the same."]);
  });
});

describe("the non-Status paths, after one fresh capture", () => {
  it("typed dates, estimates, links, Start Date: the pair never moves; copies, JSON, undo/redo, cloud carry it as ruled", () => {
    renderPage();
    const shownC = shownDates("c");
    setGridStatus("c", "inProgress");
    const pair = [...shownC];
    const pairNow = () => [stored("c").plannedStartDate, stored("c").plannedFinishDate];
    // typed Actual Start in the window
    openWindow("c");
    const as = dlg().querySelector('input[name="actualStartDate"]') as HTMLInputElement;
    fireEvent.change(as, { target: { value: "2026-10-26" } });
    fireEvent.blur(as);
    clickButton("Save");
    expect([stored("c").actualStartDate, ...pairNow()]).toEqual(["2026-10-26", ...pair]);
    // estimate, link, Start Date through the store's own actions
    const st = useProjectStore.getState();
    st.updateActivityField(PID, scn().id, "c", { mostLikely: 15, max: 16 });
    st.addDependency(PID, scn().id, "d", "c", "FS", 2);
    st.updateScenarioStartDate(PID, scn().id, "2026-09-28");
    expect(pairNow()).toEqual(pair);
    // a constraint on the row itself, and the calendar (a converted Saturday, a forced day): the schedule moves, the pair does not
    const endBefore = shownDates("c")[1];
    act(() => { st.updateActivityField(PID, scn().id, "c", { constraintType: "FNET", constraintMode: "hard", constraintDate: "2026-12-04" }); });
    act(() => { st.addConvertedWorkDay(PID, "2026-10-31"); st.setForcedWorkDays(PID, ["2026-11-11"]); });
    log(`c finish shown before constraint ${endBefore}, after constraint+calendar ${shownDates("c")[1]}; pair ${pairNow()}`);
    expect(shownDates("c")[1]).not.toBe(endBefore);
    expect(pairNow()).toEqual(pair);
    // undo walks back through those edits and the capture; redo returns it
    const undos = useProjectStore.getState().undoStack.length;
    for (let i = 0; i < undos; i++) useProjectStore.getState().undo();
    expect(pairCensus()).toEqual([]);
    for (let i = 0; i < undos; i++) useProjectStore.getState().redo();
    expect(pairNow()).toEqual(pair);
    // copies
    useProjectStore.getState().duplicateScenario(PID, scn().id, "Plain copy");
    const plain = proj().scenarios.find((x) => x.name === "Plain copy")!;
    expect(plain.activities.filter((a) => a.plannedStartDate).map((a) => [a.name, a.plannedStartDate, a.plannedFinishDate])).toEqual([["Charlie", ...pair]]);
    useProjectStore.getState().duplicateScenario(PID, scn().id, "Reforecast", { dropCompleted: true, reforecastFrom: "2026-10-28" });
    const refo = proj().scenarios.find((x) => x.name === "Reforecast")!;
    expect(refo.activities.map((a) => a.name)).toContain("Charlie");
    expect(refo.activities.filter((a) => "plannedStartDate" in a && a.plannedStartDate)).toEqual([]);
    useProjectStore.getState().duplicateActivity(PID, scn().id, "c");
    const dup = scn().activities.find((a) => a.name === "Charlie (copy)")!;
    expect([dup.status, dup.plannedStartDate, dup.plannedFinishDate]).toEqual(["planned", undefined, undefined]);
    // JSON round trip, as copy and as replace
    const file = serializeExport([proj()]);
    const v = validateImport(file, useProjectStore.getState().projects);
    expect(v.success).toBe(true);
    if (!v.success) return;
    const imported = v.projects[0]!;
    expect(imported.scenarios[0]!.activities.find((a) => a.id === "c")!.plannedStartDate).toBe(pair[0]);
    // cloud: what the driver writes, read back the way a listener parses it
    const wire = JSON.parse(JSON.stringify(sanitizeForFirestore(stripSimulationResultsForCloud(proj()))));
    const back = ProjectSchema.parse({ ...wire, schemaVersion: 27 });
    expect(back.scenarios[0]!.activities.find((a) => a.id === "c")!.plannedFinishDate).toBe(pair[1]);
    useProjectStore.getState().mergeProject({ ...(back as Project) });
    expect(pairNow()).toEqual(pair);
    log(`non-status: pair ${pair} kept through typed AS, estimate, link, Start Date, undo/redo, plain copy, JSON, cloud; cleared by reforecast and duplicate`);
  });
});

describe("the remaining cells, with a pair present", () => {
  it("Complete → In Progress keeps (grid); bulk same-status, → Complete, → In Progress keep; bulk → Planned clears", () => {
    renderPage();
    const shownC = shownDates("c");
    setGridStatus("c", "inProgress");
    setGridStatus("c", "complete");
    setGridStatus("c", "inProgress");
    const pairC = () => [stored("c").plannedStartDate, stored("c").plannedFinishDate];
    expect(pairC()).toEqual(shownC);
    bulk(["c"], "inProgress"); // the same Status
    expect(pairC()).toEqual(shownC);
    bulk(["c"], "complete");
    expect([stored("c").status, ...pairC()]).toEqual(["complete", ...shownC]);
    bulk(["c"], "inProgress");
    expect(pairC()).toEqual(shownC);
    bulk(["c"], "planned");
    expect([stored("c").status, ...pairC()]).toEqual(["planned", undefined, undefined]);
    expect(savedCensus()).toEqual([]);
  });

  it("§9 contrast: the GRID path, estimate committed first, captures the NEW estimate's plan", () => {
    renderPage();
    const before = shownDates("c");
    act(() => { useProjectStore.getState().updateActivityField(PID, scn().id, "c", { mostLikely: 20, max: 21 }); });
    const shownAfterEdit = shownDates("c");
    setGridStatus("c", "inProgress");
    log(`grid c estimate-then-status: shown before edit ${before}, after edit ${shownAfterEdit}, pair ${[stored("c").plannedStartDate, stored("c").plannedFinishDate]}`);
    expect([stored("c").plannedStartDate, stored("c").plannedFinishDate]).toEqual(shownAfterEdit);
    expect(shownAfterEdit[1]).not.toBe(before[1]);
  });
});

describe("edge: a Planned row that CARRIES a pair (a hand-edited import, or WI-150 later)", () => {
  it("opening its window and pressing Cancel — does the window think something changed?", () => {
    act(() => {
      useProjectStore.setState((st) => ({ projects: st.projects.map((p) => (p.id !== PID ? p : { ...p, scenarios: [{ ...p.scenarios[0]!, activities: p.scenarios[0]!.activities.map((a) => (a.id === "f" ? { ...a, plannedStartDate: "2026-01-05", plannedFinishDate: "2026-01-16" } : a)) }] })) }));
    });
    renderPage();
    openWindow("f");
    clickButton("Cancel");
    const asks = screen.queryAllByRole("dialog").filter((d) => d.textContent?.includes("Discard your unsaved changes?"));
    log(`stray pair on Planned f: Cancel with no edit -> discard prompt shown: ${asks.length > 0}`);
    // Ruled (Review 33, E1): nothing changed, so nothing is asked, and Cancel closes the window.
    expect(asks).toEqual([]);
    expect(screen.queryByRole("dialog")).toBeNull();
    // and an unrelated Save (rename) — what happens to the stray pair? It is kept as stored.
    openWindow("f");
    const name = dlg().querySelector('input[name="activityName"]') as HTMLInputElement;
    fireEvent.change(name, { target: { value: "Foxtrot renamed" } });
    clickButton("Save");
    log(`stray pair on Planned f after an unrelated Save: ${JSON.stringify([stored("f").name, stored("f").plannedStartDate ?? null, stored("f").plannedFinishDate ?? null])}`);
    expect([stored("f").name, stored("f").plannedStartDate ?? null, stored("f").plannedFinishDate ?? null]).toEqual(["Foxtrot renamed", "2026-01-05", "2026-01-16"]);
  });
});

describe("print: the notes section's place with a constraint present", () => {
  it("h2 order in the print report", () => {
    act(() => { useProjectStore.getState().updateActivityField(PID, scn().id, "e", { constraintType: "SNET", constraintMode: "soft", constraintDate: "2026-11-23" }); });
    renderPage();
    const rep = document.querySelector(".print-report")!;
    const h2 = Array.from(rep.querySelectorAll("h2")).map((h) => h.textContent?.trim());
    log(`print h2 with a constraint: ${JSON.stringify(h2)}`);
    const i = h2.findIndex((t) => t?.startsWith("Progress Notes"));
    expect(h2[i - 1]).toMatch(/^Constraints/);
  });
});
