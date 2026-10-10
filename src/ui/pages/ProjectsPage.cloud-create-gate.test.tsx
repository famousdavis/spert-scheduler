// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import type { Project, UserPreferences } from "@domain/models/types";
import type { LoadError } from "@infrastructure/persistence/local-storage-repository";
import type { ProjectRole } from "@infrastructure/firebase/firestore-driver";

/**
 * WI-112: a project created while the FIRST cloud load of a sign-in runs never reached the cloud.
 * The sync handler sends nothing until that load ends, and the load then replaces the project list —
 * so the project vanished at once, or (when the cloud had none, or the load failed) at the next visit.
 * Measured in jsdom with the real providers before this release, for New Project, Load Sample, a
 * tile's Clone and Settings' Import Activities into a new project.
 *
 * These tests run the page's REAL AuthProvider, StorageProvider, useCloudSync (as Layout runs it) and
 * project store, with only the Firebase edges replaced: the auth listener (driven by hand), the
 * invitation claim (held, so the re-fetch it triggers can be made to end FIRST), the app's Firestore
 * driver (whose loads each test ends by hand, and which records every project it is asked to create),
 * and the sample's build (held, so it can land after the load has begun).
 *
 * ⚠️ The gate is the sync handler's own: in cloud storage, until the first load ends — on success or
 * failure. NOT `cloudDataLoaded`: the invitation re-fetch sets that one true while the first load
 * still runs (A3, A4, A9). And NOT before the sign-in is recognised: the app is in local storage then,
 * and that moment is left as it was (A11).
 *
 * Review 25 (phases 4 and 5): the sample's check when its build lands reads the gate from the store, so
 * it answers the same on any page — A15 leaves the Dashboard before the sign-in is recognised, A16 after
 * the gate is on — and a refusal says why in a toast (A8, A15). While New Project is greyed out, a Delete
 * that would send focus to it sends it to the note, and on to New Project when the load ends (A17, A18);
 * Settings' Import Activities is greyed out for every project it can import into (A12, A19).
 */

interface FakeFirebaseUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  emailVerified: boolean;
  providerData: { providerId: string }[];
}
type CloudProject = Project & { _owner: string; _members: Record<string, ProjectRole> };
interface CloudLoad {
  projects: CloudProject[];
  errors: LoadError[];
}
interface Pending<T> {
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}
interface ClaimResult {
  data: { claimed: string[] };
}
interface HeldBuild {
  name: string;
  resolve: (project: Project) => void;
}
interface FirebaseEdges {
  emit: ((user: FakeFirebaseUser | null) => Promise<void>) | null;
  loads: Pending<CloudLoad>[];
  prefLoads: Pending<Partial<UserPreferences>>[];
  holdPrefs: boolean;
  claims: Pending<ClaimResult>[];
  claimEnabled: boolean;
  builds: HeldBuild[];
  created: string[];
  saved: string[];
}

const edges = vi.hoisted(() => {
  const e: FirebaseEdges = {
    emit: null,
    loads: [],
    prefLoads: [],
    holdPrefs: false,
    claims: [],
    claimEnabled: false,
    builds: [],
    created: [],
    saved: [],
  };
  return e;
});

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (_auth: unknown, listener: (user: FakeFirebaseUser | null) => Promise<void>) => {
    edges.emit = listener;
    return () => {
      edges.emit = null;
    };
  },
  getRedirectResult: () => Promise.resolve(null),
  signInWithPopup: () => Promise.resolve(),
  signInWithRedirect: () => Promise.resolve(),
  // The user's sign-out as Firebase orders it: the call settles, then the auth listener hears null.
  signOut: () => {
    queueMicrotask(() => {
      edges.emit?.(null).catch(() => {});
    });
    return Promise.resolve();
  },
  GoogleAuthProvider: class {},
  OAuthProvider: class {},
}));

// Firebase "configured", with no Firestore handle: AuthProvider's profile write and ToS read return
// early, so a sign-in publishes the user at once. The invitation claim is held when a test asks.
vi.mock("@infrastructure/firebase/firebase", () => ({
  auth: {},
  db: null,
  isFirebaseAvailable: true,
  getClaimPendingInvitations: () =>
    edges.claimEnabled
      ? () =>
          new Promise<ClaimResult>((resolve, reject) => {
            edges.claims.push({ resolve, reject });
          })
      : null,
  getSendInvitationEmail: () => null,
  getRevokeInvite: () => null,
  getResendInvite: () => null,
  getTeardownAiSession: () => null,
  getGeneratePairingCode: () => null,
}));

