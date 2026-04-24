// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useAuth } from "@ui/providers/AuthProvider";
import { useStorage } from "@ui/providers/StorageProvider";
import { getFirstName } from "@ui/helpers/format-user";

function CloudIcon() {
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
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="11" width="18" height="11" rx="2" stroke="#9CA3AF" strokeWidth="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" />
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
        <span style={{ fontSize: 13 }} className="text-gray-400">
          Local only
        </span>
      </span>
      {/* Vertical divider */}
      <span className="self-stretch" style={{ width: "0.5px", backgroundColor: "#D1D5DB" }} />
      {/* Right segment: "Sign in" (visual only) */}
      <span className="flex items-center justify-center px-2.5 py-1 rounded-r-full">
        <span style={{ fontSize: 12, fontWeight: 500, color: "#0070f3" }}>
          Sign in
        </span>
      </span>
    </button>
  );
}
