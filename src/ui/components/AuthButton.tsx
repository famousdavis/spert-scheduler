// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useAuth } from "@ui/providers/AuthProvider";
import { useStorage } from "@ui/providers/StorageProvider";
import { getFirstName } from "@ui/helpers/format-user";

function CloudIcon() {
  // Left at #0070f3 deliberately (v0.66.2). Measured 4.55 light / 3.22 dark.
  //
  // ⚠️ The claim being made is "MEETS the applicable threshold", not "no threshold
  // applies" — those are different declines and this one is the former. WCAG 1.4.11
  // (3:1, non-text) genuinely governs this glyph: in the signed-in chip the right
  // segment renders ONLY the icon, and the sole visible text is the user's name, which
  // says nothing about storage mode. So cloud-vs-lock is the only VISUAL carrier of
  // which mode you are in — a graphical object required to understand the content.
  // (The mode is also in the button's aria-label, but that serves assistive tech, not
  // the sighted user this criterion is about.)
  //
  // It passes at 3.22, but narrowly, on an indicator that is load-bearing — so this is
  // a pass to re-measure if the header surface ever changes, not a comfortable one.
  // Not themed alongside the "Sign in" accent because it meets its bar and the two
  // never render together (cloud = signed in; "Sign in" = signed out).
  //
  // Contrast with the segment divider below, which is the OTHER kind of decline:
  // decorative, so 1.4.11 does not govern it at all and its 1.47 is not a finding.
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"
        fill="#0070f3"
      />
    </svg>
  );
}

function LockIcon() {
  // `currentColor` + themed classes, not a fixed #9CA3AF: that grey measured 2.54 against
  // the light header, under the 3:1 bar for a glyph carrying state. The colour lives on the
  // svg rather than an ancestor because this icon renders in two different segments —
  // beside "Local only" when signed out, and alone on the right when signed in locally.
  return (
    <svg
      width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"
      className="text-gray-500 dark:text-gray-400"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

interface AuthButtonProps {
  onOpenModal: () => void;
}

export function AuthButton({ onOpenModal }: AuthButtonProps) {
  const { user } = useAuth();
  const { mode } = useStorage();

  const isCloudSignedIn = mode === "cloud" && !!user;
  const isSignedInLocal = !!user && mode !== "cloud";
  const firstName = getFirstName(user?.displayName, user?.email);
  const initial = firstName.charAt(0).toUpperCase();

  const pillClass =
    "flex items-center rounded-full bg-transparent p-0 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors";
  const pillStyle = { border: "0.5px solid #D1D5DB" };

  if (isCloudSignedIn || isSignedInLocal) {
    return (
      <button
        type="button"
        onClick={onOpenModal}
        className={pillClass}
        style={pillStyle}
        aria-haspopup="dialog"
        aria-label={
          isCloudSignedIn
            ? `Signed in as ${firstName} (cloud). Open storage menu`
            : `Signed in as ${firstName} (local only). Open storage menu`
        }
      >
        {/* Left segment: avatar + first name */}
        <span className="flex items-center gap-1.5 py-1 pl-1 pr-2.5">
          <span
            className="flex items-center justify-center rounded-full text-white shrink-0"
            style={{
              width: 26,
              height: 26,
              backgroundColor: "#0070f3",
              fontSize: 11,
              fontWeight: 500,
            }}
          >
            {initial}
          </span>
          <span style={{ fontSize: 13, fontWeight: 500 }} className="text-gray-900 dark:text-gray-100">
            {firstName}
          </span>
        </span>
        {/* Vertical divider */}
        <span className="self-stretch" style={{ width: "0.5px", backgroundColor: "#D1D5DB" }} />
        {/* Right segment: cloud or lock icon */}
        <span className="flex items-center justify-center px-2.5 py-1 rounded-r-full">
          {isCloudSignedIn ? <CloudIcon /> : <LockIcon />}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpenModal}
      className={pillClass}
      style={pillStyle}
      aria-haspopup="dialog"
      aria-label="Sign in to cloud storage"
    >
      {/* Left segment: lock icon + "Local only" */}
      <span className="flex items-center gap-1.5 py-1 pl-2.5 pr-2.5">
        <LockIcon />
        <span style={{ fontSize: 13 }} className="text-gray-500 dark:text-gray-400">
          Local only
        </span>
      </span>
      {/* Vertical divider */}
      <span className="self-stretch" style={{ width: "0.5px", backgroundColor: "#D1D5DB" }} />
      {/* Right segment: "Sign in" (visual only) */}
      <span className="flex items-center justify-center px-2.5 py-1 rounded-r-full">
        {/* Colour lives in styles.css: an inline style beats any Tailwind variant, so
            `dark:` could never have reached it. Light keeps #0070f3 unchanged (4.55, a
            pass this change must not spend); dark lightens to clear the 4.5 bar. */}
        <span style={{ fontSize: 12, fontWeight: 500 }} className="auth-signin-accent">
          Sign in
        </span>
      </span>
    </button>
  );
}
