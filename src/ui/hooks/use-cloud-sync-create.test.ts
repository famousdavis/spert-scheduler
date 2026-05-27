// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

/**
 * Regression tests for the v0.47.1 cloud-sync create/delete races.
 *
 * TC-1 — Bug 1: listener-attach is deferred until driver.create() resolves
 * TC-2 — Path B: fast add-then-delete during in-flight create skips listener
 * TC-3 — Path A: delete tears down a previously-attached listener
 * TC-4 — Failed-create rollback removes the ghost project from the store
 *
 * Approach: mock the AuthProvider, StorageProvider, and FirestoreDriver
 * constructor; drive the hook through the real cloudSyncBus + useProjectStore
 * via store actions (addProject / deleteProject). This exercises the full
 * code path from store mutation → sync-bus emit → handleSyncEvent branch,
 * which is where every fix in v0.47.1 lives.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

import type { Project, UserPreferences } from "@domain/models/types";

// Mock providers BEFORE importing the hook so vi.mock hoisting catches them.
vi.mock("@ui/providers/AuthProvider", () => ({
  useAuth: vi.fn(() => ({ user: { uid: "test-uid" } })),
}));
vi.mock("@ui/providers/StorageProvider", () => ({
  useStorage: vi.fn(() => ({ mode: "cloud" })),
}));

// Mock FirestoreDriver. We control every method per test via the spies on
// the shared `driverMock` object; `new FirestoreDriver(uid)` returns it.
type Unsub = () => void;
interface DriverMock {
  onSaveError: ReturnType<typeof vi.fn>;
  loadAll: ReturnType<typeof vi.fn>;
  loadPreferences: ReturnType<typeof vi.fn>;
  subscribeToProject: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  cancelPendingSave: ReturnType<typeof vi.fn>;
  cancelPendingSaves: ReturnType<typeof vi.fn>;
  savePreferences: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
}

let driverMock: DriverMock;

vi.mock("@infrastructure/firebase/firestore-driver", () => ({
  // Use a real class so `new FirestoreDriver(uid)` works under vitest's
  // mock hoisting. The constructor delegates to the per-test driverMock
  // via a Proxy, so spy assertions in tests observe the live mock.
  FirestoreDriver: class {
    constructor() {
      return new Proxy(
        {},
        {
          get: (_t, prop: string) => driverMock[prop as keyof DriverMock],
        },
      );
    }
  },
}));

// Mock simulation cancellation (the hook calls this on teardown; pure no-op
// is enough for these tests).
vi.mock("@infrastructure/simulation/simulation-cancellation", () => ({
  bumpSimulationGeneration: vi.fn(),
}));

import { useCloudSync } from "./use-cloud-sync";
import { useProjectStore } from "./use-project-store";

function freshDriverMock(): DriverMock {
  return {
    onSaveError: vi.fn(),
    loadAll: vi.fn().mockResolvedValue([]),
    loadPreferences: vi.fn().mockResolvedValue({} as Partial<UserPreferences>),
    subscribeToProject: vi.fn<(id: string, cb: (p: Project) => void, onErr?: (e: unknown) => void) => Unsub>(
      () => () => {},
    ),
    save: vi.fn(),
    create: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    cancelPendingSave: vi.fn(),
    cancelPendingSaves: vi.fn(),
    savePreferences: vi.fn(),
    dispose: vi.fn(),
  };
}

/** Build a deferred Promise we can resolve/reject from the test body. */
function deferred<T>(): {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
} {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Wait for the hook's initial loadAll().then() chain to settle so
 * initialLoadDoneRef becomes true and subsequent sync-bus events are handled. */
async function waitForInitialLoad(): Promise<void> {
  // loadAll → .then → setProjects → loadPreferences → .then → setCloudDataLoaded.
  // Two microtask flushes are enough; the wrapping act() ensures React
  // commits the setState calls inside the .then() chain.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  localStorage.clear();
  useProjectStore.setState({ projects: [], loadError: false });
  driverMock = freshDriverMock();
  // Silence error logs from the .catch() branches — they're expected in
  // failure-path tests and would otherwise pollute the test output.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useCloudSync — create/delete race regressions (v0.47.1)", () => {
  // ─────────────────────────────────────────────────────────────────────────
  // TC-1 — Bug 1: listener-before-doc-exists
  // ─────────────────────────────────────────────────────────────────────────
  it("TC-1: defers addProjectListener until driver.create() resolves", async () => {
    const createDeferred = deferred<void>();
    driverMock.create.mockReturnValue(createDeferred.promise);

    renderHook(() => useCloudSync());
    await waitForInitialLoad();

    // Trigger the create path through the real store action.
    let created: Project | undefined;
    act(() => {
      created = useProjectStore.getState().addProject("TC-1 Project", "test-uid");
    });
    expect(created).toBeDefined();
    expect(driverMock.create).toHaveBeenCalledTimes(1);

    // Before create resolves: listener must NOT be attached and the project
    // must still be in the store (no spurious eviction).
    await act(async () => {
      await Promise.resolve();
    });
    expect(driverMock.subscribeToProject).not.toHaveBeenCalled();
    expect(useProjectStore.getState().getProject(created!.id)).toBeDefined();

    // Resolve the create promise; .then() should now attach the listener.
    await act(async () => {
      createDeferred.resolve();
      await Promise.resolve();
    });
    expect(driverMock.subscribeToProject).toHaveBeenCalledTimes(1);
    expect(driverMock.subscribeToProject.mock.calls[0]![0]).toBe(created!.id);
    expect(useProjectStore.getState().getProject(created!.id)).toBeDefined();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TC-2 — Path B: delete races in-flight create
  // ─────────────────────────────────────────────────────────────────────────
  it("TC-2: skips listener attach when project was deleted during in-flight create", async () => {
    const createDeferred = deferred<void>();
    driverMock.create.mockReturnValue(createDeferred.promise);

    renderHook(() => useCloudSync());
    await waitForInitialLoad();

    let created: Project | undefined;
    act(() => {
      created = useProjectStore.getState().addProject("TC-2 Project", "test-uid");
    });
    expect(driverMock.create).toHaveBeenCalledTimes(1);

    // User deletes before create resolves.
    act(() => {
      useProjectStore.getState().deleteProject(created!.id);
    });
    expect(driverMock.remove).toHaveBeenCalledWith(created!.id);
    expect(useProjectStore.getState().getProject(created!.id)).toBeUndefined();

    // Now resolve the create. The .then() callback runs but should skip
    // addProjectListener because getProject returns undefined.
    await act(async () => {
      createDeferred.resolve();
      await Promise.resolve();
    });
    expect(driverMock.subscribeToProject).not.toHaveBeenCalled();
    expect(useProjectStore.getState().getProject(created!.id)).toBeUndefined();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TC-3 — Path A: delete tears down a previously-attached listener
  // ─────────────────────────────────────────────────────────────────────────
  it("TC-3: delete branch unsubscribes the project's listener before driver.remove()", async () => {
    const unsubSpy = vi.fn();
    driverMock.subscribeToProject.mockReturnValue(unsubSpy);
    // Immediate-resolve create so the listener is attached in .then().
    driverMock.create.mockResolvedValue(undefined);

    renderHook(() => useCloudSync());
    await waitForInitialLoad();

    // Create the project; .then() runs synchronously after microtask flush
    // and attaches the listener via the captured subscribeToProject mock.
    let created: Project | undefined;
    act(() => {
      created = useProjectStore.getState().addProject("TC-3 Project", "test-uid");
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(driverMock.subscribeToProject).toHaveBeenCalledTimes(1);
    expect(unsubSpy).not.toHaveBeenCalled();

    // Delete the project. The "delete" branch must call the captured unsub
    // BEFORE driver.remove() fires (Path A teardown).
    act(() => {
      useProjectStore.getState().deleteProject(created!.id);
    });
    expect(unsubSpy).toHaveBeenCalledTimes(1);
    expect(driverMock.remove).toHaveBeenCalledWith(created!.id);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TC-4 — Failed-create rollback
  // ─────────────────────────────────────────────────────────────────────────
  it("TC-4: rejected driver.create() rolls back the local project and cancels pending saves", async () => {
    driverMock.create.mockRejectedValue(new Error("network down"));

    renderHook(() => useCloudSync());
    await waitForInitialLoad();

    let created: Project | undefined;
    act(() => {
      created = useProjectStore.getState().addProject("TC-4 Project", "test-uid");
    });
    expect(useProjectStore.getState().getProject(created!.id)).toBeDefined();

    // Flush the rejected promise's .catch() chain.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Rollback effects: project removed from store, debounce timer cancelled,
    // no driver.remove() (the doc was never written).
    expect(useProjectStore.getState().getProject(created!.id)).toBeUndefined();
    expect(driverMock.cancelPendingSave).toHaveBeenCalledWith(created!.id);
    expect(driverMock.remove).not.toHaveBeenCalled();
  });
});
