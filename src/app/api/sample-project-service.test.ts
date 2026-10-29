// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  buildSampleProject,
  nextMondayISO,
  sampleStartISO,
} from "@app/api/sample-project-service";
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

  it("keeps the fixture's own seed on every load", async () => {
    const a = await buildSampleProject("A", "2026-07-27");
    const b = await buildSampleProject("B", "2026-07-27");

    for (const p of [a, b]) {
      expect(p.scenarios.map((s) => s.settings.rngSeed)).toEqual(["sample-cloud-erp"]);
    }
    // Control: each load is still a new project.
    expect(a.id).not.toBe(b.id);
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

// WI-106: a sample loaded in a week whose next Monday is one of its own US holidays started
// on that holiday, so its first activity began on the Tuesday while the scenario's Start Date
// read the Monday — the summary card and the exported schedule disagreed. Dates written out.
describe("sampleStartISO — the default start skips the sample's own holidays", () => {
  it("in the week of 2026-10-05, it skips Columbus Day (2026-10-12) to 2026-10-19", () => {
    // Control: the plain next Monday is the holiday.
    expect(nextMondayISO(new Date(2026, 9, 6))).toBe("2026-10-12");
    expect(sampleStartISO(new Date(2026, 9, 6))).toBe("2026-10-19"); // Tue
    expect(sampleStartISO(new Date(2026, 9, 11))).toBe("2026-10-19"); // Sun
  });

  it("from Columbus Day itself (2026-10-12, a Monday holiday), it starts on 2026-10-19", () => {
    expect(sampleStartISO(new Date(2026, 9, 12))).toBe("2026-10-19");
  });

  it("in an ordinary week it keeps the next Monday, and a Monday that is no holiday", () => {
    expect(sampleStartISO(new Date(2026, 9, 29))).toBe("2026-11-02"); // Thu
    expect(sampleStartISO(new Date(2026, 9, 5))).toBe("2026-10-05"); // a Monday, no holiday
  });

  it("a fixed-date holiday on a Monday moves it too: Independence Day 2033 (2033-07-04) to 2033-07-11", () => {
    expect(nextMondayISO(new Date(2033, 5, 29))).toBe("2033-07-04"); // control: Wed → the holiday
    expect(sampleStartISO(new Date(2033, 5, 29))).toBe("2033-07-11");
  });

  it("Christmas Day 2028 and New Year's Day 2029, both Mondays, move it two weeks, to 2029-01-08", () => {
    expect(sampleStartISO(new Date(2028, 11, 20))).toBe("2029-01-08"); // Wed
  });
});

describe("buildSampleProject — the start date (WI-106)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses an explicit startDate exactly as given, even on one of its holidays (2026-10-12)", async () => {
    const p = await buildSampleProject("Sample", "2026-10-12");
    expect(p.scenarios[0]!.startDate).toBe("2026-10-12");
    // Control: that date IS one of the sample's holidays.
    expect(p.globalCalendarOverride!.holidays.some((h) => h.startDate === "2026-10-12")).toBe(true);
  });

  it("with no startDate, a load on 2026-10-07 starts on 2026-10-19, not Columbus Day", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 7, 12)); // Wed in the week of 2026-10-05
    const p = await buildSampleProject("Sample");
    expect(p.scenarios[0]!.startDate).toBe("2026-10-19");
  });
});
