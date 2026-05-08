// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useCallback, useRef, useState } from "react";
import { useAuth } from "@ui/providers/AuthProvider";
import { SIGN_IN_POPUP_BLOCKED } from "@ui/providers/auth-errors";
import { toast } from "@ui/hooks/use-notification-store";
import {
  TOS_VERSION,
  LS_TOS_ACCEPTED_VERSION,
  LS_TOS_WRITE_PENDING,
} from "@app/legal-constants";

/**
 * Encapsulates the consent-modal + sign-in flow used by every entry point that
 * can initiate a Google or Microsoft sign-in: `StorageLoginModal`,
 * `StorageModeSection`, and `InvitationBanner`. Pre-v0.42.0 each consumer
 * duplicated the same state machine — see Lesson 19.
 *
 * Flow:
 * 1. User clicks Google/Microsoft → `handleGoogleClick`/`handleMicrosoftClick`.
 *    - If localStorage has the current ToS version cached → set
 *      `LS_TOS_WRITE_PENDING=true` and call the provider sign-in directly.
 *    - Else → stash the chosen provider and open the consent modal.
 * 2. User accepts the consent modal → `handleAccept`.
 *    - Cache `LS_TOS_ACCEPTED_VERSION`, set `LS_TOS_WRITE_PENDING`, close
 *      modal, sign in with the stashed provider.
 * 3. User dismisses consent modal → `handleCancel`. Clears state.
 *
 * The `LS_TOS_WRITE_PENDING` flag is later consumed by `AuthProvider.tsx`'s
 * `onAuthStateChanged` callback: when set, it routes to `writeTosAcceptance`
 * (Branch A); when unset, it routes to `checkReturningUserTos` (Branch B).
 */
export interface UseSignInWithTosGateResult {
  consentOpen: boolean;
  handleGoogleClick: () => void;
  handleMicrosoftClick: () => void;
  handleAccept: () => void;
  handleCancel: () => void;
}

export function useSignInWithTosGate(): UseSignInWithTosGateResult {
  const { signInWithGoogle, signInWithMicrosoft } = useAuth();
  const [consentOpen, setConsentOpen] = useState(false);
  const pendingProviderRef = useRef<"google" | "microsoft" | null>(null);

  /** Proceed with Firebase Auth for the selected provider. */
  const doSignIn = useCallback(
    async (provider: "google" | "microsoft") => {
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
      }
    },
    [signInWithGoogle, signInWithMicrosoft]
  );

  /** Either fast-path through the cache, or open the consent modal. */
  const handleProviderClick = useCallback(
    (provider: "google" | "microsoft") => {
      const accepted = localStorage.getItem(LS_TOS_ACCEPTED_VERSION);
      if (accepted === TOS_VERSION) {
        // Fast path: ToS already accepted at this version. Set write-pending
        // (idempotent) so AuthProvider's Branch A still triggers the Firestore
        // backfill if the cache is current but the doc is missing.
        if (localStorage.getItem(LS_TOS_WRITE_PENDING) !== "true") {
          localStorage.setItem(LS_TOS_WRITE_PENDING, "true");
        }
        pendingProviderRef.current = provider;
        void doSignIn(provider);
      } else {
        pendingProviderRef.current = provider;
        setConsentOpen(true);
      }
    },
    [doSignIn]
  );

  const handleGoogleClick = useCallback(
    () => handleProviderClick("google"),
    [handleProviderClick]
  );
  const handleMicrosoftClick = useCallback(
    () => handleProviderClick("microsoft"),
    [handleProviderClick]
  );

  /** Consent accepted: cache version + set write-pending, then sign in. */
  const handleAccept = useCallback(() => {
    localStorage.setItem(LS_TOS_ACCEPTED_VERSION, TOS_VERSION);
    localStorage.setItem(LS_TOS_WRITE_PENDING, "true");
    setConsentOpen(false);
    if (pendingProviderRef.current) {
      void doSignIn(pendingProviderRef.current);
    }
  }, [doSignIn]);

  /** Consent dismissed: clear state without signing in. */
  const handleCancel = useCallback(() => {
    setConsentOpen(false);
    pendingProviderRef.current = null;
  }, []);

  return {
    consentOpen,
    handleGoogleClick,
    handleMicrosoftClick,
    handleAccept,
    handleCancel,
  };
}
