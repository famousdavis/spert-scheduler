// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { createRef } from "react";
import type { RefObject } from "react";

import { useGanttLayout } from "./use-gantt-layout";
import type { Activity, ActivityBand, Milestone } from "@domain/models/types";

/**
 * At 0% coverage before charter §3.2, and the largest of the fifteen: 217 lines at
 * cognitive complexity **15** — one point under the threshold, so `npm run lint` would
 * never have mentioned it. It is the clearest single example of the review's finding that
 * the lint-visible ten were not the population that mattered.
 *
 * ⚠️ **This hook reads `new Date()` directly** (`todayStr`), so `todayInRange` / `todayX`
 * depend on the wall clock. Time is frozen for those tests; without that they would pass
 * or fail depending on the day they ran. That is a real property of the hook, not a
 * testing inconvenience — the Gantt's today-line moves under the component too.
 *
 * Constants, read from gantt-constants.ts rather than re-derived:
 *   RIGHT_MARGIN 40 · TOP_MARGIN 32 · MIN_CHART_WIDTH 900 · PROJECT_NAME_HEIGHT 28
 */

const RIGHT_MARGIN = 40;
const TOP_MARGIN = 32;
const MIN_CHART_WIDTH = 900;
const PROJECT_NAME_HEIGHT = 28;

/**
 * jsdom has no ResizeObserver. A factory rather than a class, so the instance can be
 * captured without aliasing `this` in a constructor (`@typescript-eslint/no-this-alias`).
 */
interface StubResizeObserver {
  observed: Element[];
  disconnected: boolean;
  observe(el: Element): void;
  unobserve(): void;
  disconnect(): void;
  /** Drive a resize through the observed callback. */
  emit(width: number): void;
}

let lastObserver: StubResizeObserver | null = null;

function createStubResizeObserver(cb: ResizeObserverCallback): StubResizeObserver {
  const stub: StubResizeObserver = {
    observed: [],
    disconnected: false,
    observe(el) {
      stub.observed.push(el);
    },
    unobserve() {},
    disconnect() {
      stub.disconnected = true;
    },
    emit(width) {
      cb(
        [{ contentRect: { width } } as unknown as ResizeObserverEntry],
        stub as unknown as ResizeObserver,
      );
    },
  };
  return stub;
}

const activity = (id: string): Activity =>
  ({
    id,
    name: `Activity ${id}`,
    min: 3,
    mostLikely: 5,
    max: 10,
    confidenceLevel: "mediumConfidence",
    distributionType: "normal",
    status: "planned",
  }) as Activity;

const ROW_HEIGHT = 28;
const BAR_HEIGHT = 16;
const LEFT_MARGIN = 200;

const baseArgs = {
  orderedActivities: [activity("a1"), activity("a2")],
  bands: [] as ActivityBand[],
  projectStartDate: "2026-04-06",
  furthestDate: "2026-05-06", // 30 calendar days
  bufferedEndDate: null as string | null,
  projectEndDate: "2026-04-30",
  showBuffer: false,
  milestones: [] as Milestone[],
  showProjectName: false,
  projectName: undefined as string | undefined,
  svgContainerRef: undefined as RefObject<HTMLDivElement | null> | undefined,
  leftMargin: LEFT_MARGIN,
  rowHeight: ROW_HEIGHT,
  barHeight: BAR_HEIGHT,
  fitToWindow: undefined as boolean | undefined,
  timelineDensityPx: undefined as number | undefined,
  showTargetOnGantt: undefined as boolean | undefined,
  targetFinishDate: undefined as string | null | undefined,
};

const setup = (overrides: Partial<typeof baseArgs> = {}) =>
  renderHook(() => useGanttLayout({ ...baseArgs, ...overrides })).result;

