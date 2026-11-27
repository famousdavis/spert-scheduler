// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * FRAME26 stage 4 (v0.88.0): a project's page on the SPERT® Suite frame (contract §7, "Inside a project").
 *
 * The project's name is the page's h1, in the frame's heading row, with the full name in its title for when it is cut
 * short; its five actions (Connect AI, Calendar, Print, Undo, Redo) sit flush right in the row's toolbar, each an
 * `.sf-btn`. The row sits INSIDE the page's root `.space-y-6`, which is a direct child of `main`, beside the printed
 * report: `styles.css`'s print rules reach the report through `#root > * > main > *` and `.space-y-6 > *`, so a row that
 * moved out of that root, or a root that stopped being `main`'s child, would print a blank page 1 or the heading row.
 * While the project is not here (an unknown id), the heading row stays, with a neutral "Project".
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
import { useProjectStore } from "@ui/hooks/use-project-store";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";
import { createProject } from "@app/api/project-service";
import { setStorageNamespace } from "@infrastructure/persistence/local-storage-repository";
import { DEFAULT_USER_PREFERENCES, type Project } from "@domain/models/types";


function project(name: string): Project {
  return createProject(name, "2026-04-06");
}

/** The page inside a stand-in for the frame's `main` (`#root > .sf-app > main`), as the router renders it. */
function renderAt(path: string, projects: Project[]) {
  useProjectStore.setState({ projects, loadError: false });
  return render(
    <div id="root">
      <div className="sf-app">
        <main id="main" className="sf-col sf-main" data-sf="main">
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route path="/project/:id" element={<ProjectPage />} />
            </Routes>
          </MemoryRouter>
        </main>
      </div>
    </div>,
  );
}

beforeEach(() => {
  localStorage.clear();
  setStorageNamespace("local");
  useProjectStore.setState({ projects: [], loadError: false, undoStack: [], redoStack: [] });
  usePreferencesStore.setState({ preferences: { ...DEFAULT_USER_PREFERENCES } });
});

afterEach(() => {
  cleanup();
  setStorageNamespace("local");
});

const ACTIONS = ["Connect an AI assistant", "Calendar for this project", "Print project report", "Undo", "Redo"];

describe("FRAME26: a project's page on the frame", () => {
  it("the project's name is the heading row's h1, with its full name in the title", () => {
    const p = project("Ossory Causeway");
    renderAt(`/project/${p.id}`, [p]);
    const row = document.querySelector('[data-sf="headrow"]')!;
    const h1 = row.querySelector("h1")!;
    expect(h1).toHaveClass("sf-heading");
    expect(h1).toHaveAttribute("data-sf", "heading");
    expect(h1).toHaveAttribute("title", "Ossory Causeway");
    expect(h1).toHaveTextContent(/^Ossory Causeway$/);
    expect(screen.getAllByRole("heading", { level: 1 })[0]).toBe(h1);
  });

  it("its five actions are the row's toolbar, in order, each an .sf-btn", () => {
    const p = project("Ossory Causeway");
    renderAt(`/project/${p.id}`, [p]);
    const toolbar = document.querySelector('[data-sf="headrow"] > [data-sf="toolbar"]')!;
    expect(toolbar).toHaveClass("sf-toolbar");
    const actions = [...toolbar.children] as HTMLElement[];
    expect(actions.map((a) => a.getAttribute("aria-label") ?? a.textContent)).toEqual(ACTIONS);
    for (const a of actions) expect(a).toHaveClass("sf-btn");
  });

  it("the row sits inside the page's root .space-y-6, a direct child of main, beside the printed report", () => {
    const p = project("Ossory Causeway");
    renderAt(`/project/${p.id}`, [p]);
    const main = document.querySelector("main")!;
    const row = document.querySelector('[data-sf="headrow"]')!;
    const root = row.parentElement!;
    expect(root).toHaveClass("space-y-6");
    expect(root.parentElement).toBe(main);
    expect(root.firstElementChild).toBe(row);
    expect(root.querySelector(":scope > .print-report")).not.toBeNull();
    // The print chain: #root > * > main > *
    expect(document.querySelector("#root > * > main > .space-y-6")).toBe(root);
  });

  it("an unknown id keeps the heading row, with a neutral 'Project' and no toolbar", () => {
    renderAt("/project/nope", []);
    const row = document.querySelector('[data-sf="headrow"]')!;
    expect(row.querySelector("h1")).toHaveTextContent(/^Project$/);
    expect(row.querySelector('[data-sf="toolbar"]')).toBeNull();
    expect(screen.getByText("This project is no longer available.")).toBeInTheDocument();
  });

  // v0.89.0 (FRAME26 clean-up H1): the name's text starts at the column's edge, C. InlineEdit's own `px-1` hover pill
  // stays; `-ml-1` sets its 4 px of padding left of C, where the h1's overflow clips it. (The pixels are measured in
  // Chrome; jsdom has no layout, so this pins the class.)
  it("the name's InlineEdit span carries -ml-1, so its text starts at the h1's edge", () => {
    const p = project("Ossory Causeway");
    renderAt(`/project/${p.id}`, [p]);
    const span = document.querySelector('[data-sf="heading"] > span')!;
    expect(span).toHaveTextContent(/^Ossory Causeway$/);
    expect(span.className.split(/\s+/)).toEqual(expect.arrayContaining(["px-1", "-ml-1"]));
  });

  // v0.90.0 (FRAME26 H4): while renaming, the text stays at C too. InlineEdit's input has a 1 px border and `px-2`, so
  // its text sat at C + 9 (measured in Chrome on production, About-SCH-AHP Step 1); `-ml-[9px]` sets both left of C,
  // where the h1 clips them, and `w-full` gives the input the heading's width, so a long name shows from its start
  // (the input was about 20 characters wide and scrolled to the name's end). jsdom has no layout: this pins the classes.
  it("the rename input carries -ml-[9px] and w-full, so its text stays at the h1's edge and the whole name shows", () => {
    const p = project("Ossory Causeway");
    renderAt(`/project/${p.id}`, [p]);
    fireEvent.click(document.querySelector('[data-sf="heading"] > span')!);
    const input = document.querySelector<HTMLInputElement>('[data-sf="heading"] input')!;
    expect(input).toHaveValue("Ossory Causeway");
    expect(input.className.split(/\s+/)).toEqual(expect.arrayContaining(["border", "px-2", "-ml-[9px]", "w-full"]));
  });
});
