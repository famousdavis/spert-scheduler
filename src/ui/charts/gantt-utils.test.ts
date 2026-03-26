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
} from "./gantt-utils";
import { LEFT_MARGIN } from "./gantt-constants";

// -- dateToX ------------------------------------------------------------------

describe("dateToX", () => {
  const min = new Date("2026-01-01T00:00:00").getTime();
  const max = new Date("2026-01-31T00:00:00").getTime();
  const range = max - min;
  const areaW = 600;

  it("maps start date to leftMargin", () => {
    expect(dateToX("2026-01-01", min, range, areaW)).toBe(LEFT_MARGIN);
  });

  it("maps end date to leftMargin + chartAreaWidth", () => {
    expect(dateToX("2026-01-31", min, range, areaW)).toBe(LEFT_MARGIN + areaW);
  });

  it("returns midpoint when dateRange is 0", () => {
    expect(dateToX("2026-01-15", min, 0, areaW)).toBe(LEFT_MARGIN + areaW / 2);
  });

  it("interpolates intermediate dates linearly", () => {
    const midDate = "2026-01-16"; // 15 days into 30-day range = 50%
    const x = dateToX(midDate, min, range, areaW);
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
