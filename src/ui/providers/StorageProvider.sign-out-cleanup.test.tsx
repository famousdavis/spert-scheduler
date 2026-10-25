// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useEffect } from "react";
import { render, screen, act, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useNavigate } from "react-router-dom";
import type { Project, UserPreferences } from "@domain/models/types";
import type { LoadError } from "@infrastructure/persistence/local-storage-repository";
import type { ProjectRole } from "@infrastructure/firebase/firestore-driver";

/**
 * WI-113 and WI-117: what a sign-out leaves on screen, and what it sends to the cloud.
 *
 * A sign-out emptied the project list — the cleanup zeroed it while the storage was still the user's — and nothing
 * filled it again from this browser's signed-out storage: the Dashboard said "No projects yet." until it was opened
 * again, and Settings listed no project at all. Now the list comes back where the storage becomes this browser's own
 * again (owner ruling, 2026-10-10), and with it this browser's signed-out settings, which the cleanup had left at the
 * defaults — so a setting changed then saved the defaults over the others (owner ruling, 2026-10-15).
 *
 * And the cleanup resets the preferences in memory while the session's cloud sync still listened for changes, so a
 * sign-out sent the DEFAULT preferences to be saved over the user's own. Now a sign-out ends the session's cloud sync
 * before it resets anything — the user's Sign out, the sign-out for terms not accepted, and a session ended from
 * outside the app — while a preference the user changes is still saved (owner ruling, 2026-10-10).
 *
 * The real AuthProvider, StorageProvider, cloud sync, Dashboard, Settings and stores. Only the Firebase edges are
 * replaced: the auth listener (driven by hand, and told of a sign-out only when the user changes, as Firebase does),
 * the profile and terms documents (the recorded acceptance is set per test), and the app's Firestore driver (whose
 * loads each test ends by hand, whose settings read returns what a test puts in the cloud, and which records every
 * preference save it is asked for, and by which session).
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
/** One preference save the cloud sync asked for: which session's driver, and the trial count it carried. */
interface PreferenceSave {
  session: number;
  trials: number;
}
interface FirebaseEdges {
  emit: ((user: FakeFirebaseUser | null) => Promise<void>) | null;
  /** The user the auth listener last heard of. */
  current: FakeFirebaseUser | null;
  /** The terms version on the user's acceptance record. */
  acceptedOnRecord: string;
  /** How many cloud sessions have started: each new driver is the next one. */
  sessions: number;
  loads: Pending<CloudLoad>[];
  preferenceSaves: PreferenceSave[];
  /** The user's settings in the cloud, which a session's first load reads. */
  cloudPreferences: Partial<UserPreferences>;
  /** B-04: session ids the server teardownAiSession callable was asked to end. */
  teardownSessionIds: string[];
}

const edges = vi.hoisted(() => {
  const e: FirebaseEdges = {
    emit: null,
    current: null,
    acceptedOnRecord: "",
    sessions: 0,
    loads: [],
    preferenceSaves: [],
    cloudPreferences: {},
    teardownSessionIds: [],
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

// A Firestore handle, so a sign-in writes the profile and checks the terms acceptance on record.
vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("firebase/firestore")>();
  return {
    ...actual,
    doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join("/") }),
    setDoc: () => Promise.resolve(),
    getDoc: () => Promise.resolve({ exists: () => true, data: () => ({ tosVersion: edges.acceptedOnRecord }) }),
    serverTimestamp: () => ({ serverTimestamp: true }),
    deleteDoc: () => Promise.resolve(),
  };
});

vi.mock("@infrastructure/firebase/firebase", () => ({
  auth: {},
  db: {},
  isFirebaseAvailable: true,
  getClaimPendingInvitations: () => null,
  getSendInvitationEmail: () => null,
  getRevokeInvite: () => null,
  getResendInvite: () => null,
  // B-04: a teardown callable that records which session it was asked to end.
  getTeardownAiSession: () => (arg: { sessionId: string }) => {
    edges.teardownSessionIds.push(arg.sessionId);
    return Promise.resolve({ data: { success: true } });
  },
  getGeneratePairingCode: () => null,
}));