vi.mock("@infrastructure/firebase/firestore-driver", () => ({
  FirestoreDriver: class {
    onSaveError() {}
    loadAll() {
      return new Promise<CloudLoad>((resolve, reject) => {
        edges.loads.push({ resolve, reject });
      });
    }
    loadPreferences() {
      if (edges.holdPrefs) {
        return new Promise<Partial<UserPreferences>>((resolve, reject) => {
          edges.prefLoads.push({ resolve, reject });
        });
      }
      const none: Partial<UserPreferences> = {};
      return Promise.resolve(none);
    }
    subscribeToProject() {
      return () => {};
    }
    save(project: Project) {
      edges.saved.push(project.name);
    }
    create(project: Project) {
      edges.created.push(project.name);
      return Promise.resolve();
    }
    remove() {
      return Promise.resolve();
    }
    cancelPendingSave() {}
    cancelPendingSaves() {}
    flushPendingSaves() {}
    savePreferences() {
      return Promise.resolve();
    }
    dispose() {}
  },
}));

// The sample's real build is a dynamic import that resolves on its own; held here so a test decides
// when it lands. What it returns is an ordinary project under the name the store asked for.
vi.mock("@app/api/sample-project-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@app/api/sample-project-service")>();
  return {
    ...actual,
    buildSampleProject: (name: string) =>
      new Promise<Project>((resolve) => {
        edges.builds.push({ name, resolve });
      }),
  };
});

import { AuthProvider, useAuth, _resetSignOutFlagsForTests } from "@ui/providers/AuthProvider";
import { StorageProvider, useStorage } from "@ui/providers/StorageProvider";
import { useCloudSync } from "@ui/hooks/use-cloud-sync";
import { useProjectStore } from "@ui/hooks/use-project-store";
import { useNotificationStore } from "@ui/hooks/use-notification-store";
import { useConfirmStore } from "@ui/hooks/use-confirm-store";
import { ConfirmHost } from "@ui/components/ConfirmHost";
import { setStorageNamespace, LocalStorageRepository } from "@infrastructure/persistence/local-storage-repository";
import { createProject, createActivity, addActivityToScenario } from "@app/api/project-service";
import { serializeExport } from "@app/api/export-import-service";
import { ProjectsPage } from "./ProjectsPage";
import { SettingsPage } from "./SettingsPage";

const CONTROLS_NOTE = "New Project, Load Sample and Clone are unavailable until loading from cloud storage ends.";
const WAIT_NOTE = "A new project can’t be created until loading from cloud storage ends.";
const IMPORT_WAIT_NOTE = "Activities can’t be imported until loading from cloud storage ends.";
const SAMPLE_NOT_ADDED =
  "The sample wasn’t added because loading from cloud storage hadn’t ended. Press Load Sample again when it has.";
const LOADING = "Loading your projects from cloud storage…";
const EMPTY = "No projects yet.";
const IMPORT_REFUSED = "Cloud data is still loading. Please wait and try again.";
const IMPORT_WAITING = "Cloud projects are still loading. The button above will enable when loading is complete.";
const HEART = "Heart of Gold Refit";
const SAMPLE = "Cloud ERP Solution (Sample)";
const LOADED = `Loaded "${SAMPLE}" — run the simulation to see the buffer`;
const UNLOADABLE = "1 project could not be loaded";

const ARTHUR: FakeFirebaseUser = {
  uid: "uid-arthur",
  email: "arthur@example.com",
  displayName: "Arthur Dent",
  photoURL: null,
  emailVerified: false, // no invitation claim
  providerData: [],
};
const ARTHUR_INVITED: FakeFirebaseUser = { ...ARTHUR, emailVerified: true }; // claims, then re-fetches

function cloudProject(name: string): CloudProject {
  return { ...createProject(name, "2026-10-05"), _owner: ARTHUR.uid, _members: { [ARTHUR.uid]: "owner" } };
}

/** A project the app cannot load: its one activity's name is a character over the limit. */
function unloadableProject(): Project {
  const project = createProject("Krikkit Ledger", "2026-10-05");
  const scenario = project.scenarios[0];
  if (!scenario) throw new Error("a new project has no scenario");
  const activity = { ...createActivity("Survey the site", scenario.settings), name: "x".repeat(201) };
  project.scenarios[0] = addActivityToScenario(scenario, activity);
  return project;
}

/** Layout's call, without the rest of Layout. */
function CloudSync() {
  useCloudSync();
  return null;
}

/** Where auth, storage and the route have got to, the two storage switches, the sign-out and a way off the Dashboard. */
function Readout() {
  const { user, signOut } = useAuth();
  const { mode, switchMode } = useStorage();
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <div>
      <p data-testid="state">{`${user ? "signed in" : "signed out"}, ${mode} storage`}</p>
      <p data-testid="route">{location.pathname}</p>
      <button type="button" onClick={() => switchMode("local")}>
        test: use local storage
      </button>
      <button type="button" onClick={() => switchMode("cloud")}>
        test: use cloud storage
      </button>
      <button type="button" onClick={() => void signOut()}>
        test: sign out
      </button>
      <button type="button" onClick={() => void navigate("/settings")}>
        test: open Settings
      </button>
    </div>
  );
}

