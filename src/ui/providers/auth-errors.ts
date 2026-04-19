// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

/**
 * Auth error constants and classifiers for the Firebase sign-in flow.
 * Kept in a separate module from AuthProvider so the provider file stays
 * component-only (react-refresh/only-export-components).
 */

/** Stable error code thrown by signInWithGoogle/Microsoft when the popup
 *  was blocked and a redirect fallback has been initiated. Callers should
 *  catch this to surface a toast while the redirect navigates the page. */
export const SIGN_IN_POPUP_BLOCKED = "sign-in-popup-blocked";

export type PopupErrorAction = "ignore" | "redirect" | "rethrow";

/**
 * Classifies a Firebase sign-in popup error into an action. Pure function.
 *   - "ignore": user closed the popup or double-clicked — silent no-op
 *   - "redirect": browser blocked the popup — fall back to signInWithRedirect
 *   - "rethrow": real failure — surface to the caller so the UI can toast
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
    return "redirect";
  }
  return "rethrow";
}
