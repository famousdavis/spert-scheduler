// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";

import { GanttChart } from "./GanttChart";
import { resolveGanttAppearance } from "./gantt-constants";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";
import { DEFAULT_GANTT_APPEARANCE, DEFAULT_USER_PREFERENCES } from "@domain/models/types";
import type { Activity, Milestone, ScheduledActivity } from "@domain/models/types";

/**
 * The Gantt's "Target" label stays inside the chart (WI-133, v0.79.1).
 *
 * The label sits at `topMargin − 25`. With no milestones and "Project name" unticked `topMargin`
 * is 32, so its baseline was y = 7 and the tops of its letters were cut off at the svg's edge
 * (the owner's report, 2026-10-22). Measured in the browser at 11px: the text's `getBBox()` top is
 * 10.5px above its baseline (−3.5 at y = 7), so 11.5 is the least baseline that keeps the label's
 * top at y ≥ 1. A chart with a milestone row or the project name has room above it, and there the
 * label must not move at all.
 *
 * ⚠️ The expected values are numbers, written out — 11.5 from that measurement, 60 − 25 and
 * 58 − 25 from the layout's own sums (32 + 28 for the project name, 32 + 26 for one milestone
 * row) — never the constants the chart reads, so a wrong constant cannot agree with itself here.
 */

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

const MILESTONE: Milestone = { id: "m1", name: "Design done", targetDate: "2026-04-10" };

/** The least baseline that keeps the label's top at y ≥ 1 — measured, see above. */
const LEAST_BASELINE_INSIDE = 11.5;

afterEach(() => {
  cleanup(); // unmount first: a store change under a mounted chart is an update outside act()
  usePreferencesStore.setState({ preferences: { ...DEFAULT_USER_PREFERENCES } });
});

function targetLabelY(opts: { showProjectName: boolean; milestones: Milestone[] }): number {
  usePreferencesStore.setState({
    preferences: { ...DEFAULT_USER_PREFERENCES, ganttShowProjectName: opts.showProjectName },
  });
  const { container } = render(
    <GanttChart
      svgContainerRef={{ current: null }}
      activities={ACTIVITIES}
      scheduledActivities={SCHEDULED}
      projectStartDate="2026-04-06"
      projectEndDate="2026-04-17"
      buffer={null}
      dependencies={[]}
      dependencyMode={false}
      activityTarget={0.5}
      projectTarget={0.95}
      milestones={opts.milestones}
      projectName="Probe"
      targetFinishDate="2026-04-14"
      showTargetOnGantt={true}
      hasTargetDate={true}
      resolvedAppearance={resolveGanttAppearance(DEFAULT_GANTT_APPEARANCE, false)}
      appearancePanelOpen={false}
      onToggleAppearancePanel={() => {}}
    />,
  );
  const labels = Array.from(
    container.querySelectorAll('svg[data-gantt-chart="interactive"] text'),
  ).filter((t) => t.textContent === "Target");
  expect(labels).toHaveLength(1);
  return Number(labels[0]!.getAttribute("y"));
}

describe("the Gantt's Target label stays inside the chart (WI-133)", () => {
  it("T1 no milestones, Project name off: the label's top is inside the chart", () => {
    const y = targetLabelY({ showProjectName: false, milestones: [] });
    expect(y).toBeGreaterThanOrEqual(LEAST_BASELINE_INSIDE);
  });

  it("T2 no milestones, Project name on: the label keeps its place, 60 − 25", () => {
    expect(targetLabelY({ showProjectName: true, milestones: [] })).toBe(35);
  });

  it("T3 one milestone, Project name off: the label keeps its place, 58 − 25", () => {
    expect(targetLabelY({ showProjectName: false, milestones: [MILESTONE] })).toBe(33);
  });
});
