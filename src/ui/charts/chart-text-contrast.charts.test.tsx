// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, afterEach, beforeAll, afterAll } from "vitest";
import { render, act, cleanup, fireEvent } from "@testing-library/react";
import { createRef } from "react";

import { HistogramChart } from "./HistogramChart";
import { CDFChart } from "./CDFChart";
import { CDFComparisonChart } from "./CDFComparisonChart";
import { SimulationPanel } from "@ui/components/SimulationPanel";
import { PrintableReport } from "@ui/components/PrintableReport";
import { createActivity, createProject, createScenario } from "@app/api/project-service";
import type { CDFPoint, HistogramBin, Scenario, SimulationRun } from "@domain/models/types";
import type { StubResizeObserver } from "../../test-stubs";

/**
 * The simulation charts' text is readable on its own ground (WI-102, v0.79.3): the histogram's Mean, Buffer and P95
 * labels; the cumulative distribution chart's axis titles, P95 label and "Finish by" readout (its label in the chart
 * and the "% probability" line beside the date field); the comparison chart's scenario names and axis title; and the
 * printed comparison chart's axis title.
 *
 * ⚠️ Contrast is computed HERE, from the WCAG 2.x definition — never by calling the code under test. The expected
 * colours and the grounds are the measurements in the WI-102 prototype's CONTRAST.txt, written out as literals: the
 * charts' white #ffffff, the dark charts' #1e2939 (Tailwind 4's gray-800), and the histogram's buffer area #ebf3fe
 * light / #21324c dark (its #3b82f6 at 10 % over each — the composite agrees).
 */

