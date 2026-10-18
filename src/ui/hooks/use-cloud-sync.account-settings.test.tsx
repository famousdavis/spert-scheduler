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
 * WI-113: the settings an account takes at its session's first cloud load (owner ruling, 2026-10-16). An account WITH
 * settings in cloud storage takes them; every setting they lack comes from this browser's copy of that account's own
 * settings, else Scheduler's default — never from the settings this browser keeps for use without signing in. Before,
 * such a setting was taken from whatever was in use, which after a reload or a sign-in was this browser's signed-out
 * settings, and saved to the account at the next change. An account with NO settings in cloud storage still starts from
 * this browser's signed-out settings, as before. And WI-117 holds: nothing is sent to the cloud while the first load
 * runs, nor at its end.
 *
 * The real AuthProvider, StorageProvider, cloud sync (as Layout runs it), Dashboard and stores. Only the Firebase edges
 * are replaced: the auth listener (driven by hand), and the app's Firestore driver, whose loads each test ends by hand,
 * whose settings read returns the account's settings in cloud storage as a test gives them — readable values answered,
 * unreadable ones retained, as the app's driver does — and which records every preference save with its session and
 * account, and the values it would write.
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
import { useCloudSync } from "@ui/hooks/use-cloud-sync";
import { useProjectStore } from "@ui/hooks/use-project-store";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";
import { useNotificationStore } from "@ui/hooks/use-notification-store";
import { setStorageNamespace } from "@infrastructure/persistence/local-storage-repository";
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

