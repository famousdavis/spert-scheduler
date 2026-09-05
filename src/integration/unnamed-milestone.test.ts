// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach } from "vitest";
import { LocalStorageRepository } from "@infrastructure/persistence/local-storage-repository";
import { createProject } from "@app/api/project-service";
import { addMilestone } from "@app/api/milestone-service";
import { ProjectSchema, MilestoneSchema } from "@domain/schemas/project.schema";
import { serializeExport, validateImport } from "@app/api/export-import-service";
import type { Project } from "@domain/models/types";

/**
 * A milestone without a name must not make a project unloadable.
 *
 * The identical vector to the activity case closed in v0.65.0, on the other
 * `.min(1)` name field. **Adding** a milestone is guarded and trimmed
 * (`MilestonePanel.tsx:105-106`); **renaming** one was not guarded on any hop —
 * `MilestoneNameInput` → `useBufferedField` → `handleMilestoneNameCommit` →
 * `milestone-service.ts` `updateMilestone`, which has an existence guard, a
 * value-equality guard and then a blind spread, with no `safeParse` anywhere.
 * That asymmetry was the defect: clear a milestone name, blur, reload, and the
 * whole project failed `ProjectSchema` at load.
 *
 * ⚠️ Unlike the activity case, **nothing in the suite referenced `MilestoneSchema`
 * at all** — relaxing it produced 0 failures out of 2,949. These are the tests
 * that were missing.
 */

function projectWithMilestoneNamed(name: string): Project {
  const project = createProject("Unnamed Milestone Fixture", "2026-09-07");
  const scenario = project.scenarios[0]!;
  return {
    ...project,
    scenarios: [addMilestone(scenario, name, "2026-12-01")],
  };
}

describe("An unnamed milestone does not brick a project", () => {
  let repo: LocalStorageRepository;

  beforeEach(() => {
    localStorage.clear();
    repo = new LocalStorageRepository();
  });

  describe("the fixture itself", () => {
    it("differs from a healthy project in the milestone name and nothing else", () => {
      const a = projectWithMilestoneNamed("Go-Live").scenarios[0]!.milestones[0]!;
      const b = projectWithMilestoneNamed("").scenarios[0]!.milestones[0]!;

      expect(a.name).toBe("Go-Live");
      expect(b.name).toBe("");
      expect({ ...a, id: "", name: "" }).toEqual({ ...b, id: "", name: "" });
    });

    it("the control fixture is valid, so a failure below means the name", () => {
      expect(ProjectSchema.safeParse(projectWithMilestoneNamed("Go-Live")).success).toBe(true);
    });
  });

  describe("MilestoneSchema", () => {
    // Written as the post-fix assertion because there was no prior test to
    // invert — nothing in the suite referenced MilestoneSchema.
    it("accepts an empty name, so an unnamed milestone cannot make a project unloadable", () => {
      const result = MilestoneSchema.safeParse({
        id: "m1",
        name: "",
        targetDate: "2026-12-01",
      });
      expect(result.success).toBe(true);
    });

    it("accepts a whitespace-only name (unnamed to a person, valid to the schema)", () => {
      const result = MilestoneSchema.safeParse({
        id: "m1",
        name: "   ",
        targetDate: "2026-12-01",
      });
      expect(result.success).toBe(true);
    });

    // Relaxed, not unguarded.
    it("still rejects a name over 200 characters", () => {
      const result = MilestoneSchema.safeParse({
        id: "m1",
        name: "x".repeat(201),
        targetDate: "2026-12-01",
      });
      expect(result.success).toBe(false);
    });

    it("accepts a name of exactly 200 characters", () => {
      const result = MilestoneSchema.safeParse({
        id: "m1",
        name: "x".repeat(200),
        targetDate: "2026-12-01",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("the load path", () => {
    it("loads a stored project whose milestone has an empty name", () => {
      const project = projectWithMilestoneNamed("");
      repo.save(project);

      const result = repo.loadWithDiagnostics(project.id);

      expect(result.success ? null : result.error.details).toBeNull();
      expect(result.success).toBe(true);
      expect(repo.load(project.id)!.scenarios[0]!.milestones[0]!.name).toBe("");
    });

    it("loads a stored project whose milestone name is whitespace only", () => {
      const project = projectWithMilestoneNamed("   ");
      repo.save(project);
      expect(repo.loadWithDiagnostics(project.id).success).toBe(true);
    });

    it("reads the name back verbatim — nothing repairs or rewrites it on load", () => {
      const project = projectWithMilestoneNamed("");
      repo.save(project);
      expect(repo.load(project.id)!.scenarios[0]!.milestones[0]!.name).toBe("");
    });
  });

  describe("export and re-import", () => {
    it("round-trips a project containing an unnamed milestone, raw", () => {
      const json = serializeExport([projectWithMilestoneNamed("")]);
      const result = validateImport(json, []);

      expect(result.success ? null : result.error).toBeNull();
      if (!result.success) return;
      expect(result.projects[0]!.scenarios[0]!.milestones[0]!.name).toBe("");
      // JSON export is the only raw path milestone names reach — they appear in
      // neither the AI snapshot nor the XLSX/CSV schedule export.
      expect(json).not.toContain("(unnamed)");
    });

    it("no longer loses healthy projects sharing a file with an unnamed one", () => {
      const result = validateImport(
        serializeExport([projectWithMilestoneNamed(""), projectWithMilestoneNamed("Go-Live")]),
        [],
      );

      expect(result.success ? null : result.error).toBeNull();
      if (!result.success) return;
      expect(result.projects).toHaveLength(2);
    });
  });
});
