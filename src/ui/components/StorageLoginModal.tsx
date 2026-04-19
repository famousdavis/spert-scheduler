// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import * as Dialog from "@radix-ui/react-dialog";
import { useAuth } from "@ui/providers/AuthProvider";
import { SIGN_IN_POPUP_BLOCKED } from "@ui/providers/auth-errors";
import { useStorage } from "@ui/providers/StorageProvider";
import { toast } from "@ui/hooks/use-notification-store";
import { ConsentModal } from "./ConsentModal";
import {
  TOS_VERSION,
  LS_TOS_ACCEPTED_VERSION,
  LS_TOS_WRITE_PENDING,
} from "@app/legal-constants";

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

interface StorageLoginModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StorageLoginModal({
  open,
  onOpenChange,
}: StorageLoginModalProps) {
  const { user, firebaseAvailable, signInWithGoogle, signInWithMicrosoft } =
    useAuth();
  const { isCloudAvailable } = useStorage();
  const navigate = useNavigate();

  const [consentOpen, setConsentOpen] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const pendingProviderRef = useRef<"google" | "microsoft" | null>(null);
  // Guards the post-sign-in effect so it fires only on the null→truthy
  // transition that happens while THIS modal is open — not on every
  // re-render where both `open` and `user` are truthy (e.g. StrictMode
  // double-mount or a re-open by an already-signed-in user).
  const openedWhileSignedOutRef = useRef(false);

  useEffect(() => {
    if (open && !user) {
      openedWhileSignedOutRef.current = true;
      return;
    }
    if (open && user && openedWhileSignedOutRef.current) {
      openedWhileSignedOutRef.current = false;
      onOpenChange(false);
      navigate("/settings");
      return;
    }
    if (!open) {
      openedWhileSignedOutRef.current = false;
    }
  }, [open, user, onOpenChange, navigate]);

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
                    className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors disabled:opacity-50"
                  >
                    <GoogleIcon />
                    {signingIn && pendingProviderRef.current === "google"
                      ? "Signing in..."
                      : "Sign in with Google"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSignIn("microsoft")}
                    disabled={signingIn}
                    className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors disabled:opacity-50"
                  >
                    <MicrosoftIcon />
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
