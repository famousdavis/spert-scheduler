// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { Suspense } from "react";
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

  /**
   * H3 (FRAME26, v0.90.0): one Load Sample at a time. Measured on production at v0.89.0: two presses 60 ms apart added
   * two samples, both named "Sample: Cloud ERP Solution", and showed two toasts, because both loads named the sample
   * against the same list. A press while one is loading now does nothing.
   */
  it("presses while the first load is pending add one sample and show one toast (H3)", async () => {
    renderApp();
    const toolbar = screen.getByRole("button", { name: "Load Sample" });
    const welcome = screen.getByRole("button", { name: "Load Sample Project" });
    // All three in the same tick, before the first load (an awaited dynamic import) can finish.
    fireEvent.click(toolbar);
    fireEvent.click(toolbar);
    fireEvent.click(welcome);
    await screen.findByRole("heading", { name: `OPENED ${BASE}` }, { timeout: 15_000 });
    expect(await announced()).toBe(sentence(BASE));
    // Let any second load that slipped through land before counting.
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 200)));
    expect(useProjectStore.getState().projects.map((p) => p.name)).toEqual([BASE]);
    expect(useNotificationStore.getState().notifications.map((n) => n.message)).toEqual([
      "Run the simulation to see the buffer.",
    ]);
  }, 30_000);

  /**
   * H3's second window. In a production build the first load finishes in under 60 ms, and React Router renders the
   * project page as a transition (about 235 ms), with Projects still on screen: a press then added "(2)" and a second
   * toast (About-SCH-AHP's probe of the first fix, 2026-11-27). Here the project route suspends, so the transition holds
   * Projects on screen after the first load, as it does there, and the next press lands in that window.
   */
  it("a press after the first load but before the page has left adds nothing (H3)", async () => {
    const never = new Promise<never>(() => {});
    function Leaving(): never {
      throw never;
    }
    render(
      <MemoryRouter initialEntries={["/projects"]}>
        <Suspense fallback={<p>LEAVING</p>}>
          <Routes>
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/project/:id" element={<Leaving />} />
          </Routes>
        </Suspense>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Load Sample" }));
    expect(await announced()).toBe(sentence(BASE));
    // The first load is done, and Projects is still on screen: the window is real, not assumed.
    const again = screen.getByRole("button", { name: "Load Sample" });
    expect(useProjectStore.getState().projects.map((p) => p.name)).toEqual([BASE]);
    fireEvent.click(again);
    await act(() => new Promise<void>((resolve) => setTimeout(resolve, 300)));
    expect(useProjectStore.getState().projects.map((p) => p.name)).toEqual([BASE]);
    expect(useNotificationStore.getState().notifications.map((n) => n.message)).toEqual([
      "Run the simulation to see the buffer.",
    ]);
  }, 30_000);
});
