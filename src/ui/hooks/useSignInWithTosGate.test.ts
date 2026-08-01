// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

import { useSignInWithTosGate } from "./useSignInWithTosGate";
import { useAuth } from "@ui/providers/AuthProvider";
import { SIGN_IN_POPUP_BLOCKED } from "@ui/providers/auth-errors";
import { toast } from "@ui/hooks/use-notification-store";
import {
  TOS_VERSION,
  LS_TOS_ACCEPTED_VERSION,
  LS_TOS_WRITE_PENDING,
} from "@app/legal-constants";

// Only `useAuth` is needed, so the whole Firebase stack stays out of this file. Compare
// AuthProvider.test.tsx, which must mock firebase/auth, firebase/firestore AND the
// firebase module because it tests the provider itself.
vi.mock("@ui/providers/AuthProvider", () => ({ useAuth: vi.fn() }));
vi.mock("@ui/hooks/use-notification-store", () => ({
  toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

/**
 * At 0% coverage before charter §3.2, classified Tier 2 as "AuthProvider + notification
 * store". Accurate, and the remedy turned out to be cheap: the coupling is PROVIDER
 * INDIRECTION, which a single context mock removes. That is a different problem from
 * `use-storage-mode-switch`'s six collaborators, which no amount of mocking simplifies.
 *
 * The hook is the ToS gate every sign-in entry point shares. Two things make it worth
 * pinning: the localStorage protocol it writes is consumed by AuthProvider's
 * `onAuthStateChanged` to choose between Branch A and Branch B, so the flags ARE the
 * contract; and the fast path must still set write-pending, because a current cache with
 * a missing Firestore doc has to trigger the backfill.
 */

const signInWithGoogle = vi.fn();
const signInWithMicrosoft = vi.fn();

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  signInWithGoogle.mockResolvedValue(undefined);
  signInWithMicrosoft.mockResolvedValue(undefined);
  vi.mocked(useAuth).mockReturnValue({
    signInWithGoogle,
    signInWithMicrosoft,
  } as unknown as ReturnType<typeof useAuth>);
});

const setup = () => renderHook(() => useSignInWithTosGate());

describe("useSignInWithTosGate", () => {
  it("starts with the consent modal closed", () => {
    expect(setup().result.current.consentOpen).toBe(false);
  });

  describe("with no cached acceptance", () => {
    it("opens the consent modal instead of signing in", () => {
      const { result } = setup();
      act(() => result.current.handleGoogleClick());

      expect(result.current.consentOpen).toBe(true);
      expect(signInWithGoogle).not.toHaveBeenCalled();
      // Nothing is written until the user actually accepts.
      expect(localStorage.getItem(LS_TOS_WRITE_PENDING)).toBeNull();
      expect(localStorage.getItem(LS_TOS_ACCEPTED_VERSION)).toBeNull();
    });

    it("also gates the Microsoft entry point", () => {
      const { result } = setup();
      act(() => result.current.handleMicrosoftClick());
      expect(result.current.consentOpen).toBe(true);
      expect(signInWithMicrosoft).not.toHaveBeenCalled();
    });
  });

  describe("with a STALE cached acceptance", () => {
    it("gates again rather than trusting an old version", () => {
      // Premise: the cached value really is a different version from the current one.
      localStorage.setItem(LS_TOS_ACCEPTED_VERSION, "01-01-1999");
      expect(localStorage.getItem(LS_TOS_ACCEPTED_VERSION)).not.toBe(TOS_VERSION);

      const { result } = setup();
      act(() => result.current.handleGoogleClick());

      expect(result.current.consentOpen).toBe(true);
      expect(signInWithGoogle).not.toHaveBeenCalled();
    });
  });

  describe("with a CURRENT cached acceptance", () => {
    beforeEach(() => localStorage.setItem(LS_TOS_ACCEPTED_VERSION, TOS_VERSION));

    it("signs in directly without opening the modal", async () => {
      const { result } = setup();
      act(() => result.current.handleGoogleClick());

      expect(result.current.consentOpen).toBe(false);
      await waitFor(() => expect(signInWithGoogle).toHaveBeenCalledTimes(1));
    });

    it("STILL sets write-pending, so a missing Firestore doc gets backfilled", () => {
      // The fast path could plausibly skip this flag — it is the non-obvious part of the
      // protocol. Without it, AuthProvider takes Branch B and a user whose cache is
      // current but whose `users/{uid}` doc is missing never gets one written.
      const { result } = setup();
      act(() => result.current.handleGoogleClick());
      expect(localStorage.getItem(LS_TOS_WRITE_PENDING)).toBe("true");
    });

    it("routes Microsoft through the same fast path", async () => {
      const { result } = setup();
      act(() => result.current.handleMicrosoftClick());
      await waitFor(() => expect(signInWithMicrosoft).toHaveBeenCalledTimes(1));
      expect(signInWithGoogle).not.toHaveBeenCalled();
    });
  });

  describe("accepting the consent modal", () => {
    it("caches the version, sets write-pending, closes, and signs in", async () => {
      const { result } = setup();
      act(() => result.current.handleGoogleClick());
      act(() => result.current.handleAccept());

      expect(localStorage.getItem(LS_TOS_ACCEPTED_VERSION)).toBe(TOS_VERSION);
      expect(localStorage.getItem(LS_TOS_WRITE_PENDING)).toBe("true");
      expect(result.current.consentOpen).toBe(false);
      await waitFor(() => expect(signInWithGoogle).toHaveBeenCalledTimes(1));
    });

    it("signs in with the provider that was originally clicked", async () => {
      const { result } = setup();
      act(() => result.current.handleMicrosoftClick());
      act(() => result.current.handleAccept());

      await waitFor(() => expect(signInWithMicrosoft).toHaveBeenCalledTimes(1));
      expect(signInWithGoogle).not.toHaveBeenCalled();
    });

    it("does not sign in when accept arrives with no provider pending", () => {
      const { result } = setup();
      act(() => result.current.handleAccept());
      expect(signInWithGoogle).not.toHaveBeenCalled();
      expect(signInWithMicrosoft).not.toHaveBeenCalled();
    });
  });

  describe("cancelling the consent modal", () => {
    it("closes without signing in or writing anything", () => {
      const { result } = setup();
      act(() => result.current.handleGoogleClick());
      act(() => result.current.handleCancel());

      expect(result.current.consentOpen).toBe(false);
      expect(signInWithGoogle).not.toHaveBeenCalled();
      expect(localStorage.getItem(LS_TOS_ACCEPTED_VERSION)).toBeNull();
    });

    it("clears the pending provider, so a later bare accept does nothing", async () => {
      const { result } = setup();
      act(() => result.current.handleGoogleClick());
      act(() => result.current.handleCancel());
      act(() => result.current.handleAccept());

      // The version is cached by handleAccept regardless, but no sign-in fires.
      await waitFor(() => expect(result.current.consentOpen).toBe(false));
      expect(signInWithGoogle).not.toHaveBeenCalled();
    });
  });

  describe("sign-in failures", () => {
    it("explains a blocked popup rather than reporting a generic failure", async () => {
      signInWithGoogle.mockRejectedValue({ code: SIGN_IN_POPUP_BLOCKED });
      localStorage.setItem(LS_TOS_ACCEPTED_VERSION, TOS_VERSION);

      const { result } = setup();
      act(() => result.current.handleGoogleClick());

      await waitFor(() => expect(toast.info).toHaveBeenCalledTimes(1));
      expect(toast.error).not.toHaveBeenCalled();
    });

    it("reports any other error as a generic failure", async () => {
      signInWithGoogle.mockRejectedValue(new Error("network down"));
      localStorage.setItem(LS_TOS_ACCEPTED_VERSION, TOS_VERSION);

      const { result } = setup();
      act(() => result.current.handleGoogleClick());

      await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
      expect(toast.info).not.toHaveBeenCalled();
    });

    it("does not let a rejection escape as an unhandled error", async () => {
      signInWithGoogle.mockRejectedValue(new Error("network down"));
      localStorage.setItem(LS_TOS_ACCEPTED_VERSION, TOS_VERSION);

      const { result } = setup();
      expect(() => act(() => result.current.handleGoogleClick())).not.toThrow();
      await waitFor(() => expect(toast.error).toHaveBeenCalled());
    });
  });
});
