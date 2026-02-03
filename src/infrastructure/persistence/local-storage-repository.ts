import type { Project } from "@domain/models/types";
import { SCHEMA_VERSION } from "@domain/models/types";
import { ProjectSchema } from "@domain/schemas/project.schema";
import type { ProjectRepository } from "./project-repository";
import { applyMigrations } from "./migrations";

const KEY_PREFIX = "spert:project:";
const INDEX_KEY = "spert:project-index";

// -- Load Error Types --------------------------------------------------------

export type LoadErrorType =
  | "json_parse"
  | "validation"
  | "migration"
  | "future_version"
  | "unknown";

export interface LoadError {
  projectId: string;
  projectName?: string;
  type: LoadErrorType;
  message: string;
  details?: string;
  rawPreview?: string; // First 200 chars of raw JSON for debugging
}

export type LoadResult<T> =
  | { success: true; data: T }
  | { success: false; error: LoadError };

export class StorageQuotaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageQuotaError";
  }
}

/**
 * localStorage-backed ProjectRepository with schema versioning.
 *
 * Storage scheme:
 * - Each project: localStorage["spert:project:{id}"] = JSON string
 * - Project index: localStorage["spert:project-index"] = JSON array of IDs
 */
export class LocalStorageRepository implements ProjectRepository {
  list(): string[] {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  load(id: string): Project | null {
    const result = this.loadWithDiagnostics(id);
    return result.success ? result.data : null;
  }

  /**
   * Load a project with detailed error diagnostics.
   * Returns a LoadResult with either the project or detailed error info.
   */
  loadWithDiagnostics(id: string): LoadResult<Project> {
    const raw = localStorage.getItem(KEY_PREFIX + id);
    if (!raw) {
      return {
        success: false,
        error: {
          projectId: id,
          type: "unknown",
          message: "Project data not found in storage",
        },
      };
    }

    const rawPreview = raw.length > 200 ? raw.slice(0, 200) + "..." : raw;

    // Try to parse JSON
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return {
        success: false,
        error: {
          projectId: id,
          type: "json_parse",
          message: "Failed to parse project data as JSON",
          details: e instanceof Error ? e.message : String(e),
          rawPreview,
        },
      };
    }

    // Extract project name if possible (for error display)
    const projectName =
      typeof parsed === "object" &&
      parsed !== null &&
      "name" in parsed &&
      typeof (parsed as Record<string, unknown>).name === "string"
        ? ((parsed as Record<string, unknown>).name as string)
        : undefined;

    // Check schema version
    const schemaVersion =
      typeof parsed === "object" && parsed !== null && "schemaVersion" in parsed
        ? (parsed as Record<string, unknown>).schemaVersion
        : 1;

    if (typeof schemaVersion !== "number") {
      return {
        success: false,
        error: {
          projectId: id,
          projectName,
          type: "validation",
          message: "Invalid schema version (not a number)",
          details: `schemaVersion value: ${JSON.stringify(schemaVersion)}`,
          rawPreview,
        },
      };
    }

    // Reject incompatible future versions
    if (schemaVersion > SCHEMA_VERSION) {
      return {
        success: false,
        error: {
          projectId: id,
          projectName,
          type: "future_version",
          message: `Project was created with a newer version of SPERT Scheduler`,
          details: `Project schema version: ${schemaVersion}, App schema version: ${SCHEMA_VERSION}. Please update the app.`,
          rawPreview,
        },
      };
    }

    // Apply migrations if needed
    let data = parsed;
    if (schemaVersion < SCHEMA_VERSION) {
      try {
        data = applyMigrations(data, schemaVersion, SCHEMA_VERSION);
      } catch (e) {
        return {
          success: false,
          error: {
            projectId: id,
            projectName,
            type: "migration",
            message: `Failed to migrate project from v${schemaVersion} to v${SCHEMA_VERSION}`,
            details: e instanceof Error ? e.message : String(e),
            rawPreview,
          },
        };
      }
    }

    // Validate with Zod
    const result = ProjectSchema.safeParse(data);
    if (!result.success) {
      // Format Zod errors for display
      const zodErrors = result.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ");
      return {
        success: false,
        error: {
          projectId: id,
          projectName,
          type: "validation",
          message: "Project data failed validation",
          details: zodErrors,
          rawPreview,
        },
      };
    }

    return { success: true, data: result.data as Project };
  }

  /**
   * Get raw project data for export/recovery of corrupted projects.
   */
  getRawData(id: string): string | null {
    return localStorage.getItem(KEY_PREFIX + id);
  }

  /**
   * Remove a project by ID without validation (for cleaning up corrupted entries).
   */
  removeById(id: string): void {
    localStorage.removeItem(KEY_PREFIX + id);
    const ids = this.list().filter((existingId) => existingId !== id);
    localStorage.setItem(INDEX_KEY, JSON.stringify(ids));
  }

  save(project: Project): void {
    const data = { ...project, schemaVersion: SCHEMA_VERSION };
    const json = JSON.stringify(data);

    try {
      localStorage.setItem(KEY_PREFIX + project.id, json);
    } catch (e) {
      if (
        e instanceof DOMException &&
        (e.name === "QuotaExceededError" ||
          e.code === DOMException.QUOTA_EXCEEDED_ERR)
      ) {
        throw new StorageQuotaError(
          "Storage full. Consider deleting old projects."
        );
      }
      throw e;
    }

    // Update index
    const ids = this.list();
    if (!ids.includes(project.id)) {
      ids.push(project.id);
      localStorage.setItem(INDEX_KEY, JSON.stringify(ids));
    }
  }

  remove(id: string): void {
    localStorage.removeItem(KEY_PREFIX + id);

    const ids = this.list().filter((existingId) => existingId !== id);
    localStorage.setItem(INDEX_KEY, JSON.stringify(ids));
  }

  reorderIndex(ids: string[]): void {
    localStorage.setItem(INDEX_KEY, JSON.stringify(ids));
  }
}
