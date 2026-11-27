// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useParams } from "react-router-dom";

vi.mock("@ui/providers/AuthProvider", () => ({
  useAuth: vi.fn(() => ({ user: null })),
}));
vi.mock("@ui/providers/StorageProvider", () => ({
  useStorage: vi.fn(() => ({ mode: "local", storageReady: true })),
}));

import { ProjectsPage } from "./ProjectsPage";
import { useProjectStore } from "@ui/hooks/use-project-store";
import { useNotificationStore } from "@ui/hooks/use-notification-store";
import { useAnnouncerStore } from "@ui/hooks/use-announcer";

/**
 * v0.89.0 (FRAME26 clean-up L; contract §7, "Load Sample"): the toolbar's Load Sample and the Welcome panel's Load
 * Sample Project do one thing. They add "Sample: Cloud ERP Solution" (then "(2)", …), open it on its project page at
 * once, and announce, in the app's polite line, exactly "Added “<name>” to your projects and opened it." The toast
 * beside it is the hint alone (William, 2026-11-26). The line lives in `Layout` (pinned by `Layout.frame.test.tsx`);
 * here its store stands in for it, and a stand-in project route shows which project opened.
 */
const BASE = "Sample: Cloud ERP Solution";
const sentence = (name: string) => `Added “${name}” to your projects and opened it.`;

function OpenedProject() {
  const { id } = useParams();
  const name = useProjectStore((s) => s.projects.find((p) => p.id === id)?.name);
  return <h1>OPENED {name}</h1>;
}

function renderApp() {
  render(
    <MemoryRouter initialEntries={["/projects"]}>
      <Routes>
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/project/:id" element={<OpenedProject />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** The announcement once its macrotask has run. */
async function announced(): Promise<string> {
  await waitFor(() => expect(useAnnouncerStore.getState().text).not.toBe(""), { timeout: 15_000 });
  return useAnnouncerStore.getState().text;
}

beforeEach(() => {
  localStorage.clear();
  useProjectStore.setState({ projects: [], loadError: false, loadErrors: [] });
  useAnnouncerStore.setState({ text: "" });
  useNotificationStore.setState({ notifications: [] });
});
afterEach(() => {
  cleanup();
  useNotificationStore.setState({ notifications: [] });
});

describe("Load Sample adds the sample, opens it and says so", () => {
  it("the Welcome panel's Load Sample Project: opens the sample's page and announces the sentence exactly", async () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Load Sample Project" }));
    expect(await screen.findByRole("heading", { name: `OPENED ${BASE}` }, { timeout: 15_000 })).toBeInTheDocument();
    expect(await announced()).toBe(sentence(BASE));
    expect(useNotificationStore.getState().notifications.map((n) => n.message)).toEqual([
      "Run the simulation to see the buffer.",
    ]);
  }, 30_000);

  it("the toolbar's Load Sample, a second time: the copy is (2), it opens, and the sentence names it", async () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Load Sample" }));
    await screen.findByRole("heading", { name: `OPENED ${BASE}` }, { timeout: 15_000 });
    expect(await announced()).toBe(sentence(BASE));
    cleanup();
    act(() => useAnnouncerStore.setState({ text: "" }));

    renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Load Sample" }));
    await screen.findByRole("heading", { name: `OPENED ${BASE} (2)` }, { timeout: 15_000 });
    expect(await announced()).toBe(sentence(`${BASE} (2)`));
  }, 30_000);
});
