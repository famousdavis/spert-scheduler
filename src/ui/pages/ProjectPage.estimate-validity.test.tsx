// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * WI-49 (v0.69.0) at the PAGE: estimate validity derived from saved data, plus the two row
 * states saved data cannot see, read by every site that decides what the user sees.
 *
 * ⚠️ WHY THE PAGE AND NOT THE HOOK. The helper tests take the gate's inputs as arguments, so a
 * page that handed them the WRONG set would pass all of them. Every fixture here renders the
 * real `ProjectPage` on a real store and drives the grid's own Tab handling, which is
 * programmatic (`focusField` → `el.focus()`), so jsdom produces the same blur sequence a browser
 * does for a Tab.
 *
 * The fixtures named "second", "third" and "fourth" are the executor brief's (§3.2, R207.3,
 * R208, R209). Each one was pre-registered to FAIL a specific wrong gate; the plants that
 * demonstrate it are recorded in the PR body, not kept here.
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
    tab(aid, "min"); // to Most Likely: saved 5/1/1, half-typed
    expect(document.activeElement).toBe(cell(aid, "ml"));
    expect(stored(p.id, aid)).toMatchObject({ min: 5, mostLikely: 1, max: 1 });
    expect(summary()).toBeNull();
    expect(bannerHeading()).toBeNull();

    // The control, same test: out through Max, and the row is flagged — summary AND banner.
    tab(aid, "ml");
    tab(aid, "max");
    expect(summary()).not.toBeNull();
    expect(bannerMessage()).toContain("Ostrander survey");
  });
});

