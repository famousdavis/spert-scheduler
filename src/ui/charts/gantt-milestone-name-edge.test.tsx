// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";

import { GanttChart } from "./GanttChart";
import { PrintGanttChart } from "./PrintGanttChart";
import { resolveGanttAppearance } from "./gantt-constants";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";
import { DEFAULT_GANTT_APPEARANCE, DEFAULT_USER_PREFERENCES } from "@domain/models/types";
import type { Activity, Milestone, ScheduledActivity } from "@domain/models/types";

/**
 * A milestone's NAME stays inside the Gantt chart (WI-99, v0.79.5).
 *
 * A name is centred on its diamond, and the diamond of a milestone on the chart's furthest date
 * sits 40px in from the svg's right edge (print: 20px). `Production Cutover Complete` is wider
 * than twice that, so it ran past the edge and was cut off. Since v0.79.5 a name slides left by
 * the finish label's rule — just far enough to end 4px inside the chart (print: 2px) — and the
 * diamond, its line and its date stay where they were.
 *
 * ⚠️ Every expected value is a number from independent arithmetic, never a call to the chart's
 * own helpers. The width model is 0.57 em a character, so a name's half-width is
 * 0.57 × characters × font size ÷ 2:
 *   - `Production Cutover Complete` is 27 characters: 92.34 at 12px (screen), 38.475 at 5px
 *     (print, default) and 53.865 at 7px (print at the "xl" activity font);
 *   - a date is 10 characters: 28.5 at 10px (screen), 11.4 at 4px (print); `Go-Live`'s block
 *     takes the date's half-width, since the name is narrower.
 * In jsdom the screen svg is 900 wide with a 260px name column and a 40px right margin, so the
 * dates map onto 260–860; print is 700 wide with a 170px column and a 20px margin, 170–680.
 */

const START = "2026-04-06";
/** 100 days after START — the furthest date whenever a milestone is placed on it. */
const END = "2026-07-15";
const MID = "2026-05-26"; // day 50 of 100
const LONG = "Production Cutover Complete";

const ACTIVITIES: Activity[] = [
  {
    id: "a1", name: "Design", min: 3, mostLikely: 5, max: 9,
    confidenceLevel: "mediumConfidence", distributionType: "triangular", status: "planned",
  },
  {
    id: "a2", name: "Build", min: 4, mostLikely: 5, max: 8,
    confidenceLevel: "mediumConfidence", distributionType: "triangular", status: "planned",
  },
];

const SCHEDULED: ScheduledActivity[] = [
  { activityId: "a1", name: "Design", duration: 5, startDate: "2026-04-06", endDate: "2026-04-10", isActual: false },
  { activityId: "a2", name: "Build", duration: 5, startDate: "2026-04-13", endDate: "2026-04-17", isActual: false },
];

afterEach(() => {
  cleanup(); // unmount first: a store change under a mounted chart is an update outside act()
  usePreferencesStore.setState({ preferences: { ...DEFAULT_USER_PREFERENCES } });
});

function renderScreen(milestones: Milestone[]): SVGSVGElement {
  usePreferencesStore.setState({ preferences: { ...DEFAULT_USER_PREFERENCES } });
  const { container } = render(
    <GanttChart
      svgContainerRef={{ current: null }}
      activities={ACTIVITIES}
      scheduledActivities={SCHEDULED}
      projectStartDate={START}
      projectEndDate="2026-04-17"
      buffer={null}
      dependencies={[]}
      dependencyMode={false}
      activityTarget={0.5}
      projectTarget={0.95}
      milestones={milestones}
      projectName="Probe"
      resolvedAppearance={resolveGanttAppearance(DEFAULT_GANTT_APPEARANCE, false)}
      appearancePanelOpen={false}
      onToggleAppearancePanel={() => {}}
    />,
  );
  return container.querySelector('svg[data-gantt-chart="interactive"]') as SVGSVGElement;
}

function renderPrint(milestones: Milestone[], xl = false): SVGSVGElement {
  const { container } = render(
    <PrintGanttChart
      activities={ACTIVITIES}
      scheduledActivities={SCHEDULED}
      projectStartDate={START}
      projectEndDate="2026-04-17"
      buffer={null}
      dependencies={[]}
      dependencyMode={false}
      activityTarget={0.5}
      projectTarget={0.95}
      bufferedEndDate={null}
      formatDate={(iso: string) => iso}
      formatDateShort={(iso: string) => iso.slice(5)}
      milestones={milestones}
      ganttAppearance={xl ? { ...DEFAULT_GANTT_APPEARANCE, activityFontSize: "xl" } : undefined}
    />,
  );
  return container.querySelector('svg[data-gantt-chart="print"]') as SVGSVGElement;
}

