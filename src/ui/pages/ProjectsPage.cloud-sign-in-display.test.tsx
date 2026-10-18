// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { render, screen, act, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useNavigate } from "react-router-dom";
import type { Project, UserPreferences, SimulationRun } from "@domain/models/types";
import type { LoadError } from "@infrastructure/persistence/local-storage-repository";
import type { ProjectRole } from "@infrastructure/firebase/firestore-driver";

/**
 * WI-113: what a cloud sign-in shows while its first load runs, and when a cloud load fails (owner ruling, 2026-10-16).
 *
 * From the moment the signed-in user is known until the session's first cloud load ends, the project list holds none of
 * this browser's signed-out projects — nor another user's: the Dashboard says "Loading your projects from cloud
 * storage…", and no page loads the list from this browser meanwhile. Before, those projects were shown in place of the
 * user's cloud projects — and kept, when the cloud listed none or the load failed. A failed load — the first one, or the
 * re-fetch after an invitation is claimed — is said on the Dashboard, where "No projects yet." was. And a project's page
 * whose project is not in the list says it is loading while a cloud load is pending, and, signed out, no longer that the
 * project may have been deleted.
 *
 * The real AuthProvider, StorageProvider, cloud sync (as Layout runs it), Dashboard, Settings, Calendar, project page and
 * stores. Only the Firebase edges are replaced: the auth listener (driven by hand, and told of a sign-out only when the
 * user changes, as Firebase does), the profile and terms documents, the invitation claim (held, so a test decides when
 * the re-fetch starts), and the app's Firestore driver, whose loads each test ends, or fails, by hand.
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
type LoadKind = "first" | "refetch";
interface PendingLoad extends Pending<CloudLoad> {
  session: number;
  kind: LoadKind;
}
interface ClaimResult {
  data: { claimed: { appId: string; modelId: string; modelName: string }[] };
}
interface FirebaseEdges {
  emit: ((user: FakeFirebaseUser | null) => Promise<void>) | null;
  current: FakeFirebaseUser | null;
  sessions: number;
  loads: PendingLoad[];
  claims: Pending<ClaimResult>[];
  claimEnabled: boolean;
  /** Projects listed in the store whenever a passive effect of EffectProbe (below) ran, in order. */
  seenByEffects: string[][];
  /** Every write the app's Firestore driver was asked to make, in order — so that a test can say nothing was sent. */
  sent: string[];
}

const edges = vi.hoisted(() => {
  const e: FirebaseEdges = {
    emit: null,
    current: null,
    sessions: 0,
    loads: [],
    claims: [],
    claimEnabled: false,
    seenByEffects: [],
    sent: [],
  };
  return e;
});

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (_auth: unknown, listener: (user: FakeFirebaseUser | null) => Promise<void>) => {
    edges.emit = (user) => {
      edges.current = user;
      return listener(user);
    };
    return () => {
      edges.emit = null;
    };
  },
  getRedirectResult: () => Promise.resolve(null),
  signInWithPopup: () => Promise.resolve(),
  signInWithRedirect: () => Promise.resolve(),
  // As Firebase does it: the call settles, then the auth listener hears null — and only if a user was signed in.
  signOut: () => {
    const userChanges = edges.current !== null;
    edges.current = null;
    if (userChanges) {
      queueMicrotask(() => {
        edges.emit?.(null).catch(() => {});
      });
    }
    return Promise.resolve();
  },
  GoogleAuthProvider: class {},
  OAuthProvider: class {},
}));

// Firebase configured, with no Firestore handle: the profile write and the terms check return at once, so a sign-in
// publishes the user at once. The invitation claim is held until a test ends it.
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

// The project page opens a Firestore-backed AI session at mount; not under test.
vi.mock("@ui/hooks/use-ai-connectivity", () => ({
  useAiConnectivity: () => ({
    sessionState: { sessionActive: false, aiConnected: false },
    startSession: () => Promise.resolve(true),
    stopSession: () => Promise.resolve(),
    changePermissions: () => {},
  }),
}));

vi.mock("@infrastructure/firebase/firestore-driver", () => ({
  FirestoreDriver: class {
    private readonly session: number;
    private loadsAsked = 0;
    constructor() {
      edges.sessions += 1;
      this.session = edges.sessions;
    }
    onSaveError() {}
    loadAll() {
      this.loadsAsked += 1;
      const kind: LoadKind = this.loadsAsked === 1 ? "first" : "refetch";
      const session = this.session;
      return new Promise<CloudLoad>((resolve, reject) => {
        edges.loads.push({ session, kind, resolve, reject });
      });
    }
    loadPreferences() {
      const none: Partial<UserPreferences> = {};
      return Promise.resolve(none);
    }
    subscribeToProject() {
      return () => {};
    }
    save(project: Project) {
      edges.sent.push(`save ${project.name}`);
    }
    create(project: Project) {
      edges.sent.push(`create ${project.name}`);
      return Promise.resolve();
    }
    remove(id: string) {
      edges.sent.push(`remove ${id}`);
      return Promise.resolve();
    }
    cancelPendingSave() {}
    cancelPendingSaves() {}
    flushPendingSaves() {}
    savePreferences() {
      edges.sent.push("preferences");
      return Promise.resolve();
    }
    dispose() {}
  },
}));

