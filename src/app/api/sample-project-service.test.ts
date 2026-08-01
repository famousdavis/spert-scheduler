// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import { buildSampleProject, nextMondayISO } from "@app/api/sample-project-service";
import { createSampleProject } from "@domain/data/sample-project";
import { ProjectSchema } from "@domain/schemas/project.schema";
import { SCHEMA_VERSION } from "@domain/models/types";

describe("nextMondayISO", () => {
  it("returns the same day when already Monday", () => {
    expect(nextMondayISO(new Date(2026, 6, 27))).toBe("2026-07-27"); // a Monday
  });

  it("advances to the following Monday from any other day", () => {
    expect(nextMondayISO(new Date(2026, 6, 28))).toBe("2026-08-03"); // Tue
    expect(nextMondayISO(new Date(2026, 7, 1))).toBe("2026-08-03"); // Sat
    expect(nextMondayISO(new Date(2026, 7, 2))).toBe("2026-08-03"); // Sun
  });
});

describe("buildSampleProject", () => {
  it("produces a schema-valid project stamped at the current schema version", async () => {
    const p = await buildSampleProject("Sample", "2026-07-27");
    expect(ProjectSchema.safeParse(p).success).toBe(true);
    expect(p.schemaVersion).toBe(SCHEMA_VERSION);
    expect(p.name).toBe("Sample");
    expect(p.owner).toBeNull(); // store action decides — Lesson 38
    expect(p.archived).toBeFalsy();
  });

  it("mints ids that do not leak the canonical fixture's ids", async () => {
    const canonical = createSampleProject("2026-07-27");
    const canonicalIds = new Set([
      canonical.id,
      ...canonical.scenarios.map((s) => s.id),
      ...canonical.scenarios[0]!.activities.map((a) => a.id),
      ...canonical.scenarios[0]!.milestones.map((m) => m.id),
    ]);

    const built = await buildSampleProject("Sample", "2026-07-27");
    const scenario = built.scenarios[0]!;

    expect(canonicalIds.has(built.id)).toBe(false);
    expect(canonicalIds.has(scenario.id)).toBe(false);
    for (const a of scenario.activities) expect(canonicalIds.has(a.id)).toBe(false);
    for (const m of scenario.milestones) expect(canonicalIds.has(m.id)).toBe(false);
  });

  it("gives two loads fully independent ids", async () => {
    const a = await buildSampleProject("A", "2026-07-27");
    const b = await buildSampleProject("B", "2026-07-27");

    expect(a.id).not.toBe(b.id);
    const aIds = new Set(a.scenarios[0]!.activities.map((x) => x.id));
    for (const act of b.scenarios[0]!.activities) {
      expect(aIds.has(act.id)).toBe(false);
    }
  });

  it("remaps every cross-reference after re-minting", async () => {
    const s = (await buildSampleProject("Sample", "2026-07-27")).scenarios[0]!;
    const activityIds = new Set(s.activities.map((a) => a.id));
    const milestoneIds = new Set(s.milestones.map((m) => m.id));

    expect(s.dependencies).toHaveLength(68);
    for (const d of s.dependencies) {
      expect(activityIds.has(d.fromActivityId)).toBe(true);
      expect(activityIds.has(d.toActivityId)).toBe(true);
    }
    const assigned = s.activities.filter((a) => a.milestoneId);
    expect(assigned).toHaveLength(12); // survives the id re-mint
    for (const a of assigned) {
      expect(milestoneIds.has(a.milestoneId!)).toBe(true);
    }
    expect(s.bands).toHaveLength(8);
    for (const b of s.bands!) {
      if (b.insertBeforeActivityId) {
        expect(activityIds.has(b.insertBeforeActivityId)).toBe(true);
      }
    }
  });

  it("attaches a work calendar covering the schedule span", async () => {
    const p = await buildSampleProject("Sample", "2026-07-27");
    const holidays = p.globalCalendarOverride!.holidays;
    expect(holidays.length).toBeGreaterThan(0);

    const years = new Set(holidays.map((h) => h.startDate.slice(0, 4)));
    expect(years.has("2026")).toBe(true);
    expect(years.has("2027")).toBe(true);
    // Locally computed, not fetched — and manual holidays stay user-editable.
    expect(holidays.every((h) => h.source === "manual")).toBe(true);
  });

  it("defaults the start date to a Monday when none is supplied", async () => {
    const start = (await buildSampleProject("Sample")).scenarios[0]!.startDate;
    expect(new Date(`${start}T00:00:00`).getDay()).toBe(1);
  });
});