/** What one milestone draws: its name's x and y, its diamond's four vertex x's, its line's x's, its date's x. */
function milestoneMarks(svg: SVGSVGElement, name: string) {
  const nameText = Array.from(svg.querySelectorAll("text")).filter((t) => t.textContent === name);
  expect(nameText).toHaveLength(1);
  const group = nameText[0]!.parentElement!;
  const texts = Array.from(group.querySelectorAll("text"));
  expect(texts).toHaveLength(2);
  const points = group.querySelector("polygon")!.getAttribute("points")!;
  const line = group.querySelector("line")!;
  return {
    nameX: Number(texts[0]!.getAttribute("x")),
    nameY: Number(texts[0]!.getAttribute("y")),
    diamondXs: points.split(" ").map((p) => Number(p.split(",")[0])),
    lineXs: [Number(line.getAttribute("x1")), Number(line.getAttribute("x2"))],
    dateX: Number(texts[1]!.getAttribute("x")),
  };
}

describe("a milestone name stays inside the screen chart (WI-99)", () => {
  it("E1 a long name on the furthest date ends 4px inside: 900 − 4 − 92.34; its diamond, line and date stay at 860", () => {
    const m = milestoneMarks(renderScreen([{ id: "m1", name: LONG, targetDate: END }]), LONG);
    expect(m.nameX).toBeCloseTo(803.66, 9);
    expect(m.diamondXs).toEqual([860, 866, 860, 854]);
    expect(m.lineXs).toEqual([860, 860]);
    expect(m.dateX).toBe(860);
  });

  it("E2 a name that fits on the furthest date stays on its diamond, 860", () => {
    const m = milestoneMarks(renderScreen([{ id: "m1", name: "Go-Live", targetDate: END }]), "Go-Live");
    expect(m.nameX).toBe(860);
  });

  it("E3 a long name mid-chart stays on its diamond, 260 + 600 × 0.5", () => {
    const m = milestoneMarks(
      renderScreen([
        { id: "m1", name: LONG, targetDate: MID },
        { id: "m2", name: "Go-Live", targetDate: END },
      ]),
      LONG,
    );
    expect(m.diamondXs[0]).toBe(560);
    expect(m.nameX).toBe(560);
  });

  it("E4 a neighbour the slid name would overlap goes on the other row, 18px apart", () => {
    // The neighbour is on day 75 of 100: x = 260 + 600 × 0.75 = 710, its block 710 ± 28.5.
    // Centred on 860 the long name's block starts at 767.66, and 738.5 + 4 ≤ 767.66: one row.
    // Slid to 803.66 it starts at 711.32, and 742.5 > 711.32: two rows.
    const svg = renderScreen([
      { id: "m1", name: LONG, targetDate: END },
      { id: "m2", name: "Go-Live", targetDate: "2026-06-20" },
    ]);
    const long = milestoneMarks(svg, LONG);
    const near = milestoneMarks(svg, "Go-Live");
    expect(near.diamondXs[0]).toBeCloseTo(710, 9);
    expect(long.nameX).toBeCloseTo(803.66, 9);
    expect(near.nameY - long.nameY).toBe(18);
  });
});

describe("a milestone name stays inside the printed chart (WI-99)", () => {
  it("P1 default font: a long name on the furthest date at 700 − 2 − 38.475; its diamond and date at 680", () => {
    const m = milestoneMarks(renderPrint([{ id: "m1", name: LONG, targetDate: END }]), LONG);
    expect(m.nameX).toBeCloseTo(659.525, 9);
    expect(m.diamondXs).toEqual([680, 684, 680, 676]);
    expect(m.lineXs).toEqual([680, 680]);
    expect(m.dateX).toBe(680);
  });

  it("P2 the \"xl\" activity font (7px): at 700 − 2 − 53.865", () => {
    const m = milestoneMarks(renderPrint([{ id: "m1", name: LONG, targetDate: END }], true), LONG);
    expect(m.nameX).toBeCloseTo(644.135, 9);
    expect(m.dateX).toBe(680);
  });

  it("P3 a neighbour the slid name would overlap goes on the other row, 10px apart", () => {
    // The neighbour is on day 88 of 100: x = 170 + 510 × 0.88 = 618.8, its block 618.8 ± 11.4.
    // Centred on 680 the long name's block starts at 641.525, and 630.2 + 2 ≤ 641.525: one row.
    // Slid to 659.525 it starts at 621.05, and 632.2 > 621.05: two rows.
    const svg = renderPrint([
      { id: "m1", name: LONG, targetDate: END },
      { id: "m2", name: "Go-Live", targetDate: "2026-07-03" },
    ]);
    const long = milestoneMarks(svg, LONG);
    const near = milestoneMarks(svg, "Go-Live");
    expect(near.diamondXs[0]).toBeCloseTo(618.8, 9);
    expect(long.nameX).toBeCloseTo(659.525, 9);
    expect(near.nameY - long.nameY).toBe(10);
  });
});