import { AuthProvider, useAuth, _resetSignOutFlagsForTests } from "@ui/providers/AuthProvider";
import { StorageProvider, useStorage } from "@ui/providers/StorageProvider";
import { useCloudSync } from "@ui/hooks/use-cloud-sync";
import { useInvitationLanding } from "@ui/hooks/useInvitationLanding";
import { useProjectStore } from "@ui/hooks/use-project-store";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";
import { useNotificationStore } from "@ui/hooks/use-notification-store";
import { InvitationBanner } from "@ui/components/InvitationBanner";
import {
  setStorageNamespace,
  getActiveStorageNamespace,
  LocalStorageRepository,
} from "@infrastructure/persistence/local-storage-repository";
import { createProject } from "@app/api/project-service";
import { INVITE_SESSION_KEY } from "@app/constants";
import { ProjectsPage } from "./ProjectsPage";
import { SettingsPage } from "./SettingsPage";
import { CalendarPage } from "./CalendarPage";
import { ProjectPage } from "./ProjectPage";

const LOADING = "Loading your projects from cloud storage…";
const EMPTY = "No projects yet.";
const LOAD_FAILED =
  "Scheduler couldn’t finish loading from cloud storage, so some projects may be missing here. Reload the page to try again.";
const PROJECT_LOAD_FAILED =
  "Scheduler couldn’t finish loading from cloud storage, so this project may be missing here. Reload the page to try again.";
const UNAVAILABLE = "This project is no longer available.";
const MAY_HAVE_BEEN_DELETED = "It may have been deleted or is no longer shared with you.";
const SIGNED_OUT_ADVICE =
  "It isn’t among the projects this browser can open without signing in. If it’s in cloud storage, sign in to cloud storage with the account that has it.";
const ALPHA = "Local Alpha";
const BETA = "Local Beta";
const CACHED = "Cached Gamma";
const HEART = "Heart of Gold Refit";
const SHARED = "Shared Magrathea";
const VOGON = "Vogon Poetry Archive";

const ARTHUR: FakeFirebaseUser = {
  uid: "uid-arthur",
  email: "arthur@example.com",
  displayName: "Arthur Dent",
  photoURL: null,
  emailVerified: false, // no invitation claim
  providerData: [],
};
const ARTHUR_INVITED: FakeFirebaseUser = { ...ARTHUR, emailVerified: true }; // claims, then re-fetches
const FORD: FakeFirebaseUser = { ...ARTHUR, uid: "uid-ford", email: "ford@example.com", displayName: "Ford Prefect" };
const ZAPHOD = "uid-zaphod";

/** Layout's call, and what Layout renders beneath it — so that, as in the app, the pages' effects run before its own. */
function Layout({ children }: { children: ReactNode }) {
  useCloudSync();
  return <>{children}</>;
}

/** Layout's invitation banner, from its one landing state. */
function Invitation() {
  const invite = useInvitationLanding();
  return <InvitationBanner {...invite} />;
}

/** Records, in a PASSIVE effect, the projects in the store each time the signed-in user changes. */
function EffectProbe() {
  const { user } = useAuth();
  useEffect(() => {
    edges.seenByEffects.push(useProjectStore.getState().projects.map((p) => p.name));
  }, [user]);
  return null;
}

