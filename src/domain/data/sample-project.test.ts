// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import { ProjectSchema } from "@domain/schemas/project.schema";
import { createSampleProject, SAMPLE_PROJECT_NAME } from "@domain/data/sample-project";
import { getUSHolidays } from "@core/calendar/us-holidays";
import {
  buildDependencyGraph,
  computeCriticalPathActivities,
  detectCycle,
} from "@core/schedule/dependency-graph";
import { computeDependencyDurations } from "@core/schedule/deterministic";
import type { Holiday } from "@domain/models/types";

const START = "2026-07-27";

const holidaysFor = (years: number[]): Holiday[] =>
  years.flatMap((y) =>
    getUSHolidays(y).map((h) => ({
      id: `us-${h.date}`,
      name: h.name,
      startDate: h.date,
      endDate: h.date,
      source: "manual" as const,
      countryCodes: ["US"],
    }))
  );

describe("sample project fixture", () => {
  const project = createSampleProject(START, holidaysFor([2026, 2027]));
  const scenario = project.scenarios[0]!;

  it("satisfies ProjectSchema", () => {
    const result = ProjectSchema.safeParse(project);
    expect(result.success).toBe(true);
  });

  it("has the expected structure", () => {
    expect(project.name).toBe(SAMPLE_PROJECT_NAME);
    expect(project.scenarios).toHaveLength(1);
    expect(scenario.activities).toHaveLength(40);
    expect(scenario.dependencies).toHaveLength(68);
    expect(scenario.milestones).toHaveLength(4);
    expect(scenario.bands).toHaveLength(8);
  });

  it("is configured for dependency-mode scheduling", () => {
    expect(scenario.settings.dependencyMode).toBe(true);
    expect(scenario.settings.probabilityTarget).toBe(0.5);
    expect(scenario.settings.projectProbabilityTarget).toBe(0.95);
    expect(scenario.settings.parkinsonsLawEnabled).toBe(true);
    expect(project.showActivityIds).toBe(true);
  });

  it("ships every activity fully populated", () => {
    for (const a of scenario.activities) {
      expect(a.status).toBe("planned");
      expect(a.description!.length).toBeGreaterThan(0);
      expect(a.notes!.length).toBeGreaterThan(0);
      expect(a.checklist).toHaveLength(3);
      expect(a.deliverables).toHaveLength(2);
      expect(a.min).toBeLessThanOrEqual(a.mostLikely);
      expect(a.mostLikely).toBeLessThanOrEqual(a.max);
    }
  });

  it("uses a spread of distributions", () => {
    const kinds = new Set(scenario.activities.map((a) => a.distributionType));
    expect(kinds).toEqual(new Set(["triangular", "normal", "logNormal", "uniform"]));
  });

  it("assigns activities to every milestone", () => {
    // Guards a real bug: without assignments the Monte Carlo emits no milestone
    // samples, so each milestone renders "Run simulation" forever and no
    // per-milestone buffer or RAG health is ever computed.
    const assigned = scenario.activities.filter((a) => a.milestoneId);
    expect(assigned).toHaveLength(12);

    const covered = new Set(assigned.map((a) => a.milestoneId));
    expect(covered.size).toBe(scenario.milestones.length);
    for (const m of scenario.milestones) {
      expect(covered.has(m.id)).toBe(true);
    }
  });

  it("has no dangling references", () => {
    const activityIds = new Set(scenario.activities.map((a) => a.id));
    const milestoneIds = new Set(scenario.milestones.map((m) => m.id));

    for (const d of scenario.dependencies) {
      expect(activityIds.has(d.fromActivityId)).toBe(true);
      expect(activityIds.has(d.toActivityId)).toBe(true);
    }
    for (const a of scenario.activities) {
      if (a.milestoneId) expect(milestoneIds.has(a.milestoneId)).toBe(true);
    }
    for (const b of scenario.bands!) {
      if (b.insertBeforeActivityId) {
        expect(activityIds.has(b.insertBeforeActivityId)).toBe(true);
      }
    }
  });

  it("is acyclic and schedules to its designed span", () => {
    const ids = scenario.activities.map((a) => a.id);
    expect(detectCycle(ids, scenario.dependencies)).toBeNull();

    const graph = buildDependencyGraph(ids, scenario.dependencies);
    const durations = computeDependencyDurations(scenario.activities, 0.5);
    const cp = computeCriticalPathActivities(graph, durations);
    expect(cp.projectDuration).toBe(294);
    expect(cp.criticalActivityIds.size).toBeGreaterThan(0);
  });

  it("derives milestone targets from the start date so the sample never ages", () => {
    const later = createSampleProject("2030-01-07");
    for (let i = 0; i < scenario.milestones.length; i++) {
      expect(later.scenarios[0]!.milestones[i]!.targetDate).not.toBe(
        scenario.milestones[i]!.targetDate
      );
      expect(later.scenarios[0]!.milestones[i]!.targetDate > "2030-01-07").toBe(true);
    }
  });

  it("treats holidays as optional", () => {
    const bare = createSampleProject(START);
    expect(bare.globalCalendarOverride).toBeUndefined();
    expect(ProjectSchema.safeParse(bare).success).toBe(true);

    expect(project.globalCalendarOverride!.holidays.length).toBeGreaterThan(0);
  });
});
