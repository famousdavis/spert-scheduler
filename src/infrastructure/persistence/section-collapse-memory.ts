// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * Per-project memory of which sections of the project page the user collapsed (v0.71.0): the
 * activity grid, and the Milestones and Dependencies panels.
 *
 * The same shape as `scenario-memory.ts`: a JSON map `{ [projectId]: CollapsibleSection[] }` under
 * a UID-namespaced localStorage key. Only COLLAPSED sections are stored, and expanding one deletes
 * it, so a project nobody has touched starts expanded. It is view state for this browser and this
 * signed-in user: it never syncs to another device or to a collaborator.
 *
 * ⚠️ UNLIKE `scenario-memory`'s `saveMap`, EVERY STORAGE ACCESS HERE CATCHES. A toggle must never
 * throw: storage can be full, or refused outright (a private window), and the section still has to
 * open and close — it just will not be remembered.
 */

import { getActiveStorageNamespace } from "./local-storage-repository";

export type CollapsibleSection = "grid" | "milestones" | "dependencies";

const SECTIONS: readonly CollapsibleSection[] = ["grid", "milestones", "dependencies"];

const KEY_BASE = "spert-scheduler:collapsed-sections";

function keyForActiveNamespace(): string {
  return `${KEY_BASE}:${getActiveStorageNamespace()}`;
}

function isSection(value: unknown): value is CollapsibleSection {
  return SECTIONS.includes(value as CollapsibleSection);
}

function loadMap(): Record<string, CollapsibleSection[]> {
  try {
    const raw = localStorage.getItem(keyForActiveNamespace());
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    const map: Record<string, CollapsibleSection[]> = {};
    for (const [projectId, sections] of Object.entries(parsed)) {
      if (!Array.isArray(sections)) continue;
      const known = sections.filter(isSection);
      if (known.length > 0) map[projectId] = known;
    }
    return map;
  } catch {
    return {};
  }
}

/** True when the user collapsed this section of this project, in this browser. */
export function isSectionCollapsed(projectId: string, section: CollapsibleSection): boolean {
  return loadMap()[projectId]?.includes(section) ?? false;
}

/** Remembers a collapse, or forgets it on expand. Never throws. */
export function setSectionCollapsed(
  projectId: string,
  section: CollapsibleSection,
  collapsed: boolean,
): void {
  try {
    const map = loadMap();
    const others = (map[projectId] ?? []).filter((s) => s !== section);
    const next = collapsed ? [...others, section] : others;
    if (next.length > 0) map[projectId] = next;
    else delete map[projectId];
    const key = keyForActiveNamespace();
    if (Object.keys(map).length > 0) localStorage.setItem(key, JSON.stringify(map));
    else localStorage.removeItem(key);
  } catch {
    // Not remembered. The section still toggles: the hook holds the choice in memory.
  }
}

/**
 * Forgets every collapse for the ACTIVE namespace, as `clearAllLastScenarios` does beside it.
 * Idempotent, never throws, and leaves other namespaces alone.
 */
export function clearAllCollapsedSections(): void {
  try {
    localStorage.removeItem(keyForActiveNamespace());
  } catch {
    // Nothing to clear that can be reached.
  }
}
