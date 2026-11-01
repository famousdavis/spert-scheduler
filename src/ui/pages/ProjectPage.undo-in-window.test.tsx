// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, createEvent, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ConfirmHost } from "@ui/components/ConfirmHost";
import { useConfirmStore } from "@ui/hooks/use-confirm-store";

/**
 * WI-158 (owner, R653, D5) — Undo and Redo never act on the page while a window is open.
 *
 * Until v0.83.1 the page's keyboard handler exempted only text fields, so Ctrl/Cmd+Z with focus on the
 * Edit Activity window's Status, a section header, Save or Cancel ran the page's undo behind the open
 * window (Review 38, W4), and could undo a scenario's unlock, after which Save dropped the user's
 * edit without a word (R2). Driven through the real page, its real handler and the real store.
 */

vi.mock("@ui/hooks/use-ai-connectivity", () => ({
  useAiConnectivity: () => ({
    sessionState: { sessionActive: false, aiConnected: false },
    startSession: vi.fn(async () => true),
    stopSession: vi.fn(async () => {}),
    changePermissions: vi.fn(),
  }),
}));
vi.mock("@ui/providers/AuthProvider", () => ({ useAuth: vi.fn(() => ({ user: null })) }));
vi.mock("@ui/providers/StorageProvider", () => ({
  useStorage: vi.fn(() => ({ mode: "local", storageReady: true })),
}));

import { ProjectPage } from "./ProjectPage";
import { useProjectStore } from "@ui/hooks/use-project-store";
import { addActivityToScenario, createActivity, createProject, createScenario } from "@app/api/project-service";
import type { Project } from "@domain/models/types";

function makeProject(): Project {
  const p = createProject("Undo Guard", "2026-04-06");
  const s = createScenario("Base", "2026-04-06");
  return { ...p, scenarios: [addActivityToScenario(s, createActivity("Build", s.settings))] };
}

function renderPage(p: Project) {
  useProjectStore.setState({ projects: [p], loadError: false, undoStack: [], redoStack: [] });
  render(
    <MemoryRouter initialEntries={[`/project/${p.id}`]}>
      <Routes>
        <Route path="/project/:id" element={<ProjectPage />} />
      </Routes>
      <ConfirmHost />
    </MemoryRouter>,
  );
}

const ids = (p: Project) => ({ projectId: p.id, scenarioId: p.scenarios[0]!.id, activityId: p.scenarios[0]!.activities[0]!.id });
const row = (p: Project) => useProjectStore.getState().getProject(p.id)!.scenarios[0]!;
const name = (p: Project) => row(p).activities[0]!.name;
const openWindow = () => fireEvent.click(screen.getByRole("button", { name: "Edit activity" }));
const inWindow = <T extends Element>(selector: string) => screen.getByRole("dialog").querySelector(selector) as T;

beforeEach(() => {
  localStorage.clear();
  useConfirmStore.setState({ pending: null });
});

describe("D5: Undo and Redo while the Edit Activity window is open", () => {
  it("Ctrl+Z and Cmd+Z on the window's Status leave the page's last change alone, and the window open", () => {
    const p = makeProject();
    renderPage(p);
    const { projectId, scenarioId, activityId } = ids(p);
    act(() => useProjectStore.getState().updateActivityField(projectId, scenarioId, activityId, { name: "Build renamed" }));
    openWindow();
    const status = inWindow<HTMLSelectElement>('select[name="activityStatus"]');
    fireEvent.keyDown(status, { key: "z", ctrlKey: true });
    expect(name(p), "Ctrl+Z").toBe("Build renamed");
    fireEvent.keyDown(status, { key: "z", metaKey: true });
    expect(name(p), "Cmd+Z").toBe("Build renamed");
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("Ctrl+Y and Ctrl+Shift+Z on the window's Save leave an undone change undone", () => {
    const p = makeProject();
    renderPage(p);
    const { projectId, scenarioId, activityId } = ids(p);
    act(() => useProjectStore.getState().updateActivityField(projectId, scenarioId, activityId, { name: "Build renamed" }));
    act(() => useProjectStore.getState().undo());
    openWindow();
    const saveButton = screen.getByRole("button", { name: "Save" });
    fireEvent.keyDown(saveButton, { key: "y", ctrlKey: true });
    expect(name(p), "Ctrl+Y").toBe("Build");
    fireEvent.keyDown(saveButton, { key: "z", ctrlKey: true, shiftKey: true });
    expect(name(p), "Ctrl+Shift+Z").toBe("Build");
  });

  it("Review 38 R2: Ctrl+Z inside the window cannot undo the scenario's unlock, so Save keeps the user's edit", () => {
    const p = makeProject();
    renderPage(p);
    const { projectId, scenarioId } = ids(p);
    act(() => useProjectStore.getState().toggleScenarioLock(projectId, scenarioId));
    act(() => useProjectStore.getState().toggleScenarioLock(projectId, scenarioId));
    openWindow();
    fireEvent.keyDown(inWindow('select[name="activityStatus"]'), { key: "z", ctrlKey: true });
    expect(row(p).locked ?? false).toBe(false);
    fireEvent.change(inWindow('input[name="activityName"]'), { target: { value: "Build (mine)" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(name(p)).toBe("Build (mine)");
  });

  it("a text box in the window keeps its own undo: the key is not taken from it", () => {
    const p = makeProject();
    renderPage(p);
    const { projectId, scenarioId, activityId } = ids(p);
    act(() => useProjectStore.getState().updateActivityField(projectId, scenarioId, activityId, { name: "Build renamed" }));
    openWindow();
    const box = inWindow<HTMLInputElement>('input[name="activityName"]');
    const ev = createEvent.keyDown(box, { key: "z", metaKey: true });
    fireEvent(box, ev);
    expect(ev.defaultPrevented).toBe(false);
    expect(name(p)).toBe("Build renamed");
  });

  it("control: once the window is closed, Ctrl+Z undoes the page's last change again", () => {
    const p = makeProject();
    renderPage(p);
    const { projectId, scenarioId, activityId } = ids(p);
    act(() => useProjectStore.getState().updateActivityField(projectId, scenarioId, activityId, { name: "Build renamed" }));
    openWindow();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.keyDown(document, { key: "z", ctrlKey: true });
    expect(name(p)).toBe("Build");
  });
});
