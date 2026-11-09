// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, fireEvent, act } from "@testing-library/react";

import { GanttChart } from "./GanttChart";
import { PrintGanttChart } from "./PrintGanttChart";
import { COLORS, resolveGanttAppearance } from "./gantt-constants";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";
import { DEFAULT_GANTT_APPEARANCE, DEFAULT_USER_PREFERENCES } from "@domain/models/types";
import type { Activity, ActivityBand, ActivityDependency, ScheduledActivity } from "@domain/models/types";

/**
 * WI-172: a Section stands out on both Gantt charts — its row tinted, and once it holds activities a
 * summary bar on that row from their first start to their last finish (the SOLID bars, in both views),
 * a legend entry while such a bar is drawn, the bar's hover text, and a halo behind every lag label.
 * Driven through the real `GanttChart` and `PrintGanttChart`.
 */

const HOVER_DELAY_MS = 1500; // GanttChart's hover-intent delay before a tooltip shows
const LEGEND = "Section: first start to last finish";

const activity = (id: string, name: string, min: number, mostLikely: number, max: number): Activity => ({
  id, name, min, mostLikely, max, confidenceLevel: "mediumConfidence", distributionType: "normal", status: "planned",
});
const ACTIVITIES = [
  activity("a1", "Design", 4, 5, 12),
  activity("a2", "Build", 3, 5, 15),
  activity("a3", "Sign-off", 1, 1, 1),
];
const SCHEDULED: ScheduledActivity[] = [
  { activityId: "a1", name: "Design", duration: 5, startDate: "2026-04-06", endDate: "2026-04-10", isActual: false },
  { activityId: "a2", name: "Build", duration: 7, startDate: "2026-04-16", endDate: "2026-04-24", isActual: false },
  // A one-day activity: its solid bar is drawn at the chart's minimum width, past its own date.
  { activityId: "a3", name: "Sign-off", duration: 1, startDate: "2026-04-27", endDate: "2026-04-27", isActual: false },
];
const DEPENDENCIES: ActivityDependency[] = [
  { fromActivityId: "a1", toActivityId: "a2", type: "FS", lagDays: 3 },
  { fromActivityId: "a2", toActivityId: "a3", type: "FS", lagDays: 0 },
];
const PHASE: ActivityBand = { id: "s-phase", name: "Phase A", insertBeforeActivityId: "a1", color: "#94a3b8" };
const EMPTY: ActivityBand = { id: "s-empty", name: "Nothing yet", insertBeforeActivityId: "a3", color: "#86b49a" };
/** Unnamed, and with no colour. */
const PLAIN: ActivityBand = { id: "s-plain", name: " ", insertBeforeActivityId: "a3" };
const BANDS = [PHASE, EMPTY, PLAIN];

const SHARED = {
  activities: ACTIVITIES,
  scheduledActivities: SCHEDULED,
  projectStartDate: "2026-04-06",
  projectEndDate: "2026-04-27",
  buffer: null,
  dependencies: DEPENDENCIES,
  dependencyMode: true,
  activityTarget: 0.5,
  projectTarget: 0.95,
};

function screen(opts: { bands?: ActivityBand[]; dark?: boolean; uncertainty?: boolean } = {}) {
  if (opts.dark) document.documentElement.classList.add("dark");
  usePreferencesStore.setState({
    preferences: {
      ...DEFAULT_USER_PREFERENCES, dateFormat: "DD/MM/YYYY",
      ganttViewMode: opts.uncertainty ? "uncertainty" : "deterministic",
    },
  });
  return render(
    <GanttChart {...SHARED} bands={opts.bands ?? BANDS} svgContainerRef={{ current: null }}
      resolvedAppearance={resolveGanttAppearance(DEFAULT_GANTT_APPEARANCE, !!opts.dark)}
      appearancePanelOpen={false} onToggleAppearancePanel={() => {}} />,
  ).container;
}

function paper(bands: ActivityBand[] = BANDS) {
  return render(
    <PrintGanttChart {...SHARED} bands={bands} bufferedEndDate={null}
      formatDate={(iso: string) => iso} formatDateShort={(iso: string) => iso} />,
  ).container;
}

