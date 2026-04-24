// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useCallback, useState } from "react";
import { useAuth } from "@ui/providers/AuthProvider";
import { useStorage } from "@ui/providers/StorageProvider";
import type { StorageMode } from "@ui/providers/StorageProvider";
import { migrateLocalToCloud } from "@infrastructure/firebase/firestore-migration";
import type { MigrationResult } from "@infrastructure/firebase/firestore-migration";
import { LocalStorageRepository } from "@infrastructure/persistence/local-storage-repository";
import { clearAllLastScenarios } from "@infrastructure/persistence/scenario-memory";
import { useProjectStore } from "@ui/hooks/use-project-store";

export interface UseStorageModeSwitchResult {
  migrating: boolean;
  migrationResult: MigrationResult | null;
  migrationError: string | null;
  confirmDiscardOpen: boolean;
  setConfirmDiscardOpen: (open: boolean) => void;
  clearMigrationResult: () => void;
  clearMigrationError: () => void;
  handleModeChange: (newMode: StorageMode) => Promise<void>;
  handleKeepLocalCopy: () => void;
  handleDiscardLocalCopy: () => void;
  reMigrate: () => Promise<void>;
}

/**
 * Shared mode-switch state machine consumed by both the settings-page
 * Cloud Storage section and the auth-chip modal. Owns migration progress,
 * migration result/error surfaces, and the Keep/Discard confirmation flow.
 */
export function useStorageModeSwitch(): UseStorageModeSwitchResult {
  const { user } = useAuth();
  const { mode, persistedMode, switchMode } = useStorage();

  const [migrating, setMigrating] = useState(false);
  const [migrationResult, setMigrationResult] =
    useState<MigrationResult | null>(null);
  const [migrationError, setMigrationError] = useState<string | null>(null);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);

  const handleModeChange = useCallback(
    async (newMode: StorageMode) => {
      if (newMode === "cloud" && !user) return;

      if (newMode === "cloud" && persistedMode !== "cloud" && user) {
        setMigrating(true);
        setMigrationError(null);
        try {
          const result = await migrateLocalToCloud(user.uid);
          setMigrationResult(result);
          if (result.failed === 0) {
            switchMode(newMode);
          }
        } catch (e) {
          setMigrationError(
            e instanceof Error ? e.message : "Migration failed"
          );
        } finally {
          setMigrating(false);
        }
        return;
      }

      if (newMode === "local" && mode === "cloud") {
        setConfirmDiscardOpen(true);
        return;
      }

      switchMode(newMode);
    },
    [user, persistedMode, mode, switchMode]
  );

  const handleKeepLocalCopy = useCallback(() => {
    setConfirmDiscardOpen(false);
    switchMode("local");
  }, [switchMode]);

  const handleDiscardLocalCopy = useCallback(() => {
    new LocalStorageRepository().clearAll();
    clearAllLastScenarios();
    useProjectStore.getState().clearAllData();
    setConfirmDiscardOpen(false);
    switchMode("local");
  }, [switchMode]);

  const reMigrate = useCallback(async () => {
    if (!user) return;
    setMigrating(true);
    setMigrationError(null);
    try {
      const result = await migrateLocalToCloud(user.uid);
      setMigrationResult(result);
    } catch (e) {
      setMigrationError(e instanceof Error ? e.message : "Migration failed");
    } finally {
      setMigrating(false);
    }
  }, [user]);

  const clearMigrationResult = useCallback(() => setMigrationResult(null), []);
  const clearMigrationError = useCallback(() => setMigrationError(null), []);

  return {
    migrating,
    migrationResult,
    migrationError,
    confirmDiscardOpen,
    setConfirmDiscardOpen,
    clearMigrationResult,
    clearMigrationError,
    handleModeChange,
    handleKeepLocalCopy,
    handleDiscardLocalCopy,
    reMigrate,
  };
}
