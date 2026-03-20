// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import { ActivitySchema, ChecklistItemSchema } from "@domain/schemas/project.schema";
import type { ChecklistItem } from "@domain/models/types";

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------

describe("ChecklistItemSchema validation", () => {
  it("accepts a valid checklist item", () => {
    const item = { id: "c1", text: "Review design", completed: false };
    expect(ChecklistItemSchema.parse(item)).toEqual(item);
  });

  it("rejects empty text", () => {
    const item = { id: "c1", text: "", completed: false };
    expect(() => ChecklistItemSchema.parse(item)).toThrow();
  });

  it("rejects text exceeding 200 chars", () => {
    const item = { id: "c1", text: "a".repeat(201), completed: false };
    expect(() => ChecklistItemSchema.parse(item)).toThrow();
  });

  it("rejects missing id", () => {
    const item = { text: "Task", completed: false };
    expect(() => ChecklistItemSchema.parse(item)).toThrow();
  });

  it("rejects missing completed field", () => {
    const item = { id: "c1", text: "Task" };
    expect(() => ChecklistItemSchema.parse(item)).toThrow();
  });
});

describe("ActivitySchema with checklist", () => {
  const baseActivity = {
    id: "a1",
    name: "Test Activity",
    min: 1,
    mostLikely: 3,
    max: 5,
    confidenceLevel: "mediumConfidence",
    distributionType: "normal",
    status: "planned",
  };

  it("accepts activity without checklist (backward compat)", () => {
    const result = ActivitySchema.parse(baseActivity);
    expect(result.checklist).toBeUndefined();
  });

  it("accepts activity with valid checklist", () => {
    const checklist: ChecklistItem[] = [
      { id: "c1", text: "Design wireframes", completed: true },
      { id: "c2", text: "Implement", completed: false },
    ];
    const result = ActivitySchema.parse({ ...baseActivity, checklist });
    expect(result.checklist).toHaveLength(2);
    expect(result.checklist![0]!.completed).toBe(true);
  });

  it("accepts activity with empty checklist array", () => {
    const result = ActivitySchema.parse({ ...baseActivity, checklist: [] });
    expect(result.checklist).toEqual([]);
  });

  it("rejects checklist with more than 20 items", () => {
    const checklist = Array.from({ length: 21 }, (_, i) => ({
      id: `c${i}`,
      text: `Task ${i}`,
      completed: false,
    }));
    expect(() => ActivitySchema.parse({ ...baseActivity, checklist })).toThrow();
  });

  it("accepts checklist with exactly 20 items", () => {
    const checklist = Array.from({ length: 20 }, (_, i) => ({
      id: `c${i}`,
      text: `Task ${i}`,
      completed: false,
    }));
    const result = ActivitySchema.parse({ ...baseActivity, checklist });
    expect(result.checklist).toHaveLength(20);
  });
});

// ---------------------------------------------------------------------------
// Export round-trip
// ---------------------------------------------------------------------------

describe("Checklist in schedule export", () => {
  it("buildGridRows includes task summary for activities with checklists", async () => {
    const { buildGridRows } = await import("@app/api/schedule-export-service");

    const activities = [
      {
        id: "a1",
        name: "Design",
        min: 5,
        mostLikely: 10,
        max: 20,
        confidenceLevel: "mediumConfidence" as const,
        distributionType: "normal" as const,
        status: "planned" as const,
        checklist: [
          { id: "c1", text: "Wireframes", completed: true },
          { id: "c2", text: "Review", completed: false },
          { id: "c3", text: "Finalize", completed: true },
        ],
      },
      {
        id: "a2",
        name: "Develop",
        min: 3,
        mostLikely: 5,
        max: 8,
        confidenceLevel: "mediumConfidence" as const,
        distributionType: "normal" as const,
        status: "planned" as const,
        // no checklist
      },
    ];

    const schedule = {
      activities: [
        { activityId: "a1", name: "Design", duration: 12, startDate: "2026-03-16", endDate: "2026-03-31", isActual: false },
        { activityId: "a2", name: "Develop", duration: 5, startDate: "2026-04-01", endDate: "2026-04-07", isActual: false },
      ],
      totalDurationDays: 17,
      projectEndDate: "2026-04-07",
    };

    const settings = {
      defaultConfidenceLevel: "mediumConfidence" as const,
      defaultDistributionType: "normal" as const,
      trialCount: 10000,
      rngSeed: "test-seed",
      probabilityTarget: 0.5,
      projectProbabilityTarget: 0.95,
      heuristicEnabled: false,
      heuristicMinPercent: 50,
      heuristicMaxPercent: 200,
      dependencyMode: false,
      parkinsonsLawEnabled: true,
    };

    const rows = buildGridRows({
      projectName: "Test",
      scenarioName: "Baseline",
      activities,
      schedule,
      buffer: null,
      settings,
      dependencies: [],
      milestones: [],
      dateFormat: "MM/DD/YYYY",
    });

    // Activity with checklist should have task summary
    expect(rows[0]!.tasks).toBe("2/3");
    expect(rows[0]!.taskDetails).toContain("[x] Wireframes");
    expect(rows[0]!.taskDetails).toContain("[ ] Review");

    // Activity without checklist should have no task fields
    expect(rows[1]!.tasks).toBeUndefined();
    expect(rows[1]!.taskDetails).toBeUndefined();
  });

  it("CSV export includes Tasks and Task Details columns", async () => {
    const { exportScheduleCsv } = await import("@app/api/schedule-export-service");

    const activities = [
      {
        id: "a1",
        name: "Design",
        min: 5,
        mostLikely: 10,
        max: 20,
        confidenceLevel: "mediumConfidence" as const,
        distributionType: "normal" as const,
        status: "planned" as const,
        checklist: [
          { id: "c1", text: "Wireframes", completed: true },
          { id: "c2", text: "Review", completed: false },
        ],
      },
    ];

    const schedule = {
      activities: [
        { activityId: "a1", name: "Design", duration: 12, startDate: "2026-03-16", endDate: "2026-03-31", isActual: false },
      ],
      totalDurationDays: 12,
      projectEndDate: "2026-03-31",
    };

    const settings = {
      defaultConfidenceLevel: "mediumConfidence" as const,
      defaultDistributionType: "normal" as const,
      trialCount: 10000,
      rngSeed: "test-seed",
      probabilityTarget: 0.5,
      projectProbabilityTarget: 0.95,
      heuristicEnabled: false,
      heuristicMinPercent: 50,
      heuristicMaxPercent: 200,
      dependencyMode: false,
      parkinsonsLawEnabled: true,
    };

    const csv = exportScheduleCsv({
      projectName: "Test",
      scenarioName: "Baseline",
      activities,
      schedule,
      buffer: null,
      settings,
      dependencies: [],
      milestones: [],
      dateFormat: "MM/DD/YYYY",
    });

    const lines = csv.split("\n");
    // Find the header line (first line with "#" as first cell)
    const headerLine = lines.find((l) => l.startsWith("#,") || l.startsWith('"#"'));
    expect(headerLine).toContain("Tasks");
    expect(headerLine).toContain("Task Details");

    // Data row should contain the task summary
    const dataLine = lines.find((l) => l.includes("Design"));
    expect(dataLine).toContain("1/2");
  });
});
