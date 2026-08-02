// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * ProjectPage — charter §3.6. COVER, not decompose.
 *
 * 1,074 lines, max cc 14, and zero tests until this file. It is one of the nine uncovered
 * sub-threshold functions in docs/CENSUS_cognitive-complexity-2026-08-02.md and the
 * charter's candidate for "the file where a change is least checkable". A file at 0%
 * cannot be safely decomposed, because nothing would tell you if you broke it — so this
 * is coverage first, decomposition later or never.
 *
 * WHAT IS TESTED: the orchestration seams — the places ProjectPage *decides* something.
 * Which scenario is active, which schedule engine runs, which banner shows, which guard
 * refuses, what a keystroke reaches. NOT layout, styling, or SVG geometry; those belong
 * to gantt-utils' unit tests and are explicitly out of scope per the charter.
 *
 * ⚠️ ASSERTION HYGIENE. This page renders forty-odd components, so the DOM is full of
 * words a lazy assertion would match by accident — the failure that produced ledger #12.
 * Fixture names below appear nowhere in any component's static text, and every assertion
 * is one only the intended state can satisfy.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useNavigate } from "react-router-dom";

// --- mocks, declared before the component import so vi.mock hoisting catches them ---

// Firestore-backed AI session: the real hook opens a listener at mount.
const aiHook = vi.hoisted(() => ({
  sessionState: { sessionActive: false, aiConnected: false },
  startSession: vi.fn(async () => true),
  stopSession: vi.fn(async () => {}),
  changePermissions: vi.fn(),
}));
vi.mock("@ui/hooks/use-ai-connectivity", () => ({
  useAiConnectivity: () => aiHook,
}));

// ProjectPage renders SharingSection transitively, which calls useAuth. Same two provider
// mocks ImportSection.test.tsx uses.
vi.mock("@ui/providers/AuthProvider", () => ({
  useAuth: vi.fn(() => ({ user: null })),
}));
vi.mock("@ui/providers/StorageProvider", () => ({
  useStorage: vi.fn(() => ({ mode: "local", storageReady: true })),
}));

/**
 * ⚠️ `isFirebaseAvailable` is derived from VITE_FIREBASE_API_KEY, so it is TRUE on a
 * developer machine carrying .env.local and FALSE in CI, which has no secrets. The Connect
 * AI tests below passed locally and failed in CI for exactly that reason — an ambient
 * dependency, not a code fault.
 *
 * Both branches are real shipped modes (cloud-configured and local-only), so the flag is
 * driven explicitly here and both are covered. Every other export is spread through from
 * the real module, because SharingSection and ConnectAiPanel import `db` and the callable
 * factories from it.
 */
const firebaseEnv = vi.hoisted(() => ({ available: true }));
vi.mock("@infrastructure/firebase/firebase", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@infrastructure/firebase/firebase")>();
  return {
    ...actual,
    get isFirebaseAvailable() {
      return firebaseEnv.available;
    },
  };
});

import { ProjectPage } from "./ProjectPage";
import { useProjectStore } from "@ui/hooks/use-project-store";
import { useNotificationStore } from "@ui/hooks/use-notification-store";
import {
  createProject,
  createActivity,
  createScenario,
  addActivityToScenario,
} from "@app/api/project-service";
import { setLastScenarioId } from "@infrastructure/persistence/scenario-memory";
import { MAX_SCENARIOS_PER_PROJECT } from "@domain/models/types";
import type { Project, Scenario } from "@domain/models/types";

// Names that appear in no component's static text, so an assertion on one can only be
// satisfied by the fixture actually rendering.
const PROJECT_NAME = "Zarquon Bridge Retrofit";
const OTHER_PROJECT_NAME = "Perihelion Vault Cutover";
const SCENARIO_A = "Marimba Baseline";
const SCENARIO_B = "Thicket Downside";
const SCENARIO_C = "Kestrel Upside";
const SCENARIO_D = "Halyard Contingency";