describe("the banner's gate — the brief's second, third and fourth fixtures", () => {
  it("SECOND: a loaded flagged T-Normal row and a half-typed fresh row show NO banner", () => {
    // A page-wide "some row is flagged" gate fails this: the T-Normal row IS flagged, and the
    // engine throws on the half-typed Triangular row — so that gate shows the banner.
    let fresh = "";
    const p = projectOf((s) => {
      const tNormal = activityWith("Tarragon calibration", s, {
        min: 14, mostLikely: 13, max: 22, distributionType: "normal",
      });
      const f = activityWith("Wicklow handover", s);
      fresh = f.id;
      return [tNormal, f];
    });
    renderPage(p);
    expect(within(summary()!.parentElement!).getByText("Tarragon calibration")).toBeTruthy();
    expect(bannerHeading()).toBeNull(); // T-Normal builds: nothing to show at mount

    typeInto(fresh, "min", "5");
    tab(fresh, "min");

    expect(stored(p.id, fresh)).toMatchObject({ min: 5, mostLikely: 1, max: 1 });
    expect(bannerHeading()).toBeNull();
    // Run still refuses, and says why, below the grid.
    expect(runButton()).toBeDisabled();
    expect(runReason()).not.toBeNull();
  });

  it.each([
    ["sequential", false],
    ["dependency", true],
  ])("THIRD (%s mode): a half-typed row ABOVE a flagged one leaves the banner on, naming the flagged row", (_mode, dependencyMode) => {
    // The engine builds in ARRAY order in both modes and reports only its first throw.
    // Pre-registered failures: a first-thrower gate REMOVES the banner at the Tab (A throws
    // first and is not flagged); a gate that keeps the engine's message NAMES A.
    let a = "";
    const p = projectOf(
      (s) => {
        const rowA = activityWith("Amberley footing", s); // 1/1/1, all-equal at mount
        a = rowA.id;
        const rowB = activityWith("Bexhill parapet", s, { min: 14, mostLikely: 13, max: 22 });
        return [rowA, rowB];
      },
      { dependencyMode }
    );
    renderPage(p);
    expect(bannerMessage()).toContain("Bexhill parapet");

    typeInto(a, "min", "5");
    tab(a, "min");

    expect(stored(p.id, a)).toMatchObject({ min: 5, mostLikely: 1, max: 1 });
    const message = bannerMessage();
    expect(message).toContain("Bexhill parapet");
    expect(message).not.toContain("Amberley footing");
  });

  it("FOURTH: a half-typed row with a cleared cell is summarised by that cell, and shows NO banner", () => {
    // Its saved 5/1/1 still throws, but its ordering issue is held back (mid-entry), and a
    // cleared cell never qualifies a thrower — the store still holds the old number.
    let f = "";
    const p = projectOf((s) => {
      const row = activityWith("Fenwick culvert", s);
      f = row.id;
      return [row];
    });
    renderPage(p);

    typeInto(f, "min", "5");
    tab(f, "min");
    typeInto(f, "ml", "");
    tab(f, "ml");

    expect(stored(p.id, f)).toMatchObject({ min: 5, mostLikely: 1, max: 1 });
    const box = summary()!.parentElement!;
    expect(box.textContent).toContain("Fenwick culvert");
    expect(box.textContent).toContain("Most Likely: Enter a number.");
    expect(box.textContent).not.toContain("Min must be <= Most Likely");
    expect(bannerHeading()).toBeNull();
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
    expect(document.getElementById(describedBy!)?.textContent).toBe("Min must be <= Most Likely");
    expect(cell(aid, "ml")).not.toHaveAttribute("aria-invalid");
    expect(summary()!.parentElement!.textContent).toContain("Kittiwake abutment");
    expect(runButton()).toBeDisabled();
    expect(runReason()!.parentElement!.textContent).toContain("Kittiwake abutment");
  });

  it("a LogNormal 0/0/0 row is flagged at mount on Max, and stays listed after a tab-through", () => {
    // Before v0.69.0 this row passed the schema and silently blanked the schedule. And a look
    // at its cells no longer drops it from the summary: mid-entry holds back ORDERING only.
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
    tab(aid, "ml"); // two of three visited: the row now reports mid-entry
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
      expect(t).toContain("Min must be <= Most Likely");
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
    tab(aid, "min");
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
    tab(aid, "min");
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
    tab(gone, "min");
    expect(runButton()).toBeDisabled();

    act(() => useProjectStore.getState().deleteActivity(p.id, p.scenarios[0]!.id, gone));
    expect(runButton()).toBeEnabled(); // G2: the report left with its row
    act(() => useProjectStore.getState().undo());

    expect(cell(gone, "min").value).toBe("5");
    expect(cell(keep, "min").value).toBe("2");
    expect(runButton()).toBeEnabled();
    expect(runReason()).toBeNull();
  });

  it("a half-typed row's stale mid-entry does not silence a later save of an out-of-order triple (G-D)", () => {
    // Min typed, then the row left WITHOUT visiting all three cells; then the dialog's save
    // path writes 14/13/22. The row's last report still says mid-entry — for the 5/1/1 it saw.
    let aid = "";
    const p = projectOf((s) => {
      const a = activityWith("Wigeon spillway", s);
      aid = a.id;
      return [a];
    });
    renderPage(p);
    typeInto(aid, "min", "5");
    act(() => cell(aid, "min").blur());
    expect(summary()).toBeNull(); // held back: half-typed

    act(() =>
      useProjectStore.getState().updateActivityField(p.id, p.scenarios[0]!.id, aid, { min: 14, mostLikely: 13, max: 22 })
    );

    expect(summary()!.parentElement!.textContent).toContain("Wigeon spillway");
    expect(cell(aid, "min")).toHaveAttribute("aria-invalid", "true");
  });

  it("UNTIL PR 2 — a fresh row abandoned after Min is saved 5/1/1: Run refused with a reason, no summary, no banner", () => {
    // PR 2 (group commit) flags this at the exit; under PR 1 the half-typed triple is held
    // back from the summary and the banner, and only the reason below the grid explains Run.
    let aid = "";
    const p = projectOf((s) => {
      const a = activityWith("Gadwall intake", s);
      aid = a.id;
      return [a];
    });
    renderPage(p);
    typeInto(aid, "min", "5");
    act(() => cell(aid, "min").blur());

    expect(stored(p.id, aid)).toMatchObject({ min: 5, mostLikely: 1, max: 1 });
    expect(runButton()).toBeDisabled();
    expect(runReason()!.parentElement!.textContent).toContain("Gadwall intake");
    expect(summary()).toBeNull();
    expect(bannerHeading()).toBeNull();
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
    tab(aid, "min");
    expect(cell(aid, "min")).toHaveAttribute("aria-invalid", "true");
    expect(summary()).not.toBeNull();
    act(() => cell(aid, "ml").blur());

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
    tab(aid, "ml"); // saved 1/20/1: out of order, and half-typed, so the summary is held back
    expect(summary()).toBeNull();
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
