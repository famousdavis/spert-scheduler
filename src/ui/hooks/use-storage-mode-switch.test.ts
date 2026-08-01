// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

import { useStorageModeSwitch } from "./use-storage-mode-switch";
import { useAuth } from "@ui/providers/AuthProvider";
import { useStorage } from "@ui/providers/StorageProvider";
import { migrateLocalToCloud } from "@infrastructure/firebase/firestore-migration";
import { setStorageNamespace } from "@infrastructure/persistence/local-storage-repository";
import { useProjectStore } from "./use-project-store";

vi.mock("@ui/providers/AuthProvider", () => ({ useAuth: vi.fn() }));
vi.mock("@ui/providers/StorageProvider", () => ({ useStorage: vi.fn() }));
vi.mock("@infrastructure/firebase/firestore-migration", () => ({
  migrateLocalToCloud: vi.fn(),
}));

/**
 * At 0% coverage before charter §3.2, and the file the coupling survey flagged hardest:
 * SIX collaborators — both providers, firestore-migration, LocalStorageRepository,
 * scenario-memory and the project store.
 *
 * ⚠️ Before writing this, the question was whether a six-mock test would assert anything
 * or merely pin the wiring. Wiring assertions break on every refactor and answer "would
 * anything tell me I got it wrong?" with no — and §3.6 intends to change that wiring.
 *
 * Reading it first found four real decisions, so it is worth covering:
 *
 *   1. the mode switch is GATED on `result.failed === 0` — a partial migration leaves
 *      you in local mode with the failure surfaced, rather than switching optimistically
 *   2. the migration branch reads `persistedMode` while the discard branch reads `mode`
 *      — two different reads, trivially conflated
 *   3. discard explicitly targets the "local" namespace, because the ACTIVE namespace at
 *      that moment is the user's UID (v0.42.6 / M4)
 *   4. `reMigrate` deliberately does NOT switch mode, even on success
 *
 * Only three things are mocked, not six. LocalStorageRepository, scenario-memory and the
 * project store are exercised FOR REAL against jsdom's localStorage, which turns decision
 * 3 from a wiring assertion ("was it constructed with 'local'?") into a behavioural one
 * ("did the local namespace get cleared and the UID namespace survive?"). That assertion
 * survives decomposition; the wiring one would not.
 */

const switchMode = vi.fn();
const USER = { uid: "user-123" } as unknown as ReturnType<typeof useAuth>["user"];

const setAuth = (user: unknown) =>
  vi.mocked(useAuth).mockReturnValue({ user } as unknown as ReturnType<typeof useAuth>);

const setStorage = (mode: string, persistedMode: string) =>
  vi.mocked(useStorage).mockReturnValue({
    mode,
    persistedMode,
    switchMode,
  } as unknown as ReturnType<typeof useStorage>);

const seedNamespace = (ns: string, projectId: string) => {
  localStorage.setItem(`spert:project-index:${ns}`, JSON.stringify([projectId]));
  localStorage.setItem(`spert:project:${ns}:${projectId}`, JSON.stringify({ id: projectId }));
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  setStorageNamespace("local");
  setAuth(USER);
  setStorage("local", "local");
  vi.mocked(migrateLocalToCloud).mockResolvedValue({ migrated: 1, failed: 0 } as never);
});

const setup = () => renderHook(() => useStorageModeSwitch());

