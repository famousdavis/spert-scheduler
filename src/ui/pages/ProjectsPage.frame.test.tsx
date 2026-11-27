// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * FRAME26 stage 4 (v0.88.0): the Projects screen on the SPERT® Suite frame (contract §3 and §7).
 *
 * The heading row holds the h1 "Projects" and the toolbar's four buttons, each an `.sf-btn` (36 px, 14 px / 500).
 * Below it, the collection's ONE filter row, hooked `data-sf="filters"`: the search, and "Show archived" when a project
 * is archived. Then the tile grid, `.sf-tiles`, or, in its place, a panel hooked `data-sf="empty"` (since v0.89.0
 * the Welcome panel on a first visit, and one line when every project is archived), never both. frame-check measures the built page; this pins the structure it
 * reads.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, act, cleanup, within } from "@testing-library/react";
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

beforeEach(() => {
  localStorage.clear();
});

afterEach(cleanup);

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

const hook = (name: string) => document.querySelector(`[data-sf="${name}"]`);

describe("FRAME26: the Projects screen on the frame", () => {
  it("the heading row: the h1 'Projects' and the toolbar's four .sf-btn buttons, the hidden file input beside them", () => {
    renderDashboard([createProject("Heart of Gold", "2026-11-09")]);
    const row = hook("headrow")!;
    expect(row).toHaveClass("sf-headrow");
    expect(within(row as HTMLElement).getByRole("heading", { level: 1 })).toHaveTextContent(/^Projects$/);
    const toolbar = hook("toolbar")!;
    expect(toolbar.parentElement).toBe(row);
    const buttons = within(toolbar as HTMLElement).getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual(["Export All", "Import", "Load Sample", "New Project"]);
    for (const b of buttons) expect(b).toHaveClass("sf-btn");
    // The one other child is the hidden file input, which takes no place in the row.
    const others = [...toolbar.children].filter((c) => !buttons.includes(c as HTMLElement));
    expect(others.map((c) => [c.tagName, c.getAttribute("type"), c.getAttribute("class")])).toEqual([["INPUT", "file", "hidden"]]);
  });

  it("the search is the one filter row, below the heading row and outside it, then the tile grid", () => {
    renderDashboard([createProject("Heart of Gold", "2026-11-09")]);
    const filters = hook("filters")!;
    expect(filters).toHaveClass("sf-below");
    expect(hook("headrow")!.contains(filters)).toBe(false);
    expect(within(filters as HTMLElement).getByRole("textbox", { name: "Search projects" })).toBeInTheDocument();
    expect(document.querySelectorAll('[data-sf="filters"]')).toHaveLength(1);
    const tiles = hook("tiles")!;
    expect(tiles).toHaveClass("sf-tiles");
    // Document order: heading row, filter row, grid.
    expect(hook("headrow")!.compareDocumentPosition(filters) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(filters.compareDocumentPosition(tiles) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(tiles as HTMLElement).getByText(/Heart of Gold/)).toBeInTheDocument();
    expect(hook("empty")).toBeNull();
  });

  it("a first visit: the Welcome panel stands in for the grid, hooked, with no filter row and no grid", () => {
    renderDashboard([]);
    const empty = hook("empty")!;
    expect(empty).toHaveClass("sf-empty");
    expect(empty).toHaveTextContent(/^Welcome to SPERT® Scheduler/);
    expect(hook("tiles")).toBeNull();
    expect(hook("filters")).toBeNull();
  });

  it("every project archived: the filter row with Show archived, and the archived line in the grid's place", () => {
    renderDashboard([{ ...createProject("Heart of Gold", "2026-11-09"), archived: true }]);
    const filters = hook("filters")!;
    expect(within(filters as HTMLElement).getByRole("checkbox", { name: /Show archived/ })).toBeInTheDocument();
    expect(hook("empty")).toHaveTextContent('All projects are archived. Select "Show archived (1)" to see them.');
    expect(hook("tiles")).toBeNull();
  });
});
