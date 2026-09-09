// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { render } from "@testing-library/react";

import { GanttChart } from "./GanttChart";
import { PrintGanttChart } from "./PrintGanttChart";
import { resolveGanttAppearance } from "./gantt-constants";
import { DEFAULT_GANTT_APPEARANCE } from "@domain/models/types";
import type { Milestone, Project, Scenario } from "@domain/models/types";
import type { ScheduleBuffer } from "@core/schedule/buffer";
import { buildSampleProject } from "@app/api/sample-project-service";
import { computeDependencySchedule } from "@core/schedule/deterministic";
import { buildWorkCalendar } from "@core/calendar/work-calendar";
import { durationToFinishDateISO, formatDateDisplay, formatDateShort } from "@core/calendar/calendar";

/**
 * THE COLLISION ORACLE — the guard WI-11 was told to build before touching layout,
 * because the parity oracles cannot see this defect class by construction.
 *
 * ⚠️ WHY THE PARITY ORACLE IS NOT ENOUGH. `gantt-parity-oracle` pins POSITION;
 * a collision is position PLUS EXTENT, and three of the four attributes that decide
 * whether two labels overlap (font size, weight, text-anchor) are excluded from its
 * `GEOMETRY_ATTRS` on purpose. Measured by `Fable-3-1` at `9b04938`: deleting the
 * milestone-proximity branch — the branch this item is about — fails 0 of 3,168 tests.
 * Its sample fixture also has exactly ONE milestone, so `ms-name × ms-name` is
 * UNREPRESENTABLE there, and the long-span fixture has no milestone at all.
 *
 * ⚠️ WHAT THIS FILE MODELS, AND WHY THAT IS NOT CIRCULAR. jsdom has no text metrics,
 * so label extents are MODELLED here. The model is deliberately NOT the production
 * width model in `gantt-utils` — a guard that shares its subject's model is invariant
 * under a bug in that model. It is anchored instead to browser `getBBox()` widths
 * measured by `Opus-3-1` on 2026-09-08 at `9b04938` (see MEASURED_WIDTHS below), and
 * the first test asserts the model reproduces every one of them from ABOVE, within
 * 20 %. Over-estimating is the safe direction: this guard then reports a collision
 * slightly before the browser does, never after.
 *
 * ⚠️ THE FIXTURE IS PINNED ON BOTH AXES, and it is irreproducible otherwise (R104).
 * `buildSampleProject` defaults its start to `nextMondayISO` — the next Monday of
 * whenever it loads — and returns through `cloneProject`, which re-mints
 * `rngSeed: generateId()`. Two runs of identical code gave P95 350.96 vs 351.56 and
 * finish Feb 9 vs Feb 10. So: the start date is passed explicitly, and the schedule
 * buffer is a LITERAL below rather than simulated. `spanDays` is asserted against the
 * literal's `deterministicSpan`, so a change to the sample fixture fails loudly here
 * instead of silently pairing new activities with a stale buffer.
 *
 * ⚠️ EVERY ZERO IN THIS FILE IS BACKED BY A POSITIVE CONTROL. Two milestones forced
 * onto the same date must be REPORTED, in both charts. Print first read as "0
 * collisions" for `Opus-3-1` because 98 nodes measured zero-size; a detector that
 * cannot fire proves nothing about a chart it calls clean.
 */

// -- The extent model ---------------------------------------------------------

/**
 * `getBBox()` widths measured in Chromium at 1280 by `Opus-3-1`, 2026-09-08, at
 * `9b04938`, on the live sample project. These are the ONLY empirical anchor this
 * file has; the advance factors below are chosen to bound them from above.
 *
 * ⚠️ There is no single char-advance factor. Three-character month abbreviations run
 * 0.574–0.656 em/char (`May` is the widest string in the chart per character);
 * everything longer — anything containing a digit, space, slash or apostrophe — runs
 * 0.516–0.564. A model capped at 0.6 underestimates the widest tick by ~9 %.
 */
