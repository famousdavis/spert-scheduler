// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * v0.86.8: a blocked sign-in popup tells the person to allow pop-ups, and the page stays put.
 *
 * Before, `AuthProvider` answered `auth/popup-blocked` with `signInWithRedirect` and a toast saying it was
 * redirecting. That redirect cannot finish in current browsers: the handler on the authDomain
 * (`spert-suite.firebaseapp.com`) keeps the result in its own storage, and the app reads it back through an
 * iframe on that domain, which a cross-site page gets with a partitioned, empty storage area. The person signed in
 * at Google and came back signed out, with no message (measured 2026-11-14, SPERT® Forecaster's FINDING).
 *
 * This runs the REAL sign-in path: `StorageLoginModal` → `useSignInWithTosGate` → `AuthProvider` →
 * `classifyPopupError`, the consent window, and the toast the person reads. Only the Firebase SDK
 * (`firebase/auth`) and the Firebase config are fakes, so a fallback put back in `AuthProvider` reaches the fake
 * `signInWithRedirect` (or the fake `getRedirectResult` on mount) and these cases fail.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";

const H = vi.hoisted(() => ({
  popup: vi.fn(),
  redirect: vi.fn(() => Promise.resolve()),
  redirectResult: vi.fn(() => Promise.resolve(null)),
  subscriptions: 0,
}));

vi.mock("firebase/auth", () => ({
  // As the SDK does at start-up with nobody signed in: the listener hears null once.
  onAuthStateChanged: (_auth: unknown, listener: (user: null) => Promise<void>) => {
    H.subscriptions += 1;
    queueMicrotask(() => {
      listener(null).catch(() => {});
    });
    return () => {};
  },
  signInWithPopup: H.popup,
  signInWithRedirect: H.redirect,
  getRedirectResult: H.redirectResult,
  signOut: () => Promise.resolve(),
  GoogleAuthProvider: class {},
  OAuthProvider: class {
    readonly providerId: string;
    constructor(id: string) {
      this.providerId = id;
    }
    setCustomParameters() {}
  },
}));

// Firebase configured, with no Firestore handle: nobody is signed in, so nothing here is reached.
vi.mock("@infrastructure/firebase/firebase", () => ({
  auth: {},
  db: null,
  isFirebaseAvailable: true,
  getClaimPendingInvitations: () => null,
  getSendInvitationEmail: () => null,
  getRevokeInvite: () => null,
  getResendInvite: () => null,
  getTeardownAiSession: () => null,
  getGeneratePairingCode: () => null,
}));

import { AuthProvider } from "@ui/providers/AuthProvider";
import { StorageProvider } from "@ui/providers/StorageProvider";
import { StorageLoginModal } from "./StorageLoginModal";
import { ToastContainer } from "./ToastContainer";
import { useNotificationStore } from "@ui/hooks/use-notification-store";
import { TOS_VERSION, LS_TOS_ACCEPTED_VERSION } from "@app/legal-constants";

/** The owner's wording (2026-11-14), the same as Forecaster v0.50.10. A literal, never the app's constant. */
const POPUP_BLOCKED = "Your browser blocked the sign-in window. Allow pop-ups for this site and try again.";
const BUTTON = {
  google: "Sign in with Google",
  microsoft: "Sign in with Microsoft work or school account",
} as const;

const authError = (code: string) => Object.assign(new Error(code), { code });

/** Let every pending promise chain finish: a macrotask runs only after all queued microtasks. */
const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

/** What the toasts say, in order. `hidden: true` because an open dialog marks the rest of the page aria-hidden. */
const toasts = () => screen.queryAllByRole("alert", { hidden: true }).map((t) => t.querySelector("p")?.textContent);

async function renderSignedOut() {
  render(
    <AuthProvider>
      <StorageProvider>
        <StorageLoginModal open onOpenChange={() => {}} />
        <ToastContainer />
      </StorageProvider>
    </AuthProvider>
  );
  await settle();
}

beforeEach(() => {
  H.popup.mockReset();
  H.redirect.mockClear();
  H.redirectResult.mockClear();
  H.subscriptions = 0;
  localStorage.clear();
  sessionStorage.clear();
  useNotificationStore.setState({ notifications: [] });
});
afterEach(() => cleanup());

describe("StorageLoginModal — popup errors (v0.86.8: no redirect fallback)", () => {
  it.each(["google", "microsoft"] as const)(
    "returning user, %s popup blocked: says to allow pop-ups and starts no redirect",
    async (provider) => {
      localStorage.setItem(LS_TOS_ACCEPTED_VERSION, TOS_VERSION);
      H.popup.mockRejectedValueOnce(authError("auth/popup-blocked"));
      await renderSignedOut();

      fireEvent.click(screen.getByRole("button", { name: BUTTON[provider] }));
      await settle();

      expect(H.popup).toHaveBeenCalledTimes(1);
      expect(H.redirect).not.toHaveBeenCalled();
      expect(toasts()).toEqual([POPUP_BLOCKED]);
    }
  );

  it("first sign-in, through the consent window, popup blocked: says to allow pop-ups and starts no redirect", async () => {
    H.popup.mockRejectedValueOnce(authError("auth/popup-blocked"));
    await renderSignedOut();

    fireEvent.click(screen.getByRole("button", { name: BUTTON.google }));
    // Premise: the consent window opened instead of a sign-in.
    expect(H.popup).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Enable Cloud Storage" }));
    await settle();

    expect(H.popup).toHaveBeenCalledTimes(1);
    expect(H.redirect).not.toHaveBeenCalled();
    expect(toasts()).toEqual([POPUP_BLOCKED]);
  });

  it("a second click cancels the pending first sign-in: the cancelled one is silent, one message, no redirect", async () => {
    localStorage.setItem(LS_TOS_ACCEPTED_VERSION, TOS_VERSION);
    H.popup
      .mockRejectedValueOnce(authError("auth/cancelled-popup-request"))
      .mockRejectedValueOnce(authError("auth/popup-blocked"));
    await renderSignedOut();
    // The SDK cancels a sign-in still pending when a second one starts. In a browser with pop-ups blocked, each
    // click fails before the next one lands, so a double-click there gives two blocked messages, not this (seen
    // 2026-11-14 on a build of v0.86.8); this case pins the cancellation path itself.
    const google = screen.getByRole("button", { name: BUTTON.google });

    fireEvent.click(google);
    fireEvent.click(google);
    await settle();

    expect(H.popup).toHaveBeenCalledTimes(2);
    expect(H.redirect).not.toHaveBeenCalled();
    expect(toasts()).toEqual([POPUP_BLOCKED]);
  });

  it.each(["auth/cancelled-popup-request", "auth/popup-closed-by-user"])(
    "%s stays silent and starts no redirect",
    async (code) => {
      localStorage.setItem(LS_TOS_ACCEPTED_VERSION, TOS_VERSION);
      H.popup.mockRejectedValueOnce(authError(code));
      await renderSignedOut();

      fireEvent.click(screen.getByRole("button", { name: BUTTON.google }));
      await settle();

      expect(H.popup).toHaveBeenCalledTimes(1);
      expect(H.redirect).not.toHaveBeenCalled();
      expect(toasts()).toEqual([]);
    }
  );

  it("opening the app asks for no redirect result (the SDK completes a pending one itself)", async () => {
    await renderSignedOut();

    // Premise: the provider's start-up effect ran — it subscribed to the auth state once.
    expect(H.subscriptions).toBe(1);
    expect(H.redirectResult).not.toHaveBeenCalled();
  });
});
