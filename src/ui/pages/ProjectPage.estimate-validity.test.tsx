// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * WI-49 (v0.69.0) and WI-50 (v0.70.0) at the PAGE: estimate validity derived from saved data, plus
 * the one row state saved data cannot see (a refused entry), read by every site that decides what
 * the user sees — and, since v0.70.0, the three estimate cells committing as ONE group.
 *
 * ⚠️ WHY THE PAGE AND NOT THE HOOK. The helper tests take the gate's inputs as arguments, so a
 * page that handed them the WRONG set would pass all of them. Every fixture here renders the
 * real `ProjectPage` on a real store and drives the grid's own Tab handling, which is
 * programmatic (`focusField` → `el.focus()`), so jsdom produces the same blur sequence a browser
 * does for a Tab.
 *
 * ⚠️ SINCE v0.70.0 `tab()` INSIDE A ROW'S THREE ESTIMATE CELLS COMMITS NOTHING: it is a real focus
 * move to another cell of the group. A fixture that needs a commit must LEAVE the group — a Tab out
 * of Max, `act(() => cell.blur())`, or focus moving to something else — and says which.
 *
 * RETIRED in v0.70.0, with their reason: the brief's "second", "third" and "fourth" banner fixtures
 * (§3.2, R207.3, R208, R209) and the stale-stamp test (G-D). Each pinned how the page treated a
 * SAVED half-typed triple while its row was still being typed — held back by the `mid-entry` stamp.
 * Nothing is saved while a row is being typed any more, and a triple left half-typed is flagged at
 * the exit by design (locked decision 2), so the state they pinned cannot occur.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, screen, fireEvent, within } from "@testing-library/react";
import { StrictMode } from "react";
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
// The simulation runs in a worker; a spy stands in so a test can see whether Run REACHED it.
const sim = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("@ui/hooks/use-simulation", () => ({
  useSimulation: () => ({
    isRunning: false,
    progress: null,
    error: null,
    elapsedMs: null,
    run: sim.run,
    cancel: vi.fn(),
  }),
}));

import { ProjectPage } from "./ProjectPage";
import { useProjectStore } from "@ui/hooks/use-project-store";
import { useNotificationStore } from "@ui/hooks/use-notification-store";
import { useConfirmStore } from "@ui/hooks/use-confirm-store";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";
import { createProject, createActivity, createScenario } from "@app/api/project-service";
import {
  DEFAULT_USER_PREFERENCES,
  type Activity,
  type Project,
  type ScenarioSettings,
} from "@domain/models/types";

/** An activity as `+ Add Activity` makes it, then patched — never a cast. */
function activityWith(name: string, settings: ScenarioSettings, patch: Partial<Activity> = {}): Activity {
  return { ...createActivity(name, settings), ...patch };
}

function projectOf(
  build: (settings: ScenarioSettings) => Activity[],
  settingsPatch: Partial<ScenarioSettings> = {},
  scenarioName = "Pellucid Baseline"
): Project {
  const scenario = createScenario(scenarioName, "2026-04-06");
  const settings = { ...scenario.settings, ...settingsPatch };
  const p = createProject("Quillon Viaduct Refit", "2026-04-06");
  return { ...p, scenarios: [{ ...scenario, settings, activities: build(settings) }] };
}

function renderPage(project: Project) {
  useProjectStore.setState({ projects: [project], loadError: false });
  return render(
    <MemoryRouter initialEntries={[`/project/${project.id}`]}>
      <Routes>
        <Route path="/project/:id" element={<ProjectPage />} />
      </Routes>
    </MemoryRouter>
  );
}

type Field = "name" | "min" | "ml" | "max";

function cell(aid: string, field: Field): HTMLInputElement {
  return document.querySelector<HTMLInputElement>(`[data-row-id="${aid}"][data-field="${field}"]`)!;
}

/** Focus a cell and type into it — focus first, as a user's click or Tab would. */
function typeInto(aid: string, field: Field, value: string): void {
  const el = cell(aid, field);
  act(() => el.focus());
  fireEvent.change(el, { target: { value } });
}

/** A real Tab through the grid's own handler, which moves focus and so blurs the cell. */
function tab(aid: string, field: Field): void {
  fireEvent.keyDown(cell(aid, field), { key: "Tab" });
}

function stored(projectId: string, aid: string): Activity {
  return useProjectStore.getState().getProject(projectId)!.scenarios[0]!.activities.find((a) => a.id === aid)!;
}

