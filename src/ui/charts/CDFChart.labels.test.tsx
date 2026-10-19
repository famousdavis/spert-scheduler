// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import { render, act } from "@testing-library/react";
import { createRef } from "react";

import { CDFChart } from "./CDFChart";
import { lastResizeObserver } from "../../test-stubs";
import type { CDFPoint } from "@domain/models/types";

/**
 * Where the Cumulative Distribution chart draws its two reference-line labels (WI-127, v0.78.1 and v0.78.2).
 *
 * Before v0.78.1 the project-target label ("P95 = … days") was drawn to the RIGHT of the plot, in the
 * 30 px margin of an `overflow: hidden` svg, so only "P95" showed; and the Finish-by label ended
 * just left of its line, so a line near the left edge lost the label's first characters. The
 * project-target label now sits inside the plot's right end. The Finish-by label of a line before the
 * middle of the range sits at the top, to the line's right; of a line at or past the middle, at the top,
 * to the line's left — unless the project target is P96 or higher, when it sits at the bottom, to the
 * line's left (from P96 the target line's label rises into the top label's strip).
 *
 * Every expectation below is a relation read off the rendered svg (the label's anchor and coordinates
 * against its own line's), never a value computed by calling the chart's code. The x-axis domain is
 * `dataMin…dataMax`, and these points span exactly 100…160, so its middle is 130 by construction.
 */
const POINTS: CDFPoint[] = [
  { value: 100, probability: 0.01 },
  { value: 115, probability: 0.2 },
  { value: 130, probability: 0.5 },
  { value: 145, probability: 0.8 },
  { value: 160, probability: 1 },
];

const TARGET_LABEL = "WI-127 finish target";

/**
 * `ResponsiveContainer` renders nothing at zero width, and jsdom reports zero for every element —
 * the repo's ResizeObserver stub gives it a width (as `axis-theme.test.tsx` does).
 */
async function renderChart(props: { probabilityTarget: number; targetDuration?: number }) {
  const result = render(
    <CDFChart
      points={POINTS}
      probabilityTarget={props.probabilityTarget}
      percentileValue={150}
      targetDuration={props.targetDuration}
      targetProbability={props.targetDuration == null ? undefined : 40}
      targetLabel={TARGET_LABEL}
      captureRef={createRef<HTMLDivElement>()}
    />,
  );
  await act(async () => {
    lastResizeObserver()?.emit(800);
    await Promise.resolve();
  });
  return result;
}

const num = (el: Element, attr: string) => Number(el.getAttribute(attr));

/**
 * The label whose text starts with `prefix`, and its line: the one reference line of the given orientation.
 *
 * ⚠️ NOT "the line in the label's own `.recharts-reference-line`". In Recharts 3.8.1 a reference line's
 * label is not a child of that group: it is drawn in a separate z-index layer
 * (`g.recharts-zIndex-layer_2000`) directly under the svg, and `label.closest(".recharts-reference-line")`
 * is null — measured. Each chart here has at most one vertical line (the Finish-by line's, x1 = x2) and
 * one horizontal line (the project target's, y1 = y2), so orientation pairs each label with its line.
 */
function labelAndLine(container: HTMLElement, prefix: string, orientation: "vertical" | "horizontal") {
  const labels = Array.from(container.querySelectorAll("text.recharts-label")).filter((t) =>
    (t.textContent ?? "").startsWith(prefix),
  );
  // Exactly one, or nothing below means anything: an empty match would pass every relation vacuously.
  expect(labels).toHaveLength(1);
  const label = labels[0]!;
  const lines = Array.from(container.querySelectorAll("line.recharts-reference-line-line")).filter((l) =>
    orientation === "vertical"
      ? num(l, "x1") === num(l, "x2")
      : num(l, "y1") === num(l, "y2"),
  );
  expect(lines).toHaveLength(1);
  const line = lines[0]!;
  return {
    anchor: label.getAttribute("text-anchor"),
    x: num(label, "x"),
    y: num(label, "y"),
    x1: num(line, "x1"),
    x2: num(line, "x2"),
    y1: num(line, "y1"),
    y2: num(line, "y2"),
  };
}

