// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useState, useRef, useEffect, useCallback } from "react";
import { useAuth } from "@ui/providers/AuthProvider";
import { ConsentModal } from "./ConsentModal";
import {
  TOS_VERSION,
  LS_TOS_ACCEPTED_VERSION,
  LS_TOS_WRITE_PENDING,
} from "@app/legal-constants";

export function AuthButton() {
  const { user, firebaseAvailable, signInWithGoogle, signInWithMicrosoft, signOut } =
    useAuth();
  const [showDropdown, setShowDropdown] = useState(false);
  const [showSignInMenu, setShowSignInMenu] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const pendingProviderRef = useRef<"google" | "microsoft" | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!firebaseAvailable) return;
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
        setShowSignInMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [firebaseAvailable]);

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
        // User cancelled popup or error — local ToS cache persists intentionally
        console.error("Sign-in error:", e);
      } finally {
        setSigningIn(false);
        setShowSignInMenu(false);
      }
    },
    [signInWithGoogle, signInWithMicrosoft]
  );

  /**
   * Entry point: user clicks "Sign in with Google" or "Sign in with Microsoft".
   * Check localStorage consent cache; show modal if not current version.
   */
  const handleSignIn = useCallback(
    (provider: "google" | "microsoft") => {
      const accepted = localStorage.getItem(LS_TOS_ACCEPTED_VERSION);
      if (accepted === TOS_VERSION) {
        // Already accepted current version — set write-pending in case prior
        // auth was cancelled before Firestore write completed
        if (localStorage.getItem(LS_TOS_WRITE_PENDING) !== "true") {
          localStorage.setItem(LS_TOS_WRITE_PENDING, "true");
        }
        doSignIn(provider);
      } else {
        // Need consent — show modal
        pendingProviderRef.current = provider;
        setShowSignInMenu(false);
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
    await signOut();
    setShowDropdown(false);
  }, [signOut]);

  // Don't render if Firebase not configured
  if (!firebaseAvailable) return null;

  // Signed out: show sign-in button
  if (!user) {
    return (
      <>
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setShowSignInMenu(!showSignInMenu)}
            disabled={signingIn}
            className="px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors disabled:opacity-50"
          >
            {signingIn ? "Signing in..." : "Sign In"}
          </button>

          {showSignInMenu && (
            <div className="absolute right-0 top-full mt-1 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 z-50">
              <button
                onClick={() => handleSignIn("google")}
                disabled={signingIn}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
              >
                Sign in with Google
              </button>
              <button
                onClick={() => handleSignIn("microsoft")}
                disabled={signingIn}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
              >
                Sign in with Microsoft
              </button>
            </div>
          )}
        </div>
        <ConsentModal
          open={consentOpen}
          onOpenChange={setConsentOpen}
          onAccept={handleConsentAccept}
        />
      </>
    );
  }

  // Signed in: show avatar/name with dropdown
  const initials = user.displayName
    ? user.displayName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "?";

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        title={user.email ?? undefined}
      >
        {user.photoURL ? (
          <img
            src={user.photoURL}
            alt=""
            className="w-6 h-6 rounded-full"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-medium">
            {initials}
          </span>
        )}
        <span className="text-sm text-gray-700 dark:text-gray-300 hidden sm:inline max-w-[120px] truncate">
          {user.displayName ?? user.email ?? "User"}
        </span>
      </button>

      {showDropdown && (
        <div className="absolute right-0 top-full mt-1 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 z-50">
          <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-700">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
              {user.displayName}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {user.email}
            </p>
          </div>
          <button
            onClick={handleSignOut}
            className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
