// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import {
  serializeExport,
  serializeRecoveryExport,
  buildExportEnvelope,
  validateImport,
  normalizeProjectName,
  mergeDecisions,
  MAX_FILE_SIZE_BYTES,
  type ConflictDecision,
} from "./export-import-service";
import { createProject, createActivity, addActivityToScenario } from "./project-service";
import { LocalStorageRepository } from "@infrastructure/persistence/local-storage-repository";
import { SCHEMA_VERSION, DEFAULT_USER_PREFERENCES } from "@domain/models/types";
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

describe("includeSimulationResults option", () => {
  function makeProjectWithSimulation() {
    const project = makeProject("With Simulation", "2025-01-01");
    project.scenarios[0]!.simulationResults = {
      id: "sim1",
      timestamp: "2025-01-01T00:00:00.000Z",
      trialCount: 1000,
      seed: "test",
      engineVersion: "1.0.0",
      percentiles: { 50: 10, 95: 20 },
      histogramBins: [],
      mean: 10,
      standardDeviation: 2,
      minSample: 5,
      maxSample: 25,
      samples: [10, 11, 12],
    };
    return project;
  }

  it("strips simulation results by default", () => {
    const project = makeProjectWithSimulation();
    const json = serializeExport([project]);
    const parsed = JSON.parse(json);

    expect(parsed.projects[0].scenarios[0].simulationResults).toBeUndefined();
  });

  it("strips simulation results when includeSimulationResults is false", () => {
    const project = makeProjectWithSimulation();
    const json = serializeExport([project], { includeSimulationResults: false });
    const parsed = JSON.parse(json);

    expect(parsed.projects[0].scenarios[0].simulationResults).toBeUndefined();
  });

  it("includes simulation results when includeSimulationResults is true", () => {
    const project = makeProjectWithSimulation();
    const json = serializeExport([project], { includeSimulationResults: true });
    const parsed = JSON.parse(json);

    expect(parsed.projects[0].scenarios[0].simulationResults).toBeDefined();
    expect(parsed.projects[0].scenarios[0].simulationResults.mean).toBe(10);
    expect(parsed.projects[0].scenarios[0].simulationResults.samples).toEqual([
      10, 11, 12,
    ]);
  });
});

// -- v0.43.0 additions ------------------------------------------------------

describe("normalizeProjectName", () => {
  it("trims and lowercases", () => {
    expect(normalizeProjectName("  Hello World  ")).toBe("hello world");
    expect(normalizeProjectName("ABC")).toBe("abc");
    expect(normalizeProjectName("")).toBe("");
    expect(normalizeProjectName("   ")).toBe("");
  });
});

describe("detectNameConflicts (via validateImport)", () => {
  it("flags same name + different ID as a nameConflict", () => {
    const existing = makeProject("Same Name");
    const incoming = makeProject("Same Name");
    expect(incoming.id).not.toBe(existing.id);
    const json = serializeExport([incoming]);
    const result = validateImport(json, [existing]);
    if (!result.success) throw new Error("expected success");
    expect(result.conflicts).toHaveLength(0);
    expect(result.nameConflicts).toHaveLength(1);
    expect(result.nameConflicts[0]!.existingProject.id).toBe(existing.id);
  });

  it("treats same ID as an ID conflict (no name conflict for same project)", () => {
    const existing = makeProject("Same Name");
    const incoming: Project = { ...existing, name: "Same Name" };
    const json = serializeExport([incoming]);
    const result = validateImport(json, [existing]);
    if (!result.success) throw new Error("expected success");
    expect(result.conflicts).toHaveLength(1);
    expect(result.nameConflicts).toHaveLength(0);
  });

  it("excludes empty/whitespace names from name matching", () => {
    const existing = { ...makeProject("Untitled"), name: "   " };
    const incoming = { ...makeProject("Other"), name: "   " };
    const json = serializeExport([incoming]);
    const result = validateImport(json, [existing]);
    if (!result.success) throw new Error("expected success");
    expect(result.nameConflicts).toHaveLength(0);
  });

  it("first-insert-wins when two existing projects share a name", () => {
    const existing1 = makeProject("Shared");
    const existing2 = makeProject("Shared");
    const incoming = makeProject("Shared");
    const json = serializeExport([incoming]);
    const result = validateImport(json, [existing1, existing2]);
    if (!result.success) throw new Error("expected success");
    expect(result.nameConflicts).toHaveLength(1);
    expect(result.nameConflicts[0]!.existingProject.id).toBe(existing1.id);
  });

  it("is case-insensitive and ignores leading/trailing whitespace", () => {
    const existing = makeProject("HELLO");
    const incoming = { ...makeProject("hello"), name: "  hello  " };
    const json = serializeExport([incoming]);
    const result = validateImport(json, [existing]);
    if (!result.success) throw new Error("expected success");
    expect(result.nameConflicts).toHaveLength(1);
  });
});

