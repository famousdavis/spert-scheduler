// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * The October 26, 2026 editions of the Terms of Service and Privacy Policy.
 *
 * A returning user whose acceptance names the October 5 editions ("10-05-2026") must be asked to accept again:
 * the sign-in is ended, so the next sign-in goes through the consent modal. A user whose acceptance already names
 * the October 26 editions ("10-26-2026") must be let through. Both are checked twice — from this browser's cached
 * acceptance and from the acceptance on record — and a fresh acceptance must record the October 26 editions.
 *
 * The version strings are written out on purpose. Importing TOS_VERSION here would make every case pass whatever
 * the constant said.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReactNode } from "react";
import { renderHook, act } from "@testing-library/react";

const hoisted = vi.hoisted(() => {
  return {
    capturedCallback: null as ((user: unknown) => Promise<void>) | null,
    /** The tosVersion on the user's acceptance record, or null when there is no record. */
    onRecord: null as string | null,
  };
});

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: vi.fn((_auth: unknown, cb: typeof hoisted.capturedCallback) => {
    hoisted.capturedCallback = cb;
    return () => {
      hoisted.capturedCallback = null;
    };
  }),
  getRedirectResult: vi.fn().mockResolvedValue(null),
  signInWithPopup: vi.fn(),
  signInWithRedirect: vi.fn(),
  signOut: vi.fn().mockImplementation(async () => {
    queueMicrotask(() => {
      hoisted.capturedCallback?.(null).catch(() => {});
    });
  }),
  GoogleAuthProvider: class {},
  OAuthProvider: class {},
}));

vi.mock("firebase/firestore", () => ({
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join("/") })),
  getDoc: vi.fn(() =>
    Promise.resolve({
      exists: () => hoisted.onRecord !== null,
      data: () => ({ tosVersion: hoisted.onRecord }),
    }),
  ),
  setDoc: vi.fn().mockResolvedValue(undefined),
  serverTimestamp: vi.fn(() => "__ts__"),
}));

// A truthy db, so the returning-user check reads the acceptance on record.
vi.mock("@infrastructure/firebase/firebase", () => ({
  auth: { __mock: true },
  db: { __mock: true },
  isFirebaseAvailable: true,
  getClaimPendingInvitations: vi.fn(() => null),
}));

vi.mock("@infrastructure/persistence/sign-out-cleanup-registry", () => ({
  runSignOutCleanup: vi.fn().mockResolvedValue(undefined),
  registerSignOutCleanup: vi.fn(),
  clearSignOutCleanup: vi.fn(),
}));

vi.mock("@ui/hooks/use-notification-store", () => ({
  toast: { info: vi.fn(), error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

import { signOut as firebaseSignOut } from "firebase/auth";
import { setDoc } from "firebase/firestore";
import { AuthProvider, useAuth, _resetSignOutFlagsForTests } from "./AuthProvider";
import { LS_TOS_ACCEPTED_VERSION, LS_TOS_WRITE_PENDING } from "@app/legal-constants";

const OCTOBER_5 = "10-05-2026";
const OCTOBER_26 = "10-26-2026";

const user = {
  uid: "terms-uid",
  email: "u@example.com",
  displayName: "U",
  photoURL: null,
  emailVerified: true,
  providerData: [{ providerId: "google.com" }],
};

function captureAuth() {
  const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;
  return renderHook(() => useAuth(), { wrapper }).result;
}

async function signIn() {
  const auth = captureAuth();
  await act(async () => {
    await hoisted.capturedCallback?.(user);
    await Promise.resolve();
    await Promise.resolve();
  });
  return auth;
}

beforeEach(() => {
  localStorage.clear();
  hoisted.capturedCallback = null;
  hoisted.onRecord = null;
  _resetSignOutFlagsForTests();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("Terms and Privacy Policy 1.4 (October 26, 2026): who is asked to accept again", () => {
  it("a user whose cached acceptance and record name the October 5 editions is signed out, to accept again", async () => {
    localStorage.setItem(LS_TOS_ACCEPTED_VERSION, OCTOBER_5);
    hoisted.onRecord = OCTOBER_5;

    const auth = await signIn();

    expect(firebaseSignOut).toHaveBeenCalledTimes(1);
    expect(auth.current.user).toBeNull();
    expect(localStorage.getItem(LS_TOS_ACCEPTED_VERSION)).toBeNull();
  });

  it("a user with no cached acceptance whose record names the October 5 editions is signed out, to accept again", async () => {
    hoisted.onRecord = OCTOBER_5;

    const auth = await signIn();

    expect(firebaseSignOut).toHaveBeenCalledTimes(1);
    expect(auth.current.user).toBeNull();
  });

  it("a user whose cached acceptance names the October 26 editions is let through", async () => {
    localStorage.setItem(LS_TOS_ACCEPTED_VERSION, OCTOBER_26);
    hoisted.onRecord = OCTOBER_26;

    const auth = await signIn();

    expect(firebaseSignOut).not.toHaveBeenCalled();
    expect(auth.current.user?.uid).toBe(user.uid);
  });

  it("a user with no cached acceptance whose record names the October 26 editions is let through, and cached", async () => {
    hoisted.onRecord = OCTOBER_26;

    const auth = await signIn();

    expect(firebaseSignOut).not.toHaveBeenCalled();
    expect(auth.current.user?.uid).toBe(user.uid);
    expect(localStorage.getItem(LS_TOS_ACCEPTED_VERSION)).toBe(OCTOBER_26);
  });

  it("accepting over an October 5 record records the October 26 Terms and Privacy Policy", async () => {
    localStorage.setItem(LS_TOS_WRITE_PENDING, "true");
    hoisted.onRecord = OCTOBER_5;

    const auth = await signIn();

    expect(firebaseSignOut).not.toHaveBeenCalled();
    expect(auth.current.user?.uid).toBe(user.uid);
    const termsWrites = vi
      .mocked(setDoc)
      .mock.calls.filter(([ref]) => (ref as unknown as { path: string }).path === `users/${user.uid}`);
    expect(termsWrites).toHaveLength(1);
    expect(termsWrites[0]?.[1]).toMatchObject({ tosVersion: OCTOBER_26, privacyPolicyVersion: OCTOBER_26 });
    expect(localStorage.getItem(LS_TOS_ACCEPTED_VERSION)).toBe(OCTOBER_26);
  });
});
