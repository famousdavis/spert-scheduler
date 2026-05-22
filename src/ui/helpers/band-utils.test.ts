// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import type { Activity, ActivityBand } from "@domain/models/types";
import {
  buildRenderList,
  buildActivitySlotMap,
  deriveReorderResult,
  type GanttRenderItem,
} from "./band-utils";

function makeActivity(id: string): Activity {
  return {
    id,
    name: id,
    min: 1,
    mostLikely: 2,
    max: 3,
    confidenceLevel: "mediumConfidence",
    distributionType: "triangular",
    status: "planned",
  };
}

describe("buildRenderList", () => {
  it("inserts a band immediately before its anchor activity", () => {
    const a1 = makeActivity("a1");
    const a2 = makeActivity("a2");
    const band: ActivityBand = { id: "b1", name: "X", insertBeforeActivityId: "a2" };
    const items = buildRenderList([a1, a2], [band]);
    expect(items).toEqual([
      { kind: "activity", activity: a1 },
      { kind: "band", band },
      { kind: "activity", activity: a2 },
    ]);
  });

  it("appends a band with null anchor at the end", () => {
    const a1 = makeActivity("a1");
    const band: ActivityBand = { id: "b1", name: "X", insertBeforeActivityId: null };
    const items = buildRenderList([a1], [band]);
    expect(items).toEqual([
      { kind: "activity", activity: a1 },
      { kind: "band", band },
    ]);
  });

  it("appends a band whose anchor is not found at the end (treated as trailing)", () => {
    const a1 = makeActivity("a1");
    const band: ActivityBand = { id: "b1", name: "Orphan", insertBeforeActivityId: "missing" };
    const items = buildRenderList([a1], [band]);
    expect(items).toEqual([
      { kind: "activity", activity: a1 },
      { kind: "band", band },
    ]);
  });

  it("places multiple bands anchored to different activities in correct positions", () => {
    const a1 = makeActivity("a1");
    const a2 = makeActivity("a2");
    const a3 = makeActivity("a3");
    const bA: ActivityBand = { id: "bA", name: "Before a1", insertBeforeActivityId: "a1" };
    const bC: ActivityBand = { id: "bC", name: "Before a3", insertBeforeActivityId: "a3" };
    const items = buildRenderList([a1, a2, a3], [bA, bC]);
    expect(items.map((i) => (i.kind === "activity" ? i.activity.id : i.band.id))).toEqual([
      "bA",
      "a1",
      "a2",
      "bC",
      "a3",
    ]);
  });

  it("emits two bands with the same anchor in input order; anchor activity slot is 2", () => {
    const a1 = makeActivity("a1");
    const bFirst: ActivityBand = { id: "b1", name: "First", insertBeforeActivityId: "a1" };
    const bSecond: ActivityBand = { id: "b2", name: "Second", insertBeforeActivityId: "a1" };
    const items = buildRenderList([a1], [bFirst, bSecond]);
    expect(items.map((i) => (i.kind === "band" ? i.band.id : i.activity.id))).toEqual([
      "b1",
      "b2",
      "a1",
    ]);
    const slotMap = buildActivitySlotMap(items);
    expect(slotMap.get("a1")).toBe(2);
  });

  it("returns plain activity list when bands is empty (original order)", () => {
    const a1 = makeActivity("a1");
    const a2 = makeActivity("a2");
    const items = buildRenderList([a1, a2], []);
    expect(items).toEqual([
      { kind: "activity", activity: a1 },
      { kind: "activity", activity: a2 },
    ]);
  });

  it("emits all bands as trailing in input order when activities is empty", () => {
    const b1: ActivityBand = { id: "b1", name: "1", insertBeforeActivityId: "a1" };
    const b2: ActivityBand = { id: "b2", name: "2", insertBeforeActivityId: null };
    const items = buildRenderList([], [b1, b2]);
    expect(items.map((i) => (i.kind === "band" ? i.band.id : i.activity.id))).toEqual([
      "b1",
      "b2",
    ]);
  });

  it("property: every activity appears exactly once in output", () => {
    const activities = ["a1", "a2", "a3", "a4"].map(makeActivity);
    const bands: ActivityBand[] = [
      { id: "b1", name: "x", insertBeforeActivityId: "a2" },
      { id: "b2", name: "y", insertBeforeActivityId: null },
      { id: "b3", name: "z", insertBeforeActivityId: "missing" },
    ];
    const items = buildRenderList(activities, bands);
    for (const a of activities) {
      const count = items.filter(
        (i) => i.kind === "activity" && i.activity.id === a.id,
      ).length;
      expect(count).toBe(1);
    }
  });

  it("property: every band appears exactly once in output", () => {
    const activities = ["a1", "a2"].map(makeActivity);
    const bands: ActivityBand[] = [
      { id: "b1", name: "x", insertBeforeActivityId: "a1" },
      { id: "b2", name: "y", insertBeforeActivityId: "a2" },
      { id: "b3", name: "z", insertBeforeActivityId: null },
      { id: "b4", name: "w", insertBeforeActivityId: "missing" },
    ];
    const items = buildRenderList(activities, bands);
    for (const b of bands) {
      const count = items.filter(
        (i) => i.kind === "band" && i.band.id === b.id,
      ).length;
      expect(count).toBe(1);
    }
  });

  it("property: relative order of activities is preserved", () => {
    const activities = ["a1", "a2", "a3", "a4"].map(makeActivity);
    const bands: ActivityBand[] = [
      { id: "b1", name: "x", insertBeforeActivityId: "a2" },
      { id: "b2", name: "y", insertBeforeActivityId: "a4" },
    ];
    const items = buildRenderList(activities, bands);
    const activityOrder = items
      .filter((i): i is Extract<GanttRenderItem, { kind: "activity" }> => i.kind === "activity")
      .map((i) => i.activity.id);
    expect(activityOrder).toEqual(["a1", "a2", "a3", "a4"]);
  });
});

