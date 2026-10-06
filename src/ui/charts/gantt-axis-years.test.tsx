// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { render, renderHook } from "@testing-library/react";

import { GanttChart } from "./GanttChart";
import { PrintGanttChart } from "./PrintGanttChart";
import { PRINT_FINISH_LABEL_EDGE_PX, resolveGanttAppearance } from "./gantt-constants";
import {
  clampFinishLabelX, generateTicks, labelHalfWidth, longDateLabel,
  suppressOverlappingTicks, suppressTicksNamingEveryYear, tickHasYear,
} from "./gantt-utils";
import type { TickLevel, TickSuppressionParams } from "./gantt-utils";
import { useGanttLayout } from "@ui/hooks/use-gantt-layout";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";
import { DEFAULT_GANTT_APPEARANCE, DEFAULT_USER_PREFERENCES } from "@domain/models/types";
import type {
  Activity, ActivityBand, ActivityDependency, GanttAppearanceSettings, Milestone, ScheduledActivity,
} from "@domain/models/types";
import type { ScheduleBuffer } from "@core/schedule/buffer";
import type { WorkCalendar } from "@core/calendar/work-calendar";
import { buildSampleProject } from "@app/api/sample-project-service";
import { computeDependencySchedule } from "@core/schedule/deterministic";
import { buildWorkCalendar } from "@core/calendar/work-calendar";
import { durationToFinishDateISO, formatDateDisplay, formatDateShort } from "@core/calendar/calendar";

/**
 * THE AXIS NAMES THE YEARS IT SPANS — AT EVERY START DATE, NOT ONE.
 *
 * The collision test checks this criterion at ONE start, and the sample's start is the Monday
 * on or after the day it is loaded, so the axis a user sees moves with the calendar. This file
 * sweeps the start across every Monday of 2026 and 2027 instead.
 *
 * A year is NAMED when a drawn tick label carries it (`Jan '27`, `Q1 '27`, `2027`), when the
 * finish label carries it (`Mar 2, 2028`), or when the today line is drawn inside the chart and
 * its date label carries it (`11/02/2026`) — all three sit on or beside the tick lane and print
 * the year in full. A milestone's date label does NOT count: it is a marker, not the axis.
 *
 * ⚠️ WHAT IS LEFT UNNAMED IS COUNTED, NOT EXEMPTED. Three shapes remain, each pinned to an exact
 * count below, so a change that adds one fails here and so does a change that removes one:
 *   · before the first simulation run, an END year that only a milestone reaches;
 *   · the year BEFORE today's, when the today line sits over its last ticks: a December start
 *     viewed in early January, at any width and in print — its only tick is the start itself —
 *     and, on a narrow chart, a late-November start as well;
 *   · on the narrowest chart, a MIDDLE year none of whose ticks has room for a year label.
 *
 * ⚠️ HOW THE CHARTS ARE READ. The interactive axis comes from the REAL layout hook, rendered on
 * its own (`renderHook`) — a full chart render per start would make this file several times
 * slower. The hook's inputs mirror what `GanttChart` passes it, and the harness test below
 * compares the two routes on full renders, so the shortcut cannot drift silently. Print has no
 * such hook: it is the REAL `PrintGanttChart`, rendered and read back from its SVG.
 *
 * ⚠️ THE BUFFER IS THE COLLISION TEST'S LITERAL, reused at every start: the sample's
 * deterministic span is the same 294 working days whichever Monday it starts on, which the
 * fixture test below asserts.
 *
 * ⚠️ THE LITERAL IS ONE WORKING DAY SHORT OF THE APP'S OWN SIMULATION TODAY. The sample now keeps
 * its seed, and the app's engine gives P95 351.844 working days and a 58-day buffer at every one
 * of the 104 starts, against the literal's 350.889 and 57 — so each finish date here is one
 * working day before the one a user sees. Every count pinned below is the same with either
 * buffer; the named charts' finish dates are the literal's.
 */

// -- Fixtures -------------------------------------------------------------------------------

const BUFFER: ScheduleBuffer = {
  deterministicSpan: 294,
  projectTargetDuration: 350.8888103437381,
  bufferDays: 57,
  activityProbabilityTarget: 0.5,
  projectProbabilityTarget: 0.95,
};

/** Days after the start that "today inside the span" freezes at — the collision test's offset. */
const TODAY_INSIDE = 49;
/** "Today before the span": the day before the start, what a fresh load shows on a Sunday. */
const TODAY_BEFORE = -1;

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function daysBetween(fromISO: string, toISO: string): number {
  return Math.round((Date.parse(`${toISO}T00:00:00`) - Date.parse(`${fromISO}T00:00:00`)) / 86_400_000);
}

/** Every Monday from 2026-01-05 to 2027-12-27: 104 starts. */
const STARTS: string[] = Array.from({ length: 104 }, (_, i) => addDays("2026-01-05", 7 * i));

/** Everything either chart needs to draw one project. */
interface ChartInput {
  start: string;
  activities: Activity[];
  bands: ActivityBand[];
  scheduled: ScheduledActivity[];
  dependencies: ActivityDependency[];
  dependencyMode: boolean;
  milestones: Milestone[];
  calendar: WorkCalendar | undefined;
  projectEndDate: string;
  buffer: ScheduleBuffer | null;
  /** The buffered finish, exactly as `GanttChart` derives it; null before a run. */
  bufferedEndDate: string | null;
  projectName: string;
  activityTarget: number;
  projectTarget: number;
}

