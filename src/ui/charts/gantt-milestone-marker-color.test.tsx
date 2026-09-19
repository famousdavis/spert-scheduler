// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeAll } from "vitest";
import { render, renderHook } from "@testing-library/react";

import { GanttChart } from "./GanttChart";
import { PrintGanttChart } from "./PrintGanttChart";
import { MILESTONE_COLORS, resolveGanttAppearance } from "./gantt-constants";
import { buildSampleProject } from "@app/api/sample-project-service";
import { computeDependencySchedule } from "@core/schedule/deterministic";
import { buildWorkCalendar } from "@core/calendar/work-calendar";
import { formatDateDisplay, formatDateShort } from "@core/calendar/calendar";
import { computeMilestoneHealth } from "@domain/helpers/format-labels";
import { useMilestoneBuffers } from "@ui/hooks/use-milestone-buffers";
import { DEFAULT_GANTT_APPEARANCE } from "@domain/models/types";
import type { MilestoneBufferInfo, Project, Scenario } from "@domain/models/types";

/**
 * Milestone markers on the Gantt and the printed Gantt: a milestone with no result draws in the
 * charts' own milestone colour (`line`), never a health colour (v0.70.3; owner, 2026-09-19).
 * Until then both charts coloured the line, diamond, name and date by `health`, and a milestone
 * with no result was "green" — so an unrun sample drew four GREEN milestones.
 *
 * ⚠️ WHY THIS FILE, AND NOT THE PARITY ORACLE. `gantt-parity-oracle.test.tsx` serialises geometry
 * attributes only — no `fill`, no `stroke` — and passes no `milestoneBuffers`, so it cannot see a
 * marker's colour at all. Measured, not assumed: the print chart planted back to green for a
 * no-result milestone leaves the oracle passing and fails this file. Both charts call ONE helper
 * (`milestoneMarkerColor`), and the parity row below compares their outputs directly.
 *
 * ⚠️ `line` is PURPLE (#9333ea light), the colour of the legend's "Milestone" swatch — the chart's
 * own milestone colour, not a grey. That is the ruling as made: "no health colour" on the charts.
 */

const START = "2026-09-14";

let scenario: Scenario;
let project: Project;
let schedule: ReturnType<typeof computeDependencySchedule>;
let calendar: ReturnType<typeof buildWorkCalendar>;
let projectEndDate: string;
/** The sample, never run: every milestone "none", built by the real hook. */
let unrun: Map<string, MilestoneBufferInfo>;

beforeAll(async () => {
  project = await buildSampleProject("Cloud ERP Solution", START);
  scenario = project.scenarios[0]!;
  calendar = buildWorkCalendar([1, 2, 3, 4, 5], [], [], {
    projectHolidays: project.globalCalendarOverride?.holidays ?? [],
  });
  schedule = computeDependencySchedule(
    scenario.activities,
    scenario.dependencies,
    scenario.startDate,
    scenario.settings.probabilityTarget,
    calendar,
    scenario.milestones,
  );
  projectEndDate = schedule.activities.reduce((m, s) => (s.endDate > m ? s.endDate : m), scenario.startDate);
  unrun = renderHook(() =>
    useMilestoneBuffers(
      scenario.milestones,
      schedule.activities,
      scenario.activities,
      undefined,
      scenario.startDate,
      scenario.settings.projectProbabilityTarget,
      scenario.settings.dependencyMode,
      calendar,
    ),
  ).result.current!;
}, 120_000);

/** The sample's four milestones measured green, amber and red, with the fourth left unrun. */
function mixed(): Map<string, MilestoneBufferInfo> {
  const slacks = [11, 2, -3];
  return new Map(
    scenario.milestones.map((m, i): [string, MilestoneBufferInfo] => {
      const base = unrun.get(m.id)!;
      const slack = slacks[i];
      if (slack === undefined) return [m.id, base];
      return [m.id, { ...base, bufferDays: 20, slackDays: slack, health: computeMilestoneHealth(slack), noHealthReason: undefined }];
    }),
  );
}

