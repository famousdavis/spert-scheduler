// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import type { Activity, Project, Scenario } from "@domain/models/types";
import { DEFAULT_SCENARIO_SETTINGS, SCHEMA_VERSION } from "@domain/models/types";
import { buildProjectSnapshot, truncateSnapshotToBudget } from "./ai-snapshot-service";

// WI-150 (release B): Connect AI reads an activity's four dates, and whether startDate/endDate are recorded.
// Expected values are written out by hand. Calendar: none given, so Monday to Friday.

function activity(id: string, extra: Partial<Activity>): Activity {
  return {
    id, name: id, min: 2, mostLikely: 3, max: 5, confidenceLevel: "mediumConfidence",
    distributionType: "triangular", status: "planned", ...extra,
  };
}

function project(startDate: string, activities: Activity[]): Project {
  const scenario: Scenario = {
    id: "s1", name: "Baseline", startDate, activities, dependencies: [], milestones: [],
    settings: { ...DEFAULT_SCENARIO_SETTINGS, dependencyMode: false },
  };
  return { id: "p1", name: "P", createdAt: "2026-10-01T00:00:00.000Z", schemaVersion: SCHEMA_VERSION, owner: null, scenarios: [scenario] };
}

// Today is pinned (v0.82.0's data date reads it): Friday 30 October 2026.
const TODAY = "2026-10-30";

const DONE = activity("done", {
  status: "complete", actualStartDate: "2026-10-05", actualFinishDate: "2026-10-07", actualDuration: 3,
  plannedStartDate: "2026-10-05", plannedFinishDate: "2026-10-08",
});
const STARTED = activity("started", { status: "inProgress", actualStartDate: "2026-10-08", actualDuration: 2 });
const LATER = activity("later", {});

describe("the AI snapshot's dates (WI-150)", () => {
  const snap = buildProjectSnapshot(project("2026-10-05", [DONE, STARTED, LATER]), undefined, "s1", 0, undefined, TODAY);
  const [done, started, later] = snap.scenarios[0]!.activities;

  it("a Complete activity: both dates recorded, flagged, and its kept plan", () => {
    expect(done).toMatchObject({
      startDate: "2026-10-05", endDate: "2026-10-07", recordedStart: true, recordedFinish: true,
      actualStartDate: "2026-10-05", actualFinishDate: "2026-10-07",
      plannedStartDate: "2026-10-05", plannedFinishDate: "2026-10-08",
    });
  });

  it("an In Progress activity: its start recorded and flagged; its finish is the schedule's forecast", () => {
    expect([started!.startDate, started!.recordedStart, started!.recordedFinish, started!.actualStartDate]).toEqual([
      "2026-10-08", true, undefined, "2026-10-08",
    ]);
  });

  it("a Planned activity carries no date of its own and no flag", () => {
    for (const key of ["recordedStart", "recordedFinish", "actualStartDate", "actualFinishDate", "plannedStartDate", "plannedFinishDate"]) {
      expect(later).not.toHaveProperty(key);
    }
  });

  it("a start the schedule moved (before the Start Date) is not flagged, and the record still says when it was", () => {
    const moved = buildProjectSnapshot(project("2026-10-12", [STARTED]), undefined, "s1", 0, undefined, TODAY).scenarios[0]!.activities[0]!;
    expect([moved.startDate, moved.recordedStart, moved.actualStartDate]).toEqual(["2026-10-12", undefined, "2026-10-08"]);
  });

  it("truncated to the minimum, a non-critical activity keeps the flags with its dates and drops the four", () => {
    const tiny = truncateSnapshotToBudget(snap, 1);
    const kept = tiny.scenarios[0]!.activities.find((a) => a.id === "started")!;
    // Sequential mode computes no float, so nothing is critical and every activity is reduced.
    expect(kept.isCritical).toBeUndefined();
    expect(kept).toEqual({
      id: "started", name: "started", startDate: "2026-10-08", endDate: started!.endDate,
      duration: started!.duration, recordedStart: true,
    });
  });
});

describe("the snapshot shows only the dates an activity's Status keeps (Review 34, V-R4)", () => {
  const STALE_PLANNED = activity("stalePlanned", {
    actualStartDate: "2026-10-05", actualFinishDate: "2026-10-07", plannedStartDate: "2026-10-05", plannedFinishDate: "2026-10-08",
  });
  const STALE_STARTED = activity("staleStarted", {
    status: "inProgress", actualStartDate: "2026-10-08", actualDuration: 2, actualFinishDate: "2026-10-09",
    plannedStartDate: "2026-10-06", plannedFinishDate: "2026-10-09",
  });
  const s = buildProjectSnapshot(project("2026-10-05", [STALE_PLANNED, STALE_STARTED]), undefined, "s1", 0, undefined, TODAY);
  const [planned, started] = s.scenarios[0]!.activities;

  it("a Planned activity holding stale dates shows none of the four", () => {
    for (const key of ["actualStartDate", "actualFinishDate", "plannedStartDate", "plannedFinishDate"]) {
      expect(planned).not.toHaveProperty(key);
    }
  });
  it("an In Progress activity holding an Actual Finish shows its start and kept plan, and no finish", () => {
    expect([started!.actualStartDate, started!.plannedStartDate, started!.plannedFinishDate]).toEqual([
      "2026-10-08", "2026-10-06", "2026-10-09",
    ]);
    expect(started).not.toHaveProperty("actualFinishDate");
  });
});
