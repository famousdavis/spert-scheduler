// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

/**
 * Migration registry for schema versioning.
 * v1 ships with an empty migrations map. Infrastructure in place for future schema changes.
 *
 * Each migration transforms data from version N to version N+1.
 */
export type Migration = (data: unknown) => unknown;

/**
 * v1 → v2: Add projectProbabilityTarget to scenario settings.
 * Existing probabilityTarget (0.85 in v1) is kept as-is for the activity-level target.
 * New projectProbabilityTarget defaults to 0.95 for project-level MC confidence.
 */
function migrateV1toV2(data: unknown): unknown {
  const project = data as Record<string, unknown>;
  const scenarios = project.scenarios as Array<Record<string, unknown>> | undefined;
  if (scenarios) {
    for (const scenario of scenarios) {
      const settings = scenario.settings as Record<string, unknown> | undefined;
      if (settings && settings.projectProbabilityTarget === undefined) {
        settings.projectProbabilityTarget = 0.95;
      }
    }
  }
  project.schemaVersion = 2;
  return project;
}

/**
 * v2 → v3: Convert holidays from string[] to Holiday[] objects.
 * Each date string becomes { id, name: "", startDate, endDate } (single-day).
 */
function migrateV2toV3(data: unknown): unknown {
  const project = data as Record<string, unknown>;
  const cal = project.globalCalendarOverride as
    | Record<string, unknown>
    | undefined;
  if (cal && Array.isArray(cal.holidays)) {
    cal.holidays = (cal.holidays as unknown[]).map((h) => {
      if (typeof h === "string") {
        return {
          id: crypto.randomUUID(),
          name: "",
          startDate: h,
          endDate: h,
        };
      }
      return h;
    });
  }
  project.schemaVersion = 3;
  return project;
}

/**
 * v3 → v4: Add archived field to project.
 * Defaults to false for existing projects.
 */
function migrateV3toV4(data: unknown): unknown {
  const project = data as Record<string, unknown>;
  if (project.archived === undefined) {
    project.archived = false;
  }
  project.schemaVersion = 4;
  return project;
}

/**
 * v4 → v5: Add locked field to scenarios.
 * Defaults to false (unlocked) for existing scenarios.
 */
function migrateV4toV5(data: unknown): unknown {
  const project = data as Record<string, unknown>;
  const scenarios = project.scenarios as Array<Record<string, unknown>> | undefined;
  if (scenarios) {
    for (const scenario of scenarios) {
      if (scenario.locked === undefined) {
        scenario.locked = false;
      }
    }
  }
  project.schemaVersion = 5;
  return project;
}

/**
 * v5 → v6: Add heuristic estimate settings to scenario settings.
 * Defaults to 50% for min and 200% for max.
 */
function migrateV5toV6(data: unknown): unknown {
  const project = data as Record<string, unknown>;
  const scenarios = project.scenarios as Array<Record<string, unknown>> | undefined;
  if (scenarios) {
    for (const scenario of scenarios) {
      const settings = scenario.settings as Record<string, unknown> | undefined;
      if (settings) {
        if (settings.heuristicEnabled === undefined) {
          settings.heuristicEnabled = false;
        }
        if (settings.heuristicMinPercent === undefined) {
          settings.heuristicMinPercent = 50;
        }
        if (settings.heuristicMaxPercent === undefined) {
          settings.heuristicMaxPercent = 200;
        }
      }
    }
  }
  project.schemaVersion = 6;
  return project;
}

/**
 * v6 → v7: Add dependency mode and dependencies array to scenarios.
 * Defaults to dependencyMode: false and dependencies: [].
 */
function migrateV6toV7(data: unknown): unknown {
  const project = data as Record<string, unknown>;
  const scenarios = project.scenarios as Array<Record<string, unknown>> | undefined;
  if (scenarios) {
    for (const scenario of scenarios) {
      if (scenario.dependencies === undefined) {
        scenario.dependencies = [];
      }
      const settings = scenario.settings as Record<string, unknown> | undefined;
      if (settings && settings.dependencyMode === undefined) {
        settings.dependencyMode = false;
      }
    }
  }
  project.schemaVersion = 7;
  return project;
}

/**
 * v7 → v8: Add milestones array to scenarios.
 * Defaults to milestones: []. Activities gain optional milestoneId and startsAtMilestoneId.
 */
function migrateV7toV8(data: unknown): unknown {
  const project = data as Record<string, unknown>;
  const scenarios = project.scenarios as Array<Record<string, unknown>> | undefined;
  if (scenarios) {
    for (const scenario of scenarios) {
      if (scenario.milestones === undefined) {
        scenario.milestones = [];
      }
    }
  }
  project.schemaVersion = 8;
  return project;
}

/**
 * v8 → v9: Add optional source field to holidays.
 * No data transformation needed — existing holidays without source are treated as "manual".
 */
function migrateV8toV9(data: unknown): unknown {
  const project = data as Record<string, unknown>;
  project.schemaVersion = 9;
  return project;
}

/**
 * v9 → v10: Add convertedWorkDays array to project.
 * Defaults to empty array for existing projects.
 */
function migrateV9toV10(data: unknown): unknown {
  const project = data as Record<string, unknown>;
  if (project.convertedWorkDays === undefined) {
    project.convertedWorkDays = [];
  }
  project.schemaVersion = 10;
  return project;
}