describe("buildActivitySlotMap", () => {
  it("returns correct slot index for each activity when no bands present", () => {
    const a1 = makeActivity("a1");
    const a2 = makeActivity("a2");
    const items = buildRenderList([a1, a2], []);
    const map = buildActivitySlotMap(items);
    expect(map.get("a1")).toBe(0);
    expect(map.get("a2")).toBe(1);
  });

  it("returns slot indices reflecting render-list position when bands are interspersed", () => {
    const a1 = makeActivity("a1");
    const a2 = makeActivity("a2");
    const a3 = makeActivity("a3");
    const bands: ActivityBand[] = [
      { id: "b1", name: "Before a2", insertBeforeActivityId: "a2" },
      { id: "b2", name: "Before a3", insertBeforeActivityId: "a3" },
    ];
    const items = buildRenderList([a1, a2, a3], bands);
    const map = buildActivitySlotMap(items);
    // Render order: a1(0), b1(1), a2(2), b2(3), a3(4)
    expect(map.get("a1")).toBe(0);
    expect(map.get("a2")).toBe(2);
    expect(map.get("a3")).toBe(4);
  });

  it("does not include band IDs in the map", () => {
    const a1 = makeActivity("a1");
    const band: ActivityBand = { id: "b1", name: "X", insertBeforeActivityId: "a1" };
    const items = buildRenderList([a1], [band]);
    const map = buildActivitySlotMap(items);
    expect(map.has("b1")).toBe(false);
    expect(map.size).toBe(1);
  });

  it("returns an empty map for an empty render list", () => {
    const map = buildActivitySlotMap([]);
    expect(map.size).toBe(0);
  });
});

