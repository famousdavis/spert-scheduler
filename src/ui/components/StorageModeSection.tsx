// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useState, useCallback, useRef } from "react";
import { useAuth } from "@ui/providers/AuthProvider";
import { SIGN_IN_POPUP_BLOCKED } from "@ui/providers/auth-errors";
import { useStorage } from "@ui/providers/StorageProvider";
import { useStorageModeSwitch } from "@ui/hooks/use-storage-mode-switch";
import { toast } from "@ui/hooks/use-notification-store";
import { ConsentModal } from "./ConsentModal";
import { KeepOrDiscardLocalModal } from "./KeepOrDiscardLocalModal";
import {
  TOS_VERSION,
  LS_TOS_ACCEPTED_VERSION,
  LS_TOS_WRITE_PENDING,
} from "@app/legal-constants";

export function StorageModeSection() {
  const { user, firebaseAvailable, signInWithGoogle, signInWithMicrosoft } = useAuth();
  const { mode, persistedMode, isCloudAvailable } = useStorage();
  const {
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
  } = useStorageModeSwitch();

  const [consentOpen, setConsentOpen] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const pendingProviderRef = useRef<"google" | "microsoft" | null>(null);

  /** Proceed with Firebase Auth for the selected provider. */
  const doSignIn = useCallback(
    async (provider: "google" | "microsoft") => {
      setSigningIn(true);
      try {
        if (provider === "google") {
          await signInWithGoogle();
        } else {
          await signInWithMicrosoft();
        }
      } catch (err) {
        const code = (err as { code?: string } | undefined)?.code;
        if (code === SIGN_IN_POPUP_BLOCKED) {
          toast.info(
            "Your browser blocked the sign-in popup. Redirecting…"
          );
        } else {
          console.error("Sign-in error:", err);
          toast.error("Sign-in failed. Please try again.");
        }
      } finally {
        setSigningIn(false);
      }
    },
    [signInWithGoogle, signInWithMicrosoft]
  );

  /** Check localStorage consent cache; show modal if not current version. */
  const handleSignIn = useCallback(
    (provider: "google" | "microsoft") => {
      const accepted = localStorage.getItem(LS_TOS_ACCEPTED_VERSION);
      if (accepted === TOS_VERSION) {
        if (localStorage.getItem(LS_TOS_WRITE_PENDING) !== "true") {
          localStorage.setItem(LS_TOS_WRITE_PENDING, "true");
        }
        doSignIn(provider);
      } else {
        pendingProviderRef.current = provider;
        setConsentOpen(true);
      }
    },
    [doSignIn]
  );

  /** Consent modal accepted: cache version + set write-pending, then sign in. */
  const handleConsentAccept = useCallback(() => {
    localStorage.setItem(LS_TOS_ACCEPTED_VERSION, TOS_VERSION);
    localStorage.setItem(LS_TOS_WRITE_PENDING, "true");
    setConsentOpen(false);
    if (pendingProviderRef.current) {
      doSignIn(pendingProviderRef.current);
    }
  }, [doSignIn]);

  // Only show if Firebase is configured
  if (!firebaseAvailable || !isCloudAvailable) return null;

  return (
    <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
      <h2 className="text-lg font-semibold text-blue-600 dark:text-blue-400">
        Cloud Storage
      </h2>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Store your projects in the cloud for access across devices.
      </p>

      {!user ? (
        <div className="mt-4">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
            Sign in to enable cloud storage:
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => handleSignIn("google")}
              disabled={signingIn}
              className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors disabled:opacity-50"
            >
              {signingIn && pendingProviderRef.current === "google" ? "Signing in..." : "Sign in with Google"}
            </button>
            <button
              onClick={() => handleSignIn("microsoft")}
              disabled={signingIn}
              className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors disabled:opacity-50"
            >
              {signingIn && pendingProviderRef.current === "microsoft" ? "Signing in..." : "Sign in with Microsoft"}
            </button>
          </div>
          <ConsentModal
            open={consentOpen}
            onOpenChange={setConsentOpen}
            onAccept={handleConsentAccept}
          />
        </div>
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
                onClick={clearMigrationResult}
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
                onClick={clearMigrationError}
                className="mt-2 text-xs text-red-700 dark:text-red-300 hover:text-red-900 dark:hover:text-red-100 underline"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Re-migrate button (if already in cloud mode) */}
          {mode === "cloud" && !migrating && !migrationResult && (
            <button
              onClick={reMigrate}
              className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline"
            >
              Upload local data to cloud
            </button>
          )}
        </div>
      )}

      <KeepOrDiscardLocalModal
        open={confirmDiscardOpen}
        onOpenChange={setConfirmDiscardOpen}
        onKeep={handleKeepLocalCopy}
        onDiscard={handleDiscardLocalCopy}
      />
    </section>
  );
}