const summary = () => screen.queryByText(/validation errors$/);
const bannerHeading = () => screen.queryByText("Schedule Error");
/** The banner's message paragraph — the one that names an activity. */
function bannerMessage(): string {
  const heading = bannerHeading();
  expect(heading).not.toBeNull();
  return heading!.parentElement!.querySelectorAll("p")[1]!.textContent ?? "";
}
const runButton = () => screen.getByRole("button", { name: "Run Simulation" });
const runReason = () => screen.queryByText(/Run needs every activity's estimates to be valid/);

function errorToasts(): string[] {
  return useNotificationStore
    .getState()
    .notifications.filter((n) => n.type === "error")
    .map((n) => n.message);
}

beforeEach(() => {
  localStorage.clear();
  useProjectStore.setState({ projects: [], loadError: false, undoStack: [], redoStack: [] });
  useNotificationStore.setState({ notifications: [] });
  usePreferencesStore.setState({ preferences: { ...DEFAULT_USER_PREFERENCES } });
  sim.run.mockReset();
});

describe("v0.67.23 at the page — a fresh row being typed shows no summary and no banner", () => {
  it("stays quiet while focus is in the estimate cells, and flags the row once it leaves them", () => {
    let aid = "";
    const p = projectOf((s) => {
      const a = activityWith("Ostrander survey", s);
      aid = a.id;
      return [a];
    });
    renderPage(p);

    typeInto(aid, "min", "5");
    tab(aid, "min"); // to Most Likely, inside the group
    expect(document.activeElement).toBe(cell(aid, "ml"));
    // ⚠️ v0.70.0 — FLIPPED ON PURPOSE: this read `5/1/1`, the per-cell commit's half-typed save
    // that the mid-entry stamp then held back. Since the three cells commit as one group, a Tab
    // between them writes nothing at all.
    expect(stored(p.id, aid)).toMatchObject({ min: 1, mostLikely: 1, max: 1 });
    expect(summary()).toBeNull();
    expect(bannerHeading()).toBeNull();

    // The control, same test: out through Max — the group exit — and the half-typed 5/1/1 is
    // saved and flagged: summary AND banner.
    tab(aid, "ml");
    tab(aid, "max");
    expect(stored(p.id, aid)).toMatchObject({ min: 5, mostLikely: 1, max: 1 });
    expect(summary()).not.toBeNull();
    expect(bannerMessage()).toContain("Ostrander survey");
  });
});

describe("a loaded out-of-order project — flagged at mount, from saved data", () => {
  it.each([
    ["Triangular", "triangular" as const],
    ["T-Normal", "normal" as const],
  ])("%s 14/13/22: red Min cell announced to assistive technology, named in the summary, Run refused", (_label, distributionType) => {
    // ⚠️ T-Normal is the case that cannot pass vacuously: it BUILDS, so the schedule computes
    // and nothing throws. A flag that came from the engine would miss it — measured, it ran to
    // a complete plan before v0.69.0 with nothing on screen.
    let aid = "";
    const p = projectOf((s) => {
      const a = activityWith("Kittiwake abutment", s, { min: 14, mostLikely: 13, max: 22, distributionType });
      aid = a.id;
      return [a];
    });
    renderPage(p);

    const min = cell(aid, "min");
    expect(min).toHaveAttribute("aria-invalid", "true");
    const describedBy = min.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)?.textContent).toBe("Min is above Most Likely");
    expect(cell(aid, "ml")).not.toHaveAttribute("aria-invalid");
    expect(summary()!.parentElement!.textContent).toContain("Kittiwake abutment");
    expect(runButton()).toBeDisabled();
    expect(runReason()!.parentElement!.textContent).toContain("Kittiwake abutment");
  });

  it("a LogNormal 0/0/0 row is flagged at mount on Max, and stays listed after a tab-through", () => {
    // Before v0.69.0 this row passed the schema and silently blanked the schedule. And a look at
    // its cells — in and out, typing nothing — does not drop it from the summary.
    let aid = "";
    const p = projectOf((s) => {
      const a = activityWith("Lapwing sump", s, { min: 0, mostLikely: 0, max: 0, distributionType: "logNormal" });
      aid = a.id;
      return [a];
    });
    renderPage(p);
    const expectFlagged = () => {
      expect(summary()!.parentElement!.textContent).toContain("A LogNormal activity needs an estimate above zero");
      expect(cell(aid, "max")).toHaveAttribute("aria-invalid", "true");
      expect(cell(aid, "min")).not.toHaveAttribute("aria-invalid");
      expect(runButton()).toBeDisabled();
    };
    expectFlagged();

    act(() => cell(aid, "min").focus());
    tab(aid, "min");
    tab(aid, "ml");
    tab(aid, "max"); // out of the group: an exit that typed nothing, so it writes nothing
    expectFlagged();
  });
});

