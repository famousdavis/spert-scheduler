// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import { GanttChart } from "./GanttChart";
import { PrintGanttChart } from "./PrintGanttChart";
import {
  COLORS, OVERTAKEN_LINK_DASH, PRINT_OVERTAKEN_LINK_DASH, TARGET_DASH_PATTERNS, resolveGanttAppearance,
} from "./gantt-constants";
import { overtakenLinkKeys } from "./gantt-utils";
import type { Activity, ActivityDependency, DeterministicSchedule } from "@domain/models/types";
import { computeDependencySchedule, computeDeterministicSchedule } from "@core/schedule/deterministic";
import { zeroFloatIds } from "@core/schedule/recorded-progress";

/**
 * WI-137 release 2 — the overtaken link drawn dashed, on screen and in print (owner, R622), never as
 * a critical edge (R630 ruling 6), with a legend entry only while such an arrow is drawn, and its
 * hover text saying so. R598's example: A Complete 10-05..10-23, B In Progress since 10-19 (before A
 * finished), C Planned; A → B → C. The link note is A → B; B → C is critical and not overtaken.
 */
const act3 = (id: string, extra: Partial<Activity> = {}): Activity => ({
  id, name: `${id} name`, min: 9, mostLikely: 10, max: 11, confidenceLevel: "mediumConfidence",
  distributionType: "uniform", status: "planned", ...extra,
});
const ACTS = [
  act3("A", { status: "complete", actualStartDate: "2026-10-05", actualFinishDate: "2026-10-23", actualDuration: 15 }),
  act3("B", { status: "inProgress", actualStartDate: "2026-10-19", actualDuration: 1 }),
  act3("C"),
];
const DEPS: ActivityDependency[] = [
  { fromActivityId: "A", toActivityId: "B", type: "FS", lagDays: 0 },
  { fromActivityId: "B", toActivityId: "C", type: "FS", lagDays: 0 },
];
const LEGEND = "Link overtaken by an actual date";
const HOVER_DELAY_MS = 1500; // GanttChart's hover-intent delay before a tooltip shows
const LIGHT = COLORS.light;
const RED = resolveGanttAppearance(undefined, false).criticalPath;

function props(schedule: DeterministicSchedule, dependencyMode: boolean) {
  return {
    activities: ACTS, scheduledActivities: schedule.activities, projectStartDate: "2026-10-05",
    projectEndDate: schedule.projectEndDate, buffer: null, dependencies: dependencyMode ? DEPS : [], dependencyMode,
    activityTarget: 0.5, projectTarget: 0.95, criticalPathIds: dependencyMode ? zeroFloatIds(schedule) : null,
  };
}
/** Each drawn dependency arrow, in order: the paths that end in an arrowhead. */
const arrows = (c: HTMLElement) => Array.from(c.querySelectorAll("path[marker-end]"));
const arrowDashes = (c: HTMLElement) => arrows(c).map((p) => p.getAttribute("stroke-dasharray"));
const arrowLooks = (c: HTMLElement) => arrows(c).map((p) => [p.getAttribute("stroke"), p.getAttribute("marker-end")]);

function screenChart(schedule: DeterministicSchedule, dependencyMode: boolean, withNotes = true) {
  return render(
    <GanttChart {...props(schedule, dependencyMode)} overtakenLinks={withNotes ? overtakenLinkKeys(schedule.progressNotes) : undefined}
      resolvedAppearance={resolveGanttAppearance(undefined, false)} appearancePanelOpen={false} onToggleAppearancePanel={() => {}} />,
  ).container;
}
function printChart(schedule: DeterministicSchedule, dependencyMode: boolean, withNotes = true) {
  return render(
    <PrintGanttChart {...props(schedule, dependencyMode)} progressNotes={withNotes ? schedule.progressNotes : undefined}
      bufferedEndDate={null} formatDate={(iso: string) => iso} formatDateShort={(iso: string) => iso} />,
  ).container;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-27T12:00:00"));
});
afterEach(() => {
  vi.useRealTimers();
});