/** WCAG 2.x relative luminance of #rrggbb. */
function luminance(hex: string): number {
  const channel = (at: number) => {
    const s = parseInt(hex.slice(at, at + 2), 16) / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** WCAG 2.x contrast ratio between two #rrggbb colours. */
function contrast(a: string, b: string): number {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** "#rrggbb" or jsdom's "rgb(r, g, b)" as lower-case #rrggbb; anything else throws. */
function hexOf(css: string | null | undefined): string {
  const s = (css ?? "").trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(s)) return s;
  const m = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(s);
  if (!m) throw new Error(`not a colour: "${css}"`);
  return `#${[m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, "0")).join("")}`;
}

const AA = 4.5;
const GROUND = { light: "#ffffff", dark: "#1e2939" } as const;
const BUFFER_GROUND = { light: "#ebf3fe", dark: "#21324c" } as const;
type Theme = keyof typeof GROUND;
const THEMES: Theme[] = ["light", "dark"];

// Every ResponsiveContainer needs a width, and the panel holds two: wrap the repo's stub to keep each observer.
const observers: StubResizeObserver[] = [];
const BaseResizeObserver = globalThis.ResizeObserver;
beforeAll(() => {
  globalThis.ResizeObserver = function (cb: ResizeObserverCallback) {
    const o = new BaseResizeObserver(cb) as unknown as StubResizeObserver;
    observers.push(o);
    return o;
  } as unknown as typeof ResizeObserver;
});
afterAll(() => {
  globalThis.ResizeObserver = BaseResizeObserver;
});

afterEach(() => {
  cleanup();
  observers.length = 0;
  document.documentElement.classList.remove("dark");
});

async function renderSized(ui: React.ReactElement, theme: Theme) {
  if (theme === "dark") document.documentElement.classList.add("dark");
  const result = render(ui);
  await act(async () => {
    for (const o of observers) o.emit(800);
    await Promise.resolve();
  });
  return result.container;
}

/** The fill of the one Recharts label whose text starts with `prefix` — exactly one, or nothing below means anything. */
function labelFill(container: HTMLElement, prefix: string): string {
  const labels = Array.from(container.querySelectorAll("text.recharts-label")).filter((t) =>
    (t.textContent ?? "").startsWith(prefix),
  );
  expect(labels, `label "${prefix}"`).toHaveLength(1);
  return hexOf(labels[0]!.getAttribute("fill"));
}

// -- Histogram ---------------------------------------------------------------------

const BINS: HistogramBin[] = Array.from({ length: 10 }, (_, i) => ({ binStart: i * 10, binEnd: i * 10 + 10, count: 10 }));

/** CONTRAST.txt §4: each label's drawn colour, by theme. */
const HISTOGRAM_TEXT = {
  light: { "Mean:": "#b91c1c", Buffer: "#1d4ed8", "P95:": "#047857" },
  dark: { "Mean:": "#f87171", Buffer: "#60a5fa", "P95:": "#10b981" },
} as const;
const HISTOGRAM_LABELS = ["Mean:", "Buffer", "P95:"] as const;

describe("the histogram's labels (WI-102)", () => {
  it.each(THEMES.flatMap((theme) => HISTOGRAM_LABELS.map((label) => ({ theme, label }))))(
    "H1 $theme: \"$label\" reads at least 4.5:1 on its ground",
    async ({ theme, label }) => {
      const c = await renderSized(
        <HistogramChart
          bins={BINS}
          mean={40}
          percentileTarget={0.95}
          percentileValue={95}
          deterministicSpan={60}
          captureRef={createRef<HTMLDivElement>()}
        />,
        theme,
      );
      const fill = labelFill(c, label);
      expect(fill).toBe(HISTOGRAM_TEXT[theme][label]);
      const ground = label === "Buffer" ? BUFFER_GROUND[theme] : GROUND[theme];
      expect(contrast(fill, ground)).toBeGreaterThanOrEqual(AA);
    },
  );
});

// -- Cumulative distribution ---------------------------------------------------------

const POINTS: CDFPoint[] = [
  { value: 100, probability: 0.01 },
  { value: 130, probability: 0.5 },
  { value: 160, probability: 1 },
];

/** CONTRAST.txt §4: the axis titles and the P95 label take the tick colour — #4a5565 light, #99a1af dark. */
const CDF_TEXT = { light: "#4a5565", dark: "#99a1af" } as const;
const CDF_LABELS = ["Duration (days)", "Probability (%)", "P95 ="] as const;

describe("the cumulative distribution chart's axis titles and P95 label (WI-102)", () => {
  it.each(THEMES.flatMap((theme) => CDF_LABELS.map((label) => ({ theme, label }))))(
    "D1 $theme: \"$label\" reads at least 4.5:1 on the chart",
    async ({ theme, label }) => {
      const c = await renderSized(
        <CDFChart points={POINTS} probabilityTarget={0.95} percentileValue={150} captureRef={createRef<HTMLDivElement>()} />,
        theme,
      );
      const fill = labelFill(c, label);
      expect(fill).toBe(CDF_TEXT[theme]);
      expect(contrast(fill, GROUND[theme])).toBeGreaterThanOrEqual(AA);
    },
  );
});

// -- The "Finish by" readout (SimulationPanel → its line and the chart's label) --------

const SAMPLES = Array.from({ length: 100 }, (_, i) => i + 1);
const RESULTS: SimulationRun = {
  id: "wi102-run",
  timestamp: "2026-10-22T00:00:00.000Z",
  trialCount: SAMPLES.length,
  seed: "wi102",
  engineVersion: "1.1.1",
  percentiles: { 5: 5, 10: 10, 25: 25, 50: 50, 75: 75, 85: 85, 90: 90, 95: 95 },
  histogramBins: BINS,
  mean: 50.5,
  standardDeviation: 29,
  minSample: 1,
  maxSample: 100,
  samples: SAMPLES,
};
/** A date for each health: 90 of the 100 samples finish by the first (green, ≥ 80 %), 60 the second, 30 the third. */
const LOOKUP = { "2026-06-01": 90, "2026-06-02": 60, "2026-06-03": 30 } as Record<string, number>;
const CASES = [
  { health: "green", date: "2026-06-01", pct: "90%" },
  { health: "amber", date: "2026-06-02", pct: "60%" },
  { health: "red", date: "2026-06-03", pct: "30%" },
] as const;
/** CONTRAST.txt §4, "Finish by" label and "% probability" line. */
const HEALTH_TEXT = {
  light: { green: "#15803d", amber: "#b45309", red: "#dc2626" },
  dark: { green: "#4ade80", amber: "#f59e0b", red: "#f87171" },
} as const;

async function lookUp(theme: Theme, date: string) {
  const c = await renderSized(
    <SimulationPanel
      simulationResults={RESULTS}
      probabilityTarget={0.95}
      isRunning={false}
      progress={null}
      error={null}
      elapsedMs={null}
      allActivitiesValid={true}
      hasActivities={true}
      dateToWorkingDays={(iso) => LOOKUP[iso] ?? null}
      onRun={() => {}}
      onCancel={() => {}}
    />,
    theme,
  );
  const input = c.querySelector('input[name="finishByLookup"]') as HTMLInputElement;
  expect(input).not.toBeNull();
  await act(async () => {
    fireEvent.change(input, { target: { value: date } });
    await Promise.resolve();
  });
  return c;
}

describe("the \"Finish by\" readout (WI-102)", () => {
  it.each(THEMES.flatMap((theme) => CASES.map((k) => ({ theme, ...k }))))(
    "F1 $theme, $health: the \"% probability\" line reads at least 4.5:1",
    async ({ theme, health, date, pct }) => {
      const c = await lookUp(theme, date);
      const line = Array.from(c.querySelectorAll("span")).filter((s) => s.textContent === `${pct} probability`);
      expect(line).toHaveLength(1);
      const color = hexOf(line[0]!.style.color);
      expect(color).toBe(HEALTH_TEXT[theme][health]);
      expect(contrast(color, GROUND[theme])).toBeGreaterThanOrEqual(AA);
    },
  );

  it.each(THEMES.flatMap((theme) => CASES.map((k) => ({ theme, ...k }))))(
    "F2 $theme, $health: the chart's \"Finish by\" label reads at least 4.5:1",
    async ({ theme, health, date, pct }) => {
      const c = await lookUp(theme, date);
      const fill = labelFill(c, pct);
      expect(fill).toBe(HEALTH_TEXT[theme][health]);
      expect(contrast(fill, GROUND[theme])).toBeGreaterThanOrEqual(AA);
    },
  );
});

// -- The comparison chart, on screen and in print ------------------------------------

const EARLY: CDFPoint[] = [
  { value: 20, probability: 0.05 },
  { value: 25, probability: 0.5 },
  { value: 30, probability: 0.99 },
];
const LATE: CDFPoint[] = [
  { value: 30, probability: 0.05 },
  { value: 37, probability: 0.5 },
  { value: 45, probability: 0.99 },
];
const NAMES = ["Baseline", "Fast-track", "Stretch"];
/** The comparison chart is white in both themes (WI-101); its names and axis title take #4a5565 (CONTRAST.txt §4). */
const COMPARE_TEXT = "#4a5565";

/** The colour a legend name is drawn in: the nearest `style.color` from the element holding the text upward. */
function legendNameColor(container: HTMLElement, name: string): string {
  const holders = Array.from(container.querySelectorAll(".recharts-legend-wrapper *")).filter(
    (el) => el.textContent === name && !Array.from(el.children).some((ch) => ch.textContent === name),
  );
  expect(holders, `legend "${name}"`).toHaveLength(1);
  for (let el: Element | null = holders[0]!; el; el = el.parentElement) {
    const color = (el as HTMLElement).style?.color;
    if (color) return hexOf(color);
  }
  throw new Error(`legend "${name}" has no colour`);
}

describe("the comparison chart's scenario names and axis title (WI-102)", () => {
  const datasets = NAMES.map((label, i) => ({
    id: `s${i}`, label, points: i === 1 ? LATE : EARLY, color: ["#3b82f6", "#10b981", "#f59e0b"][i]!,
  }));

  it.each(THEMES)("K1 %s: each scenario's name reads at least 4.5:1 on the chart's white", async (theme) => {
    const c = await renderSized(<CDFComparisonChart datasets={datasets} probabilityTarget={0.95} caption="caption" />, theme);
    for (const name of NAMES) {
      const color = legendNameColor(c, name);
      expect(color, name).toBe(COMPARE_TEXT);
      expect(contrast(color, GROUND.light), name).toBeGreaterThanOrEqual(AA);
    }
  });

  it.each(THEMES)("K2 %s: \"Probability (%%)\" reads at least 4.5:1 on the chart's white", async (theme) => {
    const c = await renderSized(<CDFComparisonChart datasets={datasets} probabilityTarget={0.95} caption="caption" />, theme);
    const fill = labelFill(c, "Probability (%)");
    expect(fill).toBe(COMPARE_TEXT);
    expect(contrast(fill, GROUND.light)).toBeGreaterThanOrEqual(AA);
  });

  it("K3 print: the printed comparison chart's \"Probability (%)\" reads at least 4.5:1 on white", () => {
    const run = (s: Scenario, samples: number[]): Scenario => ({
      ...s,
      simulationResults: {
        id: `run-${s.id}`, timestamp: "2026-04-06T00:00:00.000Z", trialCount: samples.length, seed: "wi102",
        engineVersion: "1.1.1", percentiles: { 50: samples[2]!, 75: samples[3]!, 90: samples[4]!, 95: samples[5]! },
        histogramBins: [], mean: samples[2]!, standardDeviation: 1, minSample: samples[0]!, maxSample: samples[5]!, samples,
      },
    });
    const scenarioOf = (name: string): Scenario => {
      const s = createScenario(name, "2026-04-06");
      return { ...s, activities: [{ ...createActivity("Row 1", s.settings), min: 5, mostLikely: 10, max: 20 }] };
    };
    const a = run(scenarioOf("Fast-track"), [20, 22, 24, 26, 28, 30]);
    const b = run(scenarioOf("Baseline"), [30, 33, 36, 39, 42, 45]);
    const { container } = render(
      <PrintableReport
        project={{ ...createProject("Harbour works", "2026-04-06"), scenarios: [a, b] }}
        scenario={b}
        schedule={null}
        scheduledActivities={[]}
        buffer={null}
        scheduleError={null}
        compareScenarios={[a, b]}
        showActivityNumbers
      />,
    );
    const section = Array.from(container.querySelectorAll("section")).find(
      (s) => s.querySelector("h2")?.textContent === "Scenario Comparison",
    );
    expect(section).toBeDefined();
    const fill = labelFill(section!, "Probability (%)");
    expect(fill).toBe(COMPARE_TEXT);
    expect(contrast(fill, GROUND.light)).toBeGreaterThanOrEqual(AA);
  });
});