const MEASURED_WIDTHS: { text: string; fontPx: number; width: number }[] = [
  { text: "Jun", fontPx: 11, width: 18.95 },
  { text: "Sep", fontPx: 11, width: 20.2 },
  { text: "Dec", fontPx: 11, width: 20.63 },
  { text: "May", fontPx: 11, width: 21.64 },
  { text: "Jan '27", fontPx: 11, width: 40.76 },
  { text: "Oct '26", fontPx: 11, width: 41.41 },
  { text: "Jan '28", fontPx: 11, width: 41.74 },
  { text: "01/21/2028", fontPx: 10, width: 51.63 },
  { text: "Go-Live", fontPx: 12, width: 46.14 },
  { text: "Configuration & Build Complete", fontPx: 12, width: 186.11 },
  { text: "Nov 16, 2027", fontPx: 12, width: 77.09 },
];

/** Widest per-character class: short all-alpha strings (month abbreviations). */
const ADVANCE_ALPHA = 0.66;
/** Everything else — digits, spaces, slashes and apostrophes all run narrower. */
const ADVANCE_MIXED = 0.57;
/**
 * `getBBox` on an SVG `<text>` returns the EM box, not the ink box, so these are
 * conservative: a 0.00 px "clearance" measured this way is two em boxes touching,
 * with the glyphs themselves still apart. Ascent/descent bound `Opus-3-1`'s measured
 * boxes (0.950–0.958 and 0.200–0.227 of the font size) from above.
 */
const ASCENT = 0.96;
const DESCENT = 0.23;

function modelWidth(text: string, fontPx: number): number {
  return text.length * fontPx * (/^[A-Za-z]{1,4}$/.test(text) ? ADVANCE_ALPHA : ADVANCE_MIXED);
}

interface Label {
  kind: string;
  /**
   * Which STACKED GROUP this label belongs to — a milestone's name+date, or the today
   * line's "Today"+date. Labels inside one group are designed to sit one above the
   * other, so they are exempt from the overlap check and get a clearance check instead.
   * `""` means the label stands alone.
   */
  owner: string;
  text: string;
  x: number;
  y: number;
  fontPx: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Left edge of a label, from its anchor point and `text-anchor`. */
function leftEdge(x: number, width: number, anchor: string): number {
  if (anchor === "middle") return x - width / 2;
  if (anchor === "end") return x - width;
  return x;
}

function toLabel(kind: string, owner: string, el: Element): Label {
  const text = el.textContent ?? "";
  const x = Number(el.getAttribute("x"));
  const y = Number(el.getAttribute("y"));
  const fontPx = Number(el.getAttribute("font-size"));
  const w = modelWidth(text, fontPx);
  const left = leftEdge(x, w, el.getAttribute("text-anchor") ?? "start");
  return { kind, owner, text, x, y, fontPx, left, right: left + w, top: y - ASCENT * fontPx, bottom: y + DESCENT * fontPx };
}

interface Overlap { a: Label; b: Label; ox: number; oy: number }

function overlaps(labels: Label[]): Overlap[] {
  const out: Overlap[] = [];
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      const a = labels[i]!;
      const b = labels[j]!;
      // A group's own labels — a milestone's name over its date, "Today" over its date
      // — are DESIGNED to stack. Their clearance is asserted separately below; counting
      // them here would drown the cross-group pairs that are the actual defect.
      if (a.owner !== "" && a.owner === b.owner) continue;
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ox > 0 && oy > 0) out.push({ a, b, ox, oy });
    }
  }
  return out;
}

const describeOverlap = (o: Overlap) =>
  `${o.a.kind}:"${o.a.text}"@${o.a.x.toFixed(0)} × ${o.b.kind}:"${o.b.text}"@${o.b.x.toFixed(0)} (ox ${o.ox.toFixed(2)}, oy ${o.oy.toFixed(2)})`;

// -- Classification -----------------------------------------------------------

/**
 * Every header `<text>` must land in a named class. `other` is asserted to be zero:
 * a classifier that silently drops a class reports a clean chart for the labels it
 * cannot see, which is exactly how the print chart first read as collision-free.
 *
 * ⚠️ CLASSIFIED BY STRUCTURE AND CONTENT, NOT BY FONT SIZE — and the first draft of
 * this file WAS classified by font size, which broke the instant v0.67.14 raised the
 * tick labels from 11 to 12: fifteen ticks per condition silently became `other` and
 * the year check reported `ticks were []`. A guard keyed to the spelling of the thing
 * it guards inherits every change to it. Because it no longer reads sizes, it also
 * needs no print/interactive branch — the same four rules classify both. The sizes are
 * still asserted, in their own test, so a font change fails LOUDLY rather than
 * reclassifying quietly.
 */

