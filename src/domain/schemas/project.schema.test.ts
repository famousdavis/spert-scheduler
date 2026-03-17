// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

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

  it("rejects trialCount above 50000", () => {
    const result = ScenarioSettingsSchema.safeParse({
      ...validSettings,
      trialCount: 50001,
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
        trialCount: 50000,
        probabilityTarget: 0.99,
      }).success
    ).toBe(true);
  });
});

describe("ISODateString validation", () => {
  // Use HolidaySchema as a convenient wrapper to test ISODateString
  it("accepts valid dates", () => {
    const valid = ["2025-01-01", "2024-02-29", "2025-12-31", "2000-06-15"];
    for (const d of valid) {
      const result = CalendarSchema.safeParse({
        holidays: [{ id: "h1", name: "Test", startDate: d, endDate: d }],
      });
      expect(result.success, `Expected ${d} to be accepted`).toBe(true);
    }
  });

  it("rejects invalid calendar dates", () => {
    const invalid = [
      "9999-99-99",   // out-of-range month and day
      "2025-13-01",   // month 13
      "2025-00-01",   // month 0
      "2025-01-32",   // day 32
      "2025-02-29",   // not a leap year
      "2025-04-31",   // April has 30 days
      "2025-06-31",   // June has 30 days
    ];
    for (const d of invalid) {
      const result = CalendarSchema.safeParse({
        holidays: [{ id: "h1", name: "Test", startDate: d, endDate: d }],
      });
      expect(result.success, `Expected ${d} to be rejected`).toBe(false);
    }
  });

  it("accepts leap year Feb 29", () => {
    const result = CalendarSchema.safeParse({
      holidays: [{ id: "h1", name: "Leap", startDate: "2024-02-29", endDate: "2024-02-29" }],
    });
    expect(result.success).toBe(true);
  });
});

describe("CalendarSchema", () => {
  const validHoliday = {
    id: "h1",
    name: "Christmas",
    startDate: "2025-12-25",
    endDate: "2025-12-25",
  };

  it("accepts valid holidays", () => {
    const result = CalendarSchema.safeParse({
      holidays: [
        validHoliday,
        { id: "h2", name: "New Year", startDate: "2026-01-01", endDate: "2026-01-01" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty holidays", () => {
    const result = CalendarSchema.safeParse({ holidays: [] });
    expect(result.success).toBe(true);
  });

  it("accepts holiday with date range", () => {
    const result = CalendarSchema.safeParse({
      holidays: [{ id: "h1", name: "Break", startDate: "2025-12-22", endDate: "2026-01-02" }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts holiday with empty name (migrated data)", () => {
    const result = CalendarSchema.safeParse({
      holidays: [{ id: "h1", name: "", startDate: "2025-12-25", endDate: "2025-12-25" }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid date format", () => {
    const result = CalendarSchema.safeParse({
      holidays: [{ id: "h1", name: "Bad", startDate: "12/25/2025", endDate: "12/25/2025" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects endDate before startDate", () => {
    const result = CalendarSchema.safeParse({
      holidays: [{ id: "h1", name: "Bad", startDate: "2025-12-26", endDate: "2025-12-25" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects holiday with missing id", () => {
    const result = CalendarSchema.safeParse({
      holidays: [{ name: "No ID", startDate: "2025-12-25", endDate: "2025-12-25" }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts holiday with source: 'api'", () => {
    const result = CalendarSchema.safeParse({
      holidays: [{ ...validHoliday, source: "api" }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts holiday with source: 'manual'", () => {
    const result = CalendarSchema.safeParse({
      holidays: [{ ...validHoliday, source: "manual" }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts holiday without source (backward compat)", () => {
    const result = CalendarSchema.safeParse({
      holidays: [validHoliday],
    });
    expect(result.success).toBe(true);
  });

  it("rejects holiday with invalid source", () => {
    const result = CalendarSchema.safeParse({
      holidays: [{ ...validHoliday, source: "invalid" }],
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
        milestones: [],
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
      globalCalendarOverride: {
        holidays: [{ id: "h1", name: "Christmas", startDate: "2025-12-25", endDate: "2025-12-25" }],
      },
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

  it("accepts project with convertedWorkDays", () => {
    const result = ProjectSchema.safeParse({
      ...validProject,
      convertedWorkDays: ["2025-03-08", "2025-03-15"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts project without convertedWorkDays (backward compat)", () => {
    const result = ProjectSchema.safeParse(validProject);
    expect(result.success).toBe(true);
  });

  it("rejects convertedWorkDays with invalid date", () => {
    const result = ProjectSchema.safeParse({
      ...validProject,
      convertedWorkDays: ["not-a-date"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects convertedWorkDays with impossible date", () => {
    const result = ProjectSchema.safeParse({
      ...validProject,
      convertedWorkDays: ["2025-02-29"],
    });
    expect(result.success).toBe(false);
  });
});

describe("HolidaySchema range limit", () => {
  it("accepts holiday range up to 366 days", () => {
    const result = CalendarSchema.safeParse({
      holidays: [{ id: "h1", name: "Year Off", startDate: "2025-01-01", endDate: "2026-01-02" }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects holiday range exceeding 366 days", () => {
    const result = CalendarSchema.safeParse({
      holidays: [{ id: "h1", name: "Too Long", startDate: "2025-01-01", endDate: "2026-06-01" }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("cannot exceed one year");
    }
  });
});
