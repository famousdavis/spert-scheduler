// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useState, useCallback, useRef } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useAuth } from "@ui/providers/AuthProvider";
import { SIGN_IN_POPUP_BLOCKED } from "@ui/providers/auth-errors";
import { useStorage } from "@ui/providers/StorageProvider";
import type { StorageMode } from "@ui/providers/StorageProvider";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";
import { useStorageModeSwitch } from "@ui/hooks/use-storage-mode-switch";
import { getFirstName, getDisplayName } from "@ui/helpers/format-user";
import { toast } from "@ui/hooks/use-notification-store";
import type { MigrationResult } from "@infrastructure/firebase/firestore-migration";
import type { AuthUser } from "@ui/providers/AuthProvider";
import { ToggleSwitch } from "./ToggleSwitch";
import { ConsentModal } from "./ConsentModal";
import { KeepOrDiscardLocalModal } from "./KeepOrDiscardLocalModal";
import {
  TOS_VERSION,
  LS_TOS_ACCEPTED_VERSION,
  LS_TOS_WRITE_PENDING,
} from "@app/legal-constants";

// ── Icons ──────────────────────────────────────────────────────────────

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09a6.97 6.97 0 0 1 0-4.17V7.07H2.18a11.01 11.01 0 0 0 0 9.86l3.66-2.84z" fill="#FBBC05" />
      <path d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.09 14.97 0 12 0 7.7 0 3.99 2.47 2.18 6.07l3.66 2.85c.87-2.6 3.3-4.17 6.16-4.17z" fill="#EA4335" />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// ── Leaf sub-components ────────────────────────────────────────────────

function IdentityCard({
  user,
  signingOut,
  onSignOut,
}: {
  user: AuthUser;
  signingOut: boolean;
  onSignOut: () => void;
}) {
  const firstName = getFirstName(user.displayName, user.email);
  const fullDisplayName = getDisplayName(user.displayName, user.email);
  const initial = firstName.charAt(0).toUpperCase();
  const showEmail = !!user.email && user.email !== fullDisplayName;
  return (
    <div className="flex items-center gap-3 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-3">
      <span
        className="flex items-center justify-center rounded-full text-white shrink-0"
        style={{ width: 32, height: 32, backgroundColor: "#0070f3", fontSize: 13, fontWeight: 500 }}
      >
        {initial}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
          {fullDisplayName}
        </div>
        {showEmail && (
          <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
            {user.email}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onSignOut}
        disabled={signingOut}
        className="shrink-0 px-3 py-1 text-xs font-medium text-red-700 dark:text-red-400 border border-red-300 dark:border-red-800 rounded hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {signingOut ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}

function ModeRadioGroup({
  signedIn,
  persistedMode,
  isSignedInCloud,
  migrating,
  onChange,
}: {
  signedIn: boolean;
  persistedMode: StorageMode;
  isSignedInCloud: boolean;
  migrating: boolean;
  onChange: (mode: StorageMode) => void;
}) {
  const localChecked = signedIn ? persistedMode === "local" : true;
  const cloudChecked = signedIn ? isSignedInCloud : false;
  const disabled = !signedIn || migrating;
  return (
    <div className="space-y-2">
      <label className={`flex items-center gap-2.5 ${signedIn ? "cursor-pointer" : ""}`}>
        <input
          type="radio"
          name="storage-mode-modal"
          value="local"
          checked={localChecked}
          onChange={() => signedIn && onChange("local")}
          disabled={disabled}
          className="w-3.5 h-3.5 text-blue-600 shrink-0"
        />
        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
          Local Storage
        </span>
        {!signedIn && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            — data stored in this browser only
          </span>
        )}
      </label>
      <label className={`flex items-center gap-2.5 ${signedIn ? "cursor-pointer" : ""}`}>
        <input
          type="radio"
          name="storage-mode-modal"
          value="cloud"
          checked={cloudChecked}
          onChange={() => signedIn && onChange("cloud")}
          disabled={disabled}
          className="w-3.5 h-3.5 text-blue-600 shrink-0"
        />
        <span
          className={`text-sm font-medium ${
            signedIn ? "text-gray-900 dark:text-gray-100" : "text-gray-400 dark:text-gray-500"
          }`}
        >
          Cloud Storage
        </span>
        {!signedIn && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            — sign in to enable
          </span>
        )}
      </label>
    </div>
  );
}

function MigrationProgress() {
  return (
    <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
      <Spinner />
      Uploading data to cloud…
    </div>
  );
}

function MigrationResultBanner({
  result,
  onDismiss,
}: {
  result: MigrationResult;
  onDismiss: () => void;
}) {
  const uploadedPlural = result.uploaded !== 1 ? "s" : "";
  const uploadedText =
    result.uploaded > 0
      ? `${result.uploaded} project${uploadedPlural} uploaded. `
      : "";
  const skippedText =
    result.skipped > 0 ? `${result.skipped} skipped (already in cloud). ` : "";
  const failedText = result.failed > 0 ? `${result.failed} failed.` : "";
  return (
    <div className="border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 rounded-md p-3">
      <p className="text-sm font-medium text-green-800 dark:text-green-200">
        Migration complete
      </p>
      <p className="text-xs text-green-700 dark:text-green-300 mt-1">
        {uploadedText}
        {skippedText}
        {failedText}
      </p>
      <button
        type="button"
        onClick={onDismiss}
        className="mt-2 text-xs text-green-700 dark:text-green-300 hover:text-green-900 dark:hover:text-green-100 underline"
      >
        Dismiss
      </button>
    </div>
  );
}

function MigrationErrorBanner({
  error,
  onDismiss,
}: {
  error: string;
  onDismiss: () => void;
}) {
  return (
    <div className="border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 rounded-md p-3">
      <p className="text-sm font-medium text-red-800 dark:text-red-200">
        Migration failed
      </p>
      <p className="text-xs text-red-700 dark:text-red-300 mt-1">{error}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="mt-2 text-xs text-red-700 dark:text-red-300 hover:text-red-900 dark:hover:text-red-100 underline"
      >
        Dismiss
      </button>
    </div>
  );
}

function SignInButtons({
  signingIn,
  pendingProvider,
  onSignIn,
}: {
  signingIn: boolean;
  pendingProvider: "google" | "microsoft" | null;
  onSignIn: (provider: "google" | "microsoft") => void;
}) {
  return (
    <>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Sign in to enable Cloud Storage and access your data across devices.
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => onSignIn("google")}
          disabled={signingIn}
          className="flex flex-1 min-w-[160px] items-center justify-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors disabled:opacity-50"
        >
          <GoogleIcon />
          {signingIn && pendingProvider === "google"
            ? "Signing in…"
            : "Sign in with Google"}
        </button>
        <button
          type="button"
          onClick={() => onSignIn("microsoft")}
          disabled={signingIn}
          className="flex flex-1 min-w-[160px] items-center justify-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors disabled:opacity-50"
        >
          <MicrosoftIcon />
          {signingIn && pendingProvider === "microsoft"
            ? "Signing in…"
            : "Sign in with Microsoft"}
        </button>
      </div>
    </>
  );
}

