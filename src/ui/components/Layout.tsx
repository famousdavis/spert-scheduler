// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useEffect, useState, useCallback } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";
import { useTheme } from "@ui/hooks/use-theme";
import { ToastContainer } from "./ToastContainer";
import { useAnnouncerStore } from "@ui/hooks/use-announcer";
import { ConfirmHost } from "./ConfirmHost";
import { KeyboardShortcutsModal } from "./KeyboardShortcutsModal";
import { StorageLoginModal } from "./StorageLoginModal";
import { AppHeader } from "./AppHeader";
import { AppNav } from "./AppNav";
import { AppFooter } from "./AppFooter";
import { FirstRunBanner } from "./FirstRunBanner";
import { LocalStorageWarningBanner } from "./LocalStorageWarningBanner";
import { InvitationBanner } from "./InvitationBanner";
import { AiTeardownBanner } from "./AiTeardownBanner";
import { useCloudSync } from "@ui/hooks/use-cloud-sync";
import { useInvitationLanding } from "@ui/hooks/useInvitationLanding";
import { bodyCapped } from "@ui/helpers/active-nav";

/**
 * The SPERT® Suite app frame (FRAME26, contract `spert-suite-docs/suite/frame/FRAME-CONTRACT.md`, v0.88.0), around
 * every route's page: the skip link, the 56 px brand row, the 44 px navigation row, the app-wide notices, `main` in the
 * shared 1600 px column, and the 69 px footer. The geometry and colours are the vendored `src/styles/spert-frame.css`'s;
 * the elements carry its `data-sf` hooks, which the suite's live check, frame-check, reads.
 *
 * Settings, About and the changelog cap their body at 896 px (exception X4); their heading row stays full width. On a
 * project's page the navigation row sticks (X3, in `AppNav`).
 *
 * The notices slot is `no-print`: the print stylesheet reaches the report through `#root > * > main > *`, and the slot
 * is outside `main`. The slot hides itself when it holds no element (the stylesheet's `:not(:has(> *))`), so a banner
 * that returns `null` leaves no gap.
 */
export function Layout() {
  const { pathname } = useLocation();
  const loadPreferences = usePreferencesStore((s) => s.loadPreferences);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const announcement = useAnnouncerStore((s) => s.text);

  // Initialize theme (applies dark class to document)
  useTheme();

  // Initialize cloud sync (no-op when in local mode)
  useCloudSync();

  // Sole `useInvitationLanding()` call site — passed as props to InvitationBanner
  // and used here to gate FirstRunBanner / LocalStorageWarningBanner visibility
  // (mutual exclusion: invitation banner takes precedence).
  const invite = useInvitationLanding();

  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  // Global keyboard shortcut listener for '?' key
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't trigger if user is typing in an input or textarea
    const target = e.target as HTMLElement;
    if (
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable
    ) {
      return;
    }

    if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      setShortcutsOpen(true);
    }
  }, []);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="sf-app" data-sf="app">
      <a href="#main" className="sf-skip" data-sf="skip">Skip to main content</a>
      <AppHeader onOpenAuthModal={() => setAuthModalOpen(true)} />
      <AppNav />
      {/* App-wide notices, in the suite's order (contract §6): the invitation, then the other app-wide banner (a failed
          AI-session teardown), then the terms, then the caution. InvitationBanner takes precedence: while it shows,
          the terms and the caution stay hidden. */}
      <div className="sf-col sf-notices no-print" data-sf="notices">
        <InvitationBanner
          state={invite.state}
          claimedNames={invite.claimedNames}
          dismiss={invite.dismiss}
        />
        {/* B-04: shown regardless of invite state — a failed AI-session teardown is a
            security warning the user needs to see; self-hides when nothing is pending. */}
        <AiTeardownBanner />
        {invite.state === "idle" && <FirstRunBanner />}
        {invite.state === "idle" && <LocalStorageWarningBanner />}
      </div>
      <main
        id="main"
        className={bodyCapped(pathname) ? "sf-col sf-main sf-main--capped" : "sf-col sf-main"}
        data-sf="main"
      >
        <Outlet />
      </main>
      <AppFooter onOpenShortcuts={() => setShortcutsOpen(true)} />
      <ToastContainer />
      {/* The app's one polite announcement (v0.89.0, FRAME26 clean-up L): always mounted, outside every route, so a
          sentence set before a navigation (Load Sample's "Added “…” to your projects and opened it.") is still spoken
          on the next page. */}
      <div aria-live="polite" aria-atomic="true" className="sr-only" data-sample-status>
        {announcement}
      </div>
      <ConfirmHost />
      <KeyboardShortcutsModal
        open={shortcutsOpen}
        onOpenChange={setShortcutsOpen}
      />
      <StorageLoginModal
        open={authModalOpen}
        onOpenChange={setAuthModalOpen}
      />
    </div>
  );
}
