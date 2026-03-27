// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import type { Activity, ActivityDependency } from "@domain/models/types";
import {
  dateToX,
  longDateLabel,
  compactLabel,
  toISO,
  generateTicks,
  monthTickLabel,
  buildOrderedActivities,
  computeWeekendShadingRects,
} from "./gantt-utils";
import {
  LEFT_MARGIN, ROW_HEIGHT, BAR_HEIGHT, BAR_Y_OFFSET,
  PRINT_LEFT, PRINT_ROW, PRINT_BAR_H,
  resolveGanttAppearance, GANTT_COLOR_PRESETS,
} from "./gantt-constants";

// -- dateToX ------------------------------------------------------------------

describe("dateToX", () => {
  const min = new Date("2026-01-01T00:00:00").getTime();
  const max = new Date("2026-01-31T00:00:00").getTime();
  const range = max - min;
  const areaW = 600;

  it("maps start date to leftMargin", () => {
    expect(dateToX("2026-01-01", min, range, areaW, LEFT_MARGIN)).toBe(LEFT_MARGIN);
  });

  it("maps end date to leftMargin + chartAreaWidth", () => {
    expect(dateToX("2026-01-31", min, range, areaW, LEFT_MARGIN)).toBe(LEFT_MARGIN + areaW);
  });

  it("returns midpoint when dateRange is 0", () => {
    expect(dateToX("2026-01-15", min, 0, areaW, LEFT_MARGIN)).toBe(LEFT_MARGIN + areaW / 2);
  });

  it("interpolates intermediate dates linearly", () => {
    const midDate = "2026-01-16"; // 15 days into 30-day range = 50%
    const x = dateToX(midDate, min, range, areaW, LEFT_MARGIN);
    expect(x).toBeCloseTo(LEFT_MARGIN + areaW * (15 / 30), 0);
  });

  it("uses custom leftMargin when provided", () => {
    const customLeft = 100;
    const x = dateToX("2026-01-01", min, range, areaW, customLeft);
    expect(x).toBe(customLeft);
  });
});

// -- longDateLabel ------------------------------------------------------------

describe("longDateLabel", () => {
  it("formats a date as 'Mon Day, Year'", () => {
    expect(longDateLabel("2026-06-23")).toBe("Jun 23, 2026");
  });

  it("handles single-digit days", () => {
    expect(longDateLabel("2026-03-05")).toBe("Mar 5, 2026");
  });

  it("handles January", () => {
    expect(longDateLabel("2026-01-01")).toBe("Jan 1, 2026");
  });

  it("handles December", () => {
    expect(longDateLabel("2026-12-31")).toBe("Dec 31, 2026");
  });
});

// -- compactLabel -------------------------------------------------------------

describe("compactLabel", () => {
  it("includes day number when includeDay is true", () => {
    expect(compactLabel(new Date(2026, 2, 16), true)).toBe("Mar 16");
  });

  it("returns month name only when includeDay is false", () => {
    expect(compactLabel(new Date(2026, 3, 1), false)).toBe("Apr");
  });
});

// -- monthTickLabel -----------------------------------------------------------

describe("monthTickLabel", () => {
  it("includes year on first tick", () => {
    expect(monthTickLabel(new Date(2026, 3, 1), true, null)).toBe("Apr '26");
  });

  it("shows month only for subsequent ticks in same year", () => {
    expect(monthTickLabel(new Date(2026, 4, 1), false, 2026)).toBe("May");
  });

  it("includes year when year changes", () => {
    expect(monthTickLabel(new Date(2027, 0, 1), false, 2026)).toBe("Jan '27");
  });
});

// -- toISO --------------------------------------------------------------------

