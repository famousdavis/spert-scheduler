// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import {
  sectionGroups, sectionSpan, solidBarsExtent, summaryBarPath, sectionDisplayName, sectionTint,
  sectionTooltip, sectionLayers, tintGround,
} from "./gantt-sections";
import type { GanttRenderItem } from "@ui/helpers/band-utils";
import type { Activity, ActivityBand, ScheduledActivity } from "@domain/models/types";

/**
 * WI-172: which rows a Section covers, and the dates its summary bar runs between.
 *
 * ⚠️ Every expected value below is written out by hand from the fixture — never computed by
 * calling the code under test.
 */

const act = (id: string, status: Activity["status"] = "planned") => ({ id, name: id, status }) as Activity;
const band = (id: string, name: string, color?: string): ActivityBand =>
  ({ id, name, insertBeforeActivityId: "", ...(color ? { color } : {}) });

const PHASE_1 = band("s1", "Phase 1", "#94a3b8");
const EMPTY = band("s2", "Nothing yet", "#86b49a");
const UNNAMED = band("s3", "   ", "#7dd3fc");
const NO_COLOUR = band("s4", "Wrap-up");

/**
 * Row 0 is an activity above every Section (it belongs to none). Then Phase 1 (rows 1–3), an EMPTY
 * Section (row 4) directly followed by an unnamed one (rows 5–6), and a Section with no colour that
 * runs to the END of the list (rows 7–9) and holds a Complete row with recorded dates.
 */
const ITEMS: GanttRenderItem[] = [
  { kind: "activity", activity: act("a0") },
  { kind: "band", band: PHASE_1 },
  { kind: "activity", activity: act("a1") },
  { kind: "activity", activity: act("a2") },
  { kind: "band", band: EMPTY },
  { kind: "band", band: UNNAMED },
  { kind: "activity", activity: act("a3") },
  { kind: "band", band: NO_COLOUR },
  { kind: "activity", activity: act("a4", "complete") },
  { kind: "activity", activity: act("a5") },
];

const sa = (activityId: string, startDate: string, endDate: string, isActual = false): ScheduledActivity =>
  ({ activityId, name: activityId, duration: 1, startDate, endDate, isActual });

const SCHEDULE = new Map<string, ScheduledActivity>([
  ["a0", sa("a0", "2026-03-02", "2026-03-06")],
  // Phase 1: a2 starts FIRST though it is listed second, and a1 finishes LAST.
  ["a1", sa("a1", "2026-03-09", "2026-03-27")],
  ["a2", sa("a2", "2026-03-04", "2026-03-20")],
  ["a3", sa("a3", "2026-04-01", "2026-04-01")],
  // Wrap-up: a4 is Complete, drawn on its recorded dates — which began before a5's planned start.
  ["a4", sa("a4", "2026-02-23", "2026-03-03", true)],
  ["a5", sa("a5", "2026-04-06", "2026-04-17")],
]);

describe("sectionGroups: each Section with the rows it covers", () => {
  it("groups each Section's own row with its activities, down to the next Section or the end of the list", () => {
    expect(sectionGroups(ITEMS).map((g) => ({ id: g.band.id, row: g.row, endRow: g.endRow, activityIds: g.activityIds })))
      .toEqual([
        { id: "s1", row: 1, endRow: 4, activityIds: ["a1", "a2"] },
        { id: "s2", row: 4, endRow: 5, activityIds: [] },
        { id: "s3", row: 5, endRow: 7, activityIds: ["a3"] },
        { id: "s4", row: 7, endRow: 10, activityIds: ["a4", "a5"] },
      ]);
  });

  it("an activity above every Section belongs to none, and a list with no Section has no group", () => {
    expect(sectionGroups(ITEMS).flatMap((g) => g.activityIds)).not.toContain("a0");
    expect(sectionGroups(ITEMS.filter((i) => i.kind === "activity"))).toEqual([]);
  });
});

describe("sectionSpan: the first start and the last finish of a Section's activities", () => {
  it("reads every activity, not the first and the last listed", () => {
    expect(sectionSpan(["a1", "a2"], SCHEDULE)).toEqual({ start: "2026-03-04", end: "2026-03-27" });
  });

  it("a Section holding a Complete row with recorded dates runs from that row's recorded start", () => {
    expect(sectionSpan(["a4", "a5"], SCHEDULE)).toEqual({ start: "2026-02-23", end: "2026-04-17" });
  });

  it("a one-day activity is a span of one day; an empty Section, or one with no schedule, has none", () => {
    expect(sectionSpan(["a3"], SCHEDULE)).toEqual({ start: "2026-04-01", end: "2026-04-01" });
    expect(sectionSpan([], SCHEDULE)).toBeNull();
    expect(sectionSpan(["missing"], SCHEDULE)).toBeNull();
  });
});

