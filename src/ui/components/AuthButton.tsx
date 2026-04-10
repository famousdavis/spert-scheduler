// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@ui/providers/AuthProvider";
import { useStorage } from "@ui/providers/StorageProvider";
import { StorageLoginModal } from "./StorageLoginModal";

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

export function AuthButton() {
  const { user, signOut } = useAuth();
  const { mode } = useStorage();
  const [modalOpen, setModalOpen] = useState(false);

  const isCloudSignedIn = mode === "cloud" && !!user;
  const firstName = user?.displayName
    ? user.displayName.includes(",")
      ? (user.displayName.split(",")[1]?.trim().split(" ")[0] ?? user.displayName.split(" ")[0] ?? "")
      : (user.displayName.split(" ")[0] ?? "")
    : (user?.email ?? "");
  const initial = firstName.charAt(0).toUpperCase();

  const containerRef = useRef<HTMLDivElement>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (!popoverOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (signingOut) return;
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setPopoverOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (signingOut) return;
      if (e.key === "Escape") setPopoverOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [popoverOpen, signingOut]);

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
      setPopoverOpen(false);
    } finally {
      setSigningOut(false);
    }
  };

  const pillClass =
    "flex items-center rounded-full bg-transparent p-0 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors";
  const pillStyle = { border: "0.5px solid #D1D5DB" };

  if (isCloudSignedIn) {
    return (
      <div ref={containerRef} className="relative">
        <button
          type="button"
          onClick={() => setPopoverOpen((o) => !o)}
          className={pillClass}
          style={pillStyle}
          aria-haspopup="dialog"
          aria-expanded={popoverOpen}
          aria-label={`Signed in as ${firstName}. Open account menu`}
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
          {/* Right segment: cloud icon (visual only) */}
          <span className="flex items-center justify-center px-2.5 py-1 rounded-r-full">
            <CloudIcon />
          </span>
        </button>

        {popoverOpen && (
          <div
            role="dialog"
            aria-label="Account menu"
            className="absolute right-0 top-full mt-1 z-20 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg p-3 min-w-[220px]"
          >
            <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
              {user?.displayName ?? firstName}
            </div>
            {user?.email && (
              <div className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                {user.email}
              </div>
            )}
            <div className="my-2 h-px bg-gray-200 dark:bg-gray-700" />
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="w-full text-left text-sm px-2 py-1.5 rounded text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className={pillClass}
        style={pillStyle}
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
      <StorageLoginModal open={modalOpen} onOpenChange={setModalOpen} />
    </>
  );
}
