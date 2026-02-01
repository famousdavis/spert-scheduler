import { describe, it, expect } from "vitest";
import {
  ActivitySchema,
  ScenarioSettingsSchema,
  ProjectSchema,
  CalendarSchema,
} from "./project.schema";

describe("ActivitySchema", () => {
  const validActivity = {
    id: "a1",
    name: "Design",
    min: 3,
    mostLikely: 5,
    max: 10,
    confidenceLevel: "mediumConfidence" as const,
    distributionType: "normal" as const,
    status: "planned" as const,
  };

  it("accepts a valid activity", () => {
    const result = ActivitySchema.safeParse(validActivity);
    expect(result.success).toBe(true);
  });

  it("accepts activity with optional sdOverride", () => {
    const result = ActivitySchema.safeParse({
      ...validActivity,
      sdOverride: 1.5,
    });
    expect(result.success).toBe(true);
  });

  it("accepts activity with actualDuration when complete", () => {
    const result = ActivitySchema.safeParse({
      ...validActivity,
      status: "complete",
      actualDuration: 7,
    });
    expect(result.success).toBe(true);
  });

  it("rejects min > mostLikely", () => {
    const result = ActivitySchema.safeParse({
      ...validActivity,
      min: 8,
      mostLikely: 5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects mostLikely > max", () => {
    const result = ActivitySchema.safeParse({
      ...validActivity,
      mostLikely: 12,
      max: 10,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative estimates", () => {
    const result = ActivitySchema.safeParse({
      ...validActivity,
      min: -1,
    });
    expect(result.success).toBe(false);
  });

  it("accepts min == mostLikely == max", () => {
    const result = ActivitySchema.safeParse({
      ...validActivity,
      min: 5,
      mostLikely: 5,
      max: 5,
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid confidence level", () => {
    const result = ActivitySchema.safeParse({
      ...validActivity,
      confidenceLevel: "superHigh",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid distribution type", () => {
    const result = ActivitySchema.safeParse({
      ...validActivity,
      distributionType: "beta",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty name", () => {
    const result = ActivitySchema.safeParse({
      ...validActivity,
      name: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("ScenarioSettingsSchema", () => {
  const validSettings = {
    defaultConfidenceLevel: "mediumConfidence",
    defaultDistributionType: "normal",
    trialCount: 50000,
    rngSeed: "abc-123",
    probabilityTarget: 0.85,
    projectProbabilityTarget: 0.95,
  };

  it("accepts valid settings", () => {
    const result = ScenarioSettingsSchema.safeParse(validSettings);
    expect(result.success).toBe(true);
  });

  it("rejects trialCount below 1000", () => {
    const result = ScenarioSettingsSchema.safeParse({
      ...validSettings,
      trialCount: 999,
    });
    expect(result.success).toBe(false);
  });

  it("rejects trialCount above 500000", () => {
    const result = ScenarioSettingsSchema.safeParse({
      ...validSettings,
      trialCount: 500001,
    });
    expect(result.success).toBe(false);
  });

  it("rejects probabilityTarget below 0.01", () => {
    const result = ScenarioSettingsSchema.safeParse({
      ...validSettings,
      probabilityTarget: 0.005,
    });
    expect(result.success).toBe(false);
  });

  it("rejects probabilityTarget above 0.99", () => {
    const result = ScenarioSettingsSchema.safeParse({
      ...validSettings,
      probabilityTarget: 1.0,
    });
    expect(result.success).toBe(false);
  });

  it("accepts boundary values", () => {
    expect(
      ScenarioSettingsSchema.safeParse({
        ...validSettings,
        trialCount: 1000,
        probabilityTarget: 0.01,
      }).success
    ).toBe(true);
    expect(
      ScenarioSettingsSchema.safeParse({
        ...validSettings,
        trialCount: 500000,
        probabilityTarget: 0.99,
      }).success
    ).toBe(true);
  });
});

describe("CalendarSchema", () => {
  it("accepts valid holidays", () => {
    const result = CalendarSchema.safeParse({
      holidays: ["2025-12-25", "2026-01-01"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty holidays", () => {
    const result = CalendarSchema.safeParse({ holidays: [] });
    expect(result.success).toBe(true);
  });

  it("rejects invalid date format", () => {
    const result = CalendarSchema.safeParse({
      holidays: ["12/25/2025"],
    });
    expect(result.success).toBe(false);
  });
});

describe("ProjectSchema", () => {
  const validProject = {
    id: "p1",
    name: "Test Project",
    createdAt: "2025-01-01T00:00:00.000Z",
    schemaVersion: 2,
    scenarios: [
      {
        id: "s1",
        name: "Baseline",
        startDate: "2025-02-01",
        activities: [
          {
            id: "a1",
            name: "Task 1",
            min: 2,
            mostLikely: 4,
            max: 8,
            confidenceLevel: "mediumConfidence",
            distributionType: "normal",
            status: "planned",
          },
        ],
        dependencies: [],
        settings: {
          defaultConfidenceLevel: "mediumConfidence",
          defaultDistributionType: "normal",
          trialCount: 50000,
          rngSeed: "test-seed",
          probabilityTarget: 0.85,
          projectProbabilityTarget: 0.95,
        },
      },
    ],
  };

  it("accepts a valid project", () => {
    const result = ProjectSchema.safeParse(validProject);
    expect(result.success).toBe(true);
  });

  it("accepts project with globalCalendarOverride", () => {
    const result = ProjectSchema.safeParse({
      ...validProject,
      globalCalendarOverride: { holidays: ["2025-12-25"] },
    });
    expect(result.success).toBe(true);
  });

  it("rejects project with invalid schemaVersion", () => {
    const result = ProjectSchema.safeParse({
      ...validProject,
      schemaVersion: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects project with empty name", () => {
    const result = ProjectSchema.safeParse({
      ...validProject,
      name: "",
    });
    expect(result.success).toBe(false);
  });
});