describe("deriveReorderResult", () => {
  it("returns null when activeId equals overId", () => {
    const a1 = makeActivity("a1");
    const items = buildRenderList([a1], []);
    expect(deriveReorderResult(items, "a1", "a1")).toBeNull();
  });

  it("returns null when activeId is not found", () => {
    const a1 = makeActivity("a1");
    const a2 = makeActivity("a2");
    const items = buildRenderList([a1, a2], []);
    expect(deriveReorderResult(items, "missing", "a2")).toBeNull();
  });

  it("returns null when overId is not found", () => {
    const a1 = makeActivity("a1");
    const a2 = makeActivity("a2");
    const items = buildRenderList([a1, a2], []);
    expect(deriveReorderResult(items, "a1", "missing")).toBeNull();
  });

  it("dragging activity past band: band gets correct new insertBeforeActivityId", () => {
    const a1 = makeActivity("a1");
    const a2 = makeActivity("a2");
    const a3 = makeActivity("a3");
    const band: ActivityBand = {
      id: "b1",
      name: "Section",
      insertBeforeActivityId: "a2",
    };
    // Render order: a1, band(before a2), a2, a3
    const items = buildRenderList([a1, a2, a3], [band]);
    // Drag a1 onto a3 — moves a1 after the band+a2
    const result = deriveReorderResult(items, "a1", "a3");
    expect(result).not.toBeNull();
    expect(result!.activities.map((a) => a.id)).toEqual(["a2", "a3", "a1"]);
    // Band was just before a2, now at top, still before a2
    expect(result!.bands[0]?.insertBeforeActivityId).toBe("a2");
  });

  it("dragging band past activities: band gets correct new insertBeforeActivityId", () => {
    const a1 = makeActivity("a1");
    const a2 = makeActivity("a2");
    const a3 = makeActivity("a3");
    const band: ActivityBand = {
      id: "b1",
      name: "Section",
      insertBeforeActivityId: "a1",
    };
    // Render order: band(0), a1(1), a2(2), a3(3)
    const items = buildRenderList([a1, a2, a3], [band]);
    // Drag band onto a2 — arrayMove(0, 2) → [a1, a2, band, a3]
    const result = deriveReorderResult(items, "b1", "a2");
    expect(result).not.toBeNull();
    expect(result!.activities.map((a) => a.id)).toEqual(["a1", "a2", "a3"]);
    expect(result!.bands[0]?.insertBeforeActivityId).toBe("a3");
  });

  it("multiple bands: all anchors recomputed correctly after a single drag", () => {
    const a1 = makeActivity("a1");
    const a2 = makeActivity("a2");
    const a3 = makeActivity("a3");
    const bA: ActivityBand = {
      id: "bA",
      name: "A",
      insertBeforeActivityId: "a1",
    };
    const bB: ActivityBand = {
      id: "bB",
      name: "B",
      insertBeforeActivityId: "a3",
    };
    // Render order: bA, a1, a2, bB, a3
    const items = buildRenderList([a1, a2, a3], [bA, bB]);
    // Drag a1 onto a3
    const result = deriveReorderResult(items, "a1", "a3");
    expect(result).not.toBeNull();
    // New activity order: a2, a3, a1 (a1 inserted after a3)
    // New render: bA, a2, bB, a3, a1
    // bA -> next activity is a2; bB -> next activity is a3
    const bandMap = new Map(result!.bands.map((b) => [b.id, b]));
    expect(bandMap.get("bA")?.insertBeforeActivityId).toBe("a2");
    expect(bandMap.get("bB")?.insertBeforeActivityId).toBe("a3");
  });

  it("band dragged to end of list: insertBeforeActivityId is null", () => {
    const a1 = makeActivity("a1");
    const a2 = makeActivity("a2");
    const band: ActivityBand = {
      id: "b1",
      name: "Section",
      insertBeforeActivityId: "a1",
    };
    // Render order: band, a1, a2
    const items = buildRenderList([a1, a2], [band]);
    // Drag band onto a2 (last item)
    const result = deriveReorderResult(items, "b1", "a2");
    expect(result).not.toBeNull();
    expect(result!.bands[0]?.insertBeforeActivityId).toBeNull();
  });

  it("two bands with same anchor: both recomputed correctly after reorder", () => {
    const a1 = makeActivity("a1");
    const a2 = makeActivity("a2");
    const b1: ActivityBand = {
      id: "b1",
      name: "First",
      insertBeforeActivityId: "a2",
    };
    const b2: ActivityBand = {
      id: "b2",
      name: "Second",
      insertBeforeActivityId: "a2",
    };
    // Render order: a1, b1, b2, a2
    const items = buildRenderList([a1, a2], [b1, b2]);
    // Drag a1 onto a2 — moves a1 after both bands
    const result = deriveReorderResult(items, "a1", "a2");
    expect(result).not.toBeNull();
    expect(result!.activities.map((a) => a.id)).toEqual(["a2", "a1"]);
    // New render: b1, b2, a2, a1 — both bands anchored to a2
    const bandMap = new Map(result!.bands.map((b) => [b.id, b]));
    expect(bandMap.get("b1")?.insertBeforeActivityId).toBe("a2");
    expect(bandMap.get("b2")?.insertBeforeActivityId).toBe("a2");
  });

  it("preserves band order when bands move past each other", () => {
    const a1 = makeActivity("a1");
    const bA: ActivityBand = {
      id: "bA",
      name: "A",
      insertBeforeActivityId: "a1",
    };
    const bB: ActivityBand = {
      id: "bB",
      name: "B",
      insertBeforeActivityId: null,
    };
    // Render order: bA, a1, bB
    const items = buildRenderList([a1], [bA, bB]);
    // Drag bB to position of bA (above bA)
    const result = deriveReorderResult(items, "bB", "bA");
    expect(result).not.toBeNull();
    // New render order: bB, bA, a1 — bB.next = a1, bA.next = a1
    expect(result!.bands.map((b) => b.id)).toEqual(["bB", "bA"]);
    expect(result!.bands[0]?.insertBeforeActivityId).toBe("a1");
    expect(result!.bands[1]?.insertBeforeActivityId).toBe("a1");
  });
});