function renderApp(chosenStorage: "local" | "cloud", at = "/projects") {
  localStorage.setItem("spert:storage-mode", chosenStorage);
  return render(
    <AuthProvider>
      <StorageProvider>
        <MemoryRouter initialEntries={[at]}>
          <CloudSync />
          <Readout />
          <Routes>
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/project/:id" element={<p>Project page</p>} />
          </Routes>
          {/* Layout mounts this once; a damaged project's Delete asks through it. */}
          <ConfirmHost />
        </MemoryRouter>
      </StorageProvider>
    </AuthProvider>,
  );
}

// -- the cloud's answers --------------------------------------------------------------------------

async function authResolves(user: FakeFirebaseUser | null) {
  const emit = edges.emit;
  if (!emit) throw new Error("AuthProvider has not subscribed to the auth state");
  await act(async () => {
    await emit(user);
  });
}

/** The FIRST load still pending — always the oldest. */
async function cloudLoadEnds(projects: CloudProject[]) {
  const load = edges.loads.shift();
  if (!load) throw new Error("no cloud load is pending");
  await act(async () => {
    load.resolve({ projects, errors: [] });
  });
}

async function cloudLoadFails() {
  const load = edges.loads.shift();
  if (!load) throw new Error("no cloud load is pending");
  await act(async () => {
    load.reject(new Error("unavailable"));
  });
}

/** The invitation re-fetch: the second load, started after the first. */
async function refetchEnds(projects: CloudProject[]) {
  const [refetch] = edges.loads.splice(1, 1);
  if (!refetch) throw new Error("no re-fetch is pending");
  await act(async () => {
    refetch.resolve({ projects, errors: [] });
  });
}

async function claimEnds() {
  const claim = edges.claims.shift();
  if (!claim) throw new Error("no invitation claim is pending");
  await act(async () => {
    claim.resolve({ data: { claimed: ["proj-invited"] } });
  });
}

async function preferencesEnd() {
  const prefs = edges.prefLoads.shift();
  if (!prefs) throw new Error("no preferences load is pending");
  await act(async () => {
    prefs.resolve({});
  });
}

async function buildLands(index: number) {
  const build = edges.builds[index];
  if (!build) throw new Error(`no sample build #${index} was requested`);
  await act(async () => {
    build.resolve(createProject(build.name, "2026-10-05"));
  });
}

async function flush() {
  await act(async () => {
    await new Promise<void>((r) => setTimeout(r, 0));
  });
}

/**
 * Lets every focus move after a Delete run: the page's own (a microtask) and the confirmation's restore
 * to the button that opened it (a 0 ms timeout, a no-op once that button has gone).
 */
async function settleFocus() {
  await act(async () => {
    await new Promise<void>((r) => setTimeout(r, 20));
  });
}

// -- what the page shows --------------------------------------------------------------------------

function firstOf(elements: HTMLElement[], what: string): HTMLElement {
  const [first] = elements;
  if (!first) throw new Error(`no ${what}`);
  return first;
}

/** The header's New Project — always the first; the empty Dashboard has its own below it. */
const headerNewProject = () => firstOf(screen.getAllByRole("button", { name: "New Project" }), "New Project button");
const loadSample = () => screen.getByRole("button", { name: "Load Sample" });
const chooseFile = () => screen.getByRole("button", { name: "Choose File" });
const storageState = () => screen.getByTestId("state").textContent;
const route = () => screen.getByTestId("route").textContent;
const projectNames = () => useProjectStore.getState().projects.map((p) => p.name);
const toastMessages = () => useNotificationStore.getState().notifications.map((n) => n.message);
const scenarioCountOf = (name: string) =>
  useProjectStore.getState().projects.find((p) => p.name === name)?.scenarios.length;

function tileOf(name: string): HTMLElement {
  const tile = screen.getByRole("button", { name }).closest("div.group");
  if (!(tile instanceof HTMLElement)) throw new Error(`no tile for ${name}`);
  return tile;
}
const cloneOf = (name: string) => within(tileOf(name)).getByRole("button", { name: "Clone project" });

function emptyDashboard(): HTMLElement {
  const box = screen.getByText(EMPTY).parentElement;
  if (!box) throw new Error("no empty Dashboard");
  return box;
}

function expectUnavailable(button: HTMLElement) {
  expect(button).toBeDisabled();
  expect(button).toHaveAccessibleDescription(CONTROLS_NOTE);
}

function expectAvailable(button: HTMLElement) {
  expect(button).toBeEnabled();
  expect(button).not.toHaveAccessibleDescription(CONTROLS_NOTE);
}

async function pickImportFile(projectName: string) {
  const file = new File([serializeExport([createProject(projectName, "2026-10-05")])], "probe.json", {
    type: "application/json",
  });
  fireEvent.change(screen.getByLabelText("Project import JSON file"), { target: { files: [file] } });
  await screen.findByRole("button", { name: "Confirm Import" });
}

