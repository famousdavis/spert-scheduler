// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * Auth error constants and classifiers for the Firebase sign-in flow.
 * Kept in a separate module from AuthProvider so the provider file stays
 * component-only (react-refresh/only-export-components).
 */

/** Stable error code thrown by signInWithGoogle/Microsoft when the browser
 *  blocked the sign-in popup. Callers catch it to tell the person to allow
 *  pop-ups (`POPUP_BLOCKED_MESSAGE`). Since v0.86.8 nothing navigates: the
 *  redirect fallback this code used to announce never completed (see
 *  `classifyPopupError`). */
export const SIGN_IN_POPUP_BLOCKED = "sign-in-popup-blocked";

/** What the person reads when the browser blocks the sign-in popup. The same
 *  words as SPERT® Forecaster v0.50.10 (owner's wording, 2026-11-14). */
export const POPUP_BLOCKED_MESSAGE =
  "Your browser blocked the sign-in window. Allow pop-ups for this site and try again.";

export type PopupErrorAction = "ignore" | "blocked" | "rethrow";

/**
 * Classifies a Firebase sign-in popup error into an action. Pure function.
 *   - "ignore": user closed the popup or double-clicked — silent no-op
 *   - "blocked": browser blocked the popup — ask the person to allow pop-ups
 *   - "rethrow": real failure — surface to the caller so the UI can toast
 *
 * v0.86.8: "blocked" used to be "redirect", which started `signInWithRedirect`.
 * That flow cannot finish in current browsers: the handler on the authDomain
 * (`spert-suite.firebaseapp.com`) stores the result in its own storage, and the
 * app reads it back through an iframe on that domain, which a cross-site page
 * gets with a partitioned, empty storage area. The person signed in at Google
 * and came back signed out, with no message (measured 2026-11-14).
 */
export function classifyPopupError(err: unknown): PopupErrorAction {
  const code = (err as { code?: string } | undefined)?.code;
  if (
    code === "auth/popup-closed-by-user" ||
    code === "auth/cancelled-popup-request"
  ) {
    return "ignore";
  }
  if (code === "auth/popup-blocked") {
    return "blocked";
  }
  return "rethrow";
}
