// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import type { Activity, ActivityBand } from "@domain/models/types";

export type GanttRenderItem =
  | { kind: "activity"; activity: Activity }
  | { kind: "band"; band: ActivityBand };

interface PartitionedBands {
  anchoredByActivity: Map<string, ActivityBand[]>;
  trailing: ActivityBand[];
}

function partitionBands(
  bands: ActivityBand[],
  activityIds: Set<string>,
): PartitionedBands {
  const anchoredByActivity = new Map<string, ActivityBand[]>();
  const trailing: ActivityBand[] = [];
  for (const band of bands) {
    const anchor = band.insertBeforeActivityId;
    const isAnchored = anchor !== null && activityIds.has(anchor);
    if (!isAnchored) {
      trailing.push(band);
      continue;
    }
    const list = anchoredByActivity.get(anchor);
    if (list) list.push(band);
    else anchoredByActivity.set(anchor, [band]);
  }
  return { anchoredByActivity, trailing };
}

/**
 * Interleave bands with activities into a flat render list.
 *
 * - Bands with a non-null `insertBeforeActivityId` whose target exists render
 *   immediately before that activity, preserving relative order from `bands`.
 * - Bands with a null anchor, or whose anchor ID does not exist in
 *   `activities`, render after all activities (trailing) in `bands` order.
 */
export function buildRenderList(
  activities: Activity[],
  bands: ActivityBand[],
): GanttRenderItem[] {
  const activityIds = new Set(activities.map((a) => a.id));
  const { anchoredByActivity, trailing } = partitionBands(bands, activityIds);

  const items: GanttRenderItem[] = [];
  for (const activity of activities) {
    const anchored = anchoredByActivity.get(activity.id);
    if (anchored) {
      for (const band of anchored) items.push({ kind: "band", band });
    }
    items.push({ kind: "activity", activity });
  }
  for (const band of trailing) items.push({ kind: "band", band });
  return items;
}

/**
 * Map each activity ID to its 0-based slot index in the render list.
 * The slot counter increments for every item (band or activity), so the
 * returned index reflects the activity's actual render-list position.
 * Bands are not included in the map.
 */
export function buildActivitySlotMap(
  items: GanttRenderItem[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (let slotIndex = 0; slotIndex < items.length; slotIndex++) {
    const item = items[slotIndex]!;
    if (item.kind === "activity") {
      map.set(item.activity.id, slotIndex);
    }
  }
  return map;
}

function itemId(item: GanttRenderItem): string {
  return item.kind === "activity" ? item.activity.id : item.band.id;
}

/**
 * Pure derivation for drag-and-drop reorder of the band+activity render list.
 *
 * Applies the move (`activeId` → `overId`) to a copy of `renderItems`, then
 * walks the result once to extract the new activity order and re-anchor each
 * band to the first activity that follows it (or `null` when none follows).
 *
 * Returns `null` if either ID is not found in `renderItems` or `activeId`
 * equals `overId`.
 */
export function deriveReorderResult(
  renderItems: GanttRenderItem[],
  activeId: string,
  overId: string,
): { activities: Activity[]; bands: ActivityBand[] } | null {
  if (activeId === overId) return null;

  let oldIndex = -1;
  let newIndex = -1;
  for (let i = 0; i < renderItems.length; i++) {
    const id = itemId(renderItems[i]!);
    if (id === activeId) oldIndex = i;
    if (id === overId) newIndex = i;
  }
  if (oldIndex === -1 || newIndex === -1) return null;

  const newItems = renderItems.slice();
  const [moved] = newItems.splice(oldIndex, 1);
  if (!moved) return null;
  newItems.splice(newIndex, 0, moved);

  const activities: Activity[] = [];
  const bands: ActivityBand[] = [];
  // Walk backwards: the "next activity" for any band is the most recently
  // seen activity when scanning right-to-left. This gives a single O(n) pass
  // without `indexOf` inside `.map`.
  let nextActivityId: string | null = null;
  for (let i = newItems.length - 1; i >= 0; i--) {
    const item = newItems[i]!;
    if (item.kind === "activity") {
      activities.unshift(item.activity);
      nextActivityId = item.activity.id;
    } else {
      bands.unshift({
        ...item.band,
        insertBeforeActivityId: nextActivityId,
      });
    }
  }

  return { activities, bands };
}
