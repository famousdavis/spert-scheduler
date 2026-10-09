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
 * WI-109: signed in to cloud storage, the Dashboard said "No projects yet." for the seconds it took
 * the user's projects to arrive.
 *
 * These tests put the page's REAL providers and stores through each state: AuthProvider,
 * StorageProvider, useCloudSync (as Layout runs it) and the project store. Only the Firebase edges
 * are replaced — the auth listener, which each test drives by hand, and the Firestore driver, whose
 * cloud load each test ends by hand (or fails).
 */

/** The fields of a Firebase user that AuthProvider reads. */
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
interface PendingLoad {
  resolve: (load: CloudLoad) => void;
  reject: (error: unknown) => void;
}
interface FirebaseEdges {
  emit: ((user: FakeFirebaseUser | null) => Promise<void>) | null;
  loads: PendingLoad[];
}

const firebase = vi.hoisted(() => {
  const edges: FirebaseEdges = { emit: null, loads: [] };
  return edges;
});

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (_auth: unknown, listener: (user: FakeFirebaseUser | null) => Promise<void>) => {
    firebase.emit = listener;
    return () => {
      firebase.emit = null;
    };
  },
  getRedirectResult: () => Promise.resolve(null),
  signInWithPopup: () => Promise.resolve(),
  signInWithRedirect: () => Promise.resolve(),
  // As Firebase does: sign-out resolves, and the auth listener hears null afterwards.
  signOut: () => {
    queueMicrotask(() => {
      firebase.emit?.(null).catch(() => {});
    });
    return Promise.resolve();
  },
  GoogleAuthProvider: class {},
  OAuthProvider: class {},
}));

// Firebase "configured", with no Firestore handle: AuthProvider's profile write and ToS read are
// skipped (both return early on `db === null`), so a sign-in publishes the user at once.
vi.mock("@infrastructure/firebase/firebase", () => ({
  auth: {},
  db: null,
  isFirebaseAvailable: true,
  getClaimPendingInvitations: () => null,
  getSendInvitationEmail: () => null,
}));