describe("mergeDecisions", () => {
  const baseDecision = (
    importedProjectId: string,
    overrides: Partial<ConflictDecision> = {}
  ): ConflictDecision => ({
    importedProjectId,
    kind: "id",
    originalExistingId: importedProjectId,
    action: "skip",
    ...overrides,
  });

  it("preserves the user's action when kind+target match", () => {
    const prev: ConflictDecision[] = [
      baseDecision("p1", { action: "replace" }),
    ];
    const fresh: ConflictDecision[] = [baseDecision("p1")];
    const { decisions, diff } = mergeDecisions(prev, fresh);
    expect(decisions[0]!.action).toBe("replace");
    expect(diff).toEqual({
      vanished: 0,
      newConflicts: 0,
      kindChanged: 0,
      targetChanged: 0,
    });
  });

  it("applies fresh default and increments kindChanged when kind flips", () => {
    const prev: ConflictDecision[] = [
      baseDecision("p1", { kind: "id", action: "replace" }),
    ];
    const fresh: ConflictDecision[] = [
      baseDecision("p1", { kind: "name", action: "copy" }),
    ];
    const { decisions, diff } = mergeDecisions(prev, fresh);
    expect(decisions[0]!.action).toBe("copy");
    expect(diff.kindChanged).toBe(1);
  });

  it("applies fresh default and increments targetChanged when originalExistingId differs", () => {
    const prev: ConflictDecision[] = [
      baseDecision("p1", { originalExistingId: "old", action: "replace" }),
    ];
    const fresh: ConflictDecision[] = [
      baseDecision("p1", { originalExistingId: "new", action: "copy" }),
    ];
    const { decisions, diff } = mergeDecisions(prev, fresh);
    expect(decisions[0]!.action).toBe("copy");
    expect(diff.targetChanged).toBe(1);
  });

  it("counts newConflicts for fresh decisions absent from prev", () => {
    const prev: ConflictDecision[] = [];
    const fresh: ConflictDecision[] = [baseDecision("p2")];
    const { decisions, diff } = mergeDecisions(prev, fresh);
    expect(decisions).toHaveLength(1);
    expect(diff.newConflicts).toBe(1);
  });

  it("counts vanished for prev decisions absent from fresh", () => {
    const prev: ConflictDecision[] = [baseDecision("p1", { action: "skip" })];
    const fresh: ConflictDecision[] = [];
    const { decisions, diff } = mergeDecisions(prev, fresh);
    expect(decisions).toHaveLength(0);
    expect(diff.vanished).toBe(1);
  });
});

describe("MAX_FILE_SIZE_BYTES export + validateImport size guard", () => {
  it("MAX_FILE_SIZE_BYTES is 10 MB", () => {
    expect(MAX_FILE_SIZE_BYTES).toBe(10 * 1024 * 1024);
  });

  it("validateImport rejects strings over the cap", () => {
    const huge = "x".repeat(MAX_FILE_SIZE_BYTES + 1);
    const result = validateImport(huge, []);
    expect(result.success).toBe(false);
    if (result.success) throw new Error("unreachable");
    expect(result.error).toMatch(/too large/i);
  });
});

describe("preferences round-trip", () => {
  it("serializeExport with includePreferences:true → validateImport returns preferences", () => {
    const proj = makeProject("With Prefs");
    const customPrefs = {
      ...DEFAULT_USER_PREFERENCES,
      defaultTrialCount: 99999,
      theme: "dark" as const,
    };
    const json = serializeExport([proj], {
      includePreferences: true,
      preferences: customPrefs,
    });
    const result = validateImport(json, []);
    if (!result.success) throw new Error("expected success");
    expect(result.preferences).toBeDefined();
    expect(result.preferences!.defaultTrialCount).toBe(99999);
    expect(result.preferences!.theme).toBe("dark");
  });

  it("serializeExport without includePreferences → validateImport returns no preferences", () => {
    const proj = makeProject("No Prefs");
    const json = serializeExport([proj]);
    const result = validateImport(json, []);
    if (!result.success) throw new Error("expected success");
    expect(result.preferences).toBeUndefined();
  });
});

// -- The recovery card's Export (v0.75.1) ------------------------------------

