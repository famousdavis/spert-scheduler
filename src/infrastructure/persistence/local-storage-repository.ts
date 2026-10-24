// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

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
// (the user's UID); cross-namespace data is preserved. WI-118: and only a UID
// namespace — `local`, this browser's signed-out one, is never wiped (owner
// ruling, 2026-10-10).
//
// Legacy unscoped keys (created in v0.42.5 and earlier) are migrated to the
// `local` namespace at module load — read-then-write-then-delete ordering
// means a mid-migration crash leaves duplicate data, never lost data.
const KEY_PREFIX_BASE = "spert:project";
const INDEX_KEY_BASE = "spert:project-index";

const LEGACY_KEY_PATTERN = /^spert:project:([^:]+)$/;
const LEGACY_INDEX_KEY = "spert:project-index";

/**
 * WI-130: the one namespace whose projects are what its keys hold — this browser's signed-out storage. There the index
 * gives the projects' ORDER, and `list` names a stored project the index leaves out after the others. Never in a
 * signed-in user's namespace, for two reasons. In cloud storage it holds this browser's copy of the user's cloud list,
 * whose index the cloud's answer replaces whole (`replaceIndex`) without removing the keys of projects it no longer
 * names — deleted elsewhere, or no longer shared — so an unlisted key there is not a project to show. In signed-in
 * local storage the same namespace is the user's own store, but it also keeps those copies from any earlier cloud
 * session, and nothing tells one from the other; a signed-in user's storage gets only the drag's half (`reorderIndex`).
 */
const SIGNED_OUT_NAMESPACE = "local";

/**
 * WI-130: the oldest schema a stored project the index leaves out may carry and be listed again — 21, from v0.45.0.
 * From v0.12.0 to v0.42.5 the cloud copy shared its keys with local storage and kept the keys of projects the cloud
 * stopped naming, possibly another user's; v0.42.6 moved every one of them, listed or not, into this namespace. Those
 * were saved at schema 20 or lower, and an unlisted key is never saved again, so the floor keeps them hidden, as before.
 */
const RECOVERABLE_SCHEMA_VERSION = 21;

/** WI-130: whether a stored value the index leaves out is listed again — it parses, and its schema is 21 or higher. */
function isRecoverable(raw: string | null): boolean {
  if (raw === null) return false;
  try {
    const parsed: unknown = JSON.parse(raw);
    const schemaVersion =
      typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>).schemaVersion : undefined;
    return typeof schemaVersion === "number" && schemaVersion >= RECOVERABLE_SCHEMA_VERSION;
  } catch {
    return false;
  }
}

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

/** Read the current active namespace. Public; consumed by sibling persistence
 *  modules (preferences-repository, scenario-memory) so they can mirror the
 *  per-user keying scheme. */
export function getActiveStorageNamespace(): string {
  return activeNamespace;
}

/** Backward-compat alias for tests. New code should call
 *  `getActiveStorageNamespace()`. */
export const getStorageNamespaceForTests = getActiveStorageNamespace;

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
  /**
   * Where the error was detected. Absent/undefined means local storage (this
   * repository's construction sites set nothing); the Firestore load paths
   * set "cloud". The store's error actions use this to keep local- and
   * cloud-sourced entries from replacing each other. (v0.50.1)
   */
  source?: "local" | "cloud";
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
 * WI-130: the list `reorderIndex` stores. `stored` is the namespace's list; `ordered` is a tab's list in its new order,
 * which may be out of date. Each id of `stored` that `ordered` does not name keeps its own place. The ids `ordered`
 * names — those in `stored`, and those `stored` lacks that are still stored (`isStored`) — fill the places of the ones
 * in `stored`, in `ordered`'s order, and any left over go at the end; an id no longer stored — deleted in another
 * tab — is dropped. Each id appears once.
 */