/**
 * Each scenario carries a uniquely-named activity, because that is how "which scenario is
 * active" becomes observable WITHOUT asserting on styling.
 *
 * ⚠️ The scenario tab is a clickable `<div>` with no role, no `aria-current` and no
 * `aria-selected` — active state is carried only by CSS classes, and the charter rules out
 * asserting on class strings. So these tests assert the downstream consequence instead:
 * the activity grid shows the ACTIVE scenario's activities. That is what a user actually
 * sees, and it cannot be satisfied by decoration. (The missing semantics are reported as a
 * finding; they are not fixed here.)
 */
const activityOf = (scenarioName: string) => `${scenarioName} survey task`;

function scenarioNamed(name: string): Scenario {
  // createActivity(name, settings) — the estimates come from the scenario's own settings,
  // not from positional arguments. An earlier draft passed (name, 3, 5, 10); vitest and
  // ESLint both accepted it and only `tsc -b` objected, which is why the gate is run whole.
  const scenario = createScenario(name, "2026-04-06");
  return addActivityToScenario(
    scenario,
    createActivity(activityOf(name), scenario.settings)
  );
}

function makeProject(
  name = PROJECT_NAME,
  scenarioNames: string[] = [SCENARIO_A]
): Project {
  const p = createProject(name, "2026-04-06");
  return { ...p, scenarios: scenarioNames.map(scenarioNamed) };
}

function routes() {
  return (
    <Routes>
      <Route path="/project/:id" element={<ProjectPage />} />
      <Route path="/projects" element={<div>PROJECTS DASHBOARD</div>} />
    </Routes>
  );
}

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}>{routes()}</MemoryRouter>);
}

/**
 * A real in-app navigation trigger, mounted beside the routes.
 *
 * ⚠️ Re-rendering `<MemoryRouter initialEntries={[...]}>` with a different entry does
 * NOTHING — `initialEntries` is read once at mount. An earlier draft of the leak test did
 * exactly that, never navigated, and would have proved nothing had it happened to pass.
 * `useNavigate` performs the genuine transition.
 */
function NavTo({ to, label }: { to: string; label: string }) {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(to)}>
      {label}
    </button>
  );
}

function renderPage(project: Project, extraProjects: Project[] = []) {
  useProjectStore.setState({
    projects: [project, ...extraProjects],
    loadError: false,
  });
  return renderAt(`/project/${project.id}`);
}

/**
 * The scenario tab's selection control — a real button, queryable by role and name.
 *
 * ✅ v0.62.2. Until then the tab was a <span> inside a click-handling <div>: no role, no
 * aria-current, no tab stop. These tests had to infer the active scenario from the ACTIVITY
 * GRID's contents because there was no accessible way to ask the tab itself. That workaround
 * is deleted; if this query ever stops resolving, the accessibility fix has regressed.
 */
function tabButton(name: string): HTMLElement {
  return screen.getByRole("button", { name });
}

/** The tab row itself — the layout container holding the per-tab controls. */
function tabRoot(name: string): HTMLElement {
  return tabButton(name).parentElement!;
}

/**
 * Assert which scenario is active by asking the tab, the way assistive technology does.
 * `aria-current` is the affordance v0.62.2 added; before it, nothing in the accessibility
 * tree distinguished the active tab from the rest.
 */
function expectActiveScenario(active: string, inactive: string[] = []) {
  expect(tabButton(active)).toHaveAttribute("aria-current", "true");
  // `inactive` means PRESENT BUT NOT ACTIVE. A tab that is absent entirely is a different
  // claim and gets expectNoTab — collapsing the two into "absent or not current" would be a
  // disjunction that both states satisfy.
  for (const other of inactive) {
    expect(tabButton(other)).not.toHaveAttribute("aria-current");
  }
}

/** No tab by this name exists — the project does not carry that scenario. */
function expectNoTab(name: string) {
  expect(screen.queryByRole("button", { name })).toBeNull();
}

/** Text of the error toasts currently in the real notification store. */
function errorToasts(): string[] {
  return useNotificationStore
    .getState()
    .notifications.filter((n) => n.type === "error")
    .map((n) => n.message);
}