describe("toISO", () => {
  it("formats date as YYYY-MM-DD", () => {
    expect(toISO(new Date(2026, 5, 23))).toBe("2026-06-23");
  });

  it("zero-pads month and day", () => {
    expect(toISO(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

// -- generateTicks ------------------------------------------------------------

describe("generateTicks", () => {
  it("generates daily ticks for ranges <= 14 days", () => {
    const ticks = generateTicks("2026-03-01", "2026-03-10");
    expect(ticks.length).toBe(10); // 10 days inclusive
    expect(ticks[0]).toEqual({ x: "2026-03-01", label: "Mar 1" });
    expect(ticks[9]).toEqual({ x: "2026-03-10", label: "Mar 10" });
  });

  it("generates weekly ticks for ranges 15-60 days", () => {
    const ticks = generateTicks("2026-03-01", "2026-04-15");
    expect(ticks.length).toBeGreaterThan(0);
    // Ticks should start on first Monday after start
    const firstTickDate = new Date(ticks[0]!.x + "T00:00:00");
    expect(firstTickDate.getDay()).toBe(1); // Monday
    // All ticks 7 days apart (compare by calendar day, not ms, to avoid DST issues)
    for (let i = 1; i < ticks.length; i++) {
      const prevDay = Number(ticks[i - 1]!.x.split("-")[2]);
      const currDay = Number(ticks[i]!.x.split("-")[2]);
      const prevMonth = Number(ticks[i - 1]!.x.split("-")[1]);
      const currMonth = Number(ticks[i]!.x.split("-")[1]);
      if (prevMonth === currMonth) {
        expect(currDay - prevDay).toBe(7);
      }
    }
  });

  it("generates biweekly ticks for ranges 61-90 days", () => {
    const ticks = generateTicks("2026-01-01", "2026-03-15");
    expect(ticks.length).toBeGreaterThan(0);
    // First tick should be on a Monday
    const firstTickDate = new Date(ticks[0]!.x + "T00:00:00");
    expect(firstTickDate.getDay()).toBe(1);
    // Ticks within the same month should be 14 days apart
    for (let i = 1; i < ticks.length; i++) {
      const prevDay = Number(ticks[i - 1]!.x.split("-")[2]);
      const currDay = Number(ticks[i]!.x.split("-")[2]);
      const prevMonth = Number(ticks[i - 1]!.x.split("-")[1]);
      const currMonth = Number(ticks[i]!.x.split("-")[1]);
      if (prevMonth === currMonth) {
        expect(currDay - prevDay).toBe(14);
      }
    }
  });

  it("generates monthly ticks for ranges > 90 days", () => {
    const ticks = generateTicks("2026-01-01", "2026-05-01");
    // Monthly ticks on 1st of month, starting from Feb
    expect(ticks[0]).toEqual({ x: "2026-02-01", label: "Feb '26" });
    // Subsequent ticks in same year show month only
    expect(ticks[1]).toEqual({ x: "2026-03-01", label: "Mar" });
    for (const tick of ticks) {
      expect(tick.x.endsWith("-01")).toBe(true);
    }
  });

  it("generates monthly ticks with year on year boundary", () => {
    const ticks = generateTicks("2026-01-01", "2026-12-31");
    expect(ticks[0]).toEqual({ x: "2026-02-01", label: "Feb '26" });
    // All subsequent same-year ticks are month-only
    expect(ticks[1]!.label).toBe("Mar");
    for (const tick of ticks) {
      expect(tick.x.endsWith("-01")).toBe(true);
    }
  });

  it("returns empty array when start equals end for weekly+ ranges", () => {
    const ticks = generateTicks("2026-03-01", "2026-03-01");
    // 0 days = daily mode, 1 tick (the single day)
    expect(ticks.length).toBe(1);
  });
});

// -- buildOrderedActivities ---------------------------------------------------

function makeActivity(id: string, name: string): Activity {
  return {
    id,
    name,
    mostLikely: 10,
    min: 5,
    max: 15,
    confidenceLevel: "mediumConfidence" as const,
    distributionType: "normal" as const,
    status: "planned" as const,
  };
}

function fsDep(from: string, to: string): ActivityDependency {
  return { fromActivityId: from, toActivityId: to, type: "FS", lagDays: 0 };
}

describe("buildOrderedActivities", () => {
  const a = makeActivity("a", "Alpha");
  const b = makeActivity("b", "Beta");
  const c = makeActivity("c", "Charlie");

  it("returns original order when dependencyMode is false", () => {
    const result = buildOrderedActivities([c, b, a], [fsDep("a", "b")], false);
    expect(result.map((x) => x.id)).toEqual(["c", "b", "a"]);
  });

  it("returns original order when dependencies is empty", () => {
    const result = buildOrderedActivities([c, b, a], [], true);
    expect(result.map((x) => x.id)).toEqual(["c", "b", "a"]);
  });

  it("preserves grid order even with dependencies (A → B → C chain)", () => {
    const result = buildOrderedActivities(
      [c, b, a],
      [fsDep("a", "b"), fsDep("b", "c")],
      true,
    );
    expect(result.map((x) => x.id)).toEqual(["c", "b", "a"]);
  });

  it("returns original order on cyclic dependency (graceful fallback)", () => {
    const result = buildOrderedActivities(
      [a, b],
      [fsDep("a", "b"), fsDep("b", "a")],
      true,
    );
    // Cycle causes buildDependencyGraph to throw; fallback returns original
    expect(result.map((x) => x.id)).toEqual(["a", "b"]);
  });
});

// -- resolveGanttAppearance ---------------------------------------------------

describe("resolveGanttAppearance", () => {
  it("undefined settings produces defaults matching hardcoded constants", () => {
    const ra = resolveGanttAppearance(undefined, false);
    expect(ra.leftMargin).toBe(LEFT_MARGIN);
    expect(ra.rowHeight).toBe(ROW_HEIGHT);
    expect(ra.barHeight).toBe(BAR_HEIGHT);
    expect(ra.barYOffset).toBe(BAR_Y_OFFSET);
    expect(ra.printLeftMargin).toBe(PRINT_LEFT);
    expect(ra.printRowHeight).toBe(PRINT_ROW);
    expect(ra.printBarHeight).toBe(PRINT_BAR_H);
    expect(ra.nameFontSize).toBe(12);
    expect(ra.nameCharLimit).toBe(38);
    expect(ra.barLabel).toBe("duration");
    expect(ra.weekendShading).toBe(false);
  });

  it("classic preset light matches COLORS.light bar colors", () => {
    const ra = resolveGanttAppearance(undefined, false);
    expect(ra.barPlanned).toBe(GANTT_COLOR_PRESETS.classic!.light.barPlanned);
    expect(ra.barInProgress).toBe(GANTT_COLOR_PRESETS.classic!.light.barInProgress);
    expect(ra.barComplete).toBe(GANTT_COLOR_PRESETS.classic!.light.barComplete);
    expect(ra.criticalPath).toBe(GANTT_COLOR_PRESETS.classic!.light.criticalPath);
  });

  it("classic preset dark uses dark variant colors", () => {
    const ra = resolveGanttAppearance(undefined, true);
    expect(ra.barPlanned).toBe(GANTT_COLOR_PRESETS.classic!.dark.barPlanned);
    expect(ra.barInProgress).toBe(GANTT_COLOR_PRESETS.classic!.dark.barInProgress);
  });

  it.each(["classic", "monochrome", "ocean", "warm"] as const)("preset %s light resolves", (preset) => {
    const ra = resolveGanttAppearance({ nameColumnWidth: "normal", activityFontSize: "normal", rowDensity: "normal", barLabel: "duration", colorPreset: preset, weekendShading: false }, false);
    expect(ra.barPlanned).toBe(GANTT_COLOR_PRESETS[preset]!.light.barPlanned);
  });

  it.each(["classic", "monochrome", "ocean", "warm"] as const)("preset %s dark resolves", (preset) => {
    const ra = resolveGanttAppearance({ nameColumnWidth: "normal", activityFontSize: "normal", rowDensity: "normal", barLabel: "duration", colorPreset: preset, weekendShading: false }, true);
    expect(ra.barPlanned).toBe(GANTT_COLOR_PRESETS[preset]!.dark.barPlanned);
  });

  it("narrow name column reduces leftMargin and charLimit", () => {
    const ra = resolveGanttAppearance({ nameColumnWidth: "narrow", activityFontSize: "normal", rowDensity: "normal", barLabel: "duration", colorPreset: "classic", weekendShading: false }, false);
    expect(ra.leftMargin).toBe(180);
    expect(ra.nameCharLimit).toBe(24);
    expect(ra.printLeftMargin).toBe(120);
    expect(ra.printNameCharLimit).toBe(18);
  });

  it("wide name column increases leftMargin and charLimit", () => {
    const ra = resolveGanttAppearance({ nameColumnWidth: "wide", activityFontSize: "normal", rowDensity: "normal", barLabel: "duration", colorPreset: "classic", weekendShading: false }, false);
    expect(ra.leftMargin).toBe(360);
    expect(ra.nameCharLimit).toBe(54);
  });

  it("compact row density produces smaller dimensions", () => {
    const ra = resolveGanttAppearance({ nameColumnWidth: "normal", activityFontSize: "normal", rowDensity: "compact", barLabel: "duration", colorPreset: "classic", weekendShading: false }, false);
    expect(ra.rowHeight).toBe(24);
    expect(ra.barHeight).toBe(16);
    expect(ra.barYOffset).toBe(4);
    expect(ra.printRowHeight).toBe(14);
    expect(ra.printBarHeight).toBe(9);
  });

  it("comfortable row density produces larger dimensions", () => {
    const ra = resolveGanttAppearance({ nameColumnWidth: "normal", activityFontSize: "normal", rowDensity: "comfortable", barLabel: "duration", colorPreset: "classic", weekendShading: false }, false);
    expect(ra.rowHeight).toBe(44);
    expect(ra.barHeight).toBe(30);
    expect(ra.barYOffset).toBe(7);
    expect(ra.printRowHeight).toBe(25);
    expect(ra.printBarHeight).toBe(17);
  });

  it("all font sizes map correctly", () => {
    const sizes = { small: 11, normal: 12, large: 14, xl: 16 } as const;
    for (const [key, expected] of Object.entries(sizes)) {
      const ra = resolveGanttAppearance({ nameColumnWidth: "normal", activityFontSize: key as "small" | "normal" | "large" | "xl", rowDensity: "normal", barLabel: "duration", colorPreset: "classic", weekendShading: false }, false);
      expect(ra.nameFontSize).toBe(expected);
    }
  });

  it("customPlannedColor overrides preset barPlanned", () => {
    const ra = resolveGanttAppearance({ nameColumnWidth: "normal", activityFontSize: "normal", rowDensity: "normal", barLabel: "duration", colorPreset: "classic", customPlannedColor: "#ff0000", weekendShading: false }, false);
    expect(ra.barPlanned).toBe("#ff0000");
    // barInProgress still from preset
    expect(ra.barInProgress).toBe(GANTT_COLOR_PRESETS.classic!.light.barInProgress);
  });

  it("customInProgressColor overrides preset barInProgress", () => {
    const ra = resolveGanttAppearance({ nameColumnWidth: "normal", activityFontSize: "normal", rowDensity: "normal", barLabel: "duration", colorPreset: "classic", customInProgressColor: "#00ff00", weekendShading: false }, false);
    expect(ra.barInProgress).toBe("#00ff00");
  });

  it("unknown colorPreset falls back to classic", () => {
    const ra = resolveGanttAppearance({ nameColumnWidth: "normal", activityFontSize: "normal", rowDensity: "normal", barLabel: "duration", colorPreset: "nonexistent", weekendShading: false }, false);
    expect(ra.barPlanned).toBe(GANTT_COLOR_PRESETS.classic!.light.barPlanned);
  });

  it("weekendShading flag is passed through", () => {
    const ra = resolveGanttAppearance({ nameColumnWidth: "normal", activityFontSize: "normal", rowDensity: "normal", barLabel: "duration", colorPreset: "classic", weekendShading: true }, false);
    expect(ra.weekendShading).toBe(true);
  });

  it("shading color differs for dark mode", () => {
    const light = resolveGanttAppearance(undefined, false);
    const dark = resolveGanttAppearance(undefined, true);
    expect(light.shadingColor).not.toBe(dark.shadingColor);
  });

  it("nameCharLimit scales inversely with font size", () => {
    const normal = resolveGanttAppearance({ nameColumnWidth: "normal", activityFontSize: "normal", rowDensity: "normal", barLabel: "duration", colorPreset: "classic", weekendShading: false }, false);
    const xl = resolveGanttAppearance({ nameColumnWidth: "normal", activityFontSize: "xl", rowDensity: "normal", barLabel: "duration", colorPreset: "classic", weekendShading: false }, false);
    // normal: 38 * 12/12 = 38, xl: 38 * 12/16 = 28
    expect(normal.nameCharLimit).toBe(38);
    expect(xl.nameCharLimit).toBe(28);
    expect(xl.nameCharLimit).toBeLessThan(normal.nameCharLimit);
  });

  it("printNameCharLimit scales inversely with font size", () => {
    const normal = resolveGanttAppearance({ nameColumnWidth: "normal", activityFontSize: "normal", rowDensity: "normal", barLabel: "duration", colorPreset: "classic", weekendShading: false }, false);
    const large = resolveGanttAppearance({ nameColumnWidth: "normal", activityFontSize: "large", rowDensity: "normal", barLabel: "duration", colorPreset: "classic", weekendShading: false }, false);
    // normal: 26 * 12/12 = 26, large: 26 * 12/14 = 22
    expect(normal.printNameCharLimit).toBe(26);
    expect(large.printNameCharLimit).toBe(22);
  });

  it("narrow + XL font produces reduced char limits", () => {
    const ra = resolveGanttAppearance({ nameColumnWidth: "narrow", activityFontSize: "xl", rowDensity: "normal", barLabel: "duration", colorPreset: "classic", weekendShading: false }, false);
    // narrow base: 24, XL scale: 24 * 12/16 = 18
    expect(ra.nameCharLimit).toBe(18);
    expect(ra.leftMargin).toBe(180);
  });
});

// -- computeWeekendShadingRects -----------------------------------------------

describe("computeWeekendShadingRects", () => {
  // Simple mock calendar: weekdays are work days, weekends are not
  const mockCalendar = {
    isWorkDay(d: Date) {
      const day = d.getDay();
      return day !== 0 && day !== 6; // Mon-Fri
    },
    nextWorkDay(d: Date) {
      const next = new Date(d);
      do { next.setDate(next.getDate() + 1); } while (!this.isWorkDay(next));
      return next;
    },
    addWorkDays(d: Date, n: number) {
      const result = new Date(d);
      let remaining = n;
      while (remaining > 0) { result.setDate(result.getDate() + 1); if (this.isWorkDay(result)) remaining--; }
      return result;
    },
  };

  it("returns empty array when dateRange is 0", () => {
    const rects = computeWeekendShadingRects(mockCalendar, "2026-03-01", "2026-03-01", 0, 0, 600, 260);
    expect(rects).toEqual([]);
  });

  it("coalesces consecutive non-work days into single rects", () => {
    // Mon Mar 2 to Sun Mar 8, 2026 — Sat+Sun (7-8) are one span
    const start = "2026-03-02";
    const end = "2026-03-08";
    const minTs = new Date(start + "T00:00:00").getTime();
    const maxTs = new Date(end + "T00:00:00").getTime();
    const rects = computeWeekendShadingRects(mockCalendar, start, end, minTs, maxTs - minTs, 600, 0);
    // Should have exactly 1 rect for Sat-Sun
    expect(rects.length).toBe(1);
    expect(rects[0]!.width).toBeGreaterThan(0);
  });

  it("respects custom minRectWidth parameter", () => {
    // Very short range with tiny chart area → rects may be < 1px
    const start = "2026-03-01";
    const end = "2026-12-31";
    const minTs = new Date(start + "T00:00:00").getTime();
    const maxTs = new Date(end + "T00:00:00").getTime();
    const rectsDefault = computeWeekendShadingRects(mockCalendar, start, end, minTs, maxTs - minTs, 10, 0);
    const rectsSmall = computeWeekendShadingRects(mockCalendar, start, end, minTs, maxTs - minTs, 10, 0, 0.1);
    // With smaller minRectWidth, should get at least as many rects
    expect(rectsSmall.length).toBeGreaterThanOrEqual(rectsDefault.length);
  });
});
