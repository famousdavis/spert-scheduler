// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import {
  classifyAndComputeScenario,
  buildScenarioSnapshot,
  buildProjectSnapshot,
  truncateSnapshotToBudget,
  ScenarioScheduleCache,
  type ProjectSnapshot,
} from "./ai-snapshot-service";
import {
  createProject,
  createScenario,
  createActivity,
  addActivityToScenario,
} from "./project-service";
import { buildWorkCalendar } from "@core/calendar/work-calendar";
import type { Scenario, ActivityDependency } from "@domain/models/types";

const monFri = () => buildWorkCalendar([1, 2, 3, 4, 5], [], []);
const zeroCal = () => buildWorkCalendar([], [], []); // no working days at all

function makeScenario(opts: { dependencyMode?: boolean; count?: number } = {}) {
  let scenario = createScenario("S", "2025-01-06");
  const ids: string[] = [];
  for (let i = 0; i < (opts.count ?? 2); i++) {
    const a = createActivity(`Task ${i + 1}`, scenario.settings);
    // Explicit valid estimates so the schedule computes cleanly — createActivity
    // defaults are blank/degenerate and would throw → "unknown".
    scenario = addActivityToScenario(scenario, {
      ...a,
      min: 3,
      mostLikely: 5,
      max: 10,
      distributionType: "normal",
    });
    ids.push(a.id);
  }
  if (opts.dependencyMode) {
    scenario = { ...scenario, settings: { ...scenario.settings, dependencyMode: true } };
  }
  return { scenario, ids };
}

function withDeps(scenario: Scenario, dependencies: ActivityDependency[]): Scenario {
  return { ...scenario, dependencies };
}

function hasNoUndefined(value: unknown): boolean {
  if (value === undefined) return false;
  if (Array.isArray(value)) return value.every(hasNoUndefined);
  if (value !== null && typeof value === "object") {
    return Object.values(value).every(hasNoUndefined);
  }
  return true;
}

// ---------------------------------------------------------------------------
// classifyAndComputeScenario
// ---------------------------------------------------------------------------

describe("classifyAndComputeScenario", () => {
  it("ok + schedule for a valid sequential scenario", () => {
    const { scenario } = makeScenario();
    const c = classifyAndComputeScenario(scenario, monFri());
    expect(c.scheduleStatus).toBe("ok");
    expect(c.schedule).toBeDefined();
    expect(c.schedule!.activities).toHaveLength(2);
  });

  it("ok for a valid dependency-mode scenario", () => {
    const { scenario, ids } = makeScenario({ dependencyMode: true });
    const dep = withDeps(scenario, [
      { fromActivityId: ids[0]!, toActivityId: ids[1]!, type: "FS", lagDays: 0 },
    ]);
    expect(classifyAndComputeScenario(dep, monFri()).scheduleStatus).toBe("ok");
  });

  it("cycle_detected for a cyclic dependency-mode scenario (never runs the schedule)", () => {
    const { scenario, ids } = makeScenario({ dependencyMode: true });
    const cyclic = withDeps(scenario, [
      { fromActivityId: ids[0]!, toActivityId: ids[1]!, type: "FS", lagDays: 0 },
      { fromActivityId: ids[1]!, toActivityId: ids[0]!, type: "FS", lagDays: 0 },
    ]);
    const c = classifyAndComputeScenario(cyclic, monFri());
    expect(c.scheduleStatus).toBe("cycle_detected");
    expect(c.schedule).toBeUndefined();
  });

  it("invalid_estimate for a logNormal activity with non-positive PERT mean", () => {
    const { scenario } = makeScenario({ count: 1 });
    const bad: Scenario = {
      ...scenario,
      activities: scenario.activities.map((a) => ({
        ...a,
        min: 0,
        mostLikely: 0,
        max: 0,
        distributionType: "logNormal" as const,
      })),
    };
    expect(classifyAndComputeScenario(bad, monFri()).scheduleStatus).toBe("invalid_estimate");
  });

  it("calendar_misconfigured on a zero-working-day calendar", () => {
    const { scenario } = makeScenario();
    expect(classifyAndComputeScenario(scenario, zeroCal()).scheduleStatus).toBe("calendar_misconfigured");
  });

  it("unknown for a non-calendar throw (degenerate triangular a=c=b)", () => {
    const { scenario } = makeScenario({ count: 1 });
    const degenerate: Scenario = {
      ...scenario,
      activities: scenario.activities.map((a) => ({
        ...a,
        min: 5,
        mostLikely: 5,
        max: 5,
        distributionType: "triangular" as const,
      })),
    };
    expect(classifyAndComputeScenario(degenerate, monFri()).scheduleStatus).toBe("unknown");
  });
});

// ---------------------------------------------------------------------------
// buildScenarioSnapshot
// ---------------------------------------------------------------------------