vi.mock("@infrastructure/firebase/firestore-driver", () => ({
  FirestoreDriver: class {
    onSaveError() {}
    loadAll() {
      return new Promise<CloudLoad>((resolve, reject) => {
        firebase.loads.push({ resolve, reject });
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
import { setStorageNamespace } from "@infrastructure/persistence/local-storage-repository";
import { createProject } from "@app/api/project-service";
import { ProjectsPage } from "./ProjectsPage";

const LOADING = "Loading your projects from cloud storage…";
const EMPTY = "No projects yet.";

const ARTHUR: FakeFirebaseUser = {
  uid: "uid-arthur",
  email: "arthur@example.com",
  displayName: "Arthur Dent",
  photoURL: null,
  emailVerified: false, // skips the invitation claim, which is not under test
  providerData: [],
};

function cloudProject(name: string): CloudProject {
  return { ...createProject(name, "2026-10-05"), _owner: ARTHUR.uid, _members: { [ARTHUR.uid]: "owner" } };
}

/** Layout's call, without the rest of Layout. */
function CloudSync() {
  useCloudSync();
  return null;
}

/**
 * The two user actions these tests need besides signing in — signing out, and switching storage —
 * and a readout of where auth and storage have got to, so a test can wait for a transition to FINISH.
 * ⚠️ The sign-out test once asserted between the cleanup's wipe of the store and the auth listener's
 * null, while the app was still in cloud storage, and passed against a design that was wrong for the
 * settled state (found by falsify straw W1). It now waits for this readout.
 */
function Controls() {
  const { user, signOut } = useAuth();
  const { mode, switchMode } = useStorage();
  return (
    <div>
      <p>
        probe: {user ? "signed in" : "signed out"}, {mode} storage
      </p>
      <button type="button" onClick={() => signOut()}>
        probe: sign out
      </button>
      <button type="button" onClick={() => switchMode("local")}>
        probe: use local storage
      </button>
      <button type="button" onClick={() => switchMode("cloud")}>
        probe: use cloud storage
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
          <Controls />
          <Routes>
            <Route path="/projects" element={<ProjectsPage />} />
          </Routes>
        </MemoryRouter>
      </StorageProvider>
    </AuthProvider>,
  );
}

/** Firebase reports the remembered sign-in (a user), or that there is none (null). */
async function authResolves(user: FakeFirebaseUser | null) {
  const emit = firebase.emit;
  if (!emit) throw new Error("AuthProvider has not subscribed to the auth state");
  await act(async () => {
    await emit(user);
  });
}

function nextCloudLoad(): PendingLoad {
  const load = firebase.loads.shift();
  if (!load) throw new Error("no cloud load is pending");
  return load;
}

async function cloudLoadEnds(projects: CloudProject[]) {
  const load = nextCloudLoad();
  await act(async () => {
    load.resolve({ projects, errors: [] });
  });
}

async function cloudLoadFails() {
  const load = nextCloudLoad();
  await act(async () => {
    load.reject(new Error("unavailable"));
  });
}

function expectLoading() {
  expect(screen.queryByText(LOADING)).not.toBeNull();
  expect(screen.queryByText(EMPTY)).toBeNull();
}

function expectEmpty() {
  expect(screen.queryByText(EMPTY)).not.toBeNull();
  expect(screen.queryByText(LOADING)).toBeNull();
}

beforeEach(() => {
  localStorage.clear();
  setStorageNamespace("local");
  _resetSignOutFlagsForTests();
  firebase.emit = null;
  firebase.loads.length = 0;
  useProjectStore.setState({ projects: [], loadError: false, loadErrors: [], cloudDataLoaded: false });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("WI-109: the Dashboard says the user's cloud projects are loading, not that there are none", () => {
  it("local storage: the empty Dashboard says 'No projects yet.' at once, signed in or not", async () => {
    renderApp("local");
    expectEmpty();

    await authResolves(ARTHUR);
    expect(screen.getByText("probe: signed in, local storage")).toBeTruthy();
    expectEmpty();
    expect(firebase.loads).toHaveLength(0);
  });

  it("cloud storage: while a remembered sign-in is being restored, it says the projects are loading", async () => {
    renderApp("cloud");
    expectLoading();

    // Nobody turns out to be signed in: the app is in local storage, and its empty Dashboard says so.
    await authResolves(null);
    expect(screen.getByText("probe: signed out, local storage")).toBeTruthy();
    await waitFor(() => expectEmpty());
  });

  it("signed in: it says the projects are loading until the cloud load ends, then shows them", async () => {
    renderApp("cloud");
    await authResolves(ARTHUR);
    expect(screen.getByText("probe: signed in, cloud storage")).toBeTruthy();
    expect(firebase.loads).toHaveLength(1);
    expectLoading();

    await cloudLoadEnds([cloudProject("Heart of Gold Refit"), cloudProject("Magrathea Survey")]);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Heart of Gold Refit" })).not.toBeNull());
    expect(screen.queryByRole("button", { name: "Magrathea Survey" })).not.toBeNull();
    expect(screen.queryByText(LOADING)).toBeNull();
    expect(screen.queryByText(EMPTY)).toBeNull();
  });

  it("a cloud load that ends with no projects: loading first, then 'No projects yet.'", async () => {
    renderApp("cloud");
    await authResolves(ARTHUR);
    expect(firebase.loads).toHaveLength(1);
    expectLoading();

    await cloudLoadEnds([]);
    await waitFor(() => expectEmpty());
  });

  it("a cloud load that FAILS ends the loading message rather than leaving it up", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderApp("cloud");
    await authResolves(ARTHUR);
    expect(firebase.loads).toHaveLength(1);
    expectLoading();

    await cloudLoadFails();
    await waitFor(() => expectEmpty());
  });

  it("signing out after a cloud load: no loading message, and the empty Dashboard says so", async () => {
    renderApp("cloud");
    await authResolves(ARTHUR);
    await cloudLoadEnds([cloudProject("Heart of Gold Refit")]);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Heart of Gold Refit" })).not.toBeNull());

    expect(screen.getByText("probe: signed in, cloud storage")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "probe: sign out" }));
    await waitFor(() => expect(screen.queryByText("probe: signed out, local storage")).not.toBeNull());
    expect(screen.queryByRole("button", { name: "Heart of Gold Refit" })).toBeNull();
    expectEmpty();
    expect(firebase.loads).toHaveLength(0);
  });

  it("switching to local storage ends it; switching back to cloud shows it until that load ends", async () => {
    renderApp("cloud");
    await authResolves(ARTHUR);
    await cloudLoadEnds([]);
    await waitFor(() => expectEmpty());

    fireEvent.click(screen.getByRole("button", { name: "probe: use local storage" }));
    expect(screen.getByText("probe: signed in, local storage")).toBeTruthy();
    expectEmpty();
    expect(firebase.loads).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "probe: use cloud storage" }));
    expect(firebase.loads).toHaveLength(1);
    expectLoading();

    await cloudLoadEnds([cloudProject("Magrathea Survey")]);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Magrathea Survey" })).not.toBeNull());
    expect(screen.queryByText(LOADING)).toBeNull();
  });

  it("signing in during the session: loading, then the projects", async () => {
    renderApp("cloud");
    await authResolves(null);
    expect(screen.getByText("probe: signed out, local storage")).toBeTruthy();
    await waitFor(() => expectEmpty());

    await authResolves(ARTHUR);
    expect(screen.getByText("probe: signed in, cloud storage")).toBeTruthy();
    expect(firebase.loads).toHaveLength(1);
    expectLoading();

    await cloudLoadEnds([cloudProject("Heart of Gold Refit")]);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Heart of Gold Refit" })).not.toBeNull());
    expect(screen.queryByText(LOADING)).toBeNull();
  });
});
