// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { GoogleIcon, MicrosoftIcon } from "./AuthProviderLogos";

interface SignInButtonsProps {
  /** When true, render full "Sign in with Google/Microsoft" labels. */
  fullLabel?: boolean;
  onGoogleClick: () => void;
  onMicrosoftClick: () => void;
  disabled?: boolean;
}

/**
 * Shared Google + Microsoft sign-in button pair. Used in `StorageLoginModal`,
 * `StorageModeSection`, and `InvitationBanner`. Click handlers are passed in
 * (typically wired to `useSignInWithTosGate()`).
 *
 * `fullLabel` controls the verbosity of the button text — long labels read
 * naturally inside a wide modal, but feel cramped inside an in-page banner.
 * Match the existing styles from the pre-v0.42.0 inline `SignInButtons` so the
 * visual diff is zero in flag-off mode.
 */
export function SignInButtons({
  fullLabel = false,
  onGoogleClick,
  onMicrosoftClick,
  disabled = false,
}: SignInButtonsProps) {
  const googleLabel = fullLabel ? "Sign in with Google" : "Google";
  const microsoftLabel = fullLabel ? "Sign in with Microsoft" : "Microsoft";
  return (
    <div className="flex flex-wrap gap-3">
      <button
        type="button"
        onClick={onGoogleClick}
        disabled={disabled}
        aria-label="Sign in with Google"
        className="flex flex-1 min-w-[160px] items-center justify-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <GoogleIcon />
        {googleLabel}
      </button>
      <button
        type="button"
        onClick={onMicrosoftClick}
        disabled={disabled}
        aria-label="Sign in with Microsoft"
        className="flex flex-1 min-w-[160px] items-center justify-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <MicrosoftIcon />
        {microsoftLabel}
      </button>
    </div>
  );
}
