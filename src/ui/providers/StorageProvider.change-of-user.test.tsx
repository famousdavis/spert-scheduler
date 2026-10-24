// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useEffect } from "react";
import { render, screen, act, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useNavigate } from "react-router-dom";
import type { Holiday, Project, UserPreferences } from "@domain/models/types";
import type { LoadError } from "@infrastructure/persistence/local-storage-repository";
import type { ProjectRole } from "@infrastructure/firebase/firestore-driver";

/**
 * WI-113: a different user signed in in this tab with no sign-out between — a tab that wakes to find someone else
 * signed in — is the first user's sign-out, then the second user's sign-in (owner ruling, 2026-10-16). Before, nothing
 * ran between them: the first user's projects stayed on show into the second user's session, their copy in this
 * browser stayed, and their settings stayed in use, so the second user's next change saved them to the second
 * user's account. And the change must not end the second user's session, as a sign-out's cleanup would: it is already
 * running when the change is seen.
 *
 * The real AuthProvider, StorageProvider, cloud sync (as Layout runs it), Dashboard and stores. Only the Firebase edges
 * are replaced: the auth listener (driven by hand), and the app's Firestore driver, whose loads each test ends by hand,
 * whose settings read returns each account's settings in cloud storage as a test gives them, and which records every
 * preference save with its session and account, and every project it creates.
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
interface PendingLoad extends Pending<CloudLoad> {
  session: number;
}
/** One preference save the cloud sync asked for: which session's driver, for which account, and what it carried. */
interface PreferenceSave {
  session: number;
  uid: string;
  trials: number;
  holidays: string[];
  dateFormat: unknown;
}
interface FirebaseEdges {
  emit: ((user: FakeFirebaseUser | null) => Promise<void>) | null;
  current: FakeFirebaseUser | null;
  sessions: number;
  loads: PendingLoad[];
  /** Each account's settings in cloud storage, as its first load reads them; none unless a test gives some. */
  cloudPreferences: Record<string, Partial<UserPreferences>>;
  /** Raw values in an account's cloud settings that this version cannot read (WI-68), by account. */
  cloudUnreadable: Record<string, Record<string, unknown>>;
  /** When true, the settings read fails. */
  preferencesReadFails: boolean;
  preferenceSaves: PreferenceSave[];
  created: string[];
}

