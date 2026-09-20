// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * v0.71.0 at the PAGE: the activity grid collapses behind its header bar, and the grid, the
 * Milestones panel and the Dependencies panel each remember being collapsed, per project, in this
 * browser.
 *
 * ⚠️ FOUR OF THESE CAN PASS VACUOUSLY IF WRITTEN THE NATURAL WAY (each measured before this file):
 * - jsdom lets `focus()` land inside a `hidden` subtree, so the jump's ORDER is asserted at
 *   `scrollIntoView` call time, not from where focus ends up;
 * - jsdom computes Tailwind's `hidden` CLASS as `display: block`, so the grid uses the ATTRIBUTE,
 *   and `not.toBeVisible()` here can tell the two apart;
 * - the bar's count and the summary agree at rest whichever rows the bar reads, so the agreement
 *   test writes to the store BETWEEN `pointerdown` and the release;
 * - a storage write that throws fails nothing through a click (see the module's own test).
 *
 * The keyboard itself — Tab reaching the bar, Enter and Space toggling it — is a BROWSER check:
 * jsdom synthesises no click from a key. Here only the element, `aria-expanded` and `aria-controls`.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useNavigate } from "react-router-dom";

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
vi.mock("@ui/hooks/use-simulation", () => ({
  useSimulation: () => ({
    isRunning: false,
    progress: null,
    error: null,
    elapsedMs: null,
    run: vi.fn(),
    cancel: vi.fn(),
  }),
}));

import { ProjectPage } from "./ProjectPage";
import { useProjectStore } from "@ui/hooks/use-project-store";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";
import { createProject, createActivity, createScenario } from "@app/api/project-service";
import { addMilestone } from "@app/api/milestone-service";
import { addBand } from "@app/api/band-service";
import { setStorageNamespace } from "@infrastructure/persistence/local-storage-repository";
import { clearAllCollapsedSections } from "@infrastructure/persistence/section-collapse-memory";
import {
  DEFAULT_USER_PREFERENCES,
  type Activity,
  type Project,
  type Scenario,
  type ScenarioSettings,
} from "@domain/models/types";

const KEY = "spert-scheduler:collapsed-sections:local";

/** An activity as `+ Add Activity` makes it, then patched — never a cast. */
function activityWith(name: string, settings: ScenarioSettings, patch: Partial<Activity> = {}): Activity {
  return { ...createActivity(name, settings), mostLikely: 10, min: 5, max: 20, ...patch };
}

interface Fixture {
  name?: string;
  rows?: Array<string | [string, Partial<Activity>]>;
  settings?: Partial<ScenarioSettings>;
  locked?: boolean;
  band?: boolean;
}

/** Names that appear in no component's static text. */
function projectOf({ name = "Ossory Causeway", rows = ["Tamber sounding", "Wrasse survey"], settings = {}, locked = false, band = false }: Fixture = {}): Project {
  const base = createScenario("Pellucid Baseline", "2026-04-06");
  const s = { ...base.settings, heuristicEnabled: false, ...settings };
  const activities = rows.map((r) => (typeof r === "string" ? activityWith(r, s) : activityWith(r[0], s, r[1])));
  let scenario: Scenario = { ...base, settings: s, locked, activities };
  if (s.dependencyMode) scenario = addMilestone(scenario, "Quillon Gate", "2026-12-31", "ms-quillon");
  if (band && activities[0]) {
    scenario = addBand(scenario, { id: "band-tamarisk", name: "Tamarisk Works", insertBeforeActivityId: activities[0].id });
  }
  return { ...createProject(name, "2026-04-06"), scenarios: [scenario] };
}

function NavTo({ to, label }: { to: string; label: string }) {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(to)}>
      {label}
    </button>
  );
}

