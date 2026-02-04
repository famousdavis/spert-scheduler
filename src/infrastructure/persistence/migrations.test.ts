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

  it("migrates v3 to v4: adds archived field", () => {
    const v3Data = {
      schemaVersion: 3,
      name: "Test Project",
      scenarios: [],
    };

    const result = applyMigrations(v3Data, 3, 4) as Record<string, unknown>;
    expect(result.schemaVersion).toBe(4);
    expect(result.archived).toBe(false);
  });

  it("v3→v4 migration does not overwrite existing archived value", () => {
    const v3Data = {
      schemaVersion: 3,
      name: "Archived Project",
      archived: true, // already set (edge case)
      scenarios: [],
    };

    const result = applyMigrations(v3Data, 3, 4) as Record<string, unknown>;
    expect(result.schemaVersion).toBe(4);
    expect(result.archived).toBe(true); // preserved
  });

  it("applies sequential v1→v4 migrations", () => {
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

    const result = applyMigrations(v1Data, 1, 4) as Record<string, unknown>;
    expect(result.schemaVersion).toBe(4);

    // v1→v2: projectProbabilityTarget added
    const scenarios = result.scenarios as Array<Record<string, unknown>>;
    const settings = scenarios[0]!.settings as Record<string, unknown>;
    expect(settings.projectProbabilityTarget).toBe(0.95);

    // v2→v3: holidays migrated
    const cal = result.globalCalendarOverride as Record<string, unknown>;
    const holidays = cal.holidays as Array<Record<string, unknown>>;
    expect(holidays[0]!.startDate).toBe("2025-07-04");

    // v3→v4: archived added
    expect(result.archived).toBe(false);
  });

  it("migrates v4 to v5: adds locked field to scenarios", () => {
    const v4Data = {
      schemaVersion: 4,
      name: "Test Project",
      scenarios: [
        { id: "s1", name: "Baseline", settings: {} },
        { id: "s2", name: "Alt", settings: {} },
      ],
    };

    const result = applyMigrations(v4Data, 4, 5) as Record<string, unknown>;
    expect(result.schemaVersion).toBe(5);

    const scenarios = result.scenarios as Array<Record<string, unknown>>;
    expect(scenarios[0]!.locked).toBe(false);
    expect(scenarios[1]!.locked).toBe(false);
  });

  it("v4→v5 migration does not overwrite existing locked value", () => {
    const v4Data = {
      schemaVersion: 4,
      name: "Locked Project",
      scenarios: [
        { id: "s1", name: "Baseline", settings: {}, locked: true }, // already locked (edge case)
      ],
    };

    const result = applyMigrations(v4Data, 4, 5) as Record<string, unknown>;
    expect(result.schemaVersion).toBe(5);

    const scenarios = result.scenarios as Array<Record<string, unknown>>;
    expect(scenarios[0]!.locked).toBe(true); // preserved
  });

  it("applies sequential v1→v5 migrations", () => {
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

    const result = applyMigrations(v1Data, 1, 5) as Record<string, unknown>;
    expect(result.schemaVersion).toBe(5);

    // v1→v2: projectProbabilityTarget added
    const scenarios = result.scenarios as Array<Record<string, unknown>>;
    const settings = scenarios[0]!.settings as Record<string, unknown>;
    expect(settings.projectProbabilityTarget).toBe(0.95);

    // v2→v3: holidays migrated
    const cal = result.globalCalendarOverride as Record<string, unknown>;
    const holidays = cal.holidays as Array<Record<string, unknown>>;
    expect(holidays[0]!.startDate).toBe("2025-07-04");

    // v3→v4: archived added
    expect(result.archived).toBe(false);

    // v4→v5: locked added to scenarios
    expect(scenarios[0]!.locked).toBe(false);
  });

  it("v4→v5 migration handles missing scenarios gracefully", () => {
    const v4Data = {
      schemaVersion: 4,
      name: "No Scenarios Project",
    };

    const result = applyMigrations(v4Data, 4, 5) as Record<string, unknown>;
    expect(result.schemaVersion).toBe(5);
    expect(result.scenarios).toBeUndefined();
  });

  it("v4→v5 migration handles empty scenarios array", () => {
    const v4Data = {
      schemaVersion: 4,
      name: "Empty Scenarios",
      scenarios: [],
    };

    const result = applyMigrations(v4Data, 4, 5) as Record<string, unknown>;
    expect(result.schemaVersion).toBe(5);
    expect(result.scenarios).toEqual([]);
  });

  it("v4→v5 migration handles multiple scenarios", () => {
    const v4Data = {
      schemaVersion: 4,
      name: "Multi-Scenario Project",
      scenarios: [
        { id: "s1", name: "Baseline", settings: {} },
        { id: "s2", name: "Optimistic", settings: {} },
        { id: "s3", name: "Pessimistic", settings: {} },
      ],
    };

    const result = applyMigrations(v4Data, 4, 5) as Record<string, unknown>;
    expect(result.schemaVersion).toBe(5);

    const scenarios = result.scenarios as Array<Record<string, unknown>>;
    expect(scenarios).toHaveLength(3);
    expect(scenarios[0]!.locked).toBe(false);
    expect(scenarios[1]!.locked).toBe(false);
    expect(scenarios[2]!.locked).toBe(false);
  });
});
