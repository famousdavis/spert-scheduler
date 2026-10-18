// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import type { ReactNode } from "react";
import { isFirebaseAvailable } from "@infrastructure/firebase/firebase";
import { useAuth } from "./AuthProvider";
import {
  registerSignOutCleanup,
  clearSignOutCleanup,
} from "@infrastructure/persistence/sign-out-cleanup-registry";
import { getCloudSyncDriver, endCloudSyncForSignOut } from "@ui/hooks/use-cloud-sync";
import { useProjectStore } from "@ui/hooks/use-project-store";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";
import {
  LocalStorageRepository,
  setStorageNamespace,
  getActiveStorageNamespace,
} from "@infrastructure/persistence/local-storage-repository";
import { clearAllLastScenarios } from "@infrastructure/persistence/scenario-memory";
import { clearAllCollapsedSections } from "@infrastructure/persistence/section-collapse-memory";
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

/**
 * What a sign-out clears of the signed-in user's: the project list and settings in memory, and this browser's copy of
 * their projects, scenario and section memory and settings — the ACTIVE namespace's, which must be that user's.
 */
function clearSignedInUserData(): void {
  useProjectStore.getState().clearAllData();
  new LocalStorageRepository().clearAll();
  clearAllLastScenarios();
  clearAllCollapsedSections();
  clearPreferences();
  usePreferencesStore.getState().clearInMemory();
}

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

  // WI-113: the uid this storage last followed — null while nobody is signed in — so a sign-out (a user, then
  // none) can be told apart from a page load with nobody signed in.
  const followedUidRef = useRef<string | null>(null);

  // v0.42.6 (M4): keep the localStorage namespace synchronized with the
  // current auth user. UID for cloud mode, "local" for signed-out / local
  // mode. Runs after the auth state has resolved (authLoading guard avoids
  // a transient "local" flash during boot when the user is actually cloud).
  useEffect(() => {
    if (authLoading) return;
    const uid = user?.uid ?? null;
    const followed = followedUidRef.current;
    // WI-113: a different user, with no sign-out between — a tab that wakes to find someone else signed in — is the
    // first user's sign-out, then the second user's sign-in (owner ruling, 2026-10-16): the first user's data is
    // cleared HERE, while their storage is still the active one, and this browser's signed-out settings come back, as
    // at a sign-out — the second user's first cloud load then applies its own (useCloudSync). The second session is
    // already running when this runs, so it is NOT ended here: the sign-out cleanup would let go of its handle. In local
    // storage, this browser's signed-out projects come back too; in cloud storage the list stays empty for the load.
    if (followed !== null && uid !== null && followed !== uid) {
      clearSignedInUserData();
      setStorageNamespace("local");
      usePreferencesStore.getState().loadPreferences();
      if (persistedMode !== "cloud" || !isFirebaseAvailable) useProjectStore.getState().loadProjects();
    }
    setStorageNamespace(uid ?? "local");
    // WI-113: a sign-out leaves the project list empty and the settings at Scheduler's defaults — the cleanup reset
    // both while the namespace was still the user's, and a page that re-reads them did so then, from the namespace
    // just wiped. This browser's own projects (owner ruling, 2026-10-10) and settings (owner ruling, 2026-10-15)
    // come back HERE, where the namespace has just become "local"; an effect inside the cloud sync runs before this
    // one, while the namespace is still the user's. A late answer from the ended cloud session cannot replace the
    // list: useCloudSync ignores such answers. And no setting read back here is sent to the cloud: the cleanup ended
    // the session's preference sync (WI-117), and it has stopped listening before this effect runs.
    if (followedUidRef.current !== null && uid === null) {
      useProjectStore.getState().loadProjects();
      usePreferencesStore.getState().loadPreferences();
    }
    followedUidRef.current = uid;
  }, [authLoading, user, persistedMode]);

  // Register the sign-out cleanup function. AuthProvider invokes this via
  // runSignOutCleanup() before firebaseSignOut. Order matters:
  //   1. bump simulation generation — any worker callback in flight will
  //      capture-vs-current mismatch and discard its result before it can
  //      write to the (about-to-be-zeroed) store. v0.42.6 (M2).
  //   2. cancel pending Firestore saves (credentials still valid), and end the
  //      session's cloud sync (WI-117): its preference sync would otherwise send
  //      step 5's reset of the preferences to the cloud, over the user's own
  //      (owner ruling, 2026-10-10). Before the WI-118 guard below, so a
  //      running session is ended whatever the guard decides.
  //   3. zero in-memory project state (before C2 guard re-evaluates on next
  //      sign-in and before localStorage cleanup wipes the mirror)
  //   4. clear per-user localStorage keys (projects, scenario memory, collapsed
  //      sections, prefs)
  //   5. reset the preferences Zustand store (separate store from projects)
  // WI-118: steps 3-5 act only on what is on show, and only while it is a signed-in user's: this browser's signed-out
  // storage ("local") — on show until the app has followed a user to their storage — is never cleared, and neither is
  // the storage of a user the app has not shown (owner ruling, 2026-10-10).
  // Keys intentionally preserved: spert:storage-mode (continuity),
  // spert_firstRun_seen (per-browser), Nager country cache (not user-specific),
  // ToS keys (owned by AuthProvider).
  useEffect(() => {
    registerSignOutCleanup(async () => {
      bumpSimulationGeneration();
      getCloudSyncDriver()?.cancelPendingSaves();
      endCloudSyncForSignOut();
      if (getActiveStorageNamespace() === "local") return;
      clearSignedInUserData();
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
