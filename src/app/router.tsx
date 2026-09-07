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
import { CalendarPage } from "@ui/pages/CalendarPage";
import { SettingsPage } from "@ui/pages/SettingsPage";
import { AboutPage } from "@ui/pages/AboutPage";
import { ChangelogPage } from "@ui/pages/ChangelogPage";
import { useConfirmStore } from "@ui/hooks/use-confirm-store";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <Navigate to="/projects" replace /> },
      { path: "projects", element: <ProjectsPage /> },
      { path: "project/:id", element: <ProjectPage /> },
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
