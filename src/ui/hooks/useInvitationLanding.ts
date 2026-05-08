// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useEffect, useState } from "react";
import { useAuth } from "@ui/providers/AuthProvider";
import { useStorage } from "@ui/providers/StorageProvider";
import { useProjectStore } from "@ui/hooks/use-project-store";
import { INVITE_SESSION_KEY } from "@app/constants";
import type { SpertModelsChangedDetail } from "@infrastructure/firebase/invitation-types";

/**
 * Drives the `?invite=<token>` landing flow:
 *
 *  - **Effect 1** (mount-only): captures the token from `window.location.search`,
 *    strips it from the URL via `history.replaceState`, stashes it in
 *    `sessionStorage[INVITE_SESSION_KEY]`, and transitions to `pre_auth`.
 *  - **Effect 2** ([state]): when entering `pre_auth`, auto-switches to cloud
 *    storage mode IFF Firebase is available AND there are zero local projects.
 *    Lesson 28: never wipe local data — if local projects exist, the user gets
 *    a Settings hint in the `claimed` banner instead.
 *  - **Effect 3** ([]): listens for `spert:models-changed`. Gated on the
 *    `INVITE_SESSION_KEY` so a normal sign-in by a user with pending invitations
 *    doesn't flash a banner — only post-invite-link arrivals trigger this state.
 *  - **Effect 4** ([state, user]): 30-second grace timer that auto-dismisses
 *    `pre_auth` if the user signs in but the claim never resolves. Gives the
 *    Cloud Function time to round-trip; covers the wrong-email case.
 *
 * Lifted to `Layout.tsx` (single call site) so the state machine is one
 * instance and `state` can gate the other banners' visibility — a per-banner
 * call would create two independent listeners and dismiss states.
 */
export interface UseInvitationLandingResult {
  state: "idle" | "pre_auth" | "claimed";
  claimedNames: string[];
  dismiss: () => void;
}

export function useInvitationLanding(): UseInvitationLandingResult {
  const { switchMode } = useStorage();
  const { user, firebaseAvailable } = useAuth();
  const [state, setState] = useState<"idle" | "pre_auth" | "claimed">("idle");
  const [claimedNames, setClaimedNames] = useState<string[]>([]);

  // Effect 1 — URL capture (mount-only). The token is stripped from the URL
  // BEFORE the firebaseAvailable check so it never persists in browser history,
  // even if Firebase is unavailable.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("invite");
    if (!token) return;
    params.delete("invite");
    const newSearch = params.toString();
    const newUrl =
      window.location.pathname +
      (newSearch ? `?${newSearch}` : "") +
      window.location.hash;
    window.history.replaceState(null, "", newUrl);
    sessionStorage.setItem(INVITE_SESSION_KEY, token);
    setState("pre_auth");
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Effect 2 — Auto-flip to cloud mode when entering pre_auth, but only if the
  // user has no local projects (Lesson 28: never wipe local data on invite-link
  // arrival). Imperative read — does NOT re-fire on subsequent project-count
  // changes by design.
  useEffect(() => {
    if (state !== "pre_auth") return;
    if (!firebaseAvailable) return;
    const localProjectCount = useProjectStore.getState().projects.length;
    if (localProjectCount > 0) return;
    switchMode("cloud");
  }, [state, firebaseAvailable, switchMode]);

  // Effect 3 — Claims listener. Gated on the SESSION_KEY so a normal sign-in
  // (not via invite link) won't flash the banner even if the user has pending
  // invitations on the backend. Registered once at mount; never re-registered.
  useEffect(() => {
    const handler = (e: Event) => {
      if (!sessionStorage.getItem(INVITE_SESSION_KEY)) return;
      const detail = (e as CustomEvent<SpertModelsChangedDetail>).detail;
      const names = detail.claimed.map((c) => c.modelName);
      if (names.length === 0) return;
      setState("claimed");
      setClaimedNames(names);
      sessionStorage.removeItem(INVITE_SESSION_KEY);
    };
    window.addEventListener("spert:models-changed", handler);
    return () => window.removeEventListener("spert:models-changed", handler);
  }, []);

  // Effect 4 — 30-second grace timer for the post-sign-in state where the
  // claim should arrive but didn't (wrong email, Microsoft personal account,
  // CF rate-limited, etc.). Falls back to idle so the banner doesn't get
  // stuck on a useless `pre_auth` view.
  useEffect(() => {
    if (state !== "pre_auth") return;
    if (user === null) return;
    const t = setTimeout(() => setState("idle"), 30_000);
    return () => clearTimeout(t);
  }, [state, user]);

  return {
    state,
    claimedNames,
    dismiss: () => setState("idle"),
  };
}