function renderInteractive(buffers: Map<string, MilestoneBufferInfo>) {
  const ra = resolveGanttAppearance(DEFAULT_GANTT_APPEARANCE, false);
  const { container } = render(
    <GanttChart
      svgContainerRef={{ current: null }}
      activities={scenario.activities}
      bands={scenario.bands ?? []}
      scheduledActivities={schedule.activities}
      projectStartDate={scenario.startDate}
      projectEndDate={projectEndDate}
      buffer={null}
      dependencies={scenario.dependencies}
      dependencyMode={true}
      activityTarget={scenario.settings.probabilityTarget}
      projectTarget={scenario.settings.projectProbabilityTarget}
      calendar={calendar}
      milestones={scenario.milestones}
      milestoneBuffers={buffers}
      projectName={project.name}
      resolvedAppearance={ra}
      appearancePanelOpen={false}
      onToggleAppearancePanel={() => {}}
    />,
  );
  return container;
}

function renderPrint(buffers: Map<string, MilestoneBufferInfo>) {
  const { container } = render(
    <PrintGanttChart
      activities={scenario.activities}
      bands={scenario.bands ?? []}
      scheduledActivities={schedule.activities}
      projectStartDate={scenario.startDate}
      projectEndDate={projectEndDate}
      buffer={null}
      dependencies={scenario.dependencies}
      dependencyMode={true}
      activityTarget={scenario.settings.probabilityTarget}
      projectTarget={scenario.settings.projectProbabilityTarget}
      calendar={calendar}
      bufferedEndDate={null}
      formatDate={(iso: string) => formatDateDisplay(iso, "MM/DD/YYYY")}
      formatDateShort={(iso: string) => formatDateShort(iso, "MM/DD/YYYY")}
      milestones={scenario.milestones}
      milestoneBuffers={buffers}
      projectName={project.name}
    />,
  );
  return container;
}

const COLOR_KEY: Record<string, string> = Object.fromEntries(
  Object.entries(MILESTONE_COLORS.light).map(([key, hex]) => [hex, key]),
);

/**
 * Each milestone's marker colours, by name: the fills of its name label and its diamond, as the
 * MILESTONE_COLORS key they come from. Both are read, and must agree, so a half-coloured marker
 * cannot pass.
 */
function markerColors(container: HTMLElement): string[] {
  return scenario.milestones.map((m) => {
    const label = Array.from(container.querySelectorAll("svg[data-gantt-chart] text")).find(
      (t) => t.textContent === m.name && t.getAttribute("font-weight") === "600",
    );
    if (!label) return `${m.name}: NO MARKER`;
    const diamond = label.parentElement!.querySelector("polygon");
    const labelKey = COLOR_KEY[label.getAttribute("fill") ?? ""] ?? label.getAttribute("fill");
    const diamondKey = COLOR_KEY[diamond?.getAttribute("fill") ?? ""] ?? diamond?.getAttribute("fill");
    return labelKey === diamondKey ? `${m.name}: ${labelKey}` : `${m.name}: label ${labelKey}, diamond ${diamondKey}`;
  });
}

describe("milestone marker colours — no result draws the chart's own milestone colour", () => {
  it("PRECONDITION: the hook gives the unrun sample four milestones, all with no health", () => {
    expect(unrun.size).toBe(4);
    expect([...unrun.values()].map((i) => i.health)).toEqual(["none", "none", "none", "none"]);
  });

  it.each([
    ["the interactive Gantt", renderInteractive],
    ["the printed Gantt", renderPrint],
  ] as const)("%s: green, amber and red by health, and the unrun one in `line`", (_, draw) => {
    const [a, b, c, d] = scenario.milestones.map((m) => m.name);
    expect(markerColors(draw(mixed()))).toEqual([`${a}: green`, `${b}: amber`, `${c}: red`, `${d}: line`]);
  });

  it.each([
    ["the interactive Gantt", renderInteractive],
    ["the printed Gantt", renderPrint],
  ] as const)("%s: an unrun sample draws no health colour at all", (_, draw) => {
    expect(markerColors(draw(unrun)).every((line) => line.endsWith(": line"))).toBe(true);
  });

  it("PARITY: both charts colour every milestone the same", () => {
    const interactive = markerColors(renderInteractive(mixed()));
    const printed = markerColors(renderPrint(mixed()));
    expect(printed).toEqual(interactive);
  });
});