describe("buildScenarioSnapshot", () => {
  it("maps activities with schedule dates when ok", () => {
    const { scenario } = makeScenario();
    const snap = buildScenarioSnapshot(scenario, classifyAndComputeScenario(scenario, monFri()));
    expect(snap.scheduleStatus).toBe("ok");
    expect(snap.totalDurationDays).toBeGreaterThan(0);
    expect(snap.activities[0]!.startDate).toBeDefined();
    expect(snap.activities[0]!.endDate).toBeDefined();
  });

  it("omits schedule fields when not computable", () => {
    const { scenario, ids } = makeScenario({ dependencyMode: true });
    const cyclic = withDeps(scenario, [
      { fromActivityId: ids[0]!, toActivityId: ids[1]!, type: "FS", lagDays: 0 },
      { fromActivityId: ids[1]!, toActivityId: ids[0]!, type: "FS", lagDays: 0 },
    ]);
    const snap = buildScenarioSnapshot(cyclic, classifyAndComputeScenario(cyclic, monFri()));
    expect(snap.scheduleStatus).toBe("cycle_detected");
    expect(snap.projectEndDate).toBeUndefined();
    expect(snap.activities[0]!.startDate).toBeUndefined();
  });

  it("surfaces dependencyValidationErrors only in dependency mode", () => {
    const { scenario, ids } = makeScenario(); // sequential
    const dupEdges: ActivityDependency[] = [
      { fromActivityId: ids[0]!, toActivityId: ids[1]!, type: "FS", lagDays: 0 },
      { fromActivityId: ids[0]!, toActivityId: ids[1]!, type: "FS", lagDays: 0 },
    ];
    // Sequential mode → no validation errors surfaced regardless of the edges.
    const seqSnap = buildScenarioSnapshot(
      withDeps(scenario, dupEdges),
      classifyAndComputeScenario(withDeps(scenario, dupEdges), monFri())
    );
    expect(seqSnap.dependencyValidationErrors).toEqual([]);

    // Same edges under dependency mode → duplicate flagged (validateDependencies
    // runs independently of whether the schedule itself computes).
    const dupDep = withDeps(
      { ...scenario, settings: { ...scenario.settings, dependencyMode: true } },
      dupEdges
    );
    const depSnap = buildScenarioSnapshot(dupDep, classifyAndComputeScenario(dupDep, monFri()));
    expect(depSnap.dependencyValidationErrors.some((e) => e.type === "duplicate")).toBe(true);
  });

  it("reports a cycle twice (scheduleStatus and a validation entry) — intentional overlap", () => {
    const { scenario, ids } = makeScenario({ dependencyMode: true });
    const cyclic = withDeps(scenario, [
      { fromActivityId: ids[0]!, toActivityId: ids[1]!, type: "FS", lagDays: 0 },
      { fromActivityId: ids[1]!, toActivityId: ids[0]!, type: "FS", lagDays: 0 },
    ]);
    const snap = buildScenarioSnapshot(cyclic, classifyAndComputeScenario(cyclic, monFri()));
    expect(snap.scheduleStatus).toBe("cycle_detected");
    expect(snap.dependencyValidationErrors.some((e) => e.type === "cycle")).toBe(true);
  });

  it("normalizes locked/dependencyMode and reports simulationStatus", () => {
    const { scenario } = makeScenario();
    const snap = buildScenarioSnapshot(scenario, classifyAndComputeScenario(scenario, monFri()));
    expect(snap.locked).toBe(false);
    expect(snap.dependencyMode).toBe(false);
    expect(snap.simulationStatus).toBe("absent");
  });
});

// ---------------------------------------------------------------------------
// ScenarioScheduleCache
// ---------------------------------------------------------------------------