/** Vertical extent of the header band: the y the gridlines start at. */
function findTopMargin(svg: SVGSVGElement): number {
  const verticals = Array.from(svg.querySelectorAll("line")).filter(
    (l) => !l.closest("defs") && l.getAttribute("x1") === l.getAttribute("x2"),
  );
  // MODE, not min: print's milestone lines start at topMargin - 2, while the
  // gridlines — the most numerous class — start exactly at topMargin.
  const freq = new Map<number, number>();
  for (const l of verticals) {
    const v = Number(l.getAttribute("y1"));
    freq.set(v, (freq.get(v) ?? 0) + 1);
  }
  return [...freq.entries()].sort((a, b) => b[1] - a[1])[0]![0];
}

/**
 * The two stacked pairs, found by DOM SHAPE: a milestone group carries a diamond
 * `<polygon>` beside its two texts, the today group carries two texts and no diamond.
 */
function stackedGroups(svg: SVGSVGElement): Map<Element, { kind: string; owner: string }> {
  const grouped = new Map<Element, { kind: string; owner: string }>();
  let msIndex = 0;
  for (const g of Array.from(svg.querySelectorAll("g"))) {
    const texts = Array.from(g.querySelectorAll(":scope > text"));
    if (texts.length !== 2) continue;
    if (g.querySelector(":scope > polygon")) {
      const owner = `ms:${msIndex++}`;
      grouped.set(texts[0]!, { kind: "ms-name", owner });
      grouped.set(texts[1]!, { kind: "ms-date", owner });
    } else if (texts[0]!.textContent === "Today") {
      grouped.set(texts[0]!, { kind: "today", owner: "today" });
      grouped.set(texts[1]!, { kind: "today-date", owner: "today" });
    }
  }
  return grouped;
}

/** The class of one ungrouped header label, or null for the project-name header. */
function ungroupedKind(el: Element, text: string): string | null {
  if (el.getAttribute("text-anchor") === "start") return null; // project name, the only left-anchored text up here
  if (text === "Target") return "target";
  if (/, ?\d{4}$/.test(text)) return "finish"; // "Feb 9, 2028"; no tick label carries a comma
  return "tick";
}

function headerLabels(svg: SVGSVGElement): { topMargin: number; labels: Label[]; other: string[] } {
  const topMargin = findTopMargin(svg);
  const grouped = stackedGroups(svg);
  const labels: Label[] = [];
  const other: string[] = [];

  for (const el of Array.from(svg.querySelectorAll("text"))) {
    const y = Number(el.getAttribute("y"));
    if (y >= topMargin) continue; // header band only — bar and row labels live below
    const text = el.textContent ?? "";
    const inGroup = grouped.get(el);
    if (inGroup) {
      labels.push(toLabel(inGroup.kind, inGroup.owner, el));
      continue;
    }
    if (text === "") {
      other.push(`empty <text> at y${y}`);
      continue;
    }
    const kind = ungroupedKind(el, text);
    if (kind) labels.push(toLabel(kind, "", el));
  }
  return { topMargin, labels, other };
}

/**
 * The font size each header class renders at, pinned by value.
 *
 * ⚠️ THE CLASSIFIER ABOVE NO LONGER READS THESE, on purpose — but the LANE OFFSETS are
 * chosen against them, so a size raised without re-checking the lanes is exactly the
 * regression this file exists to stop. Pinning them here also closes the hole
 * `legibility-floor.test.ts` has by construction: it scans source text for
 * `fontSize="11"` and cannot see a size that arrives through a constant.
 */
const PINNED_FONT_PX: Record<string, Record<string, number>> = {
  interactive: { tick: 12, finish: 12, "ms-name": 12, "ms-date": 10, today: 11, "today-date": 10, target: 11 },
  print: { tick: 5, finish: 5, "ms-name": 5, "ms-date": 4, today: 5, "today-date": 4, target: 5 },
};

/** Every calendar year the chart spans, as the two-digit suffix a tick would carry. */
function yearsSpanned(startISO: string, endISO: string): string[] {
  const first = Number(startISO.slice(0, 4));
  const last = Number(endISO.slice(0, 4));
  return Array.from({ length: last - first + 1 }, (_, i) => String(first + i));
}

// -- Fixture ------------------------------------------------------------------