beforeEach(() => {
  localStorage.clear();
  useProjectStore.setState({ projects: [], loadError: false });
  useNotificationStore.setState({ notifications: [] });
  aiHook.sessionState = { sessionActive: false, aiConnected: false };
  firebaseEnv.available = true;
});

afterEach(() => {
  vi.restoreAllMocks();
  document.title = "SPERT Scheduler";
});

// -- project resolution -------------------------------------------------------

describe("ProjectPage — resolving the route's project", () => {
  it("renders the project name as the page heading", () => {
    renderPage(makeProject());
    // Two h1s carry it — the page header and PrintableReport's print-only copy.
    expect(screen.getAllByRole("heading", { level: 1 })[0]).toHaveTextContent(
      PROJECT_NAME
    );
  });

  it("an unknown :id renders the unavailable message, not a blank page", () => {
    renderAt("/project/does-not-exist");
    expect(
      screen.getByText("This project is no longer available.")
    ).toBeInTheDocument();
    expect(screen.queryAllByRole("heading", { level: 1 })).toHaveLength(0);
  });

  it("Back to projects navigates to the dashboard", () => {
    renderAt("/project/does-not-exist");
    fireEvent.click(screen.getByRole("button", { name: "Back to projects" }));
    expect(screen.getByText("PROJECTS DASHBOARD")).toBeInTheDocument();
  });

  it("sets the document title from the project name, and restores it on unmount", () => {
    const { unmount } = renderPage(makeProject());
    expect(document.title).toContain(PROJECT_NAME);
    expect(document.title).toContain("SPERT Scheduler for");

    unmount();

    expect(document.title).toBe("SPERT Scheduler");
  });
});

// -- the active-scenario derivation (the v0.61.0 / C5 fix) --------------------

