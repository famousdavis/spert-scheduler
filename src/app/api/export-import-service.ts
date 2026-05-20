// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import type { Project, UserPreferences } from "@domain/models/types";
import { SCHEMA_VERSION, DEFAULT_USER_PREFERENCES } from "@domain/models/types";
import { ProjectSchema } from "@domain/schemas/project.schema";
import { UserPreferencesSchema } from "@domain/schemas/preferences.schema";
import { applyMigrations } from "@infrastructure/persistence/migrations";
import { APP_VERSION } from "@app/constants";

// -- Normalization -----------------------------------------------------------

/**
 * Normalize a project name for conflict detection. Used by both
 * detectNameConflicts and the Layer 2 guard inside the store action.
 */
export function normalizeProjectName(name: string): string {
  return name.trim().toLowerCase();
}

// -- Types -------------------------------------------------------------------

export interface SpertExportEnvelope {
  format: "spert-scheduler-export";
  appVersion: string;
  exportedAt: string;
  schemaVersion: number;
  projects: Project[];
  /** Optional user preferences. Added in v0.5.0. */
  preferences?: UserPreferences;
}

export interface ConflictInfo {
  importedProject: Project;
  existingProject: Project;
}

export type ConflictAction = "skip" | "replace" | "copy";

export interface ConflictDecision {
  importedProjectId: string;
  /** 'id' = UUID collision; 'name' = same normalized name, different UUID */
  kind: "id" | "name";
  /**
   * ID of the existing project that matched at Layer 1 detection time.
   * 'id' conflicts: === importedProjectId.
   * 'name' conflicts: ID of the project holding the conflicting name at detection time.
   * Used in Layer 2 re-validation (pitfall #77) and mergeDecisions.
   */
  originalExistingId: string;
  action: ConflictAction;
}

export interface ImportOutcome {
  /** Incremented only on successful repo.save() — not on intent. (pitfall #41) */
  added: number;
  replaced: number;
  copied: number;
  /** User explicitly chose 'skip'. */
  skipped: number;
  /** Layer 2 auto-skips (drift between preview and apply). (pitfall #85) */
  driftSkipped: Array<{ projectName: string; reason: string }>;
  /** repo.save() failures. In-memory but may not persist. */
  errors: Array<{ projectName: string; reason: string }>;
}

export interface MergeDecisionsDiff {
  /** Prior conflicts absent from fresh; projects will now be added as new. */
  vanished: number;
  /** New conflicts in fresh; fresh default applied. */
  newConflicts: number;
  /** Conflict kind changed (id ↔ name); fresh default applied. */
  kindChanged: number;
  /** originalExistingId changed; fresh default applied (pitfall #77). */
  targetChanged: number;
}

export interface MergeDecisionsResult {
  decisions: ConflictDecision[];
  diff: MergeDecisionsDiff;
}

export interface ImportValidationResult {
  success: true;
  projects: Project[];
  /** ID conflicts (existing → same id). */
  conflicts: ConflictInfo[];
  /** Name conflicts (different id, same normalized name). Added in v0.43.0. */
  nameConflicts: ConflictInfo[];
  /** Preferences from the import file, if present and valid. */
  preferences?: UserPreferences;
}

export interface ImportValidationError {
  success: false;
  error: string;
  details?: string;
}

export type ImportResult = ImportValidationResult | ImportValidationError;

/**
 * Merge user decisions from a prior preview into a fresh set of decisions.
 * Called after cloud-hydration rebuilds the preview.
 *
 * SD-2 limitation: vanished prior decisions (the conflicting peer was deleted
 * or renamed away) are dropped. At apply time, the no-decision branch fires
 * and adds the project as new — overriding a prior 'skip'/'replace' intent.
 * The diff.vanished count must be surfaced in the cloud-refresh banner
 * (aria-live="assertive") so the user can review before confirming.
 */
