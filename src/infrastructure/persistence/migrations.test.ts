import { describe, it, expect } from "vitest";
import { applyMigrations } from "./migrations";

describe("applyMigrations", () => {
  it("returns data unchanged when no migrations needed", () => {
    const data = { foo: "bar" };
    const result = applyMigrations(data, 2, 2);
    expect(result).toEqual(data);
  });

  it("migrates v1 to v2: adds projectProbabilityTarget", () => {
    const v1Data = {
      schemaVersion: 1,
      name: "Test Project",
      scenarios: [
        {
          id: "s1",
          name: "Baseline",
          settings: {
            defaultConfidenceLevel: "mediumConfidence",
            defaultDistributionType: "normal",
            trialCount: 50000,
            rngSeed: "seed123",
            probabilityTarget: 0.85,
          },
        },
      ],
    };

    const result = applyMigrations(v1Data, 1, 2) as Record<string, unknown>;
    expect(result.schemaVersion).toBe(2);

    const scenarios = result.scenarios as Array<Record<string, unknown>>;
    const settings = scenarios[0]!.settings as Record<string, unknown>;
    expect(settings.projectProbabilityTarget).toBe(0.95);
    // Original probabilityTarget preserved
    expect(settings.probabilityTarget).toBe(0.85);
  });

  it("v1→v2 migration handles missing scenarios gracefully", () => {
    const v1Data = {
      schemaVersion: 1,
      name: "Empty Project",
    };

    const result = applyMigrations(v1Data, 1, 2) as Record<string, unknown>;
    expect(result.schemaVersion).toBe(2);
  });

  it("v1→v2 migration does not overwrite existing projectProbabilityTarget", () => {
    const v1Data = {
      schemaVersion: 1,
      scenarios: [
        {
          settings: {
            probabilityTarget: 0.85,
            projectProbabilityTarget: 0.9, // already set (edge case)
          },
        },
      ],
    };

    const result = applyMigrations(v1Data, 1, 2) as Record<string, unknown>;
    const scenarios = result.scenarios as Array<Record<string, unknown>>;
    const settings = scenarios[0]!.settings as Record<string, unknown>;
    expect(settings.projectProbabilityTarget).toBe(0.9); // preserved, not overwritten
  });

  it("migrates v2 to v3: converts string holidays to Holiday objects", () => {
    const v2Data = {
      schemaVersion: 2,
      name: "Test",
      globalCalendarOverride: {
        holidays: ["2025-12-25", "2026-01-01"],
      },
    };

    const result = applyMigrations(v2Data, 2, 3) as Record<string, unknown>;
    expect(result.schemaVersion).toBe(3);

    const cal = result.globalCalendarOverride as Record<string, unknown>;
    const holidays = cal.holidays as Array<Record<string, unknown>>;
    expect(holidays).toHaveLength(2);
    expect(holidays[0]!.name).toBe("");
    expect(holidays[0]!.startDate).toBe("2025-12-25");
    expect(holidays[0]!.endDate).toBe("2025-12-25");
    expect(typeof holidays[0]!.id).toBe("string");
    expect((holidays[0]!.id as string).length).toBeGreaterThan(0);
  });

  it("v2→v3 migration handles missing globalCalendarOverride", () => {
    const v2Data = {
      schemaVersion: 2,
      name: "No Calendar",
    };

    const result = applyMigrations(v2Data, 2, 3) as Record<string, unknown>;
    expect(result.schemaVersion).toBe(3);
    expect(result.globalCalendarOverride).toBeUndefined();
  });

  it("v2→v3 migration handles empty holidays array", () => {
    const v2Data = {
      schemaVersion: 2,
      name: "Empty",
      globalCalendarOverride: { holidays: [] },
    };

    const result = applyMigrations(v2Data, 2, 3) as Record<string, unknown>;
    const cal = result.globalCalendarOverride as Record<string, unknown>;
    expect(cal.holidays).toEqual([]);
  });

  it("applies sequential v1→v3 migrations", () => {
    const v1Data = {
      schemaVersion: 1,
      name: "Old Project",
      scenarios: [
        {
          settings: {
            probabilityTarget: 0.85,
          },
        },
      ],
      globalCalendarOverride: {
        holidays: ["2025-07-04"],
      },
    };

    const result = applyMigrations(v1Data, 1, 3) as Record<string, unknown>;
    expect(result.schemaVersion).toBe(3);

    // v1→v2: projectProbabilityTarget added
    const scenarios = result.scenarios as Array<Record<string, unknown>>;
    const settings = scenarios[0]!.settings as Record<string, unknown>;
    expect(settings.projectProbabilityTarget).toBe(0.95);

    // v2→v3: holidays migrated
    const cal = result.globalCalendarOverride as Record<string, unknown>;
    const holidays = cal.holidays as Array<Record<string, unknown>>;
    expect(holidays[0]!.startDate).toBe("2025-07-04");
    expect(holidays[0]!.endDate).toBe("2025-07-04");
  });
});