interface SampleAtStart {
  simulated: ChartInput;
  /** The same project before its first simulation run: no buffer, unbuffered finish. */
  unsimulated: ChartInput;
  spanDays: number;
}

const sampleAt = new Map<string, SampleAtStart>();

async function buildSample(start: string): Promise<SampleAtStart> {
  const project = await buildSampleProject("Cloud ERP Solution", start);
  const scenario = project.scenarios[0]!;
  const calendar = buildWorkCalendar([1, 2, 3, 4, 5], [], [], {
    projectHolidays: project.globalCalendarOverride?.holidays ?? [],
  });
  const schedule = computeDependencySchedule(
    scenario.activities, scenario.dependencies, scenario.startDate,
    scenario.settings.probabilityTarget, calendar, scenario.milestones,
  );
  const simulated: ChartInput = {
    start,
    activities: scenario.activities,
    bands: scenario.bands ?? [],
    scheduled: schedule.activities,
    dependencies: scenario.dependencies,
    dependencyMode: true,
    milestones: scenario.milestones,
    calendar,
    projectEndDate: schedule.activities.reduce((latest, sa) => (sa.endDate > latest ? sa.endDate : latest), start),
    buffer: BUFFER,
    bufferedEndDate: durationToFinishDateISO(start, BUFFER.projectTargetDuration, calendar),
    projectName: project.name,
    activityTarget: scenario.settings.probabilityTarget,
    projectTarget: scenario.settings.projectProbabilityTarget,
  };
  const unsimulated: ChartInput = { ...simulated, buffer: null, bufferedEndDate: null };
  return { simulated, unsimulated, spanDays: schedule.spanDays };
}

function plannedActivity(id: string, name: string): Activity {
  return {
    id, name, min: 3, mostLikely: 5, max: 10,
    confidenceLevel: "mediumConfidence", distributionType: "normal", status: "planned",
  };
}

/**
 * The parity oracle's long-span fixture (541 days, three phases, nothing else), moved to
 * `start`. Over 540 days both charts choose their tick level from the density setting.
 */
function longSpanAt(start: string): ChartInput {
  const shift = (iso: string) => addDays(iso, daysBetween("2026-01-05", start));
  const phase = (id: string, from: string, to: string, duration: number): ScheduledActivity => ({
    activityId: id, name: id, duration, startDate: shift(from), endDate: shift(to), isActual: false,
  });
  return {
    start,
    activities: [plannedActivity("L1", "Phase One"), plannedActivity("L2", "Phase Two"), plannedActivity("L3", "Phase Three")],
    bands: [],
    scheduled: [
      phase("L1", "2026-01-05", "2026-06-30", 126),
      phase("L2", "2026-07-01", "2026-12-31", 131),
      phase("L3", "2027-01-04", "2027-06-30", 128),
    ],
    dependencies: [],
    dependencyMode: false,
    milestones: [],
    calendar: undefined,
    projectEndDate: shift("2027-06-30"),
    buffer: null,
    bufferedEndDate: null,
    projectName: "Long Span",
    activityTarget: 0.5,
    projectTarget: 0.95,
  };
}

beforeAll(async () => {
  for (const start of STARTS) sampleAt.set(start, await buildSample(start));
}, 120_000);

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  usePreferencesStore.setState({ preferences: { ...DEFAULT_USER_PREFERENCES } });
});

function simulatedAt(start: string): ChartInput {
  return sampleAt.get(start)!.simulated;
}
function unsimulatedAt(start: string): ChartInput {
  return sampleAt.get(start)!.unsimulated;
}

// -- Reading an axis --------------------------------------------------------------------------

interface Condition {
  name: string;
  print: boolean;
  /** Interactive container width; the live `clientWidth` at a given viewport. */
  width: number;
  fit: boolean;
  todayOffset: number;
  appearance?: Partial<GanttAppearanceSettings>;
}

/** What the axis says, read the way a user reads it. */
interface AxisReading {
  ticks: string[];
  finish: string;
  /** The year on the today date label — null when no today line is drawn. */
  todayYear: string | null;
  /** The chart's last date: the last year it spans. */
  chartEnd: string;
}

function appearanceFor(c: Condition): GanttAppearanceSettings {
  return { ...DEFAULT_GANTT_APPEARANCE, fitToWindow: c.fit, ...c.appearance };
}

/** `GanttChart`'s own timeline end in the deterministic view, with no finish target shown. */
function furthestDateOf(input: ChartInput): string {
  let latest = input.bufferedEndDate ?? input.projectEndDate;
  for (const sa of input.scheduled) if (sa.endDate > latest) latest = sa.endDate;
  for (const m of input.milestones) if (m.targetDate > latest) latest = m.targetDate;
  return latest;
}

/** `PrintGanttChart`'s own timeline end. */
function printEndOf(input: ChartInput): string {
  return input.milestones.reduce(
    (latest, m) => (m.targetDate > latest ? m.targetDate : latest),
    input.bufferedEndDate ?? input.projectEndDate,
  );
}