function NotificationsToggle({
  warnEnabled,
  onToggle,
}: {
  warnEnabled: boolean;
  onToggle: (val: boolean) => void;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
        Notifications
      </h3>
      <div className="mt-2 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Warn me on startup when using local storage
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Shows a caution banner each time the app opens while your data is
            stored locally in this browser.
          </p>
        </div>
        <ToggleSwitch checked={warnEnabled} onChange={onToggle} />
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────

interface StorageLoginModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StorageLoginModal({
  open,
  onOpenChange,
}: StorageLoginModalProps) {
  const {
    user,
    firebaseAvailable,
    signInWithGoogle,
    signInWithMicrosoft,
    signOut,
  } = useAuth();
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
  } = useStorageModeSwitch();

  const preferences = usePreferencesStore((s) => s.preferences);
  const updatePreferences = usePreferencesStore((s) => s.updatePreferences);
  const warnEnabled = !(preferences.suppressLocalStorageWarning ?? false);

  const [consentOpen, setConsentOpen] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const pendingProviderRef = useRef<"google" | "microsoft" | null>(null);

  const available = firebaseAvailable && isCloudAvailable;
  const isSignedInCloud = !!user && mode === "cloud";
  const isSignedInLocal = !!user && mode !== "cloud";
  const signedIn = !!user;

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
          toast.info("Your browser blocked the sign-in popup. Redirecting…");
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
        pendingProviderRef.current = provider;
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

  const handleSignOut = useCallback(async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  }, [signOut, signingOut]);

  const handleWarnToggle = useCallback(
    (val: boolean) => updatePreferences({ suppressLocalStorageWarning: !val }),
    [updatePreferences]
  );

  const dismissLabel = signedIn ? "Close" : "Keep using local storage";

  return (
    <>
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40 z-50" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-[calc(100vw-1rem)] max-w-md z-50">
            <div className="flex items-start justify-between gap-4">
              <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Storage &amp; Sign In
              </Dialog.Title>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Close"
                  className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 -mr-1 -mt-1 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <CloseIcon />
                </button>
              </Dialog.Close>
            </div>

            {!available ? (
              <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                Cloud Storage is not available in this environment.
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                {user && (
                  <IdentityCard
                    user={user}
                    signingOut={signingOut}
                    onSignOut={handleSignOut}
                  />
                )}

                <ModeRadioGroup
                  signedIn={signedIn}
                  persistedMode={persistedMode}
                  isSignedInCloud={isSignedInCloud}
                  migrating={migrating}
                  onChange={handleModeChange}
                />

                {migrating && <MigrationProgress />}

                {migrationResult && (
                  <MigrationResultBanner
                    result={migrationResult}
                    onDismiss={clearMigrationResult}
                  />
                )}

                {migrationError && (
                  <MigrationErrorBanner
                    error={migrationError}
                    onDismiss={clearMigrationError}
                  />
                )}

                {!signedIn && (
                  <SignInButtons
                    signingIn={signingIn}
                    pendingProvider={pendingProviderRef.current}
                    onSignIn={handleSignIn}
                  />
                )}

                {isSignedInLocal && !migrating && !migrationResult && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Select <strong>Cloud Storage</strong> to upload your
                    projects and sync across devices.
                  </p>
                )}

                <div className="h-px bg-gray-200 dark:bg-gray-700" />

                <NotificationsToggle
                  warnEnabled={warnEnabled}
                  onToggle={handleWarnToggle}
                />

                <div className="h-px bg-gray-200 dark:bg-gray-700" />

                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="w-full text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 py-1.5"
                >
                  {dismissLabel}
                </button>
              </div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <ConsentModal
        open={consentOpen}
        onOpenChange={setConsentOpen}
        onAccept={handleConsentAccept}
      />

      <KeepOrDiscardLocalModal
        open={confirmDiscardOpen}
        onOpenChange={setConfirmDiscardOpen}
        onKeep={handleKeepLocalCopy}
        onDiscard={handleDiscardLocalCopy}
      />
    </>
  );
}
