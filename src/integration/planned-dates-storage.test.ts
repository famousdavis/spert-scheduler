// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Activity, ActivityDependency, Project } from "@domain/models/types";
import { SCHEMA_VERSION } from "@domain/models/types";
import type { WorkerOutgoingMessage } from "@core/simulation/worker-protocol";
import { ProjectSchema } from "@domain/schemas/project.schema";
import { applyMigrations } from "@infrastructure/persistence/migrations";
import { sanitizeForFirestore } from "@infrastructure/firebase/firestore-sanitize";
import { serializeExport, validateImport } from "@app/api/export-import-service";
import { addActivityToScenario, cloneProject, cloneScenario, createActivity, createProject } from "@app/api/project-service";
import { computeDependencySchedule, computeDeterministicSchedule } from "@core/schedule/deterministic";
import { buildSimulationParams } from "@ui/helpers/build-simulation-params";
import { statusUpdatesFor } from "@ui/components/activity-row-helpers";
import { useProjectStore } from "@ui/hooks/use-project-store";

/**
 * WI-137 release 2 — the Planned Start and Planned Finish in storage: schema 27, the step from 26,
 * Zod, the copies and round trips, undo and redo, the cloud's sanitizer, the future-version gate,
 * and — MEASURED, not assumed — that the pair changes no schedule and no simulation.
 */
const PAIR_A = { plannedStartDate: "2026-10-05", plannedFinishDate: "2026-10-16" };
const PAIR_B = { plannedStartDate: "2026-10-26", plannedFinishDate: "2026-11-06" };

function project(withPairs = true): Project {
  const p = createProject("Planned", "2026-10-05", { dependencyMode: true });
  let s = p.scenarios[0]!;
  const row = (id: string, extra: Partial<Activity>): Activity => ({
    ...createActivity(id, s.settings), id, min: 9, mostLikely: 10, max: 11, distributionType: "uniform", ...extra,
  });
  s = addActivityToScenario(s, row("A", { status: "complete", actualStartDate: "2026-10-05", actualFinishDate: "2026-10-23", actualDuration: 15, ...(withPairs ? PAIR_A : {}) }));
  s = addActivityToScenario(s, row("B", { status: "inProgress", actualStartDate: "2026-10-19", actualDuration: 1, ...(withPairs ? PAIR_B : {}) }));
  s = addActivityToScenario(s, row("C", {}));
  const dependencies: ActivityDependency[] = [
    { fromActivityId: "A", toActivityId: "B", type: "FS", lagDays: 0 },
    { fromActivityId: "B", toActivityId: "C", type: "FS", lagDays: 0 },
  ];
  return { ...p, scenarios: [{ ...s, dependencies }] };
}
const pairsOf = (p: Project) => p.scenarios[0]!.activities.map((a) => [a.id, a.plannedStartDate, a.plannedFinishDate]);

describe("schema 27", () => {
  it("is the version this build writes — pinned deliberately", () => {
    expect(SCHEMA_VERSION).toBe(27);
  });

  it("the 26 → 27 step only stamps the version: a started row is given NO Planned date (never back-filled)", () => {
    const v26 = JSON.parse(JSON.stringify({ ...project(false), schemaVersion: 26 })) as Record<string, unknown> & Project;
    const before = JSON.parse(JSON.stringify(v26)) as Record<string, unknown>;
    const after = applyMigrations(v26, 26, 27) as Record<string, unknown> & Project;
    expect(after).toStrictEqual({ ...before, schemaVersion: 27 });
    expect(after.scenarios[0]!.activities.some((a) => "plannedStartDate" in a || "plannedFinishDate" in a)).toBe(false);
  });

  it("this build evicts a project stamped newer than itself — the gate a v0.80.0 tab meets with a v27 project", () => {
    localStorage.clear();
    const p = { ...project(), schemaVersion: SCHEMA_VERSION + 1 };
    localStorage.setItem("spert:project-index:local", JSON.stringify([p.id]));
    localStorage.setItem(`spert:project:local:${p.id}`, JSON.stringify(p));
    useProjectStore.setState({ projects: [], loadError: false, loadErrors: [], undoStack: [], redoStack: [] });
    useProjectStore.getState().loadProjects();
    expect(useProjectStore.getState().projects).toEqual([]);
    expect(useProjectStore.getState().loadErrors.map((e) => e.type)).toEqual(["future_version"]);
    localStorage.clear();
  });

  it("Zod: real dates load; a non-date or an impossible date does not; a finish before its start still LOADS", () => {
    const ok = project();
    expect(ProjectSchema.safeParse(ok).success).toBe(true);
    const withB = (extra: Partial<Activity>) => ({
      ...ok,
      scenarios: [{ ...ok.scenarios[0]!, activities: ok.scenarios[0]!.activities.map((a) => (a.id === "B" ? { ...a, ...extra } : a)) }],
    });
    expect(ProjectSchema.safeParse(withB({ plannedStartDate: "10/26/2026" })).success).toBe(false);
    expect(ProjectSchema.safeParse(withB({ plannedFinishDate: "2026-02-30" })).success).toBe(false);
    expect(ProjectSchema.safeParse(withB({ plannedStartDate: "2026-11-06", plannedFinishDate: "2026-10-26" })).success).toBe(true);
  });
});