/** Every number read must be finite: a missing attribute reads as 0 and NaN fails no `<` silently. */
function expectFinite(r: Record<string, unknown>) {
  for (const [k, v] of Object.entries(r)) {
    if (k !== "anchor") expect(Number.isFinite(v), `${k} = ${String(v)}`).toBe(true);
  }
}

describe("CDFChart draws each reference-line label inside the plot, beside its line (WI-127)", () => {
  it("T1 a Finish-by line before the middle of the range: label at the top, to the line's right", async () => {
    const { container } = await renderChart({ probabilityTarget: 0.95, targetDuration: 105 });
    const r = labelAndLine(container, TARGET_LABEL, "vertical");
    expectFinite(r);
    expect(r.anchor).toBe("start");
    expect(r.x).toBeGreaterThan(r.x1);
    expect(r.y).toBeLessThan((r.y1 + r.y2) / 2);
  });

  it("T2 a Finish-by line after the middle, target P95: label at the top, to the line's left", async () => {
    const { container } = await renderChart({ probabilityTarget: 0.95, targetDuration: 155 });
    const r = labelAndLine(container, TARGET_LABEL, "vertical");
    expectFinite(r);
    expect(r.anchor).toBe("end");
    expect(r.x).toBeLessThan(r.x1);
    expect(r.y).toBeLessThan((r.y1 + r.y2) / 2);
  });

  it("T3 a Finish-by line at the exact middle (130 of 100…160), target P95: as after the middle", async () => {
    const { container } = await renderChart({ probabilityTarget: 0.95, targetDuration: 130 });
    const r = labelAndLine(container, TARGET_LABEL, "vertical");
    expectFinite(r);
    expect(r.anchor).toBe("end");
    expect(r.x).toBeLessThan(r.x1);
    expect(r.y).toBeLessThan((r.y1 + r.y2) / 2);
  });

  it("T4 the project-target label at P95: inside the plot's right end, just below its line", async () => {
    const { container } = await renderChart({ probabilityTarget: 0.95 });
    const r = labelAndLine(container, "P95 = 150.0 days", "horizontal");
    expectFinite(r);
    expect(r.anchor).toBe("end");
    expect(r.x).toBeLessThanOrEqual(Math.max(r.x1, r.x2));
    expect(r.y).toBeGreaterThan(r.y1);
  });

  it("T5 the project-target label at P25: inside the plot's right end, just above its line", async () => {
    const { container } = await renderChart({ probabilityTarget: 0.25 });
    const r = labelAndLine(container, "P25 = 150.0 days", "horizontal");
    expectFinite(r);
    expect(r.x).toBeLessThanOrEqual(Math.max(r.x1, r.x2));
    expect(r.y).toBeLessThan(r.y1);
  });

  it("T6 a Finish-by line after the middle, target P96: label at the bottom, to the line's left", async () => {
    const { container } = await renderChart({ probabilityTarget: 0.96, targetDuration: 155 });
    const r = labelAndLine(container, TARGET_LABEL, "vertical");
    expectFinite(r);
    expect(r.anchor).toBe("end");
    expect(r.x).toBeLessThan(r.x1);
    expect(r.y).toBeGreaterThan((r.y1 + r.y2) / 2);
  });

  it("T7 a Finish-by line at the exact middle (130 of 100…160), target P99: as after the middle", async () => {
    const { container } = await renderChart({ probabilityTarget: 0.99, targetDuration: 130 });
    const r = labelAndLine(container, TARGET_LABEL, "vertical");
    expectFinite(r);
    expect(r.anchor).toBe("end");
    expect(r.x).toBeLessThan(r.x1);
    expect(r.y).toBeGreaterThan((r.y1 + r.y2) / 2);
  });

  it("T8 a Finish-by line before the middle, target P99: label at the top, to the line's right", async () => {
    const { container } = await renderChart({ probabilityTarget: 0.99, targetDuration: 105 });
    const r = labelAndLine(container, TARGET_LABEL, "vertical");
    expectFinite(r);
    expect(r.anchor).toBe("start");
    expect(r.x).toBeGreaterThan(r.x1);
    expect(r.y).toBeLessThan((r.y1 + r.y2) / 2);
  });
});
