import type { Project, UserPreferences } from "@domain/models/types";
import { SCHEMA_VERSION, DEFAULT_USER_PREFERENCES } from "@domain/models/types";
import { ProjectSchema } from "@domain/schemas/project.schema";
import { UserPreferencesSchema } from "@domain/schemas/preferences.schema";
import { applyMigrations } from "@infrastructure/persistence/migrations";
import { APP_VERSION } from "@app/constants";

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

export interface ImportValidationResult {
  success: true;
  projects: Project[];
  conflicts: ConflictInfo[];
  /** Preferences from the import file, if present and valid. */
  preferences?: UserPreferences;
}

export interface ImportValidationError {
  success: false;
  error: string;
  details?: string;
}

export type ImportResult = ImportValidationResult | ImportValidationError;

// -- Export ------------------------------------------------------------------

export interface ExportOptions {
  includePreferences?: boolean;
  preferences?: UserPreferences;
}

export function buildExportEnvelope(
  projects: Project[],
  options: ExportOptions = {}
): SpertExportEnvelope {
  const envelope: SpertExportEnvelope = {
    format: "spert-scheduler-export",
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    schemaVersion: SCHEMA_VERSION,
    projects,
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

    if (typeof projectVersion !== "number") {
      return {
        success: false,
        error: `Project at index ${i} has an invalid schema version.`,
      };
    }

    if (projectVersion > SCHEMA_VERSION) {
      return {
        success: false,
        error: `Project "${projectData.name ?? `#${i + 1}`}" was created with a newer version of SPERT Scheduler. Please update the app.`,
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
        error: `Project "${projectData.name ?? `#${i + 1}`}" failed validation.`,
        details: result.error.issues
          .map((issue) => issue.message)
          .join("; "),
      };
    }

    validated.push(result.data as Project);
  }

  return { projects: validated };
}

/** Step 4: Detect ID conflicts between imported and existing projects. */
function detectConflicts(
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

/**
 * Parse, migrate, validate, and detect conflicts for an imported JSON string.
 */
export function validateImport(
  jsonString: string,
  existingProjects: Project[]
): ImportResult {
  const parsed = parseJSON(jsonString);
  if ("success" in parsed) return parsed;

  const envelope = validateEnvelope(parsed.raw);
  if ("success" in envelope) return envelope;

  const migrated = migrateAndValidateProjects(envelope.projects);
  if ("success" in migrated) return migrated;

  const conflicts = detectConflicts(migrated.projects, existingProjects);

  // Validate preferences (non-fatal if invalid)
  const preferences = validatePreferences(envelope.rawPreferences);

  return { success: true, projects: migrated.projects, conflicts, preferences };
}
