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

export const MIGRATIONS: Record<number, Migration> = {
  1: migrateV1toV2,
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