/**
 * The dashboard's recovery card downloads a project this app could not load. That file used to
 * be the stored text alone, which the import refuses at its first check ("Not a SPERT Scheduler
 * export file."), so a backup could never come back in, even once repaired. It is now the stored
 * project, verbatim, inside the export file's envelope.
 */
describe("serializeRecoveryExport", () => {
  const ACTIVITY_PATH = "scenarios.0.activities.0.name";

  /** A project with one activity, so there is an activity name to break. */
  function projectWithActivity(name: string): Project {
    const project = makeProject(name);
    const scenario = project.scenarios[0]!;
    project.scenarios[0] = addActivityToScenario(
      scenario,
      createActivity("Survey the site", scenario.settings)
    );
    return project;
  }

  /** The project's stored text, written by the repository and read back through its own key. */
  function storedText(project: Project): string {
    const repo = new LocalStorageRepository();
    repo.save(project);
    const raw = repo.getRawData(project.id);
    repo.removeById(project.id);
    if (raw === null) throw new Error("the repository stored nothing");
    return raw;
  }

  function wrap(raw: string): string {
    const file = serializeRecoveryExport(raw);
    if (file === null) throw new Error("expected the stored text to be wrapped");
    return file;
  }

  it("wraps a healthy project's stored text into a file the import accepts; the text alone is refused", () => {
    const raw = storedText(projectWithActivity("Krikkit Ledger"));

    // Control: what the card used to download.
    const alone = validateImport(raw, []);
    if (alone.success) throw new Error("expected the bare stored text to be refused");
    expect(alone.error).toBe("Not a SPERT Scheduler export file.");

    const wrapped = validateImport(wrap(raw), []);
    if (!wrapped.success) throw new Error(`expected success: ${wrapped.error}`);
    expect(wrapped.projects.map((p) => p.name)).toEqual(["Krikkit Ledger"]);
  });

  it("names the failing field of a broken project, and imports once the file is fixed by hand", () => {
    const stored = JSON.parse(storedText(projectWithActivity("Krikkit Ledger")));
    stored.scenarios[0].activities[0].name = "x".repeat(201);
    const file = wrap(JSON.stringify(stored));

    const broken = validateImport(file, []);
    if (broken.success) throw new Error("expected a 201-character name to fail validation");
    expect(broken.error).toBe('Project "Krikkit Ledger" failed validation.');
    expect(broken.details).toBe(
      `${ACTIVITY_PATH}: Too big: expected string to have <=200 characters`
    );

    // The hand fix, made in the downloaded file itself.
    const fixed = JSON.parse(file);
    fixed.projects[0].scenarios[0].activities[0].name = "x".repeat(200);
    const repaired = validateImport(JSON.stringify(fixed), []);
    if (!repaired.success) throw new Error(`expected the fixed file to import: ${repaired.error}`);
    expect(repaired.projects[0]!.scenarios[0]!.activities[0]!.name).toBe("x".repeat(200));
  });

  it("keeps the stored project verbatim, simulation results and samples included", () => {
    const project = projectWithActivity("Krikkit Ledger");
    project.scenarios[0]!.simulationResults = {
      id: "sim1",
      timestamp: "2025-01-01T00:00:00.000Z",
      trialCount: 1000,
      seed: "test",
      engineVersion: "1.0.0",
      percentiles: { 50: 10, 95: 20 },
      histogramBins: [],
      mean: 10,
      standardDeviation: 2,
      minSample: 5,
      maxSample: 25,
      samples: [10, 11, 12],
    };
    const raw = storedText(project);

    const envelope = JSON.parse(wrap(raw));
    expect(envelope.projects).toEqual([JSON.parse(raw)]);
    expect(envelope.projects[0].scenarios[0].simulationResults.samples).toEqual([10, 11, 12]);

    // Control: the ordinary export of the same project drops its results.
    const ordinary = JSON.parse(serializeExport([project]));
    expect(ordinary.projects[0].scenarios[0].simulationResults).toBeUndefined();
  });

  it("carries exactly the export file's envelope fields", () => {
    const project = projectWithActivity("Krikkit Ledger");
    const envelope = JSON.parse(wrap(storedText(project)));

    expect(Object.keys(envelope)).toEqual(Object.keys(buildExportEnvelope([project])));
    expect(envelope).toMatchObject({
      format: "spert-scheduler-export",
      appVersion: APP_VERSION,
      schemaVersion: SCHEMA_VERSION,
    });
    expect(Number.isNaN(Date.parse(envelope.exportedAt))).toBe(false);
  });

  it("returns null for stored text that is not a JSON object, so the card saves it as it is", () => {
    for (const raw of ["{not json", "[]", "42", "null", '"text"']) {
      expect(serializeRecoveryExport(raw), raw).toBeNull();
    }
    // Control: any object is wrapped, even an empty one.
    expect(serializeRecoveryExport("{}")).not.toBeNull();
  });

  it("wraps a project with no schemaVersion as it is, and the import migrates it from version 1", () => {
    const stored = JSON.parse(storedText(projectWithActivity("Krikkit Ledger")));
    delete stored.schemaVersion;
    const file = wrap(JSON.stringify(stored));

    // Control: the wrapper did not supply a version of its own.
    expect(JSON.parse(file).projects[0]).not.toHaveProperty("schemaVersion");

    const result = validateImport(file, []);
    if (!result.success) throw new Error(`expected success: ${result.error}`);
    expect(result.projects[0]!.schemaVersion).toBe(SCHEMA_VERSION);
  });
});

