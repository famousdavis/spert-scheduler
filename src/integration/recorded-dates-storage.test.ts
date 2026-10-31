// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach } from "vitest";
import type { Activity, Project } from "@domain/models/types";
import { SCHEMA_VERSION } from "@domain/models/types";
import { ProjectSchema } from "@domain/schemas/project.schema";
import { applyMigrations } from "@infrastructure/persistence/migrations";
import { serializeExport, validateImport } from "@app/api/export-import-service";
import { addActivityToScenario, cloneScenario, createActivity, createProject } from "@app/api/project-service";
import { useProjectStore } from "@ui/hooks/use-project-store";

/**
 * WI-137 — the two recorded dates in storage: schema 26, the step from 25, Zod, the copies, and a
 * tab still running v0.79.36 (in the manner of WI-124's `scenario-target-upgrade.test.ts`).
 */

/** A project with a Complete row, an In Progress row and a Planned one, the first two dated as v0.80.0 records them. */
function datedProject(): Project {
  const p = createProject("Dated", "2026-10-05");
  let s = p.scenarios[0]!;
  const row = (name: string, extra: Partial<Activity>) => ({ ...createActivity(name, s.settings), ...extra });
  s = addActivityToScenario(s, row("A", { status: "complete", actualStartDate: "2026-10-05", actualFinishDate: "2026-10-23", actualDuration: 15 }));
  s = addActivityToScenario(s, row("B", { status: "inProgress", actualStartDate: "2026-10-19", actualDuration: 1 }));
  s = addActivityToScenario(s, row("C", {}));
  return { ...p, scenarios: [s] };
}

const datesOf = (p: Project) => p.scenarios[0]!.activities.map((a) => [a.actualStartDate, a.actualFinishDate]);

describe("schema 26", () => {
  it("is the version this build writes — pinned deliberately (WI-137)", () => {
    // Release 2 (v0.81.0, WI-137) moved it to 27; planned-dates-storage.test.ts pins it too.
    expect(SCHEMA_VERSION).toBe(27);
  });

  it("the 25 → 26 step only stamps the version: no row is given a date (ruling 3)", () => {
    const v25 = JSON.parse(JSON.stringify({ ...datedProject(), schemaVersion: 25 })) as Record<string, unknown> & Project;
    for (const a of v25.scenarios[0]!.activities) {
      delete a.actualStartDate;
      delete a.actualFinishDate;
    }
    const before = JSON.parse(JSON.stringify(v25)) as Record<string, unknown>;
    const after = applyMigrations(v25, 25, 26) as Record<string, unknown> & Project;
    expect(after).toStrictEqual({ ...before, schemaVersion: 26 });
    expect(after.scenarios[0]!.activities.some((a) => "actualStartDate" in a || "actualFinishDate" in a)).toBe(false);
  });

  it("Zod: real dates load; a non-date or an impossible date does not; a finish before its start still LOADS", () => {
    const ok = datedProject();
    expect(ProjectSchema.safeParse(ok).success).toBe(true);
    const withDate = (start: string) => ({
      ...ok,
      scenarios: [{ ...ok.scenarios[0]!, activities: ok.scenarios[0]!.activities.map((a, i) => (i === 1 ? { ...a, actualStartDate: start } : a)) }],
    });
    expect(ProjectSchema.safeParse(withDate("10/19/2026")).success).toBe(false);
    expect(ProjectSchema.safeParse(withDate("2026-02-30")).success).toBe(false);
    const inverted = {
      ...ok,
      scenarios: [{ ...ok.scenarios[0]!, activities: ok.scenarios[0]!.activities.map((a, i) => (i === 0 ? { ...a, actualFinishDate: "2026-10-01" } : a)) }],
    };
    expect(ProjectSchema.safeParse(inverted).success).toBe(true);
  });

  it("Export → Import keeps both dates", () => {
    const result = validateImport(serializeExport([datedProject()]), []);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(datesOf(result.projects[0]!)).toEqual([["2026-10-05", "2026-10-23"], ["2026-10-19", undefined], [undefined, undefined]]);
  });
});

