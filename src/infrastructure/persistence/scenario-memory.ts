// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

/**
 * Lightweight per-project persistence for the last-active scenario ID.
 *
 * Stored as a JSON map { [projectId]: scenarioId } under a per-namespace
 * localStorage key (v0.45.3 — UID-scoped). Bounded by the number of
 * projects (max ~50 entries per namespace).
 */

import { getActiveStorageNamespace } from "./local-storage-repository";

// v0.45.3 — UID-namespaced active-scenarios key (sibling pattern to
// local-storage-repository.ts M4 and preferences-repository.ts). Pre-v0.45.3
// used a single shared key, leaking last-active scenario IDs across users on
// a shared device when a session ended without explicit sign-out.
const KEY_BASE = "spert-scheduler:active-scenarios";
const LEGACY_KEY = KEY_BASE; // pre-v0.45.3 unscoped key

function keyForActiveNamespace(): string {
  return `${KEY_BASE}:${getActiveStorageNamespace()}`;
}

/** Read → write-and-verify → delete migration of the pre-v0.45.3 legacy
 *  key into the `local` namespace. Read-before-delete ordering means a
 *  mid-migration crash leaves the data under BOTH keys (recoverable),
 *  never under neither. Idempotent. */
let legacyMigrationDone = false;
export function migrateLegacyScenarioMemoryToLocal(): void {
  if (legacyMigrationDone) return;
  legacyMigrationDone = true;

  const value = localStorage.getItem(LEGACY_KEY);
  if (value === null) return;

  const targetKey = `${KEY_BASE}:local`;
  try {
    localStorage.setItem(targetKey, value);
    if (localStorage.getItem(targetKey) === value) {
      localStorage.removeItem(LEGACY_KEY);
    }
  } catch {
    // Quota exceeded — leave the legacy key in place; the next boot retries.
  }
}

// Run the migration at module load. Tests that need a clean slate can call
// `_resetLegacyScenarioMemoryMigrationForTests()`.
if (typeof localStorage !== "undefined") {
  migrateLegacyScenarioMemoryToLocal();
}

export function _resetLegacyScenarioMemoryMigrationForTests(): void {
  legacyMigrationDone = false;
}

function loadMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(keyForActiveNamespace());
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      const map: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === "string") map[k] = v;
      }
      return map;
    }
    return {};
  } catch {
    return {};
  }
}

function saveMap(map: Record<string, string>): void {
  localStorage.setItem(keyForActiveNamespace(), JSON.stringify(map));
}

/** Returns the last-active scenario ID for a project, or null if none stored. */
export function getLastScenarioId(projectId: string): string | null {
  const map = loadMap();
  return map[projectId] ?? null;
}

/** Persists the last-active scenario ID for a project. */
export function setLastScenarioId(projectId: string, scenarioId: string): void {
  const map = loadMap();
  map[projectId] = scenarioId;
  saveMap(map);
}

/** Removes the entry for a deleted project (optional cleanup). */
export function removeLastScenarioId(projectId: string): void {
  const map = loadMap();
  delete map[projectId];
  saveMap(map);
}

/** Removes the entire active-scenarios map for the active namespace.
 *  Idempotent. Does not touch other namespaces' data. */
export function clearAllLastScenarios(): void {
  localStorage.removeItem(keyForActiveNamespace());
}
