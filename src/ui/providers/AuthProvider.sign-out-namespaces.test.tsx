// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useEffect } from "react";
import { render, screen, act, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import type { Project, UserPreferences } from "@domain/models/types";
import type { LoadError } from "@infrastructure/persistence/local-storage-repository";
import type { ProjectRole } from "@infrastructure/firebase/firestore-driver";

/**
 * WI-118: what a sign-out clears, and what it says.
 *
 * A remembered sign-in whose terms acceptance on record is out of date is signed out from INSIDE the sign-in —
 * before the app has followed the user to their own storage. The cleanup used to clear whatever storage was
 * active then, which was this browser's signed-out storage: its projects and preferences were wiped, and the
 * message said the session had ended. Now a sign-out clears only what is on show, and only while it is a signed-in
 * user's: this browser's signed-out storage is never cleared, nor the storage of a user the app has not shown, and
 * the terms sign-out says why (owner ruling, 2026-10-10).
 *
 * These tests run the real AuthProvider, StorageProvider, cloud sync, Dashboard and stores. Only the Firebase edges
 * are replaced: the auth listener (driven by hand, and told of a sign-out only when the user changes, as Firebase
 * does), the profile and terms documents (the recorded acceptance is set per test), and the app's Firestore driver
 * (whose loads each test ends by hand).
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
interface FirebaseEdges {
  emit: ((user: FakeFirebaseUser | null) => Promise<void>) | null;
  /** The user the auth listener last heard of. */
  current: FakeFirebaseUser | null;
  signOutCalls: number;
  /** The terms version on the user's acceptance record. */
  acceptedOnRecord: string;
  /** When true, the profile write waits for the test to release it. */
  holdProfileWrite: boolean;
  heldWrites: Pending<void>[];
  loads: Pending<CloudLoad>[];
}