describe("validateImport — the validation details name the field", () => {
  it("prints a root-level issue's message alone, and a field's issue with its path", () => {
    const rootIssue = validateImport(
      JSON.stringify({ ...buildExportEnvelope([]), projects: [[]] }),
      []
    );
    if (rootIssue.success) throw new Error("expected an array project to fail validation");
    expect(rootIssue.details).toBe("Invalid input: expected object, received array");

    // Control: the same file with an object missing its fields names each one.
    const fieldIssue = validateImport(
      JSON.stringify({ ...buildExportEnvelope([]), projects: [{ schemaVersion: SCHEMA_VERSION }] }),
      []
    );
    if (fieldIssue.success) throw new Error("expected an empty project to fail validation");
    expect(fieldIssue.details).toMatch(/^id: /);
  });
});

describe("validateImport — a malformed project is refused by what is wrong, never thrown", () => {
  const fileWith = (projects: unknown[]) => JSON.stringify({ ...buildExportEnvelope([]), projects });

  /** A version-1 project; its scenario is the one "applies migrations to older-version projects" imports. */
  const v1Project = (fields: Record<string, unknown>) => ({
    id: "legacy-quokka",
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
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
        },
      },
    ],
    ...fields,
  });

  it("refuses an entry that is not an object by its position, and still refuses the whole file", () => {
    // Control: the same file with a healthy project imports.
    const healthy = validateImport(fileWith([makeProject("Healthy Wombat")]), []);
    expect(healthy.success && healthy.projects.map((p) => p.name)).toEqual(["Healthy Wombat"]);

    for (const entry of [null, 42, "text", true]) {
      const json = fileWith([entry]);
      expect(() => validateImport(json, [])).not.toThrow();
      expect(validateImport(json, [])).toEqual({
        success: false,
        error: "Project #1 in this file is not a project.",
      });
    }

    const second = fileWith([makeProject("Healthy Wombat"), null]);
    expect(() => validateImport(second, [])).not.toThrow();
    expect(validateImport(second, [])).toEqual({
      success: false,
      error: "Project #2 in this file is not a project.",
    });
  });

  it("refuses a project whose migration throws, naming it, with the thrown message as the details", () => {
    // Control: the same project with a well-formed scenario migrates and imports.
    const healthy = validateImport(fileWith([v1Project({ name: "Quokka Legacy Plan" })]), []);
    expect(healthy.success && healthy.projects.map((p) => p.name)).toEqual(["Quokka Legacy Plan"]);

    const json = fileWith([v1Project({ name: "Quokka Legacy Plan", scenarios: [null] })]);
    expect(() => validateImport(json, [])).not.toThrow();
    const result = validateImport(json, []);
    if (result.success) throw new Error("expected the file to be refused");
    expect(result.error).toBe(
      'Project "Quokka Legacy Plan" could not be updated to this version of SPERT Scheduler.'
    );
    expect(result.details).toMatch(/\S/);

    // An unnamed project is named by its position, as the other refusals name it.
    const unnamed = validateImport(fileWith([v1Project({ scenarios: [null] })]), []);
    expect(!unnamed.success && unnamed.error).toBe(
      'Project "#1" could not be updated to this version of SPERT Scheduler.'
    );
  });

  it("leaves an array entry to the schema, which refuses it as before", () => {
    const json = fileWith([[]]);
    expect(() => validateImport(json, [])).not.toThrow();
    const result = validateImport(json, []);
    expect(!result.success && result.error).toBe('Project "#1" failed validation.');
  });
});