beforeEach(() => {
  lastObserver = null;
  vi.stubGlobal("ResizeObserver", function (cb: ResizeObserverCallback) {
    lastObserver = createStubResizeObserver(cb);
    return lastObserver;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("useGanttLayout", () => {
  describe("vertical layout", () => {
    it("counts one row per render item", () => {
      expect(setup().current.totalRows).toBe(2);
    });

    it("adds a row for the buffer bar when showBuffer is on", () => {
      expect(setup({ showBuffer: true }).current.totalRows).toBe(3);
    });

    it("uses the base top margin with no milestones and no project name", () => {
      expect(setup().current.topMargin).toBe(TOP_MARGIN);
    });

    it("adds 26px of top margin when milestones are present", () => {
      const milestones = [{ id: "m1", name: "M1", targetDate: "2026-04-20" }];
      expect(setup({ milestones }).current.topMargin).toBe(TOP_MARGIN + 26);
    });

    it("adds the project-name band only when BOTH the flag and a name are given", () => {
      expect(setup({ showProjectName: true, projectName: "Apollo" }).current.topMargin).toBe(
        TOP_MARGIN + PROJECT_NAME_HEIGHT,
      );
      // Flag without a name, and name without the flag, both leave it alone.
      expect(setup({ showProjectName: true }).current.topMargin).toBe(TOP_MARGIN);
      expect(setup({ projectName: "Apollo" }).current.topMargin).toBe(TOP_MARGIN);
    });

    it("derives chart height from margin, rows and a 20px foot", () => {
      expect(setup().current.chartHeight).toBe(TOP_MARGIN + 2 * ROW_HEIGHT + 20);
    });

    it("centres the bar within its row", () => {
      expect(setup().current.barYOffset).toBe((ROW_HEIGHT - BAR_HEIGHT) / 2);
    });
  });

  describe("horizontal sizing", () => {
    it("falls back to the minimum chart width when nothing has measured the container", () => {
      const r = setup().current;
      expect(r.chartWidth).toBe(MIN_CHART_WIDTH);
      expect(r.chartAreaWidth).toBe(MIN_CHART_WIDTH - LEFT_MARGIN - RIGHT_MARGIN);
    });

    it("widens past the container to hold a 2px/day floor on a long timeline", () => {
      // 4000 calendar days over 660px of chart area is well under 2px/day, so the chart
      // grows and the view scrolls instead of compressing.
      const r = setup({ furthestDate: "2037-04-06" }).current;
      expect(r.chartWidth).toBeGreaterThan(MIN_CHART_WIDTH);
    });

    it("fitToWindow overrides the floor and never exceeds the container", () => {
      const r = setup({ furthestDate: "2037-04-06", fitToWindow: true }).current;
      expect(r.chartWidth).toBe(MIN_CHART_WIDTH);
    });
  });

  describe("container measurement", () => {
    it("does nothing without a ref, leaving the fallback width in place", () => {
      expect(setup().current.chartWidth).toBe(MIN_CHART_WIDTH);
      expect(lastObserver).toBeNull();
    });

    it("reads the initial clientWidth and observes the element", () => {
      const el = document.createElement("div");
      Object.defineProperty(el, "clientWidth", { value: 1200, configurable: true });
      const ref = createRef<HTMLDivElement>();
      (ref as { current: HTMLDivElement }).current = el;

      const r = setup({ svgContainerRef: ref }).current;
      expect(r.chartWidth).toBe(1200);
      expect(lastObserver!.observed).toEqual([el]);
    });

    it("re-measures when the observer fires", () => {
      const el = document.createElement("div");
      Object.defineProperty(el, "clientWidth", { value: 1200, configurable: true });
      const ref = createRef<HTMLDivElement>();
      (ref as { current: HTMLDivElement }).current = el;

      const result = setup({ svgContainerRef: ref });
      act(() => lastObserver!.emit(1500));
      expect(result.current.chartWidth).toBe(1500);
    });

    it("disconnects the observer on unmount", () => {
      const el = document.createElement("div");
      Object.defineProperty(el, "clientWidth", { value: 1200, configurable: true });
      const ref = createRef<HTMLDivElement>();
      (ref as { current: HTMLDivElement }).current = el;

      const { unmount } = renderHook(() =>
        useGanttLayout({ ...baseArgs, svgContainerRef: ref }),
      );
      const observer = lastObserver!;
      expect(observer.disconnected).toBe(false);
      unmount();
      expect(observer.disconnected).toBe(true);
    });
  });

  describe("finish line", () => {
    it("prefers the buffered end date over the project end date", () => {
      expect(setup({ bufferedEndDate: "2026-05-01" }).current.finishDate).toBe("2026-05-01");
    });

    it("falls back to the project end date when there is no buffer", () => {
      expect(setup().current.finishDate).toBe("2026-04-30");
    });

    it("places the finish line inside the chart area", () => {
      const r = setup().current;
      expect(r.finishX).toBeGreaterThan(LEFT_MARGIN);
      expect(r.finishX).toBeLessThanOrEqual(LEFT_MARGIN + r.chartAreaWidth);
    });
  });

  describe("a zero-length date range", () => {
    // Start and finish on the same day — a one-day project, or a project whose furthest
    // date has not yet moved off the start.
    const sameDay = { projectStartDate: "2026-04-06", furthestDate: "2026-04-06" };

    it("reports a zero range and pins finishX at 0 rather than dividing by it", () => {
      const r = setup(sameDay).current;
      expect(r.dateRange).toBe(0);
      expect(r.finishX).toBe(0);
    });

    it("returns no milestone positions", () => {
      const r = setup({
        ...sameDay,
        milestones: [{ id: "m1", name: "M1", targetDate: "2026-04-06" }],
      }).current;
      expect(r.milestoneXPositions).toEqual([]);
    });

    it("never puts today in range", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-04-06T12:00:00"));
      const r = setup(sameDay).current;
      expect(r.todayInRange).toBe(false);
      expect(r.todayX).toBeNull();
    });
  });

  describe("today line (time frozen)", () => {
    it("is in range and positioned when today falls inside the timeline", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-04-20T09:00:00"));
      const r = setup().current;
      expect(r.todayStr).toBe("2026-04-20");
      expect(r.todayInRange).toBe(true);
      expect(r.todayX).toBeGreaterThan(LEFT_MARGIN);
    });

    it("is out of range before the project starts", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-03-01T09:00:00"));
      const r = setup().current;
      expect(r.todayInRange).toBe(false);
      expect(r.todayX).toBeNull();
    });

    it("is out of range after the furthest date", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-01T09:00:00"));
      const r = setup().current;
      expect(r.todayInRange).toBe(false);
      expect(r.todayX).toBeNull();
    });

    it("counts the boundary days as in range", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-04-06T00:00:00"));
      expect(setup().current.todayInRange).toBe(true);
      vi.setSystemTime(new Date("2026-05-06T23:59:59"));
      expect(setup().current.todayInRange).toBe(true);
    });
  });

  describe("milestone positions", () => {
    it("returns one x per milestone, in order", () => {
      const milestones = [
        { id: "m1", name: "M1", targetDate: "2026-04-16" },
        { id: "m2", name: "M2", targetDate: "2026-04-26" },
      ];
      const xs = setup({ milestones }).current.milestoneXPositions;
      expect(xs).toHaveLength(2);
      expect(xs[1]!).toBeGreaterThan(xs[0]!);
    });
  });

  describe("ticks", () => {
    it("generates ticks and suppresses a subset of them", () => {
      const r = setup().current;
      expect(r.allTicks.length).toBeGreaterThan(0);
      expect(r.ticks.length).toBeLessThanOrEqual(r.allTicks.length);
    });

    it("picks a coarser tick level as the density preference widens, past 540 days", () => {
      const long = { furthestDate: "2031-04-06" }; // ~1826 days
      const dense = setup({ ...long, timelineDensityPx: 40 }).current.allTicks.length;
      const normal = setup({ ...long, timelineDensityPx: 70 }).current.allTicks.length;
      const sparse = setup({ ...long, timelineDensityPx: 100 }).current.allTicks.length;

      // monthly > quarterly > semiannual
      expect(dense).toBeGreaterThan(normal);
      expect(normal).toBeGreaterThan(sparse);
    });

    it("ignores the density preference under 540 days, where generateTicks auto-selects", () => {
      const dense = setup({ timelineDensityPx: 40 }).current.allTicks;
      const sparse = setup({ timelineDensityPx: 100 }).current.allTicks;
      expect(dense).toEqual(sparse);
    });
  });

  describe("render items and row index", () => {
    it("returns one render item per activity when there are no bands", () => {
      const r = setup().current;
      expect(r.renderItems).toHaveLength(2);
      expect(r.renderItems.every((i) => i.kind === "activity")).toBe(true);
    });

    it("maps each activity to a slot index that skips band rows", () => {
      // ⚠️ The first draft of this test used `afterActivityId`, which is not a field on
      // ActivityBand — the real one is `insertBeforeActivityId`. `partitionBands` read
      // `undefined`, treated the band as TRAILING, and the assertions below still passed
      // because a band after both activities also leaves a1/a2 at slots 0 and 1. The test
      // was green while exercising the opposite of its name. `tsc` caught it; vitest did not.
      const bands: ActivityBand[] = [
        { id: "b1", name: "Phase 1", insertBeforeActivityId: "a2" },
      ];
      const r = setup({ bands }).current;

      // Render order is now [a1, band, a2].
      expect(r.renderItems.map((i) => i.kind)).toEqual(["activity", "band", "activity"]);

      // ⚠️ The band DOES advance the index: a2 is slot 2, not 1. CLAUDE.md describes this
      // map as "slot-aware (skips band rows)", which reads as though bands were skipped
      // over — they are not. `buildActivitySlotMap` excludes bands as KEYS while counting
      // them as POSITIONS, so the value is the activity's true render-list row. That is
      // the behaviour the Gantt needs: dependency arrows derive Y from this index, and a
      // map that skipped band rows would aim them at the wrong rows.
      expect(r.rowIndex.get("a1")).toBe(0);
      expect(r.rowIndex.get("a2")).toBe(2);
      expect(r.rowIndex.has("b1")).toBe(false);
    });

    it("places a band with a null anchor after every activity", () => {
      const bands: ActivityBand[] = [
        { id: "b1", name: "Wrap-up", insertBeforeActivityId: null },
      ];
      const r = setup({ bands }).current;
      expect(r.renderItems.map((i) => i.kind)).toEqual(["activity", "activity", "band"]);
    });
  });
});
