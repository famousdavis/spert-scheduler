// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import type { Project, UserPreferences } from "@domain/models/types";
import type { LoadError } from "@infrastructure/persistence/local-storage-repository";
import type { ProjectRole } from "@infrastructure/firebase/firestore-driver";

/**
 * WI-113: the invitation re-fetch — the second cloud load a sign-in runs after it claims an invitation to someone's
 * project — and the first load, counted together.
 *
 * Both loads marked the cloud data loaded with one flag, so whichever ended first said "loaded" while the other still
 * ran: an empty Dashboard said "No projects yet." before the invited project arrived, and Import Projects' Choose File
 * was available while its confirm refused. Now the data counts as loaded only when every load of the session has
 * ended, on success or failure (owner ruling, 2026-10-10) — each load counted out once, however many of its ends it
 * reaches, as the one flag could be set twice with no harm.
 *
 * And a re-fetch answer that arrived after its session had ended — a sign-out, a switch to local storage, a new
 * sign-in — replaced the project list of whatever came next and rewrote that storage's list of projects: after a
 * sign-out, this browser's signed-out projects left the Dashboard for good, although their data stayed in storage.
 * Now such an answer, success or failure, changes nothing (owner ruling, 2026-10-10).
 *
 * The real AuthProvider, StorageProvider, cloud sync (as Layout runs it), Dashboard and stores. Only the Firebase edges
 * are replaced: the auth listener (driven by hand, and told of a sign-out only when the user changes, as Firebase
 * does), the invitation claim (held, so a test decides when the re-fetch starts), and the app's Firestore driver
 * (each of whose loads a test ends by hand, by session and kind, whose settings read can be held, and whose project
 * listener can be made to throw).
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
/** A session's first load, or a re-fetch after an invitation is claimed. */
type LoadKind = "first" | "refetch";
interface PendingLoad extends Pending<CloudLoad> {
  session: number;
  kind: LoadKind;
}
interface ClaimResult {
  data: { claimed: string[] };
}
interface FirebaseEdges {
  emit: ((user: FakeFirebaseUser | null) => Promise<void>) | null;
  /** The user the auth listener last heard of. */
  current: FakeFirebaseUser | null;
  /** How many cloud sessions have started: each new driver is the next one. */
  sessions: number;
  loads: PendingLoad[];
  holdPrefs: boolean;
  prefLoads: Pending<Partial<UserPreferences>>[];
  claims: Pending<ClaimResult>[];
  claimEnabled: boolean;
  created: string[];
  /** How many of the next project listeners throw as they are set up. */
  listenerFails: number;
}