/** The interactive axis through the real layout hook, fed what `GanttChart` feeds it. */
function readHook(input: ChartInput, c: Condition): AxisReading {
  const ra = resolveGanttAppearance(appearanceFor(c), false);
  const container = document.createElement("div");
  Object.defineProperty(container, "clientWidth", { value: c.width });
  const svgContainerRef = { current: container };
  const furthestDate = furthestDateOf(input);
  const { result, unmount } = renderHook(() =>
    useGanttLayout({
      orderedActivities: input.activities, bands: input.bands,
      projectStartDate: input.start, furthestDate,
      bufferedEndDate: input.bufferedEndDate, projectEndDate: input.projectEndDate,
      showBuffer: input.bufferedEndDate !== null, milestones: input.milestones,
      showProjectName: false, projectName: input.projectName, svgContainerRef,
      leftMargin: ra.leftMargin, rowHeight: ra.rowHeight, barHeight: ra.barHeight,
      fitToWindow: ra.fitToWindow, timelineDensityPx: ra.timelineDensityPx,
      showToday: true,
    }),
  );
  const layout = result.current;
  unmount();
  return {
    ticks: layout.ticks.map((t) => t.label),
    finish: longDateLabel(layout.finishDate),
    todayYear: layout.todayX === null ? null : layout.todayStr.slice(0, 4),
    chartEnd: furthestDate,
  };
}

/** The y the gridlines start at — the mode of the vertical lines' tops, as in the collision test. */
function findTopMargin(svg: SVGSVGElement): number {
  const freq = new Map<number, number>();
  for (const l of Array.from(svg.querySelectorAll("line"))) {
    if (l.closest("defs") || l.getAttribute("x1") !== l.getAttribute("x2")) continue;
    const y1 = Number(l.getAttribute("y1"));
    freq.set(y1, (freq.get(y1) ?? 0) + 1);
  }
  return [...freq.entries()].sort((a, b) => b[1] - a[1])[0]![0];
}

/** The stacked pairs, by DOM shape: a milestone's two texts beside a diamond; the today pair. */
function stackedTexts(svg: SVGSVGElement): Map<Element, "marker" | "today-date"> {
  const grouped = new Map<Element, "marker" | "today-date">();
  for (const g of Array.from(svg.querySelectorAll("g"))) {
    const texts = Array.from(g.querySelectorAll(":scope > text"));
    if (texts.length !== 2) continue;
    if (g.querySelector(":scope > polygon")) {
      for (const t of texts) grouped.set(t, "marker");
    } else if (texts[0]!.textContent === "Today") {
      grouped.set(texts[0]!, "marker");
      grouped.set(texts[1]!, "today-date");
    }
  }
  return grouped;
}

interface DomAxis {
  ticks: string[];
  finish: Element | null;
  todayYear: string | null;
}

/** Every header label, classified by structure and content — never by font size. */
function readSvgAxis(svg: SVGSVGElement): DomAxis {
  const topMargin = findTopMargin(svg);
  const grouped = stackedTexts(svg);
  const axis: DomAxis = { ticks: [], finish: null, todayYear: null };
  for (const el of Array.from(svg.querySelectorAll("text"))) {
    const text = el.textContent ?? "";
    const kind = grouped.get(el);
    if (Number(el.getAttribute("y")) >= topMargin || kind === "marker") continue;
    if (kind === "today-date") axis.todayYear = /\d{4}/.exec(text)?.[0] ?? null;
    else if (el.getAttribute("text-anchor") === "start" || text === "Target") continue;
    else if (/, \d{4}$/.test(text)) axis.finish = el;
    else axis.ticks.push(text);
  }
  return axis;
}

function chartSvg(container: HTMLElement): SVGSVGElement {
  const svg = container.querySelector<SVGSVGElement>("svg[data-gantt-chart]");
  if (!svg) throw new Error("no Gantt chart was rendered");
  return svg;
}

function renderPrintChart(input: ChartInput, c: Condition) {
  return render(
    <PrintGanttChart
      activities={input.activities} bands={input.bands} scheduledActivities={input.scheduled}
      projectStartDate={input.start} projectEndDate={input.projectEndDate} buffer={input.buffer}
      dependencies={input.dependencies} dependencyMode={input.dependencyMode}
      activityTarget={input.activityTarget} projectTarget={input.projectTarget}
      calendar={input.calendar} bufferedEndDate={input.bufferedEndDate}
      formatDate={(iso: string) => formatDateDisplay(iso, "MM/DD/YYYY")}
      formatDateShort={(iso: string) => formatDateShort(iso, "MM/DD/YYYY")}
      milestones={input.milestones} milestoneBuffers={null} projectName={input.projectName}
      ganttAppearance={appearanceFor(c)}
    />,
  );
}

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

function renderInteractiveChart(input: ChartInput, c: Condition) {
  const ra = resolveGanttAppearance(appearanceFor(c), false);
  const svgContainerRef: { current: HTMLDivElement | null } = { current: null };
  return withClientWidth(c.width, () =>
    render(
      <GanttChart
        svgContainerRef={svgContainerRef} activities={input.activities} bands={input.bands}
        scheduledActivities={input.scheduled} projectStartDate={input.start}
        projectEndDate={input.projectEndDate} buffer={input.buffer} dependencies={input.dependencies}
        dependencyMode={input.dependencyMode} activityTarget={input.activityTarget}
        projectTarget={input.projectTarget} calendar={input.calendar} milestones={input.milestones}
        milestoneBuffers={null} projectName={input.projectName} resolvedAppearance={ra}
        appearancePanelOpen={false} onToggleAppearancePanel={() => {}} onEditActivity={() => {}}
      />,
    ),
  );
}