describe("solidBarsExtent: where the solid bars start and end, by the chart's own rule", () => {
  // One pixel per day from 2026-02-23 (x = 0).
  const toX = (iso: string) => (Date.parse(`${iso}T00:00:00Z`) - Date.parse("2026-02-23T00:00:00Z")) / 86_400_000;

  it("from the first bar's start to the last bar's end", () => {
    // a2 starts on day 9, a1 ends on day 32 (a1 is 18 days wide, over the minimum of 4).
    expect(solidBarsExtent(["a1", "a2"], SCHEDULE, toX, 4)).toEqual({ x1: 9, x2: 32 });
  });

  it("ends where a bar drawn at the minimum width ends, past its own finish date", () => {
    // a3 starts and ends on day 37: drawn 4 wide, so it ends at 41; at a minimum of 2, at 39.
    expect(solidBarsExtent(["a3"], SCHEDULE, toX, 4)).toEqual({ x1: 37, x2: 41 });
    expect(solidBarsExtent(["a3"], SCHEDULE, toX, 2)).toEqual({ x1: 37, x2: 39 });
    expect(solidBarsExtent([], SCHEDULE, toX, 4)).toBeNull();
  });
});

describe("the rest of what a Section draws", () => {
  it("an unnamed Section shows the placeholder, by trim", () => {
    expect(sectionDisplayName(UNNAMED)).toBe("(unnamed section)");
    expect(sectionDisplayName(PHASE_1)).toBe("Phase 1");
  });

  it("a Section with no colour is tinted in the fallback grey", () => {
    expect(sectionTint(undefined, "#6b7280", 0.18)).toBe("rgba(107, 114, 128, 0.18)");
    expect(sectionTint("#94a3b8", "#6b7280", 0.18)).toBe("rgba(148, 163, 184, 0.18)");
  });

  it("the tint's ground is composited at the 8-bit alpha the browser uses (46/255), not 0.18", () => {
    // Sage #86b49a over white: g = 180 × 46/255 + 255 × 209/255 = 241.47 → 241 (at 0.18 itself: 241.5 → 242).
    expect(tintGround("#86b49a", "#6b7280", 0.18, "#ffffff")).toEqual({ r: 233, g: 241, b: 237 });
  });

  it("the summary bar is one path: a bar with a point down at each end", () => {
    expect(summaryBarPath(10, 70, 4, 8, 5)).toBe("M10,4 H70 V17 L64,12 H16 L10,17 Z");
    // A short bar's points shrink to a third of its width.
    expect(summaryBarPath(10, 16, 4, 8, 5)).toBe("M10,4 H16 V17 L14,12 H12 L10,17 Z");
  });

  it("the hover text: name, first start – last finish in the given format, and how many activities", () => {
    const fmt = (iso: string) => iso.split("-").reverse().join("/");
    expect(sectionTooltip("Phase 1", { start: "2026-03-04", end: "2026-03-27" }, 2, fmt))
      .toBe("Phase 1: 04/03/2026 – 27/03/2026 (2 activities)");
    expect(sectionTooltip("(unnamed section)", { start: "2026-04-01", end: "2026-04-01" }, 1, fmt))
      .toBe("(unnamed section): 01/04/2026 – 01/04/2026 (1 activity)");
  });

  it("sectionLayers: a tint for every Section, a bar for every Section that holds activities", () => {
    const toX = (iso: string) => (Date.parse(`${iso}T00:00:00Z`) - Date.parse("2026-02-23T00:00:00Z")) / 86_400_000;
    const layers = sectionLayers(ITEMS, SCHEDULE,
      { toX, minBarWidth: 4, topMargin: 100, rowHeight: 30, thickness: 8, lift: 2, drop: 5 },
      { muted: "#6b7280", ground: "#ffffff" });
    expect(layers.map((l) => [l.group.band.id, l.tint, l.bar && [l.bar.start, l.bar.end]])).toEqual([
      ["s1", "rgba(148, 163, 184, 0.18)", ["2026-03-04", "2026-03-27"]],
      ["s2", "rgba(134, 180, 154, 0.18)", null],
      ["s3", "rgba(125, 211, 252, 0.18)", ["2026-04-01", "2026-04-01"]],
      ["s4", "rgba(107, 114, 128, 0.18)", ["2026-02-23", "2026-04-17"]],
    ]);
    // Phase 1's bar: row 1's top is 130; (30 − 8) / 2 − 2 lower = 139; x from 9 to 32.
    expect(layers[0]!.bar!.d).toBe("M9,139 H32 V152 L26,147 H15 L9,152 Z");
  });
});
