// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * ⚠️ THE Q#32 SENTINEL-ORDERING GUARD, RE-POINTED — NOT DELETED.
 *
 * This guard used to live in `firestore-driver.test.ts`, in a block named
 * "FirestoreDriver.doSave (serverTimestamp preservation)". Brief 19 (v0.64.9)
 * converged every project write on ISO 8601, so `doSave` no longer calls
 * `serverTimestamp()` at all and that block could not pass: its
 * `mockReturnValueOnce` never fired.
 *
 * ⚠️ DELETING IT WOULD HAVE REMOVED THE SUITE'S ONLY MECHANICAL GUARD ON A
 * PROPERTY THAT IS STILL LIVE. `writeUserProfiles` in AuthProvider.tsx still
 * writes `{ ...payload, updatedAt: serverTimestamp() }` to
 * `spertscheduler_profiles` and `spertsuite_profiles` — profile writes are
 * deliberately out of Brief 19's scope and keep the sentinel. So the property
 * moved; it did not go away. A change that deletes a working control is worse
 * than the red it was avoiding.
 *
 * THE PROPERTY: the sentinel must reach `setDoc` BY REFERENCE. The Firestore
 * client sentinel has an ENUMERABLE `_methodName` property, so
 * `Object.entries(sentinel)` yields `[["_methodName","serverTimestamp"]]` and
 * the recursive `sanitizeForFirestore` would rebuild it as the plain map
 * `{ _methodName: 'serverTimestamp' }` — the exact shape that leaked into
 * production `spertscheduler_projects` docs (Q#32). `writeUserProfiles`
 * sanitizes the payload FIRST and spreads the sentinel in afterwards, which is
 * what keeps it intact.
 *
 * Reference equality is the assertion precisely because a sanitized clone is
 * `toEqual`-identical to the original and only `toBe` can tell them apart.
 *
 * ⚠️ This file needs `db` TRUTHY — `writeUserProfiles` returns early otherwise —
 * which is why it is a separate file from AuthProvider.test.tsx, whose whole
 * matrix depends on `db: null`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { renderHook, act } from "@testing-library/react";

const hoisted = vi.hoisted(() => ({
  capturedCallback: null as
    | ((user: { uid: string; emailVerified?: boolean } | null) => void)
    | null,
  // The production sentinel shape: an object with an ENUMERABLE _methodName.
  // A bare symbol or empty object would be spared by the sanitizer for the
  // wrong reason and the guard would pass vacuously.
  sentinel: { _methodName: "serverTimestamp" } as Record<string, unknown>,
}));

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: vi.fn((_auth: unknown, cb: typeof hoisted.capturedCallback) => {
    hoisted.capturedCallback = cb;
    return () => { hoisted.capturedCallback = null; };
  }),
  getRedirectResult: vi.fn().mockResolvedValue(null),
  signInWithPopup: vi.fn(),
  signInWithRedirect: vi.fn(),
  signOut: vi.fn().mockResolvedValue(undefined),
  GoogleAuthProvider: class {},
  OAuthProvider: class {},
}));

const setDocSpy = vi.fn().mockResolvedValue(undefined);

vi.mock("firebase/firestore", () => ({
  doc: vi.fn((_db: unknown, col: string, id: string) => ({ col, id })),
  getDoc: vi.fn().mockResolvedValue({ exists: () => true, data: () => ({ tosVersion: "x" }) }),
  setDoc: (...a: unknown[]) => setDocSpy(...a),
  serverTimestamp: vi.fn(() => hoisted.sentinel),
}));

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

import { AuthProvider, useAuth, _resetSignOutFlagsForTests } from "./AuthProvider";

const wrapper = ({ children }: { children: ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

const user = {
  uid: "uid-q32",
  email: "q32@example.com",
  displayName: "Davis, William",
  photoURL: null,
  emailVerified: true,
};

async function signIn() {
  renderHook(() => useAuth(), { wrapper });
  await act(async () => {
    hoisted.capturedCallback?.(user);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  _resetSignOutFlagsForTests();
  setDocSpy.mockClear();
  hoisted.capturedCallback = null;
});

describe("writeUserProfiles — Q#32 serverTimestamp preservation (re-pointed guard)", () => {
  it("passes the sentinel to setDoc BY REFERENCE, not as a sanitized clone", async () => {
    await signIn();

    const profileCalls = setDocSpy.mock.calls.filter((c) => {
      const payload = c[1] as Record<string, unknown> | undefined;
      return !!payload && "updatedAt" in payload;
    });
    // Harness control: a guard whose subject was never invoked passes
    // vacuously, and this is exactly the failure mode that retired the
    // original block — its mockReturnValueOnce stopped firing.
    expect(profileCalls.length).toBeGreaterThan(0);

    for (const call of profileCalls) {
      const payload = call[1] as { updatedAt: unknown };
      // ⚠️ toBe, not toEqual. A sanitized clone is toEqual-identical.
      expect(payload.updatedAt).toBe(hoisted.sentinel);
    }
  });

  it("writes both profile collections, so neither loses the guard", async () => {
    await signIn();
    const cols = setDocSpy.mock.calls
      .map((c) => (c[0] as { col?: string } | undefined)?.col)
      .filter(Boolean);
    expect(cols).toContain("spertscheduler_profiles");
    expect(cols).toContain("spertsuite_profiles");
  });
});
