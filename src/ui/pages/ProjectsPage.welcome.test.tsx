// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act, cleanup, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

vi.mock("@ui/providers/AuthProvider", () => ({
  useAuth: vi.fn(() => ({ user: null })),
}));
vi.mock("@ui/providers/StorageProvider", () => ({
  useStorage: vi.fn(() => ({ mode: "local", storageReady: true })),
}));

import { ProjectsPage } from "./ProjectsPage";
import { useProjectStore } from "@ui/hooks/use-project-store";
import { createProject } from "@app/api/project-service";
import type { Project } from "@domain/models/types";

/**
 * v0.89.0 (FRAME26 clean-up W and A; contract §3 and §7, stylesheet v3). A collection that holds nothing shows the
 * Welcome panel, `.sf-empty`, in the tile grid's place; one whose every project is archived (Show archived off) shows
 * one line instead, because it is not empty; a search with no match keeps its own line. William approved the words
 * (2026-11-26).
 */
function renderDashboard(projects: Project[] = []) {
  useProjectStore.setState({ projects: [], loadError: false, loadErrors: [] });
  render(
    <MemoryRouter initialEntries={["/projects"]}>
      <Routes>
        <Route path="/projects" element={<ProjectsPage />} />
      </Routes>
    </MemoryRouter>,
  );
  act(() => {
    useProjectStore.setState({ projects });
  });
}
const empty = () => document.querySelector<HTMLElement>('[data-sf="empty"]');
const archived = (name: string): Project => ({ ...createProject(name, "2026-11-09"), archived: true });

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("the Welcome panel", () => {
  it("is the frame's .sf-empty, hooked, its title the brand's with the ® in .sf-mark", () => {
    renderDashboard();
    const panel = empty()!;
    expect(panel.className).toBe("sf-empty");
    const title = panel.querySelector("h2")!;
    expect(title.className).toBe("sf-empty-title");
    expect(title.innerHTML).toBe('Welcome to SPERT<span class="sf-mark">®</span> Scheduler');
  });

  it("holds the two lines, the two buttons and the note, in that order, in the frame's classes", () => {
    renderDashboard();
    const panel = empty()!;
    const kids = [...panel.children].map((k) => k.className);
    expect(kids).toEqual(["sf-empty-title", "sf-empty-text", "sf-empty-text", "sf-empty-actions", "sf-empty-note"]);
    const [line1, line2] = [...panel.querySelectorAll(".sf-empty-text")].map((p) => p.textContent!.replace(/\s+/g, " ").trim());
    expect(line1).toBe(
      "Estimate each activity with three points, then run a Monte Carlo simulation to see when your project is likely to finish and how much schedule buffer to hold.",
    );
    expect(line2).toBe(
      "Create a project to get started with probabilistic scheduling — or load the sample to explore a fully built schedule first.",
    );
    const buttons = within(panel.querySelector<HTMLElement>(".sf-empty-actions")!).getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual(["Create New Project", "Load Sample Project"]);
    for (const b of buttons) expect(b).toHaveClass("sf-btn");
    expect(buttons[0]).toHaveClass("bg-blue-600", "text-white");
    expect(buttons[1]).toHaveClass("border", "border-gray-300");
    expect(panel.querySelector(".sf-empty-note")!.textContent!.replace(/\s+/g, " ").trim()).toBe(
      "The sample project is a working example with 40 activities in eight sections, 68 dependencies and four milestones. You can explore it, edit it, or delete it at any time.",
    );
  });

  it("carries none of the old panel's own margin, padding or type classes", () => {
    renderDashboard();
    const html = empty()!.outerHTML;
    for (const old of ["sf-below", "text-center", "py-12", "text-lg", "mt-1", "mt-6", "No projects yet"]) {
      expect(html, old).not.toContain(old);
    }
  });

  it("Create New Project opens the New Project window, as the toolbar's New Project does", () => {
    renderDashboard();
    fireEvent.click(screen.getByRole("button", { name: "Create New Project" }));
    expect(screen.getByRole("dialog", { name: "New Project" })).toBeInTheDocument();
  });

  it("goes once a project exists", () => {
    renderDashboard([createProject("Heart of Gold", "2026-11-09")]);
    expect(empty()).toBeNull();
    expect(document.querySelector(".sf-empty")).toBeNull();
  });
});

describe("every project archived, Show archived off", () => {
  it("one line in the grid's place, hooked, 16 px below the filter row, in the page's muted text, not the Welcome panel", () => {
    renderDashboard([archived("Heart of Gold"), archived("Bistromath")]);
    const line = empty()!;
    expect(line.tagName).toBe("P");
    expect(line.textContent).toBe('All projects are archived. Select "Show archived (2)" to see them.');
    expect(line.className).toBe("sf-below text-gray-500 dark:text-gray-400");
    expect(document.querySelector(".sf-empty")).toBeNull();
    expect(document.querySelector('[data-sf="tiles"]')).toBeNull();
    const filters = document.querySelector('[data-sf="filters"]')!;
    expect(filters.nextElementSibling).toBe(line);
  });

  it("with Show archived on, the archived projects show and the line goes", () => {
    renderDashboard([archived("Heart of Gold")]);
    fireEvent.click(screen.getByRole("checkbox", { name: /Show archived/ }));
    expect(empty()).toBeNull();
    expect(document.querySelector('[data-sf="tiles"]')).not.toBeNull();
  });

  it("control: a search that matches nothing, with a project shown, keeps its own line", () => {
    renderDashboard([createProject("Heart of Gold", "2026-11-09"), archived("Bistromath")]);
    fireEvent.change(screen.getByRole("textbox", { name: "Search projects" }), { target: { value: "zzz" } });
    expect(empty()!.textContent).toBe("No matching projects.Try a different search term.");
  });
});
