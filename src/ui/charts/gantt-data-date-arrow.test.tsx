// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render } from "@testing-library/react";
import { GanttChart } from "./GanttChart";
import { PrintGanttChart } from "./PrintGanttChart";
import { COLORS, resolveGanttAppearance } from "./gantt-constants";
import { overtakenLinkKeys } from "./gantt-utils";
import type { Activity, ActivityDependency, DeterministicSchedule } from "@domain/models/types";
import { computeDependencySchedule } from "@core/schedule/deterministic";
import { zeroFloatIds } from "@core/schedule/recorded-progress";

/**
 * WI-154 (Review 35, interactions G3; the design's gap 2) — ruling 6 exercised again: an overtaken
 * link between TWO rows with no float is never drawn as a critical edge, on screen or in print.
 * R598's fixture no longer makes its predecessor critical (WI-151), so this one does. Today Tue
 * 10/27: P has not started (today, 10/27 – 11/02) and is followed by Q (ten days, 11/03 – 11/16);
 * S started 10/20 (twenty days, to 11/16), before P. P, Q and S all end with the project.
 */
const act = (id: string, days: number, extra: Partial<Activity> = {}): Activity => ({
  id, name: `${id} name`, min: days, mostLikely: days, max: days, confidenceLevel: "mediumConfidence",
  distributionType: "uniform", status: "planned", ...extra,
});
const ACTS = [act("P", 5), act("S", 20, { status: "inProgress", actualStartDate: "2026-10-20", actualDuration: 6 }), act("Q", 10)];
const DEPS: ActivityDependency[] = [
  { fromActivityId: "P", toActivityId: "S", type: "FS", lagDays: 0 },
  { fromActivityId: "P", toActivityId: "Q", type: "FS", lagDays: 0 },
];
const LIGHT = COLORS.light;
const RED = resolveGanttAppearance(undefined, false).criticalPath;
const schedule = (): DeterministicSchedule => computeDependencySchedule(ACTS, DEPS, "2026-10-05", 0.5, undefined, undefined, "2026-10-27");

function props(s: DeterministicSchedule) {
  return {
    activities: ACTS, scheduledActivities: s.activities, projectStartDate: "2026-10-05", projectEndDate: s.projectEndDate,
    buffer: null, dependencies: DEPS, dependencyMode: true, activityTarget: 0.5, projectTarget: 0.95, criticalPathIds: zeroFloatIds(s),
  };
}
const arrowLooks = (c: HTMLElement) =>
  Array.from(c.querySelectorAll("path[marker-end]")).map((p) => [p.getAttribute("stroke"), p.getAttribute("marker-end"), !!p.getAttribute("stroke-dasharray")]);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-27T12:00:00"));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("an overtaken link between two rows with no float", () => {
  it("P, Q and S are all critical, and P → S is the link S overtook", () => {
    const s = schedule();
    expect([...zeroFloatIds(s)].sort()).toEqual(["P", "Q", "S"]);
    expect([...overtakenLinkKeys(s.progressNotes)]).toHaveLength(1);
  });

  it("on screen: P → S dashed in the ordinary colour; P → Q red", () => {
    const s = schedule();
    const c = render(
      <GanttChart {...props(s)} overtakenLinks={overtakenLinkKeys(s.progressNotes)}
        resolvedAppearance={resolveGanttAppearance(undefined, false)} appearancePanelOpen={false} onToggleAppearancePanel={() => {}} />,
    ).container;
    expect(arrowLooks(c)).toEqual([[LIGHT.arrow, "url(#arrowhead)", true], [RED, "url(#arrowhead-critical)", false]]);
  });

  it("in print: the same", () => {
    const s = schedule();
    const c = render(
      <PrintGanttChart {...props(s)} progressNotes={s.progressNotes} bufferedEndDate={null}
        formatDate={(iso: string) => iso} formatDateShort={(iso: string) => iso} />,
    ).container;
    expect(arrowLooks(c)).toEqual([[LIGHT.arrow, "url(#print-arrowhead)", true], [RED, "url(#print-arrowhead-critical)", false]]);
  });
});
