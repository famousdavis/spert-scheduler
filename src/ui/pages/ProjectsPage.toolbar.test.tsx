// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * v0.86.1 — the Dashboard's toolbar, the SPERT® Suite's one: Export All · Import · Load Sample · New Project,
 * left to right, each with its icon, every button always rendered; and Import opening the file picker itself,
 * with the import's error, preview and result in a panel below the toolbar while the import is under way.
 *
 * Local storage, with the two provider mocks the other Dashboard tests use. The import's cloud gate — Import
 * greyed out with its note — is pinned with the real providers in the cloud-create-gate, cloud-sign-in-display
 * and invitation-refetch files; the one focus case that needs it is at the end of the invitation-refetch file.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, act, cleanup, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

vi.mock("@ui/providers/AuthProvider", () => ({
  useAuth: vi.fn(() => ({ user: null })),
}));
vi.mock("@ui/providers/StorageProvider", () => ({
  useStorage: vi.fn(() => ({ mode: "local", storageReady: true })),
}));

import { ProjectsPage } from "./ProjectsPage";
import { useProjectStore } from "@ui/hooks/use-project-store";
import { useNotificationStore } from "@ui/hooks/use-notification-store";
import { createProject } from "@app/api/project-service";
import { serializeExport } from "@app/api/export-import-service";
import type { Project } from "@domain/models/types";

/** GanttApp's `ICON_PATHS`, typed out here — not imported — so a change to ours fails this file. */
const GANTTAPP_ICON_PATHS = [
  "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
  "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12",
  "M9 3h6M10 3v6.5L4.6 18.8A1.5 1.5 0 0 0 5.9 21h12.2a1.5 1.5 0 0 0 1.3-2.2L14 9.5V3M7.2 15h9.6",
  "M12 5v14M5 12h14",
];

const ACCESSIBLE_NAMES = ["Export all active projects as JSON", "Import projects from JSON", "Load Sample", "New Project"];
const VISIBLE_LABELS = ["Export All", "Import", "Load Sample", "New Project"];

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useNotificationStore.setState({ notifications: [] });
});

function renderDashboard(projects: Project[] = []) {
  useProjectStore.setState({ projects: [], loadError: false, loadErrors: [] });
  const view = render(
    <MemoryRouter initialEntries={["/projects"]}>
      <Routes>
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/project/:id" element={<div>PROJECT PAGE STUB</div>} />
      </Routes>
    </MemoryRouter>
  );
  // After the page's own load on mount, which reads this browser's (empty) storage.
  act(() => {
    useProjectStore.setState({ projects });
  });
  return view;
}

/** The toolbar's four buttons: the buttons in the row that holds the page's heading. */
function toolbarButtons(): HTMLButtonElement[] {
  const row = screen.getByRole("heading", { level: 1, name: "Projects" }).parentElement;
  if (!row) throw new Error("no toolbar row");
  return within(row).getAllByRole("button") as HTMLButtonElement[];
}

const importButton = () => screen.getByRole("button", { name: "Import projects from JSON" });
const fileInput = () => screen.getByLabelText("Project import JSON file") as HTMLInputElement;

async function pickFile(projectName: string) {
  const file = new File([serializeExport([createProject(projectName, "2026-11-09")])], "probe.json", {
    type: "application/json",
  });
  fireEvent.change(fileInput(), { target: { files: [file] } });
  await screen.findByRole("button", { name: "Confirm Import" });
  // Where a user is before they act: the preview has taken the focus. React moves it there in an effect that runs
  // just after the preview is drawn, so a click sent before that effect would have React run it first, focusing the
  // heading the click is about to remove, and focus would end on <body> — no person clicks that fast, but a test
  // under load can (measured: a probe clicking Cancel in the microtask after the preview appeared left <body>).
  await waitFor(() => expect(screen.getByRole("heading", { name: "Review Import" })).toHaveFocus());
}