describe("a tab still running v0.80.0, after this version saved the project (R630; Review 33, W4)", () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.setState({ projects: [], loadError: false, loadErrors: [], undoStack: [], redoStack: [] });
  });

  it("this browser's storage: the older tab saves its WHOLE copy, stamped 26 — the Planned dates and a change made here since are gone; reload that tab first", () => {
    const p = project();
    localStorage.setItem("spert:project-index:local", JSON.stringify([p.id]));
    localStorage.setItem(`spert:project:local:${p.id}`, JSON.stringify(p));
    useProjectStore.getState().loadProjects();
    // A change made here, in this version, after the older tab loaded the project.
    useProjectStore.getState().renameProject(p.id, "Planned, renamed here");
    const ours = JSON.parse(localStorage.getItem(`spert:project:local:${p.id}`)!) as Project;
    expect([ours.schemaVersion, ours.name]).toEqual([27, "Planned, renamed here"]);
    expect(pairsOf(ours)).toEqual([["A", "2026-10-05", "2026-10-16"], ["B", "2026-10-26", "2026-11-06"], ["C", undefined, undefined]]);

    // The older tab loaded the project while it was still schema 26 — before this version kept any
    // pair — and holds it so in memory. Its next change saves that whole copy, stamped 26.
    const held = JSON.parse(JSON.stringify(p)) as Project;
    for (const a of held.scenarios[0]!.activities) {
      delete a.plannedStartDate;
      delete a.plannedFinishDate;
    }
    const s0 = held.scenarios[0]!;
    const olderTabSave = {
      ...held,
      schemaVersion: 26,
      scenarios: [{ ...s0, activities: s0.activities.map((a) => (a.id === "C" ? { ...a, name: "C, edited in the older tab" } : a)) }],
    };
    localStorage.setItem(`spert:project:local:${p.id}`, JSON.stringify(olderTabSave));

    // This version's next load migrates it like any v26 project: the older tab's change is kept;
    // the Planned dates are gone, and so is the rename made here since.
    useProjectStore.getState().loadProjects();
    const loaded = useProjectStore.getState().projects.find((x) => x.id === p.id)!;
    expect([loaded.schemaVersion, loaded.name]).toEqual([27, "Planned"]);
    expect(loaded.scenarios[0]!.activities.map((a) => a.name)).toEqual(["A", "B", "C, edited in the older tab"]);
    expect(pairsOf(loaded)).toEqual([["A", undefined, undefined], ["B", undefined, undefined], ["C", undefined, undefined]]);
  });
});

