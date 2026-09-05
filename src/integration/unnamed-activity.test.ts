// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach } from "vitest";
import { LocalStorageRepository } from "@infrastructure/persistence/local-storage-repository";
import {
  createProject,
  createActivity,
  addActivityToScenario,
} from "@app/api/project-service";
import { ProjectSchema } from "@domain/schemas/project.schema";
import { serializeExport, validateImport } from "@app/api/export-import-service";
import type { Project, Scenario } from "@domain/models/types";

/**
 * An unnamed activity must never make a project unloadable.
 *
 * `+ Add Activity` and both grid insert strips persist `name: ""` so the row's
 * native `placeholder` can render, and clearing an established activity's name
 * used to persist `""` too. `ActivitySchema.name` was `.min(1)`, and
 * `ProjectSchema.safeParse` is the LAST gate on all five load sites — so one
 * unnamed row made the whole project fail to open, everywhere at once.
 *
 * ⚠️ Every fixture here is built through the app's own constructors, never hand
 * written. A hand-built project can fail for an incidental reason and would then
 * still "pass" a fix that repaired something else entirely.
 */

/** A real project carrying one activity with the given name. */
function projectWithActivityNamed(name: string): Project {
  const project = createProject("Unnamed Activity Fixture", "2026-09-07");
  const scenario = project.scenarios[0]!;
  const activity = createActivity(name, scenario.settings);
  const withActivity: Scenario = addActivityToScenario(scenario, activity);
  return { ...project, scenarios: [withActivity] };
}

describe("An unnamed activity does not brick a project", () => {
  let repo: LocalStorageRepository;

  beforeEach(() => {
    localStorage.clear();
    repo = new LocalStorageRepository();
  });

  describe("the fixture itself", () => {
    // The premise, asserted before any behaviour: this fixture really is a
    // project whose ONLY defect (at the schema of c55f780) was the empty name.
    // At c55f780 this produced exactly one issue, path
    // scenarios.0.activities.0.name, code too_small — measured, not assumed.
    it("differs from a healthy project in the activity name and nothing else", () => {
      const named = projectWithActivityNamed("Design");
      const unnamed = projectWithActivityNamed("");

      const a = named.scenarios[0]!.activities[0]!;
      const b = unnamed.scenarios[0]!.activities[0]!;

      expect(a.name).toBe("Design");
      expect(b.name).toBe("");
      // Same shape apart from the name and the generated ids.
      expect({ ...a, id: "", name: "" }).toEqual({ ...b, id: "", name: "" });
    });

    it("the control fixture is valid, so a failure below means the name", () => {
      expect(ProjectSchema.safeParse(projectWithActivityNamed("Design")).success).toBe(true);
    });
  });

  describe("ProjectSchema", () => {
    it("accepts a project whose activity has an empty name", () => {
      const result = ProjectSchema.safeParse(projectWithActivityNamed(""));
      expect(result.success).toBe(true);
    });

    it("accepts a whitespace-only activity name", () => {
      const result = ProjectSchema.safeParse(projectWithActivityNamed("   "));
      expect(result.success).toBe(true);
    });

    // The relaxation is bounded, not removed.
    it("still rejects an over-length activity name", () => {
      const result = ProjectSchema.safeParse(projectWithActivityNamed("x".repeat(201)));
      expect(result.success).toBe(false);
    });
  });

  describe("the local load path", () => {
    it("loads a stored project whose activity has an empty name", () => {
      const project = projectWithActivityNamed("");
      repo.save(project);

      const result = repo.loadWithDiagnostics(project.id);

      // Report the validation detail on failure rather than a bare `false`.
      expect(result.success ? null : result.error.details).toBeNull();
      expect(result.success).toBe(true);
      expect(repo.load(project.id)).not.toBeNull();
      expect(repo.load(project.id)!.scenarios[0]!.activities[0]!.name).toBe("");
    });

    it("loads a stored project whose activity name is whitespace only", () => {
      const project = projectWithActivityNamed("   ");
      repo.save(project);
      expect(repo.loadWithDiagnostics(project.id).success).toBe(true);
    });

    it("reads the name back verbatim — nothing repairs or rewrites it on load", () => {
      const project = projectWithActivityNamed("");
      repo.save(project);
      const loaded = repo.load(project.id)!;
      // The placeholder is display-time only. A stored default would suppress
      // the grid's native placeholder forever, and a load-time repair would be
      // a write the user never asked for.
      expect(loaded.scenarios[0]!.activities[0]!.name).toBe("");
    });
  });

  describe("export and re-import", () => {
    it("round-trips a project containing an unnamed activity", () => {
      const project = projectWithActivityNamed("");

      // The normal Export (serializeExport), not the error card's raw-string
      // download — that one is refused at the envelope check before Zod runs,
      // for a reason unrelated to names. See WI-23.
      const json = serializeExport([project]);
      const result = validateImport(json, []);

      // Narrow the ImportResult union, reporting the refusal if there is one.
      expect(result.success ? null : result.error).toBeNull();
      if (!result.success) return;
      expect(result.projects[0]!.scenarios[0]!.activities[0]!.name).toBe("");
    });

    it("no longer loses healthy projects sharing a file with an unnamed one", () => {
      // migrateAndValidateProjects returns on the FIRST invalid project, so one
      // unnamed activity used to make an entire Export All Projects file
      // unimportable — every healthy project in it included.
      const healthy = projectWithActivityNamed("Design");
      const unnamed = projectWithActivityNamed("");

      const result = validateImport(serializeExport([unnamed, healthy]), []);

      expect(result.success ? null : result.error).toBeNull();
      if (!result.success) return;
      expect(result.projects).toHaveLength(2);
    });
  });
});