describe("every Run control refuses while Run is refused (WI-53)", () => {
  it("the panel button is disabled with its reason; both summary-card links toast instead of running", () => {
    const p = projectOf((s) => [
      activityWith("Merganser outfall", s, { min: 14, mostLikely: 13, max: 22, distributionType: "normal" }),
    ]);
    renderPage(p);
    expect(runButton()).toBeDisabled();
    expect(runReason()).not.toBeNull();

    // No results yet, so the card shows BOTH links: the buffer row's and the export row's.
    const links = screen.getAllByRole("button", { name: "Run simulation" });
    expect(links).toHaveLength(2);
    for (const link of links) fireEvent.click(link);

    expect(sim.run).not.toHaveBeenCalled();
    const toasts = errorToasts();
    expect(toasts).toHaveLength(2);
    for (const t of toasts) {
      expect(t).toContain("Merganser outfall");
      expect(t).toContain("Min is above Most Likely");
    }
  });

  it("CONTROL: with valid estimates the same link runs the simulation", () => {
    const p = projectOf((s) => [activityWith("Merganser outfall", s, { min: 9, mostLikely: 13, max: 22 })]);
    renderPage(p);
    expect(runButton()).toBeEnabled();
    fireEvent.click(screen.getAllByRole("button", { name: "Run simulation" })[0]!);
    expect(sim.run).toHaveBeenCalledTimes(1);
    expect(errorToasts()).toEqual([]);
  });
});

describe("the reported half — what saved data cannot see, and how it dies", () => {
  function twoScenarioProject(): { p: Project; aid: string } {
    let aid = "";
    const p = projectOf((s) => {
      const a = activityWith("Pochard sluice", s, { min: 5, mostLikely: 10, max: 20 });
      aid = a.id;
      return [a];
    });
    const other = createScenario("Quenby Downside", "2026-04-06");
    return { p: { ...p, scenarios: [...p.scenarios, { ...other, activities: [createActivity("Rudd weir", other.settings)] }] }, aid };
  }

  it("a cleared cell blocks Run with its reason — and Run returns in another scenario (G2)", () => {
    const { p, aid } = twoScenarioProject();
    renderPage(p);
    typeInto(aid, "min", "");
    act(() => cell(aid, "min").blur()); // leaves the group (v0.70.0: a Tab to ML would not)
    expect(cell(aid, "min").value).toBe("");
    expect(runButton()).toBeDisabled();
    expect(runReason()!.parentElement!.textContent).toContain("Min: Enter a number.");

    fireEvent.click(screen.getByRole("button", { name: "Quenby Downside" }));
    expect(runButton()).toBeEnabled();
    expect(runReason()).toBeNull();
  });

  it("REMOUNT: back from another scenario the cell shows the stored number, and nothing still claims it is cleared", () => {
    // The brief's open design point (3.3). Without the prune in `useEstimateValidity`, the
    // report outlived its row: the remounted cell showed 5 while Run stayed off naming it.
    const { p, aid } = twoScenarioProject();
    renderPage(p);
    typeInto(aid, "min", "");
    act(() => cell(aid, "min").blur()); // leaves the group
    expect(runButton()).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Quenby Downside" }));
    fireEvent.click(screen.getByRole("button", { name: "Pellucid Baseline" }));

    expect(cell(aid, "min").value).toBe("5");
    expect(runButton()).toBeEnabled();
    expect(runReason()).toBeNull();
    expect(summary()).toBeNull();
  });

  it("REMOUNT: a deleted row's report does not come back with its undo", () => {
    let keep = "";
    let gone = "";
    const p = projectOf((s) => {
      const a = activityWith("Scaup revetment", s, { min: 5, mostLikely: 10, max: 20 });
      const b = activityWith("Teal groyne", s, { min: 2, mostLikely: 3, max: 4 });
      gone = a.id;
      keep = b.id;
      return [a, b];
    });
    renderPage(p);
    typeInto(gone, "min", "");
    act(() => cell(gone, "min").blur()); // leaves the group
    expect(runButton()).toBeDisabled();

    act(() => useProjectStore.getState().deleteActivity(p.id, p.scenarios[0]!.id, gone));
    expect(runButton()).toBeEnabled(); // G2: the report left with its row
    act(() => useProjectStore.getState().undo());

    expect(cell(gone, "min").value).toBe("5");
    expect(cell(keep, "min").value).toBe("2");
    expect(runButton()).toBeEnabled();
    expect(runReason()).toBeNull();
  });

  it("an abandoned half-typed triple is SAVED AND FLAGGED at the exit: red Min, summary, banner, Run refused (WI-48)", () => {
    // ⚠️ v0.70.0 — FLIPPED ON PURPOSE. This was "UNTIL PR 2 — … no summary, no banner": v0.69.0
    // saved the 5/1/1 at the blur and held it back from the summary and the banner with the
    // mid-entry stamp, so only the reason below the grid explained Run. Locked decision 2: an
    // out-of-order triple is saved and flagged, never silently kept back — and since nothing is
    // saved while a row is being typed, the exit is where that happens. WI-48 closes on this:
    // the abandoned state is no longer SILENT.
    let aid = "";
    const p = projectOf((s) => {
      const a = activityWith("Gadwall intake", s);
      aid = a.id;
      return [a];
    });
    renderPage(p);
    typeInto(aid, "min", "5");
    act(() => cell(aid, "min").blur()); // click away: the group exit

    expect(stored(p.id, aid)).toMatchObject({ min: 5, mostLikely: 1, max: 1 });
    expect(cell(aid, "min")).toHaveAttribute("aria-invalid", "true");
    expect(summary()!.parentElement!.textContent).toContain("Gadwall intake");
    expect(bannerMessage()).toContain("Gadwall intake"); // Triangular 5/1/1 cannot be built
    expect(runButton()).toBeDisabled();
    expect(runReason()!.parentElement!.textContent).toContain("Gadwall intake");
  });
});