const edges = vi.hoisted(() => {
  const e: FirebaseEdges = {
    emit: null,
    current: null,
    sessions: 0,
    loads: [],
    holdPrefs: false,
    prefLoads: [],
    claims: [],
    claimEnabled: false,
    created: [],
    listenerFails: 0,
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
      if (edges.holdPrefs) {
        return new Promise<Partial<UserPreferences>>((resolve, reject) => {
          edges.prefLoads.push({ resolve, reject });
        });
      }
      const none: Partial<UserPreferences> = {};
      return Promise.resolve(none);
    }
    subscribeToProject() {
      if (edges.listenerFails > 0) {
        edges.listenerFails -= 1;
        throw new Error("listener refused");
      }
      return () => {};
    }
    save() {}
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

import { AuthProvider, useAuth, _resetSignOutFlagsForTests } from "@ui/providers/AuthProvider";
import { StorageProvider, useStorage } from "@ui/providers/StorageProvider";
import { useCloudSync } from "@ui/hooks/use-cloud-sync";
import { useProjectStore } from "@ui/hooks/use-project-store";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";
import { useNotificationStore } from "@ui/hooks/use-notification-store";
import { setStorageNamespace, LocalStorageRepository } from "@infrastructure/persistence/local-storage-repository";
import { createProject } from "@app/api/project-service";
import { serializeExport } from "@app/api/export-import-service";
import { ProjectsPage } from "./ProjectsPage";

const LOADING = "Loading your projects from cloud storage…";
const EMPTY = "No projects yet.";
const IMPORT_WAIT_NOTE = "Projects can’t be imported until loading from cloud storage ends.";
const PICK_AGAIN = "Choose the file again when loading has ended.";
const IMPORT_REFUSED = "Cloud data is still loading. Please wait and try again.";
const LOAD_FAILED = "Scheduler couldn’t finish loading from cloud storage, so some projects may be missing here. Reload the page to try again.";
const ALPHA = "Local Alpha";
const BETA = "Local Beta";
const HEART = "Heart of Gold Refit";
const SHARED = "Shared Magrathea";
const IMPORTED = "Probe Imported Project";

const ARTHUR: FakeFirebaseUser = {
  uid: "uid-arthur",
  email: "arthur@example.com",
  displayName: "Arthur Dent",
  photoURL: null,
  emailVerified: false, // no invitation claim
  providerData: [],
};
const ARTHUR_INVITED: FakeFirebaseUser = { ...ARTHUR, emailVerified: true }; // claims, then re-fetches
const ZAPHOD = "uid-zaphod";

/** Layout's call, without the rest of Layout. */
function CloudSync() {
  useCloudSync();
  return null;
}

function Readout() {
  const { user, signOut } = useAuth();
  const { mode, switchMode } = useStorage();
  return (
    <div>
      <p data-testid="state">{`${user ? "signed in" : "signed out"}, ${mode} storage`}</p>
      <button type="button" onClick={() => void signOut()}>
        test: sign out
      </button>
      <button type="button" onClick={() => switchMode("local")}>
        test: use local storage
      </button>
    </div>
  );
}

function renderApp(chosenStorage: "local" | "cloud" = "cloud") {
  localStorage.setItem("spert:storage-mode", chosenStorage);
  return render(
    <AuthProvider>
      <StorageProvider>
        <MemoryRouter initialEntries={["/projects"]}>
          <CloudSync />
          <Readout />
          <Routes>
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/project/:id" element={<p>Project page</p>} />
          </Routes>
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
    claim.resolve({ data: { claimed: ["proj-invited"] } });
  });
  await settle();
}

async function preferencesEnd() {
  const prefs = edges.prefLoads.shift();
  if (!prefs) throw new Error("no settings read is pending");
  await act(async () => {
    prefs.resolve({});
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
  edges.claimEnabled = true;
  await authReports(ARTHUR_INVITED);
  expect(screen.getByTestId("state").textContent).toBe("signed in, cloud storage");
  await claimEnds();
  expect(edges.loads.map((l) => l.kind)).toEqual(["first", "refetch"]);
}

/** A file reaches Import Projects' file input. Refused or not, the answer is on screen when this returns. */
async function fileArrives(projectName: string) {
  const file = new File([serializeExport([createProject(projectName, "2026-10-05")])], "probe.json", {
    type: "application/json",
  });
  fireEvent.change(screen.getByLabelText("Project import JSON file"), { target: { files: [file] } });
  await waitFor(() =>
    expect(screen.queryByRole("alert") ?? screen.queryByRole("button", { name: "Confirm Import" })).not.toBeNull(),
  );
  await settle();
}

const storeNames = () => useProjectStore.getState().projects.map((p) => p.name);
const tileNames = () => Array.from(document.querySelectorAll("[data-tile-open]")).map((el) => el.textContent);
const chooseFile = () => screen.getByRole("button", { name: "Choose File" });

/** The project names a storage namespace lists, in order; "(none)" when it has no list at all. */
function listedIn(namespace: string): string[] {
  const raw = localStorage.getItem(`spert:project-index:${namespace}`);
  if (raw === null) return ["(none)"];
  return (JSON.parse(raw) as string[]).map((id) => {
    const stored = localStorage.getItem(`spert:project:${namespace}:${id}`);
    return stored === null ? `(missing ${id})` : (JSON.parse(stored) as { name: string }).name;
  });
}

/** The names of every project stored under a namespace, listed or not, sorted. */
function storedIn(namespace: string): string[] {
  const names: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(`spert:project:${namespace}:`)) {
      names.push((JSON.parse(localStorage.getItem(key) ?? "{}") as { name: string }).name);
    }
  }
  return names.sort((a, b) => a.localeCompare(b));
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  setStorageNamespace("local");
  _resetSignOutFlagsForTests();
  edges.emit = null;
  edges.current = null;
  edges.sessions = 0;
  edges.loads.length = 0;
  edges.holdPrefs = false;
  edges.prefLoads.length = 0;
  edges.claims.length = 0;
  edges.claimEnabled = false;
  edges.created.length = 0;
  edges.listenerFails = 0;
  useProjectStore.setState(useProjectStore.getInitialState(), true);
  usePreferencesStore.setState(usePreferencesStore.getInitialState(), true);
  useNotificationStore.setState({ notifications: [] });
  // A failed load is logged, and so is the cloud sync's guard against an empty answer; neither is under test.
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// -- the Dashboard ---------------------------------------------------------------------------------------

describe("WI-113: the Dashboard waits for every cloud load of the sign-in", () => {
  it("with the first load ended empty and the invitation re-fetch still running, the Dashboard says the projects are loading, not that there are none", async () => {
    renderApp();
    await invitedSignIn();

    await loadEnds("first", []);

    expect(screen.getByText(LOADING)).toBeInTheDocument();
    expect(screen.queryByText(EMPTY)).toBeNull();

    await loadEnds("refetch", [cloudProject(SHARED, ZAPHOD)]);
    expect(tileNames()).toEqual([SHARED]);
    expect(screen.queryByText(LOADING)).toBeNull();
  });

  it("with the re-fetch ended empty and the first load still running, the Dashboard says the projects are loading until the first load ends too", async () => {
    renderApp();
    await invitedSignIn();

    await loadEnds("refetch", []);

    expect(screen.getByText(LOADING)).toBeInTheDocument();
    expect(screen.queryByText(EMPTY)).toBeNull();

    await loadEnds("first", []);
    expect(screen.getByText(EMPTY)).toBeInTheDocument();
    expect(screen.queryByText(LOADING)).toBeNull();
  });

  it("a re-fetch that fails ends its part: with the first load ended empty, the Dashboard then says the load failed, not that there are no projects", async () => {
    renderApp();
    await invitedSignIn();
    await loadEnds("first", []);
    expect(screen.getByText(LOADING)).toBeInTheDocument();

    await loadFails("refetch");

    // WI-113: a failed load is said, and "No projects yet." is not (owner ruling, 2026-10-16).
    expect(screen.getByRole("alert")).toHaveTextContent(LOAD_FAILED);
    expect(screen.queryByText(EMPTY)).toBeNull();
    expect(screen.queryByText(LOADING)).toBeNull();
  });

  it("control: a sign-in with no invitation says the projects are loading until its one load ends, then shows them, as before", async () => {
    renderApp();
    await authReports(ARTHUR);
    expect(edges.loads.map((l) => l.kind)).toEqual(["first"]);
    expect(screen.getByText(LOADING)).toBeInTheDocument();
    expect(useProjectStore.getState().cloudDataLoaded).toBe(false);

    await loadEnds("first", [cloudProject(HEART)]);

    expect(tileNames()).toEqual([HEART]);
    expect(screen.queryByText(LOADING)).toBeNull();
    expect(useProjectStore.getState().cloudDataLoaded).toBe(true);
  });

  it("an empty re-fetch answer, with the first load still running, ends its part too: when the first load ends, Choose File comes back", async () => {
    seedSignedOutProjects([ALPHA]);
    renderApp();
    await settle();
    await press("Import Projects");
    await invitedSignIn();

    // Since WI-113 this browser's signed-out project is not on show during the sign-in, so the empty answer finds an
    // empty list; it ends its part all the same. (The guard's own exit is reached in the cloud sign-in display tests.)
    await loadEnds("refetch", []);
    await loadEnds("first", [cloudProject(HEART)]);

    expect(tileNames()).toEqual([HEART]);
    expect(chooseFile()).toBeEnabled();
    expect(screen.queryByText(IMPORT_WAIT_NOTE)).toBeNull();
  });

  it("constructed — the first load's success callback throws after the load has ended, so its failure callback ends it again: a later re-fetch still ends the loading", async () => {
    renderApp();
    await press("Import Projects");
    edges.claimEnabled = true;
    await authReports(ARTHUR_INVITED);
    edges.listenerFails = 1;

    // The first load ends before the claim answers; setting up its project's listener then throws.
    await loadEnds("first", [cloudProject(HEART)]);
    expect(edges.listenerFails).toBe(0);
    expect(console.error).toHaveBeenCalledWith("Failed to load projects from Firestore:", expect.any(Error));
    expect(chooseFile()).toBeEnabled();

    await claimEnds();
    expect(edges.loads.map((l) => l.kind)).toEqual(["refetch"]);
    expect(chooseFile()).toBeDisabled();

    await loadEnds("refetch", [cloudProject(HEART), cloudProject(SHARED, ZAPHOD)]);

    expect(tileNames()).toEqual([HEART, SHARED]);
    expect(useProjectStore.getState().cloudDataLoaded).toBe(true);
    expect(chooseFile()).toBeEnabled();
    expect(screen.queryByText(IMPORT_WAIT_NOTE)).toBeNull();
  });
});

// -- Import Projects --------------------------------------------------------------------------------------

describe("WI-113: Import Projects' Choose File, its note and its confirm agree", () => {
  it("the invited project on screen from the re-fetch, the first load still running: Choose File is greyed out, and the note says why", async () => {
    renderApp();
    await press("Import Projects");
    await invitedSignIn();

    await loadEnds("refetch", [cloudProject(SHARED, ZAPHOD)]);

    expect(tileNames()).toEqual([SHARED]);
    expect(chooseFile()).toBeDisabled();
    expect(screen.getByText(IMPORT_WAIT_NOTE)).toBeInTheDocument();

    await loadEnds("first", [cloudProject(SHARED, ZAPHOD)]);
    expect(chooseFile()).toBeEnabled();
    expect(screen.queryByText(IMPORT_WAIT_NOTE)).toBeNull();
  });

  it("the projects on screen and the user's settings still loading: Choose File is greyed out, and the note says projects can't be imported until loading ends", async () => {
    edges.holdPrefs = true;
    renderApp();
    await press("Import Projects");
    await authReports(ARTHUR);

    await loadEnds("first", [cloudProject(HEART)]);
    expect(edges.prefLoads).toHaveLength(1);

    expect(tileNames()).toEqual([HEART]);
    expect(chooseFile()).toBeDisabled();
    expect(screen.getByText(IMPORT_WAIT_NOTE)).toBeInTheDocument();
    expect(screen.queryByText(/Cloud projects are still loading/)).toBeNull();

    await preferencesEnd();
    expect(chooseFile()).toBeEnabled();
    expect(screen.queryByText(IMPORT_WAIT_NOTE)).toBeNull();
  });

  it("a file reaching Import Projects while it waits is refused as it is picked, in the note's words; chosen again after the load, it imports", async () => {
    renderApp();
    await press("Import Projects");
    await authReports(ARTHUR);
    expect(chooseFile()).toBeDisabled();

    await fileArrives(IMPORTED);

    const refusal = screen.getByRole("alert");
    expect(refusal).toHaveTextContent(IMPORT_WAIT_NOTE);
    expect(refusal).toHaveTextContent(PICK_AGAIN);
    expect(screen.queryByRole("button", { name: "Confirm Import" })).toBeNull();

    await loadEnds("first", [cloudProject(HEART)]);
    await press("Try another file");
    await fileArrives(IMPORTED);
    await press("Confirm Import");
    await waitFor(() => expect(storeNames()).toEqual([HEART, IMPORTED]));
    await waitFor(() => expect(edges.created).toEqual([IMPORTED]));
  });

  it("a file confirmed while a later re-fetch runs is refused, with Choose File greyed out and the note shown; when the re-fetch ends, the file chosen again imports", async () => {
    renderApp();
    await press("Import Projects");
    edges.claimEnabled = true;
    await authReports(ARTHUR_INVITED);
    // The first load ends before the claim answers: the re-fetch starts after it.
    await loadEnds("first", [cloudProject(HEART)]);
    expect(chooseFile()).toBeEnabled();
    await fileArrives(IMPORTED);
    expect(screen.getByRole("button", { name: "Confirm Import" })).toBeInTheDocument();

    await claimEnds();
    expect(edges.loads.map((l) => l.kind)).toEqual(["refetch"]);
    expect(chooseFile()).toBeDisabled();
    expect(screen.getByText(IMPORT_WAIT_NOTE)).toBeInTheDocument();
    await press("Confirm Import");
    expect(screen.getByRole("alert")).toHaveTextContent(IMPORT_REFUSED);
    expect(storeNames()).toEqual([HEART]);

    await loadEnds("refetch", [cloudProject(HEART), cloudProject(SHARED, ZAPHOD)]);
    expect(chooseFile()).toBeEnabled();
    expect(screen.queryByText(IMPORT_WAIT_NOTE)).toBeNull();
    await press("Try another file");
    await fileArrives(IMPORTED);
    await press("Confirm Import");
    await waitFor(() => expect(storeNames()).toEqual([HEART, SHARED, IMPORTED]));
  });

  it("constructed — the cloud sync's own gate shut with the projects loaded, a state no control of the app reaches: Choose File is greyed out with the note, and the confirm refuses", async () => {
    renderApp();
    await press("Import Projects");
    await authReports(ARTHUR);
    await loadEnds("first", [cloudProject(HEART)]);
    await fileArrives(IMPORTED);
    expect(screen.getByRole("button", { name: "Confirm Import" })).toBeInTheDocument();

    await act(async () => {
      useProjectStore.getState().setCloudSyncReady(false);
    });
    expect(useProjectStore.getState().cloudDataLoaded).toBe(true);

    expect(chooseFile()).toBeDisabled();
    expect(screen.getByText(IMPORT_WAIT_NOTE)).toBeInTheDocument();
    await press("Confirm Import");
    expect(screen.getByRole("alert")).toHaveTextContent(IMPORT_REFUSED);
    expect(storeNames()).toEqual([HEART]);
  });
});

// -- a re-fetch answer from a session that has ended ------------------------------------------------------

describe("WI-113: a re-fetch answer from a session that has ended changes nothing", () => {
  it("after a sign-out, a late re-fetch answer leaves this browser's signed-out projects listed, stored and on screen", async () => {
    seedSignedOutProjects([ALPHA, BETA]);
    renderApp();
    await settle();
    await invitedSignIn();
    await loadEnds("first", [cloudProject(HEART)]);
    await signOut();

    await loadEnds("refetch", [cloudProject(HEART), cloudProject(SHARED, ZAPHOD)], 1);

    expect(listedIn("local")).toEqual([ALPHA, BETA]);
    expect(storedIn("local")).toEqual([ALPHA, BETA]);
    expect(storeNames()).toEqual([ALPHA, BETA]);
    expect(tileNames()).toEqual([ALPHA, BETA]);
  });

  it("after a sign-out, a late EMPTY re-fetch answer leaves this browser's list of signed-out projects as it was", async () => {
    seedSignedOutProjects([ALPHA, BETA]);
    renderApp();
    await settle();
    await invitedSignIn();
    await loadEnds("first", [cloudProject(HEART)]);
    await signOut();

    await loadEnds("refetch", [], 1);

    expect(listedIn("local")).toEqual([ALPHA, BETA]);
    expect(storeNames()).toEqual([ALPHA, BETA]);
  });

  it("after a switch to local storage, a late re-fetch answer leaves the projects on screen and the user's own stored list as they were", async () => {
    renderApp();
    await invitedSignIn();
    await loadEnds("first", [cloudProject(HEART)]);
    await press("test: use local storage");
    expect(screen.getByTestId("state").textContent).toBe("signed in, local storage");

    await loadEnds("refetch", [cloudProject(HEART), cloudProject(SHARED, ZAPHOD)], 1);

    expect(listedIn(ARTHUR.uid)).toEqual([HEART]);
    expect(storeNames()).toEqual([HEART]);
  });

  it("a re-fetch that fails after a sign-out does not end the next sign-in's load", async () => {
    renderApp();
    await invitedSignIn();
    await loadEnds("first", [cloudProject(HEART)]);
    await signOut();
    await authReports(ARTHUR);
    expect(edges.sessions).toBe(2);
    expect(screen.getByText(LOADING)).toBeInTheDocument();

    await loadFails("refetch", 1);

    expect(screen.getByText(LOADING)).toBeInTheDocument();
    expect(screen.queryByText(EMPTY)).toBeNull();
    expect(useProjectStore.getState().cloudDataLoaded).toBe(false);

    await loadEnds("first", [cloudProject(HEART)], 2);
    expect(tileNames()).toEqual([HEART]);
  });

  it("a re-fetch that answers after a sign-out neither ends the next sign-in's load nor puts its projects on screen", async () => {
    renderApp();
    await invitedSignIn();
    await loadEnds("first", [cloudProject(HEART)]);
    await signOut();
    await authReports(ARTHUR);
    expect(edges.sessions).toBe(2);

    await loadEnds("refetch", [cloudProject(HEART), cloudProject(SHARED, ZAPHOD)], 1);

    expect(storeNames()).toEqual([]);
    expect(screen.getByText(LOADING)).toBeInTheDocument();
    expect(useProjectStore.getState().cloudDataLoaded).toBe(false);

    await loadEnds("first", [cloudProject(HEART)], 2);
    expect(tileNames()).toEqual([HEART]);
  });

  it("a re-fetch still running at a sign-out does not hold up the next sign-in: its one load ends the loading", async () => {
    renderApp();
    await invitedSignIn();
    await loadEnds("first", [cloudProject(HEART)]);
    await signOut();
    await authReports(ARTHUR);
    expect(edges.sessions).toBe(2);

    await loadEnds("first", [cloudProject(HEART)], 2);

    expect(tileNames()).toEqual([HEART]);
    expect(screen.queryByText(LOADING)).toBeNull();
    expect(useProjectStore.getState().cloudDataLoaded).toBe(true);
  });
});

// -- the sign-in display --------------------------------------------------------------------------------------

describe("WI-113: what a cloud sign-in shows while its first load runs — kept here so a change to it is seen", () => {
  it("while a cloud sign-in's first load runs, the project list holds none of this browser's signed-out projects, nor the user's copy in this browser, and the Dashboard says the projects are loading", async () => {
    seedSignedOutProjects([ALPHA, BETA]);
    new LocalStorageRepository(ARTHUR.uid).save(createProject("Cached Gamma", "2026-10-05"));
    renderApp();
    await settle();
    expect(storeNames()).toEqual([ALPHA, BETA]);

    await authReports(ARTHUR);

    expect(screen.getByTestId("state").textContent).toBe("signed in, cloud storage");
    // Owner ruling, 2026-10-16: from the moment the sign-in is recognised until the first load ends, nothing.
    expect(storeNames()).toEqual([]);
    expect(screen.getByText(LOADING)).toBeInTheDocument();
  });
});
