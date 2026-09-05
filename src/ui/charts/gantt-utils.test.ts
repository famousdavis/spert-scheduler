// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, vi } from "vitest";
import { formatDateISO } from "@core/calendar/calendar";
import {
  dateToX,
  longDateLabel,
  compactLabel,
  generateTicks,
  monthTickLabel,
  quarterlyTickLabel,
  semiannualTickLabel,
  countQuarterlyTicks,
  countSemiannualTicks,
  computeActivityRowGeometry,
  computeWeekendShadingRects,
  suppressOverlappingTicks,
  computeTodayLine,
  barLabelText,
  computeBarHitRect,
  buildActivityTooltip,
} from "./gantt-utils";
import {
  LEFT_MARGIN, ROW_HEIGHT, BAR_HEIGHT, BAR_Y_OFFSET, MIN_BAR_HIT_WIDTH,
  PRINT_LEFT, PRINT_ROW, PRINT_BAR_H,
  resolveGanttAppearance, GANTT_COLOR_PRESETS,
} from "./gantt-constants";
import { buildWorkCalendar } from "@core/calendar/work-calendar";
import { formatDateShort, formatDateDisplay } from "@core/calendar/calendar";
import type { DateFormatPreference } from "@domain/models/types";

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

// -- quarterlyTickLabel -------------------------------------------------------

describe("quarterlyTickLabel", () => {
  it("includes year on first tick", () => {
    expect(quarterlyTickLabel(new Date(2026, 0, 1), true, null)).toBe("Q1 '26");
  });

  it("shows quarter only for subsequent ticks in same year", () => {
    expect(quarterlyTickLabel(new Date(2026, 3, 1), false, 2026)).toBe("Q2");
    expect(quarterlyTickLabel(new Date(2026, 6, 1), false, 2026)).toBe("Q3");
    expect(quarterlyTickLabel(new Date(2026, 9, 1), false, 2026)).toBe("Q4");
  });

  it("includes year when year changes", () => {
    expect(quarterlyTickLabel(new Date(2027, 0, 1), false, 2026)).toBe("Q1 '27");
    expect(quarterlyTickLabel(new Date(2029, 9, 1), false, 2028)).toBe("Q4 '29");
  });
});

// -- semiannualTickLabel ------------------------------------------------------

describe("semiannualTickLabel", () => {
  it("includes year on first tick", () => {
    expect(semiannualTickLabel(new Date(2026, 0, 1), true, null)).toBe("H1 '26");
  });

  it("shows half only for subsequent ticks in same year", () => {
    expect(semiannualTickLabel(new Date(2026, 6, 1), false, 2026)).toBe("H2");
  });

  it("includes year when year changes", () => {
    expect(semiannualTickLabel(new Date(2027, 0, 1), false, 2026)).toBe("H1 '27");
  });

  it("correctly maps months to halves", () => {
    // H1 = Jan–Jun (months 0–5), H2 = Jul–Dec (months 6–11)
    expect(semiannualTickLabel(new Date(2026, 5, 1), true, null)).toBe("H1 '26");
    expect(semiannualTickLabel(new Date(2026, 6, 1), true, null)).toBe("H2 '26");
  });

  it("returns period only when prevYear is null and not first", () => {
    // Defensive: prevYear null + isFirst false → no year appended
    expect(semiannualTickLabel(new Date(2026, 6, 1), false, null)).toBe("H2");
  });
});

// -- countQuarterlyTicks / countSemiannualTicks --------------------------------

describe("countQuarterlyTicks", () => {
  it("counts quarterly boundaries in range", () => {
    // 2026-01-01 to 2027-08-24 → Q1'26, Q2'26, Q3'26, Q4'26, Q1'27, Q2'27, Q3'27 = 7
    expect(countQuarterlyTicks("2026-01-01", "2027-08-24")).toBe(7);
  });

  it("returns 0 for very short ranges with no quarter boundary", () => {
    expect(countQuarterlyTicks("2026-02-01", "2026-03-15")).toBe(0);
  });

  it("returns 1 when start equals a quarter boundary", () => {
    // Same-day boundary: Apr 1 is a quarter start
    expect(countQuarterlyTicks("2026-04-01", "2026-04-01")).toBe(1);
  });
});

describe("countSemiannualTicks", () => {
  it("counts semi-annual boundaries in range", () => {
    // 2026-01-01 to 2028-12-31 → Jan'26, Jul'26, Jan'27, Jul'27, Jan'28, Jul'28 = 6
    expect(countSemiannualTicks("2026-01-01", "2028-12-31")).toBe(6);
  });

  it("returns 0 for short ranges with no semi-annual boundary", () => {
    expect(countSemiannualTicks("2026-02-01", "2026-06-15")).toBe(0);
  });

  it("returns 1 when start equals a semi-annual boundary", () => {
    // Same-day boundary: Jul 1 is a semi-annual start
    expect(countSemiannualTicks("2026-07-01", "2026-07-01")).toBe(1);
  });
});

// -- formatDateISO (was toISO) ------------------------------------------------

