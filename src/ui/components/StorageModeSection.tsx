// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useState, useCallback } from "react";
import { useAuth } from "@ui/providers/AuthProvider";
import { useStorage } from "@ui/providers/StorageProvider";
import type { StorageMode } from "@ui/providers/StorageProvider";
import { migrateLocalToCloud } from "@infrastructure/firebase/firestore-migration";
import type { MigrationResult } from "@infrastructure/firebase/firestore-migration";

export function StorageModeSection() {
  const { user, firebaseAvailable } = useAuth();
  const { mode, persistedMode, switchMode, isCloudAvailable } = useStorage();
  const [migrating, setMigrating] = useState(false);
  const [migrationResult, setMigrationResult] =
    useState<MigrationResult | null>(null);
  const [migrationError, setMigrationError] = useState<string | null>(null);

  // Only show if Firebase is configured
  if (!firebaseAvailable || !isCloudAvailable) return null;

  const handleModeChange = useCallback(
    async (newMode: StorageMode) => {
      if (newMode === "cloud" && !user) {
        return; // Can't switch to cloud without signing in
      }

      if (newMode === "cloud" && persistedMode !== "cloud" && user) {
        // Switching to cloud for the first time — offer migration
        setMigrating(true);
        setMigrationError(null);
        try {
          const result = await migrateLocalToCloud(user.uid);
          setMigrationResult(result);
          // Only switch if migration had no failures
          if (result.failed === 0) {
            switchMode(newMode);
          }
        } catch (e) {
          setMigrationError(
            e instanceof Error ? e.message : "Migration failed"
          );
          // Do NOT call switchMode — stay in local mode
        } finally {
          setMigrating(false);
        }
        return; // Already handled
      }

      switchMode(newMode);
    },
    [user, persistedMode, switchMode]
  );

  return (
    <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
      <h2 className="text-lg font-semibold text-blue-600 dark:text-blue-400">
        Cloud Storage
      </h2>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Store your projects in the cloud for access across devices.
      </p>

      {!user ? (
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
          Sign in to enable cloud storage.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {/* Mode toggle */}
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
              <input
                type="radio"
                name="storage-mode"
                value="local"
                checked={persistedMode === "local"}
                onChange={() => handleModeChange("local")}
                className="text-blue-600"
              />
              <span className="font-medium">Local</span>
              <span className="text-gray-500 dark:text-gray-400">
                — data stored in this browser only
              </span>
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
              <input
                type="radio"
                name="storage-mode"
                value="cloud"
                checked={persistedMode === "cloud"}
                onChange={() => handleModeChange("cloud")}
                disabled={migrating}
                className="text-blue-600"
              />
              <span className="font-medium">Cloud</span>
              <span className="text-gray-500 dark:text-gray-400">
                — synced to your account
              </span>
            </label>
          </div>

          {/* Current status */}
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {mode === "cloud" ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                Connected to cloud as {user.email}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-gray-400" />
                Using local storage
              </span>
            )}
          </div>

          {/* Migration progress */}
          {migrating && (
            <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
              <svg
                className="animate-spin h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Uploading data to cloud...
            </div>
          )}

          {/* Migration result */}
          {migrationResult && (
            <div className="border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 rounded-md p-3">
              <p className="text-sm font-medium text-green-800 dark:text-green-200">
                Migration complete
              </p>
              <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                {migrationResult.uploaded > 0 &&
                  `${migrationResult.uploaded} project${migrationResult.uploaded !== 1 ? "s" : ""} uploaded. `}
                {migrationResult.skipped > 0 &&
                  `${migrationResult.skipped} skipped (already in cloud). `}
                {migrationResult.failed > 0 &&
                  `${migrationResult.failed} failed.`}
              </p>
              <button
                onClick={() => setMigrationResult(null)}
                className="mt-2 text-xs text-green-700 dark:text-green-300 hover:text-green-900 dark:hover:text-green-100 underline"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Migration error */}
          {migrationError && (
            <div className="border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 rounded-md p-3">
              <p className="text-sm font-medium text-red-800 dark:text-red-200">
                Migration failed
              </p>
              <p className="text-xs text-red-700 dark:text-red-300 mt-1">
                {migrationError}
              </p>
              <button
                onClick={() => setMigrationError(null)}
                className="mt-2 text-xs text-red-700 dark:text-red-300 hover:text-red-900 dark:hover:text-red-100 underline"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Re-migrate button (if already in cloud mode) */}
          {mode === "cloud" && !migrating && !migrationResult && (
            <button
              onClick={async () => {
                if (!user) return;
                setMigrating(true);
                setMigrationError(null);
                try {
                  const result = await migrateLocalToCloud(user.uid);
                  setMigrationResult(result);
                } catch (e) {
                  setMigrationError(
                    e instanceof Error ? e.message : "Migration failed"
                  );
                } finally {
                  setMigrating(false);
                }
              }}
              className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline"
            >
              Upload local data to cloud
            </button>
          )}
        </div>
      )}
    </section>
  );
}