const num = (el: Element, a: string) => Number(el.getAttribute(a));
const chartSvg = (c: HTMLElement) => c.querySelector("svg[data-gantt-chart]")!;
const tintOf = (c: HTMLElement, b: ActivityBand) => chartSvg(c).querySelector(`rect[data-section-tint="${b.id}"]`);
const barOf = (c: HTMLElement, b: ActivityBand) => chartSvg(c).querySelector(`path[data-section-bar="${b.id}"]`);

/** The summary bar's x extent and top, read from its path (`M x1,top H x2 …`). */
function barGeometry(bar: Element): { x1: number; x2: number; top: number } {
  const m = /^M([\d.]+),([\d.]+) H([\d.]+) /.exec(bar.getAttribute("d") ?? "");
  if (!m) throw new Error(`unexpected path ${bar.getAttribute("d")}`);
  return { x1: Number(m[1]), top: Number(m[2]), x2: Number(m[3]) };
}

/** Every activity here is Planned, so every solid bar is drawn in the Planned colour (light: both views and print). */
const PLANNED = resolveGanttAppearance(DEFAULT_GANTT_APPEARANCE, false).barPlanned;

/**
 * The solid bars' x extent over the rows `rows` (row 0 = the tint's own row): every rect in the Planned
 * colour drawn inside one of those rows, below its top edge and shorter than it — not a row's hover rect,
 * a shading rect, a hit target, a hatched tail, or a critical or terminal stripe (the printed terminal
 * stripe is 3 wide and sticks out of a 2-wide bar).
 */
function solidExtent(c: HTMLElement, tint: Element, rows: number[]): { x1: number; x2: number } {
  const y0 = num(tint, "y");
  const h = num(tint, "height");
  const rects = Array.from(chartSvg(c).querySelectorAll("rect")).filter((r) => {
    if (r.hasAttribute("data-hit-layer") || r.getAttribute("fill") !== PLANNED) return false;
    const y = num(r, "y");
    return num(r, "height") < h && rows.some((row) => y > y0 + row * h && y < y0 + (row + 1) * h);
  });
  expect(rects.length, "no solid bar found").toBeGreaterThan(0);
  return {
    x1: Math.min(...rects.map((r) => num(r, "x"))),
    x2: Math.max(...rects.map((r) => num(r, "x") + num(r, "width"))),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-04-15T12:00:00"));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.documentElement.classList.remove("dark");
  usePreferencesStore.setState({ preferences: { ...DEFAULT_USER_PREFERENCES } });
});

describe("each Section's row: the tint, and the bar once it holds activities (WI-172)", () => {
  it.each([
    ["the Gantt", () => screen()],
    ["the printed Gantt", () => paper()],
  ])("%s: a tint on every Section's row, under the bar on the same row; no bar on an empty Section", (_, draw) => {
    const c = draw();
    const rowOf = (b: ActivityBand) => {
      const t = tintOf(c, b)!;
      return { y: num(t, "y"), h: num(t, "height"), x: num(t, "x"), w: num(t, "width") };
    };
    const [phase, empty, plain] = [rowOf(PHASE), rowOf(EMPTY), rowOf(PLAIN)];
    // Render order: Phase A (row 0), Design, Build, Nothing yet (row 3), the unnamed one (row 4), Sign-off.
    expect(empty.y - phase.y).toBe(3 * phase.h);
    expect(plain.y - phase.y).toBe(4 * phase.h);
    // Across the name column and the chart.
    expect(phase.x).toBe(0);
    expect(phase.w).toBe(num(chartSvg(c), "width"));
    for (const [b, row] of [[PHASE, phase], [PLAIN, plain]] as const) {
      const { top } = barGeometry(barOf(c, b)!);
      expect(top).toBeGreaterThan(row.y);
      expect(top).toBeLessThan(row.y + row.h);
    }
    expect(barOf(c, EMPTY)).toBeNull();
    // The faint rule is gone: no line in a Section's row group.
    const name = Array.from(chartSvg(c).querySelectorAll("text")).find((t) => t.textContent === "Phase A");
    expect(name?.parentElement?.querySelector("line")).toBeNull();
    // The tints are the first thing drawn in the chart, after its <defs>: under every other layer.
    const drawn = Array.from(chartSvg(c).children).filter((k) => k.tagName !== "defs");
    expect(drawn.slice(0, 3).map((k) => k.getAttribute("data-section-tint"))).toEqual([PHASE.id, EMPTY.id, PLAIN.id]);
  });
});

