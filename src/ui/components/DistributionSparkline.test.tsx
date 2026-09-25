// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { DistributionSparkline } from "./DistributionSparkline";
import { RSM_LEVELS } from "@domain/models/types";
import type { DistributionType, RSMLevel } from "@domain/models/types";

afterEach(cleanup);

/** The grid's own size: an 80 × 30 box, 2px padding, so y runs from 2 (top) to 28. */
function draw(
  min: number,
  mostLikely: number,
  max: number,
  distributionType: DistributionType,
  confidenceLevel: RSMLevel = "mediumConfidence"
) {
  const { container } = render(
    <DistributionSparkline
      min={min}
      mostLikely={mostLikely}
      max={max}
      distributionType={distributionType}
      confidenceLevel={confidenceLevel}
      width={80}
      height={30}
    />
  );
  const paths = Array.from(container.querySelectorAll("path"));
  const stroke = paths[1]?.getAttribute("d") ?? "";
  const points = stroke
    .replace(/^M /, "")
    .split(" L ")
    .filter((p) => p.length > 0)
    .map((p) => p.split(",").map(Number) as [number, number]);
  return { container, paths, stroke, points };
}

/** The x at which the drawn curve is highest (smallest SVG y). */
function peakX(points: Array<[number, number]>): number {
  return points.reduce((best, p) => (p[1] < best[1] ? p : best))[0];
}

/** How many of the curve's points sit above half height — a width, in samples. */
function pointsAboveHalf(points: Array<[number, number]>): number {
  return points.filter(([, y]) => y < 15).length;
}

describe("DistributionSparkline — Beta-PERT", () => {
  it("draws its own curve, not the T-Normal bell that an unknown type falls back to", () => {
    const beta = draw(10, 12, 40, "betaPert");
    const bell = draw(10, 12, 40, "normal");
    expect(beta.stroke).not.toBe("");
    expect(beta.stroke).not.toBe(bell.stroke);
  });

  it("peaks exactly at Most Likely, at the top of the box", () => {
    // 10/12/40: Most Likely is 2/30 of the way along 76px from x = 2, so x = 7.1.
    const { points } = draw(10, 12, 40, "betaPert");
    expect(peakX(points)).toBe(7.1);
    expect(Math.min(...points.map(([, y]) => y))).toBe(2);
    // A symmetric estimate peaks in the middle.
    expect(peakX(draw(10, 20, 30, "betaPert").points)).toBe(40);
    // And a Most Likely between the even samples is drawn too, at the top: 2.5/30 of 76px → 8.3.
    const offGrid = draw(10, 12.5, 40, "betaPert").points;
    expect(peakX(offGrid)).toBe(8.3);
    expect(Math.min(...offGrid.map(([, y]) => y))).toBe(2);
  });

  it("is a J with a FINITE peak at Min when Most Likely equals Min", () => {
    const { points } = draw(5, 5, 20, "betaPert");
    expect(points[0]).toEqual([2, 2]);
    // …and falls away from it: the far end sits on the baseline.
    expect(points.at(-1)).toEqual([78, 28]);
  });

  it("is redrawn at the row's Confidence: narrower at High than at Medium, and at Medium than at Low", () => {
    const high = pointsAboveHalf(draw(10, 20, 30, "betaPert", "highConfidence").points);
    const medium = pointsAboveHalf(draw(10, 20, 30, "betaPert", "mediumConfidence").points);
    const low = pointsAboveHalf(draw(10, 20, 30, "betaPert", "lowConfidence").points);
    expect(high).toBeLessThan(medium);
    expect(medium).toBeLessThan(low);
  });

  it("draws NO curve and no marker for an out-of-order estimate", () => {
    // The grid renders the sparkline for any row that is not a point estimate, so an
    // out-of-order row reaches here; its distribution cannot even be built.
    for (const [min, ml, max] of [[10, 50, 40], [20, 10, 30], [5, 7, 5], [5, 6, 5]] as const) {
      const { container } = draw(min, ml, max, "betaPert");
      expect(container.querySelectorAll("path")).toHaveLength(0);
      expect(container.querySelectorAll("line")).toHaveLength(0);
      cleanup();
    }
  });

  it("never draws a NaN, at any level, for any in-order estimate", () => {
    // "Does not throw" would pass on d="M 2.0,NaN …"; this reads the drawn paths themselves.
    let drawn = 0;
    for (const level of RSM_LEVELS) {
      for (const [min, ml, max] of [[0, 0, 1], [0, 1, 1], [10, 12, 40], [10, 38, 40], [1, 2, 3], [0, 5, 100], [5, 5.5, 6]] as const) {
        const { paths } = draw(min, ml, max, "betaPert", level);
        expect(paths).toHaveLength(2);
        for (const path of paths) expect(path.getAttribute("d")).not.toMatch(/NaN|Infinity/);
        drawn++;
        cleanup();
      }
    }
    expect(drawn).toBe(70);
  });

  it("leaves the other distributions' pictures alone (control: Triangular still draws its triangle)", () => {
    const { stroke } = draw(10, 12, 40, "triangular");
    expect(stroke).toBe("M 2,28 L 7.066666666666666,2 L 78,28");
  });
});
