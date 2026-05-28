// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

/**
 * Regression tests for the v0.47.2 sign-out wipe notification.
 *
 * The v0.42.6 (M4) hardening wipes the active UID localStorage namespace on
 * every sign-out path. Until v0.47.2 the wipe was completely silent. We now
 * fire a persistent (duration: 0) info toast when the sign-out was NOT
 * deliberate so the user understands why their project list is empty.
 *
 * Test matrix — the four observable transitions of `onAuthStateChanged`:
 *
 * TC-1 — Path 1 (user-initiated signOut): SignOutConfirmModal already
 *        explained the wipe → toast must NOT fire.
 * TC-2 — Path 3 (externally-revoked credentials): no app code initiated
 *        the sign-out → toast MUST fire with duration: 0 (persistent).
 * TC-3 — Initial page load with no auth session: nothing was cached and
 *        nothing to explain → toast must NOT fire.
 * TC-4 — Toast call uses duration: 0 (locks behavior against future
 *        "normalize all toast durations" refactors).
 *
 * Path 2 (ToS version mismatch) shares its toast classification with
 * Path 3 — both leave `expectedSignOut === false` so the null callback
 * branches identically. Driving the ToS branch end-to-end would require
 * mocking `getDoc` + a truthy `db` for a structurally identical outcome,
 * so we cover the classification logic via TC-2.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReactNode } from "react";
import { renderHook, act } from "@testing-library/react";

// vi.hoisted lets the mock factories below access the shared callback ref
// even though vi.mock() runs before the module body.
const hoisted = vi.hoisted(() => {
  return {
    capturedCallback: null as
      | ((user: { uid: string; emailVerified?: boolean } | null) => void)
      | null,
  };
});

// Mock firebase/auth so we can capture onAuthStateChanged's callback and
// drive it manually from each test.
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
    // Match real firebase: signOut() resolves THEN triggers
    // onAuthStateChanged(null) asynchronously. We fire it on a microtask
    // so the test's `await signOut()` returns before the callback runs.
    queueMicrotask(() => hoisted.capturedCallback?.(null));
  }),
  GoogleAuthProvider: class {},
  OAuthProvider: class {},
}));

// Mock firebase/firestore so the ToS-check, profile-write, and other
// Firestore-backed paths don't crash. We return shape-correct stubs so
// AuthProvider's call sites traverse without throwing.
vi.mock("firebase/firestore", () => ({
  doc: vi.fn(() => ({})),
  getDoc: vi.fn().mockResolvedValue({
    exists: () => false,
    data: () => ({}),
  }),
  setDoc: vi.fn().mockResolvedValue(undefined),
  serverTimestamp: vi.fn(() => "__ts__"),
}));

// Mock the firebase module so AuthProvider sees auth as truthy and db as
// null (no ToS Firestore check; checkReturningUserTos short-circuits to
// `return true`, so Path 2 does not fire — see test docblock).
vi.mock("@infrastructure/firebase/firebase", () => ({
  auth: { __mock: true },
  db: null,
  isFirebaseAvailable: true,
  getClaimPendingInvitations: vi.fn(() => null),
}));

// Mock the sign-out cleanup registry so we don't touch real state. The
// registry is a separate module from sign-out classification — its
// correctness is covered by sign-out-cleanup-registry.test.ts.
vi.mock("@infrastructure/persistence/sign-out-cleanup-registry", () => ({
  runSignOutCleanup: vi.fn().mockResolvedValue(undefined),
  registerSignOutCleanup: vi.fn(),
  clearSignOutCleanup: vi.fn(),
}));

// Spy on the toast module so we can assert against toast.info calls.
vi.mock("@ui/hooks/use-notification-store", () => ({
  toast: {
    info: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

import { AuthProvider, useAuth } from "./AuthProvider";
import { toast } from "@ui/hooks/use-notification-store";

const RECOVERY_MESSAGE =
  /Your session ended on this device, and locally-cached projects were removed/i;

const mockUser = {
  uid: "test-uid",
  email: "u@example.com",
  displayName: "U",
  photoURL: null,
  emailVerified: true,
} as unknown as { uid: string };

/** Helper: mount the AuthProvider and return a stable handle to its
 *  context value. Uses renderHook + a wrapper so the captured signOut
 *  always reflects the latest context value without violating the
 *  react-hooks/immutability rule. */
function captureAuth(): {
  current: ReturnType<typeof useAuth>;
} {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AuthProvider>{children}</AuthProvider>
  );
  const { result } = renderHook(() => useAuth(), { wrapper });
  return result;
}

beforeEach(() => {
  localStorage.clear();
  hoisted.capturedCallback = null;
  vi.mocked(toast.info).mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("AuthProvider — sign-out wipe notification (v0.47.2)", () => {
  // ─────────────────────────────────────────────────────────────────────
  // TC-1 — Path 1 (user clicked Sign Out): no toast (modal informed).
  // ─────────────────────────────────────────────────────────────────────
  it("TC-1: deliberate signOut does NOT fire the recovery toast", async () => {
    const auth = captureAuth();
    expect(hoisted.capturedCallback).not.toBeNull();

    // Simulate a successful sign-in: wasSignedIn := true
    await act(async () => {
      hoisted.capturedCallback?.(mockUser);
      await Promise.resolve();
      await Promise.resolve();
    });

    // User clicks Sign Out → expectedSignOut := true → firebaseSignOut →
    // queueMicrotask fires onAuthStateChanged(null).
    await act(async () => {
      await auth.current.signOut();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(toast.info).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────
  // TC-2 — Path 3 (Firebase silently revoked): toast w/ duration 0.
  // ─────────────────────────────────────────────────────────────────────
  it("TC-2: silent null transition AFTER a signed-in session fires a persistent toast", async () => {
    captureAuth();
    expect(hoisted.capturedCallback).not.toBeNull();

    // Sign in → wasSignedIn := true
    await act(async () => {
      hoisted.capturedCallback?.(mockUser);
      await Promise.resolve();
      await Promise.resolve();
    });

    // Firebase revokes the session — null callback fires without any app
    // code having set expectedSignOut.
    await act(async () => {
      hoisted.capturedCallback?.(null);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(toast.info).toHaveBeenCalledTimes(1);
    expect(toast.info).toHaveBeenCalledWith(
      expect.stringMatching(RECOVERY_MESSAGE),
      0, // ← TC-4 assertion folded in: persistent (no auto-dismiss).
    );
  });

  // ─────────────────────────────────────────────────────────────────────
  // TC-3 — Initial page load with no user: no toast.
  // ─────────────────────────────────────────────────────────────────────
  it("TC-3: initial page load with no auth session does NOT fire the toast", async () => {
    captureAuth();
    expect(hoisted.capturedCallback).not.toBeNull();

    // First and only callback: null. wasSignedIn was never set.
    await act(async () => {
      hoisted.capturedCallback?.(null);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(toast.info).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────
  // TC-4 — duration: 0 lock (asserted inline in TC-2; this test makes the
  //        contract explicit and survives any TC-2 rewrite).
  // ─────────────────────────────────────────────────────────────────────
  it("TC-4: recovery toast uses duration: 0 (persistent, locks against future timeout normalization)", async () => {
    captureAuth();

    await act(async () => {
      hoisted.capturedCallback?.(mockUser);
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      hoisted.capturedCallback?.(null);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(toast.info).toHaveBeenCalled();
    const [, duration] = vi.mocked(toast.info).mock.calls[0]!;
    expect(duration).toBe(0);
  });
});
