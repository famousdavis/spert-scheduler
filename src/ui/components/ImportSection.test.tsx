// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * Component-level tests for ImportSection — charter §3.3 Tier C.
 *
 * ⚠️ WHAT THESE CLOSE, STATED NARROWLY.
 * The v0.60.0 smoke pass recorded "the import half of export→clear→re-import" and
 * "JSON import from Settings" as NOT VERIFIED: the browser harness could not simulate a
 * file picker across three techniques. The import *logic* was never the gap — 15 tests
 * cover `planImportDecisions`, 15 cover `importProjects`, and `use-import-state.test.ts`
 * already drives a real `File` through `handleFileChange`. The genuinely unexecuted
 * surface is exactly two things, both in `ImportSection.tsx:48-60`:
 *
 *   1. the `<input onChange={handleFileChange}>` binding, and
 *   2. the `fileInputRef.current?.click()` indirection behind the "Choose File" button.
 *
 * Everything else here is DOM-wiring coverage that is worth having but is NOT what
 * NOT VERIFIED referred to. The OS file-picker dialog itself remains unreachable and is
 * not chased. `ImportSection` is mounted by both `SettingsPage` and `ProjectsPage` with
 * the same `projects` prop, so one component test covers both recorded surfaces.
 *
 * ⚠️ ASSERTION HYGIENE — read before adding a test here.
 * An import/export UI is saturated with the words you would naturally assert on. A probe
 * for this very work wrote `waitFor(() => expect(body).toMatch(/Import/i))` and it passed
 * instantly, because it matched the static section heading "Import Projects" while the
 * file was never processed. That is instance #12 of this project's defining failure class.
 * So: every assertion below is one that ONLY a processed file can satisfy — a fixture
 * name that appears nowhere in the component's static text, or a specific parse error.
 * `pickFile` carries the shared positive signal that the read actually ran.
 *
 * The FileReader block in `use-import-state.ts` (its `onload`/`onerror`/`readAsText`) had
 * an execution count of 0 before this file existed; all three prior `handleFileChange`
 * tests short-circuit on a guard first.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

// Provider mocks — declared BEFORE the component import so vi.mock hoisting catches them.
// ImportSection throws "useStorage must be used within StorageProvider" if rendered bare.
vi.mock("@ui/providers/StorageProvider", () => ({
  useStorage: vi.fn(() => ({ mode: "local", storageReady: true })),
}));
vi.mock("@ui/providers/AuthProvider", () => ({
  useAuth: vi.fn(() => ({ user: null })),
}));

import { ImportSection } from "./ImportSection";
import { useProjectStore } from "@ui/hooks/use-project-store";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";
import { useStorage } from "@ui/providers/StorageProvider";
import { useAuth } from "@ui/providers/AuthProvider";
import { serializeExport } from "@app/api/export-import-service";
import { createProject } from "@app/api/project-service";
import { DEFAULT_USER_PREFERENCES } from "@domain/models/types";
import type { Project, UserPreferences } from "@domain/models/types";

const mockedUseStorage = vi.mocked(useStorage);
const mockedUseAuth = vi.mocked(useAuth);

/**
 * Fixture names deliberately share no word with any static string in ImportSection.tsx.
 * An assertion on one of these can be satisfied only by a file that was actually read,
 * parsed, validated and rendered.
 */
const NAME_A = "Zarquon Bridge Retrofit";
const NAME_B = "Marimba Depot Rollout";
const NAME_C = "Perihelion Vault Cutover";

const FILE_INPUT_LABEL = "Project import JSON file";

function seedStore(projects: Project[]): void {
  useProjectStore.setState({ projects, loadError: false, cloudDataLoaded: false });
}

function renderSection(projects: Project[] = useProjectStore.getState().projects) {
  return render(<ImportSection projects={projects} />);
}

function fileInput(): HTMLInputElement {
  return screen.getByLabelText(FILE_INPUT_LABEL) as HTMLInputElement;
}

