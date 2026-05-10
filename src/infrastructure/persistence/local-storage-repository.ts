// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import type { Project } from "@domain/models/types";
import { SCHEMA_VERSION } from "@domain/models/types";
import { ProjectSchema } from "@domain/schemas/project.schema";
import type { ProjectRepository } from "./project-repository";
import { applyMigrations } from "./migrations";

// v0.42.6 (M4) — UID-namespaced project keys. Storage scheme:
//
//   Local mode:   spert:project:local:{id}     index: spert:project-index:local
//   Cloud mode:   spert:project:{uid}:{id}     index: spert:project-index:{uid}
//
// On a shared device, prior cloud user's keys are structurally inaccessible
// to a new cloud user — different namespace, different key. Removes the
// "if cleanup is bypassed, cross-user reads are possible" hardening gap from
// the v0.42.6 security audit. Sign-out cleanup wipes the active namespace
// (the user's UID); cross-namespace data is preserved.
//
// Legacy unscoped keys (created in v0.42.5 and earlier) are migrated to the
// `local` namespace at module load — read-then-write-then-delete ordering
// means a mid-migration crash leaves duplicate data, never lost data.
const KEY_PREFIX_BASE = "spert:project";
const INDEX_KEY_BASE = "spert:project-index";

const LEGACY_KEY_PATTERN = /^spert:project:([^:]+)$/;
const LEGACY_INDEX_KEY = "spert:project-index";

/** Module-level active namespace. Defaults to "local"; flipped to UID by
 *  StorageProvider on sign-in via `setStorageNamespace`, back to "local" on
 *  sign-out. Methods on `LocalStorageRepository` read this dynamically per
 *  call, so a single module-scoped repo instance follows auth transitions. */
let activeNamespace = "local";

/** Set the active namespace. Called by StorageProvider when the auth user
 *  changes — pass the UID for cloud users, "local" for signed-out / local
 *  mode. */
export function setStorageNamespace(ns: string): void {
  activeNamespace = ns;
}

/** Test-only: read the current namespace. */
export function getStorageNamespaceForTests(): string {
  return activeNamespace;
}

/** Read → write-and-verify → delete a single key. Returns whether the
 *  delete completed (i.e., migration finished cleanly for this key). */
function migrateKey(oldKey: string, newKey: string): boolean {
  const value = localStorage.getItem(oldKey);
  if (value === null) return true; // nothing to migrate
  try {
    localStorage.setItem(newKey, value);
    if (localStorage.getItem(newKey) === value) {
      localStorage.removeItem(oldKey);
      return true;
    }
  } catch {
    // Quota exceeded or other failure — leave legacy key in place.
  }
  return false;
}

/** Collect all legacy unscoped data keys (no namespace segment). */
function collectLegacyDataKeys(): { key: string; id: string }[] {
  const out: { key: string; id: string }[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    const m = LEGACY_KEY_PATTERN.exec(key);
    if (m) out.push({ key, id: m[1]! });
  }
  return out;
}

/** One-time legacy-key migration. Each key migrates with read → write-and-
 *  verify → delete ordering, so a mid-migration crash leaves the data under
 *  BOTH keys (recoverable on next boot) — never under neither. Idempotent. */
let legacyMigrationDone = false;
export function migrateLegacyKeysToLocal(): void {
  if (legacyMigrationDone) return;
  legacyMigrationDone = true;

  for (const { key: oldKey, id } of collectLegacyDataKeys()) {
    migrateKey(oldKey, `${KEY_PREFIX_BASE}:local:${id}`);
  }
  migrateKey(LEGACY_INDEX_KEY, `${INDEX_KEY_BASE}:local`);
}

// Run the migration at module load. Tests that need a clean slate can call
// `_resetLegacyMigrationForTests()`.
if (typeof localStorage !== "undefined") {
  migrateLegacyKeysToLocal();
}

export function _resetLegacyMigrationForTests(): void {
  legacyMigrationDone = false;
}

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

type PhaseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: LoadError };

function extractProjectName(parsed: unknown): string | undefined {
  if (typeof parsed !== "object" || parsed === null || !("name" in parsed)) return undefined;
  const name = (parsed as Record<string, unknown>).name;
  return typeof name === "string" ? name : undefined;
}

function parseProjectJSON(raw: string, id: string, rawPreview: string): PhaseResult<unknown> {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (e) {
    return {
      ok: false,
      error: {
        projectId: id,
        type: "json_parse",
        message: "Failed to parse project data as JSON",
        details: e instanceof Error ? e.message : String(e),
        rawPreview,
      },
    };
  }
}

