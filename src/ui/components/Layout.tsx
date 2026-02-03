import { useEffect, useState, useCallback } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { APP_VERSION } from "@app/constants";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";
import { useTheme } from "@ui/hooks/use-theme";
import { ToastContainer } from "./ToastContainer";
import { KeyboardShortcutsModal } from "./KeyboardShortcutsModal";

const NAV_ITEMS = [
  { path: "/projects", label: "Projects" },
  { path: "/calendar", label: "Calendar" },
  { path: "/settings", label: "Settings" },
  { path: "/about", label: "About" },
];

export function Layout() {
  const location = useLocation();
  const loadPreferences = usePreferencesStore((s) => s.loadPreferences);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // Initialize theme (applies dark class to document)
  useTheme();

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
      <header className="sticky top-0 z-50 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <Link to="/projects" className="text-lg font-bold text-gray-900 dark:text-gray-100">
              SPERT<span className="text-gray-300 dark:text-gray-600 text-xs align-super">®</span> Scheduler
            </Link>
            <nav className="flex gap-1">
              {NAV_ITEMS.map((item) => {
                const isActive = location.pathname.startsWith(item.path);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300"
                        : "text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full flex-1">
        <Outlet />
      </main>
      <footer className="mt-16 border-t-2 border-gray-100 dark:border-gray-800 pb-6 pt-8 text-center text-sm text-gray-500 dark:text-gray-400">
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
          className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          title="Keyboard shortcuts (?)"
        >
          Keyboard shortcuts
        </button>
      </footer>
      <ToastContainer />
      <KeyboardShortcutsModal
        open={shortcutsOpen}
        onOpenChange={setShortcutsOpen}
      />
    </div>
  );
}
