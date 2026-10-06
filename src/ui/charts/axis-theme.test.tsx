// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { createRef } from "react";

import { HistogramChart } from "./HistogramChart";
import { CDFChart } from "./CDFChart";
import { CDFComparisonChart } from "./CDFComparisonChart";
import { AXIS_TICK_FILL_LIGHT, AXIS_TICK_FILL_DARK, AXIS_TICK_FONT_SIZE } from "./axis-theme";
import { lastResizeObserver } from "../../test-stubs";
import type { HistogramBin, CDFPoint } from "@domain/models/types";

/**
 * Recharts axis tick labels follow the theme (WI-10, closes L10) — except CDFComparisonChart's,
 * which stay light in both themes (WI-101; the last test below).
 *
 * ⚠️ THE NODE COUNT IS ASSERTED BEFORE ANYTHING ELSE, and that is the whole
 * design of this file. The obvious selector for a tick label —
 * `.recharts-cartesian-axis-tick text` — matches ZERO nodes in Recharts 3.8.1,
 * because labels are not children of `.recharts-cartesian-axis-tick`; they sit
 * under `.recharts-cartesian-axis-tick-labels` while the lines sit under
 * `.recharts-cartesian-axis-tick-lines`. And "no tick sets a fill" is ALSO
 * what an empty NodeList reports, so the broken selector hands you exactly the
 * result you were looking for. `text.recharts-cartesian-axis-tick-value` is
 * the class Recharts' own code queries by.
 *
 * ⚠️ THE AXIS LINE IS ASSERTED UNCHANGED, and that is trap 3's only tripwire.
 * The tick colour is DERIVED from the axis `stroke` prop, so fixing the labels
 * by moving `stroke` works — and silently recolours the axis lines too. This
 * test fails if anyone does that; nothing else would notice.
 */
const BINS: HistogramBin[] = [
  { binStart: 10, binEnd: 12, count: 4 },
  { binStart: 12, binEnd: 14, count: 9 },
  { binStart: 14, binEnd: 16, count: 2 },
];
const POINTS: CDFPoint[] = [
  { value: 10, probability: 0.1 },
  { value: 13, probability: 0.5 },
  { value: 16, probability: 0.95 },
];

const root = () => document.documentElement;
const setDarkClass = async (on: boolean) =>
  act(async () => {
    if (on) root().classList.add("dark");
    else root().classList.remove("dark");
    await Promise.resolve();
  });

/**
 * `ResponsiveContainer` renders NOTHING at zero width, and jsdom reports zero for
 * every element — measured: a bare render yields 0 ticks, 0 axis lines and 0 svg.
 * Every assertion below would have passed vacuously on that empty chart, which is
 * exactly what the node-count assertions exist to catch. Driving the repo's own
 * ResizeObserver stub gives it a width; after that the same render yields 10 ticks
 * and 2 axis lines.
 */
async function renderSized(ui: React.ReactElement) {
  const result = render(ui);
  await act(async () => {
    lastResizeObserver()?.emit(800);
    await Promise.resolve();
  });
  return result;
}

afterEach(() => root().classList.remove("dark"));

const ticks = (c: HTMLElement) =>
  Array.from(c.querySelectorAll("text.recharts-cartesian-axis-tick-value"));
const axisLines = (c: HTMLElement) =>
  Array.from(c.querySelectorAll("line.recharts-cartesian-axis-line"));
const fills = (c: HTMLElement) => [...new Set(ticks(c).map((t) => t.getAttribute("fill")))];