const edges = vi.hoisted(() => {
  const e: FirebaseEdges = {
    emit: null,
    current: null,
    signOutCalls: 0,
    acceptedOnRecord: "",
    holdProfileWrite: false,
    heldWrites: [],
    loads: [],
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
  // As Firebase does it: the call settles, then the auth listener hears null — and only if a user was signed in,
  // since the listener is told of a change of user, never of a sign-out that changes nothing.
  signOut: () => {
    edges.signOutCalls++;
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

// A Firestore handle, so the sign-in writes the profile and checks the terms acceptance on record.
vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("firebase/firestore")>();
  return {
    ...actual,
    doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join("/") }),
    setDoc: () => {
      if (!edges.holdProfileWrite) return Promise.resolve();
      return new Promise<void>((resolve, reject) => {
        edges.heldWrites.push({ resolve, reject });
      });
    },
    getDoc: () => Promise.resolve({ exists: () => true, data: () => ({ tosVersion: edges.acceptedOnRecord }) }),
    serverTimestamp: () => ({ serverTimestamp: true }),
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
      const none: Partial<UserPreferences> = {};
      return Promise.resolve(none);
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
import { DEFAULT_USER_PREFERENCES } from "@domain/models/types";
import { TOS_VERSION, LS_TOS_ACCEPTED_VERSION } from "@app/legal-constants";
import { ProjectsPage } from "@ui/pages/ProjectsPage";

const TERMS_SIGN_OUT =
  "You were signed out because you haven’t accepted the current Terms of Service and Privacy Policy. Sign in again to review and accept them — your projects are safe.";
const SESSION_ENDED =
  "Your session ended on this device, and locally-cached projects were removed. Your projects are safe in cloud storage — sign in again to restore them.";
const OLDER_TERMS = "04-05-2026";

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
  return (
    <div>
      <p data-testid="state">{`${user ? "signed in" : "signed out"}, ${mode} storage`}</p>
      <button type="button" onClick={() => void signOut()}>
        test: sign out
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
          </Routes>
        </MemoryRouter>
      </StorageProvider>
    </AuthProvider>,
  );
}

// -- this browser's storage ---------------------------------------------------------------------------

/** A project, a trial count, a last-opened scenario and a collapsed section, all kept under one namespace. */
function seedNamespace(namespace: string, projectNames: string[], trialCount: number) {
  for (const name of projectNames) new LocalStorageRepository(namespace).save(createProject(name, "2026-10-05"));
  localStorage.setItem(
    `spert:user-preferences:${namespace}`,
    JSON.stringify({ ...DEFAULT_USER_PREFERENCES, defaultTrialCount: trialCount }),
  );
  localStorage.setItem(`spert-scheduler:active-scenarios:${namespace}`, JSON.stringify({ p: "s" }));
  localStorage.setItem(`spert-scheduler:collapsed-sections:${namespace}`, JSON.stringify({ p: ["grid"] }));
}

/** The project names a namespace lists, in order; "(none)" when it has no list at all. */
function listedIn(namespace: string): string[] {
  const raw = localStorage.getItem(`spert:project-index:${namespace}`);
  if (raw === null) return ["(none)"];
  return (JSON.parse(raw) as string[]).map((id) => {
    const stored = localStorage.getItem(`spert:project:${namespace}:${id}`);
    return stored === null ? `(missing ${id})` : (JSON.parse(stored) as { name: string }).name;
  });
}

function storedProjectCount(namespace: string): number {
  let count = 0;
  for (let i = 0; i < localStorage.length; i++) {
    if (localStorage.key(i)?.startsWith(`spert:project:${namespace}:`)) count++;
  }
  return count;
}

/** Which of a namespace's three other keys are still there: preferences, last scenarios, collapsed sections. */
function settingsKeptIn(namespace: string): string[] {
  const keys = [
    `spert:user-preferences:${namespace}`,
    `spert-scheduler:active-scenarios:${namespace}`,
    `spert-scheduler:collapsed-sections:${namespace}`,
  ];
  return keys.filter((key) => localStorage.getItem(key) !== null);
}

// -- driving --------------------------------------------------------------------------------------------

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

async function signedOut() {
  await waitFor(() => expect(screen.getByTestId("state").textContent).toMatch(/^signed out/));
  await settle();
}

const storeNames = () => useProjectStore.getState().projects.map((p) => p.name);
const tileNames = () => Array.from(document.querySelectorAll("[data-tile-open]")).map((el) => el.textContent);
const toastMessages = () => useNotificationStore.getState().notifications.map((n) => n.message);
const trialsInMemory = () => usePreferencesStore.getState().preferences.defaultTrialCount;

function cloudProject(name: string, owner: string): CloudProject {
  return { ...createProject(name, "2026-10-05"), owner, _owner: owner, _members: { [owner]: "owner" } };
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  setStorageNamespace("local");
  _resetSignOutFlagsForTests();
  edges.emit = null;
  edges.current = null;
  edges.signOutCalls = 0;
  edges.acceptedOnRecord = TOS_VERSION;
  edges.holdProfileWrite = false;
  edges.heldWrites.length = 0;
  edges.loads.length = 0;
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
});

// -- the sign-out from inside the sign-in ------------------------------------------------------------

describe("WI-118: signed out from inside the sign-in, because the terms acceptance on record is out of date", () => {
  it("keeps this browser's signed-out projects and preferences, in storage, in memory and on screen", async () => {
    seedNamespace("local", ["Local Alpha", "Local Beta"], 4242);
    edges.acceptedOnRecord = OLDER_TERMS;
    renderApp("cloud");
    await settle();
    expect(trialsInMemory()).toBe(4242);

    await authReports(ARTHUR);
    await signedOut();

    expect(listedIn("local")).toEqual(["Local Alpha", "Local Beta"]);
    expect(storedProjectCount("local")).toBe(2);
    expect(settingsKeptIn("local")).toHaveLength(3);
    expect(storeNames()).toEqual(["Local Alpha", "Local Beta"]);
    expect(tileNames()).toEqual(["Local Alpha", "Local Beta"]);
    expect(trialsInMemory()).toBe(4242);
  });

  it("keeps the user's own projects and settings in this browser", async () => {
    seedNamespace(ARTHUR.uid, ["Cached Gamma"], 777);
    edges.acceptedOnRecord = OLDER_TERMS;
    renderApp("cloud");
    await settle();

    await authReports(ARTHUR);
    await signedOut();

    expect(edges.signOutCalls).toBe(1);
    expect(listedIn(ARTHUR.uid)).toEqual(["Cached Gamma"]);
    expect(storedProjectCount(ARTHUR.uid)).toBe(1);
    expect(settingsKeptIn(ARTHUR.uid)).toHaveLength(3);
  });

  it("says why, and that the projects are safe", async () => {
    seedNamespace("local", ["Local Alpha"], 4242);
    edges.acceptedOnRecord = OLDER_TERMS;
    renderApp("cloud");
    await settle();

    await authReports(ARTHUR);
    await signedOut();

    expect(toastMessages()).toEqual([TERMS_SIGN_OUT]);
    // It stays until the user closes it.
    expect(useNotificationStore.getState().notifications[0]?.duration).toBe(0);
  });

  it("with local storage chosen, keeps the work saved in this browser while signed in, and this browser's signed-out projects", async () => {
    seedNamespace("local", ["Local Alpha"], 4242);
    seedNamespace(ARTHUR.uid, ["Signed-in Work"], 777);
    edges.acceptedOnRecord = OLDER_TERMS;
    renderApp("local");
    await settle();

    await authReports(ARTHUR);
    await signedOut();

    expect(listedIn("local")).toEqual(["Local Alpha"]);
    expect(listedIn(ARTHUR.uid)).toEqual(["Signed-in Work"]);
    expect(settingsKeptIn(ARTHUR.uid)).toHaveLength(3);
    expect(toastMessages()).toEqual([TERMS_SIGN_OUT]);
  });

  it("a session that ends during the sign-in, before the app follows the user, keeps this browser's signed-out projects and the user's own, and says the session ended", async () => {
    seedNamespace("local", ["Local Alpha", "Local Beta"], 4242);
    seedNamespace(ARTHUR.uid, ["Cached Gamma"], 777);
    localStorage.setItem(LS_TOS_ACCEPTED_VERSION, TOS_VERSION);
    edges.holdProfileWrite = true;
    renderApp("cloud");
    await settle();
    const emit = edges.emit;
    if (!emit) throw new Error("AuthProvider has not subscribed to the auth state");
    // The sign-in starts, and waits on its profile write …
    await act(async () => {
      emit(ARTHUR).catch(() => {});
    });
    await settle();
    expect(edges.heldWrites).toHaveLength(1);
    // … and the session ends meanwhile.
    await authReports(null);

    expect(listedIn("local")).toEqual(["Local Alpha", "Local Beta"]);
    expect(settingsKeptIn("local")).toHaveLength(3);
    expect(storeNames()).toEqual(["Local Alpha", "Local Beta"]);
    expect(listedIn(ARTHUR.uid)).toEqual(["Cached Gamma"]);
    expect(settingsKeptIn(ARTHUR.uid)).toHaveLength(3);
    expect(toastMessages()).toEqual([SESSION_ENDED]);
  });

  it("a second account signed out this way, while the first is shown, clears the first account's data, as before, and keeps the second account's and this browser's signed-out projects", async () => {
    seedNamespace("local", ["Local Alpha"], 4242);
    seedNamespace(FORD.uid, ["Ford's Cache"], 42);
    localStorage.setItem(LS_TOS_ACCEPTED_VERSION, TOS_VERSION);
    renderApp("cloud");
    await settle();
    await authReports(ARTHUR);
    await cloudLoadEnds([cloudProject("Heart of Gold Refit", ARTHUR.uid)]);
    expect(listedIn(ARTHUR.uid)).toEqual(["Heart of Gold Refit"]);

    // The listener reports another account, whose acceptance on record is out of date.
    localStorage.removeItem(LS_TOS_ACCEPTED_VERSION);
    edges.acceptedOnRecord = OLDER_TERMS;
    await authReports(FORD);
    await signedOut();

    expect(listedIn(ARTHUR.uid)).toEqual(["(none)"]);
    expect(listedIn(FORD.uid)).toEqual(["Ford's Cache"]);
    expect(settingsKeptIn(FORD.uid)).toHaveLength(3);
    expect(listedIn("local")).toEqual(["Local Alpha"]);
  });

  it("when the session has already ended by the time the terms are found out of date, a later session's end says the session ended", async () => {
    seedNamespace("local", ["Local Alpha"], 4242);
    edges.acceptedOnRecord = OLDER_TERMS;
    edges.holdProfileWrite = true;
    renderApp("cloud");
    await settle();
    const emit = edges.emit;
    if (!emit) throw new Error("AuthProvider has not subscribed to the auth state");
    // The sign-in starts and waits on its profile write; the session ends meanwhile …
    let signIn: Promise<void> = Promise.resolve();
    await act(async () => {
      signIn = emit(ARTHUR);
    });
    await settle();
    expect(edges.heldWrites).toHaveLength(1);
    await authReports(null);
    expect(toastMessages()).toEqual([SESSION_ENDED]);

    // … then the sign-in goes on, finds the acceptance on record out of date and signs out. No user is signed in by
    // then, so the auth listener hears nothing more.
    edges.holdProfileWrite = false;
    await act(async () => {
      edges.heldWrites[0]?.resolve();
      await signIn;
    });
    await settle();
    expect(edges.signOutCalls).toBe(1);
    expect(toastMessages()).toEqual([SESSION_ENDED]);

    // The user signs in again, at the current terms, and that session ends from outside the app.
    edges.acceptedOnRecord = TOS_VERSION;
    await authReports(ARTHUR);
    await cloudLoadEnds([]);
    expect(screen.getByTestId("state").textContent).toBe("signed in, cloud storage");
    await authReports(null);
    await signedOut();

    expect(toastMessages()).toEqual([SESSION_ENDED, SESSION_ENDED]);
  });
});

// -- what must not change ---------------------------------------------------------------------------

describe("WI-118: controls — what a sign-out clears otherwise", () => {
  it("control: an acceptance on record at the current version signs the user in and clears nothing", async () => {
    seedNamespace("local", ["Local Alpha", "Local Beta"], 4242);
    seedNamespace(ARTHUR.uid, ["Cached Gamma"], 777);
    renderApp("cloud");
    await settle();

    await authReports(ARTHUR);

    expect(screen.getByTestId("state").textContent).toBe("signed in, cloud storage");
    expect(listedIn("local")).toEqual(["Local Alpha", "Local Beta"]);
    expect(listedIn(ARTHUR.uid)).toEqual(["Cached Gamma"]);
    expect(toastMessages()).toEqual([]);
  });

  it("control: an ordinary sign-out clears the user's own data and keeps this browser's signed-out projects", async () => {
    seedNamespace("local", ["Local Alpha", "Local Beta"], 4242);
    localStorage.setItem(LS_TOS_ACCEPTED_VERSION, TOS_VERSION);
    renderApp("cloud");
    await settle();
    await authReports(ARTHUR);
    await cloudLoadEnds([cloudProject("Heart of Gold Refit", ARTHUR.uid)]);
    expect(listedIn(ARTHUR.uid)).toEqual(["Heart of Gold Refit"]);

    fireEvent.click(screen.getByRole("button", { name: "test: sign out" }));
    await signedOut();

    expect(listedIn(ARTHUR.uid)).toEqual(["(none)"]);
    expect(storeNames()).toEqual([]);
    expect(listedIn("local")).toEqual(["Local Alpha", "Local Beta"]);
    expect(settingsKeptIn("local")).toHaveLength(3);
    expect(toastMessages()).toEqual([]);
  });

  it("control: an ordinary sign-out with local storage chosen clears that user's own storage, as it did before", async () => {
    seedNamespace("local", ["Local Alpha"], 4242);
    seedNamespace(ARTHUR.uid, ["Signed-in Work"], 777);
    localStorage.setItem(LS_TOS_ACCEPTED_VERSION, TOS_VERSION);
    renderApp("local");
    await settle();
    await authReports(ARTHUR);
    expect(screen.getByTestId("state").textContent).toBe("signed in, local storage");

    fireEvent.click(screen.getByRole("button", { name: "test: sign out" }));
    await signedOut();

    expect(listedIn(ARTHUR.uid)).toEqual(["(none)"]);
    expect(listedIn("local")).toEqual(["Local Alpha"]);
  });

  it("control: a session ended from outside the app clears the user's own data and still says so in the words it used before", async () => {
    seedNamespace("local", ["Local Alpha"], 4242);
    localStorage.setItem(LS_TOS_ACCEPTED_VERSION, TOS_VERSION);
    renderApp("cloud");
    await settle();
    await authReports(ARTHUR);
    await cloudLoadEnds([cloudProject("Heart of Gold Refit", ARTHUR.uid)]);

    await authReports(null);
    await signedOut();

    expect(listedIn(ARTHUR.uid)).toEqual(["(none)"]);
    expect(listedIn("local")).toEqual(["Local Alpha"]);
    expect(toastMessages()).toEqual([SESSION_ENDED]);
  });
});
