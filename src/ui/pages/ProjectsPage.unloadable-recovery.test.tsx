// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * CI-3 (v0.79.8 security self-audit): the Dashboard recovery banner must offer
 * Export + Delete for an un-loadable CLOUD project (both invalid and
 * future-version), and Delete must remove the document FROM THE CLOUD — not just
 * hide it locally, which would leave the broken doc to re-surface on the next
 * load and leave the "vanish" attack unrecovered.
 *
 * confirmDialog and the Firestore driver are mocked so these tests assert the
 * HANDLER WIRING (does Delete call driver.remove? does Export read the raw doc
 * back?). The dialog's own rendering is covered by ProjectsPage.tile-delete; the
 * confirm WORDING by unloadable-recovery.test. A cloud-sourced error is seeded in
 * a local-mode harness on purpose: the banner and the source branch are
 * mode-independent, and getCloudSyncDriver is mocked regardless of mode.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

vi.mock("@ui/providers/AuthProvider", () => ({ useAuth: vi.fn(() => ({ user: null })) }));
vi.mock("@ui/providers/StorageProvider", () => ({
  useStorage: vi.fn(() => ({ mode: "local", storageReady: true })),
}));

const mockDriver = vi.hoisted(() => ({
  loadRawProjectDoc: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("@ui/hooks/use-cloud-sync", () => ({
  getCloudSyncDriver: () => mockDriver,
  endCloudSyncForSignOut: vi.fn(),
  useCloudSync: () => {},
}));

const confirmAsk = vi.hoisted(() => vi.fn());
vi.mock("@ui/hooks/use-confirm-store", () => ({
  confirmDialog: { ask: confirmAsk },
}));

const downloadFile = vi.hoisted(() => vi.fn());
vi.mock("@ui/helpers/download", () => ({
  downloadFile,
  sanitizeFilename: (s: string) => s,
}));

import { ProjectsPage } from "./ProjectsPage";
import { useProjectStore, type LoadError } from "@ui/hooks/use-project-store";

function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={["/projects"]}>
      <Routes>
        <Route path="/projects" element={<ProjectsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const cloudError = (over: Partial<LoadError> = {}): LoadError => ({
  projectId: "cx",
  projectName: "Cloudy",
  type: "validation",
  source: "cloud",
  message: "Project data is invalid and could not be loaded",
  ...over,
});

/** Render, flush the mount load (which resets loadErrors), THEN seed the error. */
async function seedCloudError(err: LoadError) {
  renderDashboard();
  await act(async () => {});
  act(() => {
    useProjectStore.setState({ loadErrors: [err], loadError: true });
  });
}

beforeEach(() => {
  localStorage.clear();
  useProjectStore.setState(useProjectStore.getInitialState(), true);
  mockDriver.loadRawProjectDoc.mockReset().mockResolvedValue('{"id":"cx","name":"Cloudy"}');
  mockDriver.remove.mockReset().mockResolvedValue(undefined);
  confirmAsk.mockReset().mockResolvedValue(true);
  downloadFile.mockReset();
});

afterEach(() => cleanup());

describe("CI-3 Dashboard recovery banner — cloud projects", () => {
  it("an invalid cloud project: Export reads the raw doc back, Delete removes it from the cloud", async () => {
    await seedCloudError(cloudError());

    expect(screen.getByText("Cloudy")).toBeInTheDocument();
    const exportBtn = screen.getByRole("button", { name: "Export" });
    const deleteBtn = screen.getByRole("button", { name: "Delete" });

    // Export reads the raw doc back from Firestore (not local storage) and writes a file.
    await act(async () => {
      fireEvent.click(exportBtn);
    });
    expect(mockDriver.loadRawProjectDoc).toHaveBeenCalledWith("cx");
    expect(downloadFile).toHaveBeenCalled();

    // Delete confirms with the all-members blast-radius wording, deletes from the
    // cloud, and drops the project from the banner.
    await act(async () => {
      fireEvent.click(deleteBtn);
    });
    expect(confirmAsk).toHaveBeenCalledWith(
      expect.objectContaining({
        description: expect.stringContaining("everyone it's shared with"),
        destructive: true,
      }),
    );
    expect(mockDriver.remove).toHaveBeenCalledWith("cx");
    await waitFor(() => {
      expect(
        useProjectStore.getState().loadErrors.find((e) => e.projectId === "cx"),
      ).toBeUndefined();
    });
  });

  it("a FUTURE-VERSION cloud project now also offers Export + Delete (was suppressed pre-CI-3)", async () => {
    await seedCloudError(cloudError({ type: "future_version", projectName: "Newer" }));

    expect(screen.getByText("Newer")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("does not delete from the cloud when the owner cancels the confirm", async () => {
    confirmAsk.mockResolvedValue(false);
    await seedCloudError(cloudError());

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    });
    expect(mockDriver.remove).not.toHaveBeenCalled();
    expect(
      useProjectStore.getState().loadErrors.find((e) => e.projectId === "cx"),
    ).toBeDefined();
  });
});
