// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useState, useCallback, useRef } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useAuth } from "@ui/providers/AuthProvider";
import { useStorage } from "@ui/providers/StorageProvider";
import { ConsentModal } from "./ConsentModal";
import {
  TOS_VERSION,
  LS_TOS_ACCEPTED_VERSION,
  LS_TOS_WRITE_PENDING,
} from "@app/legal-constants";

interface StorageLoginModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StorageLoginModal({
  open,
  onOpenChange,
}: StorageLoginModalProps) {
  const { firebaseAvailable, signInWithGoogle, signInWithMicrosoft } =
    useAuth();
  const { isCloudAvailable } = useStorage();

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
      } catch (e) {
        console.error("Sign-in error:", e);
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

  const available = firebaseAvailable && isCloudAvailable;

  return (
    <>
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40 z-50" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md z-50">
            <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Storage &amp; Sign In
            </Dialog.Title>

            {!available ? (
              <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                Cloud Storage is not available in this environment.
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                {/* Read-only radio display (decorative, not interactive) */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2.5">
                    <span className="w-3.5 h-3.5 rounded-full bg-blue-600 border-2 border-blue-600 shrink-0" />
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      Local Storage
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className="w-3.5 h-3.5 rounded-full border-2 border-gray-300 dark:border-gray-500 shrink-0" />
                    <span className="text-sm font-medium text-gray-400 dark:text-gray-500">
                      Cloud Storage
                    </span>
                  </div>
                </div>

                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Sign in to enable Cloud Storage and access your data across
                  devices.
                </p>

                {/* Sign-in buttons */}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => handleSignIn("google")}
                    disabled={signingIn}
                    className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors disabled:opacity-50"
                  >
                    {signingIn && pendingProviderRef.current === "google"
                      ? "Signing in..."
                      : "Sign in with Google"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSignIn("microsoft")}
                    disabled={signingIn}
                    className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors disabled:opacity-50"
                  >
                    {signingIn && pendingProviderRef.current === "microsoft"
                      ? "Signing in..."
                      : "Sign in with Microsoft"}
                  </button>
                </div>

                {/* Divider */}
                <div className="h-px bg-gray-200 dark:bg-gray-700" />

                {/* Dismiss */}
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="w-full text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 py-1.5"
                >
                  Continue with Local Storage
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
    </>
  );
}