function renderPage(project: Project, others: Project[] = []) {
  useProjectStore.setState({ projects: [project, ...others], loadError: false });
  return render(
    <MemoryRouter initialEntries={[`/project/${project.id}`]}>
      {[project, ...others].map((p) => (
        <NavTo key={p.id} to={`/project/${p.id}`} label={`GO TO ${p.name}`} />
      ))}
      <Routes>
        <Route path="/project/:id" element={<ProjectPage />} />
      </Routes>
    </MemoryRouter>
  );
}

const bar = () => screen.getByRole("button", { name: /^Activities \(/ });
const region = () => document.getElementById(bar().getAttribute("aria-controls")!);
const idOf = (p: Project, i: number) => p.scenarios[0]!.activities[i]!.id;
const cell = (id: string, field: string) =>
  document.querySelector<HTMLInputElement>(`[data-row-id="${id}"][data-field="${field}"]`)!;
const summary = () => screen.queryByText(/validation errors$/);
const stored = () => JSON.parse(localStorage.getItem(KEY) ?? "null") as Record<string, string[]> | null;

/** Focus a cell and type into it — focus first, as a user's click or Tab would. */
function typeInto(id: string, field: string, value: string) {
  const el = cell(id, field);
  act(() => el.focus());
  fireEvent.change(el, { target: { value } });
}

/** Clear a Min cell and leave the three estimate cells: the cleared cell is refused, and flagged. */
function refuseMin(id: string) {
  typeInto(id, "min", "");
  act(() => cell(id, "min").blur());
}

/** A store write that flags the first row: 30 / 10 / 20 is out of order. */
function flagFirstRowInStore(p: Project) {
  act(() => {
    const s = p.scenarios[0]!;
    useProjectStore.getState().updateActivityField(p.id, s.id, s.activities[0]!.id, { min: 30 });
  });
}

/** The hold releases a task after `pointerup` (use-held-while-pointer-down.ts). */
const releaseTask = () => act(() => new Promise<void>((r) => setTimeout(r, 0)));

beforeEach(() => {
  localStorage.clear();
  setStorageNamespace("local");
  useProjectStore.setState({ projects: [], loadError: false, undoStack: [], redoStack: [] });
  usePreferencesStore.setState({ preferences: { ...DEFAULT_USER_PREFERENCES } });
});

afterEach(() => {
  vi.restoreAllMocks();
  setStorageNamespace("local");
});

describe("the activity grid's bar", () => {
  it("a project opens EXPANDED, under a bar that is a button naming its region", () => {
    const p = projectOf();
    renderPage(p);

    expect(bar().tagName).toBe("BUTTON");
    expect(bar()).toHaveAttribute("aria-expanded", "true");
    expect(within(region()!).getByDisplayValue("Tamber sounding")).toBeVisible();
    expect(bar().textContent).toBe("Activities (2)Hide");
    expect(stored()).toBeNull();
  });

  it("Hide hides the rows and the Add buttons with the hidden attribute; Show brings them back", () => {
    const p = projectOf();
    renderPage(p);

    fireEvent.click(bar());
    expect(bar()).toHaveAttribute("aria-expanded", "false");
    expect(region()).toHaveAttribute("hidden");
    expect(cell(idOf(p, 0), "name")).not.toBeVisible();
    expect(screen.getByText("+ Add Activity")).not.toBeVisible();
    expect(bar().textContent).toBe("Activities (2)Show");

    fireEvent.click(bar());
    expect(bar()).toHaveAttribute("aria-expanded", "true");
    expect(region()).not.toHaveAttribute("hidden");
    expect(cell(idOf(p, 0), "name")).toBeVisible();
  });

  it("the collapse is remembered per project across a remount, and expanding forgets it", () => {
    const p = projectOf();
    const first = renderPage(p);
    fireEvent.click(bar());
    expect(stored()).toEqual({ [p.id]: ["grid"] });
    first.unmount();

    const second = renderPage(p);
    expect(bar()).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(bar());
    expect(stored()).toBeNull();
    second.unmount();

    renderPage(p);
    expect(bar()).toHaveAttribute("aria-expanded", "true");
  });

  it("counts activities, not section headers", () => {
    renderPage(projectOf({ band: true }));
    expect(screen.getByDisplayValue("Tamarisk Works")).toBeTruthy();
    expect(bar().textContent).toContain("Activities (2)");
  });

  it("with no activities it reads Activities (0), and still toggles", () => {
    renderPage(projectOf({ rows: [] }));
    expect(bar().textContent).toContain("Activities (0)");
    fireEvent.click(bar());
    expect(bar()).toHaveAttribute("aria-expanded", "false");
  });

  it("a locked scenario still toggles", () => {
    renderPage(projectOf({ locked: true }));
    fireEvent.click(bar());
    expect(bar()).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(bar());
    expect(bar()).toHaveAttribute("aria-expanded", "true");
  });
});

describe("a collapsed grid never hides a flag", () => {
  it("collapsed, the bar reads · 1 flagged, and the summary is still shown above it", () => {
    const p = projectOf();
    renderPage(p);
    refuseMin(idOf(p, 0));
    // Expanded, the red cell and the summary say it; the bar does not: the count belongs to the
    // collapsed bar (the owner's rule).
    expect(bar().textContent).toBe("Activities (2)Hide");

    fireEvent.click(bar());
    expect(bar().textContent).toBe("Activities (2)Show· 1 flagged");
    expect(summary()).toBeVisible();
    expect(summary()!.textContent).toBe("1 activity has validation errors");
  });

  it("the bar and the summary agree THROUGH a press: a store write mid-press shows on neither until the release", async () => {
    const p = projectOf();
    renderPage(p);
    fireEvent.click(bar());

    fireEvent.pointerDown(window);
    flagFirstRowInStore(p);
    expect(summary()).toBeNull();
    expect(bar().textContent).not.toContain("flagged");

    fireEvent.pointerUp(window);
    await releaseTask();
    expect(summary()).not.toBeNull();
    expect(bar().textContent).toContain("· 1 flagged");
  });

  it("while collapsed the count follows the store: a write flags a row, and Ctrl+Z unflags it", () => {
    const p = projectOf();
    renderPage(p);
    fireEvent.click(bar());

    flagFirstRowInStore(p);
    expect(bar().textContent).toContain("· 1 flagged");

    fireEvent.keyDown(document.body, { key: "z", ctrlKey: true });
    expect(bar().textContent).not.toContain("flagged");
    expect(bar()).toHaveAttribute("aria-expanded", "false");
  });
});

describe("collapsed is hidden, not unmounted", () => {
  it("a refused cell keeps its text and its red, and a selection and a staged bulk value survive", () => {
    const p = projectOf({ rows: ["Tamber sounding", "Wrasse survey", "Garfish trawl"] });
    renderPage(p);
    refuseMin(idOf(p, 0));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select activity Wrasse survey" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Set status for selected activities" }), {
      target: { value: "inProgress" },
    });

    fireEvent.click(bar());
    expect(summary()!.textContent).toBe("1 activity has validation errors");
    fireEvent.click(bar());

    expect(cell(idOf(p, 0), "min").value).toBe("");
    expect(cell(idOf(p, 0), "min")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("checkbox", { name: "Select activity Wrasse survey" })).toBeChecked();
    expect(screen.getByRole("combobox", { name: "Set status for selected activities" })).toHaveValue("inProgress");
    expect(summary()!.textContent).toBe("1 activity has validation errors");
  });
});