beforeEach(() => {
  localStorage.clear();
  setStorageNamespace("local");
  _resetSignOutFlagsForTests();
  edges.emit = null;
  edges.loads.length = 0;
  edges.prefLoads.length = 0;
  edges.holdPrefs = false;
  edges.claims.length = 0;
  edges.claimEnabled = false;
  edges.builds.length = 0;
  edges.created.length = 0;
  edges.saved.length = 0;
  // Every field back to how a fresh page starts — whatever fields this version of the store has.
  useProjectStore.setState(useProjectStore.getInitialState(), true);
  useNotificationStore.setState({ notifications: [] });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  // Module singleton: a question left pending by one test still shows in the next.
  useConfirmStore.setState({ pending: null });
});

// -- the Dashboard ----------------------------------------------------------------------------------

describe("WI-112: while the first cloud load runs, the controls that create a project are greyed out", () => {
  it("New Project and Load Sample are greyed out and a note says why; when the load ends they come back and the note goes", async () => {
    renderApp("cloud");
    await authResolves(ARTHUR);
    expect(storageState()).toBe("signed in, cloud storage");
    expect(edges.loads).toHaveLength(1);

    expectUnavailable(headerNewProject());
    expectUnavailable(loadSample());
    expect(screen.getByRole("note")).toHaveTextContent(CONTROLS_NOTE);

    await cloudLoadEnds([]);
    await waitFor(() => expect(headerNewProject()).toBeEnabled());
    expectAvailable(headerNewProject());
    expectAvailable(loadSample());
    expect(screen.queryByText(CONTROLS_NOTE)).toBeNull();
  });

  it("with tiles on screen before the load ends, each tile's Clone is greyed out too, and the note shows above them", async () => {
    edges.holdPrefs = true;
    renderApp("cloud");
    await authResolves(ARTHUR);
    // The projects arrive; the user's settings are still loading, so the first load has not ended.
    await cloudLoadEnds([cloudProject(HEART)]);
    await screen.findByRole("button", { name: HEART });
    expect(edges.prefLoads).toHaveLength(1);
    expect(useProjectStore.getState().cloudDataLoaded).toBe(false);

    expectUnavailable(cloneOf(HEART));
    expectUnavailable(headerNewProject());
    expectUnavailable(loadSample());
    expect(screen.getByText(CONTROLS_NOTE)).toBeInTheDocument();

    await preferencesEnd();
    await waitFor(() => expect(cloneOf(HEART)).toBeEnabled());
    expectAvailable(cloneOf(HEART));
    expectAvailable(headerNewProject());
    expectAvailable(loadSample());
    expect(screen.queryByText(CONTROLS_NOTE)).toBeNull();
  });

  it("the invitation re-fetch ending first does not end it: the controls stay greyed until the first load ends", async () => {
    edges.claimEnabled = true;
    const heart = cloudProject(HEART);
    renderApp("cloud");
    await authResolves(ARTHUR_INVITED);
    await claimEnds();
    await waitFor(() => expect(edges.loads).toHaveLength(2));
    await refetchEnds([heart]);
    await screen.findByRole("button", { name: HEART });
    // The order this test exists for: the re-fetch has marked the cloud data loaded, and the
    // Dashboard's loading message has gone, while the first load is still running.
    expect(useProjectStore.getState().cloudDataLoaded).toBe(true);
    expect(edges.loads).toHaveLength(1);
    expect(screen.queryByText(LOADING)).toBeNull();

    expectUnavailable(headerNewProject());
    expectUnavailable(loadSample());
    expectUnavailable(cloneOf(HEART));
    expect(screen.getByText(CONTROLS_NOTE)).toBeInTheDocument();

    await cloudLoadEnds([heart]);
    await waitFor(() => expect(headerNewProject()).toBeEnabled());
    expectAvailable(headerNewProject());
    expectAvailable(loadSample());
    expectAvailable(cloneOf(HEART));
    expect(screen.queryByText(CONTROLS_NOTE)).toBeNull();
  });

  it("an empty re-fetch ending first: the empty Dashboard's New Project and Load Sample Project are greyed out too", async () => {
    edges.claimEnabled = true;
    renderApp("cloud");
    await authResolves(ARTHUR_INVITED);
    await claimEnds();
    await waitFor(() => expect(edges.loads).toHaveLength(2));
    await refetchEnds([]);
    await screen.findByText(EMPTY);
    expect(edges.loads).toHaveLength(1);

    expectUnavailable(within(emptyDashboard()).getByRole("button", { name: "New Project" }));
    expectUnavailable(within(emptyDashboard()).getByRole("button", { name: "Load Sample Project" }));
    expect(screen.getByText(CONTROLS_NOTE)).toBeInTheDocument();

    await cloudLoadEnds([]);
    await waitFor(() =>
      expect(within(emptyDashboard()).getByRole("button", { name: "New Project" })).toBeEnabled(),
    );
    expectAvailable(within(emptyDashboard()).getByRole("button", { name: "New Project" }));
    expectAvailable(within(emptyDashboard()).getByRole("button", { name: "Load Sample Project" }));
    expect(screen.queryByText(CONTROLS_NOTE)).toBeNull();
  });

  it("a failed first load ends it too", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderApp("cloud");
    await authResolves(ARTHUR);
    expectUnavailable(headerNewProject());
    expect(screen.getByText(CONTROLS_NOTE)).toBeInTheDocument();

    await cloudLoadFails();
    await waitFor(() => expect(headerNewProject()).toBeEnabled());
    expectAvailable(headerNewProject());
    expect(screen.queryByText(CONTROLS_NOTE)).toBeNull();
  });

  it("switching to local storage and back greys them again until that load ends", async () => {
    renderApp("cloud");
    await authResolves(ARTHUR);
    await cloudLoadEnds([]);
    await waitFor(() => expect(headerNewProject()).toBeEnabled());

    fireEvent.click(screen.getByRole("button", { name: "test: use local storage" }));
    expect(storageState()).toBe("signed in, local storage");
    expectAvailable(headerNewProject());
    expect(screen.queryByText(CONTROLS_NOTE)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "test: use cloud storage" }));
    expect(storageState()).toBe("signed in, cloud storage");
    expect(edges.loads).toHaveLength(1);
    expectUnavailable(headerNewProject());
    expectUnavailable(loadSample());
    expect(screen.getByText(CONTROLS_NOTE)).toBeInTheDocument();

    await cloudLoadEnds([]);
    await waitFor(() => expect(headerNewProject()).toBeEnabled());
    expect(screen.queryByText(CONTROLS_NOTE)).toBeNull();
  });

  it("control: in local storage nothing is greyed and there is no note, signed in or not", async () => {
    renderApp("local");
    expectAvailable(headerNewProject());
    expectAvailable(loadSample());
    expect(screen.queryByText(CONTROLS_NOTE)).toBeNull();

    await authResolves(ARTHUR);
    expect(storageState()).toBe("signed in, local storage");
    expectAvailable(headerNewProject());
    expectAvailable(loadSample());
    expect(screen.queryByText(CONTROLS_NOTE)).toBeNull();
    expect(edges.loads).toHaveLength(0);
  });

  it("control: while a remembered sign-in is still being restored nothing is greyed — the gate starts when the sign-in is recognised", () => {
    renderApp("cloud");
    expect(storageState()).toBe("signed out, local storage");
    expect(screen.getByText(LOADING)).toBeInTheDocument();
    expectAvailable(headerNewProject());
    expectAvailable(loadSample());
    expect(screen.queryByText(CONTROLS_NOTE)).toBeNull();
  });
});