/**
 * Drive the hidden file input the way the picker would.
 *
 * `@testing-library/user-event` is NOT installed here and adding it would trip the 60-day
 * soak window, so the house idiom (`fireEvent`) is used instead.
 *
 * ⚠️ The `waitFor` below is the harness's proof that it ran. The idle step renders NEITHER
 * an alert NOR the preview region — only the heading, the blurb and the button — so
 * "one of those two exists" cannot be satisfied by the section's static chrome. If the
 * onChange binding, the FileReader read, or the state transition silently no-ops, every
 * test built on this helper fails here rather than passing vacuously.
 */
async function pickFile(contents: string, filename = "spert-export.json") {
  const input = fileInput();
  const file = new File([contents], filename, { type: "application/json" });
  fireEvent.change(input, { target: { files: [file] } });
  await waitFor(() => {
    const settled =
      screen.queryByRole("alert") ?? screen.queryByRole("region");
    expect(settled).not.toBeNull();
  });
}

function previewRegion(): HTMLElement {
  return screen.getByRole("region");
}

/**
 * The element a radiogroup's `aria-labelledby` actually resolves to. Returns null when
 * the attribute is missing or dangles, so a broken labelling wire fails the assertion
 * rather than quietly matching text found elsewhere on the page.
 */
function labelFor(group: HTMLElement): HTMLElement | null {
  const id = group.getAttribute("aria-labelledby");
  return id ? document.getElementById(id) : null;
}

function confirmImport() {
  fireEvent.click(screen.getByRole("button", { name: "Confirm Import" }));
}

/** Project names currently listed under "Ready to import:", in render order. */
function readyToImportNames(): string[] {
  const heading = screen.getByText("Ready to import:");
  const list = heading.parentElement!.querySelector("ul")!;
  return [...list.querySelectorAll("li")].map((li) =>
    li.firstChild!.textContent!.trim()
  );
}

beforeEach(() => {
  localStorage.clear();
  seedStore([]);
  usePreferencesStore.setState({ preferences: { ...DEFAULT_USER_PREFERENCES } });
  mockedUseStorage.mockReturnValue({
    mode: "local",
    storageReady: true,
  } as unknown as ReturnType<typeof useStorage>);
  mockedUseAuth.mockReturnValue({
    user: null,
  } as unknown as ReturnType<typeof useAuth>);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// -- The two NOT VERIFIED seams ----------------------------------------------

describe("ImportSection — the Choose File → hidden input indirection", () => {
  it("clicking Choose File dispatches a click on the hidden file input", () => {
    renderSection();
    let clicks = 0;
    fileInput().addEventListener("click", () => {
      clicks++;
    });

    fireEvent.click(screen.getByRole("button", { name: "Choose File" }));

    // Nothing else in this component can raise a click on that element, so this is
    // false unless the ref resolved AND the button's onClick forwarded to it.
    expect(clicks).toBe(1);
  });

  it("the hidden input is the one the picker would fill: type=file, accepts .json", () => {
    renderSection();
    const input = fileInput();
    expect(input.type).toBe("file");
    expect(input.accept).toBe(".json");
  });
});

describe("ImportSection — the <input onChange> binding", () => {
  it("a valid export file reaches the handler and renders its projects in the preview", async () => {
    renderSection();
    await pickFile(serializeExport([createProject(NAME_A, "2026-04-06")]));

    // NAME_A appears nowhere in the component's static text.
    expect(readyToImportNames()).toEqual([NAME_A]);
    expect(within(previewRegion()).getByText("(1 scenario)")).toBeInTheDocument();
  });

  it("renders every project in a multi-project file, in file order", async () => {
    renderSection();
    await pickFile(
      serializeExport([
        createProject(NAME_A, "2026-04-06"),
        createProject(NAME_B, "2026-04-06"),
        createProject(NAME_C, "2026-04-06"),
      ])
    );

    expect(readyToImportNames()).toEqual([NAME_A, NAME_B, NAME_C]);
  });

  /**
   * ⚠️ SCOPE, MEASURED. This pins the user-visible outcome — the second pick wins and the
   * two files do not merge — and nothing more. It does NOT guard the abort at
   * `use-import-state.ts:312` or the staleness guard in `onload`: both were removed by
   * mutation and this test still passed, because under jsdom last-write-wins holds either
   * way. Both lines now *execute* (they never had before), which is coverage, not a guard.
   * Do not cite this test as protecting either one.
   */
  it("two picks in a row leave the second file's preview, not the first's and not both", async () => {
    renderSection();
    const input = fileInput();
    fireEvent.change(input, {
      target: {
        files: [
          new File([serializeExport([createProject(NAME_A, "2026-04-06")])], "a.json"),
        ],
      },
    });
    fireEvent.change(input, {
      target: {
        files: [
          new File([serializeExport([createProject(NAME_B, "2026-04-06")])], "b.json"),
        ],
      },
    });

    await waitFor(() => {
      expect(screen.queryByRole("region")).not.toBeNull();
    });
    expect(readyToImportNames()).toEqual([NAME_B]);
  });
});

// -- Error path --------------------------------------------------------------

describe("ImportSection — error rendering and recovery", () => {
  it("unparseable content renders the JSON error, not a preview", async () => {
    renderSection();
    await pickFile("this is not json at all");

    expect(screen.getByRole("alert")).toHaveTextContent("Invalid JSON file.");
    expect(screen.queryByText("Ready to import:")).toBeNull();
  });

  it("valid JSON with the wrong envelope names the format requirement", async () => {
    renderSection();
    // `version` is not the envelope field — `format` is. Getting this wrong is how the
    // probe's first fixture failed, so it is pinned as a test rather than a comment.
    await pickFile(JSON.stringify({ version: 1, projects: [] }));

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Not a SPERT Scheduler export file.");
    expect(alert).toHaveTextContent('"format": "spert-scheduler-export"');
  });

  it("Try another file clears the error back to idle", async () => {
    renderSection();
    await pickFile("not json");
    expect(screen.getByRole("alert")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try another file" }));

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "Choose File" })).toBeEnabled();
  });
});