const edges = vi.hoisted(() => {
  const e: FirebaseEdges = {
    emit: null,
    current: null,
    sessions: 0,
    loads: [],
    cloudPreferences: {},
    cloudUnreadable: {},
    preferencesReadFails: false,
    preferenceSaves: [],
    created: [],
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

// Firebase configured, with no Firestore handle: the profile write and the terms check return at once.
vi.mock("@infrastructure/firebase/firebase", () => ({
  auth: {},
  db: null,
  isFirebaseAvailable: true,
  getClaimPendingInvitations: () => null,
  getSendInvitationEmail: () => null,
  getRevokeInvite: () => null,
  getResendInvite: () => null,
  getTeardownAiSession: () => null,
  getGeneratePairingCode: () => null,
}));

vi.mock("@infrastructure/firebase/firestore-driver", async () => {
  const repo = await import("@infrastructure/persistence/preferences-repository");
  return {
    FirestoreDriver: class {
      readonly session: number;
      private readonly uid: string;
      constructor(uid: string) {
        edges.sessions += 1;
        this.session = edges.sessions;
        this.uid = uid;
      }
      onSaveError() {}
      loadAll() {
        const session = this.session;
        return new Promise<CloudLoad>((resolve, reject) => {
          edges.loads.push({ session, resolve, reject });
        });
      }
      // As the app's driver reads them: the readable values answered, the unreadable ones retained under the uid.
      loadPreferences() {
        if (edges.preferencesReadFails) return Promise.reject(new Error("unavailable"));
        repo.setRetainedPreferences(this.uid, edges.cloudUnreadable[this.uid] ?? {});
        return Promise.resolve(edges.cloudPreferences[this.uid] ?? {});
      }
      subscribeToProject() {
        return () => {};
      }
      save() {}
      create(project: Project) {
        edges.created.push(`${project.name}#${this.session}`);
        return Promise.resolve();
      }
      remove() {
        return Promise.resolve();
      }
      cancelPendingSave() {}
      cancelPendingSaves() {}
      flushPendingSaves() {}
      // As the app's driver writes them: with the retained values written back.
      savePreferences(preferences: UserPreferences) {
        const written = repo.withRetainedPreferences(this.uid, preferences) as Record<string, unknown>;
        edges.preferenceSaves.push({
          session: this.session,
          uid: this.uid,
          trials: preferences.defaultTrialCount,
          holidays: (preferences.globalCalendar?.holidays ?? []).map((h) => h.name),
          dateFormat: written.dateFormat,
        });
        return Promise.resolve();
      }
      dispose() {}
    },
  };
});

import { AuthProvider, useAuth, _resetSignOutFlagsForTests } from "@ui/providers/AuthProvider";
import { StorageProvider, useStorage } from "@ui/providers/StorageProvider";
import { useCloudSync, getCloudSyncDriver } from "@ui/hooks/use-cloud-sync";
import { useProjectStore } from "@ui/hooks/use-project-store";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";
import { useNotificationStore } from "@ui/hooks/use-notification-store";
import { setStorageNamespace, LocalStorageRepository } from "@infrastructure/persistence/local-storage-repository";
import { savePreferences, _resetRetainedPreferencesForTests } from "@infrastructure/persistence/preferences-repository";
import { createProject } from "@app/api/project-service";
import { DEFAULT_USER_PREFERENCES } from "@domain/models/types";
import { TOS_VERSION, LS_TOS_ACCEPTED_VERSION } from "@app/legal-constants";
import { ProjectsPage } from "@ui/pages/ProjectsPage";

const ARTHUR: FakeFirebaseUser = {
  uid: "uid-arthur",
  email: "arthur@example.com",
  displayName: "Arthur Dent",
  photoURL: null,
  emailVerified: false, // no invitation claim
  providerData: [{ providerId: "google.com" }],
};
const FORD: FakeFirebaseUser = { ...ARTHUR, uid: "uid-ford", email: "ford@example.com", displayName: "Ford Prefect" };
/** Scheduler's default trial count — checked below, so that a save of it cannot pass for another value. */
const DEFAULT_TRIALS = 10000;

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
      <p data-testid="state">{`${user ? "signed in " + user.uid : "signed out"}, ${mode} storage`}</p>
      <button type="button" onClick={() => void signOut()}>
        test: sign out
      </button>
      <button type="button" onClick={() => void navigate("/elsewhere")}>
        test: leave
      </button>
      <button type="button" onClick={() => void navigate("/projects")}>
        test: open the Dashboard
      </button>
    </div>
  );
}

function renderApp(chosenStorage: "local" | "cloud") {
  localStorage.setItem("spert:storage-mode", chosenStorage);
  return render(
    <AuthProvider>
      <StorageProvider>
        <MemoryRouter initialEntries={["/projects"]}>
          <CloudSync />
          <PreferencesAtStart />
          <Readout />
          <Routes>
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/elsewhere" element={<p>Elsewhere</p>} />
          </Routes>
        </MemoryRouter>
      </StorageProvider>
    </AuthProvider>,
  );
}

// -- this browser's storage, and the cloud's answers ----------------------------------------------------

function holiday(name: string): Holiday {
  return { id: name.toLowerCase().replaceAll(" ", "-"), name, startDate: "2026-12-24", endDate: "2026-12-24" };
}

/** Settings kept in this browser under a namespace: "local" (for use without signing in) or a user's uid. */
function seedSettings(namespace: string, settings: Partial<UserPreferences>) {
  setStorageNamespace(namespace);
  savePreferences({ ...DEFAULT_USER_PREFERENCES, ...settings });
  setStorageNamespace("local");
}

/** The settings stored in this browser under a namespace, or null. */
function storedSettings(namespace: string): Partial<UserPreferences> | null {
  const raw = localStorage.getItem(`spert:user-preferences:${namespace}`);
  return raw === null ? null : (JSON.parse(raw) as Partial<UserPreferences>);
}

/** Projects kept in this browser under a namespace. */
function seedProjects(namespace: string, names: string[]) {
  for (const name of names) new LocalStorageRepository(namespace).save(createProject(name, "2026-10-05"));
}

/** The project names a namespace lists; "(none)" when it has no list at all. */
function listedIn(namespace: string): string[] {
  const raw = localStorage.getItem(`spert:project-index:${namespace}`);
  if (raw === null) return ["(none)"];
  return (JSON.parse(raw) as string[]).map((id) => {
    const stored = localStorage.getItem(`spert:project:${namespace}:${id}`);
    return stored === null ? `(missing ${id})` : (JSON.parse(stored) as { name: string }).name;
  });
}

function cloudProject(name: string, owner: string): CloudProject {
  return { ...createProject(name, "2026-10-05"), owner, _owner: owner, _members: { [owner]: "owner" } };
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

/** The newest session's first load ends with these projects. */
async function loadEnds(projects: CloudProject[]) {
  const at = edges.loads.findIndex((l) => l.session === edges.sessions);
  const load = at < 0 ? undefined : edges.loads.splice(at, 1)[0];
  if (!load) throw new Error(`no load of session ${edges.sessions} is pending`);
  await act(async () => {
    load.resolve({ projects, errors: [] });
  });
  await settle();
}

async function press(name: string) {
  fireEvent.click(screen.getByRole("button", { name }));
  await settle();
}

async function userChanges(settings: Partial<UserPreferences>) {
  await act(async () => {
    usePreferencesStore.getState().updatePreferences(settings);
  });
  await settle();
}

const settingsInUse = () => usePreferencesStore.getState().preferences;
const holidaysInUse = () => (settingsInUse().globalCalendar?.holidays ?? []).map((h) => h.name);
const storeNames = () => useProjectStore.getState().projects.map((p) => p.name);
const tileNames = () => Array.from(document.querySelectorAll("[data-tile-open]")).map((el) => el.textContent);
/** The preference saves asked for after the first `from`. */
const savesAfter = (from: number) => edges.preferenceSaves.slice(from);

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  setStorageNamespace("local");
  _resetSignOutFlagsForTests();
  _resetRetainedPreferencesForTests();
  edges.emit = null;
  edges.current = null;
  edges.sessions = 0;
  edges.loads.length = 0;
  edges.cloudPreferences = {};
  edges.cloudUnreadable = {};
  edges.preferencesReadFails = false;
  edges.preferenceSaves.length = 0;
  edges.created.length = 0;
  // A returning user whose current acceptance is cached in this browser: the sign-in reads no terms record.
  localStorage.setItem(LS_TOS_ACCEPTED_VERSION, TOS_VERSION);
  useProjectStore.setState(useProjectStore.getInitialState(), true);
  usePreferencesStore.setState(usePreferencesStore.getInitialState(), true);
  useNotificationStore.setState({ notifications: [] });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("precondition: Scheduler's default trial count is the one these tests expect", () => {
  expect(DEFAULT_USER_PREFERENCES.defaultTrialCount).toBe(DEFAULT_TRIALS);
});

describe("WI-113: a change of user with no sign-out between is the first user's sign-out, then the second user's sign-in", () => {
  it("the first user's settings are never saved to the second user's account: its next change carries its own cloud settings, and Scheduler's default for what they lack", async () => {
    edges.cloudPreferences = {
      [ARTHUR.uid]: { defaultTrialCount: 12345 },
      [FORD.uid]: { dateFormat: "YYYY/MM/DD" },
    };
    renderApp("cloud");
    await settle();
    await authReports(ARTHUR);
    await loadEnds([cloudProject("Heart of Gold Refit", ARTHUR.uid)]);
    expect(settingsInUse().defaultTrialCount).toBe(12345);

    await authReports(FORD);
    await loadEnds([]);
    const before = edges.preferenceSaves.length;
    await userChanges({ theme: "dark" });

    expect(savesAfter(before)).toEqual([
      { session: 2, uid: FORD.uid, trials: DEFAULT_TRIALS, holidays: [], dateFormat: "YYYY/MM/DD" },
    ]);
  });

  it("AI-2: a change of user clears the first user's Connect AI session from this browser", async () => {
    renderApp("cloud");
    await settle();
    await authReports(ARTHUR);
    await loadEnds([cloudProject("Heart of Gold Refit", ARTHUR.uid)]);
    // ARTHUR paired an AI this session.
    localStorage.setItem("spert_scheduler_ai_session_id", "sess-arthur");
    localStorage.setItem("spert_scheduler_ai_consent", JSON.stringify({ version: 1, read: true, write: true }));
    localStorage.setItem("spert_scheduler_ai_last_seq:sess-arthur", "9");

    await authReports(FORD);

    expect(localStorage.getItem("spert_scheduler_ai_session_id")).toBeNull();
    expect(localStorage.getItem("spert_scheduler_ai_consent")).toBeNull();
    expect(localStorage.getItem("spert_scheduler_ai_last_seq:sess-arthur")).toBeNull();
  });

  it("a second account with no settings in cloud storage starts from this browser's signed-out settings, as a sign-in after a sign-out does — not from the first user's", async () => {
    seedSettings("local", { defaultTrialCount: 4321, globalCalendar: { holidays: [holiday("Signed-out Day")] } });
    edges.cloudPreferences = { [ARTHUR.uid]: { defaultTrialCount: 12345 } };
    renderApp("cloud");
    await settle();
    await authReports(ARTHUR);
    await loadEnds([cloudProject("Heart of Gold Refit", ARTHUR.uid)]);
    expect(settingsInUse().defaultTrialCount).toBe(12345);

    await authReports(FORD);
    await loadEnds([]);

    expect(settingsInUse().defaultTrialCount).toBe(4321);
    expect(holidaysInUse()).toEqual(["Signed-out Day"]);
  });

  it("control: the second user's session is whole — its own handle, a setting it changes saved by it, a project it creates uploaded by it", async () => {
    renderApp("cloud");
    await settle();
    await authReports(ARTHUR);
    await loadEnds([cloudProject("Heart of Gold Refit", ARTHUR.uid)]);

    await authReports(FORD);
    await loadEnds([cloudProject("Vogon Poetry Archive", FORD.uid)]);

    const handle = getCloudSyncDriver() as unknown as { session: number } | null;
    expect(handle?.session).toBe(2);
    const before = edges.preferenceSaves.length;
    await userChanges({ defaultTrialCount: 777 });
    expect(savesAfter(before).map((s) => `${s.uid}#${s.session}:${s.trials}`)).toEqual([`${FORD.uid}#2:777`]);
    await act(async () => {
      useProjectStore.getState().addProject("Ford's New Project", FORD.uid);
    });
    await waitFor(() => expect(edges.created).toEqual(["Ford's New Project#2"]));
  });

  it("the first user's projects and settings leave this browser at the change; this browser's signed-out ones stay", async () => {
    seedProjects("local", ["Local Alpha"]);
    seedSettings("local", { defaultTrialCount: 4321 });
    edges.cloudPreferences = { [ARTHUR.uid]: { defaultTrialCount: 12345 } };
    renderApp("cloud");
    await settle();
    await authReports(ARTHUR);
    await loadEnds([cloudProject("Heart of Gold Refit", ARTHUR.uid)]);
    expect(listedIn(ARTHUR.uid)).toEqual(["Heart of Gold Refit"]);
    expect(storedSettings(ARTHUR.uid)).not.toBeNull();

    await authReports(FORD);

    expect(listedIn(ARTHUR.uid)).toEqual(["(none)"]);
    expect(storedSettings(ARTHUR.uid)).toBeNull();
    expect(listedIn("local")).toEqual(["Local Alpha"]);
    expect(storedSettings("local")?.defaultTrialCount).toBe(4321);
  });

  it("with local storage chosen, the Dashboard then shows this browser's signed-out projects, not the first user's", async () => {
    seedProjects("local", ["Local Alpha"]);
    seedProjects(ARTHUR.uid, ["Arthur's Local Work"]);
    renderApp("local");
    await settle();
    await authReports(ARTHUR);
    await press("test: leave");
    await press("test: open the Dashboard");
    expect(tileNames()).toEqual(["Arthur's Local Work"]);

    await authReports(FORD);

    expect(screen.getByTestId("state").textContent).toBe("signed in uid-ford, local storage");
    expect(storeNames()).toEqual(["Local Alpha"]);
    expect(tileNames()).toEqual(["Local Alpha"]);
  });

  it("control: no preference is saved at the change, to either account", async () => {
    edges.cloudPreferences = { [ARTHUR.uid]: { defaultTrialCount: 12345 }, [FORD.uid]: { dateFormat: "YYYY/MM/DD" } };
    renderApp("cloud");
    await settle();
    await authReports(ARTHUR);
    await loadEnds([cloudProject("Heart of Gold Refit", ARTHUR.uid)]);
    const before = edges.preferenceSaves.length;

    await authReports(FORD);
    await loadEnds([]);

    expect(savesAfter(before)).toEqual([]);
  });
});