// -- a create that began before the load and commits inside it ------------------------------------

describe("WI-112: each create is checked again as it commits, and refused while the first cloud load runs", () => {
  it("a New Project window opened before the load began: Create inside it creates nothing, the window says why and keeps the name; after the load the same Create creates the project", async () => {
    renderApp("cloud");
    // The sign-in is not yet recognised: the app is in local storage and nothing is greyed.
    fireEvent.click(headerNewProject());
    fireEvent.change(await screen.findByLabelText("Project Name"), { target: { value: "Probe Window Project" } });

    await authResolves(ARTHUR);
    expect(edges.loads).toHaveLength(1);
    fireEvent.click(within(screen.getByRole("dialog", { name: "New Project" })).getByRole("button", { name: "Create" }));
    await flush();

    expect(projectNames()).toEqual([]);
    const dialog = screen.getByRole("dialog", { name: "New Project" });
    expect(within(dialog).getByLabelText("Project Name")).toHaveValue("Probe Window Project");
    expect(within(dialog).getByText(WAIT_NOTE)).toBeInTheDocument();
    expect(within(dialog).getByRole("note")).toHaveTextContent(WAIT_NOTE);
    expect(within(dialog).getByRole("button", { name: "Create" })).toHaveAccessibleDescription(WAIT_NOTE);
    expect(route()).toBe("/projects");

    await cloudLoadEnds([]);
    await waitFor(() => expect(within(screen.getByRole("dialog", { name: "New Project" })).queryByText(WAIT_NOTE)).toBeNull());
    fireEvent.click(within(screen.getByRole("dialog", { name: "New Project" })).getByRole("button", { name: "Create" }));
    await waitFor(() => expect(projectNames()).toEqual(["Probe Window Project"]));
    await waitFor(() => expect(edges.created).toEqual(["Probe Window Project"]));
    expect(route()).toMatch(/^\/project\//);
  });

  it("Load Sample pressed before the load began and landing inside it adds nothing, and a message says why; pressed after the load, it adds the sample", async () => {
    renderApp("cloud");
    fireEvent.click(loadSample());
    await waitFor(() => expect(edges.builds).toHaveLength(1));
    await authResolves(ARTHUR);
    expect(edges.loads).toHaveLength(1);

    await buildLands(0);
    await flush();
    expect(projectNames()).toEqual([]);
    expect(toastMessages()).toEqual([SAMPLE_NOT_ADDED]);
    expect(route()).toBe("/projects");
    expect(screen.getByText(CONTROLS_NOTE)).toBeInTheDocument();

    await cloudLoadEnds([]);
    await waitFor(() => expect(loadSample()).toBeEnabled());
    fireEvent.click(loadSample());
    await waitFor(() => expect(edges.builds).toHaveLength(2));
    await buildLands(1);
    await waitFor(() => expect(projectNames()).toEqual([SAMPLE]));
    await waitFor(() => expect(edges.created).toEqual([SAMPLE]));
    expect(route()).toMatch(/^\/project\//);
  });

  it("Import Projects: a file confirmed after the invitation re-fetch but before the first load ends is refused, and nothing is added", async () => {
    edges.claimEnabled = true;
    const heart = cloudProject(HEART);
    renderApp("cloud");
    await authResolves(ARTHUR_INVITED);
    await claimEnds();
    await waitFor(() => expect(edges.loads).toHaveLength(2));
    await refetchEnds([heart]);
    await waitFor(() => expect(useProjectStore.getState().cloudDataLoaded).toBe(true));
    expect(edges.loads).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Import Projects" }));
    await pickImportFile("Probe Imported Project");
    fireEvent.click(screen.getByRole("button", { name: "Confirm Import" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Confirm Import" })).toBeNull());

    expect(projectNames()).toEqual([HEART]);
    expect(screen.getByRole("alert")).toHaveTextContent(IMPORT_REFUSED);

    await cloudLoadEnds([heart]);
    fireEvent.click(screen.getByRole("button", { name: "Try another file" }));
    await pickImportFile("Probe Imported Project");
    fireEvent.click(screen.getByRole("button", { name: "Confirm Import" }));
    await waitFor(() => expect(projectNames()).toEqual([HEART, "Probe Imported Project"]));
    await waitFor(() => expect(edges.created).toEqual(["Probe Imported Project"]));
  });
});

// -- Settings ---------------------------------------------------------------------------------------

describe("WI-112: Settings' Import Activities", () => {
  const PASTE = [
    [
      "Activity ID",
      "Activity Name",
      "Optimistic (Min)",
      "Most Likely",
      "Pessimistic (Max)",
      "Distribution",
      "Confidence Level",
      "Status",
      "Predecessors",
    ].join("\t"),
    "P1\tProbe Pasted Activity\t1\t2\t4\ttriangular\t\tplanned\t",
  ].join("\n");

  it("is greyed out with a note while the first cloud load runs, Ctrl+Enter adds nothing, and after the load it imports", async () => {
    renderApp("cloud", "/settings");
    await authResolves(ARTHUR);
    expect(edges.loads).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Paste spreadsheet data"), { target: { value: PASTE } });
    const importButton = await screen.findByRole("button", { name: "Import Activities" });
    fireEvent.change(screen.getByLabelText("Scenario Name"), { target: { value: "Probe Pasted Plan" } });

    expect(importButton).toBeDisabled();
    expect(importButton).toHaveAccessibleDescription(IMPORT_WAIT_NOTE);
    expect(screen.getByText(IMPORT_WAIT_NOTE)).toBeInTheDocument();
    fireEvent.keyDown(screen.getByLabelText("Paste spreadsheet data"), { key: "Enter", ctrlKey: true });
    await flush();
    expect(projectNames()).toEqual([]);

    await cloudLoadEnds([]);
    await waitFor(() => expect(screen.getByRole("button", { name: "Import Activities" })).toBeEnabled());
    expect(screen.queryByText(IMPORT_WAIT_NOTE)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Import Activities" }));
    await waitFor(() => expect(projectNames()).toEqual(["Probe Pasted Plan"]));
    await waitFor(() => expect(edges.created).toEqual(["Probe Pasted Plan"]));
  });

  it("into an existing project too: greyed out with a note while the first cloud load runs, Ctrl+Enter adds nothing, and after the load it imports", async () => {
    edges.holdPrefs = true;
    const heart = cloudProject(HEART);
    renderApp("cloud", "/settings");
    await authResolves(ARTHUR);
    // The projects arrive; the user's settings are still loading, so the first load has not ended.
    await cloudLoadEnds([heart]);
    await waitFor(() => expect(projectNames()).toEqual([HEART]));
    expect(edges.prefLoads).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Paste spreadsheet data"), { target: { value: PASTE } });
    const importButton = await screen.findByRole("button", { name: "Import Activities" });
    fireEvent.change(screen.getByLabelText("Add to project"), { target: { value: heart.id } });
    expect(screen.getByLabelText("Add to project")).toHaveValue(heart.id);

    expect(importButton).toBeDisabled();
    expect(importButton).toHaveAccessibleDescription(IMPORT_WAIT_NOTE);
    expect(screen.getByText(IMPORT_WAIT_NOTE)).toBeInTheDocument();
    fireEvent.keyDown(screen.getByLabelText("Paste spreadsheet data"), { key: "Enter", ctrlKey: true });
    await flush();
    expect(scenarioCountOf(HEART)).toBe(1);
    expect(edges.saved).toEqual([]);

    await preferencesEnd();
    await waitFor(() => expect(screen.getByRole("button", { name: "Import Activities" })).toBeEnabled());
    expect(screen.queryByText(IMPORT_WAIT_NOTE)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Import Activities" }));
    await waitFor(() => expect(scenarioCountOf(HEART)).toBe(2));
    await waitFor(() => expect(edges.saved).toContain(HEART));
  });
});

// -- the sample, landing on another page -------------------------------------------------------------

describe("WI-112: the sample's check when it is ready reads the gate as it is then, on any page", () => {
  it("Load Sample pressed before the sign-in was recognised, with the Dashboard then left: landing inside the load it adds nothing, and a message says why", async () => {
    renderApp("cloud");
    // The sign-in is not yet recognised: the app is in local storage and Load Sample works.
    fireEvent.click(loadSample());
    await waitFor(() => expect(edges.builds).toHaveLength(1));
    // The Dashboard leaves the screen while the sample is still being prepared.
    fireEvent.click(screen.getByRole("button", { name: "test: open Settings" }));
    expect(route()).toBe("/settings");

    await authResolves(ARTHUR);
    expect(storageState()).toBe("signed in, cloud storage");
    expect(edges.loads).toHaveLength(1);
    await buildLands(0);
    await flush();

    expect(projectNames()).toEqual([]);
    expect(toastMessages()).toEqual([SAMPLE_NOT_ADDED]);
    expect(route()).toBe("/settings");

    await cloudLoadEnds([cloudProject(HEART)]);
    await waitFor(() => expect(projectNames()).toEqual([HEART]));
    expect(edges.created).toEqual([]);
  });

  it("Load Sample pressed before the sign-in was recognised, with the Dashboard left during the load: landing after the load ends, it adds the sample", async () => {
    renderApp("cloud");
    fireEvent.click(loadSample());
    await waitFor(() => expect(edges.builds).toHaveLength(1));
    await authResolves(ARTHUR);
    // The gate is on while the Dashboard is still on screen; then the Dashboard leaves it.
    expectUnavailable(loadSample());
    fireEvent.click(screen.getByRole("button", { name: "test: open Settings" }));
    expect(route()).toBe("/settings");

    await cloudLoadEnds([]);
    await buildLands(0);

    await waitFor(() => expect(projectNames()).toEqual([SAMPLE]));
    await waitFor(() => expect(edges.created).toEqual([SAMPLE]));
    expect(toastMessages()).toEqual([LOADED]);
  });
});

// -- focus after a Delete, while New Project is greyed out -----------------------------------------

describe("WI-112: while New Project is greyed out, a Delete that would send focus to it sends it to the note — and on to New Project when the load ends", () => {
  it("while New Project is greyed out, deleting the last tile moves focus to the note, which says why, and on to New Project when the load ends", async () => {
    edges.holdPrefs = true;
    renderApp("cloud");
    await authResolves(ARTHUR);
    // The projects arrive; the user's settings are still loading, so the first load has not ended.
    await cloudLoadEnds([cloudProject(HEART)]);
    await screen.findByRole("button", { name: HEART });
    expect(edges.prefLoads).toHaveLength(1);
    expectUnavailable(headerNewProject());

    fireEvent.click(within(tileOf(HEART)).getByRole("button", { name: "Delete project" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await settleFocus();

    expect(projectNames()).toEqual([]);
    const note = screen.getByRole("note");
    expect(note).toHaveTextContent(CONTROLS_NOTE);
    expect(document.activeElement).toBe(note);

    // The settings arrive: the load ends and the note goes with the gate. The focus goes on to New
    // Project, not to <body> with the note (review 25, pass 2).
    await preferencesEnd();
    await settleFocus();
    expect(screen.queryByRole("note")).toBeNull();
    expectAvailable(headerNewProject());
    expect(document.activeElement).toBe(headerNewProject());
  });

  it("while New Project is greyed out, deleting a project that could not be loaded moves focus to the note, and on to New Project when the load ends", async () => {
    // Stored in this browser's signed-out storage, which the Dashboard reads on its first render: the
    // recovery card lists it, and stays while the cloud load runs.
    new LocalStorageRepository().save(unloadableProject());
    renderApp("cloud");
    await screen.findByText(UNLOADABLE);
    await authResolves(ARTHUR);
    expect(edges.loads).toHaveLength(1);
    expectUnavailable(headerNewProject());

    fireEvent.click(screen.getByTitle("Delete corrupted project"));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await settleFocus();

    expect(screen.queryByText(UNLOADABLE)).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("note"));

    await cloudLoadEnds([]);
    await settleFocus();
    expect(screen.queryByRole("note")).toBeNull();
    expectAvailable(headerNewProject());
    expect(document.activeElement).toBe(headerNewProject());
  });
});

// -- a sign-in's late answer, after a sign-out ------------------------------------------------------

describe("WI-112: a sign-in's late answer, landing after a sign-out and a new sign-in, does not end the new sign-in's load", () => {
  it("the first sign-in's settings, arriving while the second sign-in's load runs, leave New Project, Load Sample, the loading message and Choose File as they were until that load ends", async () => {
    edges.holdPrefs = true;
    renderApp("cloud");
    await authResolves(ARTHUR);
    await cloudLoadEnds([]);
    await waitFor(() => expect(edges.prefLoads).toHaveLength(1));

    // Signed out while that sign-in's settings are still loading, then signed in again.
    fireEvent.click(screen.getByRole("button", { name: "test: sign out" }));
    await waitFor(() => expect(storageState()).toBe("signed out, local storage"));
    await authResolves(ARTHUR);
    expect(storageState()).toBe("signed in, cloud storage");
    expect(edges.loads).toHaveLength(1);
    expect(edges.prefLoads).toHaveLength(1);
    expect(screen.getByText(LOADING)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Import Projects" }));
    expect(chooseFile()).toBeDisabled();

    // The FIRST sign-in's settings answer lands now, inside the second sign-in's load.
    await preferencesEnd();

    expectUnavailable(headerNewProject());
    expectUnavailable(loadSample());
    expect(screen.getByText(CONTROLS_NOTE)).toBeInTheDocument();
    expect(screen.getByText(LOADING)).toBeInTheDocument();
    expect(screen.queryByText(EMPTY)).toBeNull();
    expect(chooseFile()).toBeDisabled();
    expect(screen.getByText(IMPORT_WAITING)).toBeInTheDocument();

    // The second load's projects arrive; its own settings are still loading.
    await cloudLoadEnds([cloudProject(HEART)]);
    await screen.findByRole("button", { name: HEART });
    await waitFor(() => expect(edges.prefLoads).toHaveLength(1));
    expectUnavailable(headerNewProject());
    expectUnavailable(cloneOf(HEART));
    expect(chooseFile()).toBeDisabled();

    await preferencesEnd();
    await waitFor(() => expect(headerNewProject()).toBeEnabled());
    expectAvailable(headerNewProject());
    expectAvailable(loadSample());
    expectAvailable(cloneOf(HEART));
    expect(screen.queryByText(CONTROLS_NOTE)).toBeNull();
    expect(chooseFile()).toBeEnabled();
  });

  it("the first sign-in's settings load failing while the second sign-in's load runs leaves New Project, Load Sample, the loading message and Choose File as they were until that load ends", async () => {
    // The failure is logged ("Failed to load cloud preferences:"); not this test's subject.
    vi.spyOn(console, "error").mockImplementation(() => {});
    edges.holdPrefs = true;
    renderApp("cloud");
    await authResolves(ARTHUR);
    await cloudLoadEnds([]);
    await waitFor(() => expect(edges.prefLoads).toHaveLength(1));

    // Signed out while that sign-in's settings are still loading, then signed in again.
    fireEvent.click(screen.getByRole("button", { name: "test: sign out" }));
    await waitFor(() => expect(storageState()).toBe("signed out, local storage"));
    await authResolves(ARTHUR);
    expect(storageState()).toBe("signed in, cloud storage");
    expect(edges.loads).toHaveLength(1);
    expect(edges.prefLoads).toHaveLength(1);
    expect(screen.getByText(LOADING)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Import Projects" }));
    expect(chooseFile()).toBeDisabled();

    // The FIRST sign-in's settings load fails now — as a request cut off by the sign-out may — inside
    // the second sign-in's load.
    const late = edges.prefLoads.shift();
    if (!late) throw new Error("no preferences load is pending");
    await act(async () => {
      late.reject(new Error("permission-denied"));
    });

    expectUnavailable(headerNewProject());
    expectUnavailable(loadSample());
    expect(screen.getByText(CONTROLS_NOTE)).toBeInTheDocument();
    expect(screen.getByText(LOADING)).toBeInTheDocument();
    expect(screen.queryByText(EMPTY)).toBeNull();
    expect(chooseFile()).toBeDisabled();
    expect(screen.getByText(IMPORT_WAITING)).toBeInTheDocument();

    // The second load's projects arrive; its own settings are still loading.
    await cloudLoadEnds([cloudProject(HEART)]);
    await screen.findByRole("button", { name: HEART });
    await waitFor(() => expect(edges.prefLoads).toHaveLength(1));
    expectUnavailable(headerNewProject());
    expectUnavailable(cloneOf(HEART));
    expect(chooseFile()).toBeDisabled();

    await preferencesEnd();
    await waitFor(() => expect(headerNewProject()).toBeEnabled());
    expectAvailable(headerNewProject());
    expectAvailable(loadSample());
    expectAvailable(cloneOf(HEART));
    expect(screen.queryByText(CONTROLS_NOTE)).toBeNull();
    expect(chooseFile()).toBeEnabled();
  });
});