describe("ProjectPage — which scenario is active", () => {
  it("with no stored choice, the first scenario is active", () => {
    renderPage(makeProject(PROJECT_NAME, [SCENARIO_A, SCENARIO_B]));
    expectActiveScenario(SCENARIO_A, [SCENARIO_B]);
  });

  it("a remembered scenario wins over the first", () => {
    const p = makeProject(PROJECT_NAME, [SCENARIO_A, SCENARIO_B]);
    setLastScenarioId(p.id, p.scenarios[1]!.id);
    renderPage(p);
    expectActiveScenario(SCENARIO_B, [SCENARIO_A]);
  });

  it("a remembered scenario that no longer exists falls back to the first", () => {
    const p = makeProject(PROJECT_NAME, [SCENARIO_A, SCENARIO_B]);
    setLastScenarioId(p.id, "deleted-scenario-id");
    renderPage(p);
    // Heals on render rather than leaving a dangling id and rendering nothing.
    expectActiveScenario(SCENARIO_A, [SCENARIO_B]);
  });

  it("clicking a tab makes it active and remembers it", () => {
    const p = makeProject(PROJECT_NAME, [SCENARIO_A, SCENARIO_B]);
    renderPage(p);

    fireEvent.click(tabButton(SCENARIO_B));

    expectActiveScenario(SCENARIO_B, [SCENARIO_A]);
    // Remembered for next time.
    const stored = localStorage.getItem(
      "spert-scheduler:active-scenarios:local"
    );
    expect(stored).toContain(p.scenarios[1]!.id);
  });

  /**
   * The v0.61.0 regression, at the DOM level.
   *
   * `{ path: "project/:id" }` has no route key, so navigating project → project keeps this
   * component MOUNTED and only changes the param. Before C5 the selected scenario id
   * survived that transition, matched nothing in the new project, and rendered no scenario
   * at all.
   *
   * ⚠️ SCOPE, MEASURED. This guards the user-facing outcome — navigate project → project
   * and the new project's scenario renders. It does NOT guard the project-SCOPING half of
   * the derivation: removing `selection.projectId === project.id` by mutation left this
   * test green, because the leftover id fails the existence check beside it anyway. The
   * test below isolates that branch; this one must not be cited for it.
   */
  it("a scenario chosen in one project does not leak into the next", () => {
    const first = makeProject(PROJECT_NAME, [SCENARIO_A, SCENARIO_B]);
    const second = makeProject(OTHER_PROJECT_NAME, [SCENARIO_C]);
    useProjectStore.setState({ projects: [first, second], loadError: false });

    render(
      <MemoryRouter initialEntries={[`/project/${first.id}`]}>
        <NavTo to={`/project/${second.id}`} label="GO TO SECOND PROJECT" />
        {routes()}
      </MemoryRouter>
    );
    fireEvent.click(tabButton(SCENARIO_B));
    expectActiveScenario(SCENARIO_B, [SCENARIO_A]);
    const headingBefore = screen.getAllByRole("heading", { level: 1 })[0];

    fireEvent.click(
      screen.getByRole("button", { name: "GO TO SECOND PROJECT" })
    );

    // ⚠️ PREMISE FIRST. This test is only about C5 if the component stayed MOUNTED across
    // the transition — a remount would reset `selection` to null and make it pass for the
    // wrong reason. React reuses the DOM node only when the instance persists, so node
    // identity is the direct check.
    const headingAfter = screen.getAllByRole("heading", { level: 1 })[0];
    expect(headingAfter).toBe(headingBefore);

    expect(headingAfter).toHaveTextContent(OTHER_PROJECT_NAME);
    expectActiveScenario(SCENARIO_C);
    expectNoTab(SCENARIO_A);
    expectNoTab(SCENARIO_B);
  });

  /**
   * Isolates the project-scoping branch from the existence check sitting beside it.
   *
   * Both defences normally give the same answer, which is why the test above cannot tell
   * them apart. They diverge only when the leftover scenario id ALSO EXISTS in the next
   * project — so the fixture puts the first project's scenario id on a NON-first scenario
   * of the second. Unscoped, that leftover would win and render SCENARIO_D. Scoped, the
   * selection is discarded and the derivation falls through to the first scenario.
   *
   * Defence in depth: two projects sharing a scenario id is not something the app mints
   * today (clone regenerates ids). The branch exists, so it is pinned.
   */
  it("a leftover selection is discarded even when its id exists in the next project", () => {
    const first = makeProject(PROJECT_NAME, [SCENARIO_A, SCENARIO_B]);
    const collidingId = first.scenarios[1]!.id;
    const second = {
      ...makeProject(OTHER_PROJECT_NAME, [SCENARIO_C]),
      scenarios: [
        scenarioNamed(SCENARIO_C),
        { ...scenarioNamed(SCENARIO_D), id: collidingId },
      ],
    };
    useProjectStore.setState({ projects: [first, second], loadError: false });

    render(
      <MemoryRouter initialEntries={[`/project/${first.id}`]}>
        <NavTo to={`/project/${second.id}`} label="GO TO SECOND PROJECT" />
        {routes()}
      </MemoryRouter>
    );
    fireEvent.click(tabButton(SCENARIO_B));
    expectActiveScenario(SCENARIO_B, [SCENARIO_A]);

    fireEvent.click(
      screen.getByRole("button", { name: "GO TO SECOND PROJECT" })
    );

    // SCENARIO_D carries the leftover id. If the selection were not scoped to its own
    // project it would win here.
    expectActiveScenario(SCENARIO_C, [SCENARIO_D]);
  });

  /**
   * The v0.62.2 defect, guarded directly.
   *
   * ⚠️ jsdom does not synthesise a click from Enter/Space on a focused button, so the
   * FOCUSABILITY assertion is the half that guards the defect: the old <span> could not hold
   * focus at all, which is precisely why the tabs were keyboard-unreachable. The click that
   * follows is what a real browser produces once focus is there.
   */
  it("a keyboard user can focus a scenario tab and activate it", () => {
    renderPage(makeProject(PROJECT_NAME, [SCENARIO_A, SCENARIO_B]));
    const target = tabButton(SCENARIO_B);

    target.focus();
    expect(document.activeElement).toBe(target);

    fireEvent.click(target);

    expectActiveScenario(SCENARIO_B, [SCENARIO_A]);
  });

  it("the drag handle is named, so the tab's focus stop is not anonymous", () => {
    renderPage(makeProject(PROJECT_NAME, [SCENARIO_A]));
    expect(
      screen.getByRole("button", { name: `Reorder scenario ${SCENARIO_A}` })
    ).toBeInTheDocument();
  });

  /**
   * Recovered coverage. Until v0.62.2 the shared helper inferred the active scenario from
   * the grid because the tab was unqueryable; that inference is now done properly via
   * aria-current, but the underlying behaviour it happened to exercise — the grid following
   * the active scenario — is real and keeps its own named test rather than being dropped
   * along with the workaround.
   */
  it("the activity grid shows the active scenario's activities, and switches with it", () => {
    renderPage(makeProject(PROJECT_NAME, [SCENARIO_A, SCENARIO_B]));
    expect(screen.getByDisplayValue(activityOf(SCENARIO_A))).toBeInTheDocument();
    expect(screen.queryByDisplayValue(activityOf(SCENARIO_B))).toBeNull();

    fireEvent.click(tabButton(SCENARIO_B));

    expect(screen.getByDisplayValue(activityOf(SCENARIO_B))).toBeInTheDocument();
    expect(screen.queryByDisplayValue(activityOf(SCENARIO_A))).toBeNull();
  });

  it("a project with no scenarios is backfilled with a Baseline", () => {
    const p = { ...makeProject(), scenarios: [] };
    renderPage(p);
    // The store action ran and the page re-rendered with the new scenario.
    expect(
      useProjectStore.getState().getProject(p.id)!.scenarios
    ).toHaveLength(1);
    expect(tabButton("Baseline")).toBeInTheDocument();
  });
});

