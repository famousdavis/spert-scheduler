// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import type { Activity, ActivityBand, Scenario } from "@domain/models/types";

export function addBand(scenario: Scenario, band: ActivityBand): Scenario {
  return { ...scenario, bands: [...(scenario.bands ?? []), band] };
}

export function removeBand(scenario: Scenario, bandId: string): Scenario {
  const bands = scenario.bands ?? [];
  const idx = bands.findIndex((b) => b.id === bandId);
  if (idx === -1) return scenario; // same reference, no change
  return { ...scenario, bands: bands.filter((b) => b.id !== bandId) };
}

export function updateBand(
  scenario: Scenario,
  bandId: string,
  updates: Partial<ActivityBand>,
): Scenario {
  const bands = scenario.bands ?? [];
  const idx = bands.findIndex((b) => b.id === bandId);
  if (idx === -1) return scenario; // same reference, no change
  const newBands = bands.map((b) =>
    b.id === bandId ? { ...b, ...updates } : b,
  );
  return { ...scenario, bands: newBands };
}

export function reorderBands(
  scenario: Scenario,
  bands: ActivityBand[],
): Scenario {
  return { ...scenario, bands };
}

/**
 * Pure helper used by both `removeActivityFromScenario` and the store's
 * `bulkDeleteActivities` action. Re-anchors any bands whose anchor activity
 * was removed to the next survivor (in original list order), or `null` when
 * no later survivor exists.
 */
export function reanchorBandsAfterRemovals(
  bands: ActivityBand[],
  removedIds: Set<string>,
  originalActivities: Activity[],
  survivorActivities: Activity[],
): ActivityBand[] {
  if (bands.length === 0) return bands;
  const originalIndexById = new Map<string, number>();
  for (let i = 0; i < originalActivities.length; i++) {
    originalIndexById.set(originalActivities[i]!.id, i);
  }
  return bands.map((band) => {
    const anchorId = band.insertBeforeActivityId;
    if (anchorId === null || !removedIds.has(anchorId)) return band;
    const anchorIdx = originalIndexById.get(anchorId);
    if (anchorIdx === undefined) {
      // Anchor wasn't in the original list either — drop to trailing.
      return { ...band, insertBeforeActivityId: null };
    }
    const nextSurvivor = survivorActivities.find((s) => {
      const sIdx = originalIndexById.get(s.id);
      return sIdx !== undefined && sIdx > anchorIdx;
    });
    return {
      ...band,
      insertBeforeActivityId: nextSurvivor ? nextSurvivor.id : null,
    };
  });
}
