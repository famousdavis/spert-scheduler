// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { Fragment, useEffect, useState, useCallback } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { APP_VERSION } from "@app/constants";
import { TOS_URL, PRIVACY_URL, LICENSE_URL } from "@app/legal-constants";
import { AI_PRIVACY_URL } from "@app/ai-connectivity-constants";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";
import { useTheme } from "@ui/hooks/use-theme";
import { ToastContainer } from "./ToastContainer";
import { ConfirmHost } from "./ConfirmHost";
import { KeyboardShortcutsModal } from "./KeyboardShortcutsModal";
import { AuthButton } from "./AuthButton";
import { StorageLoginModal } from "./StorageLoginModal";
import { ThemeToggleButton } from "./ThemeToggleButton";
import { FirstRunBanner } from "./FirstRunBanner";
import { LocalStorageWarningBanner } from "./LocalStorageWarningBanner";
import { InvitationBanner } from "./InvitationBanner";
import { AiTeardownBanner } from "./AiTeardownBanner";
import { useCloudSync } from "@ui/hooks/use-cloud-sync";
import { useInvitationLanding } from "@ui/hooks/useInvitationLanding";
import { activeNavPath } from "@ui/helpers/active-nav";

const NAV_ITEMS = [
  { path: "/projects", label: "Projects" },
  { path: "/calendar", label: "Calendar" },
  { path: "/settings", label: "Settings" },
  { path: "/about", label: "About" },
];

/**
 * The header title's colour (HDR26, v0.87.2): Scheduler's favicon orange, `#f75b2b`, as a gradient from its light end
 * on the left to its dark end on the right, drawn once on each word ("SPERT", "Scheduler"). The ® between them keeps
 * its own colour. Each theme's ramp is checked at every point against the header behind it, at 4.5 : 1, because the
 * title is 18 px below 1,024 px and so is not large text: light `#cc4b24` → `#7c2000` on white, weakest 4.56; dark
 * `#ffc1af` → `#f26035` on `gray-800` (`#1e2939`), weakest 4.54. Both sit just above the bar on purpose; a change to
 * either end, or to the header's background, needs a new measurement (`Layout.title-gradient.test.ts`).
 *
 * Two fallbacks draw the title as solid text instead: under `prefers-contrast: more`, the title's own near-black in
 * light mode and near-white in dark mode; and in print, near-black. (Scheduler's print stylesheet hides the header,
 * so the print classes are kept only for consistency with the other SPERT® apps.) In the compiled CSS each fallback
 * comes after the class it overrides, at the same specificity, so it wins.
 *
 * ONE literal string, never assembled: Tailwind writes CSS only for class names it finds whole in the source, and
 * with `text-transparent` and no gradient the title is invisible. The space before "Scheduler" sits OUTSIDE the
 * gradient spans, as text of the wrapper: inside a span, jsdom's accessible-name computation trims it.
 */
const TITLE_GRADIENT =
  "bg-gradient-to-r from-[#cc4b24] to-[#7c2000] dark:from-[#ffc1af] dark:to-[#f26035] bg-clip-text text-transparent print:bg-none print:text-gray-900 contrast-more:bg-none contrast-more:text-gray-900 dark:contrast-more:text-gray-100";

/** This app's page in the SPERT® Suite Help Center. Defined once, here, beside its one link. */
const HELP_CENTER_URL = "https://spertsuite.com/help/scheduler";

/**
 * The header's Help Center link, immediately left of About. It is NOT in NAV_ITEMS: it leaves the app, so it never
 * takes the active pill and nothing about it reads the current route. It wears the inactive items' classes, except
 * that it is hidden below 1,024 px (`hidden lg:inline-flex`, William's ruling, 2026-11-16): v0.87.0 fitted the header
 * at 768 px with 3.3 px to spare, and this link adds 118 px. The
 * spaces sit between the spans, not inside them: the accessible-name computation trims a span's own text, and with
 * the spaces inside, the name reads "Help Center(opens in a new tab)".
 */
function HelpCenterLink() {
  return (
    <a
      href={HELP_CENTER_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="hidden lg:inline-flex items-center px-3 py-1.5 rounded text-sm font-medium transition-colors whitespace-nowrap cursor-pointer text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700"
    >
      Help Center{" "}<span aria-hidden="true">↗</span>{" "}<span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

export function Layout() {
  const location = useLocation();
  // At most one nav item is the current page, and inside a project it is Projects (SCH-1, v0.87.4).
  const activePath = activeNavPath(location.pathname);
  const loadPreferences = usePreferencesStore((s) => s.loadPreferences);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);

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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col transition-colors">
      <header className="sticky top-0 z-50 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 [overflow-anchor:none]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <Link to="/projects" className="inline-flex items-center text-lg lg:text-2xl font-bold text-gray-900 dark:text-gray-100 whitespace-nowrap cursor-pointer">
              <img
                src="/spert-favicon-scheduler.png"
                alt="SPERT® Scheduler icon"
                width={28}
                height={28}
                className="mr-2 h-7 w-7 rounded-lg ring-1 ring-white/20"
              />
              <span><span className={TITLE_GRADIENT}>SPERT</span><span className="text-gray-300 dark:text-gray-600 text-xs align-super">®</span>{" "}<span className={TITLE_GRADIENT}>Scheduler</span></span>
            </Link>
            <div className="flex items-center gap-1">
              <nav className="flex gap-1">
                {NAV_ITEMS.map((item) => {
                  const isActive = item.path === activePath;
                  return (
                    <Fragment key={item.path}>
                      {item.path === "/about" && <HelpCenterLink />}
                      <Link
                        to={item.path}
                        aria-current={isActive ? "page" : undefined}
                        className={`inline-flex items-center px-3 py-1.5 rounded text-sm font-medium transition-colors whitespace-nowrap cursor-pointer ${
                          isActive
                            ? "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300"
                            : "text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700"
                        }`}
                      >
                        {item.label}
                      </Link>
                    </Fragment>
                  );
                })}
              </nav>
              <ThemeToggleButton />
              <AuthButton onOpenModal={() => setAuthModalOpen(true)} />
            </div>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full flex-1">
        {/* InvitationBanner takes precedence — suppresses other banners while active. */}
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
        <Outlet />
      </main>
      <footer className="mt-16 border-t-2 border-gray-100 dark:border-gray-800 pb-6 pt-8 text-center text-sm text-gray-500 dark:text-gray-400">
        <div>
          &copy; 2026 William W. Davis, MSPM, PMP |{" "}
          <Link
            to="/changelog"
            className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
          >
            Version {APP_VERSION}
          </Link>{" "}
          | Licensed under GNU GPL v3 |{" "}
          <button
            onClick={() => setShortcutsOpen(true)}
            className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
            title="Keyboard shortcuts (?)"
          >
            Keyboard shortcuts
          </button>
        </div>
        <div className="mt-1">
          <a
            href="https://spertsuite.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
          >
            SPERT® Suite
          </a>
          {" | "}
          <a
            href={TOS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
          >
            Terms of Service
          </a>
          {" | "}
          <a
            href={PRIVACY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
          >
            Privacy Policy
          </a>
          {" | "}
          <a
            href={AI_PRIVACY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
          >
            AI Privacy Notice
          </a>
          {" | "}
          <a
            href={LICENSE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
          >
            License
          </a>
        </div>
      </footer>
      <ToastContainer />
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