describe("Recharts axis ticks follow the theme", () => {
  it("renders a non-zero number of tick labels, or nothing below means anything", async () => {
    const { container } = await renderSized(
      <HistogramChart
        bins={BINS}
        mean={13}
        percentileTarget={0.95}
        percentileValue={15}
        captureRef={createRef<HTMLDivElement>()}
      />,
    );
    expect(ticks(container).length).toBeGreaterThan(0);
    expect(axisLines(container).length).toBeGreaterThan(0);

    // Pin trap 4 so nobody "simplifies" the selector back: the obvious one
    // matches NOTHING here, and its zero is indistinguishable from a clean pass.
    expect(container.querySelectorAll(".recharts-cartesian-axis-tick text").length).toBe(0);
  });

  it("uses the light fill in light mode and the dark fill in dark mode", async () => {
    const { container } = await renderSized(
      <HistogramChart
        bins={BINS}
        mean={13}
        percentileTarget={0.95}
        percentileValue={15}
        captureRef={createRef<HTMLDivElement>()}
      />,
    );
    expect(ticks(container).length).toBeGreaterThan(0);
    expect(fills(container)).toEqual([AXIS_TICK_FILL_LIGHT]);

    await setDarkClass(true);
    expect(fills(container)).toEqual([AXIS_TICK_FILL_DARK]);

    // The defect was that the two were the SAME. Pin them apart explicitly, so a
    // future edit that collapses them cannot pass by matching both assertions.
    expect(AXIS_TICK_FILL_LIGHT).not.toBe(AXIS_TICK_FILL_DARK);
  });

  it("does NOT move the axis line colour (trap 3)", async () => {
    const { container } = await renderSized(
      <CDFChart
        points={POINTS}
        probabilityTarget={0.95}
        percentileValue={15}
        captureRef={createRef<HTMLDivElement>()}
      />,
    );
    const before = axisLines(container).map((l) => l.getAttribute("stroke"));
    expect(before.length).toBeGreaterThan(0);

    await setDarkClass(true);
    expect(axisLines(container).map((l) => l.getAttribute("stroke"))).toEqual(before);
    // ...and it is still Recharts' own default, i.e. no site set `stroke`.
    expect(new Set(before)).toEqual(new Set(["#666"]));
  });

  /**
   * ⚠️ The ONE chart whose ticks do NOT follow the theme (WI-101). CDFComparisonChart renders
   * only inside the comparison's copied region, which stays white in both themes, so its ticks
   * keep their light colour in dark mode too.
   *
   * ⚠️ Dark mode is set BEFORE the render. A chart that read the class without subscribing would
   * pass a light-then-dark sequence by never re-rendering; rendered in dark, it shows dark ticks
   * and fails. And the comparison is against CDFChart RENDERED in the same theme — a chart that does
   * follow it — not only against the constants, which a collapsed pair of constants would satisfy.
   */
  it("keeps CDFComparisonChart's ticks light in dark mode — it sits in the comparison's white region", async () => {
    await setDarkClass(true);
    const comparison = await renderSized(
      <CDFComparisonChart
        datasets={[{ id: "s-base", label: "Base", color: "#2563eb", points: POINTS }]}
        caption="Duration (days) · Dashed line: P95 target"
      />,
    );
    expect(ticks(comparison.container).length).toBeGreaterThan(0);
    const followsTheme = await renderSized(
      <CDFChart
        points={POINTS}
        probabilityTarget={0.95}
        percentileValue={15}
        captureRef={createRef<HTMLDivElement>()}
      />,
    );
    expect(ticks(followsTheme.container).length).toBeGreaterThan(0);

    expect(fills(comparison.container)).toEqual([AXIS_TICK_FILL_LIGHT]);
    expect(fills(followsTheme.container)).toEqual([AXIS_TICK_FILL_DARK]);
    expect(fills(comparison.container)).not.toEqual(fills(followsTheme.container));

    // ...and leaving dark mode changes nothing on it.
    await setDarkClass(false);
    expect(fills(comparison.container)).toEqual([AXIS_TICK_FILL_LIGHT]);
  });

  it("sets the tick font size to the on-screen floor", async () => {
    const { container } = await renderSized(
      <CDFChart
        points={POINTS}
        probabilityTarget={0.95}
        percentileValue={15}
        captureRef={createRef<HTMLDivElement>()}
      />,
    );
    expect(ticks(container).length).toBeGreaterThan(0);
    expect(AXIS_TICK_FONT_SIZE).toBe(12);
    for (const t of ticks(container)) {
      expect(Number(t.getAttribute("font-size"))).toBe(12);
    }
  });
});
