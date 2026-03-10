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

export function useStorage(): StorageContextValue {
  const ctx = useContext(StorageContext);
  if (!ctx) throw new Error("useStorage must be used within StorageProvider");
  return ctx;
}