/** A full render of either chart, read back from its SVG. */
function readRendered(input: ChartInput, c: Condition): AxisReading {
  const { container, unmount } = c.print ? renderPrintChart(input, c) : renderInteractiveChart(input, c);
  const axis = readSvgAxis(chartSvg(container));
  unmount();
  return {
    ticks: axis.ticks,
    finish: axis.finish?.textContent ?? "",
    todayYear: axis.todayYear,
    chartEnd: c.print ? printEndOf(input) : furthestDateOf(input),
  };
}

function freezeToday(input: ChartInput, c: Condition): void {
  vi.setSystemTime(new Date(`${addDays(input.start, c.todayOffset)}T09:00:00`));
}

/** The sweep's reading: the hook for the interactive chart, a full render for print. */
function readAxis(input: ChartInput, c: Condition): AxisReading {
  freezeToday(input, c);
  return c.print ? readRendered(input, c) : readHook(input, c);
}

// -- Which years are named --------------------------------------------------------------------

/** The year a tick label names: `Jan '27` → 2027, `2027` → 2027, `Jan` → null. */
function tickLabelYear(label: string): string | null {
  const twoDigit = /'(\d\d)$/.exec(label);
  if (twoDigit) return `20${twoDigit[1]}`;
  return /^\d{4}$/.test(label) ? label : null;
}

function yearsSpanned(fromISO: string, toISO: string): string[] {
  const first = Number(fromISO.slice(0, 4));
  return Array.from({ length: Number(toISO.slice(0, 4)) - first + 1 }, (_, i) => String(first + i));
}

/** Every year the chart spans that no tick, finish label or today date label names. */
function unnamedYears(start: string, r: AxisReading): string[] {
  const named = new Set<string>([r.finish.slice(-4)]);
  for (const label of r.ticks) named.add(tickLabelYear(label) ?? "");
  if (r.todayYear !== null) named.add(r.todayYear);
  return yearsSpanned(start, r.chartEnd).filter((y) => !named.has(y));
}

/** The shapes a missed year takes. Anything else is a defect, never a class. */
type MissClass = "end year only a milestone reaches" | "year before today's" | "middle year with no room";

function classifyMiss(year: string, r: AxisReading): MissClass | null {
  const y = Number(year);
  const finishYear = Number(r.finish.slice(-4));
  if (y > finishYear) return "end year only a milestone reaches";
  if (r.todayYear === null) return null;
  const todayYear = Number(r.todayYear);
  if (y === todayYear - 1) return "year before today's";
  if (y > todayYear && y < finishYear) return "middle year with no room";
  return null;
}

interface SweepResult {
  counts: Partial<Record<MissClass, number>>;
  /** One line per miss no class explains. Must stay empty. */
  unexplained: string[];
}

function sweep(c: Condition, at: (start: string) => ChartInput): SweepResult {
  const result: SweepResult = { counts: {}, unexplained: [] };
  for (const start of STARTS) {
    const r = readAxis(at(start), c);
    for (const year of unnamedYears(start, r)) {
      const cls = classifyMiss(year, r);
      if (cls) result.counts[cls] = (result.counts[cls] ?? 0) + 1;
      else result.unexplained.push(`${start}: ${year} unnamed on [${[...r.ticks, r.finish].join(", ")}]`);
    }
  }
  return result;
}

// -- The conditions ---------------------------------------------------------------------------

/** The collision test's seven buffered conditions. Containers 1180 and 769 are the live
 *  `clientWidth` at 1280 and 853 viewports. */
const CONDITIONS: Condition[] = [
  { name: "interactive 1280 (container 1180), fit OFF", print: false, width: 1180, fit: false, todayOffset: TODAY_BEFORE },
  { name: "interactive 1280 (container 1180), fit ON", print: false, width: 1180, fit: true, todayOffset: TODAY_BEFORE },
  { name: "interactive 853 (container 769), fit OFF", print: false, width: 769, fit: false, todayOffset: TODAY_BEFORE },
  { name: "interactive 853 (container 769), fit ON", print: false, width: 769, fit: true, todayOffset: TODAY_BEFORE },
  { name: "interactive 1280, fit ON, today inside the span", print: false, width: 1180, fit: true, todayOffset: TODAY_INSIDE },
  { name: "print", print: true, width: 0, fit: false, todayOffset: TODAY_BEFORE },
  { name: "print, today inside the span", print: true, width: 0, fit: false, todayOffset: TODAY_INSIDE },
];

/**
 * ⚠️ PINNED BOTH WAYS. Before the first run the finish label reads the UNBUFFERED end date, and
 * the chart still runs on to the Go-Live milestone; for starts from late August to late October
 * that milestone is the only thing in the next year, and no tick there has room for a label.
 */
const UNSIMULATED_END_YEAR_ONLY_A_MILESTONE_REACHES: Record<string, number> = {
  "interactive 1280 (container 1180), fit OFF": 7,
  "interactive 1280 (container 1180), fit ON": 10,
  "interactive 853 (container 769), fit OFF": 7,
  "interactive 853 (container 769), fit ON": 18,
  "interactive 1280, fit ON, today inside the span": 10,
  print: 5,
  "print, today inside the span": 5,
};

