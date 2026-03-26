// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import { ActivitySchema, DeliverableItemSchema } from "@domain/schemas/project.schema";
import type { DeliverableItem } from "@domain/models/types";

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------

describe("DeliverableItemSchema validation", () => {
  it("accepts a valid deliverable item", () => {
    const item = { id: "d1", text: "User guide", completed: false };
    expect(DeliverableItemSchema.parse(item)).toEqual(item);
  });

  it("rejects empty text", () => {
    const item = { id: "d1", text: "", completed: false };
    expect(() => DeliverableItemSchema.parse(item)).toThrow();
  });

  it("rejects text exceeding 200 chars", () => {
    const item = { id: "d1", text: "a".repeat(201), completed: false };
    expect(() => DeliverableItemSchema.parse(item)).toThrow();
  });

  it("rejects missing id", () => {
    const item = { text: "Deliverable", completed: false };
    expect(() => DeliverableItemSchema.parse(item)).toThrow();
  });

  it("rejects missing completed field", () => {
    const item = { id: "d1", text: "Deliverable" };
    expect(() => DeliverableItemSchema.parse(item)).toThrow();
  });
});

describe("ActivitySchema with deliverables", () => {
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

  it("accepts activity without deliverables (backward compat)", () => {
    const result = ActivitySchema.parse(baseActivity);
    expect(result.deliverables).toBeUndefined();
  });

  it("accepts activity with valid deliverables", () => {
    const deliverables: DeliverableItem[] = [
      { id: "d1", text: "API documentation", completed: true },
      { id: "d2", text: "Test report", completed: false },
    ];
    const result = ActivitySchema.parse({ ...baseActivity, deliverables });
    expect(result.deliverables).toHaveLength(2);
    expect(result.deliverables![0]!.completed).toBe(true);
  });

  it("accepts activity with empty deliverables array", () => {
    const result = ActivitySchema.parse({ ...baseActivity, deliverables: [] });
    expect(result.deliverables).toEqual([]);
  });

  it("rejects deliverables with more than 50 items", () => {
    const deliverables = Array.from({ length: 51 }, (_, i) => ({
      id: `d${i}`,
      text: `Deliverable ${i}`,
      completed: false,
    }));
    expect(() => ActivitySchema.parse({ ...baseActivity, deliverables })).toThrow();
  });

  it("accepts deliverables with exactly 50 items", () => {
    const deliverables = Array.from({ length: 50 }, (_, i) => ({
      id: `d${i}`,
      text: `Deliverable ${i}`,
      completed: false,
    }));
    const result = ActivitySchema.parse({ ...baseActivity, deliverables });
    expect(result.deliverables).toHaveLength(50);
  });
});

// ---------------------------------------------------------------------------
// Activity notes schema validation
// ---------------------------------------------------------------------------

describe("ActivitySchema with notes", () => {
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

  it("accepts activity without notes (backward compat)", () => {
    const result = ActivitySchema.parse(baseActivity);
    expect(result.notes).toBeUndefined();
  });

  it("accepts activity with notes", () => {
    const result = ActivitySchema.parse({ ...baseActivity, notes: "Some note" });
    expect(result.notes).toBe("Some note");
  });

  it("rejects notes exceeding 2000 chars", () => {
    expect(() =>
      ActivitySchema.parse({ ...baseActivity, notes: "a".repeat(2001) })
    ).toThrow();
  });

  it("accepts notes at exactly 2000 chars", () => {
    const result = ActivitySchema.parse({ ...baseActivity, notes: "a".repeat(2000) });
    expect(result.notes).toHaveLength(2000);
  });
});

// ---------------------------------------------------------------------------
// Export round-trip
// ---------------------------------------------------------------------------

describe("Deliverables in schedule export", () => {
  it("buildGridRows includes deliverable summary for activities with deliverables", async () => {
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
        deliverables: [
          { id: "d1", text: "Wireframe doc", completed: true },
          { id: "d2", text: "Review notes", completed: false },
          { id: "d3", text: "Final spec", completed: true },
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
        // no deliverables
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

    // Activity with deliverables should have summary
    expect(rows[0]!.deliverables).toBe("2/3");
    expect(rows[0]!.deliverableDetails).toContain("[x] Wireframe doc");
    expect(rows[0]!.deliverableDetails).toContain("[ ] Review notes");

    // Activity without deliverables should have no deliverable fields
    expect(rows[1]!.deliverables).toBeUndefined();
    expect(rows[1]!.deliverableDetails).toBeUndefined();
  });

  it("CSV export includes Deliverables and Deliverable Details columns", async () => {
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
        deliverables: [
          { id: "d1", text: "Wireframe doc", completed: true },
          { id: "d2", text: "Review notes", completed: false },
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
    const headerLine = lines.find((l) => l.startsWith("#,") || l.startsWith('"#"'));
    expect(headerLine).toContain("Deliverables");
    expect(headerLine).toContain("Deliverable Details");

    // Data row should contain the deliverable summary
    const dataLine = lines.find((l) => l.includes("Design"));
    expect(dataLine).toContain("1/2");
  });
});