/** Pinned. The demo's own start would be `nextMondayISO`, i.e. a moving target. */
const START = "2026-09-14";
/** Frozen before the span, which is what a fresh sample load shows on any non-Monday. */
const FROZEN_BEFORE = "2026-09-08T09:00:00";
/** Frozen inside the span, so the today-line and its two labels are exercised. */
const FROZEN_INSIDE = "2026-11-02T09:00:00";

/**
 * ⚠️ LITERAL, NOT SIMULATED (R104). Captured from `runSimulationSync` on this fixture;
 * `deterministicSpan` is asserted against the recomputed schedule below, so a sample
 * fixture change cannot leave a stale buffer silently in place.
 */
const BUFFER: ScheduleBuffer = {
  deterministicSpan: 294,
  projectTargetDuration: 350.8888103437381,
  bufferDays: 57,
  activityProbabilityTarget: 0.5,
  projectProbabilityTarget: 0.95,
};

let project: Project;
let scenario: Scenario;
let schedule: ReturnType<typeof computeDependencySchedule>;
let calendar: ReturnType<typeof buildWorkCalendar>;
let projectEndDate: string;
let bufferedEndDate: string | null;

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
  bufferedEndDate = durationToFinishDateISO(scenario.startDate, BUFFER.projectTargetDuration, calendar);
}, 120_000);

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

/** Render at a stubbed container width — the hook reads `clientWidth` on mount. */
function withClientWidth<T>(w: number, fn: () => T): T {
  const proto = HTMLElement.prototype;
  const prev = Object.getOwnPropertyDescriptor(proto, "clientWidth");
  Object.defineProperty(proto, "clientWidth", { configurable: true, get: () => w });
  try {
    return fn();
  } finally {
    if (prev) Object.defineProperty(proto, "clientWidth", prev);
    else delete (proto as unknown as Record<string, unknown>).clientWidth;
  }
}

function renderInteractive(
  width: number,
  fitToWindow: boolean,
  milestones = scenario.milestones,
  buffer: ScheduleBuffer | null = BUFFER,
) {
  const ra = resolveGanttAppearance({ ...DEFAULT_GANTT_APPEARANCE, fitToWindow }, false);
  const ref = { current: null as HTMLDivElement | null };
  const { container } = withClientWidth(width, () =>
    render(
      <GanttChart
        svgContainerRef={ref}
        activities={scenario.activities}
        bands={scenario.bands ?? []}
        scheduledActivities={schedule.activities}
        projectStartDate={scenario.startDate}
        projectEndDate={projectEndDate}
        buffer={buffer}
        dependencies={scenario.dependencies}
        dependencyMode={true}
        activityTarget={scenario.settings.probabilityTarget}
        projectTarget={scenario.settings.projectProbabilityTarget}
        calendar={calendar}
        milestones={milestones}
        milestoneBuffers={null}
        projectName={project.name}
        resolvedAppearance={ra}
        appearancePanelOpen={false}
        onToggleAppearancePanel={() => {}}
        onEditActivity={() => {}}
      />,
    ),
  );
  return container.querySelector("svg[data-gantt-chart]") as SVGSVGElement;
}

function renderPrint(milestones = scenario.milestones, buffer: ScheduleBuffer | null = BUFFER) {
  const { container } = render(
    <PrintGanttChart
      activities={scenario.activities}
      bands={scenario.bands ?? []}
      scheduledActivities={schedule.activities}
      projectStartDate={scenario.startDate}
      projectEndDate={projectEndDate}
      buffer={buffer}
      dependencies={scenario.dependencies}
      dependencyMode={true}
      activityTarget={scenario.settings.probabilityTarget}
      projectTarget={scenario.settings.projectProbabilityTarget}
      calendar={calendar}
      bufferedEndDate={buffer ? bufferedEndDate : null}
      formatDate={(iso: string) => formatDateDisplay(iso, "MM/DD/YYYY")}
      formatDateShort={(iso: string) => formatDateShort(iso, "MM/DD/YYYY")}
      milestones={milestones}
      milestoneBuffers={null}
      projectName={project.name}
    />,
  );
  return container.querySelector("svg[data-gantt-chart]") as SVGSVGElement;
}

interface Condition {
  name: string;
  frozen: string;
  print: boolean;
  width: number;
  fit: boolean;
  /** Render with no schedule buffer — the state before the first simulation run. */
  noBuffer?: boolean;
}

