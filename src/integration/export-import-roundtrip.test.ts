import { describe, it, expect } from "vitest";
import {
  createProject,
  createActivity,
  addActivityToScenario,
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
});