// -- Conflict resolution through the DOM --------------------------------------

describe("ImportSection — conflict resolution through the DOM", () => {
  it("an ID conflict renders a labelled radiogroup defaulting to Skip", async () => {
    const existing = createProject(NAME_A, "2026-04-06");
    seedStore([existing]);
    renderSection([existing]);

    await pickFile(serializeExport([{ ...existing, name: NAME_B }]));

    const group = screen.getByRole("radiogroup", { name: new RegExp(NAME_B) });
    expect(labelFor(group)).toHaveTextContent(`(ID match: "${NAME_A}")`);
    expect(within(group).getByRole("radio", { name: "Skip" })).toBeChecked();
    expect(
      within(group).getByRole("radio", { name: "Replace existing" })
    ).not.toBeChecked();
  });

  it("a name conflict renders a labelled radiogroup defaulting to Import as copy", async () => {
    const existing = createProject(NAME_A, "2026-04-06");
    seedStore([existing]);
    renderSection([existing]);

    // Same name, different id → name conflict.
    await pickFile(serializeExport([createProject(NAME_A, "2026-04-06")]));

    const group = screen.getByRole("radiogroup", { name: new RegExp(NAME_A) });
    expect(labelFor(group)).toHaveTextContent(`(Name match: "${NAME_A}")`);
    expect(
      within(group).getByRole("radio", { name: "Import as copy" })
    ).toBeChecked();
  });

  it("choosing Replace existing selects it and surfaces the overwrite warning", async () => {
    const existing = createProject(NAME_A, "2026-04-06");
    seedStore([existing]);
    renderSection([existing]);
    await pickFile(serializeExport([{ ...existing, name: NAME_B }]));

    const group = screen.getByRole("radiogroup", { name: new RegExp(NAME_B) });
    expect(
      screen.queryByText(/Existing project content \(scenarios, activities\)/)
    ).toBeNull();

    fireEvent.click(within(group).getByRole("radio", { name: "Replace existing" }));

    expect(
      within(group).getByRole("radio", { name: "Replace existing" })
    ).toBeChecked();
    expect(within(group).getByRole("radio", { name: "Skip" })).not.toBeChecked();
    expect(
      screen.getByText(/Existing project content \(scenarios, activities\)/)
    ).toBeInTheDocument();
  });

  it("Confirm applies the chosen Replace: the existing project takes the imported content", async () => {
    const existing = createProject(NAME_A, "2026-04-06");
    seedStore([existing]);
    renderSection([existing]);
    await pickFile(serializeExport([{ ...existing, name: NAME_B }]));

    fireEvent.click(
      within(screen.getByRole("radiogroup", { name: new RegExp(NAME_B) })).getByRole(
        "radio",
        { name: "Replace existing" }
      )
    );
    confirmImport();

    await waitFor(() => {
      expect(screen.getByRole("status")).toBeInTheDocument();
    });
    const projects = useProjectStore.getState().projects;
    expect(projects).toHaveLength(1);
    // Replace keeps the existing identity and takes the imported name.
    expect(projects[0]!.id).toBe(existing.id);
    expect(projects[0]!.name).toBe(NAME_B);
    expect(screen.getByRole("status")).toHaveTextContent("1 replaced");
  });

  it("Confirm honours the Skip default: nothing is written", async () => {
    const existing = createProject(NAME_A, "2026-04-06");
    seedStore([existing]);
    renderSection([existing]);
    await pickFile(serializeExport([{ ...existing, name: NAME_B }]));

    confirmImport();

    await waitFor(() => {
      expect(screen.getByRole("status")).toBeInTheDocument();
    });
    expect(useProjectStore.getState().projects[0]!.name).toBe(NAME_A);
    expect(screen.getByRole("status")).toHaveTextContent(
      "No projects were imported — all 1 skipped."
    );
  });

  it("a conflicting project is listed under conflicts only, never also as ready-to-import", async () => {
    const existing = createProject(NAME_A, "2026-04-06");
    seedStore([existing]);
    renderSection([existing]);

    await pickFile(
      serializeExport([
        { ...existing, name: NAME_B }, // id collision
        createProject(NAME_C, "2026-04-06"), // clean
      ])
    );

    expect(readyToImportNames()).toEqual([NAME_C]);
    expect(screen.getAllByRole("radiogroup")).toHaveLength(1);
    expect(
      screen.getByRole("radiogroup", { name: new RegExp(NAME_B) })
    ).toBeInTheDocument();
  });

  /**
   * The genuine `updateDecision` round-trip (pitfall #19).
   *
   * `use-import-state.test.ts:125` is named "immutable round-trip via Map; updating one
   * decision preserves the others" but updates NO decision — `currentProjects` is empty,
   * so `decisions` is empty and it asserts a no-op against a nonexistent id. Driving the
   * preview phase was not feasible from `renderHook`; through the DOM it is. This is the
   * assertion that test's name describes.
   */
  it("updating one decision leaves the other's action and its position untouched", async () => {
    const existingA = createProject(NAME_A, "2026-04-06");
    const existingB = createProject(NAME_B, "2026-04-06");
    seedStore([existingA, existingB]);
    renderSection([existingA, existingB]);

    await pickFile(
      serializeExport([
        { ...existingA, name: NAME_A },
        { ...existingB, name: NAME_B },
      ])
    );

    const groupsBefore = screen.getAllByRole("radiogroup");
    expect(groupsBefore).toHaveLength(2);
    const orderBefore = groupsBefore.map((g) => g.getAttribute("aria-labelledby"));

    const groupA = screen.getByRole("radiogroup", { name: new RegExp(NAME_A) });
    fireEvent.click(within(groupA).getByRole("radio", { name: "Replace existing" }));

    // The other conflict keeps its default…
    const groupB = screen.getByRole("radiogroup", { name: new RegExp(NAME_B) });
    expect(within(groupB).getByRole("radio", { name: "Skip" })).toBeChecked();
    expect(
      within(groupB).getByRole("radio", { name: "Replace existing" })
    ).not.toBeChecked();
    // …and the Map round-trip preserves insertion order, so nothing reshuffles.
    expect(
      screen.getAllByRole("radiogroup").map((g) => g.getAttribute("aria-labelledby"))
    ).toEqual(orderBefore);

    // The outcome proves both decisions survived the update intact.
    confirmImport();
    await waitFor(() => {
      expect(screen.getByRole("status")).toBeInTheDocument();
    });
    const byId = new Map(
      useProjectStore.getState().projects.map((p) => [p.id, p.name])
    );
    expect(byId.get(existingA.id)).toBe(NAME_A);
    expect(byId.get(existingB.id)).toBe(NAME_B);
    expect(screen.getByRole("status")).toHaveTextContent("1 replaced, 1 skipped");
  });
});