/**
 * ⚠️ 1280 + fit-ON is the BEST case and 853 + fit-ON the worst — the superseded
 * acceptance line named only the best one. Both are here, at both fit modes, plus the
 * today-in-range case, plus print.
 *
 * ⚠️ MEASURED BY RELOAD-AT-WIDTH, never by resize (R103): these render fresh at each
 * width, which is the only protocol that produces the narrow numbers. Container widths
 * 1180 and 769 are the live `clientWidth` values at 1280 and 853 viewports, confirmed
 * from the DOM by `Opus-3-1`.
 */
const CONDITIONS: Condition[] = [
  { name: "interactive 1280 (container 1180), fit OFF", frozen: FROZEN_BEFORE, print: false, width: 1180, fit: false },
  { name: "interactive 1280 (container 1180), fit ON", frozen: FROZEN_BEFORE, print: false, width: 1180, fit: true },
  { name: "interactive 853 (container 769), fit OFF", frozen: FROZEN_BEFORE, print: false, width: 769, fit: false },
  { name: "interactive 853 (container 769), fit ON", frozen: FROZEN_BEFORE, print: false, width: 769, fit: true },
  { name: "interactive 1280, fit ON, today inside the span", frozen: FROZEN_INSIDE, print: false, width: 1180, fit: true },
  { name: "print", frozen: FROZEN_BEFORE, print: true, width: 0, fit: false },
  // ⚠️ ADDED after the first green run. Without it print's today pair was never
  // rendered — every print assertion here was passing on a chart with no today line at
  // all, so print's own "Today"-over-date clearance (1.01px) went unmeasured. A
  // condition matrix that omits a state omits every defect that lives in it.
  { name: "print, today inside the span", frozen: FROZEN_INSIDE, print: true, width: 0, fit: false },
  /**
   * ⚠️ ADDED SECOND, and for the same reason as the one above: every condition until now
   * passed a schedule buffer, so all seven were POST-simulation renders. A freshly
   * loaded project has not been simulated, its finish label reads the unbuffered end
   * date, and the chart is shorter. `Orch-4` asked whether that state was inside this
   * matrix or outside it. It was outside, and the year check below has a real
   * uncovered failure in it — see that describe block.
   */
  { name: "interactive 853 (container 769), fit ON, BEFORE the first simulation", frozen: FROZEN_BEFORE, print: false, width: 769, fit: true, noBuffer: true },
];

function labelsFor(c: Condition) {
  vi.setSystemTime(new Date(c.frozen));
  const buffer = c.noBuffer ? null : BUFFER;
  const svg = c.print
    ? renderPrint(scenario.milestones, buffer)
    : renderInteractive(c.width, c.fit, scenario.milestones, buffer);
  return headerLabels(svg);
}

/** The chart's rightmost date — the buffered finish, or the furthest milestone without one. */
function chartEndFor(c: Condition): string {
  const furthestMilestone = scenario.milestones.reduce((m, x) => (x.targetDate > m ? x.targetDate : m), projectEndDate);
  return c.noBuffer ? furthestMilestone : (bufferedEndDate ?? projectEndDate);
}

// -- The guard ----------------------------------------------------------------

