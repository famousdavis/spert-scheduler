// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useCallback, useState } from "react";
import { useAuth } from "@ui/providers/AuthProvider";
import { useStorage } from "@ui/providers/StorageProvider";
import type { StorageMode } from "@ui/providers/StorageProvider";
import { migrateLocalToCloud } from "@infrastructure/firebase/firestore-migration";
import type { MigrationResult } from "@infrastructure/firebase/firestore-migration";
import { LocalStorageRepository } from "@infrastructure/persistence/local-storage-repository";
import { clearAllLastScenarios } from "@infrastructure/persistence/scenario-memory";
import { clearAllCollapsedSections } from "@infrastructure/persistence/section-collapse-memory";
import { useProjectStore } from "@ui/hooks/use-project-store";
import { confirmDialog } from "@ui/hooks/use-confirm-store";

/**
 * SD-5 (v0.79.8 audit): list the signed-out ("local") projects and confirm
 * before uploading them to cloud. On a shared browser the local store may hold
 * someone else's projects, and a one-click switch would copy all of them into
 * this account. Returns true to proceed — nothing to upload, or the user
 * confirmed; false if they cancelled.
 */
async function confirmLocalUpload(): Promise<boolean> {
  const localRepo = new LocalStorageRepository("local");
  const localIds = localRepo.list();
  if (localIds.length === 0) return true;
  const names = localIds.map((id) => localRepo.load(id)?.name ?? id);
  return confirmDialog.ask({
    title: `Upload ${localIds.length} project${localIds.length === 1 ? "" : "s"} to your account?`,
    description:
      `These projects are stored in this browser and will be copied to your cloud account: ${names.join(", ")}. ` +
      "⚠️ Local projects belong to the browser, not to a person — on a shared computer they may be someone else's. Upload only if these are yours.",
    confirmLabel: "Upload",
  });
}

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
        // SD-5 (v0.79.8 audit): list the signed-out projects and confirm before
        // uploading them (confirmLocalUpload). Cancel abandons the switch.
        if (!(await confirmLocalUpload())) return;
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
    // SD-1 (v0.79.x audit): "Discard" promises to remove the cloud data FROM THIS BROWSER. While the
    // user is signed in — true here, since the mode switch happens before any sign-out — the active
    // namespace IS their UID, and the cloud mirror lives there (spert:project:{uid}:*), NOT in the
    // signed-out "local" namespace. The pre-fix code cleared "local" (this browser's signed-out
    // projects — possibly another person's) and left the UID mirror, which loadProjects then
    // reloaded: Discard deleted the wrong data and kept the data it promised to remove. Clear the
    // ACTIVE (UID) namespace instead and leave "local" alone; clearAll (SD-3) sweeps it by prefix,
    // orphaned mirror copies included.
    new LocalStorageRepository().clearAll();
    // These already clear the ACTIVE (signed-in UID) namespace — now consistent with the line above:
    // the UID's scenario memory and collapsed-section state go with its discarded projects.
    clearAllLastScenarios();
    clearAllCollapsedSections();
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