export function mergeDecisions(
  prev: ConflictDecision[],
  fresh: ConflictDecision[]
): MergeDecisionsResult {
  const prevById = new Map(prev.map((d) => [d.importedProjectId, d]));
  const diff: MergeDecisionsDiff = {
    vanished: 0,
    newConflicts: 0,
    kindChanged: 0,
    targetChanged: 0,
  };
  for (const p of prev) {
    if (!fresh.some((f) => f.importedProjectId === p.importedProjectId)) {
      diff.vanished++;
    }
  }
  const decisions = fresh.map<ConflictDecision>((f) => {
    const p = prevById.get(f.importedProjectId);
    if (!p) {
      diff.newConflicts++;
      return f;
    }
    if (p.kind !== f.kind) {
      diff.kindChanged++;
      return f;
    }
    if (p.originalExistingId !== f.originalExistingId) {
      diff.targetChanged++;
      return f;
    }
    return { ...f, action: p.action };
  });
  return { decisions, diff };
}

// -- Export ------------------------------------------------------------------

export interface ExportOptions {
  includePreferences?: boolean;
  preferences?: UserPreferences;
  /** When false, strips simulationResults from all scenarios (default: false) */
  includeSimulationResults?: boolean;
}

/**
 * Strip simulation results from all scenarios in a project.
 */
function stripSimulationResults(project: Project): Project {
  return {
    ...project,
    scenarios: project.scenarios.map((scenario) => ({
      ...scenario,
      simulationResults: undefined,
    })),
  };
}

export function buildExportEnvelope(
  projects: Project[],
  options: ExportOptions = {}
): SpertExportEnvelope {
  // Strip simulation results unless explicitly included
  const processedProjects =
    options.includeSimulationResults === true
      ? projects
      : projects.map(stripSimulationResults);

  const envelope: SpertExportEnvelope = {
    format: "spert-scheduler-export",
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    schemaVersion: SCHEMA_VERSION,
    projects: processedProjects,
  };

  if (options.includePreferences && options.preferences) {
    envelope.preferences = options.preferences;
  }

  return envelope;
}

export function serializeExport(
  projects: Project[],
  options: ExportOptions = {}
): string {
  return JSON.stringify(buildExportEnvelope(projects, options), null, 2);
}

// -- Import ------------------------------------------------------------------

/** Step 1: Parse raw JSON string. */
function parseJSON(
  jsonString: string
): ImportValidationError | { raw: unknown } {
  try {
    return { raw: JSON.parse(jsonString) };
  } catch {
    return { success: false, error: "Invalid JSON file." };
  }
}

/** Step 2: Validate the export envelope structure and extract raw projects + preferences. */
function validateEnvelope(
  raw: unknown
): ImportValidationError | { projects: unknown[]; rawPreferences?: unknown } {
  if (
    typeof raw !== "object" ||
    raw === null ||
    (raw as Record<string, unknown>).format !== "spert-scheduler-export"
  ) {
    return {
      success: false,
      error: "Not a SPERT Scheduler export file.",
      details:
        'File must contain a "format": "spert-scheduler-export" field.',
    };
  }

  const envelope = raw as Record<string, unknown>;
  const rawProjects = envelope.projects;
  if (!Array.isArray(rawProjects) || rawProjects.length === 0) {
    return { success: false, error: "Export file contains no projects." };
  }

  // Extract optional preferences
  const rawPreferences = envelope.preferences;

  return { projects: rawProjects, rawPreferences };
}

/** Step 3: Migrate each project to the current schema version and validate with Zod. */
function migrateAndValidateProjects(
  rawProjects: unknown[]
): ImportValidationError | { projects: Project[] } {
  const validated: Project[] = [];

  for (let i = 0; i < rawProjects.length; i++) {
    let projectData = rawProjects[i] as Record<string, unknown>;

    const projectVersion =
      typeof projectData === "object" &&
      projectData !== null &&
      "schemaVersion" in projectData
        ? projectData.schemaVersion
        : 1;

    const projectLabel = projectData.name ?? `#${i + 1}`;

    if (typeof projectVersion !== "number" || projectVersion < 1) {
      return {
        success: false,
        error: `Project "${projectLabel}" has an invalid schema version.`,
      };
    }

    if (projectVersion > SCHEMA_VERSION) {
      return {
        success: false,
        error: `Project "${projectLabel}" was created with a newer version of SPERT Scheduler. Please update the app.`,
      };
    }

    if (projectVersion < SCHEMA_VERSION) {
      projectData = applyMigrations(
        projectData,
        projectVersion,
        SCHEMA_VERSION
      ) as Record<string, unknown>;
    }

    const result = ProjectSchema.safeParse(projectData);
    if (!result.success) {
      return {
        success: false,
        error: `Project "${projectLabel}" failed validation.`,
        details: result.error.issues
          .map((issue) => issue.message)
          .join("; "),
      };
    }

    validated.push(result.data as Project);
  }

  return { projects: validated };
}