describe("v0.86.1: the Dashboard's toolbar", () => {
  it("shows Export All · Import · Load Sample · New Project, left to right, beside the Projects heading", () => {
    renderDashboard([createProject("Heart of Gold", "2026-11-09")]);

    const buttons = toolbarButtons();
    expect(buttons.map((b) => b.textContent)).toEqual(VISIBLE_LABELS);
    expect(buttons.map((b) => b.getAttribute("aria-label") ?? b.textContent)).toEqual(ACCESSIBLE_NAMES);
    buttons.forEach((b) => expect(b).toHaveAccessibleName(ACCESSIBLE_NAMES[buttons.indexOf(b)]));
    // Label in Name (WCAG 2.5.3): each accessible name begins with the words on the button.
    VISIBLE_LABELS.forEach((label, i) => expect(ACCESSIBLE_NAMES[i]?.toLowerCase().startsWith(label.toLowerCase())).toBe(true));
    // New Project is the filled primary button, on the far right; the other three are outlined.
    expect(buttons[3]?.className).toContain("bg-blue-600");
    buttons.slice(0, 3).forEach((b) => expect(b.className).toContain("border-gray-300"));
    // Not a role="toolbar": that role promises arrow-key navigation, which this row does not have.
    expect(screen.queryByRole("toolbar")).toBeNull();
  });

  it("draws GanttApp's four icons, 18 px, before each label, in the text colour and hidden from assistive tech", () => {
    renderDashboard([createProject("Heart of Gold", "2026-11-09")]);

    const buttons = toolbarButtons();
    buttons.forEach((b, i) => {
      const svgs = b.querySelectorAll("svg");
      expect(svgs).toHaveLength(1);
      const svg = svgs[0];
      if (!svg) throw new Error(`no icon on ${b.textContent}`);
      expect(b.firstElementChild).toBe(svg);
      expect(svg.getAttribute("aria-hidden")).toBe("true");
      expect(svg.getAttribute("width")).toBe("18");
      expect(svg.getAttribute("height")).toBe("18");
      const path = svg.querySelector("path");
      expect(path?.getAttribute("d")).toBe(GANTTAPP_ICON_PATHS[i]);
      expect(path?.getAttribute("stroke")).toBe("currentColor");
      expect(path?.getAttribute("stroke-width")).toBe("2.25");
    });
  });

  it("with no projects every button is still there, in the same order, and Export All is disabled, not hidden", () => {
    renderDashboard([]);

    const buttons = toolbarButtons();
    expect(buttons.map((b) => b.textContent)).toEqual(VISIBLE_LABELS);
    expect(buttons[0]).toBeDisabled();
    expect(buttons.slice(1).every((b) => !b.disabled)).toBe(true);
  });

  it("Export All keeps its gate: disabled while every project is archived, enabled with one active project", () => {
    const archived = { ...createProject("Old Ledger", "2026-11-09"), archived: true };
    renderDashboard([archived]);
    expect(toolbarButtons()[0]).toBeDisabled();

    act(() => {
      useProjectStore.setState({ projects: [archived, createProject("Heart of Gold", "2026-11-09")] });
    });
    expect(toolbarButtons()[0]).toBeEnabled();
  });

  it("has no Import Projects toggle and no Choose File: Import opens the file picker itself", () => {
    renderDashboard([]);
    const click = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});

    expect(screen.queryByRole("button", { name: "Import Projects" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Hide Import" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Choose File" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Import Projects" })).toBeNull();

    fireEvent.click(importButton());
    expect(click).toHaveBeenCalledTimes(1);
    expect(click.mock.contexts[0]).toBe(fileInput());
    expect(fileInput().accept).toBe(".json");
    // Clicking Import alone shows nothing: the panel waits for a file.
    expect(screen.queryByRole("heading", { name: "Import Projects" })).toBeNull();
  });
});

describe("v0.86.1: the Dashboard's import, below the toolbar", () => {
  it("a picked file opens the preview below the toolbar; Cancel closes it and focus goes back to Import", async () => {
    renderDashboard([]);
    await pickFile("Imported Probe");

    const panel = screen.getByRole("heading", { name: "Import Projects" }).closest("section");
    if (!panel) throw new Error("no import panel");
    expect(within(panel).getByRole("heading", { name: "Review Import" })).toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: "Choose File" })).toBeNull();
    // The toolbar comes first, then the panel.
    expect(importButton().compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(within(panel).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("heading", { name: "Import Projects" })).toBeNull();
    expect(document.activeElement).toBe(importButton());
    expect(useProjectStore.getState().projects).toEqual([]);
  });

  it("Escape in the preview closes it the same way, focus on Import", async () => {
    renderDashboard([]);
    await pickFile("Imported Probe");

    fireEvent.keyDown(screen.getByRole("heading", { name: "Review Import" }), { key: "Escape" });
    expect(screen.queryByRole("heading", { name: "Import Projects" })).toBeNull();
    expect(document.activeElement).toBe(importButton());
  });

  it("Confirm Import imports the project and says so; Import another file closes the panel, focus on Import, and Import picks again", async () => {
    renderDashboard([]);
    await pickFile("Imported Probe");

    fireEvent.click(screen.getByRole("button", { name: "Confirm Import" }));
    await screen.findByRole("button", { name: "Import another file" });
    await waitFor(() => expect(useProjectStore.getState().projects.map((p) => p.name)).toEqual(["Imported Probe"]));

    fireEvent.click(screen.getByRole("button", { name: "Import another file" }));
    expect(screen.queryByRole("heading", { name: "Import Projects" })).toBeNull();
    expect(document.activeElement).toBe(importButton());

    await pickFile("Second Probe");
    expect(screen.getByRole("heading", { name: "Review Import" })).toBeInTheDocument();
  });

  it("a file that is not an export shows its error in the panel; Try another file closes it, focus on Import", async () => {
    renderDashboard([]);
    fireEvent.change(fileInput(), {
      target: { files: [new File(["not json"], "broken.json", { type: "application/json" })] },
    });

    const alert = await screen.findByRole("alert");
    expect(alert.closest("section")).toBe(screen.getByRole("heading", { name: "Import Projects" }).closest("section"));
    fireEvent.click(within(alert).getByRole("button", { name: "Try another file" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.activeElement).toBe(importButton());
  });
});
