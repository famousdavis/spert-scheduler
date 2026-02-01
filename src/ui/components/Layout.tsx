import { useEffect } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { APP_VERSION } from "@app/constants";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";

const NAV_ITEMS = [
  { path: "/projects", label: "Projects" },
  { path: "/calendar", label: "Calendar" },
  { path: "/settings", label: "Settings" },
  { path: "/about", label: "About" },
];

export function Layout() {
  const location = useLocation();
  const loadPreferences = usePreferencesStore((s) => s.loadPreferences);

  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="sticky top-0 z-50 bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <Link to="/projects" className="text-lg font-bold text-gray-900">
              SPERT<span className="text-gray-300 text-xs align-super">®</span> Scheduler
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
                        ? "bg-blue-100 text-blue-700"
                        : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
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
      <footer className="mt-16 border-t-2 border-gray-100 pb-6 pt-8 text-center text-sm text-gray-500">
        &copy; 2026 William W. Davis, MSPM, PMP |{" "}
        <Link
          to="/changelog"
          className="text-blue-600 hover:text-blue-700"
        >
          Version {APP_VERSION}
        </Link>{" "}
        | Licensed under GNU GPL v3
      </footer>
    </div>
  );
}
