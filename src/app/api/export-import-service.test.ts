import { describe, it, expect } from "vitest";
import {
  serializeExport,
  buildExportEnvelope,
  validateImport,
} from "./export-import-service";
import { createProject } from "./project-service";
import { SCHEMA_VERSION } from "@domain/models/types";
import { APP_VERSION } from "@app/constants";
import type { Project } from "@domain/models/types";

function makeProject(name: string, startDate = "2025-06-01"): Project {
  return createProject(name, startDate);
}

describe("buildExportEnvelope", () => {
  it("produces a valid envelope with correct metadata", () => {
    const projects = [makeProject("A"), makeProject("B")];
    const envelope = buildExportEnvelope(projects);

    expect(envelope.format).toBe("spert-scheduler-export");
    expect(envelope.appVersion).toBe(APP_VERSION);
    expect(envelope.schemaVersion).toBe(SCHEMA_VERSION);
    expect(envelope.projects).toHaveLength(2);
    expect(envelope.exportedAt).toBeTruthy();
  });
});

describe("serializeExport", () => {
  it("produces valid JSON", () => {
    const projects = [makeProject("Test")];
    const json = serializeExport(projects);
    const parsed = JSON.parse(json);

    expect(parsed.format).toBe("spert-scheduler-export");
    expect(parsed.projects).toHaveLength(1);
    expect(parsed.projects[0].name).toBe("Test");
  });
});

describe("validateImport", () => {
  it("rejects non-JSON input", () => {
    const result = validateImport("not json at all", []);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Invalid JSON");
    }
  });

  it("rejects JSON without format discriminator", () => {
    const result = validateImport(JSON.stringify({ foo: "bar" }), []);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Not a SPERT Scheduler export");
    }
  });

  it("rejects empty projects array", () => {
    const json = JSON.stringify({
      format: "spert-scheduler-export",
      appVersion: "0.1.0",
      exportedAt: new Date().toISOString(),
      schemaVersion: SCHEMA_VERSION,
      projects: [],
    });
    const result = validateImport(json, []);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("no projects");
    }
  });

  it("rejects projects with future schema version", () => {
    const project = makeProject("Future");
    const json = JSON.stringify({
      format: "spert-scheduler-export",
      appVersion: "99.0.0",
      exportedAt: new Date().toISOString(),
      schemaVersion: 999,
      projects: [{ ...project, schemaVersion: 999 }],
    });
    const result = validateImport(json, []);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("newer version");
    }
  });

  it("rejects projects that fail Zod validation", () => {
    const json = JSON.stringify({
      format: "spert-scheduler-export",
      appVersion: "0.1.0",
      exportedAt: new Date().toISOString(),
      schemaVersion: SCHEMA_VERSION,
      projects: [
        {
          id: "bad-project",
          name: "", // name must be min(1)
          createdAt: new Date().toISOString(),
          schemaVersion: SCHEMA_VERSION,
          scenarios: [],
        },
      ],
    });
    const result = validateImport(json, []);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("failed validation");
    }
  });

  it("accepts valid export and returns projects", () => {
    const projects = [makeProject("Valid A"), makeProject("Valid B")];
    const json = serializeExport(projects);
    const result = validateImport(json, []);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.projects).toHaveLength(2);
      expect(result.projects[0]!.name).toBe("Valid A");
      expect(result.projects[1]!.name).toBe("Valid B");
      expect(result.conflicts).toHaveLength(0);
    }
  });

  it("detects ID conflicts with existing projects", () => {
    const existing = [makeProject("Existing")];
    // Export the same project — same ID
    const json = serializeExport(existing);
    const result = validateImport(json, existing);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0]!.existingProject.name).toBe("Existing");
      expect(result.conflicts[0]!.importedProject.name).toBe("Existing");
    }
  });

  it("returns empty conflicts when no IDs overlap", () => {
    const existing = [makeProject("Existing")];
    const imported = [makeProject("New One")];
    const json = serializeExport(imported);
    const result = validateImport(json, existing);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.conflicts).toHaveLength(0);
    }
  });

  it("applies migrations to older-version projects", () => {
    // Simulate a v1 project (missing projectProbabilityTarget)
    const v1Project = {
      id: "legacy-001",
      name: "Legacy Project",
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
            rngSeed: "test-seed",
            probabilityTarget: 0.5,
            // Note: no projectProbabilityTarget (added in v2)
          },
        },
      ],
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
    if (result.success) {
      expect(result.projects).toHaveLength(1);
      const imported = result.projects[0]!;
      expect(imported.schemaVersion).toBe(SCHEMA_VERSION);
      // v1→v2 migration should have added projectProbabilityTarget
      expect(imported.scenarios[0]!.settings.projectProbabilityTarget).toBe(
        0.95
      );
    }
  });
});

describe("round-trip", () => {
  it("export then import preserves project data", () => {
    const original = [makeProject("Round Trip", "2025-03-15")];
    const json = serializeExport(original);
    const result = validateImport(json, []);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.projects).toHaveLength(1);
      const imported = result.projects[0]!;
      expect(imported.id).toBe(original[0]!.id);
      expect(imported.name).toBe("Round Trip");
      expect(imported.scenarios[0]!.startDate).toBe("2025-03-15");
      expect(imported.scenarios[0]!.name).toBe("Baseline");
    }
  });
});