describe("gantt label collisions — the model itself", () => {
  it("bounds every browser-measured width from ABOVE, within 20%", () => {
    // Non-vacuity in both directions. Under-estimating a width would let this guard
    // call a colliding chart clean; over-estimating by a lot would make it cry wolf.
    for (const m of MEASURED_WIDTHS) {
      const modelled = modelWidth(m.text, m.fontPx);
      expect(modelled, `"${m.text}" @${m.fontPx}px modelled narrower than measured`).toBeGreaterThanOrEqual(m.width);
      expect(modelled, `"${m.text}" @${m.fontPx}px modelled >20% wide`).toBeLessThanOrEqual(m.width * 1.2);
    }
  });

  it("POSITIVE CONTROL: three milestones on the same date are reported, in BOTH charts", () => {
    // Every zero this file reports is worthless until the detector has fired.
    //
    // ⚠️ THREE, NOT TWO, AND THE REASON IS THE FIX ITSELF. Two milestones on one date
    // no longer overlap — the stagger lifts the second onto its own row, which is the
    // feature working. A control that the fix defuses stops being a control. Three
    // exceeds the two-row cap, so the first and third share a row at an identical x
    // and MUST collide however the layout is arranged.
    const same: Milestone[] = [
      { id: "c1", name: "Control Milestone A", targetDate: "2027-03-01" },
      { id: "c2", name: "Control Milestone B", targetDate: "2027-03-01" },
      { id: "c3", name: "Control Milestone C", targetDate: "2027-03-01" },
    ];
    vi.setSystemTime(new Date(FROZEN_BEFORE));
    for (const [what, svg] of [
      ["interactive", renderInteractive(1180, true, same)],
      ["print", renderPrint(same)],
    ] as const) {
      const found = overlaps(headerLabels(svg).labels);
      expect(found.map((o) => `${o.a.kind}~${o.b.kind}`), `${what} detector never fired`).toContain("ms-name~ms-name");
      expect(found.map((o) => `${o.a.kind}~${o.b.kind}`)).toContain("ms-date~ms-date");
    }
  });

  it("the pinned fixture still is what the buffer above was captured from", () => {
    expect(scenario.milestones).toHaveLength(4);
    expect(scenario.activities).toHaveLength(40);
    expect(scenario.startDate).toBe(START);
    // ⚠️ The literal buffer is only honest while the schedule it came from is unchanged.
    expect(schedule.spanDays).toBe(BUFFER.deterministicSpan);
  });

  it("classifies every header label — `other` is empty in every condition", () => {
    for (const c of CONDITIONS) {
      const { labels, other } = labelsFor(c);
      expect(other, `${c.name}: unclassified header labels`).toEqual([]);
      expect(labels.filter((l) => l.kind === "ms-name"), `${c.name}: milestone names`).toHaveLength(4);
      expect(labels.filter((l) => l.kind === "ms-date"), `${c.name}: milestone dates`).toHaveLength(4);
      expect(labels.filter((l) => l.kind === "finish"), `${c.name}: finish label`).toHaveLength(1);
      expect(labels.filter((l) => l.kind === "tick").length, `${c.name}: no tick labels at all`).toBeGreaterThan(0);
    }
  });

  it("renders every header class at its pinned font size", () => {
    // A size change is allowed; a size change that skips the lane arithmetic is not.
    for (const c of CONDITIONS) {
      const pinned = PINNED_FONT_PX[c.print ? "print" : "interactive"]!;
      for (const l of labelsFor(c).labels) {
        expect(l.fontPx, `${c.name}: ${l.kind} "${l.text}"`).toBe(pinned[l.kind]);
      }
    }
  });
});

describe("gantt label collisions — no two header labels overlap", () => {
  for (const c of CONDITIONS) {
    it(c.name, () => {
      const found = overlaps(labelsFor(c).labels);
      expect(found.map(describeOverlap), `${found.length} overlapping label pairs`).toEqual([]);
    });
  }
});

describe("gantt label collisions — every stacked pair clears itself", () => {
  /**
   * ⚠️ A milestone's own name and date abut at exactly 0.00 px at `9b04938`, and so do
   * "Today" and its date — a pair NEITHER analyst reported, surfaced here only because
   * this model uses em boxes rather than an ink approximation. That is the fourth and
   * fifth zero-clearance pair this campaign has found, after print's header lanes and
   * the `Target`/finish abutment. A pass with no margin is not a pass you can build on.
   */
  const MIN_CLEARANCE = 2;
  for (const c of CONDITIONS) {
    it(c.name, () => {
      const labels = labelsFor(c).labels;
      const groups = [...new Set(labels.map((l) => l.owner))].filter((o) => o !== "");
      expect(groups.length, "no stacked groups found — this check would be vacuous").toBeGreaterThan(0);
      for (const owner of groups) {
        const [upper, lower] = labels.filter((l) => l.owner === owner).sort((a, b) => a.y - b.y);
        expect(upper && lower, `group ${owner} is not a pair`).toBeTruthy();
        expect(
          lower!.top - upper!.bottom,
          `${owner} ("${upper!.text}" over "${lower!.text}") clearance`,
        ).toBeGreaterThanOrEqual(MIN_CLEARANCE);
      }
    });
  }
});

