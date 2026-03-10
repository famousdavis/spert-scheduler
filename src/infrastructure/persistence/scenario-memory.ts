// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

/**
 * Lightweight per-project persistence for the last-active scenario ID.
 *
 * Stored as a JSON map { [projectId]: scenarioId } under a single
 * localStorage key. Bounded by the number of projects (max ~50 entries).
 */

const STORAGE_KEY = "spert:active-scenarios";

function loadMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
    return {};
  } catch {
    return {};
  }
}

function saveMap(map: Record<string, string>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
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