async function signOut() {
  fireEvent.click(screen.getByRole("button", { name: "test: sign out" }));
  await waitFor(() => expect(screen.getByTestId("state").textContent).toBe("signed out, local storage"));
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

describe("WI-113: an account with settings in cloud storage — what they lack comes from this browser's copy of that account's settings, else the default", () => {
  it("a reload: a setting the account's cloud settings lack comes from this browser's copy of the account's settings, not from the signed-out settings, and is saved so at the next change", async () => {
    seedSettings("local", { defaultTrialCount: 4321, globalCalendar: { holidays: [holiday("Signed-out Day")] } });
    seedSettings(ARTHUR.uid, { defaultTrialCount: 2222, globalCalendar: { holidays: [holiday("Account Day")] } });
    edges.cloudPreferences = { [ARTHUR.uid]: { defaultTrialCount: 12345 } };
    renderApp("cloud");
    await settle();
    await authReports(ARTHUR);
    await loadEnds([cloudProject("Heart of Gold Refit", ARTHUR.uid)]);

    expect(settingsInUse().defaultTrialCount).toBe(12345);
    expect(holidaysInUse()).toEqual(["Account Day"]);
    const before = edges.preferenceSaves.length;
    await userChanges({ theme: "dark" });
    expect(savesAfter(before).map((s) => s.holidays)).toEqual([["Account Day"]]);
  });

  it("a reload with no copy of the account's settings in this browser: a setting the cloud lacks takes Scheduler's default, not the signed-out settings", async () => {
    seedSettings("local", { defaultTrialCount: 4321, globalCalendar: { holidays: [holiday("Signed-out Day")] } });
    edges.cloudPreferences = { [ARTHUR.uid]: { dateFormat: "YYYY/MM/DD" } };
    renderApp("cloud");
    await settle();
    await authReports(ARTHUR);
    await loadEnds([cloudProject("Heart of Gold Refit", ARTHUR.uid)]);

    expect(settingsInUse().defaultTrialCount).toBe(DEFAULT_TRIALS);
    expect(holidaysInUse()).toEqual([]);
    expect(settingsInUse().dateFormat).toBe("YYYY/MM/DD");
  });

  it("a first sign-in in this browser: a setting the account's cloud settings lack takes Scheduler's default, not the signed-out settings", async () => {
    seedSettings("local", { defaultTrialCount: 4321, globalCalendar: { holidays: [holiday("Signed-out Day")] } });
    edges.cloudPreferences = { [ARTHUR.uid]: { dateFormat: "YYYY/MM/DD" } };
    renderApp("cloud");
    await settle();
    await authReports(null);
    expect(settingsInUse().defaultTrialCount).toBe(4321);

    await authReports(ARTHUR);
    await loadEnds([]);

    expect(settingsInUse().defaultTrialCount).toBe(DEFAULT_TRIALS);
    expect(holidaysInUse()).toEqual([]);
  });

  it("a sign-in again in the same tab after a sign-out: a setting the cloud lacks takes Scheduler's default — the sign-out removed this browser's copy — not the signed-out settings", async () => {
    edges.cloudPreferences = { [ARTHUR.uid]: { defaultTrialCount: 12345 } };
    renderApp("cloud");
    await settle();
    await authReports(ARTHUR);
    await loadEnds([cloudProject("Heart of Gold Refit", ARTHUR.uid)]);
    await signOut();
    await userChanges({ globalCalendar: { holidays: [holiday("Signed-out Day")] } });
    expect(holidaysInUse()).toEqual(["Signed-out Day"]);

    await authReports(ARTHUR);
    await loadEnds([cloudProject("Heart of Gold Refit", ARTHUR.uid)]);

    expect(holidaysInUse()).toEqual([]);
    const before = edges.preferenceSaves.length;
    await userChanges({ theme: "dark" });
    expect(savesAfter(before).map((s) => `${s.session}:${s.trials}:${s.holidays.join("|")}`)).toEqual(["2:12345:"]);
  });

  it("control: a setting the account's cloud settings hold wins over this browser's copy, as before", async () => {
    seedSettings(ARTHUR.uid, { defaultTrialCount: 2222 });
    edges.cloudPreferences = { [ARTHUR.uid]: { defaultTrialCount: 12345 } };
    renderApp("cloud");
    await settle();
    await authReports(ARTHUR);
    await loadEnds([]);

    expect(settingsInUse().defaultTrialCount).toBe(12345);
  });

  it("control: a setting the cloud holds in a form this version cannot read is written back as it was, not replaced from this browser's copy", async () => {
    seedSettings(ARTHUR.uid, { dateFormat: "DD/MM/YYYY" });
    edges.cloudPreferences = { [ARTHUR.uid]: { defaultTrialCount: 12345 } };
    edges.cloudUnreadable = { [ARTHUR.uid]: { dateFormat: "QQ/QQ/QQQQ" } };
    renderApp("cloud");
    await settle();
    await authReports(ARTHUR);
    await loadEnds([]);
    const before = edges.preferenceSaves.length;

    await userChanges({ theme: "dark" });

    expect(savesAfter(before).map((s) => s.dateFormat)).toEqual(["QQ/QQ/QQQQ"]);
  });
});

describe("WI-113: an account with no settings in cloud storage starts from this browser's signed-out settings, as before", () => {
  it("control: a first sign-in with nothing in cloud storage keeps the signed-out settings, and saves them to the account at the next change", async () => {
    seedSettings("local", { defaultTrialCount: 4321, globalCalendar: { holidays: [holiday("Signed-out Day")] } });
    renderApp("cloud");
    await settle();
    await authReports(null);
    await authReports(ARTHUR);
    await loadEnds([]);

    expect(settingsInUse().defaultTrialCount).toBe(4321);
    expect(holidaysInUse()).toEqual(["Signed-out Day"]);
    const before = edges.preferenceSaves.length;
    await userChanges({ theme: "dark" });
    expect(savesAfter(before).map((s) => `${s.trials}:${s.holidays.join("|")}`)).toEqual(["4321:Signed-out Day"]);
  });

  it("control: a settings read that fails keeps the settings in use, as before", async () => {
    seedSettings("local", { defaultTrialCount: 4321 });
    seedSettings(ARTHUR.uid, { defaultTrialCount: 2222 });
    edges.preferencesReadFails = true;
    renderApp("cloud");
    await settle();
    await authReports(ARTHUR);
    await loadEnds([]);

    expect(settingsInUse().defaultTrialCount).toBe(4321);
  });
});

describe("WI-117 still holds at a cloud sign-in", () => {
  it("control: nothing is sent to the cloud while the first load runs, nor at its end; a change after it is", async () => {
    seedSettings("local", { defaultTrialCount: 4321 });
    seedSettings(ARTHUR.uid, { defaultTrialCount: 2222 });
    edges.cloudPreferences = { [ARTHUR.uid]: { dateFormat: "YYYY/MM/DD" } };
    renderApp("cloud");
    await settle();
    await authReports(ARTHUR);
    expect(edges.preferenceSaves).toEqual([]);

    await loadEnds([]);
    expect(edges.preferenceSaves).toEqual([]);

    await userChanges({ defaultTrialCount: 777 });
    expect(edges.preferenceSaves.map((s) => `${s.uid}#${s.session}:${s.trials}`)).toEqual([`${ARTHUR.uid}#1:777`]);
  });
});