// -- scenario lifecycle guards ------------------------------------------------

describe("ProjectPage — scenario lifecycle guards", () => {
  /**
   * ⚠️ SCOPE, MEASURED. What this guards is ScenarioTabs' `scenarioCount > 1` gate: with
   * one scenario the delete control is never rendered, so the destructive path is
   * unreachable and `confirm` is never reached either. It does NOT guard ProjectPage's own
   * `scenarios.length <= 1` early return — removing that by mutation left this green,
   * because the DOM offers no way to invoke it. That guard is defence in depth and is
   * genuinely unreachable from the rendered page; it is recorded here rather than pinned
   * by a test that would have to fake the callback to reach it.
   */
  it("the delete control is not rendered for the last remaining scenario", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const p = makeProject(PROJECT_NAME, [SCENARIO_A]);
    renderPage(p);

    // With one scenario the per-tab delete control is not even rendered
    // (scenarioCount > 1 gates it), so the guard holds at two layers.
    expect(
      within(tabRoot(SCENARIO_A)).queryByTitle("Delete scenario")
    ).toBeNull();
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(useProjectStore.getState().getProject(p.id)!.scenarios).toHaveLength(
      1
    );
  });

  it("adding past the scenario cap is refused with an explanatory toast", () => {
    const names = Array.from(
      { length: MAX_SCENARIOS_PER_PROJECT },
      (_, i) => `${SCENARIO_A} ${i + 1}`
    );
    const p = makeProject(PROJECT_NAME, names);
    renderPage(p);
    expect(errorToasts()).toEqual([]);

    // Drive the real path: the + control opens NewScenarioDialog, whose submit calls
    // handleAddScenario — the guard under test.
    fireEvent.click(screen.getByTitle("Add scenario"));
    fireEvent.change(screen.getByLabelText("Scenario Name"), {
      target: { value: "Overflow Scenario" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(errorToasts().join(" ")).toContain(
      `maximum of ${MAX_SCENARIOS_PER_PROJECT} scenarios`
    );
    expect(useProjectStore.getState().getProject(p.id)!.scenarios).toHaveLength(
      MAX_SCENARIOS_PER_PROJECT
    );
  });
});

// -- keyboard wiring ----------------------------------------------------------

describe("ProjectPage — undo/redo keyboard shortcuts", () => {
  it("Ctrl+Z reaches undo and restores the previous name", () => {
    const p = makeProject();
    renderPage(p);
    useProjectStore.getState().renameProject(p.id, "Renamed Mid-Test");
    expect(useProjectStore.getState().getProject(p.id)!.name).toBe(
      "Renamed Mid-Test"
    );

    fireEvent.keyDown(document, { key: "z", ctrlKey: true });

    expect(useProjectStore.getState().getProject(p.id)!.name).toBe(PROJECT_NAME);
  });

  it("Ctrl+Shift+Z redoes what Ctrl+Z undid", () => {
    const p = makeProject();
    renderPage(p);
    useProjectStore.getState().renameProject(p.id, "Renamed Mid-Test");
    fireEvent.keyDown(document, { key: "z", ctrlKey: true });
    expect(useProjectStore.getState().getProject(p.id)!.name).toBe(PROJECT_NAME);

    fireEvent.keyDown(document, { key: "z", ctrlKey: true, shiftKey: true });

    expect(useProjectStore.getState().getProject(p.id)!.name).toBe(
      "Renamed Mid-Test"
    );
  });

  it("a bare z does nothing — the modifier is required", () => {
    const p = makeProject();
    renderPage(p);
    useProjectStore.getState().renameProject(p.id, "Renamed Mid-Test");

    fireEvent.keyDown(document, { key: "z" });

    expect(useProjectStore.getState().getProject(p.id)!.name).toBe(
      "Renamed Mid-Test"
    );
  });

  it("the listener is removed on unmount, so a later keystroke cannot reach undo", () => {
    const p = makeProject();
    const { unmount } = renderPage(p);
    useProjectStore.getState().renameProject(p.id, "Renamed Mid-Test");

    unmount();
    fireEvent.keyDown(document, { key: "z", ctrlKey: true });

    expect(useProjectStore.getState().getProject(p.id)!.name).toBe(
      "Renamed Mid-Test"
    );
  });
});

// -- compare mode -------------------------------------------------------------

describe("ProjectPage — compare mode", () => {
  it("the Compare button is absent with a single scenario", () => {
    renderPage(makeProject(PROJECT_NAME, [SCENARIO_A]));
    expect(screen.queryByRole("button", { name: "Compare" })).toBeNull();
  });

  it("Compare appears with two scenarios and prompts for a selection", () => {
    renderPage(makeProject(PROJECT_NAME, [SCENARIO_A, SCENARIO_B]));

    fireEvent.click(screen.getByRole("button", { name: "Compare" }));

    expect(
      screen.getByText("Select 2-3 scenarios above to compare.")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Exit Compare" })
    ).toBeInTheDocument();
  });
});

// -- Connect AI gating --------------------------------------------------------

describe("ProjectPage — Connect AI entry point", () => {
  it("an active session labels the control AI rather than Connect AI", () => {
    aiHook.sessionState = { sessionActive: true, aiConnected: true };
    renderPage(makeProject());
    expect(
      screen.getByRole("button", { name: "AI session active" })
    ).toBeInTheDocument();
  });

  it("without Firebase configured, the control is absent entirely (local-only mode)", () => {
    firebaseEnv.available = false;
    renderPage(makeProject());

    expect(
      screen.queryByRole("button", { name: "Connect an AI assistant" })
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "AI session active" })
    ).toBeNull();
    // The page still renders — the gate removes the control, not the project.
    expect(screen.getAllByRole("heading", { level: 1 })[0]).toHaveTextContent(
      PROJECT_NAME
    );
  });

  it("with no session, clicking Connect AI opens the consent gate rather than starting one", () => {
    renderPage(makeProject());

    fireEvent.click(
      screen.getByRole("button", { name: "Connect an AI assistant" })
    );

    expect(aiHook.startSession).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