// -- Confirm → done banner ----------------------------------------------------

describe("ImportSection — the done banner", () => {
  it("a clean import reports the added count and the project is in the store", async () => {
    renderSection();
    await pickFile(
      serializeExport([
        createProject(NAME_A, "2026-04-06"),
        createProject(NAME_B, "2026-04-06"),
      ])
    );

    confirmImport();

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(
        "Import complete: 2 added."
      );
    });
    expect(useProjectStore.getState().projects.map((p) => p.name)).toEqual([
      NAME_A,
      NAME_B,
    ]);
  });

  it("Import another file returns the section to idle", async () => {
    renderSection();
    await pickFile(serializeExport([createProject(NAME_A, "2026-04-06")]));
    confirmImport();
    await waitFor(() => {
      expect(screen.getByRole("status")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Import another file" }));

    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("region")).toBeNull();
  });

  /**
   * The applying step is rendered, and the Confirm button is gone before the write
   * lands — so a double-confirm has nothing to click on. That closes the double-confirm
   * question at the DOM level by construction rather than by racing the `inFlightRef`.
   *
   * ⚠️ THIS IS NOT A pitfall-#86 GUARD, and an earlier draft of it claimed to be one.
   * Removing the `flushSync` from `handleConfirmImport` was mutated in and this test
   * still passed: `fireEvent.click` runs inside a synchronous `act()`, which flushes the
   * pending update regardless. Nothing here distinguishes flushSync from a plain
   * setState. A real guard for it needs a harness that does not act()-flush.
   */
  it("the applying step renders and the Confirm button is gone before the write lands", async () => {
    renderSection();
    await pickFile(serializeExport([createProject(NAME_A, "2026-04-06")]));

    confirmImport();

    expect(screen.getByLabelText("Applying import…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm Import" })).toBeNull();

    await waitFor(() => {
      expect(screen.getByRole("status")).toBeInTheDocument();
    });
  });

  it("drift between preview and apply surfaces the driftSkipped sub-message", async () => {
    const drifter = createProject(NAME_C, "2026-04-06");
    renderSection();
    await pickFile(
      serializeExport([createProject(NAME_A, "2026-04-06"), drifter])
    );
    // No conflicts at preview time. Now the id appears underneath the open preview.
    seedStore([drifter]);

    confirmImport();

    await waitFor(() => {
      expect(screen.getByRole("status")).toBeInTheDocument();
    });
    const banner = screen.getByRole("status");
    expect(banner).toHaveTextContent("Import complete: 1 added.");
    // Was pinned as "1 project **were** skipped" — recorded-not-specified — from the day
    // this file landed (#246) until v0.62.1 fixed it. Now a guard on correct output:
    // confirmed by reverting the source and checking THIS test fails.
    expect(banner).toHaveTextContent(
      "1 project was skipped because conflicts emerged after the preview opened."
    );
  });

  it("two drifting projects inflect both the noun and the verb", async () => {
    const drifterA = createProject(NAME_B, "2026-04-06");
    const drifterB = createProject(NAME_C, "2026-04-06");
    renderSection();
    await pickFile(
      serializeExport([
        createProject(NAME_A, "2026-04-06"),
        drifterA,
        drifterB,
      ])
    );
    seedStore([drifterA, drifterB]);

    confirmImport();

    await waitFor(() => {
      expect(screen.getByRole("status")).toBeInTheDocument();
    });
    // The other arm of the same ternary — untested before v0.62.1, which is how the
    // singular arm went wrong unnoticed.
    expect(screen.getByRole("status")).toHaveTextContent(
      "2 projects were skipped because conflicts emerged after the preview opened."
    );
  });

  it("a storage write failure surfaces the errors sub-message via role=alert", async () => {
    renderSection();
    await pickFile(serializeExport([createProject(NAME_A, "2026-04-06")]));

    // Fail only the project write. The scenario-memory key is left alone so the count
    // reflects one failed project, not one project counted twice.
    const realSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key: string,
      value: string
    ) {
      if (key.startsWith("spert:project:")) throw new Error("disk on fire");
      realSetItem.call(this, key, value);
    });

    confirmImport();

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    const banner = screen.getByRole("alert");
    expect(banner).toHaveTextContent("Import finished with errors");
    expect(banner).toHaveTextContent(
      "1 project could not be saved to local storage."
    );
  });
});

