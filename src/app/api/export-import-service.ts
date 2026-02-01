import type { Project } from "@domain/models/types";
import { SCHEMA_VERSION } from "@domain/models/types";
import { ProjectSchema } from "@domain/schemas/project.schema";
import { applyMigrations } from "@infrastructure/persistence/migrations";
import { APP_VERSION } from "@app/constants";

// -- Types -------------------------------------------------------------------

export interface SpertExportEnvelope {
  format: "spert-scheduler-export";
  appVersion: string;
  exportedAt: string;
  schemaVersion: number;
  projects: Project[];
}

export interface ConflictInfo {
  importedProject: Project;
  existingProject: Project;
}

export interface ImportValidationResult {
  success: true;
  projects: Project[];
  conflicts: ConflictInfo[];
}

export interface ImportValidationError {
  success: false;
  error: string;
  details?: string;
}

export type ImportResult = ImportValidationResult | ImportValidationError;

// -- Export ------------------------------------------------------------------

export function buildExportEnvelope(projects: Project[]): SpertExportEnvelope {
  return {
    format: "spert-scheduler-export",
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    schemaVersion: SCHEMA_VERSION,
    projects,
  };
}

export function serializeExport(projects: Project[]): string {
  return JSON.stringify(buildExportEnvelope(projects), null, 2);
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

/** Step 2: Validate the export envelope structure and extract raw projects. */
function validateEnvelope(
  raw: unknown
): ImportValidationError | { projects: unknown[] } {
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

  return { projects: rawProjects };
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

  return { success: true, projects: migrated.projects, conflicts };
}
