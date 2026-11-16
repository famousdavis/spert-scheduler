// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * WI-174 (v0.87.0): a project's page links to its own calendar, between Connect AI and Print, and the link lands
 * on the Calendar page with that project's row open, in view and focused. The journey runs through the real
 * router, the real project page and the real Calendar page.
 *
 * ⚠️ That the title row's controls stay on one line is a LAYOUT fact, measured in Chrome for the release (a
 * 59-character name at 1,024 px). jsdom has no layout, so here only the class that does it (ruling 4).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("@ui/hooks/use-ai-connectivity", () => ({
  useAiConnectivity: () => ({
    sessionState: { sessionActive: false, aiConnected: false },
    startSession: vi.fn(async () => true),
    stopSession: vi.fn(async () => {}),
    changePermissions: vi.fn(),
  }),
}));
vi.mock("@ui/providers/AuthProvider", () => ({
  useAuth: vi.fn(() => ({ user: null })),
}));
vi.mock("@ui/providers/StorageProvider", () => ({
  useStorage: vi.fn(() => ({ mode: "local", storageReady: true })),
}));
vi.mock("@ui/hooks/use-simulation", () => ({
  useSimulation: () => ({
    isRunning: false,
    progress: null,
    error: null,
    elapsedMs: null,
    run: vi.fn(),
    cancel: vi.fn(),
  }),
}));
// Connect AI shows only where Firebase is configured, as in production; the title row is the subject here.
vi.mock("@infrastructure/firebase/firebase", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@infrastructure/firebase/firebase")>()),
  isFirebaseAvailable: true,
}));
vi.mock("@infrastructure/nager/nager-client", () => ({
  fetchAvailableCountries: vi.fn(() => Promise.resolve([{ countryCode: "US", name: "United States" }])),
  fetchPublicHolidays: vi.fn(() => Promise.resolve([])),
}));

import { ProjectPage } from "./ProjectPage";
import { CalendarPage } from "./CalendarPage";
import { useProjectStore } from "@ui/hooks/use-project-store";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";
import { createProject } from "@app/api/project-service";
import { setStorageNamespace } from "@infrastructure/persistence/local-storage-repository";
import { DEFAULT_USER_PREFERENCES, type Project } from "@domain/models/types";
import { scrollIntoViewCallLog } from "../../test-stubs";

const OSSORY = "Ossory Causeway";
const TAMBER = "Tamber Works";

function project(name: string, patch: Partial<Project> = {}): Project {
  return { ...createProject(name, "2026-04-06"), ...patch };
}

function renderProjectPage(p: Project, others: Project[] = []) {
  useProjectStore.setState({ projects: [...others, p], loadError: false });
  return render(
    <MemoryRouter initialEntries={[`/project/${p.id}`]}>
      <Routes>
        <Route path="/project/:id" element={<ProjectPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const calendarLink = () => screen.getByRole("link", { name: "Calendar for this project" });

beforeEach(() => {
  localStorage.clear();
  setStorageNamespace("local");
  useProjectStore.setState({ projects: [], loadError: false, undoStack: [], redoStack: [] });
  usePreferencesStore.setState({ preferences: { ...DEFAULT_USER_PREFERENCES } });
  (document.activeElement as HTMLElement | null)?.blur();
});

afterEach(() => {
  cleanup();
  setStorageNamespace("local");
});

describe("WI-174: a project's Calendar link (D7)", () => {
  it("shows the word Calendar, is named for this project, and goes to that project's row", () => {
    const p = project(OSSORY);
    renderProjectPage(p);
    expect(calendarLink()).toHaveTextContent(/^Calendar$/);
    expect(calendarLink()).toHaveAttribute("href", `/calendar?project=${encodeURIComponent(p.id)}`);
  });

  it("sits between Connect AI and Print", () => {
    renderProjectPage(project(OSSORY));
    const connect = screen.getByRole("button", { name: "Connect an AI assistant" });
    const print = screen.getByRole("button", { name: "Print project report" });
    expect(connect.compareDocumentPosition(calendarLink()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(calendarLink().compareDocumentPosition(print) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("an archived project's page has no link, since the Calendar page does not list archived projects", () => {
    renderProjectPage(project(OSSORY, { archived: true }));
    expect(screen.queryByRole("link", { name: "Calendar for this project" })).toBeNull();
    expect(screen.getByRole("button", { name: "Print project report" })).toBeInTheDocument();
  });

  it("following it opens the Calendar page with that project's row open, in view and focused, and the others closed", () => {
    const other = project(TAMBER);
    const p = project(OSSORY);
    renderProjectPage(p, [other]);
    const before = scrollIntoViewCallLog().length;

    act(() => calendarLink().focus());
    fireEvent.click(calendarLink());

    const linked = screen.getByRole("button", { name: /^Ossory Causeway,/ });
    expect(screen.getByRole("heading", { level: 1, name: "Calendar" })).toBeInTheDocument();
    expect(linked).toHaveAttribute("aria-expanded", "true");
    expect(document.activeElement).toBe(linked);
    expect(scrollIntoViewCallLog().slice(before).map((c) => c.element)).toEqual([linked]);
    expect(screen.getByRole("button", { name: /^Tamber Works,/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: /^Company Holidays,/ })).toHaveAttribute("aria-expanded", "false");
  });

  it("Connect AI, Calendar and Print each keep to one line, so a long name wraps instead (ruling 4)", () => {
    renderProjectPage(project("A project name of fifty-nine characters, as measured in R40"));
    expect(screen.getByRole("button", { name: "Connect an AI assistant" })).toHaveClass("whitespace-nowrap");
    expect(calendarLink()).toHaveClass("whitespace-nowrap");
    expect(screen.getByRole("button", { name: "Print project report" })).toHaveClass("whitespace-nowrap");
  });
});