describe("external writes — the flag follows the saved data (WI-28)", () => {
  it("an undo that repairs the triple clears the red, the summary and the Run refusal; redo brings them back", () => {
    let aid = "";
    const p = projectOf((s) => {
      const a = activityWith("Shoveler bund", s, { min: 9, mostLikely: 13, max: 22 });
      aid = a.id;
      return [a];
    });
    renderPage(p);
    typeInto(aid, "min", "14");
    act(() => cell(aid, "min").blur()); // leaves the group (v0.70.0: a Tab to ML would not)
    expect(cell(aid, "min")).toHaveAttribute("aria-invalid", "true");
    expect(summary()).not.toBeNull();

    act(() => useProjectStore.getState().undo());
    expect(stored(p.id, aid).min).toBe(9);
    expect(cell(aid, "min").value).toBe("9");
    expect(cell(aid, "min")).not.toHaveAttribute("aria-invalid");
    expect(summary()).toBeNull();
    expect(runButton()).toBeEnabled();
    expect(runReason()).toBeNull();

    act(() => useProjectStore.getState().redo());
    expect(cell(aid, "min").value).toBe("14");
    expect(cell(aid, "min")).toHaveAttribute("aria-invalid", "true");
    expect(runButton()).toBeDisabled();
  });
});

describe("a draft carried away by a scenario switch is saved and flagged", () => {
  it("the red Min cell is there after switching back, and after a reload", () => {
    let aid = "";
    const p = projectOf((s) => {
      const a = activityWith("Pintail causeway", s, { min: 5, mostLikely: 10, max: 20 });
      aid = a.id;
      return [a];
    });
    const other = createScenario("Quenby Downside", "2026-04-06");
    const project = { ...p, scenarios: [...p.scenarios, { ...other, activities: [createActivity("Rudd weir", other.settings)] }] };
    const { unmount } = renderPage(project);

    typeInto(aid, "min", "11");
    // A real click on the tab moves focus FIRST, which is what commits the draft; jsdom's
    // click does not, so the focus move is made explicitly.
    const otherTab = screen.getByRole("button", { name: "Quenby Downside" });
    act(() => otherTab.focus());
    fireEvent.click(otherTab);
    expect(stored(project.id, aid)).toMatchObject({ min: 11, mostLikely: 10, max: 20 });

    fireEvent.click(screen.getByRole("button", { name: "Pellucid Baseline" }));
    expect(cell(aid, "min")).toHaveAttribute("aria-invalid", "true");

    // Reload: a fresh page over what localStorage holds — the project must LOAD, flagged.
    unmount();
    useProjectStore.setState({ projects: [], loadError: false });
    useProjectStore.getState().loadProjects();
    expect(useProjectStore.getState().getProject(project.id)).toBeDefined();
    render(
      <MemoryRouter initialEntries={[`/project/${project.id}`]}>
        <Routes>
          <Route path="/project/:id" element={<ProjectPage />} />
        </Routes>
      </MemoryRouter>
    );
    expect(cell(aid, "min")).toHaveAttribute("aria-invalid", "true");
    expect(summary()!.parentElement!.textContent).toContain("Pintail causeway");
  });
});

