// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { PrintScheduleErrorBox } from "./print-sections";
import { PrintableReport } from "./PrintableReport";
import { getScheduleErrorBanner } from "@ui/helpers/schedule-error-banner";
import { AXIS_TICK_FILL_LIGHT } from "@ui/charts/axis-theme";
import { createActivity, createProject, createScenario } from "@app/api/project-service";
import type { Activity, Scenario, ScenarioSettings, SimulationRun } from "@domain/models/types";
import type { ScheduleError } from "@ui/hooks/use-schedule";

/**
 * WI-61 — the printout follows Compare, and says why a schedule that fails on a cycle or a calendar error
 * has blank dates (WI-84). ⚠️ jsdom applies no `@media print` and paints nothing, so these pin the
 * MECHANISMS: the markup, its words, its order and the chart's own attributes. The paper was measured on
 * real PDFs of the Cloud ERP sample (the PR says how): page 1's order, the table and the S-curves never
 * split, the S-curves complete and light, the dashed line at 95 % of the plot.
 */

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove("dark");
});

const START = "2026-04-06";
const VALID = { min: 5, mostLikely: 10, max: 20 };
const OUT_OF_ORDER_NORMAL = { min: 12, mostLikely: 10, max: 20, distributionType: "normal" as const };
const CYCLE: ScheduleError = { message: "Dependency cycle detected — cannot compute topological order", isCycleError: true, isCalendarError: false };
const CALENDAR: ScheduleError = { message: "Calendar iteration limit exceeded - date range too large", isCycleError: false, isCalendarError: true };
const ESTIMATE: ScheduleError = { message: "Cannot create Triangular distribution…", isCycleError: false, isCalendarError: false };

function scenarioOf(name: string, rows: Partial<Activity>[], settings: Partial<ScenarioSettings> = {}): Scenario {
  const s = createScenario(name, START);
  return {
    ...s,
    settings: { ...s.settings, ...settings },
    activities: rows.map((patch, i) => ({ ...createActivity(`Row ${i + 1}`, s.settings), ...patch })),
  };
}

function run(s: Scenario, samples: number[]): Scenario {
  const results: SimulationRun = {
    id: `run-${s.id}`,
    timestamp: "2026-04-06T00:00:00.000Z",
    trialCount: samples.length,
    seed: "wi61-fixture",
    engineVersion: "1.1.1",
    percentiles: { 50: samples[2]!, 75: samples[3]!, 90: samples[4]!, 95: samples[5]! },
    histogramBins: [],
    mean: samples[2]!,
    standardDeviation: 1,
    minSample: samples[0]!,
    maxSample: samples[5]!,
    samples,
  };
  return { ...s, simulationResults: results };
}

const EARLY = [20, 22, 24, 26, 28, 30];
const LATE = [30, 33, 36, 39, 42, 45];

function renderReport(onScreen: Scenario, compared: Scenario[], scheduleError: ScheduleError | null = null) {
  const project = { ...createProject("Harbour works", START), scenarios: compared.includes(onScreen) ? compared : [...compared, onScreen] };
  const { container } = render(
    <PrintableReport
      project={project}
      scenario={onScreen}
      schedule={null}
      scheduledActivities={[]}
      buffer={null}
      scheduleError={scheduleError}
      compareScenarios={compared}
      showActivityNumbers
    />
  );
  return container.querySelector(".print-report") as HTMLElement;
}

const section = (report: HTMLElement) =>
  Array.from(report.querySelectorAll("section")).find((s) => s.querySelector("h2")?.textContent === "Scenario Comparison") ?? null;

