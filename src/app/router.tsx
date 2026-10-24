// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import {
  createBrowserRouter,
  Navigate,
} from "react-router-dom";
import { Layout } from "@ui/components/Layout";
import { ProjectsPage } from "@ui/pages/ProjectsPage";
import { ProjectPage } from "@ui/pages/ProjectPage";
import { ErrorBoundary } from "@ui/components/ErrorBoundary";
import { CalendarPage } from "@ui/pages/CalendarPage";
import { SettingsPage } from "@ui/pages/SettingsPage";
import { AboutPage } from "@ui/pages/AboutPage";
import { ChangelogPage } from "@ui/pages/ChangelogPage";
import { useConfirmStore } from "@ui/hooks/use-confirm-store";

// CI-4 (v0.79.x audit): a render error in one project (e.g. a cloud-supplied
// value that throws in a duration→date conversion) otherwise bubbles past the
// router to the app-level ErrorBoundary, taking down the whole app to a "refresh"
// screen. Scoping a boundary to the project route keeps the shell alive and lets
// the user return to their other projects. Rendered inside Layout's <Outlet/>, so
// it is not full-screen. Recovery is a full navigation (anchor), which remounts
// the boundary; switching projects via the URL while in the error state is the
// one case it does not auto-reset — acceptable for a crash fallback.
const projectErrorFallback = (
  <div className="mx-auto max-w-2xl p-8 text-center">
    <h1 className="text-xl font-bold text-red-600">
      This project couldn't be displayed
    </h1>
    <p className="mt-2 text-gray-600 dark:text-gray-300">
      Something in this project's data caused an error. Your other projects are
      unaffected.
    </p>
    <a
      href="/projects"
      className="mt-4 inline-block rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
    >
      Back to projects
    </a>
  </div>
);

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <Navigate to="/projects" replace /> },
      { path: "projects", element: <ProjectsPage /> },
      {
        path: "project/:id",
        element: (
          <ErrorBoundary fallback={projectErrorFallback}>
            <ProjectPage />
          </ErrorBoundary>
        ),
      },
      { path: "calendar", element: <CalendarPage /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "about", element: <AboutPage /> },
      { path: "changelog", element: <ChangelogPage /> },
    ],
  },
]);

// A question asked through `confirmDialog.ask(...)` is owned by the store, not by the page that
// asked it, so a route change would otherwise leave it on screen — orphaned, with its awaiting
// continuation still live. Browser Back is the reachable case, and a modal cannot block it.
// Settling here closes the dialog AND lets the caller take its cancel branch.
//
// A router subscription rather than a React effect, deliberately: this is not React state the
// Layout owns, and it must fire for every navigation regardless of which page is mounted.
// `subscribe` also fires for non-navigation state changes, hence the location-key guard.
let lastLocationKey = router.state.location.key;
router.subscribe((state) => {
  if (state.location.key === lastLocationKey) return;
  lastLocationKey = state.location.key;
  useConfirmStore.getState().dismissPending();
});