describe("auto-run reads Run's set, never the display's", () => {
  it("a half-typed T-Normal 1/20/1 does not auto-run; completing it validly does", async () => {
    // ⚠️ T-NORMAL, and that is the whole test. A Triangular 1/20/1 makes the simulation's
    // parameter build throw, so auto-run aborts whichever set it reads — a Triangular version
    // of this test passed with auto-run wired to the DISPLAY set (measured). T-Normal throws
    // only when min > max, so its 1/20/1 builds, and only the gate can stop the run.
    //
    // ⚠️ v0.70.0 — the half-typed triple now has to be LEFT to be saved, so this test leaves the
    // group after Most Likely. Tabbing from Most Likely to Max alone writes nothing any more, and
    // a test that stopped there would pass with no gate at all.
    usePreferencesStore.setState({ preferences: { ...DEFAULT_USER_PREFERENCES, autoRunSimulation: true } });
    let aid = "";
    const p = projectOf((s) => {
      const a = activityWith("Garganey leat", s, { distributionType: "normal" });
      aid = a.id;
      return [a];
    });
    renderPage(p);
    await act(async () => { await new Promise((r) => setTimeout(r, 600)); });
    sim.run.mockReset(); // whatever the mount did

    typeInto(aid, "ml", "20");
    tab(aid, "ml"); // to Max, inside the group: nothing saved yet
    expect(stored(p.id, aid)).toMatchObject({ min: 1, mostLikely: 1, max: 1 });
    tab(aid, "max"); // out of the group: 1/20/1 is saved — out of order, flagged
    expect(summary()!.parentElement!.textContent).toContain("Garganey leat");
    await act(async () => { await new Promise((r) => setTimeout(r, 600)); });
    expect(sim.run).not.toHaveBeenCalled();

    // Control, same test: finish the triple validly and the debounced run fires.
    typeInto(aid, "max", "30");
    tab(aid, "max");
    await act(async () => { await new Promise((r) => setTimeout(r, 600)); });
    expect(sim.run).toHaveBeenCalledTimes(1);
  });
});

describe("the grid no longer sets the page's state from inside its own state updater", () => {
  it("an invalid commit logs no 'Cannot update a component while rendering a different component'", () => {
    // Present before v0.69.0 on the first report of a page load (React de-duplicates it per
    // component, so the check is from a fresh render, not a count).
    //
    // ⚠️ UNDER <StrictMode>, as `main.tsx` renders the app, and that is the whole instrument.
    // React computes a state updater EAGERLY, outside render, when the component has nothing
    // pending — so the old setter-inside-updater only ran during render when StrictMode
    // re-invoked it. Rendered without StrictMode this test passed with the defect planted back
    // in (measured), which is why the app's own wrapper is reproduced here.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    let aid = "";
    const p = projectOf((s) => {
      const a = activityWith("Smew channel", s, { min: 9, mostLikely: 13, max: 22 });
      aid = a.id;
      return [a];
    });
    useProjectStore.setState({ projects: [p], loadError: false });
    render(
      <StrictMode>
        <MemoryRouter initialEntries={[`/project/${p.id}`]}>
          <Routes>
            <Route path="/project/:id" element={<ProjectPage />} />
          </Routes>
        </MemoryRouter>
      </StrictMode>
    );
    typeInto(aid, "min", "14");
    tab(aid, "min");
    typeInto(aid, "ml", "");
    tab(aid, "ml");
    tab(aid, "max"); // out of the group: the commit, and the row's report (v0.70.0)
    const warned = spy.mock.calls.some((c) => String(c[0]).includes("Cannot update a component"));
    spy.mockRestore();
    expect(warned).toBe(false);
    expect(cell(aid, "min")).toHaveAttribute("aria-invalid", "true"); // premise: it did commit
  });
});

describe("the hold — what is painted above the grid waits for the click; Run never does", () => {
  it("mid-press, a commit that flags the row disables Run at once while the summary is still held", async () => {
    let aid = "";
    const p = projectOf((s) => {
      const a = activityWith("Eider penstock", s, { min: 9, mostLikely: 13, max: 22, distributionType: "normal" });
      aid = a.id;
      return [a];
    });
    renderPage(p);
    typeInto(aid, "min", "14");

    fireEvent.pointerDown(window);
    act(() => cell(aid, "min").blur()); // the press's blur commits the draft
    expect(stored(p.id, aid).min).toBe(14);
    expect(runButton()).toBeDisabled(); // LIVE
    expect(summary()).toBeNull(); // HELD

    fireEvent.pointerUp(window);
    expect(summary()).toBeNull(); // still held: the release waits a task, behind the click
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(summary()!.parentElement!.textContent).toContain("Eider penstock");
  });
});