/** Step 4a: Detect ID conflicts between imported and existing projects. */
function detectIdConflicts(
  imported: Project[],
  existing: Project[]
): ConflictInfo[] {
  const existingById = new Map(existing.map((p) => [p.id, p]));
  const conflicts: ConflictInfo[] = [];
  for (const proj of imported) {
    const match = existingById.get(proj.id);
    if (match) {
      conflicts.push({ importedProject: proj, existingProject: match });
    }
  }
  return conflicts;
}

/**
 * Step 4b: Detect name conflicts (different ID, same normalized name).
 * ID conflicts take precedence — an imported project already flagged via
 * detectIdConflicts is excluded from the name-conflict pass.
 *
 * First-insert-wins for duplicate existing names: if two existing projects
 * share a normalized name, only the first is recorded as a conflict target.
 *
 * Empty/whitespace-only names are excluded from name matching to avoid false
 * conflicts across untitled drafts.
 *
 * Limitation: two INCOMING projects sharing a name with each other (but not
 * with any existing project) are not flagged — both are added as-is.
 */
function detectNameConflicts(
  imported: Project[],
  existing: Project[],
  idConflicts: ConflictInfo[]
): ConflictInfo[] {
  const existingByNorm = new Map<string, Project>();
  for (const p of existing) {
    const norm = normalizeProjectName(p.name);
    if (norm === "") continue;
    if (!existingByNorm.has(norm)) existingByNorm.set(norm, p);
  }
  const idConflictIds = new Set(
    idConflicts.map((c) => c.importedProject.id)
  );
  const result: ConflictInfo[] = [];
  for (const proj of imported) {
    if (idConflictIds.has(proj.id)) continue;
    const norm = normalizeProjectName(proj.name);
    if (norm === "") continue;
    const match = existingByNorm.get(norm);
    if (match) {
      result.push({ importedProject: proj, existingProject: match });
    }
  }
  return result;
}

/**
 * Step 5: Validate preferences if present.
 * Returns undefined if not present or invalid (non-fatal).
 */
function validatePreferences(raw: unknown): UserPreferences | undefined {
  if (!raw || typeof raw !== "object") return undefined;

  // Merge with defaults to handle missing fields from older exports
  const merged = { ...DEFAULT_USER_PREFERENCES, ...(raw as Record<string, unknown>) };
  const result = UserPreferencesSchema.safeParse(merged);
  if (!result.success) return undefined;

  // Ensure all required fields are present by spreading defaults again
  return { ...DEFAULT_USER_PREFERENCES, ...result.data };
}

/** Single source of truth for the import size cap, shared with the hook. */
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Parse, migrate, validate, and detect conflicts for an imported JSON string.
 */
export function validateImport(
  jsonString: string,
  existingProjects: Project[]
): ImportResult {
  if (jsonString.length > MAX_FILE_SIZE_BYTES) {
    return { success: false, error: "Import file is too large (maximum 10 MB)." };
  }

  const parsed = parseJSON(jsonString);
  if ("success" in parsed) return parsed;

  const envelope = validateEnvelope(parsed.raw);
  if ("success" in envelope) return envelope;

  const migrated = migrateAndValidateProjects(envelope.projects);
  if ("success" in migrated) return migrated;

  const conflicts = detectIdConflicts(migrated.projects, existingProjects);
  const nameConflicts = detectNameConflicts(
    migrated.projects,
    existingProjects,
    conflicts
  );

  // Validate preferences (non-fatal if invalid)
  const preferences = validatePreferences(envelope.rawPreferences);

  return {
    success: true,
    projects: migrated.projects,
    conflicts,
    nameConflicts,
    preferences,
  };
}
