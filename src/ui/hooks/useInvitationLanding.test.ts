// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { useAuth } from "@ui/providers/AuthProvider";
import { useStorage } from "@ui/providers/StorageProvider";
import { useProjectStore } from "./use-project-store";
import { INVITE_SESSION_KEY } from "@app/constants";

vi.mock("@ui/providers/AuthProvider", () => ({ useAuth: vi.fn() }));
vi.mock("@ui/providers/StorageProvider", () => ({ useStorage: vi.fn() }));

/**
 * At 0% coverage before charter §3.2. Classified Tier 2 as "both providers + Firebase
 * invitation types", which was right but incomplete — the real obstacle is a FIFTH
 * resistance category the survey did not have a name for:
 *
 *   MODULE-LOAD-TIME SIDE EFFECT. An IIFE at the top of the module reads
 *   `?invite=` from the URL, strips it via history.replaceState and stashes it in
 *   sessionStorage — all at import time, before React renders. That is a deliberate
 *   v0.42.2 fix (the router's index redirect fires its own effect deepest-first and had
 *   already replaced the URL by the time Layout's effect ran), so it is not a defect.
 *   But it means the capture cannot be re-triggered by re-rendering: each case needs
 *   `vi.resetModules()` and a fresh dynamic import with the URL set first.
 *
 * Distinct from the other four: one mock (abstraction working), six mocks (design),
 * cannot-be-mocked (boundary), un-injected import (nothing to fix). This one is
 * "the work happens before the test can get a handle on it".
 */

const switchMode = vi.fn();

/**
 * Load the module fresh, with `search` already in place so the IIFE sees it.
 *
 * ⚠️ Returns the project store from the SAME fresh graph. `vi.resetModules()` re-evaluates
 * real modules but keeps mocked ones, so the top-level `useProjectStore` import above is a
 * DIFFERENT store instance from the one the reloaded hook reads — seeding that one had no
 * effect and the "does NOT switch when local projects exist" case passed switchMode
 * through while appearing to test the guard. The mocked providers are unaffected, which is
 * why only this one collaborator needed re-importing.
 */
async function loadWithUrl(search: string) {
  window.history.replaceState(null, "", `/${search}`);
  vi.resetModules();
  const store = (await import("./use-project-store")).useProjectStore;
  const hook = (await import("./useInvitationLanding")).useInvitationLanding;
  return { hook, store };
}

const setAuth = (user: unknown, firebaseAvailable = true) =>
  vi.mocked(useAuth).mockReturnValue({
    user,
    firebaseAvailable,
  } as unknown as ReturnType<typeof useAuth>);