// -- Escape, and the cloud-pending gate ---------------------------------------

describe("ImportSection — Escape cancels the preview", () => {
  it("Escape inside the preview region returns to idle", async () => {
    renderSection();
    await pickFile(serializeExport([createProject(NAME_A, "2026-04-06")]));
    expect(readyToImportNames()).toEqual([NAME_A]);

    fireEvent.keyDown(previewRegion(), { key: "Escape" });

    expect(screen.queryByRole("region")).toBeNull();
    expect(screen.queryByText(NAME_A)).toBeNull();
    expect(useProjectStore.getState().projects).toHaveLength(0);
  });

  it("a non-Escape key leaves the preview standing", async () => {
    renderSection();
    await pickFile(serializeExport([createProject(NAME_A, "2026-04-06")]));

    fireEvent.keyDown(previewRegion(), { key: "Enter" });

    expect(readyToImportNames()).toEqual([NAME_A]);
  });
});

describe("ImportSection — the cloud-pending gate", () => {
  it("cloud mode with unloaded data disables the button and explains why", () => {
    mockedUseStorage.mockReturnValue({
      mode: "cloud",
      storageReady: true,
    } as unknown as ReturnType<typeof useStorage>);
    useProjectStore.setState({ cloudDataLoaded: false });
    renderSection();

    expect(screen.getByRole("button", { name: "Choose File" })).toBeDisabled();
    expect(
      screen.getByText(/Cloud projects are still loading\./)
    ).toBeInTheDocument();
  });

  it("the disabled button cannot reach the file input", () => {
    mockedUseStorage.mockReturnValue({
      mode: "cloud",
      storageReady: true,
    } as unknown as ReturnType<typeof useStorage>);
    useProjectStore.setState({ cloudDataLoaded: false });
    renderSection();
    let clicks = 0;
    fileInput().addEventListener("click", () => {
      clicks++;
    });

    fireEvent.click(screen.getByRole("button", { name: "Choose File" }));

    expect(clicks).toBe(0);
  });

  it("cloud mode with data loaded enables the button and drops the note", () => {
    mockedUseStorage.mockReturnValue({
      mode: "cloud",
      storageReady: true,
    } as unknown as ReturnType<typeof useStorage>);
    useProjectStore.setState({ cloudDataLoaded: true });
    renderSection();

    expect(screen.getByRole("button", { name: "Choose File" })).toBeEnabled();
    expect(screen.queryByText(/Cloud projects are still loading\./)).toBeNull();
  });
});