describe("copies and round trips", () => {
  const KEPT = [["A", "2026-10-05", "2026-10-16"], ["B", "2026-10-26", "2026-11-06"], ["C", undefined, undefined]];

  it("JSON Export → Import keeps both dates", () => {
    const result = validateImport(serializeExport([project()]), []);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(pairsOf(result.projects[0]!)).toEqual(KEPT);
  });

  it("a plain scenario copy and a project copy keep them; a reforecast copy carries none", () => {
    const s = project().scenarios[0]!;
    expect(cloneScenario(s, "Copy").activities.map((a) => [a.name, a.plannedStartDate, a.plannedFinishDate])).toEqual(KEPT);
    expect(pairsOf(cloneProject(project(), "Copy")).map(([, ps, pf]) => [ps, pf])).toEqual(KEPT.map(([, ps, pf]) => [ps, pf]));
    const reforecast = cloneScenario(s, "Reforecast", { dropCompleted: true, reforecastFrom: "2026-10-27" });
    expect(reforecast.activities.map((a) => [a.name, a.status, a.plannedStartDate, a.plannedFinishDate])).toEqual([
      ["B", "inProgress", undefined, undefined],
      ["C", "planned", undefined, undefined],
    ]);
  });

  it("a duplicated activity is new work: Planned, no Planned dates", () => {
    useProjectStore.setState({ projects: [project()], undoStack: [], redoStack: [] });
    const p = useProjectStore.getState().projects[0]!;
    useProjectStore.getState().duplicateActivity(p.id, p.scenarios[0]!.id, "B");
    const copy = useProjectStore.getState().projects[0]!.scenarios[0]!.activities.find((x) => x.name === "B (copy)")!;
    expect([copy.status, copy.plannedStartDate, copy.plannedFinishDate]).toEqual(["planned", undefined, undefined]);
  });

  it("undo and redo carry them: C started by the grid's rule, undone, redone", () => {
    vi.useFakeTimers({ now: new Date("2026-10-27T12:00:00"), toFake: ["Date"] });
    useProjectStore.setState({ projects: [project()], undoStack: [], redoStack: [] });
    const p = useProjectStore.getState().projects[0]!;
    const c = p.scenarios[0]!.activities.find((a) => a.id === "C")!;
    const updates = statusUpdatesFor(c, "inProgress", { startDate: "2026-10-20", endDate: "2026-11-02", duration: 10 });
    useProjectStore.getState().updateActivityField(p.id, p.scenarios[0]!.id, "C", updates);
    const cNow = () => useProjectStore.getState().projects[0]!.scenarios[0]!.activities.find((a) => a.id === "C")!;
    expect([cNow().status, cNow().plannedStartDate, cNow().plannedFinishDate]).toEqual(["inProgress", "2026-10-20", "2026-11-02"]);
    useProjectStore.getState().undo();
    expect([cNow().status, cNow().plannedStartDate, cNow().plannedFinishDate]).toEqual(["planned", undefined, undefined]);
    useProjectStore.getState().redo();
    expect([cNow().status, cNow().plannedStartDate, cNow().plannedFinishDate]).toEqual(["inProgress", "2026-10-20", "2026-11-02"]);
    vi.useRealTimers();
  });

  it("the cloud's sanitizer keeps the dates and drops a clear's undefined key", () => {
    const p = project();
    const cleared = { ...p, scenarios: [{ ...p.scenarios[0]!, activities: p.scenarios[0]!.activities.map((a) => (a.id === "B" ? { ...a, plannedStartDate: undefined, plannedFinishDate: undefined } : a)) }] };
    const out = sanitizeForFirestore(cleared);
    const a = out.scenarios[0]!.activities;
    expect([a[0]!.plannedStartDate, a[0]!.plannedFinishDate]).toEqual(["2026-10-05", "2026-10-16"]);
    expect("plannedStartDate" in a[1]! || "plannedFinishDate" in a[1]!).toBe(false);
  });
});

describe("the pair changes no schedule and no simulation — MEASURED", () => {
  /** The pair on every row, deliberately far from every scheduled date. */
  const WILD = { plannedStartDate: "2031-01-06", plannedFinishDate: "2031-12-31" };
  const without = () => project(false).scenarios[0]!;
  const withWild = () => {
    const s = without();
    return { ...s, activities: s.activities.map((a) => ({ ...a, ...WILD })) };
  };

  it("the deterministic schedule, dependencies on and off, is identical", () => {
    for (const s of [without(), withWild()]) expect(s.activities.length).toBe(3);
    expect(JSON.stringify(computeDependencySchedule(withWild().activities, withWild().dependencies, "2026-10-05", 0.5)))
      .toBe(JSON.stringify(computeDependencySchedule(without().activities, without().dependencies, "2026-10-05", 0.5)));
    expect(JSON.stringify(computeDeterministicSchedule(withWild().activities, "2026-10-05", 0.5)))
      .toBe(JSON.stringify(computeDeterministicSchedule(without().activities, "2026-10-05", 0.5)));
  });

  async function samples(dependencyMode: boolean, wild: boolean): Promise<number[]> {
    const s = wild ? withWild() : without();
    const params = buildSimulationParams(s.activities, dependencyMode, 0.5, s.dependencies, [], "2026-10-05", undefined, true);
    const payload = {
      activities: s.activities, trialCount: 2000, rngSeed: "planned-dates",
      ...(params.deterministicDurations ? { deterministicDurations: params.deterministicDurations } : {}),
      ...(params.sequentialRecords ? { sequentialRecords: params.sequentialRecords } : {}),
      ...(params.dependencyParams ?? {}),
    };
    const posted: WorkerOutgoingMessage[] = [];
    const stub = { postMessage: (m: WorkerOutgoingMessage) => posted.push(m), onmessage: null as unknown };
    vi.stubGlobal("self", stub);
    vi.resetModules();
    await import("@workers/simulation.worker");
    (stub.onmessage as (e: { data: unknown }) => void)({ data: { type: "simulation:start", payload } });
    vi.unstubAllGlobals();
    const result = posted.find((m) => m.type === "simulation:result");
    if (result?.type !== "simulation:result") throw new Error(`no result: ${JSON.stringify(posted.map((m) => m.type))}`);
    return Array.from(result.payload.samples);
  }

  it("the simulation through the worker, dependencies on and off: every sample identical", async () => {
    for (const dependencyMode of [true, false]) {
      const a = await samples(dependencyMode, false);
      const b = await samples(dependencyMode, true);
      expect(a.length).toBe(2000);
      expect(b).toEqual(a);
    }
  });
});

beforeEach(() => {
  useProjectStore.setState({ projects: [], undoStack: [], redoStack: [] });
});