const NARROW: Condition = {
  name: "interactive, container 640, fit ON, today inside the span",
  print: false, width: 640, fit: true, todayOffset: TODAY_INSIDE,
};
const NARROWEST: Condition = {
  name: "interactive, container 640, wide name column, fit ON, today inside the span",
  print: false, width: 640, fit: true, todayOffset: TODAY_INSIDE, appearance: { nameColumnWidth: "wide" },
};

const LONG_SPAN: Condition[] = [
  { name: "quarterly ticks, interactive 1280 (container 1180), fit ON", print: false, width: 1180, fit: true, todayOffset: TODAY_BEFORE, appearance: { timelineDensity: "normal" } },
  { name: "quarterly ticks, print", print: true, width: 0, fit: false, todayOffset: TODAY_BEFORE, appearance: { timelineDensity: "normal" } },
  { name: "half-yearly ticks, interactive 1280 (container 1180), fit ON", print: false, width: 1180, fit: true, todayOffset: TODAY_BEFORE, appearance: { timelineDensity: "sparse" } },
  { name: "half-yearly ticks, print", print: true, width: 0, fit: false, todayOffset: TODAY_BEFORE, appearance: { timelineDensity: "sparse" } },
];

// -- The sweeps -------------------------------------------------------------------------------

/**
 * A sweep renders 104 charts: about 0.7 s for a print sweep on an idle machine, but MEASURED past
 * vitest's 5 s default (5.17 s) with the machine under load (load average ~22). The budget is for
 * a busy machine or a slow CI runner; it is not a sign the sweep has grown slow.
 */
const SWEEP_TIMEOUT_MS = 60_000;

describe("gantt axis years — the fixture", () => {
  it("the sample's deterministic span is the literal buffer's at every start", () => {
    expect(STARTS).toHaveLength(104);
    expect(STARTS.at(-1)).toBe("2027-12-27");
    expect(new Set(STARTS.map((s) => sampleAt.get(s)!.spanDays))).toEqual(new Set([BUFFER.deterministicSpan]));
  });

  it("the hook route reads the same axis as a full interactive render", () => {
    // The sweeps read the interactive axis from the layout hook alone. Checked here against the
    // real GanttChart, in both simulation states, so the shortcut cannot drift from the chart:
    // a start whose year moves on, one that leaves an end year to a milestone, a December start.
    const starts = ["2026-09-07", "2026-10-05", "2026-12-07"];
    const disagreements: string[] = [];
    for (const c of CONDITIONS.filter((x) => !x.print)) {
      for (const input of starts.flatMap((s) => [simulatedAt(s), unsimulatedAt(s)])) {
        const viaHook = readAxis(input, c);
        const viaChart = readRendered(input, c);
        if (JSON.stringify(viaHook) !== JSON.stringify(viaChart)) {
          disagreements.push(`${c.name} ${input.start}: ${JSON.stringify(viaHook)} vs ${JSON.stringify(viaChart)}`);
        }
      }
    }
    expect(disagreements).toEqual([]);
  }, SWEEP_TIMEOUT_MS);
});

describe("gantt axis years — after a simulation run, every Monday start in 2026 and 2027", () => {
  for (const c of CONDITIONS) {
    it(`${c.name} — names every year it spans`, () => {
      const { counts, unexplained } = sweep(c, simulatedAt);
      expect(unexplained, "years named nowhere").toEqual([]);
      expect(counts, "no miss of any kind is expected here").toEqual({});
    }, SWEEP_TIMEOUT_MS);
  }
});

describe("gantt axis years — before the first simulation run, every Monday start", () => {
  for (const c of CONDITIONS) {
    it(`${c.name} — names every year but an end year only a milestone reaches`, () => {
      const { counts, unexplained } = sweep(c, unsimulatedAt);
      expect(unexplained, "years named nowhere, of no recorded kind").toEqual([]);
      expect(counts).toEqual({ "end year only a milestone reaches": UNSIMULATED_END_YEAR_ONLY_A_MILESTONE_REACHES[c.name] });
    }, SWEEP_TIMEOUT_MS);
  }
});

describe("gantt axis years — a narrow chart, today inside the span, every Monday start", () => {
  it(`${NARROW.name} — names every year but the one before today's, under the today line`, () => {
    // Today in January or February lands the today line on the last ticks of the year before —
    // a November or December start has no other. Seven starts a year.
    const { counts, unexplained } = sweep(NARROW, simulatedAt);
    expect(unexplained, "years named nowhere, of no recorded kind").toEqual([]);
    expect(counts).toEqual({ "year before today's": 14 });
  }, SWEEP_TIMEOUT_MS);

  it(`${NARROWEST.name} — and, with no room for a year label, a middle year`, () => {
    // A 240 px timeline: every tick of the middle year sits too close to a milestone diamond, the
    // today line or the finish label for a year label, though a plain month still fits between them.
    const { counts, unexplained } = sweep(NARROWEST, simulatedAt);
    expect(unexplained, "years named nowhere, of no recorded kind").toEqual([]);
    expect(counts).toEqual({ "year before today's": 14, "middle year with no room": 28 });
  }, SWEEP_TIMEOUT_MS);
});

