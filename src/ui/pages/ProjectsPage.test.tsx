// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

// Same two provider mocks ProjectPage.test.tsx and ImportSection.test.tsx use.
vi.mock("@ui/providers/AuthProvider", () => ({
  useAuth: vi.fn(() => ({ user: null })),
}));
vi.mock("@ui/providers/StorageProvider", () => ({
  useStorage: vi.fn(() => ({ mode: "local", storageReady: true })),
}));

import { ProjectsPage } from "./ProjectsPage";
import { useProjectStore } from "@ui/hooks/use-project-store";
import { useNotificationStore } from "@ui/hooks/use-notification-store";

/**
 * "Loaded … — run the simulation to see the buffer" is read by a ROOM, from a projector,
 * and it carries an instruction; the 3 s default is tuned for one user at a desk
 * (audit L3). This site alone holds its toast for 8 s. Only setTimeout is faked, so the
 * sample fixture's dynamic import still resolves on the real microtask queue.
 * Falsified at 1c9b1db: the toast is gone at 3 s and the first assertion fails.
 */
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  useNotificationStore.setState({ notifications: [] });
});

function renderDashboard() {
  useProjectStore.setState({ projects: [], loadError: false });
  return render(
    <MemoryRouter initialEntries={["/projects"]}>
      <Routes>
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/project/:id" element={<div>PROJECT PAGE STUB</div>} />
      </Routes>
    </MemoryRouter>
  );
}

const toasts = () => useNotificationStore.getState().notifications;

/**
 * Let the async sample load settle without touching the faked setTimeout. The fixture is
 * a dynamic import (real I/O), so this yields on setImmediate against a REAL-CLOCK
 * deadline — a fixed number of ticks is microseconds of wall time and the first draft of
 * this helper never saw the toast at all, failing at the wrong assertion pre- and
 * post-fix.
 */
async function settle() {
  const deadline = Date.now() + 15_000;
  while (toasts().length === 0 && Date.now() < deadline) {
    await act(async () => {
      await new Promise<void>((r) => setImmediate(r));
    });
  }
}

describe("ProjectsPage — Load Sample toast", () => {
  it("keeps the sample-load toast up for 8 seconds, not the 3-second default", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    renderDashboard();

    fireEvent.click(screen.getByRole("button", { name: "Load Sample" }));
    await settle();
    expect(toasts()).toHaveLength(1);
    expect(toasts()[0]!.message).toMatch(/run the simulation/);

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(toasts(), "still showing after the 3 s default").toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(toasts(), "dismissed at 8 s").toHaveLength(0);
  });
});
