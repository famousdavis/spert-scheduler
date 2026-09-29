// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, afterEach } from "vitest";
import { render, act, cleanup } from "@testing-library/react";

import { CDFComparisonChart } from "./CDFComparisonChart";
import type { CDFDataset } from "./cdf-comparison-data";
import { lastResizeObserver } from "../../test-stubs";
import type { CDFPoint } from "@domain/models/types";

/**
 * WI-61 — the screen's S-curves, three faults fixed (owner ruling, 2026-09-28):
 * the dashed line on the plot's own scale, the legend in the table's column order, and two scenarios
 * with one name drawn as two curves. Measured in Chrome on the sample: the line moved from 97.9 % to
 * 95.0 % of the plot and now spans the plot only; the plot's geometry is otherwise unchanged.
 *
 * `ResponsiveContainer` renders nothing at zero width, and jsdom reports zero for every element, so each
 * render drives the repo's ResizeObserver stub to 800 px (the axis-theme tests' method).
 */

afterEach(cleanup);

async function renderSized(ui: React.ReactElement) {
  const result = render(ui);
  await act(async () => {
    lastResizeObserver()?.emit(800);
    await Promise.resolve();
  });
  return result;
}

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
const CAPTION = "Duration (days) · Dashed line: P95 target";

const set = (...d: [string, string, CDFPoint[]][]): CDFDataset[] =>
  d.map(([id, label, points], i) => ({ id, label, points, color: ["#3b82f6", "#10b981", "#f59e0b"][i]! }));

describe("CDFComparisonChart — the three fixes", () => {
  it("draws the dashed line at the target ON THE PLOT'S SCALE, read against the Y axis's own ticks", async () => {
    const { container } = await renderSized(
      <CDFComparisonChart datasets={set(["z", "Zeta", EARLY], ["a", "Alpha", LATE])} probabilityTarget={0.95} caption={CAPTION} />
    );
    const labels = Array.from(container.querySelectorAll(".recharts-yAxis-tick-labels text")).map((t) => t.textContent);
    const ys = Array.from(container.querySelectorAll(".recharts-yAxis-tick-lines line")).map((l) => Number(l.getAttribute("y1")));
    expect(labels).toEqual(["0", "25", "50", "75", "100"]); // non-vacuity: the axis rendered
    const y = (label: string) => ys[labels.indexOf(label)]!;
    const line = container.querySelector(".recharts-reference-line line")!;
    expect(line.getAttribute("stroke-dasharray")).toBe("5 5");
    expect(Number(line.getAttribute("y1"))).toBeCloseTo(y("100") + 0.05 * (y("0") - y("100")), 6);
  });

  it("lists the legend in the datasets' (the table's column) order, not alphabetically", async () => {
    const { container } = await renderSized(
      <CDFComparisonChart datasets={set(["z", "Zeta", EARLY], ["a", "Alpha", LATE])} caption={CAPTION} />
    );
    const legend = Array.from(container.querySelectorAll(".recharts-legend-item-text")).map((t) => t.textContent);
    expect(legend).toEqual(["Zeta", "Alpha"]);
  });

  it("draws two curves for two scenarios with ONE name", async () => {
    const { container } = await renderSized(
      <CDFComparisonChart datasets={set(["s1", "Baseline", EARLY], ["s2", "Baseline", LATE])} caption={CAPTION} />
    );
    const paths = Array.from(container.querySelectorAll("path.recharts-line-curve")).map((p) => p.getAttribute("d"));
    expect(paths).toHaveLength(2);
    expect(paths[0]).not.toBe(paths[1]);
  });

  it("prints the caption it is given", async () => {
    const { getByText } = await renderSized(
      <CDFComparisonChart
        datasets={set(["z", "Zeta", EARLY], ["a", "Alpha", LATE])}
        probabilityTarget={0.9}
        caption="Duration (days) · Dashed line: Zeta's P90 target"
      />
    );
    expect(getByText("Duration (days) · Dashed line: Zeta's P90 target")).toBeDefined();
  });
});