describe("the validation summary's jump", () => {
  /** Records, at each `scrollIntoView` CALL, whether the target was still inside a `[hidden]` region. */
  function recordHiddenAtScroll(run: () => void): boolean[] {
    const hidden: boolean[] = [];
    const prior = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (this: Element, options?: ScrollIntoViewOptions | boolean) {
      hidden.push(this.closest("[hidden]") !== null);
      return prior.call(this, options);
    };
    try {
      run();
    } finally {
      Element.prototype.scrollIntoView = prior;
    }
    return hidden;
  }

  it("on a collapsed grid it expands FIRST, then scrolls to the row and focuses its Name cell", () => {
    const p = projectOf();
    renderPage(p);
    refuseMin(idOf(p, 0));
    fireEvent.click(bar());

    const hiddenAtScroll = recordHiddenAtScroll(() =>
      fireEvent.click(screen.getByRole("button", { name: "Tamber sounding" }))
    );

    expect(hiddenAtScroll).toEqual([false]);
    expect(bar()).toHaveAttribute("aria-expanded", "true");
    expect(document.activeElement).toBe(cell(idOf(p, 0), "name"));
    // Expanding by the jump is remembered like any other expand.
    expect(stored()).toBeNull();
  });

  it("on an expanded grid it scrolls and focuses exactly as before, and writes nothing", () => {
    const p = projectOf();
    renderPage(p);
    refuseMin(idOf(p, 0));
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    const hiddenAtScroll = recordHiddenAtScroll(() =>
      fireEvent.click(screen.getByRole("button", { name: "Tamber sounding" }))
    );

    expect(hiddenAtScroll).toEqual([false]);
    expect(document.activeElement).toBe(cell(idOf(p, 0), "name"));
    expect(setItem.mock.calls.filter(([key]) => String(key).includes("collapsed-sections"))).toEqual([]);
  });

  it("in a locked scenario it expands and scrolls, and cannot focus the disabled Name cell", () => {
    // A row flagged from saved data: 30 / 10 / 20 is out of order.
    const p = projectOf({ rows: [["Tamber sounding", { min: 30 }], "Wrasse survey"], locked: true });
    renderPage(p);
    fireEvent.click(bar());

    const hiddenAtScroll = recordHiddenAtScroll(() =>
      fireEvent.click(screen.getByRole("button", { name: "Tamber sounding" }))
    );

    expect(hiddenAtScroll).toEqual([false]);
    expect(bar()).toHaveAttribute("aria-expanded", "true");
    expect(cell(idOf(p, 0), "name")).toBeDisabled();
    expect(document.activeElement).not.toBe(cell(idOf(p, 0), "name"));
  });
});