describe("WI-50 — the three estimate cells commit as ONE group, when focus leaves them (v0.70.0)", () => {
  const frames = () => useProjectStore.getState().undoStack.length;

  function oneRow(name: string, estimates: Partial<Activity> = { min: 5, mostLikely: 10, max: 20 }, settingsPatch: Partial<ScenarioSettings> = {}) {
    let aid = "";
    const p = projectOf((s) => {
      const a = activityWith(name, s, estimates);
      aid = a.id;
      return [a];
    }, settingsPatch);
    return { p, aid };
  }

  it("the owner's gesture: 11 into Min of a 5-10-20 row and Tab — nothing is written or flagged until focus LEAVES the three cells", () => {
    const { p, aid } = oneRow("Hobby spillway");
    renderPage(p);
    const before = frames();

    typeInto(aid, "min", "11");
    tab(aid, "min"); // to Most Likely
    tab(aid, "ml"); // to Max — still inside the group
    expect(document.activeElement).toBe(cell(aid, "max"));
    expect(cell(aid, "min").value).toBe("11"); // the draft survives the moves between the cells
    expect(stored(p.id, aid)).toMatchObject({ min: 5, mostLikely: 10, max: 20 });
    expect(frames()).toBe(before);
    expect(cell(aid, "min")).not.toHaveAttribute("aria-invalid");
    expect(summary()).toBeNull();
    expect(bannerHeading()).toBeNull();
    expect(runButton()).toBeEnabled();

    // The control, same test: a Tab out of Max leaves the group, and 11/10/20 is saved — one
    // write — and flagged, from the saved triple.
    tab(aid, "max");
    expect(stored(p.id, aid)).toMatchObject({ min: 11, mostLikely: 10, max: 20 });
    expect(frames()).toBe(before + 1);
    expect(cell(aid, "min")).toHaveAttribute("aria-invalid", "true");
    expect(summary()!.parentElement!.textContent).toContain("Hobby spillway");
    expect(bannerMessage()).toContain("Hobby spillway");
    expect(runButton()).toBeDisabled();
  });

  it("Min, Most Likely and Max typed in one visit are ONE write, and one Undo reverts all three", () => {
    const { p, aid } = oneRow("Merlin culvert", {}); // as + Add Activity makes it: 1/1/1
    renderPage(p);
    const before = frames();

    typeInto(aid, "min", "5");
    tab(aid, "min");
    typeInto(aid, "ml", "10");
    tab(aid, "ml");
    typeInto(aid, "max", "20");
    tab(aid, "max"); // the exit

    expect(stored(p.id, aid)).toMatchObject({ min: 5, mostLikely: 10, max: 20 });
    expect(frames()).toBe(before + 1);
    act(() => useProjectStore.getState().undo());
    expect(stored(p.id, aid)).toMatchObject({ min: 1, mostLikely: 1, max: 1 });
  });

  it("Enter commits and leaves: focus goes where a Tab out of Max goes, and the commit is ONE write", () => {
    let a = "";
    let b = "";
    const p = projectOf((s) => {
      const rowA = activityWith("Sanderling weir", s, { min: 5, mostLikely: 10, max: 20 });
      const rowB = activityWith("Knot sluice", s, { min: 2, mostLikely: 3, max: 4 });
      a = rowA.id;
      b = rowB.id;
      return [rowA, rowB];
    });
    renderPage(p);
    const before = frames();

    typeInto(a, "min", "7");
    fireEvent.keyDown(cell(a, "min"), { key: "Enter" });

    expect(document.activeElement).toBe(cell(b, "name"));
    expect(stored(p.id, a)).toMatchObject({ min: 7, mostLikely: 10, max: 20 });
    // Through the blur Enter causes, never an explicit commit as well: that would be two.
    expect(frames()).toBe(before + 1);
  });

  it("with the heuristic on, Enter lands on Distribution, and the heuristic fills only the cells not typed", () => {
    const { p, aid } = oneRow("Dunlin outfall", { min: 5, mostLikely: 10, max: 20 }, { heuristicEnabled: true });
    renderPage(p);
    const distribution = document.querySelector<HTMLSelectElement>(`[data-row-id="${aid}"][data-field="distribution"]`)!;

    typeInto(aid, "ml", "30");
    fireEvent.keyDown(cell(aid, "ml"), { key: "Enter" });

    expect(document.activeElement).toBe(distribution);
    // 75 % and 200 % of 30, rounded: nothing but Most Likely was typed.
    expect(stored(p.id, aid)).toMatchObject({ min: 23, mostLikely: 30, max: 60 });
  });

  it("Escape reverts all three cells to the store and leaves them — and the blur it causes commits nothing", () => {
    const { p, aid } = oneRow("Whimbrel penstock");
    renderPage(p);
    const before = frames();

    typeInto(aid, "min", "11");
    tab(aid, "min");
    typeInto(aid, "ml", "3");
    fireEvent.keyDown(cell(aid, "ml"), { key: "Escape" });

    expect(document.activeElement).toBe(document.body);
    expect([cell(aid, "min").value, cell(aid, "ml").value, cell(aid, "max").value]).toEqual(["5", "10", "20"]);
    expect(stored(p.id, aid)).toMatchObject({ min: 5, mostLikely: 10, max: 20 });
    expect(frames()).toBe(before);
    expect(summary()).toBeNull();
    expect(runButton()).toBeEnabled();
  });

  it("Escape also clears a refused cell: the stored number comes back, the red goes, and Run returns", () => {
    const { p, aid } = oneRow("Godwit sump");
    renderPage(p);
    typeInto(aid, "min", "");
    act(() => cell(aid, "min").blur()); // leaves the group: the cleared cell is refused
    expect(cell(aid, "min")).toHaveAttribute("aria-invalid", "true");
    expect(runReason()!.parentElement!.textContent).toContain("Min: Enter a number.");

    act(() => cell(aid, "min").focus());
    fireEvent.keyDown(cell(aid, "min"), { key: "Escape" });

    expect(cell(aid, "min").value).toBe("5");
    expect(cell(aid, "min")).not.toHaveAttribute("aria-invalid");
    expect(runButton()).toBeEnabled();
    expect(runReason()).toBeNull();
  });

  it("a refused cell at the exit: the other typed cell is written; the cleared one stays empty, red and named", () => {
    const { p, aid } = oneRow("Plover leat");
    renderPage(p);
    const before = frames();

    typeInto(aid, "min", "");
    tab(aid, "min");
    typeInto(aid, "ml", "12");
    tab(aid, "ml");
    tab(aid, "max"); // the exit

    expect(stored(p.id, aid)).toMatchObject({ min: 5, mostLikely: 12, max: 20 });
    expect(frames()).toBe(before + 1);
    const min = cell(aid, "min");
    expect(min.value).toBe("");
    expect(min).toHaveAttribute("aria-invalid", "true");
    expect(document.getElementById(min.getAttribute("aria-describedby")!)?.textContent).toBe("Enter a number.");
    expect(runButton()).toBeDisabled();
    expect(runReason()!.parentElement!.textContent).toContain("Min: Enter a number.");
    expect(summary()!.parentElement!.textContent).toContain("Min: Enter a number.");
  });

  it("a refused cell outlives a later visit and an external write; typing a number over it clears it", () => {
    const { p, aid } = oneRow("Turnstone groyne");
    renderPage(p);
    typeInto(aid, "min", "");
    act(() => cell(aid, "min").blur());

    // A later visit that types elsewhere keeps it (locked 8 governs locked 12).
    typeInto(aid, "max", "25");
    act(() => cell(aid, "max").blur());
    expect(stored(p.id, aid)).toMatchObject({ min: 5, mostLikely: 10, max: 25 });
    expect(cell(aid, "min").value).toBe("");
    expect(cell(aid, "min")).toHaveAttribute("aria-invalid", "true");

    // An external write — here an undo — does not clear it either: it stays flagged until filled in.
    act(() => useProjectStore.getState().undo());
    expect(stored(p.id, aid)).toMatchObject({ max: 20 });
    expect(cell(aid, "min").value).toBe("");
    expect(runReason()!.parentElement!.textContent).toContain("Min: Enter a number.");

    // The control, same test: typed over and left, it clears.
    typeInto(aid, "min", "6");
    act(() => cell(aid, "min").blur());
    expect(stored(p.id, aid)).toMatchObject({ min: 6 });
    expect(cell(aid, "min")).not.toHaveAttribute("aria-invalid");
    expect(runButton()).toBeEnabled();
  });

  it("an app or window switch is NOT leaving: the draft waits, uncommitted, and commits when focus really leaves (owner, R214)", () => {
    const { p, aid } = oneRow("Redshank sluice");
    renderPage(p);
    const before = frames();
    typeInto(aid, "min", "11");

    // MEASURED in Chrome 153: switching to another window or app blurs the input while it stays the
    // page's focused element, and `document.hasFocus()` reads false. jsdom cannot switch windows,
    // so that state is reproduced: the input still focused, the page reporting no focus.
    const hasFocus = vi.spyOn(document, "hasFocus").mockReturnValue(false);
    fireEvent.blur(cell(aid, "min"));
    hasFocus.mockRestore();

    expect(document.activeElement).toBe(cell(aid, "min"));
    expect(cell(aid, "min").value).toBe("11");
    expect(stored(p.id, aid)).toMatchObject({ min: 5 });
    expect(frames()).toBe(before);

    // Back, then out for real (a click on the page: the focused element is gone by the blur).
    act(() => cell(aid, "min").blur());
    expect(stored(p.id, aid)).toMatchObject({ min: 11 });
    expect(frames()).toBe(before + 1);
  });

  it("Shift+Tab out of Min leaves the group: the row's own name input is not one of the three cells", () => {
    const { p, aid } = oneRow("Curlew bund");
    renderPage(p);
    typeInto(aid, "min", "7");
    fireEvent.keyDown(cell(aid, "min"), { key: "Tab", shiftKey: true });

    expect(document.activeElement).toBe(cell(aid, "name"));
    expect(stored(p.id, aid)).toMatchObject({ min: 7 });
  });

  it("a click from one row's Min into ANOTHER row's Min leaves the first row's group: it is keyed on the row too", () => {
    let a = "";
    let b = "";
    const p = projectOf((s) => {
      const rowA = activityWith("Stint channel", s, { min: 5, mostLikely: 10, max: 20 });
      const rowB = activityWith("Phalarope bund", s, { min: 2, mostLikely: 3, max: 4 });
      a = rowA.id;
      b = rowB.id;
      return [rowA, rowB];
    });
    renderPage(p);
    typeInto(a, "min", "7");
    act(() => cell(b, "min").focus());

    expect(stored(p.id, a)).toMatchObject({ min: 7 });
    expect(stored(p.id, b)).toMatchObject({ min: 2 });
  });

  it("Delete takes focus before it asks: the draft is committed, and then the confirmation opens", () => {
    const { p, aid } = oneRow("Ruff penstock");
    renderPage(p);
    typeInto(aid, "min", "8");

    // A real click focuses the button first (MEASURED in the pane: the blur's relatedTarget is the
    // Delete button); jsdom's click does not, so the focus move is made explicitly.
    const del = cell(aid, "min").closest(".group\\/row")!.querySelector<HTMLButtonElement>('button[aria-label="Delete activity"]')!;
    act(() => del.focus());
    expect(stored(p.id, aid)).toMatchObject({ min: 8 });
    fireEvent.click(del);
    // The confirmation is asked through the app-wide confirm store (its host is not on this page).
    const pending = useConfirmStore.getState().pending;
    expect(pending?.kind === "confirm" ? pending.options.title : null).toBe("Delete this activity?");
    act(() => useConfirmStore.getState().dismissPending());
  });
});

