// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within, cleanup, act } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useParams } from "react-router-dom";

// Same two provider mocks as ProjectsPage.test.tsx: these tests are about the tile, in local mode.
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
import { LocalStorageRepository } from "@infrastructure/persistence/local-storage-repository";
import type { Project } from "@domain/models/types";

/**
 * WI-110: deleting a project from its Dashboard tile left the Dashboard for the deleted project's
 * page, which said "This project is no longer available."
 *
 * The tile's confirmation is a Radix dialog in a PORTAL, declared inside the tile. React bubbles a
 * portal's events up the COMPONENT tree, so a click anywhere in the dialog also reached the tile's
 * own click, which opens the project. Measured in Chromium 153 at b45f981, with real presses: Delete,
 * Cancel and the dialog's own text, by mouse, Enter and Space — eight paths, all of them opening a
 * project. These tests drive the real page, the real tile and the real dialog.
 *
 * ⚠️ jsdom has no activation behaviour for keys: Enter or Space on a focused button does not click
 * it. `pressEnter` and `pressSpace` dispatch what Chromium dispatches at the focused button — the key
 * events and a click with `detail: 0` — and every keyboard test first asserts WHERE focus is, so the
 * click goes where the key would have gone.
 */

const repo = new LocalStorageRepository();

/** Projects stored the way the app stores them, so the page's own load on mount finds them. */
function seed(...names: string[]): Project[] {
  return names.map((name) => {
    const project = createProject(name, "2026-10-05");
    repo.save(project);
    return project;
  });
}

function OpenedProject() {
  const { id } = useParams();
  return <p>Opened project {id}</p>;
}

function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={["/projects"]}>
      <Routes>
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/project/:id" element={<OpenedProject />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** The tile holding a project's name: the nearest ancestor of its name that also holds a trash. */
function tileOf(name: string): HTMLElement {
  let node: HTMLElement | null = screen.getByRole("button", { name });
  while (node && !within(node).queryByRole("button", { name: "Delete project" })) {
    node = node.parentElement;
  }
  if (!node) throw new Error(`no tile holds "${name}"`);
  return node;
}

const trashOf = (name: string) => within(tileOf(name)).getByRole("button", { name: "Delete project" });

function pressEnter(el: Element) {
  fireEvent.keyDown(el, { key: "Enter", code: "Enter" });
  fireEvent.click(el, { detail: 0 });
  fireEvent.keyUp(el, { key: "Enter", code: "Enter" });
}

function pressSpace(el: Element) {
  fireEvent.keyDown(el, { key: " ", code: "Space" });
  fireEvent.keyUp(el, { key: " ", code: "Space" });
  fireEvent.click(el, { detail: 0 });
}

/** Opens a tile's confirmation from the keyboard and returns it, focus on Cancel as it opens. */
async function openByKeyboard(name: string): Promise<HTMLElement> {
  const trash = trashOf(name);
  trash.focus();
  expect(document.activeElement).toBe(trash);
  pressEnter(trash);
  const dialog = await screen.findByRole("dialog");
  await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Cancel" })));
  return dialog;
}

function expectStillOnDashboard() {
  expect(screen.queryByText(/^Opened project/)).toBeNull();
  // `hidden: true` because an open modal dialog marks the rest of the page aria-hidden.
  expect(screen.getByRole("heading", { name: "Projects", hidden: true })).toBeTruthy();
}

const storedNames = () => useProjectStore.getState().projects.map((p) => p.name);

/**
 * Lets every focus move after a Delete run: the page's own (a microtask) AND Radix's restore to the
 * trash (a 0 ms timeout, a no-op on the detached trash). Asserting only inside `waitFor` could pass
 * between the two and miss a restore that moved focus away again.
 */
async function settleFocus() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}

/** Deletes a tile by mouse: its trash, then the confirmation's Delete. */
async function deleteByMouse(name: string) {
  fireEvent.click(trashOf(name));
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
}

beforeEach(() => {
  localStorage.clear();
  useProjectStore.setState({ projects: [], loadError: false, loadErrors: [] });
});

afterEach(() => {
  cleanup();
  useNotificationStore.setState({ notifications: [] });
});