// -- The dash is used by no other line (Review 32, G3; Review 33, W1) --------------------------

const DASH = /^\d+(?:\.\d+)?(?: \d+(?:\.\d+)?)+$/;
/** Every dash a source text draws, by the route it is written in. */
function dashesIn(source: string): Record<"literal" | "braces" | "fallback" | "constant", string[]> {
  const all = (re: RegExp) => [...source.matchAll(re)].map((m) => m[1]!).filter((d) => DASH.test(d));
  return {
    literal: all(/strokeDasharray="([^"]+)"/g),
    braces: all(/strokeDasharray=\{"([^"]+)"\}/g),
    fallback: all(/\?\? "([^"]+)"/g),
    // Every exported *_DASH string but the two overtaken ones, which are what is being held apart.
    constant: [...source.matchAll(/export const (\w+_DASH) = "([^"]+)"/g)]
      .filter((m) => m[1] !== "OVERTAKEN_LINK_DASH" && m[1] !== "PRINT_OVERTAKEN_LINK_DASH").map((m) => m[2]!),
  };
}
const GANTT_FILES = ["GanttChart.tsx", "PrintGanttChart.tsx", "GanttLegend.tsx", "GanttActivityRow.tsx", "GanttSvgDefs.tsx", "gantt-constants.ts"];
const sourceOf = (f: string) => readFileSync(join(process.cwd(), "src/ui/charts", f), "utf-8");

describe("the dash is used by no other line on either chart", () => {
  it("every route reads: a literal, a braces literal, a ?? fallback, an exported *_DASH (non-vacuity, by construction)", () => {
    const routes = dashesIn([
      'strokeDasharray="4 3"', 'strokeDasharray={"4 3"}', 'strokeDasharray={x ?? "4 3"}',
      'export const MILESTONE_LINE_DASH = "4 3";', 'export const OVERTAKEN_LINK_DASH = "5 3";', 'name ?? ""',
    ].join("\n"));
    expect(routes).toEqual({ literal: ["4 3"], braces: ["4 3"], fallback: ["4 3"], constant: ["4 3"] });
  });

  it("neither dash appears among every dash the Gantt files draw, nor among the Finish Target's", () => {
    const routes = GANTT_FILES.map((f) => dashesIn(sourceOf(f)));
    const by = (k: keyof ReturnType<typeof dashesIn>) => new Set(routes.flatMap((r) => r[k]));
    // Non-vacuity on the real files: release 1's "4 3" is caught by each route it is written in.
    expect([by("literal").has("4 3"), by("fallback").has("4 3"), TARGET_DASH_PATTERNS.gray]).toEqual([true, true, "4 3"]);
    const used = new Set([...by("literal"), ...by("braces"), ...by("fallback"), ...by("constant"), ...Object.values(TARGET_DASH_PATTERNS)]);
    expect(used.size).toBeGreaterThanOrEqual(10);
    expect(used.has(OVERTAKEN_LINK_DASH)).toBe(false);
    expect(used.has(PRINT_OVERTAKEN_LINK_DASH)).toBe(false);
  });
});

// -- R598's example, dependencies on ------------------------------------------------------------

