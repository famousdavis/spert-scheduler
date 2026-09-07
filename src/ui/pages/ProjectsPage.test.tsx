// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { waitFor, within } from "@testing-library/react";

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
import { useConfirmStore } from "@ui/hooks/use-confirm-store";
import { ConfirmHost } from "@ui/components/ConfirmHost";
import type { LoadError } from "@infrastructure/persistence/local-storage-repository";

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
  // Module singleton: a question left pending by one test still shows in the next.
  useConfirmStore.setState({ pending: null });
});

function renderDashboard() {
  useProjectStore.setState({ projects: [], loadError: false });
  return render(
    <MemoryRouter initialEntries={["/projects"]}>
      <Routes>
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/project/:id" element={<div>PROJECT PAGE STUB</div>} />
      </Routes>
      {/* Production mounts this once in `Layout`, the parent of every route
          (`src/app/router.tsx`). Without it `confirmDialog.ask(...)` never resolves. */}
      <ConfirmHost />
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

// -- WI-6b (v0.67.9): the corrupted-project recovery card's Delete ------------

/**
 * ⚠️ NOT an ordinary project tile. Tile delete already routed through `ConfirmDialog`
 * before this release; this is the amber recovery card for data that failed to load, and
 * `removeCorruptedProject` calls `repo.removeById` with no `pushUndo` — so "This cannot be
 * undone" is TRUE here and false at the three activity/scenario sites migrated alongside it.
 *
 * ⚠️ `future_version` errors deliberately render no Export/Delete pair, so the fixture uses
 * `json_parse` — the type a real unparseable project actually produces, confirmed by injecting
 * broken JSON into localStorage in a browser. A `future_version` fixture would find no button
 * and the test would fail for the wrong reason.
 *
 * ⚠️ The first draft of this fixture said `type: "corrupt"`, which is NOT in `LoadErrorType`.
 * All three tests passed anyway — nothing in the card branches on the type except the
 * `future_version` check — and only `tsc` in the ship gate caught it. `vitest` does not
 * typecheck; that is the whole reason the gate runs `build` as well.
 */
const CORRUPT: LoadError = {
  projectId: "vogon-7",
  projectName: "Krikkit Ledger",
  type: "json_parse",
  message: "Stored data could not be parsed.",
};

function renderWithCorrupted() {
  const view = renderDashboard();
  act(() => {
    useProjectStore.setState({ loadErrors: [CORRUPT], loadError: true });
  });
  return view;
}

describe("ProjectsPage — deleting a corrupted project", () => {
  it("asks first, and dismissing leaves the recovery card in place", async () => {
    renderWithCorrupted();
    fireEvent.click(screen.getByTitle("Delete corrupted project"));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText('Delete "Krikkit Ledger"?')).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    expect(useProjectStore.getState().loadErrors).toHaveLength(1);
    expect(screen.getByTitle("Delete corrupted project")).toBeTruthy();
  });

  it("confirming removes it and focus lands on New Project, not <body>", async () => {
    renderWithCorrupted();
    fireEvent.click(screen.getByTitle("Delete corrupted project"));

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // P7's settle: the call site focuses in a `queueMicrotask`, same as P7 measured.
    await new Promise((r) => setTimeout(r, 5));

    expect(useProjectStore.getState().loadErrors).toHaveLength(0);
    // ⚠️ The HEADER's New Project button — the one rendered unconditionally. The dashboard
    // renders a SECOND button with the same accessible name inside the `projects.length
    // === 0` empty state, which is why production focuses a ref and this asserts identity
    // against the first match rather than a name lookup.
    expect(document.activeElement).toBe(
      screen.getAllByRole("button", { name: "New Project" })[0],
    );
  });
});
