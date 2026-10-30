// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * WI-107 (v0.79.34): a milestone no longer keeps a label off the Gantt's time axis.
 *
 * The milestone diamond's top point sat ON the tick labels' baseline, so each diamond was a tick
 * obstacle and the month beside a milestone was left out — on screen, in the copied image and in
 * print. The obstacle is deleted in both charts and the diamond lowered clear of the labels: 3px
 * on screen, 0.3 × the print tick font in print.
 *
 * Both sides of the rule, read from the rendered SVG: the month beside a milestone, well inside
 * the deleted obstacle's reach, IS drawn; the month under the finish label is still left out.
 * The geometry rows are literals, never computed by calling the chart code.
 *
 * The fixture is a monthly-tick chart: the milestone falls two days after the 1 April tick, the
 * finish four days after the 1 August tick, and today before the start, so no today line is drawn.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render } from "@testing-library/react";

import { GanttChart } from "./GanttChart";
import { PrintGanttChart } from "./PrintGanttChart";
import { resolveGanttAppearance } from "./gantt-constants";
import { DEFAULT_GANTT_APPEARANCE } from "@domain/models/types";
import type {
  Activity,
  GanttAppearanceSettings,
  Milestone,
  ScheduledActivity,
} from "@domain/models/types";
import { buildWorkCalendar } from "@core/calendar/work-calendar";

type ActivityFontSize = GanttAppearanceSettings["activityFontSize"];

const START = "2026-01-05";
const END = "2026-08-05";
const MILESTONE_NAME = "Design Freeze";
const MILESTONES: Milestone[] = [{ id: "m1", name: MILESTONE_NAME, targetDate: "2026-04-03" }];

const activity = (id: string, name: string): Activity => ({
  id,
  name,
  min: 40,
  mostLikely: 60,
  max: 90,
  confidenceLevel: "mediumConfidence",
  distributionType: "normal",
  status: "planned",
});

const scheduled = (activityId: string, startDate: string, endDate: string, duration: number): ScheduledActivity => ({
  activityId,
  name: activityId,
  duration,
  startDate,
  endDate,
  isActual: false,
});

const SHARED = {
  activities: [activity("a1", "Design"), activity("a2", "Build")],
  scheduledActivities: [scheduled("a1", START, "2026-04-03", 65), scheduled("a2", "2026-04-06", END, 88)],
  projectStartDate: START,
  projectEndDate: END,
  buffer: null,
  dependencies: [],
  dependencyMode: false,
  activityTarget: 0.5,
  projectTarget: 0.95,
  calendar: buildWorkCalendar([1, 2, 3, 4, 5], [], []),
  milestones: MILESTONES,
  milestoneBuffers: null,
  projectName: "Label Beside Milestone",
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T09:00:00"));
});
afterEach(() => {
  vi.useRealTimers();
});

/** Render with a stubbed container width — the layout hook reads `clientWidth` on mount. */
function withClientWidth<T>(width: number, fn: () => T): T {
  const proto = HTMLElement.prototype;
  const prev = Object.getOwnPropertyDescriptor(proto, "clientWidth");
  Object.defineProperty(proto, "clientWidth", { configurable: true, get: () => width });
  try {
    return fn();
  } finally {
    if (prev) Object.defineProperty(proto, "clientWidth", prev);
    else Reflect.deleteProperty(proto, "clientWidth");
  }
}

function renderInteractive(width: number, fitToWindow: boolean): SVGSVGElement {
  const appearance: GanttAppearanceSettings = { ...DEFAULT_GANTT_APPEARANCE, fitToWindow };
  const { container } = withClientWidth(width, () =>
    render(
      <GanttChart
        {...SHARED}
        svgContainerRef={{ current: null }}
        resolvedAppearance={resolveGanttAppearance(appearance, false)}
        appearancePanelOpen={false}
        onToggleAppearancePanel={() => {}}
        onEditActivity={() => {}}
      />,
    ),
  );
  return chartSvg(container);
}

function renderPrint(activityFontSize: ActivityFontSize = "normal"): SVGSVGElement {
  const { container } = render(
    <PrintGanttChart
      {...SHARED}
      bufferedEndDate={null}
      formatDate={(iso: string) => iso}
      formatDateShort={(iso: string) => iso}
      ganttAppearance={{ ...DEFAULT_GANTT_APPEARANCE, activityFontSize }}
    />,
  );
  return chartSvg(container);
}