function orderWithin(
  stored: readonly string[],
  ordered: readonly string[],
  isStored: (id: string) => boolean,
): string[] {
  const listed = [...new Set(stored)];
  const inList = new Set(listed);
  const named = [...new Set(ordered)].filter((id) => inList.has(id) || isStored(id));
  const isNamed = new Set(named);
  let next = 0;
  const placed = listed.map((id) => (isNamed.has(id) ? named[next++]! : id));
  return [...placed, ...named.slice(next)];
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

  /**
   * This namespace's project ids, in the stored order. WI-130: in this browser's signed-out namespace, without the ids
   * whose data is gone, and followed by every project stored there that the index leaves out and a version since 0.45.0
   * saved (`isRecoverable`), in ascending order of id. Before WI-130 a tab's drag stored that tab's own list as the
   * index, so each project the tab did not show — one another tab had made since it loaded, or one a newer version had
   * saved, which an older version cannot open — left this browser's list while its data stayed. The index is stored
   * again so, only when something changed, so a project made next goes after them; if that write fails (storage full),
   * they are found again at the next read. An index this version cannot read is never written over: the projects are
   * listed, the index left as it is. Never in a signed-in user's namespace (`SIGNED_OUT_NAMESPACE`).
   */
  list(): string[] {
    const ids = this.readIndex();
    if (this.namespace !== SIGNED_OUT_NAMESPACE) return ids;
    const kept = ids.filter((id) => this.isStored(id));
    const unlisted = this.unlistedIds(ids);
    if (kept.length === ids.length && unlisted.length === 0) return ids;
    const all = [...kept, ...unlisted];
    if (!this.indexIsReadable()) return all;
    try {
      localStorage.setItem(this.indexKey, JSON.stringify(all));
    } catch {
      // Storage full: the same projects are found again at the next read.
    }
    return all;
  }

  private readIndex(): string[] {
    const raw = localStorage.getItem(this.indexKey);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  /**
   * WI-130: whether this version can read the stored index — there is none, or it is a list of ids. One it cannot read
   * (a newer version's shape, or damaged) is never written over by a read.
   */
  private indexIsReadable(): boolean {
    const raw = localStorage.getItem(this.indexKey);
    if (!raw) return true;
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) && parsed.every((id) => typeof id === "string");
    } catch {
      return false;
    }
  }

  private isStored(id: string): boolean {
    return localStorage.getItem(this.keyOf(id)) !== null;
  }

  /**
   * WI-130: the ids of this namespace's stored projects that `listed` does not name and `isRecoverable` lets back, in
   * ascending order. Only those values are parsed. `Object.keys`, not `localStorage.key(i)`: Firefox takes time growing
   * with the square of the number of keys for the second (measured, review 31).
   */
  private unlistedIds(listed: readonly unknown[]): string[] {
    const prefix = `${KEY_PREFIX_BASE}:${this.namespace}:`;
    const named = new Set(listed.map(String));
    const unlisted: string[] = [];
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith(prefix)) continue;
      const id = key.slice(prefix.length);
      if (id !== "" && !named.has(id) && isRecoverable(localStorage.getItem(key))) unlisted.push(id);
    }
    return unlisted.sort((a, b) => (a < b ? -1 : 1));
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
    // WI-130: the list is read before this project's key is written, so `list` never names a NEW project as one the
    // index left out — `save` adds it to the list itself, and a failed write of the list throws, as before.
    const ids = this.list();

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

  /**
   * Store a tab's order for the projects it shows. WI-130: that list can be out of date — another tab may have made a
   * project since this one loaded, or this one could not open a project (a newer version's, or a damaged one) — so each
   * stored project the list does not name keeps its own place, and the ones it names take the other places, in its
   * order (`orderWithin`). Before WI-130 the list was stored as given: each project it did not name left this
   * browser's list, its data left stored.
   */
  reorderIndex(ids: string[]): void {
    const order = orderWithin(this.list(), ids, (id) => this.isStored(id));
    localStorage.setItem(this.indexKey, JSON.stringify(order));
  }

  /**
   * Store `ids` as the whole list, as given. WI-130: for the cloud's answer (`setProjects`) — this browser's copy of
   * the signed-in user's list, from which a project the cloud no longer names must go, as before.
   */
  replaceIndex(ids: string[]): void {
    localStorage.setItem(this.indexKey, JSON.stringify(ids));
  }

  /**
   * Remove every indexed project and the index itself for the current
   * namespace — in this browser's signed-out namespace, every project `list`
   * names there, the ones it lists again included (WI-130). Idempotent. Does not touch
   * non-project keys (preferences, scenario memory, etc.) or other namespaces' data.
   */
  clearAll(): void {
    const ids = this.list();
    for (const id of ids) {
      localStorage.removeItem(this.keyOf(id));
    }
    localStorage.removeItem(this.indexKey);
  }
}
