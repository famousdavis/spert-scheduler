// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * WI-164: the 51st Section. The schema caps a scenario at 50, and nothing capped "+ Section", so the
 * 51st went into memory and every later save of the project was refused until one was deleted. At 50
 * the button is off and a line under it says why; the store holds for any other caller.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { createActivity, createProject, createScenario } from "@app/api/project-service";
import { LocalStorageRepository } from "@infrastructure/persistence/local-storage-repository";
import { useProjectStore } from "@ui/hooks/use-project-store";
import { SECTION_CAP, type ActivityBand, type Project } from "@domain/models/types";
import { UnifiedActivityGrid } from "./UnifiedActivityGrid";

const settings = createScenario("S", "2026-11-02").settings;
const bandsOf = (n: number): ActivityBand[] =>
  Array.from({ length: n }, (_, i) => ({ id: `b${i}`, name: `B${i}`, insertBeforeActivityId: null }));
const NOTE = "A scenario holds up to 50 Sections. Delete one to add another.";

function grid(n: number, isScenarioLocked = false) {
  render(
    <UnifiedActivityGrid
      activities={[createActivity("A", settings)]}
      bands={bandsOf(n)}
      scheduledActivities={[]}
      activityProbabilityTarget={0.5}
      onUpdate={vi.fn()}
      onDelete={vi.fn()}
      onAdd={vi.fn()}
      onAddBand={vi.fn()}
      onDeleteBand={vi.fn()}
      onUpdateBand={vi.fn()}
      onReorderWithBands={vi.fn()}
      onValidityChange={vi.fn()}
      dependencyMode={false}
      activityNumberMap={null}
      isScenarioLocked={isScenarioLocked}
    />,
  );
  return screen.getByRole("button", { name: "Add section header" });
}

afterEach(cleanup);

describe('"+ Section" at the cap', () => {
  it("is on at 49, with no line", () => {
    expect(grid(SECTION_CAP - 1)).toBeEnabled();
    expect(screen.queryByText(NOTE)).toBeNull();
  });
  it("is off at 50, and the line under it, tied to the button, says why and what to do", () => {
    const button = grid(SECTION_CAP);
    expect(button).toBeDisabled();
    expect(screen.getByText(NOTE).id).toBe(button.getAttribute("aria-describedby"));
  });
});

describe('"+ Section" in a locked scenario', () => {
  it("is off for the lock, with no line: Delete one is not open to the user there", () => {
    expect(grid(SECTION_CAP, true)).toBeDisabled();
    expect(screen.queryByText(NOTE)).toBeNull();
  });
});

describe("the store's addBand at the cap", () => {
  const seed = (n: number) => {
    const scenario = { ...createScenario("S1", "2026-11-02"), activities: [createActivity("A", settings)], bands: bandsOf(n) };
    const project: Project = { ...createProject("P", "2026-11-02"), scenarios: [scenario] };
    useProjectStore.setState({ projects: [project], undoStack: [], redoStack: [] });
    return { projectId: project.id, scenarioId: scenario.id };
  };
  const bands = () => useProjectStore.getState().projects[0]!.scenarios[0]!.bands!;
  beforeEach(() => localStorage.clear());

  it("adds the 50th, and saves it", () => {
    const { projectId, scenarioId } = seed(SECTION_CAP - 1);
    useProjectStore.getState().addBand(projectId, scenarioId);
    expect(bands()).toHaveLength(SECTION_CAP);
    expect(new LocalStorageRepository().load(projectId)!.scenarios[0]!.bands).toHaveLength(SECTION_CAP);
  });
  it("does not add a 51st, opens no undo frame, and a later edit still saves", () => {
    const { projectId, scenarioId } = seed(SECTION_CAP);
    useProjectStore.getState().addBand(projectId, scenarioId);
    expect(bands()).toHaveLength(SECTION_CAP);
    expect(useProjectStore.getState().undoStack).toHaveLength(0);
    useProjectStore.getState().updateBand(projectId, scenarioId, "b0", { name: "Renamed at 50" });
    expect(new LocalStorageRepository().load(projectId)!.scenarios[0]!.bands![0]!.name).toBe("Renamed at 50");
  });
});
