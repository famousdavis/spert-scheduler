// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

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

  it("migrates v5 to v6: adds heuristic settings to scenario settings", () => {
    const v5Data = {
      schemaVersion: 5,
      name: "Test Project",
      scenarios: [
        {
          id: "s1",
          name: "Baseline",
          settings: {
            probabilityTarget: 0.5,
            projectProbabilityTarget: 0.95,
          },
        },
      ],
    };

    const result = applyMigrations(v5Data, 5, 6) as Record<string, unknown>;
    expect(result.schemaVersion).toBe(6);

    const scenarios = result.scenarios as Array<Record<string, unknown>>;
    const settings = scenarios[0]!.settings as Record<string, unknown>;
    expect(settings.heuristicEnabled).toBe(false);
    expect(settings.heuristicMinPercent).toBe(50);
    expect(settings.heuristicMaxPercent).toBe(200);
  });

  it("v5→v6 migration does not overwrite existing heuristic values", () => {
    const v5Data = {
      schemaVersion: 5,
      name: "Custom Heuristic",
      scenarios: [
        {
          id: "s1",
          name: "Baseline",
          settings: {
            heuristicEnabled: true,
            heuristicMinPercent: 25,
            heuristicMaxPercent: 300,
          },
        },
      ],
    };

    const result = applyMigrations(v5Data, 5, 6) as Record<string, unknown>;
    const scenarios = result.scenarios as Array<Record<string, unknown>>;
    const settings = scenarios[0]!.settings as Record<string, unknown>;
    expect(settings.heuristicEnabled).toBe(true);
    expect(settings.heuristicMinPercent).toBe(25);
    expect(settings.heuristicMaxPercent).toBe(300);
  });

  it("v5→v6 migration handles missing scenarios gracefully", () => {
    const v5Data = {
      schemaVersion: 5,
      name: "No Scenarios",
    };

    const result = applyMigrations(v5Data, 5, 6) as Record<string, unknown>;
    expect(result.schemaVersion).toBe(6);
  });

  it("applies sequential v1→v6 migrations", () => {
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

    const result = applyMigrations(v1Data, 1, 6) as Record<string, unknown>;
    expect(result.schemaVersion).toBe(6);

    const scenarios = result.scenarios as Array<Record<string, unknown>>;
    const settings = scenarios[0]!.settings as Record<string, unknown>;

    // v1→v2
    expect(settings.projectProbabilityTarget).toBe(0.95);
    // v4→v5
    expect(scenarios[0]!.locked).toBe(false);
    // v5→v6
    expect(settings.heuristicEnabled).toBe(false);
    expect(settings.heuristicMinPercent).toBe(50);
    expect(settings.heuristicMaxPercent).toBe(200);
    // v3→v4
    expect(result.archived).toBe(false);
  });

  it("migrates v6 to v7: adds dependencies and dependencyMode to scenarios", () => {
    const v6Data = {
      schemaVersion: 6,
      name: "Test Project",
      scenarios: [
        {
          id: "s1",
          name: "Baseline",
          settings: {
            probabilityTarget: 0.5,
            projectProbabilityTarget: 0.95,
            heuristicEnabled: false,
            heuristicMinPercent: 50,
            heuristicMaxPercent: 200,
          },
        },
      ],
    };

    const result = applyMigrations(v6Data, 6, 7) as Record<string, unknown>;
    expect(result.schemaVersion).toBe(7);

    const scenarios = result.scenarios as Array<Record<string, unknown>>;
    expect(scenarios[0]!.dependencies).toEqual([]);

    const settings = scenarios[0]!.settings as Record<string, unknown>;
    expect(settings.dependencyMode).toBe(false);
  });

  it("v6→v7 migration does not overwrite existing dependencies", () => {
    const v6Data = {
      schemaVersion: 6,
      name: "Deps Project",
      scenarios: [
        {
          id: "s1",
          name: "Baseline",
          dependencies: [
            { fromActivityId: "a1", toActivityId: "a2", type: "FS", lagDays: 0 },
          ],
          settings: {
            dependencyMode: true,
          },
        },
      ],
    };

    const result = applyMigrations(v6Data, 6, 7) as Record<string, unknown>;
    expect(result.schemaVersion).toBe(7);

    const scenarios = result.scenarios as Array<Record<string, unknown>>;
    const deps = scenarios[0]!.dependencies as Array<Record<string, unknown>>;
    expect(deps).toHaveLength(1);
    expect(deps[0]!.fromActivityId).toBe("a1");

    const settings = scenarios[0]!.settings as Record<string, unknown>;
    expect(settings.dependencyMode).toBe(true);
  });

  it("v6→v7 migration handles missing scenarios gracefully", () => {
    const v6Data = {
      schemaVersion: 6,
      name: "No Scenarios",
    };

    const result = applyMigrations(v6Data, 6, 7) as Record<string, unknown>;
    expect(result.schemaVersion).toBe(7);
  });

  it("v6→v7 migration handles multiple scenarios", () => {
    const v6Data = {
      schemaVersion: 6,
      name: "Multi-Scenario",
      scenarios: [
        { id: "s1", name: "Baseline", settings: {} },
        { id: "s2", name: "Optimistic", settings: {} },
      ],
    };

    const result = applyMigrations(v6Data, 6, 7) as Record<string, unknown>;
    expect(result.schemaVersion).toBe(7);

    const scenarios = result.scenarios as Array<Record<string, unknown>>;
    expect(scenarios[0]!.dependencies).toEqual([]);
    expect(scenarios[1]!.dependencies).toEqual([]);

    const s1Settings = scenarios[0]!.settings as Record<string, unknown>;
    const s2Settings = scenarios[1]!.settings as Record<string, unknown>;
    expect(s1Settings.dependencyMode).toBe(false);
    expect(s2Settings.dependencyMode).toBe(false);
  });

  it("applies sequential v1→v7 migrations", () => {
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

    const result = applyMigrations(v1Data, 1, 7) as Record<string, unknown>;
    expect(result.schemaVersion).toBe(7);

    const scenarios = result.scenarios as Array<Record<string, unknown>>;
    const settings = scenarios[0]!.settings as Record<string, unknown>;

    // v1→v2
    expect(settings.projectProbabilityTarget).toBe(0.95);
    // v3→v4
    expect(result.archived).toBe(false);
    // v4→v5
    expect(scenarios[0]!.locked).toBe(false);
    // v5→v6
    expect(settings.heuristicEnabled).toBe(false);
    expect(settings.heuristicMinPercent).toBe(50);
    expect(settings.heuristicMaxPercent).toBe(200);
    // v6→v7
    expect(scenarios[0]!.dependencies).toEqual([]);
    expect(settings.dependencyMode).toBe(false);
  });

  it("migrates v7 to v8: adds milestones to scenarios", () => {
    const v7Data = {
      schemaVersion: 7,
      name: "Test Project",
      scenarios: [
        {
          id: "s1",
          name: "Baseline",
          dependencies: [],
          settings: {
            dependencyMode: true,
          },
        },
      ],
    };

    const result = applyMigrations(v7Data, 7, 8) as Record<string, unknown>;
    expect(result.schemaVersion).toBe(8);

    const scenarios = result.scenarios as Array<Record<string, unknown>>;
    expect(scenarios[0]!.milestones).toEqual([]);
  });

  it("v7→v8 migration does not overwrite existing milestones", () => {
    const v7Data = {
      schemaVersion: 7,
      name: "Milestone Project",
      scenarios: [
        {
          id: "s1",
          name: "Baseline",
          milestones: [
            { id: "m1", name: "DR Cutover", targetDate: "2025-07-01" },
          ],
          settings: {},
        },
      ],
    };

    const result = applyMigrations(v7Data, 7, 8) as Record<string, unknown>;
    expect(result.schemaVersion).toBe(8);

    const scenarios = result.scenarios as Array<Record<string, unknown>>;
    const milestones = scenarios[0]!.milestones as Array<Record<string, unknown>>;
    expect(milestones).toHaveLength(1);
    expect(milestones[0]!.name).toBe("DR Cutover");
  });

  it("v7→v8 migration handles missing scenarios gracefully", () => {
    const v7Data = {
      schemaVersion: 7,
      name: "No Scenarios",
    };

    const result = applyMigrations(v7Data, 7, 8) as Record<string, unknown>;
    expect(result.schemaVersion).toBe(8);
  });

  it("v7→v8 migration handles multiple scenarios", () => {
    const v7Data = {
      schemaVersion: 7,
      name: "Multi-Scenario",
      scenarios: [
        { id: "s1", name: "Baseline", settings: {} },
        { id: "s2", name: "Optimistic", settings: {} },
      ],
    };

    const result = applyMigrations(v7Data, 7, 8) as Record<string, unknown>;
    expect(result.schemaVersion).toBe(8);

    const scenarios = result.scenarios as Array<Record<string, unknown>>;
    expect(scenarios[0]!.milestones).toEqual([]);
    expect(scenarios[1]!.milestones).toEqual([]);
  });

  it("applies sequential v1→v8 migrations", () => {
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

    const result = applyMigrations(v1Data, 1, 8) as Record<string, unknown>;
    expect(result.schemaVersion).toBe(8);

    const scenarios = result.scenarios as Array<Record<string, unknown>>;
    const settings = scenarios[0]!.settings as Record<string, unknown>;

    // v1→v2
    expect(settings.projectProbabilityTarget).toBe(0.95);
    // v3→v4
    expect(result.archived).toBe(false);
    // v4→v5
    expect(scenarios[0]!.locked).toBe(false);
    // v5→v6
    expect(settings.heuristicEnabled).toBe(false);
    // v6→v7
    expect(scenarios[0]!.dependencies).toEqual([]);
    expect(settings.dependencyMode).toBe(false);
    // v7→v8
    expect(scenarios[0]!.milestones).toEqual([]);
  });

  // -- v8 → v9 ---------------------------------------------------------------

  it("v8→v9: bumps schemaVersion to 9", () => {
    const v8Data = { schemaVersion: 8, scenarios: [] };
    const result = applyMigrations(v8Data, 8, 9) as Record<string, unknown>;
    expect(result.schemaVersion).toBe(9);
  });

  it("v8→v9: preserves existing holidays without source field", () => {
    const v8Data = {
      schemaVersion: 8,
      globalCalendarOverride: {
        holidays: [
          { id: "h1", name: "Christmas", startDate: "2026-12-25", endDate: "2026-12-25" },
        ],
      },
      scenarios: [],
    };
    const result = applyMigrations(v8Data, 8, 9) as Record<string, unknown>;
    expect(result.schemaVersion).toBe(9);
    const cal = result.globalCalendarOverride as Record<string, unknown>;
    const holidays = cal.holidays as Array<Record<string, unknown>>;
    expect(holidays).toHaveLength(1);
    expect(holidays[0]!.name).toBe("Christmas");
    // source field not present — treated as manual by convention
    expect(holidays[0]!.source).toBeUndefined();
  });

  // -- v9 → v10 --------------------------------------------------------------

  it("v9→v10: adds convertedWorkDays field", () => {
    const v9Data = {
      schemaVersion: 9,
      scenarios: [],
    };
    const result = applyMigrations(v9Data, 9, 10) as Record<string, unknown>;
    expect(result.schemaVersion).toBe(10);
    expect(result.convertedWorkDays).toEqual([]);
  });

  it("v9→v10: does not overwrite existing convertedWorkDays", () => {
    const v9Data = {
      schemaVersion: 9,
      convertedWorkDays: ["2025-01-04"],
      scenarios: [],
    };
    const result = applyMigrations(v9Data, 9, 10) as Record<string, unknown>;
    expect(result.schemaVersion).toBe(10);
    expect(result.convertedWorkDays).toEqual(["2025-01-04"]);
  });

  it("v1→v10: full sequential migration", () => {
    const v1Data = {
      schemaVersion: 1,
      scenarios: [
        {
          settings: { probabilityTarget: 0.85 },
          activities: [],
        },
      ],
      globalCalendarOverride: {
        holidays: ["2025-07-04"],
      },
    };

    const result = applyMigrations(v1Data, 1, 10) as Record<string, unknown>;
    expect(result.schemaVersion).toBe(10);
    expect(result.convertedWorkDays).toEqual([]);
  });

  it("v1→v9: full sequential migration", () => {
    const v1Data = {
      schemaVersion: 1,
      scenarios: [
        {
          settings: { probabilityTarget: 0.85 },
          activities: [],
        },
      ],
      globalCalendarOverride: {
        holidays: ["2025-07-04"],
      },
    };

    const result = applyMigrations(v1Data, 1, 9) as Record<string, unknown>;
    expect(result.schemaVersion).toBe(9);
  });

  // -- v12 → v13: Parkinson's Law toggle ------------------------------------

  it("v12→v13: sets parkinsonsLawEnabled = true on scenarios missing the field", () => {
    const v12Data = {
      schemaVersion: 12,
      scenarios: [
        { settings: { trialCount: 10000 }, activities: [] },
        { settings: { trialCount: 50000 }, activities: [] },
      ],
    };

    const result = applyMigrations(v12Data, 12, 13) as Record<string, unknown>;
    expect(result.schemaVersion).toBe(13);
    const scenarios = result.scenarios as Array<Record<string, unknown>>;
    for (const s of scenarios) {
      const settings = s.settings as Record<string, unknown>;
      expect(settings.parkinsonsLawEnabled).toBe(true);
    }
  });

  it("v12→v13: does not overwrite existing parkinsonsLawEnabled = false", () => {
    const v12Data = {
      schemaVersion: 12,
      scenarios: [
        { settings: { trialCount: 10000, parkinsonsLawEnabled: false }, activities: [] },
      ],
    };

    const result = applyMigrations(v12Data, 12, 13) as Record<string, unknown>;
    expect(result.schemaVersion).toBe(13);
    const scenarios = result.scenarios as Array<Record<string, unknown>>;
    const settings = scenarios[0]!.settings as Record<string, unknown>;
    expect(settings.parkinsonsLawEnabled).toBe(false);
  });

  it("v1→v13: full sequential migration", () => {
    const v1Data = {
      schemaVersion: 1,
      scenarios: [
        {
          settings: { probabilityTarget: 0.85 },
          activities: [],
        },
      ],
      globalCalendarOverride: {
        holidays: ["2025-07-04"],
      },
    };

    const result = applyMigrations(v1Data, 1, 13) as Record<string, unknown>;
    expect(result.schemaVersion).toBe(13);
    const scenarios = result.scenarios as Array<Record<string, unknown>>;
    const settings = scenarios[0]!.settings as Record<string, unknown>;
    expect(settings.parkinsonsLawEnabled).toBe(true);
  });

  // -- v13 → v14: Activity checklist field ------------------------------------

  it("v13→v14: bumps schema version to 14", () => {
    const v13Data = {
      schemaVersion: 13,
      scenarios: [
        { settings: { parkinsonsLawEnabled: true }, activities: [{ id: "a1" }] },
      ],
    };

    const result = applyMigrations(v13Data, 13, 14) as Record<string, unknown>;
    expect(result.schemaVersion).toBe(14);
  });

  it("v13→v14: preserves existing activity data unchanged", () => {
    const v13Data = {
      schemaVersion: 13,
      scenarios: [
        {
          settings: { parkinsonsLawEnabled: true },
          activities: [
            { id: "a1", name: "Test Activity", min: 1, max: 5 },
          ],
        },
      ],
    };

    const result = applyMigrations(v13Data, 13, 14) as Record<string, unknown>;
    const scenarios = result.scenarios as Array<Record<string, unknown>>;
    const activities = scenarios[0]!.activities as Array<Record<string, unknown>>;
    expect(activities[0]!.name).toBe("Test Activity");
    expect(activities[0]!.min).toBe(1);
    // checklist field not added — it's optional
    expect(activities[0]!.checklist).toBeUndefined();
  });

  // -- v14 → v15: Finish target date fields -----------------------------------

  it("v14→v15: bumps schema version to 15", () => {
    const data = { schemaVersion: 14, scenarios: [] };
    const result = applyMigrations(data, 14, 15) as Record<string, unknown>;
    expect(result.schemaVersion).toBe(15);
  });

  it("v14→v15: sets targetFinishDate to null and showTargetOnGantt to false", () => {
    const data = { schemaVersion: 14, scenarios: [] };
    const result = applyMigrations(data, 14, 15) as Record<string, unknown>;
    expect(result.targetFinishDate).toBe(null);
    expect(result.showTargetOnGantt).toBe(false);
  });

  it("v14→v15: preserves existing targetFinishDate if present", () => {
    const data = { schemaVersion: 14, targetFinishDate: "2026-06-01", showTargetOnGantt: true, scenarios: [] };
    const result = applyMigrations(data, 14, 15) as Record<string, unknown>;
    expect(result.targetFinishDate).toBe("2026-06-01");
    expect(result.showTargetOnGantt).toBe(true);
  });

  // -- v15 → v16: Activity deliverables/notes, scenario notes ----------------

  it("v15→v16: bumps schema version to 16", () => {
    const data = { schemaVersion: 15, scenarios: [] };
    const result = applyMigrations(data, 15, 16) as Record<string, unknown>;
    expect(result.schemaVersion).toBe(16);
  });

  it("v15→v16: preserves existing activity and scenario data unchanged", () => {
    const data = {
      schemaVersion: 15,
      scenarios: [
        {
          settings: { parkinsonsLawEnabled: true },
          activities: [
            { id: "a1", name: "Test", min: 1, max: 5, checklist: [{ id: "c1", text: "Task", completed: false }] },
          ],
        },
      ],
    };
    const result = applyMigrations(data, 15, 16) as Record<string, unknown>;
    expect(result.schemaVersion).toBe(16);
    const scenarios = result.scenarios as Array<Record<string, unknown>>;
    const activities = scenarios[0]!.activities as Array<Record<string, unknown>>;
    expect(activities[0]!.name).toBe("Test");
    expect(activities[0]!.checklist).toHaveLength(1);
    // New optional fields not added — they're optional
    expect(activities[0]!.deliverables).toBeUndefined();
    expect(activities[0]!.notes).toBeUndefined();
    expect(scenarios[0]!.notes).toBeUndefined();
  });

  it("v1→v16: full sequential migration", () => {
    const v1Data = {
      schemaVersion: 1,
      scenarios: [
        {
          settings: { probabilityTarget: 0.85 },
          activities: [],
        },
      ],
      globalCalendarOverride: {
        holidays: ["2025-07-04"],
      },
    };

    const result = applyMigrations(v1Data, 1, 16) as Record<string, unknown>;
    expect(result.schemaVersion).toBe(16);
    expect(result.targetFinishDate).toBe(null);
    expect(result.showTargetOnGantt).toBe(false);
  });

  // -- v16 → v17: showActivityIds on Project ----------------------------------

  it("v16→v17: bumps schema version to 17", () => {
    const data = { schemaVersion: 16, scenarios: [] };
    const result = applyMigrations(data, 16, 17) as Record<string, unknown>;
    expect(result.schemaVersion).toBe(17);
  });

  it("v16→v17: preserves existing project data unchanged", () => {
    const data = {
      schemaVersion: 16,
      targetFinishDate: "2026-06-01",
      showTargetOnGantt: true,
      scenarios: [{ settings: {}, activities: [{ id: "a1", name: "Test" }] }],
    };
    const result = applyMigrations(data, 16, 17) as Record<string, unknown>;
    expect(result.schemaVersion).toBe(17);
    expect(result.targetFinishDate).toBe("2026-06-01");
    expect(result.showTargetOnGantt).toBe(true);
    expect(result.showActivityIds).toBeUndefined();
  });

  // -- v17 → v18: ganttAppearance on Project -----------------------------------

  it("v17→v18: bumps schema version to 18", () => {
    const data = { schemaVersion: 17, scenarios: [] };
    const result = applyMigrations(data, 17, 18) as Record<string, unknown>;
    expect(result.schemaVersion).toBe(18);
  });

  it("v17→v18: preserves existing project data unchanged", () => {
    const data = {
      schemaVersion: 17,
      targetFinishDate: "2026-06-01",
      showTargetOnGantt: true,
      showActivityIds: true,
      scenarios: [{ settings: {}, activities: [{ id: "a1", name: "Test" }] }],
    };
    const result = applyMigrations(data, 17, 18) as Record<string, unknown>;
    expect(result.schemaVersion).toBe(18);
    expect(result.targetFinishDate).toBe("2026-06-01");
    expect(result.showTargetOnGantt).toBe(true);
    expect(result.showActivityIds).toBe(true);
    expect(result.ganttAppearance).toBeUndefined();
  });

  // -- v18 → v19: fitToWindow on GanttAppearanceSettings -----------------------

  it("v18→v19: bumps schema version when no ganttAppearance exists", () => {
    const data = { schemaVersion: 18, scenarios: [] };
    const result = applyMigrations(data, 18, 19) as Record<string, unknown>;
    expect(result.schemaVersion).toBe(19);
    expect(result.ganttAppearance).toBeUndefined();
  });

  it("v18→v19: sets fitToWindow false on existing ganttAppearance", () => {
    const data = {
      schemaVersion: 18,
      ganttAppearance: {
        nameColumnWidth: "normal",
        activityFontSize: "normal",
        rowDensity: "normal",
        barLabel: "duration",
        colorPreset: "classic",
        weekendShading: true,
      },
      scenarios: [],
    };
    const result = applyMigrations(data, 18, 19) as Record<string, unknown>;
    expect(result.schemaVersion).toBe(19);
    const ga = result.ganttAppearance as Record<string, unknown>;
    expect(ga.fitToWindow).toBe(false);
    expect(ga.weekendShading).toBe(true);
    expect(ga.nameColumnWidth).toBe("normal");
  });

  it("v18→v19: does not overwrite existing fitToWindow value", () => {
    const data = {
      schemaVersion: 18,
      ganttAppearance: {
        nameColumnWidth: "wide",
        fitToWindow: true,
      },
      scenarios: [],
    };
    const result = applyMigrations(data, 18, 19) as Record<string, unknown>;
    expect(result.schemaVersion).toBe(19);
    const ga = result.ganttAppearance as Record<string, unknown>;
    expect(ga.fitToWindow).toBe(true);
  });

  it("v1→v19: full sequential migration", () => {
    const v1Data = {
      schemaVersion: 1,
      scenarios: [
        {
          settings: { probabilityTarget: 0.85 },
          activities: [],
        },
      ],
      globalCalendarOverride: {
        holidays: ["2025-07-04"],
      },
    };

    const result = applyMigrations(v1Data, 1, 19) as Record<string, unknown>;
    expect(result.schemaVersion).toBe(19);
    expect(result.targetFinishDate).toBe(null);
    expect(result.showTargetOnGantt).toBe(false);
  });

  it("v1→v15: full sequential migration", () => {
    const v1Data = {
      schemaVersion: 1,
      scenarios: [
        {
          settings: { probabilityTarget: 0.85 },
          activities: [],
        },
      ],
      globalCalendarOverride: {
        holidays: ["2025-07-04"],
      },
    };

    const result = applyMigrations(v1Data, 1, 15) as Record<string, unknown>;
    expect(result.schemaVersion).toBe(15);
    expect(result.targetFinishDate).toBe(null);
    expect(result.showTargetOnGantt).toBe(false);
  });
});