/** Today 20 days after the start: early January for the last three December starts of a year. */
const DECEMBER_START_IN_JANUARY: Condition[] = [
  { name: "interactive 1280 (container 1180), fit OFF, today 20 days in", print: false, width: 1180, fit: false, todayOffset: 20 },
  { name: "print, today 20 days in", print: true, width: 0, fit: false, todayOffset: 20 },
];

describe("gantt axis years — a December start viewed in early January, every Monday start", () => {
  /**
   * ⚠️ A RECORDED LIMIT, PINNED BOTH WAYS — at the default width and in print, not only on a
   * narrow chart. A December start's only tick in its own year is the start itself (`Dec '26`
   * for a 2026 start); with today in early January the today line sits too close to it for its
   * label, and the year has no later tick to move to. The today label names January's year and
   * the finish label the last; the start year is named nowhere. Three starts a year.
   */
  for (const c of DECEMBER_START_IN_JANUARY) {
    it(`${c.name} — names every year but a December start's, under the today line`, () => {
      const { counts, unexplained } = sweep(c, simulatedAt);
      expect(unexplained, "years named nowhere, of no recorded kind").toEqual([]);
      expect(counts).toEqual({ "year before today's": 6 });
    }, SWEEP_TIMEOUT_MS);
  }
});

describe("gantt axis years — a long project, quarterly and half-yearly ticks, every Monday start", () => {
  for (const c of LONG_SPAN) {
    it(`${c.name} — names every year it spans`, () => {
      // A start after its year's last quarter (or half) boundary used to leave that year with
      // no tick at all.
      const { counts, unexplained } = sweep(c, longSpanAt);
      expect(unexplained, "years named nowhere").toEqual([]);
      expect(counts).toEqual({});
    }, SWEEP_TIMEOUT_MS);
  }
});

// -- Named charts -----------------------------------------------------------------------------

const PRINT: Condition = { name: "print", print: true, width: 0, fit: false, todayOffset: TODAY_BEFORE };
const WIDE_FIT: Condition = { name: "1280, fit ON", print: false, width: 1180, fit: true, todayOffset: TODAY_BEFORE };
const NARROW_FIT: Condition = { name: "853, fit ON", print: false, width: 769, fit: true, todayOffset: TODAY_BEFORE };

/** The axis as a user reads it, left to right: the drawn ticks, then the finish label. */
function axisText(start: string, today: string, c: Condition): string[] {
  vi.setSystemTime(new Date(`${today}T09:00:00`));
  const r = readRendered(simulatedAt(start), c);
  return [...r.ticks, r.finish];
}

describe("gantt axis years — named charts, full renders", () => {
  it("print, start 2026-10-05, today the day before: 2027 is named on a tick", () => {
    expect(axisText("2026-10-05", "2026-10-04", PRINT)).toEqual(
      ["Nov '26", "Feb '27", "Jun", "Sep", "Jan '28", "Mar 2, 2028"],
    );
  });

  it("853 fit ON, start 2026-11-02, today the day before: 2027 is named on a tick", () => {
    expect(axisText("2026-11-02", "2026-11-01", NARROW_FIT)).toEqual(
      ["Dec '26", "Feb '27", "Apr", "Jul", "Oct", "Dec", "Mar 29, 2028"],
    );
  });

  it("1280 fit ON, start 2026-09-07, today 2026-10-05: 2026 settles on December, not on the tick beside today", () => {
    expect(axisText("2026-09-07", "2026-10-05", WIDE_FIT)).toEqual(
      ["Nov", "Dec '26", "Jan '27", "Feb", "Mar", "May", "Jun", "Aug", "Sep", "Oct", "Dec", "Feb 3, 2028"],
    );
  });

  it("print, start 2026-08-17, today 2026-09-14: 2026 is named on a tick the today line leaves clear", () => {
    expect(axisText("2026-08-17", "2026-09-14", PRINT)).toEqual(
      ["Nov '26", "Feb '27", "May", "Aug", "Dec", "Jan 12, 2028"],
    );
  });

  it("print, start 2026-12-07, today the day before: the first tick is the start, Dec '26", () => {
    expect(axisText("2026-12-07", "2026-12-06", PRINT)).toEqual(
      ["Dec '26", "Mar '27", "Jun", "Sep", "Jan '28", "Apr", "Apr 28, 2028"],
    );
  });

  it("1280 fit ON, start 2026-12-07, today the day before: the first tick is the start, Dec '26", () => {
    expect(axisText("2026-12-07", "2026-12-06", WIDE_FIT)).toEqual(
      ["Dec '26", "Feb '27", "Mar", "Apr", "May", "Jun", "Aug", "Sep", "Nov", "Dec", "Jan '28", "Mar", "Apr 28, 2028"],
    );
  });

  it("print at the largest activity font: a two-digit-day finish label ends inside the chart", () => {
    // The only appearance at which print's finish label would pass the right edge: 7 px type.
    vi.setSystemTime(new Date("2026-11-29T09:00:00"));
    const xl: Condition = { ...PRINT, appearance: { activityFontSize: "xl" } };
    const { container } = renderPrintChart(simulatedAt("2026-11-30"), xl);
    const svg = chartSvg(container);
    const label = readSvgAxis(svg).finish;
    const text = label?.textContent ?? "";
    const half = labelHalfWidth(text, Number(label?.getAttribute("font-size")));
    const lineX = Number(label?.parentElement?.querySelector("line")?.getAttribute("x1"));
    const width = Number(svg.getAttribute("width"));
    const rightEnd = Number(label?.getAttribute("x")) + half;
    expect(text, "premise: a two-digit day").toBe("Apr 21, 2028");
    expect(lineX + half, "premise: centred on its line, the label would end past the chart's edge").toBeGreaterThan(width);
    expect(rightEnd, "the label ends inside the chart").toBeLessThanOrEqual(width);
    // The clamp's own arithmetic can land a hair past the edge in floating point; 1e-9 px is not a pixel.
    expect(rightEnd, "with its clear space").toBeLessThanOrEqual(width - PRINT_FINISH_LABEL_EDGE_PX + 1e-9);
  });
});