describe("WI-110: a tile's delete confirmation keeps the Dashboard on screen", () => {
  it("Delete removes the tile and the Dashboard stays", async () => {
    seed("Arthur Dent Survey", "Zaphod Ledger");
    renderDashboard();

    fireEvent.click(trashOf("Arthur Dent Survey"));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    expectStillOnDashboard();
    expect(screen.queryByRole("button", { name: "Arthur Dent Survey" })).toBeNull();
    expect(screen.getByRole("button", { name: "Zaphod Ledger" })).toBeTruthy();
    expect(storedNames()).toEqual(["Zaphod Ledger"]);
  });

  it("Cancel closes the confirmation and the Dashboard stays, the tile with it", async () => {
    seed("Arthur Dent Survey", "Zaphod Ledger");
    renderDashboard();

    fireEvent.click(trashOf("Arthur Dent Survey"));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    expectStillOnDashboard();
    expect(screen.getByRole("button", { name: "Arthur Dent Survey" })).toBeTruthy();
    expect(storedNames()).toEqual(["Arthur Dent Survey", "Zaphod Ledger"]);
  });

  it("a click on the confirmation's own text opens nothing, and the confirmation stays open", async () => {
    seed("Arthur Dent Survey");
    renderDashboard();

    fireEvent.click(trashOf("Arthur Dent Survey"));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByText("Delete project?"));

    expectStillOnDashboard();
    expect(screen.getByRole("dialog")).toBe(dialog);
  });

  it("Enter on Delete removes the tile, the Dashboard stays, and focus moves to the tile that takes its place", async () => {
    seed("Arthur Dent Survey", "Zaphod Ledger");
    renderDashboard();

    const dialog = await openByKeyboard("Arthur Dent Survey");
    const del = within(dialog).getByRole("button", { name: "Delete" });
    del.focus(); // Tab, which jsdom does not move focus for
    expect(document.activeElement).toBe(del);
    pressEnter(del);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    expectStillOnDashboard();
    expect(screen.queryByRole("button", { name: "Arthur Dent Survey" })).toBeNull();
    expect(storedNames()).toEqual(["Zaphod Ledger"]);
    // The trash that opened the confirmation went with its tile; without a destination, <body>.
    await settleFocus();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Zaphod Ledger" }));
  });

  it("Space on Delete removes the tile and the Dashboard stays", async () => {
    seed("Arthur Dent Survey", "Zaphod Ledger");
    renderDashboard();

    const dialog = await openByKeyboard("Arthur Dent Survey");
    const del = within(dialog).getByRole("button", { name: "Delete" });
    del.focus();
    expect(document.activeElement).toBe(del);
    pressSpace(del);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    expectStillOnDashboard();
    expect(screen.queryByRole("button", { name: "Arthur Dent Survey" })).toBeNull();
    expect(storedNames()).toEqual(["Zaphod Ledger"]);
  });

  it("Enter on Cancel, where the confirmation opens, keeps the Dashboard and the tile, and focus returns to the trash", async () => {
    seed("Arthur Dent Survey", "Zaphod Ledger");
    renderDashboard();

    await openByKeyboard("Arthur Dent Survey");
    const cancel = document.activeElement;
    if (!cancel) throw new Error("nothing is focused");
    pressEnter(cancel);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    expectStillOnDashboard();
    expect(storedNames()).toEqual(["Arthur Dent Survey", "Zaphod Ledger"]);
    await waitFor(() => expect(document.activeElement).toBe(trashOf("Arthur Dent Survey")));
  });

  // Where focus goes after a Delete (owner, R447): the tile that takes the deleted tile's place — the
  // next in display order — else the tile before it, else the New Project button at the top. A tile
  // takes focus on its name, its keyboard open control.
  it("after a Delete, focus moves to the next tile — the one that takes the deleted tile's place", async () => {
    seed("Arthur Dent Survey", "Ford Prefect Notes", "Zaphod Ledger");
    renderDashboard();

    await deleteByMouse("Ford Prefect Notes");

    expectStillOnDashboard();
    expect(storedNames()).toEqual(["Arthur Dent Survey", "Zaphod Ledger"]);
    await settleFocus();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Zaphod Ledger" }));
  });

  it("when the last tile is deleted, focus moves to the tile before it", async () => {
    seed("Arthur Dent Survey", "Ford Prefect Notes", "Zaphod Ledger");
    renderDashboard();

    await deleteByMouse("Zaphod Ledger");

    expectStillOnDashboard();
    expect(storedNames()).toEqual(["Arthur Dent Survey", "Ford Prefect Notes"]);
    await settleFocus();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Ford Prefect Notes" }));
  });

  it("when no tile is left, focus moves to the New Project button at the top", async () => {
    seed("Arthur Dent Survey");
    renderDashboard();

    const dialog = await openByKeyboard("Arthur Dent Survey");
    const del = within(dialog).getByRole("button", { name: "Delete" });
    del.focus();
    expect(document.activeElement).toBe(del);
    pressEnter(del);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    expectStillOnDashboard();
    expect(storedNames()).toEqual([]);
    await settleFocus();
    // The header's New Project, and the empty Dashboard's own below it: focus is on the FIRST.
    const newProjectButtons = screen.getAllByRole("button", { name: "New Project" });
    expect(newProjectButtons).toHaveLength(2);
    expect(document.activeElement).toBe(newProjectButtons[0]);
  });

  it("control: the tile's own name, and the tile itself, still open the project", () => {
    const [arthur] = seed("Arthur Dent Survey");
    if (!arthur) throw new Error("seed returned nothing");

    renderDashboard();
    fireEvent.click(screen.getByRole("button", { name: "Arthur Dent Survey" }));
    expect(screen.getByText(`Opened project ${arthur.id}`)).toBeTruthy();
    cleanup();

    renderDashboard();
    fireEvent.click(tileOf("Arthur Dent Survey"));
    expect(screen.getByText(`Opened project ${arthur.id}`)).toBeTruthy();
  });
});