describe("ScenarioScheduleCache", () => {
  it("reuses the computation when both scenario and workCalendar references match", () => {
    const { scenario } = makeScenario();
    const cal = monFri();
    const cache = new ScenarioScheduleCache();
    const r1 = cache.compute(scenario, cal);
    const r2 = cache.compute(scenario, cal);
    expect(r2).toBe(r1); // same object → served from cache
  });

  it("recomputes when the scenario reference changes", () => {
    const { scenario } = makeScenario();
    const cal = monFri();
    const cache = new ScenarioScheduleCache();
    const r1 = cache.compute(scenario, cal);
    const r2 = cache.compute({ ...scenario }, cal); // new ref, same id
    expect(r2).not.toBe(r1);
  });

  it("recomputes when the workCalendar reference changes", () => {
    const { scenario } = makeScenario();
    const cache = new ScenarioScheduleCache();
    const r1 = cache.compute(scenario, monFri());
    const r2 = cache.compute(scenario, monFri()); // structurally equal but different ref
    expect(r2).not.toBe(r1);
  });

  it("evicts entries for scenario ids no longer present", () => {
    const a = makeScenario();
    const b = makeScenario();
    const cal = monFri();
    const cache = new ScenarioScheduleCache();
    cache.compute(a.scenario, cal);
    cache.compute(b.scenario, cal);
    expect(cache.size).toBe(2);
    cache.evictAbsent(new Set([a.scenario.id]));
    expect(cache.size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// buildProjectSnapshot
// ---------------------------------------------------------------------------

describe("buildProjectSnapshot", () => {
  it("assembles scenarios with openScenarioId and asOfSeq", () => {
    const { scenario } = makeScenario();
    const base = createProject("P", "2025-01-06");
    const project = { ...base, scenarios: [scenario] };
    const snap = buildProjectSnapshot(project, monFri(), scenario.id, 7);
    expect(snap.projectId).toBe(project.id);
    expect(snap.openScenarioId).toBe(scenario.id);
    expect(snap.asOfSeq).toBe(7);
    expect(snap.scenarios).toHaveLength(1);
    expect(snap.scenarios[0]!.scheduleStatus).toBe("ok");
  });

  it("evicts stale cache entries on each build", () => {
    const { scenario } = makeScenario();
    const base = createProject("P", "2025-01-06");
    const project = { ...base, scenarios: [scenario] };
    const cache = new ScenarioScheduleCache();
    buildProjectSnapshot(project, monFri(), scenario.id, 1, cache);
    // A build of a project WITHOUT that scenario evicts it.
    const empty = { ...base, scenarios: [] };
    buildProjectSnapshot(empty, monFri(), null, 2, cache);
    expect(cache.size).toBe(0);
  });

  it("produces a body with no undefined at any depth (Firestore-safe before sanitize)", () => {
    const { scenario } = makeScenario();
    const base = createProject("P", "2025-01-06");
    const project = { ...base, scenarios: [scenario] };
    const snap = buildProjectSnapshot(project, monFri(), scenario.id, 3);
    expect(hasNoUndefined(snap)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// truncateSnapshotToBudget
// ---------------------------------------------------------------------------

function bigSnapshot(): ProjectSnapshot {
  return {
    projectId: "p",
    projectName: "P",
    openScenarioId: "s1",
    asOfSeq: 5,
    scenarios: [
      {
        id: "s1",
        name: "S1",
        locked: false,
        dependencyMode: true,
        scheduleStatus: "ok",
        startDate: "2025-01-06",
        projectEndDate: "2025-02-01",
        totalDurationDays: 20,
        simulationStatus: "absent",
        activities: [
          {
            id: "a1",
            name: "Critical",
            min: 1,
            mostLikely: 2,
            max: 3,
            status: "planned",
            isCritical: true,
            startDate: "2025-01-06",
            endDate: "2025-01-10",
            duration: 5,
            notes: "x".repeat(500),
          },
          {
            id: "a2",
            name: "Slack",
            min: 1,
            mostLikely: 2,
            max: 3,
            status: "planned",
            isCritical: false,
            startDate: "2025-01-06",
            endDate: "2025-01-08",
            duration: 3,
            notes: "y".repeat(500),
            checklist: [{ id: "c1", text: "z".repeat(200), completed: false }],
          },
        ],
        milestones: [],
        dependencies: [],
        dependencyValidationErrors: [{ type: "duplicate", message: "dup" }],
      },
    ],
  };
}

describe("truncateSnapshotToBudget", () => {
  it("returns the snapshot unchanged when under budget", () => {
    const snap = bigSnapshot();
    const full = JSON.stringify(snap).length;
    expect(truncateSnapshotToBudget(snap, full)).toBe(snap);
  });

  it("stage 1 strips qualitative text but keeps estimates", () => {
    const snap = bigSnapshot();
    const full = JSON.stringify(snap).length;
    const out = truncateSnapshotToBudget(snap, full - 1);
    const a1 = out.scenarios[0]!.activities[0]!;
    const a2 = out.scenarios[0]!.activities[1]!;
    expect(a1.notes).toBeUndefined();
    expect(a2.notes).toBeUndefined();
    expect(a2.checklist).toBeUndefined();
    expect(a1.min).toBe(1); // estimates retained at stage 1
  });

  it("stage 2 reduces non-critical activities but keeps critical + totals + validation errors", () => {
    const snap = bigSnapshot();
    const out = truncateSnapshotToBudget(snap, 10); // impossibly small → force stage 2
    const scenario = out.scenarios[0]!;
    const a1 = scenario.activities[0]!; // critical
    const a2 = scenario.activities[1]!; // non-critical
    expect(a2.min).toBeUndefined(); // reduced to minimal
    expect(a2.startDate).toBe("2025-01-06"); // schedule kept
    expect(a1.min).toBe(1); // critical activity retained
    expect(scenario.totalDurationDays).toBe(20); // totals never dropped
    expect(scenario.projectEndDate).toBe("2025-02-01");
    expect(scenario.dependencyValidationErrors).toHaveLength(1); // never dropped
  });
});