describe("PrintScheduleErrorBox — WI-84: the page banner's own words, on paper", () => {
  it.each([["a dependency cycle", CYCLE], ["a calendar error", CALENDAR]] as const)(
    "prints %s as the banner's heading, message and advice, word for word",
    (_label, error) => {
      const { container } = render(<PrintScheduleErrorBox scheduleError={error} />);
      const box = container.querySelector("section")!;
      const banner = getScheduleErrorBanner(error, null)!;
      expect(Array.from(box.querySelectorAll("p")).map((p) => p.textContent)).toEqual([banner.heading, banner.message, banner.advice]);
    }
  );

  it("is plain text, kept whole, red and light: no <button>, no dark: variant", () => {
    const { container } = render(<PrintScheduleErrorBox scheduleError={CYCLE} />);
    const box = container.querySelector("section")!;
    expect(box.textContent).toContain("Dependency Cycle"); // non-vacuity
    expect(box.querySelectorAll("button")).toHaveLength(0);
    expect(box.className.split(/\s+/)).toEqual(expect.arrayContaining(["print-section-keep", "bg-red-50", "text-red-800"]));
    expect(box.outerHTML).not.toContain("dark:");
  });

  it.each([["an estimate error (WI-58's box speaks)", ESTIMATE], ["no error", null]] as const)("prints nothing for %s", (_label, error) => {
    const { container } = render(<PrintScheduleErrorBox scheduleError={error} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("PrintableReport — page 1's order: header, WI-84's box, WI-58's box, the comparison, the report", () => {
  it("in that order, when all four are present", () => {
    const onScreen = scenarioOf("Cyclic", [VALID, OUT_OF_ORDER_NORMAL]);
    const other = run(scenarioOf("Baseline", [VALID]), EARLY);
    const report = renderReport(onScreen, [other, onScreen], CYCLE);
    const heads = Array.from(report.children).map((el) => el.querySelector("h1, h2, p")?.textContent ?? "");
    const at = (t: string) => heads.findIndex((h) => h === t);
    const header = heads.findIndex((h) => h.startsWith("SPERT"));
    const order = [header, at("Dependency Cycle"), at("1 activity has validation errors"), at("Scenario Comparison"), at("Project Summary")];
    expect(order.every((i) => i >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("WI-84's box prints with Compare off too, directly under the header", () => {
    const onScreen = scenarioOf("Typo", [VALID]);
    const report = renderReport(onScreen, [], CALENDAR);
    const heads = Array.from(report.children).map((el) => el.querySelector("h1, h2, p")?.textContent ?? "");
    expect(heads.indexOf("Calendar Configuration Error")).toBe(1);
    expect(section(report)).toBeNull();
  });
});

describe("the comparison prints exactly when Compare has two or three scenarios", () => {
  const a = run(scenarioOf("Fast-track", [VALID]), EARLY);
  const b = run(scenarioOf("Baseline", [VALID]), LATE);

  it.each([["Compare off", [] as Scenario[]], ["one ticked", [b]]])("not with %s", (_label, compared) => {
    expect(section(renderReport(b, compared))).toBeNull();
  });

  it("with two: the heading, the table, then the line naming the scenario whose report follows", () => {
    const s = section(renderReport(b, [a, b]))!;
    expect(s).not.toBeNull();
    expect(Array.from(s.querySelectorAll("thead th")).map((th) => th.textContent)).toEqual(["Metric", "Fast-track", "Baseline"]);
    expect(s.lastElementChild!.textContent).toBe("The rest of this report describes Baseline.");
  });

  it("the line names the scenario on screen even when it is not among those compared", () => {
    const c = scenarioOf("Plan C", [VALID]);
    const s = section(renderReport(c, [a, b]))!;
    expect(s.lastElementChild!.textContent).toBe("The rest of this report describes Plan C.");
  });
});

describe("the printed table and notes", () => {
  it("is plain elements whose name headers WRAP: no <button>, no whitespace-nowrap on a scenario's name", () => {
    const long = run(scenarioOf("Fast-track: every Most Likely fifteen percent lower", [VALID]), EARLY);
    const s = section(renderReport(long, [long, run(scenarioOf("Baseline", [VALID]), LATE)]))!;
    expect(s.querySelectorAll("button")).toHaveLength(0);
    const names = Array.from(s.querySelectorAll("thead th")).slice(1);
    expect(names).toHaveLength(2);
    for (const th of names) {
      expect(th.className.split(/\s+/)).not.toContain("whitespace-nowrap");
      expect(th.className.split(/\s+/)).toContain("[overflow-wrap:anywhere]");
    }
  });

  it("lists EVERY flagged row of a scenario that is not on screen — the screen stops at three", () => {
    const stretch = scenarioOf("Stretch", [OUT_OF_ORDER_NORMAL, OUT_OF_ORDER_NORMAL, OUT_OF_ORDER_NORMAL, OUT_OF_ORDER_NORMAL]);
    const baseline = run(scenarioOf("Baseline", [VALID]), LATE);
    const s = section(renderReport(baseline, [stretch, baseline]))!;
    const note = Array.from(s.querySelectorAll("div")).find((d) => d.firstElementChild?.textContent === "Stretch: 4 activities have validation errors.")!;
    expect(Array.from(note.children).map((p) => p.textContent)).toEqual([
      "Stretch: 4 activities have validation errors.",
      "#1 Row 1: Min is above Most Likely.",
      "#2 Row 2: Min is above Most Likely.",
      "#3 Row 3: Min is above Most Likely.",
      "#4 Row 4: Min is above Most Likely.",
      "It cannot be simulated until these are fixed.",
    ]);
  });
});

describe("the printed S-curves: fixed, light, unanimated, legend-free", () => {
  const a = run(scenarioOf("Fast-track", [VALID]), EARLY);
  const b = run(scenarioOf("Baseline", [VALID]), LATE);
  /** The chart's own SVG — a Recharts legend would add its 14 x 14 icon SVGs with the same class. */
  const chart = (s: HTMLElement) => s.querySelector(".recharts-wrapper > svg.recharts-surface")!;

  it("is a fixed-size chart, not a responsive one: its SVG is drawn inside the hidden report", () => {
    const s = section(renderReport(b, [a, b]))!;
    expect(s.textContent).toContain("Cumulative Distribution Comparison");
    // 680 x 300: as wide as the report's text box allows (A4 less 1 cm margins and the report's p-4 is 686).
    expect(chart(s).getAttribute("width")).toBe("680");
    expect(chart(s).getAttribute("height")).toBe("300");
    expect(s.querySelectorAll(".recharts-responsive-container")).toHaveLength(0);
    expect(s.querySelectorAll("path.recharts-line-curve")).toHaveLength(2);
  });

  it("draws no Recharts legend (it would measure 0 x 0 inside the hidden report); a plain key in column order instead", () => {
    const s = section(renderReport(b, [a, b]))!;
    expect(s.querySelectorAll(".recharts-legend-wrapper")).toHaveLength(0);
    const key = Array.from(s.querySelectorAll("span")).filter((el) => el.querySelector("svg line"));
    expect(key.map((k) => k.textContent)).toEqual(["Fast-track", "Baseline"]);
    // The key shows each curve's dash pattern: the first solid, the second dashed.
    expect(key.map((k) => k.querySelector("line")!.getAttribute("stroke-dasharray"))).toEqual([null, "9 4"]);
  });

  it("draws each curve at once, in its own dash pattern — no entrance animation, which starts at '0px 0px'", () => {
    const s = section(renderReport(b, [a, b]))!;
    const paths = Array.from(s.querySelectorAll("path.recharts-line-curve"));
    expect(paths.map((p) => p.getAttribute("stroke"))).toEqual(["#3b82f6", "#10b981"]);
    expect(paths.map((p) => p.getAttribute("stroke-dasharray"))).toEqual([null, "9 4"]);
  });

  it("uses the light theme's ticks whatever html.dark says", () => {
    document.documentElement.classList.add("dark");
    const s = section(renderReport(b, [a, b]))!;
    const fills = Array.from(s.querySelectorAll("text.recharts-cartesian-axis-tick-value")).map((t) => t.getAttribute("fill"));
    expect(fills.length).toBeGreaterThan(4);
    expect(new Set(fills)).toEqual(new Set([AXIS_TICK_FILL_LIGHT]));
    expect(s.outerHTML).not.toContain("dark:");
  });

  it("puts the dashed line at the target ON THE PLOT'S SCALE — read against the Y axis's own ticks", () => {
    const s = section(renderReport(b, [a, b]))!;
    const labels = Array.from(s.querySelectorAll(".recharts-yAxis-tick-labels text")).map((t) => t.textContent);
    const ys = Array.from(s.querySelectorAll(".recharts-yAxis-tick-lines line")).map((l) => Number(l.getAttribute("y1")));
    const y = (label: string) => ys[labels.indexOf(label)]!;
    const line = s.querySelector(".recharts-reference-line line")!;
    expect(line.getAttribute("stroke-dasharray")).toBe("5 5");
    // 95 % of the way from the "0" tick to the "100" tick — not 95 % of the whole SVG.
    expect(Number(line.getAttribute("y1"))).toBeCloseTo(y("100") + 0.05 * (y("0") - y("100")), 6);
  });

  it("prints the model's caption under the key", () => {
    const s = section(renderReport(b, [a, b]))!;
    expect(Array.from(s.querySelectorAll("p")).map((p) => p.textContent)).toContain("Duration (days) · Dashed line: P95 target");
  });
});