describe("ImportSection — cloud hydration under an open preview", () => {
  it("a conflict that appears while the preview is open is announced and offered for resolution", async () => {
    mockedUseStorage.mockReturnValue({
      mode: "cloud",
      storageReady: true,
    } as unknown as ReturnType<typeof useStorage>);
    useProjectStore.setState({ cloudDataLoaded: true });

    const incoming = createProject(NAME_A, "2026-04-06");
    const { rerender } = render(<ImportSection projects={[]} />);
    await pickFile(serializeExport([incoming]));
    expect(readyToImportNames()).toEqual([NAME_A]);
    expect(screen.queryAllByRole("radiogroup")).toHaveLength(0);

    // A peer-driven refresh: cloud data cycles, and the project now exists remotely.
    // `handleModelsChanged` drives exactly this true→false→true transition.
    useProjectStore.setState({ projects: [incoming], cloudDataLoaded: false });
    rerender(<ImportSection projects={[incoming]} />);
    useProjectStore.setState({ cloudDataLoaded: true });

    await waitFor(() => {
      expect(screen.getAllByRole("radiogroup")).toHaveLength(1);
    });
    expect(
      screen.getByText(/Your cloud projects finished loading\./)
    ).toHaveTextContent("1 new conflict detected");
    // The re-validated preview replaced the ready-to-import entry with a decision.
    expect(screen.queryByText("Ready to import:")).toBeNull();
    expect(
      within(
        screen.getByRole("radiogroup", { name: new RegExp(NAME_A) })
      ).getByRole("radio", { name: "Skip" })
    ).toBeChecked();
  });
});