describe("the bar runs from the group's first solid-bar start to its last solid-bar end (WI-172)", () => {
  it.each([
    ["Deterministic", () => screen()],
    ["With Uncertainty", () => screen({ uncertainty: true })],
    ["the printed Gantt", () => paper()],
  ])("%s", (view, draw) => {
    const c = draw();
    // Phase A: Design and Build (rows 1–2). The unnamed Section: Sign-off (row 1 below it), a one-day bar.
    expect(barGeometry(barOf(c, PHASE)!)).toMatchObject(solidExtent(c, tintOf(c, PHASE)!, [1, 2]));
    expect(barGeometry(barOf(c, PLAIN)!)).toMatchObject(solidExtent(c, tintOf(c, PLAIN)!, [1]));
    if (view === "With Uncertainty") {
      // The hatched tails are drawn, and run past the bar: it spans the solid bars, not the tails.
      const tails = Array.from(chartSvg(c).querySelectorAll('rect[fill^="url(#hatch-"]'));
      expect(tails.length).toBeGreaterThan(0);
      const tailEnd = Math.max(...tails.map((r) => num(r, "x") + num(r, "width")));
      expect(tailEnd).toBeGreaterThan(barGeometry(barOf(c, PHASE)!).x2);
    }
  });
});

describe("the legend names the bar, only while one is drawn (WI-172)", () => {
  it.each([
    ["the Gantt", (b: ActivityBand[]) => screen({ bands: b })],
    ["the printed Gantt", (b: ActivityBand[]) => paper(b)],
  ])("%s", (_, draw) => {
    expect(draw(BANDS).textContent).toContain(LEGEND);
    cleanup();
    // An empty Section alone has a tint and no bar, so no entry; nor does a chart with no Section.
    const onlyEmpty = draw([{ ...EMPTY, insertBeforeActivityId: "missing" }]);
    expect(tintOf(onlyEmpty, EMPTY)).not.toBeNull();
    expect(onlyEmpty.textContent).not.toContain(LEGEND);
    cleanup();
    expect(draw([]).textContent).not.toContain(LEGEND);
  });
});

describe("hovering the bar shows the Section's name, dates and number of activities (WI-172)", () => {
  it("after the hover delay, in the user's Date Format; an unnamed Section by its placeholder", () => {
    const c = screen();
    fireEvent.mouseEnter(barOf(c, PHASE)!, { clientX: 10, clientY: 10 });
    expect(c.textContent).not.toContain("Phase A: ");
    act(() => { vi.advanceTimersByTime(HOVER_DELAY_MS); });
    expect(c.textContent).toContain("Phase A: 06/04/2026 – 24/04/2026 (2 activities)");
    fireEvent.mouseLeave(barOf(c, PHASE)!);
    expect(c.textContent).not.toContain("Phase A: ");
    fireEvent.mouseEnter(barOf(c, PLAIN)!, { clientX: 10, clientY: 10 });
    act(() => { vi.advanceTimersByTime(HOVER_DELAY_MS); });
    expect(c.textContent).toContain("(unnamed section): 27/04/2026 – 27/04/2026 (1 activity)");
  });
});

describe("every lag label has a halo in the chart's ground (WI-172)", () => {
  const lagLabel = (c: HTMLElement) =>
    Array.from(chartSvg(c).querySelectorAll("text")).find((t) => t.textContent === "+3d")!;

  it.each([
    ["the Gantt, light", () => screen(), COLORS.light.bg, "3"],
    ["the Gantt, dark", () => screen({ dark: true }), COLORS.dark.bg, "3"],
    ["the printed Gantt", () => paper(), COLORS.light.bg, "1.5"],
  ])("%s", (_, draw, ground, width) => {
    const label = lagLabel(draw());
    expect(label.getAttribute("stroke")).toBe(ground);
    expect(label.getAttribute("stroke-width")).toBe(width);
    expect(label.getAttribute("paint-order")).toBe("stroke fill");
  });
});
