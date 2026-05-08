// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useAuth } from "@ui/providers/AuthProvider";
import { useStorage } from "@ui/providers/StorageProvider";
import { useSignInWithTosGate } from "@ui/hooks/useSignInWithTosGate";
import type { UseInvitationLandingResult } from "@ui/hooks/useInvitationLanding";
import { ConsentModal } from "./ConsentModal";
import { SignInButtons } from "./auth/SignInButtons";

/**
 * Banner shown when the user arrives via an `?invite=<token>` URL.
 *
 * `useInvitationLanding()` is called once in `Layout.tsx` (sole call site) and
 * its result is passed down as props — calling the hook here would create a
 * second state machine with its own listeners and dismiss state.
 *
 * States:
 *  - `pre_auth`: invite token captured, awaiting sign-in. Renders SignInButtons
 *    if Firebase is available and the user isn't already signed in. If signed
 *    in but the claim hasn't fired yet, shows "Signing you in…".
 *  - `claimed`: one or more invitations were just accepted. Lists the model
 *    names. If still in local mode (Lesson 28), shows a Settings hint instead
 *    of forcing a switch.
 *  - `idle`: returns null.
 */
type InvitationBannerProps = UseInvitationLandingResult;

export function InvitationBanner({
  state,
  claimedNames,
  dismiss,
}: InvitationBannerProps) {
  const { user, firebaseAvailable } = useAuth();
  const { mode } = useStorage();
  const tosGate = useSignInWithTosGate();

  if (state === "idle") return null;

  // pre_auth body: three exclusive sub-states broken out to avoid nested ternaries.
  const renderPreAuthBody = () => {
    if (!firebaseAvailable) {
      return (
        <p className="text-sm text-blue-700 dark:text-blue-300">
          Cloud sign-in is unavailable in this build.
        </p>
      );
    }
    if (user !== null) {
      return (
        <p className="text-sm text-blue-700 dark:text-blue-300">
          Signing you in…
        </p>
      );
    }
    return (
      <>
        {/* v0.42.3: card itself is max-w-lg (512px), so the inner max-w-md wrapper
            from Lesson 34 is now redundant — buttons fill the card naturally and
            stay readable. */}
        <SignInButtons
          fullLabel
          onGoogleClick={tosGate.handleGoogleClick}
          onMicrosoftClick={tosGate.handleMicrosoftClick}
        />
        <ConsentModal
          open={tosGate.consentOpen}
          onOpenChange={(open) => {
            if (!open) tosGate.handleCancel();
          }}
          onAccept={tosGate.handleAccept}
        />
      </>
    );
  };

  // v0.42.3 layout: centered card (max-w-lg = 512px) instead of full-width banner.
  // Gives the call-to-action visual focus, attaches the dismiss × to the card
  // semantically, and aligns horizontally with the rest of the centered page chrome.
  return (
    <div
      role="status"
      aria-live="polite"
      className="relative max-w-lg mx-auto mb-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-5 no-print"
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss invitation banner"
        className="absolute top-2 right-2 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 px-2 py-1 text-lg leading-none"
      >
        ×
      </button>

      {/* pr-6 reserves room for the absolutely-positioned dismiss button so long
          headings/subtitles don't collide with it. */}
      <div className="space-y-3 pr-6">
        {state === "pre_auth" && (
          <>
            <div className="space-y-1">
              <p className="text-base font-semibold text-blue-900 dark:text-blue-100">
                You&apos;ve been invited to a SPERT® Scheduler project.
              </p>
              {firebaseAvailable && user === null && (
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  Sign in to claim your invitation.
                </p>
              )}
            </div>
            {renderPreAuthBody()}
          </>
        )}

        {state === "claimed" && (
          <>
            <p className="text-base font-semibold text-blue-900 dark:text-blue-100">
              You now have access to: {claimedNames.join(", ")}
            </p>
            {mode === "local" && (
              <p className="text-sm text-blue-700 dark:text-blue-300">
                Switch to Cloud Storage in Settings to view this project.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