describe("remembered per user and per project", () => {
  it("user X's collapse is not user Y's, although sign-out and sign-in happen in place", () => {
    const p = projectOf();
    setStorageNamespace("uid-X");
    renderPage(p);
    fireEvent.click(bar());
    expect(localStorage.getItem("spert-scheduler:collapsed-sections:uid-X")).toContain(p.id);

    // Sign-out, in StorageProvider's order: the store zeroed, X's keys cleared, then the namespace
    // back to local. No navigation: the page stays mounted.
    act(() => {
      useProjectStore.setState({ projects: [] });
      clearAllCollapsedSections();
      setStorageNamespace("local");
    });
    // Sign-in as Y, who can open the same project.
    act(() => {
      setStorageNamespace("uid-Y");
      useProjectStore.setState({ projects: [p] });
    });

    expect(bar()).toHaveAttribute("aria-expanded", "true");
  });

  /**
   * ⚠️ A DIRECT `/project/:id` change is the only way the page stays mounted across projects: every
   * link to a project in the app is on /projects or /settings, so a UI trip A → B → A REMOUNTS it and
   * exercises only the stored map. This is what pins the per-project TAG on the in-memory toggle.
   */
  it("A collapsed → B expanded → A collapsed, on one mounted page", () => {
    const a = projectOf({ name: "Aardvark Causeway" });
    const b = projectOf({ name: "Bittern Causeway" });
    renderPage(a, [b]);
    fireEvent.click(bar());
    const heading = screen.getAllByRole("heading", { level: 1 })[0];

    fireEvent.click(screen.getByRole("button", { name: "GO TO Bittern Causeway" }));
    expect(screen.getAllByRole("heading", { level: 1 })[0]).toBe(heading); // the premise: not remounted
    expect(bar()).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(screen.getByRole("button", { name: "GO TO Aardvark Causeway" }));
    expect(bar()).toHaveAttribute("aria-expanded", "false");
  });
});