describe("formatDateISO", () => {
  it("formats date as YYYY-MM-DD", () => {
    expect(formatDateISO(new Date(2026, 5, 23))).toBe("2026-06-23");
  });

  it("zero-pads month and day", () => {
    expect(formatDateISO(new Date(2026, 0, 5))).toBe("2026-01-05");
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

  it("generates monthly ticks for ranges 91-540 days", () => {
    // ~400 days — should be monthly, not quarterly
    const ticks = generateTicks("2026-01-01", "2027-02-05");
    expect(ticks.length).toBeGreaterThan(0);
    // All ticks on 1st of month
    for (const tick of ticks) {
      expect(tick.x.endsWith("-01")).toBe(true);
    }
    // First label includes year
    expect(ticks[0]!.label).toBe("Feb '26");
  });

  it("generates quarterly ticks when tickLevel is quarterly", () => {
    const ticks = generateTicks("2026-01-01", "2027-08-24", "quarterly");
    expect(ticks.length).toBeGreaterThan(0);
    // All ticks on quarter starts (month 0, 3, 6, or 9)
    for (const tick of ticks) {
      const month = Number(tick.x.split("-")[1]);
      expect([1, 4, 7, 10]).toContain(month);
      expect(tick.x.endsWith("-01")).toBe(true);
    }
    // First label includes year, subsequent same-year labels omit it
    expect(ticks[0]!.label).toMatch(/^Q\d '26$/);
    const q2_26 = ticks.find((t) => t.x === "2026-04-01");
    expect(q2_26?.label).toBe("Q2");
    // Year reappears on Q1 '27
    const q1_27 = ticks.find((t) => t.x === "2027-01-01");
    expect(q1_27?.label).toBe("Q1 '27");
  });

  it("generates semi-annual ticks when tickLevel is semiannual", () => {
    const ticks = generateTicks("2026-01-01", "2028-12-31", "semiannual");
    expect(ticks.length).toBeGreaterThan(0);
    // All ticks on Jan 1 or Jul 1
    for (const tick of ticks) {
      const month = Number(tick.x.split("-")[1]);
      expect([1, 7]).toContain(month);
      expect(tick.x.endsWith("-01")).toBe(true);
    }
    // First label includes year
    expect(ticks[0]!.label).toBe("H1 '26");
    // Subsequent same-year labels omit year
    const h2_26 = ticks.find((t) => t.x === "2026-07-01");
    expect(h2_26?.label).toBe("H2");
    // Year reappears on H1 '27
    const h1_27 = ticks.find((t) => t.x === "2027-01-01");
    expect(h1_27?.label).toBe("H1 '27");
  });

  it("generates annual ticks when tickLevel is annual", () => {
    const ticks = generateTicks("2026-01-01", "2032-08-01", "annual");
    expect(ticks.length).toBeGreaterThan(0);
    // All ticks on Jan 1
    for (const tick of ticks) {
      expect(tick.x.endsWith("-01-01")).toBe(true);
    }
    // Labels are 4-digit years
    expect(ticks[0]!.label).toBe("2027");
    if (ticks.length > 1) {
      expect(ticks[1]!.label).toBe("2028");
    }
  });

  it("quarterly ticks show year on year boundary", () => {
    // Range spanning 2026-2027
    const ticks = generateTicks("2026-06-01", "2028-01-01", "quarterly");
    // Find the Q1 '27 tick
    const yearChangeTick = ticks.find((t) => t.x === "2027-01-01");
    expect(yearChangeTick).toBeDefined();
    expect(yearChangeTick!.label).toBe("Q1 '27");
  });

  it("auto-selects quarterly as default fallback for >540 days without tickLevel", () => {
    // Without explicit tickLevel, >540 days defaults to quarterly
    const ticks = generateTicks("2026-01-01", "2027-08-24");
    expect(ticks.some((t) => t.label.startsWith("Q"))).toBe(true);
  });

  it("generates monthly ticks when tickLevel is explicitly monthly (even for long ranges)", () => {
    // Forcing monthly on a 2-year range
    const ticks = generateTicks("2026-01-01", "2027-12-31", "monthly");
    expect(ticks.length).toBeGreaterThan(12);
    // All ticks on 1st of month
    for (const tick of ticks) {
      expect(tick.x.endsWith("-01")).toBe(true);
    }
    // First label includes year
    expect(ticks[0]!.label).toBe("Feb '26");
    // Year reappears on Jan '27
    const jan27 = ticks.find((t) => t.x === "2027-01-01");
    expect(jan27?.label).toBe("Jan '27");
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

  it.each(["classic", "professional", "colorful", "grayscale", "contrast", "forest", "ocean", "sunset", "lavender", "earth"] as const)("preset %s light resolves", (preset) => {
    const ra = resolveGanttAppearance({ nameColumnWidth: "normal", activityFontSize: "normal", rowDensity: "normal", barLabel: "duration", colorPreset: preset, weekendShading: false, fitToWindow: false }, false);
    expect(ra.barPlanned).toBe(GANTT_COLOR_PRESETS[preset]!.light.barPlanned);
  });

  it.each(["classic", "professional", "colorful", "grayscale", "contrast", "forest", "ocean", "sunset", "lavender", "earth"] as const)("preset %s dark resolves", (preset) => {
    const ra = resolveGanttAppearance({ nameColumnWidth: "normal", activityFontSize: "normal", rowDensity: "normal", barLabel: "duration", colorPreset: preset, weekendShading: false, fitToWindow: false }, true);
    expect(ra.barPlanned).toBe(GANTT_COLOR_PRESETS[preset]!.dark.barPlanned);
  });

  it("narrow name column reduces leftMargin and charLimit", () => {
    const ra = resolveGanttAppearance({ nameColumnWidth: "narrow", activityFontSize: "normal", rowDensity: "normal", barLabel: "duration", colorPreset: "classic", weekendShading: false, fitToWindow: false }, false);
    expect(ra.leftMargin).toBe(180);
    expect(ra.nameCharLimit).toBe(24);
    expect(ra.printLeftMargin).toBe(120);
    // Derived: floor((120 - 8) / (7 * 0.6)) = floor(26.66) = 26
    expect(ra.printNameCharLimit).toBe(26);
  });

  it("wide name column increases leftMargin and charLimit", () => {
    const ra = resolveGanttAppearance({ nameColumnWidth: "wide", activityFontSize: "normal", rowDensity: "normal", barLabel: "duration", colorPreset: "classic", weekendShading: false, fitToWindow: false }, false);
    expect(ra.leftMargin).toBe(360);
    expect(ra.nameCharLimit).toBe(54);
    // Derived: floor((230 - 8) / (7 * 0.6)) = floor(52.85) = 52
    expect(ra.printNameCharLimit).toBe(52);
  });

  it("compact row density produces smaller dimensions", () => {
    const ra = resolveGanttAppearance({ nameColumnWidth: "normal", activityFontSize: "normal", rowDensity: "compact", barLabel: "duration", colorPreset: "classic", weekendShading: false, fitToWindow: false }, false);
    expect(ra.rowHeight).toBe(24);
    expect(ra.barHeight).toBe(16);
    expect(ra.barYOffset).toBe(4);
    expect(ra.printRowHeight).toBe(14);
    expect(ra.printBarHeight).toBe(9);
  });

  it("comfortable row density produces larger dimensions", () => {
    const ra = resolveGanttAppearance({ nameColumnWidth: "normal", activityFontSize: "normal", rowDensity: "comfortable", barLabel: "duration", colorPreset: "classic", weekendShading: false, fitToWindow: false }, false);
    expect(ra.rowHeight).toBe(44);
    expect(ra.barHeight).toBe(30);
    expect(ra.barYOffset).toBe(7);
    expect(ra.printRowHeight).toBe(25);
    expect(ra.printBarHeight).toBe(17);
  });

  it("all font sizes map correctly", () => {
    const sizes = { small: 11, normal: 12, large: 14, xl: 16 } as const;
    for (const [key, expected] of Object.entries(sizes)) {
      const ra = resolveGanttAppearance({ nameColumnWidth: "normal", activityFontSize: key as "small" | "normal" | "large" | "xl", rowDensity: "normal", barLabel: "duration", colorPreset: "classic", weekendShading: false, fitToWindow: false }, false);
      expect(ra.nameFontSize).toBe(expected);
    }
  });

  it("customPlannedColor overrides preset barPlanned", () => {
    const ra = resolveGanttAppearance({ nameColumnWidth: "normal", activityFontSize: "normal", rowDensity: "normal", barLabel: "duration", colorPreset: "classic", customPlannedColor: "#ff0000", weekendShading: false, fitToWindow: false }, false);
    expect(ra.barPlanned).toBe("#ff0000");
    // barInProgress still from preset
    expect(ra.barInProgress).toBe(GANTT_COLOR_PRESETS.classic!.light.barInProgress);
  });

  it("customInProgressColor overrides preset barInProgress", () => {
    const ra = resolveGanttAppearance({ nameColumnWidth: "normal", activityFontSize: "normal", rowDensity: "normal", barLabel: "duration", colorPreset: "classic", customInProgressColor: "#00ff00", weekendShading: false, fitToWindow: false }, false);
    expect(ra.barInProgress).toBe("#00ff00");
  });

  it("customCompletedColor overrides preset barComplete", () => {
    const ra = resolveGanttAppearance({ nameColumnWidth: "normal", activityFontSize: "normal", rowDensity: "normal", barLabel: "duration", colorPreset: "classic", customCompletedColor: "#aabbcc", weekendShading: false, fitToWindow: false }, false);
    expect(ra.barComplete).toBe("#aabbcc");
  });

  it("unknown colorPreset falls back to classic", () => {
    const ra = resolveGanttAppearance({ nameColumnWidth: "normal", activityFontSize: "normal", rowDensity: "normal", barLabel: "duration", colorPreset: "nonexistent", weekendShading: false, fitToWindow: false }, false);
    expect(ra.barPlanned).toBe(GANTT_COLOR_PRESETS.classic!.light.barPlanned);
  });

  it("weekendShading flag is passed through", () => {
    const ra = resolveGanttAppearance({ nameColumnWidth: "normal", activityFontSize: "normal", rowDensity: "normal", barLabel: "duration", colorPreset: "classic", weekendShading: true, fitToWindow: false }, false);
    expect(ra.weekendShading).toBe(true);
  });

  it("fitToWindow defaults to false when settings undefined", () => {
    const ra = resolveGanttAppearance(undefined, false);
    expect(ra.fitToWindow).toBe(false);
  });

  it("fitToWindow passes through true value", () => {
    const ra = resolveGanttAppearance({ nameColumnWidth: "normal", activityFontSize: "normal", rowDensity: "normal", barLabel: "duration", colorPreset: "classic", weekendShading: false, fitToWindow: true }, false);
    expect(ra.fitToWindow).toBe(true);
  });

  it("fitToWindow passes through false value", () => {
    const ra = resolveGanttAppearance({ nameColumnWidth: "normal", activityFontSize: "normal", rowDensity: "normal", barLabel: "duration", colorPreset: "classic", weekendShading: false, fitToWindow: false }, false);
    expect(ra.fitToWindow).toBe(false);
  });

  it("timelineDensityPx defaults to 70 when undefined settings", () => {
    const ra = resolveGanttAppearance(undefined, false);
    expect(ra.timelineDensityPx).toBe(70);
  });

  it("timelineDensityPx maps sparse to 90", () => {
    const ra = resolveGanttAppearance({ nameColumnWidth: "normal", activityFontSize: "normal", rowDensity: "normal", barLabel: "duration", colorPreset: "classic", weekendShading: false, fitToWindow: false, timelineDensity: "sparse" }, false);
    expect(ra.timelineDensityPx).toBe(90);
  });

  it("timelineDensityPx maps normal to 70", () => {
    const ra = resolveGanttAppearance({ nameColumnWidth: "normal", activityFontSize: "normal", rowDensity: "normal", barLabel: "duration", colorPreset: "classic", weekendShading: false, fitToWindow: false, timelineDensity: "normal" }, false);
    expect(ra.timelineDensityPx).toBe(70);
  });

  it("timelineDensityPx maps dense to 50", () => {
    const ra = resolveGanttAppearance({ nameColumnWidth: "normal", activityFontSize: "normal", rowDensity: "normal", barLabel: "duration", colorPreset: "classic", weekendShading: false, fitToWindow: false, timelineDensity: "dense" }, false);
    expect(ra.timelineDensityPx).toBe(50);
  });

  it("shading color differs for dark mode", () => {
    const light = resolveGanttAppearance(undefined, false);
    const dark = resolveGanttAppearance(undefined, true);
    expect(light.shadingColor).not.toBe(dark.shadingColor);
  });

  it("nameCharLimit scales inversely with font size", () => {
    const normal = resolveGanttAppearance({ nameColumnWidth: "normal", activityFontSize: "normal", rowDensity: "normal", barLabel: "duration", colorPreset: "classic", weekendShading: false, fitToWindow: false }, false);
    const xl = resolveGanttAppearance({ nameColumnWidth: "normal", activityFontSize: "xl", rowDensity: "normal", barLabel: "duration", colorPreset: "classic", weekendShading: false, fitToWindow: false }, false);
    // normal: 38 * 12/12 = 38, xl: 38 * 12/16 = 28
    expect(normal.nameCharLimit).toBe(38);
    expect(xl.nameCharLimit).toBe(28);
    expect(xl.nameCharLimit).toBeLessThan(normal.nameCharLimit);
  });

  it("printNameCharLimit scales inversely with font size", () => {
    const normal = resolveGanttAppearance({ nameColumnWidth: "normal", activityFontSize: "normal", rowDensity: "normal", barLabel: "duration", colorPreset: "classic", weekendShading: false, fitToWindow: false }, false);
    const large = resolveGanttAppearance({ nameColumnWidth: "normal", activityFontSize: "large", rowDensity: "normal", barLabel: "duration", colorPreset: "classic", weekendShading: false, fitToWindow: false }, false);
    // Derived from the 170px column and the print font size (round(7 * f/12)):
    //   normal → font 7 → floor((170-8)/(7*0.6)) = floor(38.57) = 38
    //   large  → font 8 → floor((170-8)/(8*0.6)) = floor(33.75) = 33
    expect(normal.printNameCharLimit).toBe(38);
    expect(large.printNameCharLimit).toBe(33);
    expect(large.printNameCharLimit).toBeLessThan(normal.printNameCharLimit);
  });

  it("printNameCharLimit fills the column and never overflows it (v0.53.2 R1)", () => {
    // The derived limit must use the column better than the old fixed 26 (the bug this
    // fixed) yet keep `limit chars × glyph advance` within the usable text budget so a
    // right-anchored label cannot run off the SVG's left edge.
    const widths = ["narrow", "normal", "wide"] as const;
    const fonts = ["small", "normal", "large", "xl"] as const;
    for (const nameColumnWidth of widths) {
      for (const activityFontSize of fonts) {
        const ra = resolveGanttAppearance({ nameColumnWidth, activityFontSize, rowDensity: "normal", barLabel: "duration", colorPreset: "classic", weekendShading: false, fitToWindow: false }, false);
        const printFontSize = Math.round(7 * (ra.nameFontSize / 12));
        // No overflow: limit chars at the assumed advance fit the budget (printLeftMargin - 8).
        // +0.5 tolerance keeps the exact-integer-quotient combos (e.g. normal + xl) FP-stable.
        expect(ra.printNameCharLimit * printFontSize * 0.6).toBeLessThanOrEqual(ra.printLeftMargin - 8 + 0.5);
        // Uses the space: at least the old fixed floor for this width class.
        expect(ra.printNameCharLimit).toBeGreaterThanOrEqual(18);
      }
    }
    // The reported case: at normal width/font, a 27-char name ("Respond to Vendor
    // Questions") now fits in full where the old 26-char cap ellipsized it.
    const normal = resolveGanttAppearance({ nameColumnWidth: "normal", activityFontSize: "normal", rowDensity: "normal", barLabel: "duration", colorPreset: "classic", weekendShading: false, fitToWindow: false }, false);
    expect(normal.printNameCharLimit).toBeGreaterThanOrEqual("Respond to Vendor Questions".length);
  });

  it("narrow + XL font produces reduced char limits", () => {
    const ra = resolveGanttAppearance({ nameColumnWidth: "narrow", activityFontSize: "xl", rowDensity: "normal", barLabel: "duration", colorPreset: "classic", weekendShading: false, fitToWindow: false }, false);
    // narrow base: 24, XL scale: 24 * 12/16 = 18
    expect(ra.nameCharLimit).toBe(18);
    expect(ra.leftMargin).toBe(180);
  });

  // -- barLabelFontSize scaling -------------------------------------------------

  it("bar label font size scales with activity font size (normal density)", () => {
    const small = resolveGanttAppearance({ nameColumnWidth: "normal", activityFontSize: "small", rowDensity: "normal", barLabel: "duration", colorPreset: "classic", weekendShading: false, fitToWindow: false }, false);
    const normal = resolveGanttAppearance({ nameColumnWidth: "normal", activityFontSize: "normal", rowDensity: "normal", barLabel: "duration", colorPreset: "classic", weekendShading: false, fitToWindow: false }, false);
    const large = resolveGanttAppearance({ nameColumnWidth: "normal", activityFontSize: "large", rowDensity: "normal", barLabel: "duration", colorPreset: "classic", weekendShading: false, fitToWindow: false }, false);
    const xl = resolveGanttAppearance({ nameColumnWidth: "normal", activityFontSize: "xl", rowDensity: "normal", barLabel: "duration", colorPreset: "classic", weekendShading: false, fitToWindow: false }, false);
    // Small and Normal both get 10px minimum
    expect(small.barLabelFontSize).toBe(10);
    expect(normal.barLabelFontSize).toBe(10);
    // Large and XL scale up
    expect(large.barLabelFontSize).toBe(11);
    expect(xl.barLabelFontSize).toBe(13);
  });

  it("bar label font size is capped by bar height in compact density", () => {
    // Compact barHeight=16, so cap = 16-6 = 10
    const xl = resolveGanttAppearance({ nameColumnWidth: "normal", activityFontSize: "xl", rowDensity: "compact", barLabel: "duration", colorPreset: "classic", weekendShading: false, fitToWindow: false }, false);
    expect(xl.barLabelFontSize).toBe(10); // capped from 13 to 10
    const large = resolveGanttAppearance({ nameColumnWidth: "normal", activityFontSize: "large", rowDensity: "compact", barLabel: "duration", colorPreset: "classic", weekendShading: false, fitToWindow: false }, false);
    expect(large.barLabelFontSize).toBe(10); // capped from 11 to 10
  });

  it("print bar label font size scales with activity font size", () => {
    const small = resolveGanttAppearance({ nameColumnWidth: "normal", activityFontSize: "small", rowDensity: "normal", barLabel: "duration", colorPreset: "classic", weekendShading: false, fitToWindow: false }, false);
    const normal = resolveGanttAppearance({ nameColumnWidth: "normal", activityFontSize: "normal", rowDensity: "normal", barLabel: "duration", colorPreset: "classic", weekendShading: false, fitToWindow: false }, false);
    const large = resolveGanttAppearance({ nameColumnWidth: "normal", activityFontSize: "large", rowDensity: "normal", barLabel: "duration", colorPreset: "classic", weekendShading: false, fitToWindow: false }, false);
    const xl = resolveGanttAppearance({ nameColumnWidth: "normal", activityFontSize: "xl", rowDensity: "normal", barLabel: "duration", colorPreset: "classic", weekendShading: false, fitToWindow: false }, false);
    expect(small.printBarLabelFontSize).toBe(5);
    expect(normal.printBarLabelFontSize).toBe(6);
    expect(large.printBarLabelFontSize).toBe(7);
    expect(xl.printBarLabelFontSize).toBe(8);
  });

  it("print bar label font size is capped by print bar height in compact density", () => {
    // Compact printBarHeight=9, cap = 9-4 = 5
    const xl = resolveGanttAppearance({ nameColumnWidth: "normal", activityFontSize: "xl", rowDensity: "compact", barLabel: "duration", colorPreset: "classic", weekendShading: false, fitToWindow: false }, false);
    expect(xl.printBarLabelFontSize).toBe(5); // capped from 8 to 5
  });

  // -- rowGuideLines -------------------------------------------------------------

  it("rowGuideLines defaults to true when settings undefined", () => {
    const ra = resolveGanttAppearance(undefined, false);
    expect(ra.rowGuideLines).toBe(true);
  });

  it("rowGuideLines defaults to true when field missing from settings", () => {
    const ra = resolveGanttAppearance({ nameColumnWidth: "normal", activityFontSize: "normal", rowDensity: "normal", barLabel: "duration", colorPreset: "classic", weekendShading: false, fitToWindow: false }, false);
    expect(ra.rowGuideLines).toBe(true);
  });

  it("rowGuideLines passes through false value", () => {
    const ra = resolveGanttAppearance({ nameColumnWidth: "normal", activityFontSize: "normal", rowDensity: "normal", barLabel: "duration", colorPreset: "classic", weekendShading: false, fitToWindow: false, rowGuideLines: false }, false);
    expect(ra.rowGuideLines).toBe(false);
  });

  it("rowGuideLines passes through true value", () => {
    const ra = resolveGanttAppearance({ nameColumnWidth: "normal", activityFontSize: "normal", rowDensity: "normal", barLabel: "duration", colorPreset: "classic", weekendShading: false, fitToWindow: false, rowGuideLines: true }, false);
    expect(ra.rowGuideLines).toBe(true);
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

  it("closes trailing span when range ends on a non-work day", () => {
    // Fri Mar 6 to Sun Mar 8, 2026 — ends on Sunday (non-work day)
    const start = "2026-03-06";
    const end = "2026-03-08";
    const minTs = new Date(start + "T00:00:00").getTime();
    const maxTs = new Date(end + "T00:00:00").getTime();
    const rects = computeWeekendShadingRects(mockCalendar, start, end, minTs, maxTs - minTs, 600, 0);
    // Should have a rect for the trailing Sat-Sun span
    expect(rects.length).toBe(1);
    expect(rects[0]!.width).toBeGreaterThan(0);
  });

  it("excludes a forced-work-day date from the shading rects", () => {
    // All-week mask; Wed 2026-03-04 is a global holiday — the only non-work day
    // in the range. Forcing it removes the shading entirely.
    const start = "2026-03-02";
    const end = "2026-03-06";
    const minTs = new Date(start + "T00:00:00").getTime();
    const maxTs = new Date(end + "T00:00:00").getTime();
    const holiday = [
      { id: "g1", name: "Holiday", startDate: "2026-03-04", endDate: "2026-03-04" },
    ];
    const withoutOverride = buildWorkCalendar([0, 1, 2, 3, 4, 5, 6], holiday, []);
    const withOverride = buildWorkCalendar([0, 1, 2, 3, 4, 5, 6], holiday, [], {
      forcedWorkDays: ["2026-03-04"],
    });
    expect(
      computeWeekendShadingRects(withoutOverride, start, end, minTs, maxTs - minTs, 600, 0).length
    ).toBe(1);
    expect(
      computeWeekendShadingRects(withOverride, start, end, minTs, maxTs - minTs, 600, 0)
    ).toEqual([]);
  });
});

// -- suppressOverlappingTicks: targetX --------------------------------------
//
// Regression coverage for the "Always show Finish Target on Gantt when toggle
// is ON" fix (v0.45.1). With that change, the target line can land at the
// rightmost edge of the timeline — exactly where the last quarter/month tick
// naturally sits. Without targetX participating in tick suppression, the
// tick gridline and the dashed target line visually merge.

describe("suppressOverlappingTicks — targetX proximity", () => {
  // 365-day range, 1 px per day, leftMargin 0 → easy x = day-of-year arithmetic.
  const minTimestamp = new Date("2026-01-01T00:00:00").getTime();
  const maxTimestamp = new Date("2026-12-31T00:00:00").getTime();
  const dateRange = maxTimestamp - minTimestamp;
  const chartAreaWidth = 364; // 364 days between Jan 1 and Dec 31
  const leftMargin = 0;

  const baseParams = {
    minTimestamp,
    dateRange,
    chartAreaWidth,
    leftMargin,
    finishX: -9999,           // out of range so it can't interfere
    milestoneXPositions: [],
    todayX: null,
    todayProximityPx: 20,
    elementProximityPx: 40,
    minSpacingPx: 40,
  };

  it("suppresses a tick whose x falls within elementProximityPx of targetX", () => {
    // Two ticks: 2026-04-01 (Q2, ~90 px in) and 2026-04-15 (~104 px in).
    // Target at 2026-04-02 (~91 px) — within 40 px of both, but the first
    // tick is `isFirst` and always kept.
    const allTicks = [
      { x: "2026-04-01", label: "Q2" },
      { x: "2026-07-01", label: "Q3" },
    ];
    const targetXPos = dateToX("2026-07-02", minTimestamp, dateRange, chartAreaWidth, leftMargin);
    const out = suppressOverlappingTicks(allTicks, { ...baseParams, targetX: targetXPos });
    // Q2 stays (isFirst), Q3 is suppressed by targetX proximity.
    expect(out.find((t) => t.label === "Q2")).toBeDefined();
    expect(out.find((t) => t.label === "Q3")).toBeUndefined();
  });

  it("does not suppress ticks outside elementProximityPx of targetX", () => {
    const allTicks = [
      { x: "2026-04-01", label: "Q2" },
      { x: "2026-07-01", label: "Q3" },
    ];
    // Target far from both ticks — at 2026-10-15 (~287 px), >40 px from
    // either tick (Q3 is at ~181 px, distance ~106 px).
    const targetXPos = dateToX("2026-10-15", minTimestamp, dateRange, chartAreaWidth, leftMargin);
    const out = suppressOverlappingTicks(allTicks, { ...baseParams, targetX: targetXPos });
    expect(out.find((t) => t.label === "Q2")).toBeDefined();
    expect(out.find((t) => t.label === "Q3")).toBeDefined();
  });

  it("treats targetX = null as 'no target' (no suppression effect)", () => {
    const allTicks = [
      { x: "2026-04-01", label: "Q2" },
      { x: "2026-07-01", label: "Q3" },
    ];
    const out = suppressOverlappingTicks(allTicks, { ...baseParams, targetX: null });
    expect(out.length).toBe(2);
  });

  it("treats omitted targetX (undefined) as 'no target'", () => {
    const allTicks = [
      { x: "2026-04-01", label: "Q2" },
      { x: "2026-07-01", label: "Q3" },
    ];
    // targetX intentionally omitted from params
    const out = suppressOverlappingTicks(allTicks, baseParams);
    expect(out.length).toBe(2);
  });

  it("never suppresses the first tick even if it collides with targetX", () => {
    // First tick at 2026-01-01 (x=0), target at 2026-01-02 (x=1) — collision,
    // but isFirst guard wins.
    const allTicks = [
      { x: "2026-01-01", label: "Jan" },
      { x: "2026-04-01", label: "Q2" },
    ];
    const targetXPos = dateToX("2026-01-02", minTimestamp, dateRange, chartAreaWidth, leftMargin);
    const out = suppressOverlappingTicks(allTicks, { ...baseParams, targetX: targetXPos });
    expect(out.find((t) => t.label === "Jan")).toBeDefined();
  });
});

// -- computeTodayLine ---------------------------------------------------------

describe("computeTodayLine", () => {
  const START = "2026-04-06";
  const END = "2026-05-01";
  // A stand-in for each chart's own dateToX — linear over the span, so positions are
  // checkable without importing either chart's margin constants.
  const toX = (iso: string) => {
    const ms = new Date(iso + "T00:00:00").getTime() - new Date(START + "T00:00:00").getTime();
    return ms / (1000 * 60 * 60 * 24);
  };
  const RANGE = 1;

  it("reports today when it falls inside the span", () => {
    const r = computeTodayLine(new Date("2026-04-15T09:00:00"), START, END, RANGE, toX);
    expect(r.todayStr).toBe("2026-04-15");
    expect(r.todayInRange).toBe(true);
    expect(r.todayX).toBe(9);
  });

  it("includes both endpoints", () => {
    expect(computeTodayLine(new Date("2026-04-06T00:00:00"), START, END, RANGE, toX).todayInRange).toBe(true);
    expect(computeTodayLine(new Date("2026-05-01T23:59:59"), START, END, RANGE, toX).todayInRange).toBe(true);
  });

  it("excludes the days either side of the span", () => {
    expect(computeTodayLine(new Date("2026-04-05T23:59:59"), START, END, RANGE, toX).todayInRange).toBe(false);
    expect(computeTodayLine(new Date("2026-05-02T00:00:00"), START, END, RANGE, toX).todayInRange).toBe(false);
  });

  it("returns a null position when out of range, rather than an off-chart number", () => {
    expect(computeTodayLine(new Date("2027-01-01T09:00:00"), START, END, RANGE, toX).todayX).toBeNull();
  });

  it("returns a null position on a zero-width span, without calling toX", () => {
    // Guards the divide-by-zero path: a one-day project must not place a today marker.
    const spy = vi.fn(toX);
    const r = computeTodayLine(new Date("2026-04-06T09:00:00"), START, START, 0, spy);
    expect(r.todayInRange).toBe(false);
    expect(r.todayX).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("uses the `now` it is given, not the real clock", () => {
    // The whole point of the parameter. Both charts previously read `new Date()` inline,
    // each with its own copy.
    const r = computeTodayLine(new Date("2026-04-20T00:00:00"), START, END, RANGE, toX);
    expect(r.todayStr).toBe("2026-04-20");
  });

  it("formats in LOCAL time, so a late-evening render does not report tomorrow", () => {
    const r = computeTodayLine(new Date("2026-04-15T23:30:00"), START, END, RANGE, toX);
    expect(r.todayStr).toBe("2026-04-15");
  });
});

// -- computeActivityRowGeometry -----------------------------------------------
//
// ⚠️ These are also the STAGE-1 HALF of the two-stage perturbation check for §3.3's
// GanttChart:952 split. A mutation to this function must be proven to change ITS OUTPUT
// — observed directly, independently of any oracle — before "the oracle failed" means
// anything. Without that, an inert mutation and an undetected one produce identical
// output. See scripts/falsify-spec-gantt-oracle.mjs G7.

describe("computeActivityRowGeometry", () => {
  const base = {
    idx: 2,
    startDate: "2026-04-06",
    endDate: "2026-04-10",
    status: "planned",
    topMargin: 40,
    rowHeight: 18,
    barYOffset: 3,
    leftMargin: 260,
    minTimestamp: new Date("2026-04-06T00:00:00").getTime(),
    dateRange:
      new Date("2026-05-01T00:00:00").getTime() - new Date("2026-04-06T00:00:00").getTime(),
    chartAreaWidth: 600,
    barPlanned: "#planned",
    barComplete: "#complete",
    barInProgress: "#inprogress",
    viewMode: "schedule",
    hatchedDays: undefined as number | undefined,
    extEndDate: undefined as string | undefined,
  };

  it("places the row and bar from idx, margins and the date scale", () => {
    const g = computeActivityRowGeometry(base);
    expect(g.y).toBe(40 + 2 * 18);
    expect(g.barY).toBe(g.y + 3);
    expect(g.barX).toBe(260); // startDate === range start
    expect(g.barEndX).toBeGreaterThan(g.barX);
    expect(g.barWidth).toBe(g.barEndX - g.barX);
  });

  it("floors bar width at 4px so a zero-length activity stays visible", () => {
    const g = computeActivityRowGeometry({ ...base, endDate: base.startDate });
    expect(g.barEndX).toBe(g.barX);
    expect(g.barWidth).toBe(4);
  });

  it("selects the bar colour by status", () => {
    expect(computeActivityRowGeometry(base).barColor).toBe("#planned");
    expect(computeActivityRowGeometry({ ...base, status: "complete" }).barColor).toBe("#complete");
    expect(computeActivityRowGeometry({ ...base, status: "inProgress" }).barColor).toBe("#inprogress");
  });

  it("hatches only in uncertainty view, with positive hatched days AND an extended end", () => {
    const on = { ...base, viewMode: "uncertainty", hatchedDays: 3, extEndDate: "2026-04-15" };
    const g = computeActivityRowGeometry(on);
    expect(g.showHatch).toBe(true);
    expect(g.hatchEndX).toBeGreaterThan(g.barEndX);

    // Each of the three conditions is independently necessary.
    expect(computeActivityRowGeometry({ ...on, viewMode: "schedule" }).showHatch).toBe(false);
    expect(computeActivityRowGeometry({ ...on, hatchedDays: 0 }).showHatch).toBe(false);
    expect(computeActivityRowGeometry({ ...on, extEndDate: undefined }).showHatch).toBe(false);
  });

  it("collapses hatchEndX onto barEndX when not hatching", () => {
    const g = computeActivityRowGeometry(base);
    expect(g.showHatch).toBe(false);
    expect(g.hatchEndX).toBe(g.barEndX);
  });

  it("uses the in-progress colour for hatch strokes, else the planned colour", () => {
    expect(computeActivityRowGeometry(base).hatchStrokeColor).toBe("#planned");
    expect(computeActivityRowGeometry({ ...base, status: "inProgress" }).hatchStrokeColor).toBe("#inprogress");
    expect(computeActivityRowGeometry({ ...base, status: "complete" }).hatchStrokeColor).toBe("#planned");
  });
});

// -- barLabelText -------------------------------------------------------------

describe("barLabelText", () => {
  const sa = { duration: 5, endDate: "2026-08-17" };

  it("renders the duration with a d suffix", () => {
    expect(barLabelText(sa, "duration", () => "UNUSED")).toBe("5d");
  });

  it("renders nothing at all in none mode", () => {
    expect(barLabelText(sa, "none", () => "UNUSED")).toBeNull();
  });

  it("formats the END date — not the start — through the injected formatter", () => {
    const seen: string[] = [];
    const label = barLabelText(sa, "dates", (iso) => {
      seen.push(iso);
      return `SHORT(${iso})`;
    });
    expect(seen).toEqual(["2026-08-17"]);
    expect(label).toBe("SHORT(2026-08-17)");
  });

  it("does not call the formatter in the other two modes", () => {
    // Cheap, but it is the thing that would silently break if the mode checks were
    // reordered — "duration" would still look right while doing needless work.
    const fmt = vi.fn(() => "x");
    barLabelText(sa, "duration", fmt);
    barLabelText(sa, "none", fmt);
    expect(fmt).not.toHaveBeenCalled();
  });
});

/**
 * The width claim, pinned.
 *
 * Dropping the year is not cosmetic — it is the whole reason short bars show a date at
 * all. The fit gate in GanttActivityRow / PrintGanttChart is
 * `label.length * fontSize * 0.6 + pad`, derived from the string, so the guard here is on
 * LENGTH. If someone restores the year to `formatDateShort`, every one of these fails
 * rather than the regression being invisible until a user notices bars went blank again.
 */
describe("bar-label dates are short enough to fit narrow bars", () => {
  const FORMATS: DateFormatPreference[] = ["MM/DD/YYYY", "DD/MM/YYYY", "YYYY/MM/DD"];
  const FONT = 10; // default barLabelFontSize at small/normal density
  const PAD = 8; // interactive chart padding
  const minBarWidth = (label: string) => label.length * FONT * 0.6 + PAD;

  it("every full date is exactly 10 characters — the thing being fixed", () => {
    for (const f of FORMATS) {
      expect(formatDateDisplay("2026-08-17", f)).toHaveLength(10);
    }
  });

  it("every short date is strictly shorter than its full form", () => {
    for (const f of FORMATS) {
      const short = formatDateShort("2026-08-17", f);
      const full = formatDateDisplay("2026-08-17", f);
      expect(short.length).toBeLessThan(full.length);
    }
  });

  it("no short date carries a 4-digit year", () => {
    for (const f of FORMATS) {
      expect(formatDateShort("2026-08-17", f)).not.toMatch(/\d{4}/);
    }
  });

  it("cuts the bar width a date needs by at least a third", () => {
    for (const f of FORMATS) {
      const before = minBarWidth(formatDateDisplay("2026-08-17", f));
      const after = minBarWidth(formatDateShort("2026-08-17", f));
      expect(before).toBe(68);
      expect(after).toBeLessThanOrEqual(before * 0.67);
    }
  });

  it("keeps the month a word, so a shared chart is not misread", () => {
    // "5/8" is ambiguous to any reader who did not set the preference; "May 8" is not.
    // Both single-digit numbers, the worst case, must still produce an abbreviation.
    expect(formatDateShort("2026-05-08", "MM/DD/YYYY")).toBe("May 8");
    expect(formatDateShort("2026-05-08", "DD/MM/YYYY")).toBe("8 May");
    expect(formatDateShort("2026-05-08", "YYYY/MM/DD")).toBe("May 8");
  });
});

describe("computeBarHitRect", () => {
  /**
   * ⚠️ EVERY CASE HERE IS PAIRED: a bar that must NOT widen beside one that must. A rule
   * that widened everything, and a rule that widened nothing, would each pass a one-sided
   * suite — and "widen everything" is the specific mistake that would make the hatched
   * uncertainty extension clickable, which the owner ruled out.
   */
  it("leaves a bar at or above the minimum exactly alone", () => {
    expect(computeBarHitRect(100, 14, 14)).toEqual({ x: 100, width: 14 });
    expect(computeBarHitRect(100, 40, 14)).toEqual({ x: 100, width: 40 });
    expect(computeBarHitRect(100, 180.25, 14)).toEqual({ x: 100, width: 180.25 });
  });

  it("widens a narrower bar to the minimum, centred", () => {
    // The 4px floor from computeActivityRowGeometry — a 1-day activity.
    expect(computeBarHitRect(100, 4, 14)).toEqual({ x: 95, width: 14 });
    // Just under the boundary: 1px short widens by 0.5px each side.
    expect(computeBarHitRect(100, 13, 14)).toEqual({ x: 99.5, width: 14 });
  });

  it("keeps the widened zone centred on the bar's own centre", () => {
    // The affordance must not drift off the thing it is an affordance for.
    for (const w of [1, 4, 8, 13]) {
      const hit = computeBarHitRect(200, w, 14);
      expect(hit.x + hit.width / 2).toBeCloseTo(200 + w / 2, 10);
    }
  });

  it("never returns a target narrower than the minimum", () => {
    for (const w of [0, 0.5, 4, 13.99, 14, 14.01, 500]) {
      expect(computeBarHitRect(0, w, 14).width).toBeGreaterThanOrEqual(14);
    }
  });

  it("is exercised with the real constant, not just an inline 14", () => {
    // Guards against the production call site and this suite drifting apart.
    expect(MIN_BAR_HIT_WIDTH).toBe(14);
    expect(computeBarHitRect(0, 4, MIN_BAR_HIT_WIDTH).width).toBe(MIN_BAR_HIT_WIDTH);
    expect(computeBarHitRect(0, 40, MIN_BAR_HIT_WIDTH).width).toBe(40);
  });
});

describe("buildActivityTooltip", () => {
  const base = {
    name: "Build",
    activityId: "a2",
    activityIndexMap: null as Map<string, number> | null,
    startDate: "2026-04-13",
    endDate: "2026-04-24",
    duration: 10,
    totalFloat: undefined as number | undefined,
    freeFloat: undefined as number | undefined,
    dependencyMode: false,
    formatDate: (iso: string) => iso,
  };

  it("uses the single-line form outside dependency mode", () => {
    expect(buildActivityTooltip(base)).toBe("Build: 2026-04-13 – 2026-04-24 (10d)");
  });

  it("uses the single-line form in dependency mode when float is absent", () => {
    // ⚠️ Both halves of the original guard: `dependencyMode && totalFloat != null`.
    // Testing only the mode would let a rule keyed on the mode alone pass.
    expect(buildActivityTooltip({ ...base, dependencyMode: true })).toBe(
      "Build: 2026-04-13 – 2026-04-24 (10d)",
    );
  });

  it("reports a zero total float as the critical path", () => {
    expect(buildActivityTooltip({ ...base, dependencyMode: true, totalFloat: 0 })).toBe(
      "Build\n2026-04-13 – 2026-04-24 (10d)\nTotal Float: Critical path",
    );
  });

  it("reports a non-zero total float in days", () => {
    expect(buildActivityTooltip({ ...base, dependencyMode: true, totalFloat: 3 })).toBe(
      "Build\n2026-04-13 – 2026-04-24 (10d)\nTotal Float: 3d",
    );
  });

  it("adds free float only when it is strictly less than total float", () => {
    const withFloats = (freeFloat: number) =>
      buildActivityTooltip({ ...base, dependencyMode: true, totalFloat: 3, freeFloat });
    expect(withFloats(1)).toContain("\nFree Float: 1d");
    expect(withFloats(3)).not.toContain("Free Float"); // equal — omitted
    expect(withFloats(5)).not.toContain("Free Float"); // greater — omitted
  });

  it("prefixes the activity number when an index map is supplied", () => {
    const map = new Map([["a2", 7]]);
    expect(buildActivityTooltip({ ...base, activityIndexMap: map })).toBe(
      "#7 Build: 2026-04-13 – 2026-04-24 (10d)",
    );
  });

  it("reproduces the pre-existing `#undefined` behaviour on a lookup miss", () => {
    // ⚠️ PINNED AS-IS, NOT ENDORSED. This is what the inline expression in
    // GanttActivityRow did before extraction. Recording it means a future decision to
    // fix it is a visible, deliberate edit to this expectation rather than an
    // accidental behaviour change riding along with an unrelated refactor.
    const map = new Map([["someone-else", 7]]);
    expect(buildActivityTooltip({ ...base, activityIndexMap: map })).toBe(
      "#undefined Build: 2026-04-13 – 2026-04-24 (10d)",
    );
  });

  it("routes dates through the supplied formatter", () => {
    const out = buildActivityTooltip({ ...base, formatDate: (iso) => `<${iso}>` });
    expect(out).toBe("Build: <2026-04-13> – <2026-04-24> (10d)");
  });
});