function validateSchemaVersion(
  parsed: unknown,
  id: string,
  projectName: string | undefined,
  rawPreview: string,
): PhaseResult<number> {
  const schemaVersion =
    typeof parsed === "object" && parsed !== null && "schemaVersion" in parsed
      ? (parsed as Record<string, unknown>).schemaVersion
      : 1;

  if (typeof schemaVersion !== "number") {
    return {
      ok: false,
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

  if (schemaVersion > SCHEMA_VERSION) {
    return {
      ok: false,
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

  return { ok: true, value: schemaVersion };
}

function migrateProjectData(
  data: unknown,
  from: number,
  to: number,
  id: string,
  projectName: string | undefined,
  rawPreview: string,
): PhaseResult<unknown> {
  if (from >= to) return { ok: true, value: data };
  try {
    return { ok: true, value: applyMigrations(data, from, to) };
  } catch (e) {
    return {
      ok: false,
      error: {
        projectId: id,
        projectName,
        type: "migration",
        message: `Failed to migrate project from v${from} to v${to}`,
        details: e instanceof Error ? e.message : String(e),
        rawPreview,
      },
    };
  }
}

/**
 * Strip the samples array from simulation results to reduce storage size.
 * Preserves percentiles, histogram, mean, SD, and other computed statistics.
 * The samples array typically contains 50k+ numbers and constitutes ~90% of storage.
 */
export function stripSimulationSamples(project: Project): Project {
  return {
    ...project,
    scenarios: project.scenarios.map((scenario) => ({
      ...scenario,
      simulationResults: scenario.simulationResults
        ? { ...scenario.simulationResults, samples: [] }
        : undefined,
    })),
  };
}

/**
 * localStorage-backed ProjectRepository with schema versioning.
 *
 * Storage scheme (v0.42.6 — UID-namespaced):
 *   Local mode:  localStorage["spert:project:local:{id}"] = JSON string
 *                localStorage["spert:project-index:local"] = JSON array of IDs
 *   Cloud mode:  localStorage["spert:project:{uid}:{id}"] = JSON string
 *                localStorage["spert:project-index:{uid}"] = JSON array of IDs
 *
 * The active namespace is module-level (`activeNamespace`) and flipped by
 * StorageProvider on auth state changes via `setStorageNamespace`. Methods
 * read it per call, so a single module-scoped repo instance follows auth
 * transitions seamlessly.
 *
 * The constructor accepts an optional `fixedNamespace` override for explicit
 * cross-namespace operations:
 *   - `migrateLocalToCloud` reads from `"local"` regardless of current state
 *   - `handleDiscardLocalCopy` clears `"local"` regardless of current state
 */
export class LocalStorageRepository implements ProjectRepository {
  constructor(private fixedNamespace?: string) {}

  private get namespace(): string {
    return this.fixedNamespace ?? activeNamespace;
  }

  private keyOf(id: string): string {
    return `${KEY_PREFIX_BASE}:${this.namespace}:${id}`;
  }

  private get indexKey(): string {
    return `${INDEX_KEY_BASE}:${this.namespace}`;
  }

  list(): string[] {
    const raw = localStorage.getItem(this.indexKey);
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
    const raw = localStorage.getItem(this.keyOf(id));
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

    const parseResult = parseProjectJSON(raw, id, rawPreview);
    if (!parseResult.ok) return { success: false, error: parseResult.error };

    const projectName = extractProjectName(parseResult.value);

    const versionResult = validateSchemaVersion(parseResult.value, id, projectName, rawPreview);
    if (!versionResult.ok) return { success: false, error: versionResult.error };

    const migrateResult = migrateProjectData(
      parseResult.value,
      versionResult.value,
      SCHEMA_VERSION,
      id,
      projectName,
      rawPreview,
    );
    if (!migrateResult.ok) return { success: false, error: migrateResult.error };

    const result = ProjectSchema.safeParse(migrateResult.value);
    if (!result.success) {
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
    return localStorage.getItem(this.keyOf(id));
  }

  /**
   * Remove a project by ID without validation (for cleaning up corrupted entries).
   */
  removeById(id: string): void {
    this.remove(id);
  }

  save(project: Project): void {
    const data = { ...project, schemaVersion: SCHEMA_VERSION };
    const json = JSON.stringify(data);

    try {
      localStorage.setItem(this.keyOf(project.id), json);
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
      localStorage.setItem(this.indexKey, JSON.stringify(ids));
    }
  }

  remove(id: string): void {
    localStorage.removeItem(this.keyOf(id));

    const ids = this.list().filter((existingId) => existingId !== id);
    localStorage.setItem(this.indexKey, JSON.stringify(ids));
  }

  reorderIndex(ids: string[]): void {
    localStorage.setItem(this.indexKey, JSON.stringify(ids));
  }

  /**
   * Remove every indexed project and the index itself for the current
   * namespace. Idempotent. Does not touch non-project keys (preferences,
   * scenario memory, etc.) or other namespaces' data.
   */
  clearAll(): void {
    const ids = this.list();
    for (const id of ids) {
      localStorage.removeItem(this.keyOf(id));
    }
    localStorage.removeItem(this.indexKey);
  }
}