describe("the Milestones and Dependencies panels", () => {
  const milestones = () => screen.getByRole("button", { name: "Milestones" });
  const dependencies = () => screen.getByRole("button", { name: "Dependencies" });

  it("start expanded, and each header is a disclosure naming its body", () => {
    renderPage(projectOf({ settings: { dependencyMode: true } }));
    for (const header of [milestones(), dependencies()]) {
      expect(header).toHaveAttribute("aria-expanded", "true");
      expect(document.getElementById(header.getAttribute("aria-controls")!)).not.toBeNull();
    }
    expect(screen.getByDisplayValue("Quillon Gate")).toBeVisible();
  });

  it("each remembers its own collapse per project, apart from the other and from the grid", () => {
    const p = projectOf({ settings: { dependencyMode: true } });
    const first = renderPage(p);

    fireEvent.click(milestones());
    expect(milestones()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByDisplayValue("Quillon Gate")).toBeNull();
    expect(dependencies()).toHaveAttribute("aria-expanded", "true");
    expect(bar()).toHaveAttribute("aria-expanded", "true");
    expect(stored()).toEqual({ [p.id]: ["milestones"] });
    first.unmount();

    renderPage(p);
    expect(milestones()).toHaveAttribute("aria-expanded", "false");
    expect(dependencies()).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(dependencies());
    fireEvent.click(bar());
    expect(stored()).toEqual({ [p.id]: ["milestones", "dependencies", "grid"] });

    fireEvent.click(milestones());
    expect(milestones()).toHaveAttribute("aria-expanded", "true");
    expect(stored()).toEqual({ [p.id]: ["dependencies", "grid"] });
  });
});

describe("storage that refuses", () => {
  it("the bar still toggles, and nothing is remembered", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    });
    const p = projectOf();
    renderPage(p);

    fireEvent.click(bar());
    expect(bar()).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(bar());
    expect(bar()).toHaveAttribute("aria-expanded", "true");
    expect(stored()).toBeNull();
  });
});

/**
 * WCAG 2.1.2 (v0.71.0). Shift+Tab from the FIRST row's name used to be cancelled with nowhere to go,
 * so the keyboard could not leave the grid upward — to its own bar or to anything above it. jsdom has
 * no Tab navigation of its own, so what is pinned is whether the page CANCELS the browser's: a
 * cancelled Tab is `fireEvent` returning false.
 */
describe("the keyboard leaves the grid in both directions", () => {
  it("Shift+Tab from the FIRST row's name is left to the browser", () => {
    const p = projectOf({ band: true });
    renderPage(p);
    const name = cell(idOf(p, 0), "name");
    act(() => name.focus());

    const notCancelled = fireEvent.keyDown(name, { key: "Tab", shiftKey: true });

    expect(notCancelled).toBe(true);
    expect(document.activeElement).toBe(name);
  });

  it("Shift+Tab from a later row's name still moves to the row above, and cancels the browser's", () => {
    const p = projectOf();
    renderPage(p);
    const name = cell(idOf(p, 1), "name");
    act(() => name.focus());

    const notCancelled = fireEvent.keyDown(name, { key: "Tab", shiftKey: true });

    expect(notCancelled).toBe(false);
    expect(document.activeElement).toBe(cell(idOf(p, 0), "max"));
  });

  it("Tab from the LAST row's last cell lands on + Add Activity", () => {
    const p = projectOf();
    renderPage(p);
    const max = cell(idOf(p, 1), "max");
    act(() => max.focus());

    const notCancelled = fireEvent.keyDown(max, { key: "Tab" });

    expect(notCancelled).toBe(false);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "+ Add Activity" }));
  });
});