vi.mock("@infrastructure/firebase/firestore-driver", () => ({
  FirestoreDriver: class {
    private readonly session: number;
    constructor() {
      edges.sessions += 1;
      this.session = edges.sessions;
    }
    onSaveError() {}
    loadAll() {
      return new Promise<CloudLoad>((resolve, reject) => {
        edges.loads.push({ resolve, reject });
      });
    }
    loadPreferences() {
      return Promise.resolve(edges.cloudPreferences);
    }
    subscribeToProject() {
      return () => {};
    }
    save() {}
    create() {
      return Promise.resolve();
    }
    remove() {
      return Promise.resolve();
    }
    cancelPendingSave() {}
    cancelPendingSaves() {}
    flushPendingSaves() {}
    savePreferences(preferences: UserPreferences) {
      edges.preferenceSaves.push({ session: this.session, trials: preferences.defaultTrialCount });
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
import { useConfirmStore } from "@ui/hooks/use-confirm-store";
import { ConfirmHost } from "@ui/components/ConfirmHost";
import { ThemeToggleButton } from "@ui/components/ThemeToggleButton";
import { setStorageNamespace, LocalStorageRepository } from "@infrastructure/persistence/local-storage-repository";
import { savePreferences } from "@infrastructure/persistence/preferences-repository";
import { createProject } from "@app/api/project-service";
import { DEFAULT_USER_PREFERENCES } from "@domain/models/types";
import { TOS_VERSION, LS_TOS_ACCEPTED_VERSION } from "@app/legal-constants";
import { ProjectsPage } from "@ui/pages/ProjectsPage";
import { SettingsPage } from "@ui/pages/SettingsPage";

const EMPTY = "No projects yet.";
const LOADING = "Loading your projects from cloud storage…";
const ALPHA = "Local Alpha";
const BETA = "Local Beta";
const HEART = "Heart of Gold Refit";
const OLDER_TERMS = "04-05-2026";
/** The user's own trial count — not the default, so a save of the defaults cannot pass for it. */
const USERS_TRIALS = 12345;
const DEFAULT_TRIALS = DEFAULT_USER_PREFERENCES.defaultTrialCount;

const ARTHUR: FakeFirebaseUser = {
  uid: "uid-arthur",
  email: "arthur@example.com",
  displayName: "Arthur Dent",
  photoURL: null,
  emailVerified: false, // no invitation claim
  providerData: [{ providerId: "google.com" }],
};
const FORD: FakeFirebaseUser = { ...ARTHUR, uid: "uid-ford", email: "ford@example.com", displayName: "Ford Prefect" };

/** Layout's call, without the rest of Layout. */
function CloudSync() {
  useCloudSync();
  return null;
}

/** Layout loads the preferences of whatever storage is active when the app starts. */
function PreferencesAtStart() {
  const loadPreferences = usePreferencesStore((s) => s.loadPreferences);
  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);
  return null;
}

function Readout() {
  const { user, signOut } = useAuth();
  const { mode } = useStorage();
  const navigate = useNavigate();
  return (
    <div>
      <p data-testid="state">{`${user ? "signed in" : "signed out"}, ${mode} storage`}</p>
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
          <PreferencesAtStart />
          <Readout />
          <ThemeToggleButton />
          <Routes>
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
          <ConfirmHost />
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

function cloudProject(name: string): CloudProject {
  return { ...createProject(name, "2026-10-05"), owner: ARTHUR.uid, _owner: ARTHUR.uid, _members: { [ARTHUR.uid]: "owner" } };
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

async function cloudLoadEnds(projects: CloudProject[]) {
  const load = edges.loads.shift();
  if (!load) throw new Error("no cloud load is pending");
  await act(async () => {
    load.resolve({ projects, errors: [] });
  });
  await settle();
}

/** Signed in to cloud storage, the first load ended with the user's one project on screen. */
async function signedInWithHeart() {
  await authReports(ARTHUR);
  expect(screen.getByTestId("state").textContent).toBe("signed in, cloud storage");
  await cloudLoadEnds([cloudProject(HEART)]);
}

async function signOut() {
  fireEvent.click(screen.getByRole("button", { name: "test: sign out" }));
  await signedOut();
}

async function signedOut() {
  await waitFor(() => expect(screen.getByTestId("state").textContent).toMatch(/^signed out/));
  await settle();
}

async function userChangesTrials(trials: number) {
  await act(async () => {
    usePreferencesStore.getState().updatePreferences({ defaultTrialCount: trials });
  });
  await settle();
}

const storeNames = () => useProjectStore.getState().projects.map((p) => p.name);
const tileNames = () => Array.from(document.querySelectorAll("[data-tile-open]")).map((el) => el.textContent);
const exportChoices = () =>
  screen.queryAllByRole("checkbox", { name: /^Select .* for export$/ }).map((el) => el.getAttribute("aria-label"));
const trialsInMemory = () => usePreferencesStore.getState().preferences.defaultTrialCount;
/** The preference saves asked for after the first `from`. */
const savesAfter = (from: number) => edges.preferenceSaves.slice(from);

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  setStorageNamespace("local");
  _resetSignOutFlagsForTests();
  edges.emit = null;
  edges.current = null;
  edges.acceptedOnRecord = TOS_VERSION;
  edges.sessions = 0;
  edges.loads.length = 0;
  edges.preferenceSaves.length = 0;
  edges.cloudPreferences = {};
  edges.teardownSessionIds.length = 0;
  // A returning user whose current acceptance is cached in this browser: the sign-in reads no terms record.
  localStorage.setItem(LS_TOS_ACCEPTED_VERSION, TOS_VERSION);
  useProjectStore.setState(useProjectStore.getInitialState(), true);
  usePreferencesStore.setState(usePreferencesStore.getInitialState(), true);
  useNotificationStore.setState({ notifications: [] });
  // The sign-in logs its terms check and the cloud sync its load; neither is under test.
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useConfirmStore.setState({ pending: null });
});

// -- the projects on show after a sign-out --------------------------------------------------------------

describe("WI-113: after a sign-out, this browser's signed-out projects are on show at once", () => {
  it("signed out on the Dashboard, the Dashboard shows this browser's signed-out projects, not 'No projects yet.'", async () => {
    seedSignedOutProjects([ALPHA, BETA]);
    renderApp("cloud");
    await settle();
    await signedInWithHeart();
    expect(tileNames()).toEqual([HEART]);

    await signOut();

    expect(tileNames()).toEqual([ALPHA, BETA]);
    expect(screen.queryByText(EMPTY)).toBeNull();
    expect(storeNames()).toEqual([ALPHA, BETA]);
  });

  it("signed out on Settings, Settings offers this browser's signed-out projects for export", async () => {
    seedSignedOutProjects([ALPHA, BETA]);
    renderApp("cloud", "/settings");
    await settle();
    await signedInWithHeart();
    expect(exportChoices()).toEqual([`Select ${HEART} for export`]);

    await signOut();

    expect(exportChoices()).toEqual([`Select ${ALPHA} for export`, `Select ${BETA} for export`]);
    expect(screen.queryByText("No projects to export.")).toBeNull();
  });

  it("signed out with local storage chosen, the Dashboard shows this browser's signed-out projects, not 'No projects yet.'", async () => {
    seedSignedOutProjects([ALPHA, BETA]);
    new LocalStorageRepository(ARTHUR.uid).save(createProject("Signed-in Work", "2026-10-05"));
    renderApp("local");
    await settle();
    await authReports(ARTHUR);
    expect(screen.getByTestId("state").textContent).toBe("signed in, local storage");

    await signOut();

    expect(tileNames()).toEqual([ALPHA, BETA]);
    expect(screen.queryByText(EMPTY)).toBeNull();
  });

  it("control: with no signed-out projects in this browser, the Dashboard says 'No projects yet.' after a sign-out, as before", async () => {
    renderApp("cloud");
    await settle();
    await signedInWithHeart();
    expect(tileNames()).toEqual([HEART]);

    await signOut();

    expect(tileNames()).toEqual([]);
    expect(screen.getByText(EMPTY)).toBeInTheDocument();
    expect(screen.queryByText(LOADING)).toBeNull();
  });
});

// -- the settings in use after a sign-out ----------------------------------------------------------------

/** This browser's signed-out settings: none of them Scheduler's default, nor the user's own. */
const SIGNED_OUT_SETTINGS: UserPreferences = {
  ...DEFAULT_USER_PREFERENCES,
  defaultTrialCount: 4321,
  dateFormat: "DD/MM/YYYY",
  theme: "dark",
  workDays: [0, 1, 2, 3, 4], // Sun–Thu
};
/** The user's own settings, in the cloud. */
const USERS_SETTINGS: Partial<UserPreferences> = {
  defaultTrialCount: USERS_TRIALS,
  dateFormat: "YYYY/MM/DD",
  theme: "light",
  workDays: [1, 2, 3, 4, 5, 6], // Mon–Sat
};

/** Settings kept in this browser for use without signing in. */
function seedSignedOutSettings() {
  setStorageNamespace("local");
  savePreferences(SIGNED_OUT_SETTINGS);
}

/** This browser's signed-out settings, as stored. */
const storedSignedOutSettings = (): unknown => JSON.parse(localStorage.getItem("spert:user-preferences:local") ?? "null");
const settingsInUse = () => usePreferencesStore.getState().preferences;

describe("WI-113: after a sign-out, this browser's signed-out settings are in use at once", () => {
  it("signed out on the Dashboard, the settings in use are this browser's signed-out ones; one changed then with the header's theme button keeps the others, and nothing is sent to the cloud", async () => {
    seedSignedOutProjects([ALPHA, BETA]);
    seedSignedOutSettings();
    edges.cloudPreferences = USERS_SETTINGS;
    renderApp("cloud");
    await settle();
    await signedInWithHeart();
    expect(settingsInUse()).toMatchObject(USERS_SETTINGS);
    const before = edges.preferenceSaves.length;

    await signOut();

    expect(settingsInUse()).toEqual(SIGNED_OUT_SETTINGS);
    fireEvent.click(screen.getByRole("button", { name: "Theme: Dark. Click to cycle." }));
    await settle();
    expect(storedSignedOutSettings()).toEqual({ ...SIGNED_OUT_SETTINGS, theme: "system" });
    expect(settingsInUse()).toEqual({ ...SIGNED_OUT_SETTINGS, theme: "system" });
    expect(savesAfter(before)).toEqual([]);
  });

  it("signed out on Settings, with no signed-out projects in this browser, the settings in use are this browser's signed-out ones; one changed then with the header's theme button keeps the others, and nothing is sent to the cloud", async () => {
    seedSignedOutSettings();
    edges.cloudPreferences = USERS_SETTINGS;
    renderApp("cloud", "/settings");
    await settle();
    await signedInWithHeart();
    expect(settingsInUse()).toMatchObject(USERS_SETTINGS);
    const before = edges.preferenceSaves.length;

    await signOut();

    expect(settingsInUse()).toEqual(SIGNED_OUT_SETTINGS);
    fireEvent.click(screen.getByRole("button", { name: "Theme: Dark. Click to cycle." }));
    await settle();
    expect(storedSignedOutSettings()).toEqual({ ...SIGNED_OUT_SETTINGS, theme: "system" });
    expect(settingsInUse()).toEqual({ ...SIGNED_OUT_SETTINGS, theme: "system" });
    expect(savesAfter(before)).toEqual([]);
  });
});

// -- what a sign-out sends to the cloud ------------------------------------------------------------------

describe("WI-117: a sign-out sends no preferences to the cloud, on any of the three ways a session ends", () => {
  it("the user's own Sign out sends no preference save, and the preferences in this browser go back to the defaults", async () => {
    expect(DEFAULT_TRIALS).not.toBe(USERS_TRIALS);
    renderApp("cloud");
    await settle();
    await signedInWithHeart();
    await userChangesTrials(USERS_TRIALS);
    const before = edges.preferenceSaves.length;

    await signOut();

    expect(savesAfter(before)).toEqual([]);
    expect(trialsInMemory()).toBe(DEFAULT_TRIALS);
  });

  it("a second account signed out because its terms acceptance is out of date, while the first account's session runs, sends no preference save", async () => {
    renderApp("cloud");
    await settle();
    await signedInWithHeart();
    await userChangesTrials(USERS_TRIALS);
    const before = edges.preferenceSaves.length;

    // The listener reports another account, whose acceptance on record is out of date: the app signs it out.
    localStorage.removeItem(LS_TOS_ACCEPTED_VERSION);
    edges.acceptedOnRecord = OLDER_TERMS;
    await authReports(FORD);
    await signedOut();

    expect(savesAfter(before)).toEqual([]);
    expect(trialsInMemory()).toBe(DEFAULT_TRIALS);
  });

  it("a session ended from outside the app sends no preference save", async () => {
    renderApp("cloud");
    await settle();
    await signedInWithHeart();
    await userChangesTrials(USERS_TRIALS);
    const before = edges.preferenceSaves.length;

    await authReports(null);
    await signedOut();

    expect(savesAfter(before)).toEqual([]);
    expect(trialsInMemory()).toBe(DEFAULT_TRIALS);
  });

  it("control: a preference the user changes while signed in is saved to the cloud", async () => {
    renderApp("cloud");
    await settle();
    await signedInWithHeart();
    const before = edges.preferenceSaves.length;

    await userChangesTrials(USERS_TRIALS);

    expect(savesAfter(before)).toEqual([{ session: 1, trials: USERS_TRIALS }]);
  });

  it("control: Reset to defaults, pressed while signed in, is saved to the cloud", async () => {
    renderApp("cloud", "/settings");
    await settle();
    await signedInWithHeart();
    await userChangesTrials(USERS_TRIALS);
    const before = edges.preferenceSaves.length;

    fireEvent.click(screen.getByRole("button", { name: "Reset to defaults" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Reset" }));
    await waitFor(() => expect(trialsInMemory()).toBe(DEFAULT_TRIALS));
    await settle();

    expect(savesAfter(before)).toEqual([{ session: 1, trials: DEFAULT_TRIALS }]);
  });

  it("control: a preference changed after signing out and in again is saved, by the new session", async () => {
    renderApp("cloud");
    await settle();
    await signedInWithHeart();
    await signOut();
    await signedInWithHeart();
    const before = edges.preferenceSaves.length;

    await userChangesTrials(5555);

    expect(savesAfter(before)).toEqual([{ session: 2, trials: 5555 }]);
  });

  it("control: with local storage chosen, nothing is sent to the cloud — not a change, not the sign-out", async () => {
    renderApp("local");
    await settle();
    await authReports(ARTHUR);
    expect(screen.getByTestId("state").textContent).toBe("signed in, local storage");

    await userChangesTrials(USERS_TRIALS);
    await signOut();

    expect(edges.sessions).toBe(0);
    expect(edges.preferenceSaves).toEqual([]);
  });
});

// -- AI-2: the Connect AI session leaves this browser on sign-out ---------------------------------------

describe("AI-2 + B-04: a sign-out ends the Connect AI session, locally AND on the server", () => {
  function seedAiSession() {
    localStorage.setItem("spert_scheduler_ai_session_id", "sess-xyz");
    localStorage.setItem("spert_scheduler_ai_consent", JSON.stringify({ version: 1, read: true, write: true }));
    localStorage.setItem("spert_scheduler_ai_last_seq:sess-xyz", "4");
  }

  it("the user's Sign out clears the AI session id, consent and op cursor, so the next person can't inherit them", async () => {
    renderApp("cloud");
    await settle();
    await signedInWithHeart();
    seedAiSession();

    await signOut();

    expect(localStorage.getItem("spert_scheduler_ai_session_id")).toBeNull();
    expect(localStorage.getItem("spert_scheduler_ai_consent")).toBeNull();
    expect(localStorage.getItem("spert_scheduler_ai_last_seq:sess-xyz")).toBeNull();
  });

  it("B-04: the user's Sign out also calls teardownAiSession with the active session id", async () => {
    renderApp("cloud");
    await settle();
    await signedInWithHeart();
    seedAiSession();

    await signOut();

    // The server session is ended, not just the local keys. (The second,
    // id-less cleanup after firebaseSignOut makes no further call.)
    expect(edges.teardownSessionIds).toEqual(["sess-xyz"]);
  });

  it("B-04: a session ended from outside the app (onAuthStateChanged null) also ends it on the server", async () => {
    renderApp("cloud");
    await settle();
    await signedInWithHeart();
    seedAiSession();

    await authReports(null);
    await signedOut();

    expect(edges.teardownSessionIds).toEqual(["sess-xyz"]);
  });
});