/**
 * v10 → v11: Add constraint fields to activities.
 * Three nullable fields: constraintType, constraintDate, constraintMode.
 * Defensive normalization: partial constraint state → all null.
 */
function migrateV10toV11(data: unknown): unknown {
  const project = data as Record<string, unknown>;
  const scenarios = project.scenarios as Array<Record<string, unknown>> | undefined;
  if (scenarios) {
    for (const scenario of scenarios) {
      const activities = scenario.activities as Array<Record<string, unknown>> | undefined;
      if (activities) {
        for (const activity of activities) {
          const hasType = activity.constraintType != null;
          const hasDate = activity.constraintDate != null;
          const hasMode = activity.constraintMode != null;
          if (!hasType || !hasDate || !hasMode) {
            activity.constraintType = null;
            activity.constraintDate = null;
            activity.constraintMode = null;
          }
        }
      }
    }
  }
  project.schemaVersion = 11;
  return project;
}

/**
 * v11 → v12: Add SS/FF dependency relationship types.
 * Defensive write-forward: set type = "FS" on any dependency missing the field.
 */
function migrateV11toV12(data: unknown): unknown {
  const project = data as Record<string, unknown>;
  const scenarios = project.scenarios as Array<Record<string, unknown>> | undefined;
  if (scenarios) {
    for (const scenario of scenarios) {
      const deps = scenario.dependencies as Array<Record<string, unknown>> | undefined;
      if (deps) {
        for (const dep of deps) {
          if (dep.type === undefined || dep.type === null) {
            dep.type = "FS";
          }
        }
      }
    }
  }
  project.schemaVersion = 12;
  return project;
}

/**
 * v12 → v13: Add Parkinson's Law toggle.
 * Defensive write-forward: set parkinsonsLawEnabled = true on any scenario missing the field.
 */
function migrateV12toV13(data: unknown): unknown {
  const project = data as Record<string, unknown>;
  const scenarios = project.scenarios as Array<Record<string, unknown>> | undefined;
  if (scenarios) {
    for (const scenario of scenarios) {
      const settings = scenario.settings as Record<string, unknown> | undefined;
      if (settings) {
        if (typeof settings.parkinsonsLawEnabled !== 'boolean') {
          settings.parkinsonsLawEnabled = true;
        }
      }
    }
  }
  project.schemaVersion = 13;
  return project;
}

/**
 * v13 → v14: Add optional checklist field to activities.
 * No data transformation needed — checklist is optional and defaults to absent.
 */
function migrateV13toV14(data: unknown): unknown {
  const project = data as Record<string, unknown>;
  project.schemaVersion = 14;
  return project;
}

/**
 * v14 → v15: Add finish target date fields to project.
 * targetFinishDate defaults to null, showTargetOnGantt defaults to false.
 */
function migrateV14toV15(data: unknown): unknown {
  const project = data as Record<string, unknown>;
  if (project.targetFinishDate === undefined) {
    project.targetFinishDate = null;
  }
  if (project.showTargetOnGantt === undefined) {
    project.showTargetOnGantt = false;
  }
  project.schemaVersion = 15;
  return project;
}

/**
 * v15 → v16: Add deliverables, notes to activities and notes to scenarios.
 * All new fields are optional — no data transformation needed.
 */
function migrateV15toV16(data: unknown): unknown {
  const project = data as Record<string, unknown>;
  project.schemaVersion = 16;
  return project;
}

/**
 * v16 → v17: Add showActivityIds to Project.
 * New field is optional — no data transformation needed.
 */
function migrateV16toV17(data: unknown): unknown {
  const project = data as Record<string, unknown>;
  project.schemaVersion = 17;
  return project;
}

function migrateV17toV18(data: unknown): unknown {
  const project = data as Record<string, unknown>;
  project.schemaVersion = 18;
  return project;
}

/**
 * v18 → v19: Add fitToWindow field to GanttAppearanceSettings.
 * Unlike passthrough migrations, this actively writes fitToWindow: false
 * onto existing ganttAppearance objects where the field is absent.
 * This is required because fitToWindow is a required Zod field.
 * Projects without ganttAppearance are unaffected (the whole object is optional).
 */
function migrateV18toV19(data: unknown): unknown {
  const project = data as Record<string, unknown>;
  const ga = project.ganttAppearance as Record<string, unknown> | undefined;
  if (ga && ga.fitToWindow === undefined) {
    ga.fitToWindow = false;
  }
  project.schemaVersion = 19;
  return project;
}

export const MIGRATIONS: Record<number, Migration> = {
  1: migrateV1toV2,
  2: migrateV2toV3,
  3: migrateV3toV4,
  4: migrateV4toV5,
  5: migrateV5toV6,
  6: migrateV6toV7,
  7: migrateV7toV8,
  8: migrateV8toV9,
  9: migrateV9toV10,
  10: migrateV10toV11,
  11: migrateV11toV12,
  12: migrateV12toV13,
  13: migrateV13toV14,
  14: migrateV14toV15,
  15: migrateV15toV16,
  16: migrateV16toV17,
  17: migrateV17toV18,
  18: migrateV18toV19,
};

/**
 * Apply migrations sequentially from fromVersion to toVersion.
 */
export function applyMigrations(
  data: unknown,
  fromVersion: number,
  toVersion: number
): unknown {
  let current = data;
  for (let v = fromVersion; v < toVersion; v++) {
    const migration = MIGRATIONS[v];
    if (migration) {
      current = migration(current);
    }
  }
  return current;
}