// -- Bundled preferences ------------------------------------------------------

describe("ImportSection — bundled preferences are opt-in", () => {
  const bundled: UserPreferences = {
    ...DEFAULT_USER_PREFERENCES,
    dateFormat: "DD/MM/YYYY",
    defaultTrialCount: 2500,
  };

  const withPreferences = () =>
    serializeExport([createProject(NAME_A, "2026-04-06")], {
      includePreferences: true,
      preferences: bundled,
    });

  it("a file carrying preferences renders the warning with the box unchecked", async () => {
    renderSection();
    await pickFile(withPreferences());

    expect(screen.getByText("Preferences included")).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", {
        name: /Replace my preferences with values from this file/,
      })
    ).not.toBeChecked();
  });

  it("confirming without checking the box keeps the user's preferences", async () => {
    renderSection();
    await pickFile(withPreferences());

    confirmImport();

    await waitFor(() => {
      expect(screen.getByRole("status")).toBeInTheDocument();
    });
    expect(usePreferencesStore.getState().preferences.dateFormat).toBe(
      DEFAULT_USER_PREFERENCES.dateFormat
    );
    expect(usePreferencesStore.getState().preferences.defaultTrialCount).toBe(
      DEFAULT_USER_PREFERENCES.defaultTrialCount
    );
  });

  it("checking the box and confirming replaces them with the file's values", async () => {
    renderSection();
    await pickFile(withPreferences());

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /Replace my preferences with values from this file/,
      })
    );
    confirmImport();

    await waitFor(() => {
      expect(screen.getByRole("status")).toBeInTheDocument();
    });
    expect(usePreferencesStore.getState().preferences.dateFormat).toBe(
      "DD/MM/YYYY"
    );
    expect(usePreferencesStore.getState().preferences.defaultTrialCount).toBe(
      2500
    );
  });

  it("a file without preferences renders no preferences warning", async () => {
    renderSection();
    await pickFile(serializeExport([createProject(NAME_A, "2026-04-06")]));

    expect(screen.queryByText("Preferences included")).toBeNull();
    expect(
      screen.queryByRole("checkbox", {
        name: /Replace my preferences with values from this file/,
      })
    ).toBeNull();
  });
});

// -- The round trip the smoke pass could not finish ---------------------------

describe("ImportSection — export → clear → re-import", () => {
  it("re-imports a serialized project after the store is cleared", async () => {
    const original = createProject(NAME_A, "2026-04-06");
    seedStore([original]);
    // The export half passed in the v0.60.0 smoke pass; this is the half that did not.
    const exported = serializeExport(useProjectStore.getState().projects);

    seedStore([]);
    renderSection([]);
    await pickFile(exported);

    expect(readyToImportNames()).toEqual([NAME_A]);
    confirmImport();

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(
        "Import complete: 1 added."
      );
    });
    const restored = useProjectStore.getState().projects;
    expect(restored).toHaveLength(1);
    expect(restored[0]!.id).toBe(original.id);
    expect(restored[0]!.name).toBe(NAME_A);
    expect(restored[0]!.scenarios).toHaveLength(1);
    // …and it survived the trip through localStorage, not just React state.
    expect(
      localStorage.getItem(`spert:project:local:${original.id}`)
    ).toContain(NAME_A);
  });
});