describe("gantt axis years — a hidden today line", () => {
  // 1280 fit ON, start 2026-10-05, today 2026-11-02: the today line sits a day from Nov '26.
  const at = () => {
    vi.setSystemTime(new Date("2026-11-02T09:00:00"));
    return readRendered(simulatedAt("2026-10-05"), WIDE_FIT);
  };

  it("hidden: it evicts no tick, so the first tick keeps its year", () => {
    usePreferencesStore.setState({ preferences: { ...DEFAULT_USER_PREFERENCES, ganttShowToday: false } });
    const r = at();
    expect(r.todayYear, "premise: no today line drawn").toBeNull();
    expect(r.ticks[0]).toBe("Nov '26");
  });

  it("shown: no tick names 2026, and the today date label does", () => {
    const r = at();
    expect(r.ticks.filter((t) => tickLabelYear(t) === "2026")).toEqual([]);
    expect(r.todayYear).toBe("2026");
  });
});

// -- suppressTicksNamingEveryYear, as properties ----------------------------------------------

interface Tick {
  x: string;
  label: string;
}

interface RandomAxis {
  ticks: Tick[];
  params: TickSuppressionParams;
}

/** A seeded stream in [0, 1): the same axes on every run. Plain arithmetic, exact in a double. */
function seededStream(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const LEVELS: TickLevel[] = ["monthly", "quarterly", "semiannual"];
const SPAN_DAYS: Record<string, [number, number]> = {
  monthly: [30, 1100],
  quarterly: [90, 2200],
  semiannual: [180, 3600],
};

function randomAxis(next: () => number): RandomAxis {
  const level = LEVELS[Math.floor(next() * LEVELS.length)]!;
  const start = addDays("2025-01-01", Math.floor(next() * 1461));
  const [shortest, longest] = SPAN_DAYS[level]!;
  const end = addDays(start, shortest + Math.floor(next() * (longest - shortest)));
  const leftMargin = 100 + next() * 200;
  const chartAreaWidth = 150 + next() * 1350;
  const obstacles = Array.from({ length: Math.floor(next() * 5) }, () => ({
    x: leftMargin + next() * chartAreaWidth,
    halfWidth: 2 + next() * 50,
  }));
  return {
    ticks: generateTicks(start, end, level),
    params: {
      minTimestamp: Date.parse(`${start}T00:00:00`),
      dateRange: Date.parse(`${end}T00:00:00`) - Date.parse(`${start}T00:00:00`),
      chartAreaWidth, leftMargin, obstacles,
      tickFontPx: 4 + next() * 10,
      labelGapPx: next() * 5,
      minSpacingPx: 20 + next() * 80,
    },
  };
}

const AXES = 2000;
let randomAxes: RandomAxis[] | null = null;
function axes(): RandomAxis[] {
  if (randomAxes === null) {
    const next = seededStream(20261005);
    randomAxes = Array.from({ length: AXES }, () => randomAxis(next));
  }
  return randomAxes;
}

/** Runs `violation` on every random axis; returns the first few it reports, and how many. */
function violations(check: (axis: RandomAxis, out: Tick[]) => string | null): { count: number; first: string[] } {
  const found: string[] = [];
  for (const axis of axes()) {
    const v = check(axis, suppressTicksNamingEveryYear(axis.ticks, axis.params));
    if (v !== null) found.push(v);
  }
  return { count: found.length, first: found.slice(0, 3) };
}

/** `Jan '27` → { period: "Jan", yy: "27" }; `Jan` → { period: "Jan", yy: null }. */
function splitLabel(label: string): { period: string; yy: string | null } {
  const at = label.indexOf(" '");
  return at === -1 ? { period: label, yy: null } : { period: label.slice(0, at), yy: label.slice(at + 2) };
}

function yearsNamedBy(ticks: Tick[]): Set<string> {
  return new Set(ticks.filter((t) => tickHasYear(t.label)).map((t) => t.x.slice(0, 4)));
}

function outOfOrder(axis: RandomAxis, out: Tick[]): string | null {
  const positions = out.map((t) => axis.ticks.findIndex((s) => s.x === t.x));
  const ok = positions.every((p, i) => p >= 0 && (i === 0 || p > positions[i - 1]!));
  return ok ? null : `positions ${positions.join(",")}`;
}

function wrongLabel(axis: RandomAxis, out: Tick[]): string | null {
  for (const t of out) {
    const born = splitLabel(axis.ticks.find((s) => s.x === t.x)?.label ?? "");
    const drawn = splitLabel(t.label);
    if (drawn.period !== born.period) return `${t.x} drawn "${t.label}", born "${born.period}"`;
    if (drawn.yy !== null && drawn.yy !== t.x.slice(2, 4)) return `${t.x} drawn "${t.label}"`;
  }
  return null;
}

function yearLabelledTwice(_axis: RandomAxis, out: Tick[]): string | null {
  const years = out.filter((t) => tickHasYear(t.label)).map((t) => t.x.slice(0, 4));
  return new Set(years).size === years.length ? null : `year labels ${years.join(",")}`;
}

function notIdempotent(axis: RandomAxis, out: Tick[]): string | null {
  const again = suppressTicksNamingEveryYear(out, axis.params);
  return JSON.stringify(again) === JSON.stringify(out) ? null : `${JSON.stringify(out)} → ${JSON.stringify(again)}`;
}

function bornYearDrawnBare(axis: RandomAxis, out: Tick[]): string | null {
  const bornWithYear = new Set(axis.ticks.filter((t) => tickHasYear(t.label)).map((t) => t.x));
  const bare = out.find((t) => bornWithYear.has(t.x) && !tickHasYear(t.label));
  return bare ? `${bare.x} drawn "${bare.label}"` : null;
}

function namesFewerYears(axis: RandomAxis, out: Tick[]): string | null {
  const plain = yearsNamedBy(suppressOverlappingTicks(axis.ticks, axis.params));
  const ours = yearsNamedBy(out);
  return ours.size >= plain.size ? null : `names ${[...ours].join(",")}; plain suppression ${[...plain].join(",")}`;
}

describe("suppressTicksNamingEveryYear — properties over 2,000 seeded random axes", () => {
  const cases: [string, (axis: RandomAxis, out: Tick[]) => string | null][] = [
    ["keeps a subset of the ticks, in their order", outOfOrder],
    ["draws each tick as its own period, with only its own year", wrongLabel],
    ["labels each year at most once", yearLabelledTwice],
    ["is idempotent: applied to its own result, it changes nothing", notIdempotent],
    ["never draws a tick the generator gave a year without one", bornYearDrawnBare],
    ["never names fewer years than plain suppression of the same axis", namesFewerYears],
  ];
  for (const [title, check] of cases) {
    it(title, () => {
      const { count, first } = violations(check);
      expect(first, `${count} of ${AXES} axes`).toEqual([]);
    });
  }
});

// -- clampFinishLabelX ------------------------------------------------------------------------

describe("clampFinishLabelX", () => {
  it("leaves a label that ends inside the edge where it is", () => {
    // 600 + 30 = 630, well inside 700 − 4.
    expect(clampFinishLabelX(600, 30, 700, 4)).toBe(600);
  });

  it("slides a label that would pass the edge so it ends exactly edgePx inside", () => {
    // Centred on 680 it would end at 710; slid left, it ends at 700 − 4 = 696.
    const x = clampFinishLabelX(680, 30, 700, 4);
    expect(x).toBe(666);
    expect(x + 30).toBe(696);
  });
});

// -- generateTicks: a tick at the start -------------------------------------------------------

describe("generateTicks — a start year with no tick of its own gets one at the start", () => {
  it("monthly, a December start: the first tick is the start, Dec '26", () => {
    expect(generateTicks("2026-12-07", "2027-03-15", "monthly")).toEqual([
      { x: "2026-12-07", label: "Dec '26" },
      { x: "2027-01-01", label: "Jan '27" },
      { x: "2027-02-01", label: "Feb" },
      { x: "2027-03-01", label: "Mar" },
    ]);
  });

  it("quarterly, an October start: the first tick is the start, Q4 '26", () => {
    expect(generateTicks("2026-10-05", "2027-07-15", "quarterly")).toEqual([
      { x: "2026-10-05", label: "Q4 '26" },
      { x: "2027-01-01", label: "Q1 '27" },
      { x: "2027-04-01", label: "Q2" },
      { x: "2027-07-01", label: "Q3" },
    ]);
  });

  it("half-yearly, a July start: the first tick is the start, H2 '26", () => {
    expect(generateTicks("2026-07-06", "2027-07-15", "semiannual")).toEqual([
      { x: "2026-07-06", label: "H2 '26" },
      { x: "2027-01-01", label: "H1 '27" },
      { x: "2027-07-01", label: "H2" },
    ]);
  });

  it("adds nothing when the start year already has a tick", () => {
    expect(generateTicks("2026-11-02", "2027-02-15", "monthly")).toEqual([
      { x: "2026-12-01", label: "Dec '26" },
      { x: "2027-01-01", label: "Jan '27" },
      { x: "2027-02-01", label: "Feb" },
    ]);
  });

  it("adds nothing at a level whose labels carry no year", () => {
    // A Wednesday start: its year has no weekly tick, and a weekly label could not name it.
    expect(generateTicks("2026-12-30", "2027-01-20", "weekly")).toEqual([
      { x: "2027-01-04", label: "Jan 4" },
      { x: "2027-01-11", label: "Jan 11" },
      { x: "2027-01-18", label: "Jan 18" },
    ]);
  });
});
