import type { Project } from "@domain/models/types";
import { SCHEMA_VERSION } from "@domain/models/types";
import { ProjectSchema } from "@domain/schemas/project.schema";
import type { ProjectRepository } from "./project-repository";
import { applyMigrations } from "./migrations";

const KEY_PREFIX = "spert:project:";
const INDEX_KEY = "spert:project-index";

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
    const raw = localStorage.getItem(KEY_PREFIX + id);
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw);
      const schemaVersion =
        typeof parsed === "object" && parsed !== null && "schemaVersion" in parsed
          ? (parsed as Record<string, unknown>).schemaVersion
          : 1;

      if (typeof schemaVersion !== "number") return null;

      // Reject incompatible future versions
      if (schemaVersion > SCHEMA_VERSION) return null;

      // Apply migrations if needed
      let data = parsed;
      if (schemaVersion < SCHEMA_VERSION) {
        data = applyMigrations(data, schemaVersion, SCHEMA_VERSION);
      }

      // Validate with Zod
      const result = ProjectSchema.safeParse(data);
      if (!result.success) return null;

      return result.data as Project;
    } catch {
      return null;
    }
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