describe("the copies", () => {
  it("a plain scenario copy keeps the dates; a reforecast copy carries none (and no stale finish) (m)", () => {
    const s = datedProject().scenarios[0]!;
    // A stale finish on the In Progress row, as a row from the prototype's window could hold.
    const withStale = { ...s, activities: s.activities.map((a) => (a.name === "B" ? { ...a, actualFinishDate: "2026-10-21" } : a)) };
    const plain = cloneScenario(withStale, "Copy");
    expect(plain.activities.map((a) => [a.actualStartDate, a.actualFinishDate])).toEqual([["2026-10-05", "2026-10-23"], ["2026-10-19", "2026-10-21"], [undefined, undefined]]);
    const reforecast = cloneScenario(withStale, "Reforecast", { dropCompleted: true, reforecastFrom: "2026-10-27" });
    expect(reforecast.activities.map((a) => [a.name, a.status, a.actualStartDate, a.actualFinishDate, a.actualDuration])).toEqual([
      ["B", "inProgress", undefined, undefined, undefined],
      ["C", "planned", undefined, undefined, undefined],
    ]);
  });

  it("a duplicated activity is new work: Planned, nothing recorded", () => {
    useProjectStore.setState({ projects: [datedProject()], undoStack: [], redoStack: [] });
    const p = useProjectStore.getState().projects[0]!;
    const a = p.scenarios[0]!.activities[0]!;
    useProjectStore.getState().duplicateActivity(p.id, p.scenarios[0]!.id, a.id);
    const copy = useProjectStore.getState().projects[0]!.scenarios[0]!.activities.find((x) => x.name === "A (copy)")!;
    expect([copy.name, copy.status, copy.actualStartDate, copy.actualFinishDate, copy.actualDuration]).toEqual(["A (copy)", "planned", undefined, undefined, undefined]);
  });
});

describe("a tab still running v0.79.36, after this version saved the project (s)", () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.setState({ projects: [], loadError: false, loadErrors: [], undoStack: [], redoStack: [] });
  });

  it("this browser's storage: its save writes the project whole, stamped 25, so the dates are gone — reload that tab first", () => {
    const project = datedProject();
    localStorage.setItem("spert:project-index:local", JSON.stringify([project.id]));
    localStorage.setItem(`spert:project:local:${project.id}`, JSON.stringify(project));
    useProjectStore.getState().loadProjects();
    useProjectStore.getState().renameProject(project.id, "Dated, renamed here");
    const ours = JSON.parse(localStorage.getItem(`spert:project:local:${project.id}`)!) as Project;
    expect(ours.schemaVersion).toBe(27); // this version's stamp: 26 in v0.80.0, 27 since v0.81.0
    expect(datesOf(ours)[1]).toEqual(["2026-10-19", undefined]);

    // The older tab loaded the project before this version wrote any date, and holds it so in
    // memory. Its next change saves that whole project, stamped 25: Zod there knows no dates.
    const held = JSON.parse(JSON.stringify(project)) as Project;
    for (const a of held.scenarios[0]!.activities) {
      delete a.actualStartDate;
      delete a.actualFinishDate;
    }
    const olderTabSave = { ...held, name: "Dated, renamed in the older tab", schemaVersion: 25 };
    localStorage.setItem(`spert:project:local:${project.id}`, JSON.stringify(olderTabSave));

    // This version's next load migrates it like any v25 project: its change kept, no dates.
    useProjectStore.getState().loadProjects();
    const loaded = useProjectStore.getState().projects.find((p) => p.id === project.id)!;
    expect(loaded.name).toBe("Dated, renamed in the older tab");
    expect(loaded.schemaVersion).toBe(27);
    expect(datesOf(loaded)).toEqual([[undefined, undefined], [undefined, undefined], [undefined, undefined]]);
    expect(loaded.scenarios[0]!.activities.map((a) => a.actualDuration)).toEqual([15, 1, undefined]);
  });
});