function chartSvg(container: HTMLElement): SVGSVGElement {
  const svg = container.querySelector<SVGSVGElement>("svg[data-gantt-chart]");
  if (!svg) throw new Error("no Gantt chart was rendered");
  return svg;
}

const MONTH_LABEL = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)( '\d\d)?$/;

/** The tick labels as drawn, left to right — every text that names a month and nothing else. */
function tickLabels(svg: SVGSVGElement): SVGTextElement[] {
  return Array.from(svg.querySelectorAll("text")).filter((t) => MONTH_LABEL.test(t.textContent ?? ""));
}

/** The tick labels' baseline: the one y they all share. */
function tickBaseline(svg: SVGSVGElement): number {
  const ys = new Set(tickLabels(svg).map((t) => Number(t.getAttribute("y"))));
  expect(ys.size, "the tick labels share one baseline").toBe(1);
  return [...ys][0]!;
}

/** The milestone's group: the one holding a diamond and the milestone's name. */
function milestoneGroup(svg: SVGSVGElement): Element {
  const group = Array.from(svg.querySelectorAll("g")).find(
    (g) => g.querySelector(":scope > polygon")
      && Array.from(g.querySelectorAll(":scope > text")).some((t) => t.textContent === MILESTONE_NAME),
  );
  if (!group) throw new Error("no milestone was drawn");
  return group;
}

/** The y of the diamond's top point. */
function diamondTop(svg: SVGSVGElement): number {
  const points = milestoneGroup(svg).querySelector(":scope > polygon")!.getAttribute("points")!;
  return Math.min(...points.split(" ").map((p) => Number(p.split(",")[1])));
}

/** Where the milestone's dashed line starts. */
function lineTop(svg: SVGSVGElement): number {
  return Number(milestoneGroup(svg).querySelector(":scope > line")!.getAttribute("y1"));
}

const drawn = (svg: SVGSVGElement): string[] => tickLabels(svg).map((t) => t.textContent ?? "");

const CHARTS: [string, () => SVGSVGElement][] = [
  ["interactive 1280 (container 1180), fit OFF", () => renderInteractive(1180, false)],
  ["interactive 853 (container 769), fit ON", () => renderInteractive(769, true)],
  ["print", () => renderPrint()],
];

describe("gantt — a month beside a milestone is drawn (WI-107)", () => {
  for (const [name, renderChart] of CHARTS) {
    it(`${name}: Apr, two days before the milestone, is drawn`, () => {
      expect(drawn(renderChart())).toContain("Apr");
    });

    it(`${name}: Aug, four days before the finish, is still left out under the finish label`, () => {
      const labels = drawn(renderChart());
      expect(labels, "the control reads a real axis").toContain("Jul");
      expect(labels).not.toContain("Aug");
    });
  }
});

describe("gantt — the diamond sits clear of the tick labels (WI-107)", () => {
  it("interactive: the diamond's top point is 3px below the tick labels' baseline", () => {
    const svg = renderInteractive(1180, false);
    expect(diamondTop(svg) - tickBaseline(svg)).toBe(3);
  });

  // fs5 = 5 / 5 / 6 / 7 at Small / Normal / Large / XL; the drop is 0.3 × fs5.
  const PRINT_ROWS: [ActivityFontSize, number, number][] = [
    ["small", 1.5, 2.5],
    ["normal", 1.5, 2.5],
    ["large", 1.8, 2.2],
    ["xl", 2.1, 1.9],
  ];

  for (const [size, belowBaseline] of PRINT_ROWS) {
    it(`print, ${size} activity font: the diamond's top point is ${belowBaseline}px below the tick labels' baseline`, () => {
      const svg = renderPrint(size);
      expect(diamondTop(svg) - tickBaseline(svg)).toBeCloseTo(belowBaseline, 9);
    });
  }

  for (const [size, , lineBelowTop] of PRINT_ROWS) {
    it(`print, ${size} activity font: the dashed line starts ${lineBelowTop}px below the diamond's top`, () => {
      const svg = renderPrint(size);
      const below = lineTop(svg) - diamondTop(svg);
      expect(below, "the line starts under the diamond, never above its tip").toBeGreaterThan(0);
      expect(below).toBeCloseTo(lineBelowTop, 9);
    });
  }
});