describe("useStorageModeSwitch", () => {
  it("starts idle", () => {
    const { result } = setup();
    expect(result.current.migrating).toBe(false);
    expect(result.current.migrationResult).toBeNull();
    expect(result.current.migrationError).toBeNull();
    expect(result.current.confirmDiscardOpen).toBe(false);
  });

  describe("switching to cloud", () => {
    it("refuses without a signed-in user, without even attempting migration", () => {
      setAuth(null);
      const { result } = setup();
      act(() => { result.current.handleModeChange("cloud"); });

      expect(migrateLocalToCloud).not.toHaveBeenCalled();
      expect(switchMode).not.toHaveBeenCalled();
    });

    it("migrates, then switches, when nothing failed", async () => {
      const { result } = setup();
      await act(async () => await result.current.handleModeChange("cloud"));

      expect(migrateLocalToCloud).toHaveBeenCalledWith("user-123");
      expect(switchMode).toHaveBeenCalledWith("cloud");
      expect(result.current.migrationResult).toEqual({ migrated: 1, failed: 0 });
      expect(result.current.migrating).toBe(false);
    });

    it("does NOT switch when any project failed to migrate", async () => {
      // Decision 1. Switching optimistically here would leave the user in cloud mode
      // believing everything arrived, while some projects exist only locally.
      vi.mocked(migrateLocalToCloud).mockResolvedValue({ migrated: 2, failed: 1 } as never);
      const { result } = setup();
      await act(async () => await result.current.handleModeChange("cloud"));

      expect(switchMode).not.toHaveBeenCalled();
      expect(result.current.migrationResult).toEqual({ migrated: 2, failed: 1 });
      expect(result.current.migrationError).toBeNull(); // a partial result is not an error
    });

    it("surfaces a thrown migration as an error and stays in local mode", async () => {
      vi.mocked(migrateLocalToCloud).mockRejectedValue(new Error("firestore unavailable"));
      const { result } = setup();
      await act(async () => await result.current.handleModeChange("cloud"));

      expect(result.current.migrationError).toBe("firestore unavailable");
      expect(result.current.migrating).toBe(false); // the `finally` ran
      expect(switchMode).not.toHaveBeenCalled();
    });

    it("skips migration when cloud is ALREADY the persisted mode", async () => {
      // Decision 2, first half: the guard reads `persistedMode`, not `mode`. Someone who
      // has been in cloud mode and toggles back must not re-run a whole migration.
      setStorage("local", "cloud");
      const { result } = setup();
      await act(async () => await result.current.handleModeChange("cloud"));

      expect(migrateLocalToCloud).not.toHaveBeenCalled();
      expect(switchMode).toHaveBeenCalledWith("cloud");
    });
  });

  describe("switching to local", () => {
    it("asks for confirmation instead of switching immediately, when currently cloud", () => {
      // Decision 2, second half: this branch reads `mode`, not `persistedMode`.
      setStorage("cloud", "cloud");
      const { result } = setup();
      act(() => { result.current.handleModeChange("local"); });

      expect(result.current.confirmDiscardOpen).toBe(true);
      expect(switchMode).not.toHaveBeenCalled();
    });

    it("switches directly when not currently in cloud mode", () => {
      setStorage("local", "local");
      const { result } = setup();
      act(() => { result.current.handleModeChange("local"); });

      expect(result.current.confirmDiscardOpen).toBe(false);
      expect(switchMode).toHaveBeenCalledWith("local");
    });
  });

  describe("the Keep / Discard confirmation", () => {
    it("Keep switches mode and leaves local data alone", () => {
      seedNamespace("local", "p1");
      setStorage("cloud", "cloud");
      const { result } = setup();

      act(() => { result.current.handleModeChange("local"); });
      act(() => result.current.handleKeepLocalCopy());

      expect(result.current.confirmDiscardOpen).toBe(false);
      expect(switchMode).toHaveBeenCalledWith("local");
      expect(localStorage.getItem("spert:project:local:p1")).not.toBeNull();
    });

    it("Discard clears the LOCAL namespace even while the UID namespace is active", () => {
      // Decision 3, asserted behaviourally. At this call site the active namespace is
      // still the user's UID, because the mode switch happens before sign-out. A plain
      // `new LocalStorageRepository()` would clear the UID's data and leave the local
      // copy the user just asked to discard.
      seedNamespace("local", "p-local");
      seedNamespace("user-123", "p-cloud");
      setStorageNamespace("user-123");
      setStorage("cloud", "cloud");

      const { result } = setup();
      act(() => { result.current.handleModeChange("local"); });
      act(() => result.current.handleDiscardLocalCopy());

      expect(localStorage.getItem("spert:project:local:p-local")).toBeNull();
      expect(localStorage.getItem("spert:project-index:local")).toBeNull();
      // ...and the namespace that was merely ACTIVE is untouched.
      expect(localStorage.getItem("spert:project:user-123:p-cloud")).not.toBeNull();
    });

    it("Discard also empties the in-memory project store and switches mode", () => {
      useProjectStore.setState({
        projects: [{ id: "p1", name: "P1", scenarios: [] }] as never,
      });
      setStorage("cloud", "cloud");

      const { result } = setup();
      act(() => result.current.handleDiscardLocalCopy());

      expect(useProjectStore.getState().projects).toEqual([]);
      expect(switchMode).toHaveBeenCalledWith("local");
      expect(result.current.confirmDiscardOpen).toBe(false);
    });
  });

  describe("reMigrate", () => {
    it("re-runs migration but deliberately does NOT switch mode", async () => {
      // Decision 4. reMigrate is offered after a partial failure, so the user is retrying
      // the copy — not asking to move.
      const { result } = setup();
      await act(async () => await result.current.reMigrate());

      expect(migrateLocalToCloud).toHaveBeenCalledWith("user-123");
      expect(result.current.migrationResult).toEqual({ migrated: 1, failed: 0 });
      expect(switchMode).not.toHaveBeenCalled();
    });

    it("does nothing without a user", async () => {
      setAuth(null);
      const { result } = setup();
      await act(async () => await result.current.reMigrate());
      expect(migrateLocalToCloud).not.toHaveBeenCalled();
    });

    it("surfaces a thrown retry as an error", async () => {
      vi.mocked(migrateLocalToCloud).mockRejectedValue(new Error("still down"));
      const { result } = setup();
      await act(async () => await result.current.reMigrate());

      expect(result.current.migrationError).toBe("still down");
      expect(result.current.migrating).toBe(false);
    });

    it("clears a previous error before retrying", async () => {
      vi.mocked(migrateLocalToCloud).mockRejectedValueOnce(new Error("first"));
      const { result } = setup();
      await act(async () => await result.current.reMigrate());
      expect(result.current.migrationError).toBe("first");

      vi.mocked(migrateLocalToCloud).mockResolvedValue({ migrated: 3, failed: 0 } as never);
      await act(async () => await result.current.reMigrate());
      expect(result.current.migrationError).toBeNull();
      expect(result.current.migrationResult).toEqual({ migrated: 3, failed: 0 });
    });
  });

  describe("dismissing the result surfaces", () => {
    it("clears the migration result", async () => {
      const { result } = setup();
      await act(async () => await result.current.handleModeChange("cloud"));
      expect(result.current.migrationResult).not.toBeNull();

      act(() => result.current.clearMigrationResult());
      expect(result.current.migrationResult).toBeNull();
    });

    it("clears the migration error", async () => {
      vi.mocked(migrateLocalToCloud).mockRejectedValue(new Error("nope"));
      const { result } = setup();
      await act(async () => await result.current.handleModeChange("cloud"));

      act(() => result.current.clearMigrationError());
      expect(result.current.migrationError).toBeNull();
    });

    it("exposes the confirm dialog setter for external close", async () => {
      const { result } = setup();
      act(() => result.current.setConfirmDiscardOpen(true));
      await waitFor(() => expect(result.current.confirmDiscardOpen).toBe(true));
      act(() => result.current.setConfirmDiscardOpen(false));
      expect(result.current.confirmDiscardOpen).toBe(false);
    });
  });
});
