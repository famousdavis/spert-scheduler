// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import type { ReactNode } from "react";
import { isFirebaseAvailable } from "@infrastructure/firebase/firebase";
import { useAuth } from "./AuthProvider";
import {
  registerSignOutCleanup,
  clearSignOutCleanup,
} from "@infrastructure/persistence/sign-out-cleanup-registry";
import { getCloudSyncDriver } from "@ui/hooks/use-cloud-sync";
import { useProjectStore } from "@ui/hooks/use-project-store";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";
import {
  LocalStorageRepository,
  setStorageNamespace,
} from "@infrastructure/persistence/local-storage-repository";
import { clearAllLastScenarios } from "@infrastructure/persistence/scenario-memory";
import { clearPreferences } from "@infrastructure/persistence/preferences-repository";
import { bumpSimulationGeneration } from "@infrastructure/simulation/simulation-cancellation";

export type StorageMode = "local" | "cloud";

interface StorageContextValue {
  /** The user's chosen mode (may differ from effective if not signed in). */
  persistedMode: StorageMode;
  /** Actual mode after auth checks: cloud only if Firebase + signed in + user chose cloud. */
  mode: StorageMode;
  /** Switch the persisted storage mode. */
  switchMode: (mode: StorageMode) => void;
  /** Whether cloud storage is available (Firebase configured). */
  isCloudAvailable: boolean;
  /** True when auth state is resolved and storage is ready to use. */
  storageReady: boolean;
}

const StorageContext = createContext<StorageContextValue | null>(null);

const STORAGE_MODE_KEY = "spert:storage-mode";

function getPersistedMode(): StorageMode {
  const stored = localStorage.getItem(STORAGE_MODE_KEY);
  return stored === "cloud" ? "cloud" : "local";
}

export function StorageProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [persistedMode, setPersistedMode] = useState<StorageMode>(getPersistedMode);

  // Auth-aware loading gate:
  // If persisted mode is 'cloud', don't declare ready until auth resolves.
  const isCloudPending =
    persistedMode === "cloud" && isFirebaseAvailable && authLoading;

  const storageReady = !isCloudPending;

  // Effective mode: cloud only if Firebase available + signed in + user chose cloud
  const mode: StorageMode =
    isFirebaseAvailable && user && persistedMode === "cloud" ? "cloud" : "local";

  const switchMode = useCallback((newMode: StorageMode) => {
    localStorage.setItem(STORAGE_MODE_KEY, newMode);
    setPersistedMode(newMode);
  }, []);

  // When user signs out, keep persisted mode but effective mode becomes local
  useEffect(() => {
    if (!authLoading && !user && persistedMode === "cloud") {
      // User signed out — effective mode will be local, but we keep the preference
      // so when they sign back in, cloud mode resumes automatically.
    }
  }, [authLoading, user, persistedMode]);

  // v0.42.6 (M4): keep the localStorage namespace synchronized with the
  // current auth user. UID for cloud mode, "local" for signed-out / local
  // mode. Runs after the auth state has resolved (authLoading guard avoids
  // a transient "local" flash during boot when the user is actually cloud).
  useEffect(() => {
    if (authLoading) return;
    setStorageNamespace(user?.uid ?? "local");
  }, [authLoading, user]);

  // Register the sign-out cleanup function. AuthProvider invokes this via
  // runSignOutCleanup() before firebaseSignOut. Order matters:
  //   1. bump simulation generation — any worker callback in flight will
  //      capture-vs-current mismatch and discard its result before it can
  //      write to the (about-to-be-zeroed) store. v0.42.6 (M2).
  //   2. cancel pending Firestore saves (credentials still valid)
  //   3. zero in-memory project state (before C2 guard re-evaluates on next
  //      sign-in and before localStorage cleanup wipes the mirror)
  //   4. clear per-user localStorage keys (projects, scenario memory, prefs)
  //   5. reset the preferences Zustand store (separate store from projects)
  // Keys intentionally preserved: spert:storage-mode (continuity),
  // spert_firstRun_seen (per-browser), Nager country cache (not user-specific),
  // ToS keys (owned by AuthProvider).
  useEffect(() => {
    registerSignOutCleanup(async () => {
      bumpSimulationGeneration();
      getCloudSyncDriver()?.cancelPendingSaves();
      useProjectStore.getState().clearAllData();
      new LocalStorageRepository().clearAll();
      clearAllLastScenarios();
      clearPreferences();
      usePreferencesStore.getState().clearInMemory();
    });
    return () => clearSignOutCleanup();
  }, []);

  const value = useMemo<StorageContextValue>(
    () => ({
      persistedMode,
      mode,
      switchMode,
      isCloudAvailable: isFirebaseAvailable,
      storageReady,
    }),
    [persistedMode, mode, switchMode, storageReady]
  );

  return (
    <StorageContext.Provider value={value}>{children}</StorageContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- useStorage is tightly coupled to StorageProvider
export function useStorage(): StorageContextValue {
  const ctx = useContext(StorageContext);
  if (!ctx) throw new Error("useStorage must be used within StorageProvider");
  return ctx;
}
