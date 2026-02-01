import {
  createBrowserRouter,
  Navigate,
} from "react-router-dom";
import { Layout } from "@ui/components/Layout";
import { ProjectsPage } from "@ui/pages/ProjectsPage";
import { ProjectPage } from "@ui/pages/ProjectPage";
import { CalendarPage } from "@ui/pages/CalendarPage";
import { AboutPage } from "@ui/pages/AboutPage";
import { ChangelogPage } from "@ui/pages/ChangelogPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <Navigate to="/projects" replace /> },
      { path: "projects", element: <ProjectsPage /> },
      { path: "project/:id", element: <ProjectPage /> },
      { path: "calendar", element: <CalendarPage /> },
      { path: "about", element: <AboutPage /> },
      { path: "changelog", element: <ChangelogPage /> },
    ],
  },
]);