function Readout() {
  const { user, signOut } = useAuth();
  const { mode, switchMode } = useStorage();
  const navigate = useNavigate();
  return (
    <div>
      <p data-testid="state">{`${user ? "signed in " + user.uid : "signed out"}, ${mode} storage`}</p>
      <button type="button" onClick={() => void signOut()}>
        test: sign out
      </button>
      <button type="button" onClick={() => switchMode("local")}>
        test: use local storage
      </button>
      <button type="button" onClick={() => switchMode("cloud")}>
        test: use cloud storage
      </button>
      <button type="button" onClick={() => void navigate("/projects")}>
        test: open the Dashboard
      </button>
      <button type="button" onClick={() => void navigate("/settings")}>
        test: open Settings
      </button>
      <button type="button" onClick={() => void navigate("/calendar")}>
        test: open the Calendar
      </button>
      <button type="button" onClick={() => void navigate("/elsewhere")}>
        test: leave
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
          <Layout>
            <EffectProbe />
            <Readout />
            <Invitation />
            <Routes>
              <Route path="/projects" element={<ProjectsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/elsewhere" element={<p>Elsewhere</p>} />
              <Route path="/project/:id" element={<ProjectPage />} />
            </Routes>
          </Layout>
        </MemoryRouter>
      </StorageProvider>
    </AuthProvider>,
  );
}

// -- this browser's storage, and the cloud's answers ----------------------------------------------------

/** Projects kept in this browser for use without signing in. */
function seedSignedOutProjects(names: string[]) {
  for (const name of names) new LocalStorageRepository("local").save(createProject(name, "2026-10-05"));
}

/** A project in a signed-in user's copy in this browser. */
function seedUsersCopy(uid: string, name: string) {
  new LocalStorageRepository(uid).save({ ...createProject(name, "2026-10-05"), owner: uid });
}

/** A project kept in this browser for use without signing in that this version cannot read: its name is too long. */
function seedUnreadableSignedOutProject(name: string): Project {
  const project = createProject(name, "2026-10-05");
  new LocalStorageRepository("local").save(project);
  const key = `spert:project:local:${project.id}`;
  const stored = JSON.parse(localStorage.getItem(key) ?? "null") as Record<string, unknown>;
  localStorage.setItem(key, JSON.stringify({ ...stored, name: "x".repeat(201) }));
  return project;
}

/** Records, from now on, which of this browser's storages each load of the project list reads. */
function recordListLoads(): string[] {
  const reads: string[] = [];
  const load = useProjectStore.getState().loadProjects;
  useProjectStore.setState({
    loadProjects: () => {
      reads.push(getActiveStorageNamespace());
      load();
    },
  });
  return reads;
}

/** A simulation run with these samples, as the simulation hands it to the store. */
function aRun(samples: number[]): SimulationRun {
  return {
    id: "run-1",
    timestamp: "2026-10-17T12:00:00.000Z",
    trialCount: samples.length,
    seed: "seed-1",
    engineVersion: "test",
    percentiles: { 50: 2 },
    histogramBins: [],
    mean: 2,
    standardDeviation: 1,
    minSample: Math.min(...samples),
    maxSample: Math.max(...samples),
    samples,
  };
}

/** How many samples the store holds in memory for a project's first scenario's run, or null with no run. */
function samplesInMemory(id: string): number | null {
  const run = useProjectStore.getState().projects.find((p) => p.id === id)?.scenarios[0]?.simulationResults;
  return run ? run.samples.length : null;
}

/** A project in the cloud; another user's when `owner` is given, shared with Arthur. */
function cloudProject(name: string, owner = ARTHUR.uid): CloudProject {
  const members: Record<string, ProjectRole> = { [owner]: "owner" };
  if (owner !== ARTHUR.uid) members[ARTHUR.uid] = "editor";
  return { ...createProject(name, "2026-10-05"), owner, _owner: owner, _members: members };
}

async function settle() {
  await act(async () => {
    await new Promise<void>((r) => setTimeout(r, 0));
  });
}

async function authReports(user: FakeFirebaseUser | null) {
  const emit = edges.emit;
  if (!emit) throw new Error("AuthProvider has not subscribed to the auth state");
  await act(async () => {
    await emit(user);
  });
  await settle();
}

function takeLoad(kind: LoadKind, session: number): PendingLoad {
  const at = edges.loads.findIndex((l) => l.kind === kind && l.session === session);
  const load = at < 0 ? undefined : edges.loads.splice(at, 1)[0];
  if (!load) throw new Error(`no ${kind} load of session ${session} is pending`);
  return load;
}

/** The newest session's load of this kind ends with these projects — or a named, earlier session's. */
async function loadEnds(kind: LoadKind, projects: CloudProject[], session = edges.sessions) {
  const load = takeLoad(kind, session);
  await act(async () => {
    load.resolve({ projects, errors: [] });
  });
  await settle();
}

async function loadFails(kind: LoadKind, session = edges.sessions) {
  const load = takeLoad(kind, session);
  await act(async () => {
    load.reject(new Error("unavailable"));
  });
  await settle();
}

/** The invitation claim answers that a project was claimed: the re-fetch starts. */
async function claimEnds() {
  const claim = edges.claims.shift();
  if (!claim) throw new Error("no invitation claim is pending");
  await act(async () => {
    claim.resolve({ data: { claimed: [{ appId: "spertscheduler", modelId: "proj-invited", modelName: SHARED }] } });
  });
  await settle();
}

async function press(name: string) {
  fireEvent.click(screen.getByRole("button", { name }));
  await settle();
}

async function signOut() {
  await press("test: sign out");
  await waitFor(() => expect(screen.getByTestId("state").textContent).toBe("signed out, local storage"));
  await settle();
}

/** Signed in from an invitation: the first load and the re-fetch both pending. */
async function invitedSignIn() {
  sessionStorage.setItem(INVITE_SESSION_KEY, "token-1");
  edges.claimEnabled = true;
  await authReports(ARTHUR_INVITED);
  await claimEnds();
  expect(edges.loads.map((l) => l.kind)).toEqual(["first", "refetch"]);
}

const storeNames = () => useProjectStore.getState().projects.map((p) => p.name);
const tileNames = () => Array.from(document.querySelectorAll("[data-tile-open]")).map((el) => el.textContent);
const exportChoices = () =>
  screen.queryAllByRole("checkbox", { name: /^Select .* for export$/ }).map((el) => el.getAttribute("aria-label"));
const failureLine = () => screen.queryAllByRole("alert").filter((el) => el.textContent === LOAD_FAILED);
const chooseFile = () => screen.getByRole("button", { name: "Choose File" });
const IMPORT_WAIT_NOTE = "Projects can’t be imported until loading from cloud storage ends.";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  setStorageNamespace("local");
  _resetSignOutFlagsForTests();
  edges.emit = null;
  edges.current = null;
  edges.sessions = 0;
  edges.loads.length = 0;
  edges.claims.length = 0;
  edges.claimEnabled = false;
  edges.seenByEffects.length = 0;
  edges.sent.length = 0;
  useProjectStore.setState(useProjectStore.getInitialState(), true);
  usePreferencesStore.setState(usePreferencesStore.getInitialState(), true);
  useNotificationStore.setState({ notifications: [] });
  // A failed load and the cloud sync's guard each write to the console; what they write is not under test.
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(async () => {
  // A load a test leaves running is ended here, before the unmount, so that no test hands one to the next: the tests
  // share the cloud sync's module, and a breakage that counted every session's loads together would otherwise fail
  // whichever tests came after, not only its own.
  await act(async () => {
    for (const load of edges.loads.splice(0)) load.resolve({ projects: [], errors: [] });
  });
  cleanup();
  vi.restoreAllMocks();
});

// -- the project list while a cloud sign-in's first load runs ---------------------------------------------

describe("WI-113: while a cloud sign-in's first load runs, no project from this browser is on show", () => {
  it("a reload with a remembered sign-in: once the sign-in is recognised, the Dashboard says the projects are loading, with none of this browser's signed-out projects, until the cloud's arrive", async () => {
    seedSignedOutProjects([ALPHA, BETA]);
    renderApp("cloud");
    await settle();
    await authReports(ARTHUR);

    expect(screen.getByTestId("state").textContent).toBe("signed in uid-arthur, cloud storage");
    expect(storeNames()).toEqual([]);
    expect(tileNames()).toEqual([]);
    expect(screen.getByText(LOADING)).toBeInTheDocument();

    await loadEnds("first", [cloudProject(HEART)]);
    expect(tileNames()).toEqual([HEART]);
    expect(screen.queryByText(LOADING)).toBeNull();
  });

  it("when the cloud lists no projects, the Dashboard says 'No projects yet.' — the signed-out projects are not kept on show, and stay in this browser", async () => {
    seedSignedOutProjects([ALPHA, BETA]);
    renderApp("cloud");
    await settle();
    await authReports(ARTHUR);

    await loadEnds("first", []);

    expect(storeNames()).toEqual([]);
    expect(screen.getByText(EMPTY)).toBeInTheDocument();
    const kept = new LocalStorageRepository("local").list();
    expect(kept).toHaveLength(2);
  });

  it("a sign-in from the signed-out state: the signed-out projects leave the Dashboard as the sign-in is recognised", async () => {
    seedSignedOutProjects([ALPHA, BETA]);
    renderApp("cloud");
    await settle();
    await authReports(null);
    expect(tileNames()).toEqual([ALPHA, BETA]);

    await authReports(ARTHUR);

    expect(tileNames()).toEqual([]);
    expect(screen.getByText(LOADING)).toBeInTheDocument();
  });

  it("a sign-in again in the same tab after a sign-out: the signed-out projects brought back by the sign-out leave the Dashboard during the next first load", async () => {
    seedSignedOutProjects([ALPHA, BETA]);
    renderApp("cloud");
    await settle();
    await authReports(ARTHUR);
    await loadEnds("first", [cloudProject(HEART)]);
    await signOut();
    expect(tileNames()).toEqual([ALPHA, BETA]);

    await authReports(ARTHUR);

    expect(edges.sessions).toBe(2);
    expect(tileNames()).toEqual([]);
    expect(screen.getByText(LOADING)).toBeInTheDocument();
  });

  it("a different user signed in with no sign-out between: the first user's projects leave the Dashboard at once, and the second user's first load fills it", async () => {
    renderApp("cloud");
    await settle();
    await authReports(ARTHUR);
    await loadEnds("first", [cloudProject(HEART)]);
    expect(tileNames()).toEqual([HEART]);

    await authReports(FORD);

    expect(screen.getByTestId("state").textContent).toBe("signed in uid-ford, cloud storage");
    expect(storeNames()).toEqual([]);
    expect(screen.getByText(LOADING)).toBeInTheDocument();

    await loadEnds("first", [cloudProject(VOGON, FORD.uid)]);
    expect(tileNames()).toEqual([VOGON]);
  });

  it("a passive effect that runs as the sign-in is recognised already finds the list empty", async () => {
    seedSignedOutProjects([ALPHA, BETA]);
    renderApp("cloud");
    await settle();
    edges.seenByEffects.length = 0;

    await authReports(ARTHUR);

    expect(edges.seenByEffects).toEqual([[]]);
  });

  it("a passive effect that runs as a different user is recognised, with no sign-out between, already finds the list empty", async () => {
    renderApp("cloud");
    await settle();
    await authReports(ARTHUR);
    await loadEnds("first", [cloudProject(HEART)]);
    edges.seenByEffects.length = 0;

    await authReports(FORD);

    expect(edges.seenByEffects).toEqual([[]]);
  });

  it("Settings, opened while the first load runs, offers none of this browser's projects for export, nor the user's copy here", async () => {
    seedSignedOutProjects([ALPHA]);
    seedUsersCopy(ARTHUR.uid, CACHED);
    renderApp("cloud");
    await settle();
    await authReports(ARTHUR);

    await press("test: open Settings");

    expect(storeNames()).toEqual([]);
    expect(exportChoices()).toEqual([]);

    await loadEnds("first", [cloudProject(HEART)]);
    expect(exportChoices()).toEqual([`Select ${HEART} for export`]);
  });

  it("the Calendar, opened while the first load runs, does not load the user's copy in this browser into the list", async () => {
    seedUsersCopy(ARTHUR.uid, CACHED);
    renderApp("cloud");
    await settle();
    await authReports(ARTHUR);

    await press("test: open the Calendar");

    expect(storeNames()).toEqual([]);
  });

  it("the Dashboard, opened again while the first load runs, does not load the user's copy in this browser into the list", async () => {
    seedUsersCopy(ARTHUR.uid, CACHED);
    renderApp("cloud");
    await settle();
    await authReports(ARTHUR);
    await press("test: leave");

    await press("test: open the Dashboard");

    expect(storeNames()).toEqual([]);
    expect(screen.getByText(LOADING)).toBeInTheDocument();
  });

  it("a project's page open as the sign-in is recognised does not load the user's copy in this browser into the list, and says the projects are loading", async () => {
    seedSignedOutProjects([ALPHA]);
    seedUsersCopy(ARTHUR.uid, CACHED);
    const heart = cloudProject(HEART);
    renderApp("cloud", `/project/${heart.id}`);
    await settle();

    await authReports(ARTHUR);

    expect(storeNames()).toEqual([]);
    expect(screen.getByText(LOADING)).toBeInTheDocument();
    expect(screen.queryByText(UNAVAILABLE)).toBeNull();
  });

  it("control: with no signed-out projects in this browser, a cloud sign-in says the projects are loading, then shows them, as before", async () => {
    renderApp("cloud");
    await settle();
    await authReports(ARTHUR);
    expect(screen.getByText(LOADING)).toBeInTheDocument();

    await loadEnds("first", [cloudProject(HEART)]);

    expect(tileNames()).toEqual([HEART]);
  });

  it("control: signed in with local storage chosen, the Dashboard keeps this browser's signed-out projects, as before", async () => {
    seedSignedOutProjects([ALPHA, BETA]);
    renderApp("local");
    await settle();

    await authReports(ARTHUR);

    expect(screen.getByTestId("state").textContent).toBe("signed in uid-arthur, local storage");
    expect(tileNames()).toEqual([ALPHA, BETA]);
    expect(edges.loads).toHaveLength(0);
  });
});

// -- a failed load ------------------------------------------------------------------------------------

describe("WI-113: a failed cloud load is said on the Dashboard, and 'No projects yet.' is not", () => {
  it("a failed first load: the Dashboard says so, and not 'No projects yet.'", async () => {
    renderApp("cloud");
    await settle();
    await authReports(ARTHUR);

    await loadFails("first");

    expect(failureLine()).toHaveLength(1);
    expect(screen.queryByText(EMPTY)).toBeNull();
    expect(screen.queryByText(LOADING)).toBeNull();
  });

  it("a failed first load with this browser's signed-out projects: the Dashboard says so, and shows none of them", async () => {
    seedSignedOutProjects([ALPHA, BETA]);
    renderApp("cloud");
    await settle();
    await authReports(ARTHUR);

    await loadFails("first");

    expect(failureLine()).toHaveLength(1);
    expect(tileNames()).toEqual([]);
    expect(screen.queryByText(EMPTY)).toBeNull();
  });

  it("a failed invitation re-fetch, after the first load ended with projects: the Dashboard says so above them", async () => {
    renderApp("cloud");
    await settle();
    await invitedSignIn();
    await loadEnds("first", [cloudProject(HEART)]);
    expect(failureLine()).toHaveLength(0);

    await loadFails("refetch");

    expect(failureLine()).toHaveLength(1);
    expect(tileNames()).toEqual([HEART]);
  });

  it("a failed invitation re-fetch before the first load ends: the Dashboard says the projects are loading until that load ends, then that loading failed — the first load began before the invitation was claimed", async () => {
    renderApp("cloud");
    await settle();
    await invitedSignIn();

    await loadFails("refetch");
    expect(screen.getByText(LOADING)).toBeInTheDocument();
    expect(failureLine()).toHaveLength(0);

    await loadEnds("first", [cloudProject(HEART)]);
    expect(failureLine()).toHaveLength(1);
    expect(tileNames()).toEqual([HEART]);
  });

  it("a failed first load, then an invitation re-fetch that answers: the line goes, and the re-fetch's list is on show", async () => {
    renderApp("cloud");
    await settle();
    sessionStorage.setItem(INVITE_SESSION_KEY, "token-1");
    edges.claimEnabled = true;
    await authReports(ARTHUR_INVITED);
    await loadFails("first");
    expect(failureLine()).toHaveLength(1);

    await claimEnds();
    await loadEnds("refetch", [cloudProject(HEART), cloudProject(SHARED, ZAPHOD)]);

    expect(failureLine()).toHaveLength(0);
    expect(tileNames()).toEqual([HEART, SHARED]);
  });

  it("the line goes when the session ends: after a sign-out the Dashboard shows this browser's signed-out projects, without it", async () => {
    seedSignedOutProjects([ALPHA]);
    renderApp("cloud");
    await settle();
    await authReports(ARTHUR);
    await loadFails("first");
    expect(failureLine()).toHaveLength(1);

    await signOut();

    expect(failureLine()).toHaveLength(0);
    expect(tileNames()).toEqual([ALPHA]);
  });

  it("a new session starts without the line: a failed load, a sign-out and a sign-in again — no line while the second load runs, nor after it", async () => {
    renderApp("cloud");
    await settle();
    await authReports(ARTHUR);
    await loadFails("first");
    expect(failureLine()).toHaveLength(1);
    await signOut();

    await authReports(ARTHUR);
    expect(failureLine()).toHaveLength(0);
    await loadEnds("first", [cloudProject(HEART)]);

    expect(failureLine()).toHaveLength(0);
    expect(tileNames()).toEqual([HEART]);
  });

  it("a different user signed in after a failed load, with no sign-out between: the second user's Dashboard does not say a load failed", async () => {
    renderApp("cloud");
    await settle();
    await authReports(ARTHUR);
    await loadFails("first");
    expect(failureLine()).toHaveLength(1);

    await authReports(FORD);
    expect(failureLine()).toHaveLength(0);
    await loadEnds("first", [cloudProject(VOGON, FORD.uid)]);

    expect(failureLine()).toHaveLength(0);
    expect(tileNames()).toEqual([VOGON]);
  });

  it("a re-fetch from a session that has ended fails without the line: the next session's Dashboard does not say a load failed", async () => {
    renderApp("cloud");
    await settle();
    await invitedSignIn();
    await loadEnds("first", [cloudProject(HEART)]);
    await signOut();
    await authReports(ARTHUR);
    await loadEnds("first", [cloudProject(HEART)], 2);

    await loadFails("refetch", 1);

    expect(failureLine()).toHaveLength(0);
    expect(tileNames()).toEqual([HEART]);
  });
});

// -- an empty re-fetch answer ----------------------------------------------------------------------------

describe("WI-113: an invitation re-fetch that answers with no projects", () => {
  it("after the first load listed the user's projects, an empty re-fetch answer keeps them on show and ends its part: Choose File comes back", async () => {
    renderApp("cloud");
    await settle();
    await press("Import Projects");
    await invitedSignIn();
    await loadEnds("first", [cloudProject(HEART)]);
    expect(chooseFile()).toBeDisabled();

    await loadEnds("refetch", []);

    expect(tileNames()).toEqual([HEART]);
    expect(chooseFile()).toBeEnabled();
    expect(screen.queryByText(IMPORT_WAIT_NOTE)).toBeNull();
  });
});

// -- the first load's empty answer after the re-fetch's ------------------------------------------------------

describe("WI-113: the first load's data-loss guard, now that the list is empty when that load begins", () => {
  it("control: when the invitation re-fetch answers first, an empty answer from the first load keeps the invited project on show, as before", async () => {
    renderApp("cloud");
    await settle();
    await invitedSignIn();
    await loadEnds("refetch", [cloudProject(SHARED, ZAPHOD)]);
    expect(tileNames()).toEqual([SHARED]);

    await loadEnds("first", []);

    expect(tileNames()).toEqual([SHARED]);
    expect(screen.queryByText(EMPTY)).toBeNull();
    expect(screen.queryByText(LOADING)).toBeNull();
  });
});

// -- a project's page, its project not in the list ------------------------------------------------------

describe("WI-113: a project's page whose project is not in the list", () => {
  it("a reload of a cloud project's page with a remembered sign-in: it says the projects are loading — before the sign-in is recognised, and until the first load brings it", async () => {
    const heart = cloudProject(HEART);
    renderApp("cloud", `/project/${heart.id}`);
    await settle();
    expect(screen.getByText(LOADING)).toBeInTheDocument();
    expect(screen.queryByText(UNAVAILABLE)).toBeNull();

    await authReports(ARTHUR);
    expect(screen.getByText(LOADING)).toBeInTheDocument();
    expect(screen.queryByText(MAY_HAVE_BEEN_DELETED)).toBeNull();

    await loadEnds("first", [heart]);
    expect(screen.queryByText(LOADING)).toBeNull();
    expect(screen.getAllByRole("heading", { level: 1 })[0]).toHaveTextContent(HEART);
  });

  it("while an invitation re-fetch runs after the first load, the page of a project not yet listed says the projects are loading, until the re-fetch brings it", async () => {
    const shared = cloudProject(SHARED, ZAPHOD);
    renderApp("cloud", `/project/${shared.id}`);
    await settle();
    await invitedSignIn();
    await loadEnds("first", [cloudProject(HEART)]);

    // Read with queryByText: a failed getByText prints the page, whose invitation banner's "×" the breakage runner's
    // name parser would count as a failing test.
    expect(screen.queryByText(LOADING)).not.toBeNull();
    expect(screen.queryByText(UNAVAILABLE)).toBeNull();

    await loadEnds("refetch", [cloudProject(HEART), shared]);
    expect(screen.getAllByRole("heading", { level: 1 })[0]).toHaveTextContent(SHARED);
  });

  it("after a sign-out, a cloud project's page says it is not among this browser's signed-out projects — not that it may have been deleted", async () => {
    const heart = cloudProject(HEART);
    renderApp("cloud", `/project/${heart.id}`);
    await settle();
    await authReports(ARTHUR);
    await loadEnds("first", [heart]);
    expect(screen.getAllByRole("heading", { level: 1 })[0]).toHaveTextContent(HEART);

    await signOut();

    expect(screen.getByText(UNAVAILABLE)).toBeInTheDocument();
    expect(screen.getByText(SIGNED_OUT_ADVICE)).toBeInTheDocument();
    expect(screen.queryByText(MAY_HAVE_BEEN_DELETED)).toBeNull();
  });

  it("control: signed in to cloud storage, everything loaded, a project not in the list keeps today's two lines", async () => {
    renderApp("cloud", "/project/not-in-the-list");
    await settle();
    await authReports(ARTHUR);
    await loadEnds("first", [cloudProject(HEART)]);

    expect(screen.getByText(UNAVAILABLE)).toBeInTheDocument();
    expect(screen.getByText(MAY_HAVE_BEEN_DELETED)).toBeInTheDocument();
    expect(screen.queryByText(LOADING)).toBeNull();
  });

  it("control: signed in with local storage chosen, a project not in the list keeps today's two lines", async () => {
    renderApp("local", "/project/not-in-the-list");
    await settle();
    await authReports(ARTHUR);

    expect(screen.getByText(UNAVAILABLE)).toBeInTheDocument();
    expect(screen.getByText(MAY_HAVE_BEEN_DELETED)).toBeInTheDocument();
    expect(screen.queryByText(SIGNED_OUT_ADVICE)).toBeNull();
  });

  it("signed out with local storage chosen, a project not in the list says it is not among this browser's projects, not that it may have been deleted", async () => {
    renderApp("local", "/project/not-in-the-list");
    await settle();
    await authReports(null);

    expect(screen.getByText(UNAVAILABLE)).toBeInTheDocument();
    expect(screen.getByText(SIGNED_OUT_ADVICE)).toBeInTheDocument();
    expect(screen.queryByText(MAY_HAVE_BEEN_DELETED)).toBeNull();
  });
});

// -- a project's page: the Dashboard's loading line, a failed load, and the advice when signed out ---------------------

describe("WI-113: a project's page whose project is not in the list — the Dashboard's line while loading, a failed load, signed out", () => {
  it("the page of one of this browser's signed-out projects, open as a cloud sign-in is recognised: the Dashboard's loading line while the load runs — not a line about that project — then today's two lines", async () => {
    const alpha = createProject(ALPHA, "2026-10-05");
    new LocalStorageRepository("local").save(alpha);
    renderApp("cloud", `/project/${alpha.id}`);
    await settle();
    await authReports(null);
    expect(screen.getAllByRole("heading", { level: 1 })[0]).toHaveTextContent(ALPHA);

    await authReports(ARTHUR);
    expect(screen.getByText(LOADING)).toBeInTheDocument();
    expect(screen.queryByText(UNAVAILABLE)).toBeNull();

    await loadEnds("first", [cloudProject(HEART)]);
    expect(screen.getByText(UNAVAILABLE)).toBeInTheDocument();
    expect(screen.getByText(MAY_HAVE_BEEN_DELETED)).toBeInTheDocument();
    expect(new LocalStorageRepository("local").list()).toEqual([alpha.id]);
  });

  it("the first user's project page at a change of user: the Dashboard's loading line while the second user's load runs", async () => {
    const heart = cloudProject(HEART);
    renderApp("cloud", `/project/${heart.id}`);
    await settle();
    await authReports(ARTHUR);
    await loadEnds("first", [heart]);
    expect(screen.getAllByRole("heading", { level: 1 })[0]).toHaveTextContent(HEART);

    await authReports(FORD);

    expect(screen.getByText(LOADING)).toBeInTheDocument();
    expect(screen.queryByText(UNAVAILABLE)).toBeNull();
  });

  it("a reload of a cloud project's page, the first load failing: the page says the load failed, in place of both lines — not that the project may have been deleted", async () => {
    const heart = cloudProject(HEART);
    renderApp("cloud", `/project/${heart.id}`);
    await settle();
    await authReports(ARTHUR);
    expect(screen.getByText(LOADING)).toBeInTheDocument();

    await loadFails("first");

    expect(screen.getByRole("alert")).toHaveTextContent(PROJECT_LOAD_FAILED);
    expect(screen.queryByText(UNAVAILABLE)).toBeNull();
    expect(screen.queryByText(MAY_HAVE_BEEN_DELETED)).toBeNull();
    expect(screen.queryByText(LOADING)).toBeNull();
  });

  it("a failed first load while the invitation re-fetch still runs: the page says the projects are loading, not that a load failed, until the re-fetch answers — and then, the line gone, today's two lines", async () => {
    renderApp("cloud", "/project/not-in-the-list");
    await settle();
    await invitedSignIn();

    await loadFails("first");
    // queryByText throughout: see the test of a project not yet listed while the re-fetch runs.
    expect(screen.queryByText(LOADING)).not.toBeNull();
    expect(screen.queryByText(PROJECT_LOAD_FAILED)).toBeNull();

    await loadEnds("refetch", [cloudProject(HEART), cloudProject(SHARED, ZAPHOD)]);
    expect(screen.queryByText(PROJECT_LOAD_FAILED)).toBeNull();
    expect(screen.queryByText(UNAVAILABLE)).not.toBeNull();
    expect(screen.queryByText(MAY_HAVE_BEEN_DELETED)).not.toBeNull();
  });

  it("signed out, the page of a project this browser keeps but cannot read gives the signed-out advice, which holds for it too — not that it may have been deleted", async () => {
    const unreadable = seedUnreadableSignedOutProject(ALPHA);
    renderApp("local", `/project/${unreadable.id}`);
    await settle();
    await authReports(null);

    expect(useProjectStore.getState().loadErrors.map((e) => e.projectId)).toEqual([unreadable.id]);
    expect(screen.getByText(UNAVAILABLE)).toBeInTheDocument();
    expect(screen.getByText(SIGNED_OUT_ADVICE)).toBeInTheDocument();
    expect(screen.queryByText(MAY_HAVE_BEEN_DELETED)).toBeNull();
  });

  it("a reload of a cloud project's page with cloud storage chosen and no one signed in: the Dashboard's loading line until that is known, then the signed-out advice", async () => {
    renderApp("cloud", "/project/not-in-the-list");
    await settle();
    expect(screen.getByText(LOADING)).toBeInTheDocument();

    await authReports(null);

    expect(screen.queryByText(LOADING)).toBeNull();
    expect(screen.getByText(UNAVAILABLE)).toBeInTheDocument();
    expect(screen.getByText(SIGNED_OUT_ADVICE)).toBeInTheDocument();
  });
});

// -- a switch to local storage while signed in -----------------------------------------------------------------------

describe("WI-113: a switch to local storage while signed in loads the list again from this browser", () => {
  it("a switch to local storage while the first load runs lists this browser's copy of the user's projects — not 'No projects yet.' — the ended load's late answer does not replace it, and nothing is sent", async () => {
    seedSignedOutProjects([ALPHA]);
    seedUsersCopy(ARTHUR.uid, CACHED);
    renderApp("cloud");
    await settle();
    await authReports(ARTHUR);
    expect(screen.getByText(LOADING)).toBeInTheDocument();

    await press("test: use local storage");
    expect(screen.getByTestId("state").textContent).toBe("signed in uid-arthur, local storage");
    expect(tileNames()).toEqual([CACHED]);
    expect(screen.queryByText(EMPTY)).toBeNull();

    await loadEnds("first", [cloudProject(HEART)], 1);
    expect(tileNames()).toEqual([CACHED]);
    expect(edges.sent).toEqual([]);
  });

  it("a switch to local storage after a failed first load lists this browser's copy of the user's projects", async () => {
    seedSignedOutProjects([ALPHA]);
    seedUsersCopy(ARTHUR.uid, CACHED);
    renderApp("cloud");
    await settle();
    await authReports(ARTHUR);
    await loadFails("first");
    expect(failureLine()).toHaveLength(1);

    await press("test: use local storage");

    expect(tileNames()).toEqual([CACHED]);
    expect(screen.queryByText(EMPTY)).toBeNull();
    expect(failureLine()).toHaveLength(0);
  });

  it("a switch to local storage after a failed first load and a project made since lists the whole of this browser's copy, not only the new project", async () => {
    seedUsersCopy(ARTHUR.uid, CACHED);
    renderApp("cloud");
    await settle();
    await authReports(ARTHUR);
    await loadFails("first");
    await act(async () => {
      useProjectStore.getState().addProject(HEART, ARTHUR.uid);
    });
    await settle();
    expect(tileNames()).toEqual([HEART]);

    await press("test: use local storage");

    expect(tileNames()).toEqual([CACHED, HEART]);
  });

  it("a switch to local storage from a project's page while the first load runs shows the project, from this browser's copy", async () => {
    const cached = { ...createProject(CACHED, "2026-10-05"), owner: ARTHUR.uid };
    new LocalStorageRepository(ARTHUR.uid).save(cached);
    renderApp("cloud", `/project/${cached.id}`);
    await settle();
    await authReports(ARTHUR);
    expect(screen.getByText(LOADING)).toBeInTheDocument();

    await press("test: use local storage");

    expect(screen.getAllByRole("heading", { level: 1 })[0]).toHaveTextContent(CACHED);
    expect(screen.queryByText(UNAVAILABLE)).toBeNull();
  });

  it("control: a switch to local storage after the first load leaves the list as it was — a run's samples, held only in memory, are kept", async () => {
    seedUsersCopy(ARTHUR.uid, CACHED);
    renderApp("cloud");
    await settle();
    await authReports(ARTHUR);
    const heart = cloudProject(HEART);
    await loadEnds("first", [heart, cloudProject(VOGON)]);
    await act(async () => {
      useProjectStore.getState().setSimulationResults(heart.id, heart.scenarios[0]?.id ?? "", aRun([1, 2, 3]));
    });
    await settle();
    expect(samplesInMemory(heart.id)).toBe(3);

    await press("test: use local storage");

    expect(tileNames()).toEqual([HEART, VOGON]);
    expect(samplesInMemory(heart.id)).toBe(3);
  });

  it("control: a switch to local storage after the invitation re-fetch answered, the first load still running, leaves the list as the re-fetch filled it", async () => {
    seedUsersCopy(ARTHUR.uid, CACHED);
    renderApp("cloud");
    await settle();
    await invitedSignIn();
    const heart = cloudProject(HEART);
    await loadEnds("refetch", [heart, cloudProject(SHARED, ZAPHOD)]);
    await act(async () => {
      useProjectStore.getState().setSimulationResults(heart.id, heart.scenarios[0]?.id ?? "", aRun([1, 2, 3]));
    });
    await settle();

    await press("test: use local storage");

    expect(tileNames()).toEqual([HEART, SHARED]);
    expect(samplesInMemory(heart.id)).toBe(3);
  });

  it("control: a switch to local storage after a failed invitation re-fetch, the first load having filled the list, leaves it as it was — a run's samples kept", async () => {
    renderApp("cloud");
    await settle();
    await invitedSignIn();
    const heart = cloudProject(HEART);
    await loadEnds("first", [heart]);
    await act(async () => {
      useProjectStore.getState().setSimulationResults(heart.id, heart.scenarios[0]?.id ?? "", aRun([1, 2, 3]));
    });
    await settle();
    await loadFails("refetch");
    expect(failureLine()).toHaveLength(1);

    await press("test: use local storage");

    expect(tileNames()).toEqual([HEART]);
    expect(samplesInMemory(heart.id)).toBe(3);
  });

  it("control: a sign-out loads the list once, from this browser's signed-out storage — the switch's load does not run", async () => {
    seedSignedOutProjects([ALPHA]);
    // Recorded from the start: a page's effect keyed on the load would run again if it were replaced later.
    const reads = recordListLoads();
    renderApp("cloud");
    await settle();
    await authReports(ARTHUR);
    await loadEnds("first", [cloudProject(HEART)]);
    const atSignOut = reads.length;

    await signOut();

    expect(reads.slice(atSignOut)).toEqual(["local"]);
    expect(tileNames()).toEqual([ALPHA]);
  });
});

// -- a switch to cloud storage while signed in -----------------------------------------------------------------------

describe("WI-113: a switch to cloud storage while signed in", () => {
  it("signed in with local storage chosen and this browser's projects on show, a switch to cloud storage empties the list until the first load ends", async () => {
    seedSignedOutProjects([ALPHA, BETA]);
    renderApp("local");
    await settle();
    await authReports(ARTHUR);
    expect(tileNames()).toEqual([ALPHA, BETA]);

    await press("test: use cloud storage");

    expect(screen.getByTestId("state").textContent).toBe("signed in uid-arthur, cloud storage");
    expect(storeNames()).toEqual([]);
    expect(screen.getByText(LOADING)).toBeInTheDocument();
    await loadEnds("first", [cloudProject(HEART)]);
    expect(tileNames()).toEqual([HEART]);
  });

  it("the same switch, the cloud listing no projects: this browser's projects are not kept on show in cloud storage", async () => {
    seedSignedOutProjects([ALPHA, BETA]);
    renderApp("local");
    await settle();
    await authReports(ARTHUR);
    expect(tileNames()).toEqual([ALPHA, BETA]);

    await press("test: use cloud storage");
    await loadEnds("first", []);

    expect(storeNames()).toEqual([]);
    expect(screen.getByText(EMPTY)).toBeInTheDocument();
  });
});