describe("dependencies on", () => {
  const schedule = () => computeDependencySchedule(ACTS, DEPS, "2026-10-05", 0.5);

  it("the schedule holds one link note, A → B, and the set built from it holds exactly that link", () => {
    expect(schedule().progressNotes?.filter((n) => n.kind === "link").map((n) => n.kind === "link" && `${n.predecessorId}>${n.activityId}`)).toEqual(["A>B"]);
    expect([...overtakenLinkKeys(schedule().progressNotes)]).toEqual(["A|B|FS"]);
    expect([...overtakenLinkKeys(undefined)]).toEqual([]);
  });

  it("screen and print dash the SAME arrow, each with its own dash, and both legends say so", () => {
    const s = screenChart(schedule(), true);
    const p = printChart(schedule(), true);
    expect(arrowDashes(s)).toEqual([OVERTAKEN_LINK_DASH, null]);
    expect(arrowDashes(p)).toEqual([PRINT_OVERTAKEN_LINK_DASH, null]);
    expect(s.textContent).toContain(LEGEND);
    expect(p.textContent).toContain(LEGEND);
  });

  it("an overtaken arrow is NEVER a critical edge — the ordinary colour and arrowhead; the critical B → C stays red (ruling 6)", () => {
    // WI-151: A's float no longer runs through the link B overtook. A is a terminal row once it is
    // skipped: LS = 11/13 less 14 working days = 10/26, ES 10/05, so 15 days of float — not critical.
    // (Before WI-151 A read 0 here, which is why A → B would otherwise have been red.)
    expect([...zeroFloatIds(schedule())].sort()).toEqual(["B", "C"]);
    expect(schedule().activities.find((a) => a.activityId === "A")!.totalFloat).toBe(15);
    expect(arrowLooks(screenChart(schedule(), true))).toEqual([
      [LIGHT.arrow, "url(#arrowhead)"], [RED, "url(#arrowhead-critical)"],
    ]);
    expect(arrowLooks(printChart(schedule(), true))).toEqual([
      [LIGHT.arrow, "url(#print-arrowhead)"], [RED, "url(#print-arrowhead-critical)"],
    ]);
  });

  it("… hovered too: the ordinary hover colour and arrowhead, and its hover text says it was overtaken (F13)", () => {
    const s = screenChart(schedule(), true);
    const hits = Array.from(s.querySelectorAll('path[stroke="transparent"]'));
    fireEvent.mouseEnter(hits[0]!, { clientX: 10, clientY: 10 });
    act(() => { vi.advanceTimersByTime(HOVER_DELAY_MS); });
    expect(arrowLooks(s)[0]).toEqual([LIGHT.arrowHover, "url(#arrowhead-hover)"]);
    expect(arrowDashes(s)[0]).toBe(OVERTAKEN_LINK_DASH);
    expect(s.textContent).toContain("A name → B name, Finish-to-Start, overtaken by an actual date");
    fireEvent.mouseLeave(hits[0]!);
    fireEvent.mouseEnter(hits[1]!, { clientX: 10, clientY: 10 });
    act(() => { vi.advanceTimersByTime(HOVER_DELAY_MS); });
    expect(arrowLooks(s)[1]).toEqual([LIGHT.arrowHoverCritical, "url(#arrowhead-critical-hover)"]);
    expect(s.textContent).toContain("B name → C name, Finish-to-Start");
    expect(s.textContent).not.toContain("C name, Finish-to-Start, overtaken");
  });

  it("the chart reads the set it is given, built once per schedule — not the notes (F18)", () => {
    const c = render(
      <GanttChart {...props(schedule(), true)} overtakenLinks={new Set(["B|C|FS"])}
        resolvedAppearance={resolveGanttAppearance(undefined, false)} appearancePanelOpen={false} onToggleAppearancePanel={() => {}} />,
    ).container;
    expect(arrowDashes(c)).toEqual([null, OVERTAKEN_LINK_DASH]);
  });

  it("with no note, no arrow is dashed and neither legend has the entry", () => {
    const s = screenChart(schedule(), true, false);
    const p = printChart(schedule(), true, false);
    expect(arrowDashes(s)).toEqual([null, null]);
    expect(arrowDashes(p)).toEqual([null, null]);
    expect(s.textContent).not.toContain(LEGEND);
    expect(p.textContent).not.toContain(LEGEND);
  });
});

describe("dependencies off: the arrow from the row above", () => {
  it("screen and print dash A → B, the sequential note's link", () => {
    const schedule = computeDeterministicSchedule(ACTS, "2026-10-05", 0.5);
    expect(schedule.progressNotes?.some((n) => n.kind === "link" && n.sequential && n.predecessorId === "A" && n.activityId === "B")).toBe(true);
    expect(arrowDashes(screenChart(schedule, false))).toEqual([OVERTAKEN_LINK_DASH, null]);
    expect(arrowDashes(printChart(schedule, false))).toEqual([PRINT_OVERTAKEN_LINK_DASH, null]);
  });
});