const emitModelsChanged = (claimed: { modelName: string }[]) =>
  act(() => {
    window.dispatchEvent(
      new CustomEvent("spert:models-changed", { detail: { claimed } }),
    );
  });

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  useProjectStore.setState({ projects: [] });
  setAuth(null);
  vi.mocked(useStorage).mockReturnValue({
    switchMode,
  } as unknown as ReturnType<typeof useStorage>);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useInvitationLanding", () => {
  describe("module-load URL capture", () => {
    it("stays idle and touches nothing when there is no invite token", async () => {
      const { hook } = await loadWithUrl("");
      const { result } = renderHook(() => hook());

      expect(result.current.state).toBe("idle");
      expect(sessionStorage.getItem(INVITE_SESSION_KEY)).toBeNull();
    });

    it("strips the token from the URL and stashes it before React renders", async () => {
      await loadWithUrl("?invite=tok-123");

      // Asserted BEFORE renderHook: the capture is the IIFE's, not an effect's.
      expect(sessionStorage.getItem(INVITE_SESSION_KEY)).toBe("tok-123");
      expect(window.location.search).toBe("");
    });

    it("enters pre_auth on mount when a token was captured", async () => {
      const { hook } = await loadWithUrl("?invite=tok-123");
      const { result } = renderHook(() => hook());
      expect(result.current.state).toBe("pre_auth");
    });

    it("preserves other query parameters while removing only `invite`", async () => {
      await loadWithUrl("?invite=tok-123&keep=yes");
      expect(window.location.search).toBe("?keep=yes");
      expect(sessionStorage.getItem(INVITE_SESSION_KEY)).toBe("tok-123");
    });
  });

  describe("auto-switch to cloud on arrival", () => {
    it("switches when Firebase is available and there are no local projects", async () => {
      const { hook } = await loadWithUrl("?invite=tok-123");
      renderHook(() => hook());
      expect(switchMode).toHaveBeenCalledWith("cloud");
    });

    it("does NOT switch when local projects exist", async () => {
      // Lesson 28 — never wipe local data on invite-link arrival. The user gets a
      // Settings hint instead, and this is the guard that makes that true.
      const { hook, store } = await loadWithUrl("?invite=tok-123");
      store.setState({ projects: [{ id: "p1", name: "P1", scenarios: [] }] as never });
      // Premise: the store the HOOK will read really is the one just seeded.
      expect(store.getState().projects).toHaveLength(1);

      renderHook(() => hook());
      expect(switchMode).not.toHaveBeenCalled();
    });

    it("does NOT switch when Firebase is unavailable", async () => {
      setAuth(null, false);
      const { hook } = await loadWithUrl("?invite=tok-123");
      renderHook(() => hook());
      expect(switchMode).not.toHaveBeenCalled();
    });

    it("does not switch at all without an invite token", async () => {
      const { hook } = await loadWithUrl("");
      renderHook(() => hook());
      expect(switchMode).not.toHaveBeenCalled();
    });
  });

  describe("claims listener", () => {
    it("moves to claimed, records the names, and consumes the session key", async () => {
      const { hook } = await loadWithUrl("?invite=tok-123");
      const { result } = renderHook(() => hook());

      emitModelsChanged([{ modelName: "Apollo" }, { modelName: "Gemini" }]);

      expect(result.current.state).toBe("claimed");
      expect(result.current.claimedNames).toEqual(["Apollo", "Gemini"]);
      // Consumed, so a reload cannot re-enter the flow from a stale key.
      expect(sessionStorage.getItem(INVITE_SESSION_KEY)).toBeNull();
    });

    it("ignores the event when no invite is in flight", async () => {
      // A normal sign-in by a user who happens to have pending invitations must not
      // flash the banner — the session key is what distinguishes the two.
      const { hook } = await loadWithUrl("");
      const { result } = renderHook(() => hook());

      emitModelsChanged([{ modelName: "Apollo" }]);

      expect(result.current.state).toBe("idle");
      expect(result.current.claimedNames).toEqual([]);
    });

    it("ignores an event that claims nothing", async () => {
      const { hook } = await loadWithUrl("?invite=tok-123");
      const { result } = renderHook(() => hook());

      emitModelsChanged([]);

      expect(result.current.state).toBe("pre_auth");
      // The key survives, because nothing was claimed yet.
      expect(sessionStorage.getItem(INVITE_SESSION_KEY)).toBe("tok-123");
    });

    it("removes the listener on unmount", async () => {
      const { hook } = await loadWithUrl("?invite=tok-123");
      const { result, unmount } = renderHook(() => hook());
      unmount();

      emitModelsChanged([{ modelName: "Apollo" }]);
      expect(result.current.state).toBe("pre_auth"); // last rendered value, unchanged
    });
  });

  describe("30-second grace timer", () => {
    it("falls back to idle and consumes the key when a signed-in claim never arrives", async () => {
      vi.useFakeTimers();
      setAuth({ uid: "u1" });
      const { hook } = await loadWithUrl("?invite=tok-123");
      const { result } = renderHook(() => hook());
      expect(result.current.state).toBe("pre_auth");

      act(() => { vi.advanceTimersByTime(30_000); });

      expect(result.current.state).toBe("idle");
      // Lesson 59: without this, a reload re-enters pre_auth from the stale key and the
      // banner loops.
      expect(sessionStorage.getItem(INVITE_SESSION_KEY)).toBeNull();
    });

    it("does not start the timer while the user is signed out", async () => {
      vi.useFakeTimers();
      setAuth(null);
      const { hook } = await loadWithUrl("?invite=tok-123");
      const { result } = renderHook(() => hook());

      act(() => { vi.advanceTimersByTime(60_000); });

      expect(result.current.state).toBe("pre_auth");
      expect(sessionStorage.getItem(INVITE_SESSION_KEY)).toBe("tok-123");
    });

    it("does not fire before the full 30 seconds", async () => {
      vi.useFakeTimers();
      setAuth({ uid: "u1" });
      const { hook } = await loadWithUrl("?invite=tok-123");
      const { result } = renderHook(() => hook());

      act(() => { vi.advanceTimersByTime(29_999); });
      expect(result.current.state).toBe("pre_auth");
    });
  });

  describe("dismiss", () => {
    it("returns to idle and consumes the session key", async () => {
      const { hook } = await loadWithUrl("?invite=tok-123");
      const { result } = renderHook(() => hook());

      act(() => result.current.dismiss());

      expect(result.current.state).toBe("idle");
      expect(sessionStorage.getItem(INVITE_SESSION_KEY)).toBeNull();
    });

    it("works from the claimed state too", async () => {
      const { hook } = await loadWithUrl("?invite=tok-123");
      const { result } = renderHook(() => hook());
      emitModelsChanged([{ modelName: "Apollo" }]);

      act(() => result.current.dismiss());
      expect(result.current.state).toBe("idle");
    });
  });
});