describe("gantt label collisions — the timeline names every year it spans", () => {
  /**
   * ⚠️ NOT "a year-bearing tick survives" — that criterion is ALREADY TRUE at
   * `9b04938` and therefore could not fail after the work. `tickHasYear` is
   * `label.includes("'")`, and the first tick always carries the year, so `Oct '26`
   * satisfies it in every condition while BOTH real year boundaries are suppressed.
   * The chart's START MARKER is not a year TRANSITION.
   *
   * ⚠️ NOR "every 1 January keeps its own tick", which sounds stronger and is
   * UNSATISFIABLE HERE. Measured at 853 + fit-to-window: `Jan '28` sits at x 693.3 and
   * the finish label `Feb 9, 2028` spans [691.4, 766.6] — 25.8px of overlap, so no
   * SUPPRESSION can show both. ⚠️ That is narrower than "impossible": moving or
   * reformatting the finish label was never tried and is open to a later item.
   *
   * What a presenter needs is that the axis SAYS which year you are looking at. The
   * finish label carries a full year and sits on the tick baseline, so it counts. At
   * `9b04938` the 853 + fit-ON chart read `Oct '26 · Dec · Feb · Jun · Sep` with a
   * finish of `Feb 9, 2028`: 2026 and 2028 named, and **2027 — the year most of the
   * project happens in — named nowhere.**
   */
  for (const c of CONDITIONS.filter((x) => !x.noBuffer)) {
    it(c.name, () => {
      const { labels } = labelsFor(c);
      const axis = labels.filter((l) => l.kind === "tick" || l.kind === "finish").map((l) => l.text);
      const wanted = yearsSpanned(scenario.startDate, chartEndFor(c));
      expect(wanted.length, "fixture premise: the span must cross at least one new year").toBeGreaterThan(1);
      const missing = wanted.filter(
        (year) => !axis.some((t) => t.endsWith(year) || t.endsWith(`'${year.slice(2)}`)),
      );
      expect(missing, `years named nowhere on the axis; it read [${axis.join(", ")}]`).toEqual([]);
    });
  }

  /**
   * ⚠️ A KNOWN, UNFIXED FAILURE OF THE CRITERION ABOVE, PINNED RATHER THAN OMITTED.
   *
   * `Orch-4` asked whether the pre-simulation state was inside this file's condition
   * set or outside it, because the two could not both be true: a criterion reporting
   * "every year named, everywhere" beside a residual saying 2028 is named nowhere. It
   * was OUTSIDE — every other condition here passes a schedule buffer, so all of them
   * were POST-simulation renders. It is inside now, and it fails.
   *
   * ⚠️ SO THE CRITERION ABOVE IS SCOPED, NOT UNIVERSAL: it holds once a simulation has
   * run. Before the first run the finish label reads the UNBUFFERED end date
   * (`Nov 16, 2027`), so it no longer carries 2028 — and the chart still reaches
   * 2028-01-21 because the Go-Live milestone extends it.
   *
   * WHY IT IS NOT FIXED HERE. `Jan '28` lands 19px from the right edge of the chart
   * area, and the label is 48px wide: it cannot be drawn there by any placement rule,
   * and it overlaps the finish label besides. The 19px of 2028 that the axis leaves
   * unlabelled carries the Go-Live milestone's own date label, `01/21/2028`, so a
   * reader is not actually lost — but that is a MILESTONE label, not an axis one, and
   * the criterion above deliberately does not count it.
   *
   * This test pins the limit in BOTH directions. If a later change makes 2028 appear,
   * this fails and should be deleted with the criterion above widened to cover the
   * pre-simulation case. If a later change loses 2026 or 2027 as well, it also fails.
   */
  it("KNOWN LIMIT — before the first simulation, 853 + fit ON leaves 2028 unnamed", () => {
    const c = CONDITIONS.find((x) => x.noBuffer)!;
    const { labels } = labelsFor(c);
    const axis = labels.filter((l) => l.kind === "tick" || l.kind === "finish").map((l) => l.text);
    const named = yearsSpanned(scenario.startDate, chartEndFor(c)).filter(
      (year) => axis.some((t) => t.endsWith(year) || t.endsWith(`'${year.slice(2)}`)),
    );
    expect(named, `axis read [${axis.join(", ")}]`).toEqual(["2026", "2027"]);
    // The reader is not lost: the year is on the Go-Live milestone's date label, which
    // is deliberately NOT counted as an axis label above.
    expect(labels.filter((l) => l.kind === "ms-date").map((l) => l.text)).toContain("01/21/2028");
  });
});
