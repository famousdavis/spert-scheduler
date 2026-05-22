// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import {
  createProject,
  createActivity,
  addActivityToScenario,
  addDependency,
} from "@app/api/project-service";
import {
  serializeExport,
  validateImport,
} from "@app/api/export-import-service";
import { SCHEMA_VERSION } from "@domain/models/types";
import type { Project } from "@domain/models/types";

describe("Export/Import integration", () => {
  it("round-trips a project with activities through export and import", () => {
    // Create a project with activities
    const project = createProject("IT Migration", "2025-02-03");
    const scenario = project.scenarios[0]!;
    const a1 = createActivity("Gather requirements", scenario.settings);
    const a2 = createActivity("Build prototype", scenario.settings);
    const updatedScenario = addActivityToScenario(
      addActivityToScenario(scenario, a1),
      a2
    );
    const fullProject: Project = {
      ...project,
      scenarios: [updatedScenario],
    };

    // Export
    const json = serializeExport([fullProject]);

    // Import into a fresh context (no existing projects)
    const result = validateImport(json, []);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.projects).toHaveLength(1);
    expect(result.conflicts).toHaveLength(0);

    const imported = result.projects[0]!;
    expect(imported.name).toBe("IT Migration");
    expect(imported.scenarios).toHaveLength(1);
    expect(imported.scenarios[0]!.activities).toHaveLength(2);
    expect(imported.scenarios[0]!.activities[0]!.name).toBe(
      "Gather requirements"
    );
    expect(imported.scenarios[0]!.activities[1]!.name).toBe(
      "Build prototype"
    );
  });

  it("imports a v1 project and applies migrations", () => {
    const v1Project = {
      id: "v1-legacy",
      name: "Legacy v1",
      createdAt: new Date().toISOString(),
      schemaVersion: 1,
      scenarios: [
        {
          id: "s1",
          name: "Baseline",
          startDate: "2025-01-06",
          activities: [],
          settings: {
            defaultConfidenceLevel: "mediumConfidence",
            defaultDistributionType: "normal",
            trialCount: 50000,
            rngSeed: "seed-123",
            probabilityTarget: 0.5,
          },
        },
      ],
      globalCalendarOverride: {
        holidays: ["2025-12-25", "2025-01-01"],
      },
    };

    const json = JSON.stringify({
      format: "spert-scheduler-export",
      appVersion: "0.0.1",
      exportedAt: new Date().toISOString(),
      schemaVersion: 1,
      projects: [v1Project],
    });

    const result = validateImport(json, []);
    expect(result.success).toBe(true);
    if (!result.success) return;

    const imported = result.projects[0]!;
    // v1→v2: projectProbabilityTarget added
    expect(imported.scenarios[0]!.settings.projectProbabilityTarget).toBe(
      0.95
    );
    // v2→v3: holidays migrated from string[] to Holiday[]
    expect(imported.globalCalendarOverride!.holidays).toHaveLength(2);
    expect(imported.globalCalendarOverride!.holidays[0]!.startDate).toBe(
      "2025-12-25"
    );
    expect(imported.globalCalendarOverride!.holidays[0]!.endDate).toBe(
      "2025-12-25"
    );
    expect(imported.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it("detects ID conflicts when importing existing projects", () => {
    const existing = createProject("Already Here", "2025-06-01");
    const json = serializeExport([existing]);

    const result = validateImport(json, [existing]);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]!.existingProject.id).toBe(existing.id);
    expect(result.conflicts[0]!.importedProject.id).toBe(existing.id);
  });

  it("handles mixed conflict and non-conflict projects", () => {
    const existing = createProject("Existing", "2025-06-01");
    const brandNew = createProject("Brand New", "2025-07-01");

    const json = serializeExport([existing, brandNew]);
    const result = validateImport(json, [existing]);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.projects).toHaveLength(2);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]!.importedProject.name).toBe("Existing");
  });

  it("round-trips a project with dependencies through export and import", () => {
    const project = createProject("Dep Project", "2025-03-01", { dependencyMode: true });
    let scenario = project.scenarios[0]!;
    const a1 = createActivity("Phase 1", scenario.settings);
    const a2 = createActivity("Phase 2", scenario.settings);
    const a3 = createActivity("Phase 3", scenario.settings);

    scenario = addActivityToScenario(scenario, a1);
    scenario = addActivityToScenario(scenario, a2);
    scenario = addActivityToScenario(scenario, a3);

    // Add deps: A1→A2, A2→A3 (with 3 days lag)
    scenario = addDependency(scenario, a1.id, a2.id, "FS", 0);
    scenario = addDependency(scenario, a2.id, a3.id, "FS", 3);

    const fullProject: Project = {
      ...project,
      scenarios: [scenario],
    };

    const json = serializeExport([fullProject]);
    const result = validateImport(json, []);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const imported = result.projects[0]!;
    const importedScenario = imported.scenarios[0]!;

    // Verify dependencies survive round-trip
    expect(importedScenario.dependencies).toHaveLength(2);
    expect(importedScenario.settings.dependencyMode).toBe(true);

    // Verify dep details
    expect(importedScenario.dependencies[0]!.fromActivityId).toBe(a1.id);
    expect(importedScenario.dependencies[0]!.toActivityId).toBe(a2.id);
    expect(importedScenario.dependencies[0]!.type).toBe("FS");
    expect(importedScenario.dependencies[0]!.lagDays).toBe(0);

    expect(importedScenario.dependencies[1]!.fromActivityId).toBe(a2.id);
    expect(importedScenario.dependencies[1]!.toActivityId).toBe(a3.id);
    expect(importedScenario.dependencies[1]!.lagDays).toBe(3);
  });

  it("round-trips a scenario with multiple bands intact", () => {
    const project = createProject("Bands Round-Trip", "2026-05-01");
    const scenario = project.scenarios[0]!;
    const a1 = createActivity("Activity 1", scenario.settings);
    const a2 = createActivity("Activity 2", scenario.settings);
    const withAct = addActivityToScenario(addActivityToScenario(scenario, a1), a2);
    const withBands = {
      ...withAct,
      bands: [
        { id: "b1", name: "Phase 1", insertBeforeActivityId: a1.id, color: "#3366FF" },
        { id: "b2", name: "Phase 2", insertBeforeActivityId: a2.id },
        { id: "b3", name: "Trailing", insertBeforeActivityId: null, color: "#FF8800" },
      ],
    };
    const fullProject: Project = { ...project, scenarios: [withBands] };

    const json = serializeExport([fullProject]);
    const result = validateImport(json, []);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const importedBands = result.projects[0]!.scenarios[0]!.bands!;
    expect(importedBands).toHaveLength(3);
    expect(importedBands[0]).toEqual({
      id: "b1", name: "Phase 1", insertBeforeActivityId: a1.id, color: "#3366FF",
    });
    expect(importedBands[1]).toEqual({
      id: "b2", name: "Phase 2", insertBeforeActivityId: a2.id,
    });
    expect(importedBands[2]).toEqual({
      id: "b3", name: "Trailing", insertBeforeActivityId: null, color: "#FF8800",
    });
  });

  it("v20 export (no bands field) imports with bands: [] via migration", () => {
    // Hand-craft a v20-shaped envelope with no `bands` field anywhere
    const v20Envelope = {
      format: "spert-scheduler-export",
      appVersion: "0.44.3",
      exportedAt: "2026-05-01T00:00:00.000Z",
      schemaVersion: 20,
      projects: [
        {
          id: "p1",
          name: "Pre-bands project",
          createdAt: "2026-05-01T00:00:00.000Z",
          schemaVersion: 20,
          scenarios: [
            {
              id: "s1",
              name: "Baseline",
              startDate: "2026-05-01",
              activities: [],
              dependencies: [],
              milestones: [],
              settings: {
                defaultConfidenceLevel: "mediumConfidence",
                defaultDistributionType: "logNormal",
                trialCount: 10000,
                rngSeed: "seed",
                probabilityTarget: 0.5,
                projectProbabilityTarget: 0.95,
              },
            },
          ],
        },
      ],
    };
    const json = JSON.stringify(v20Envelope);
    const result = validateImport(json, []);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.projects[0]!.scenarios[0]!.bands).toEqual([]);
  });
});