/**
 * v0.71.1 — the summary's line is an error message: the activity's number, its name, then the
 * problem. The NUMBER follows the project's own "show activity numbers" setting (the owner's rule),
 * so a number in this list is always a number visible in the grid beside it.
 */
describe("v0.71.1 at the page — the summary names the activity the way the grid does", () => {
  function twoRows(showActivityIds: boolean): { p: Project; second: string } {
    let second = "";
    const p = projectOf((s) => {
      const first = activityWith("Teal conduit", s);
      const bad = activityWith("Vireo cutover", s, { min: 30, mostLikely: 10, max: 20 });
      second = bad.id;
      return [first, bad];
    });
    return { p: { ...p, showActivityIds }, second };
  }

  const summaryLine = () => summary()!.parentElement!.querySelector("li")!;

  it("leads with the SAME number the grid shows", () => {
    const { p, second } = twoRows(true);
    renderPage(p);

    // The grid numbers it #2; so does the summary, and the problem follows the name.
    const row = cell(second, "name").closest("div")!.parentElement!;
    expect(within(row).getByText("#2")).toBeInTheDocument();
    expect(summaryLine().textContent).toBe("#2 Vireo cutover: Min is above Most Likely");
  });

  it("shows no number when the project does not number its activities", () => {
    const { p } = twoRows(false);
    renderPage(p);

    // ⚠️ SCOPED: the hidden print report numbers its own rows, so a document-wide text query
    // finds a "#2" that is not on screen.
    const grid = document.querySelector("[data-activity-grid]") as HTMLElement;
    expect(document.querySelectorAll('[data-row-id][data-field="name"]')).toHaveLength(2);
    expect(within(grid).queryByText("#2")).toBeNull();
    expect(within(summary()!.parentElement!).queryByText("#2")).toBeNull();
    expect(summaryLine().textContent).toBe("Vireo cutover: Min is above Most Likely");
  });
});
