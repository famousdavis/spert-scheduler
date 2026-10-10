// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { UnifiedActivityRow } from "./UnifiedActivityRow";
import { createScenario, createActivity } from "@app/api/project-service";
import { computeDeterministicSchedule } from "@core/schedule/deterministic";
import { RSM_LEVELS } from "@domain/models/types";
import type { Activity, DistributionType, RSMLevel } from "@domain/models/types";

/**
 * The activity grid's distribution sparkline (WI-77): the card above a row's Distribution cell, and
 * above its Confidence cell where the level changes the curve. It draws the distribution the
 * simulation samples from the row's estimate — its own numbers and Confidence (owner ruling,
 * 2026-10-08) — and on a planned row marks the scheduled duration the Duration cell shows (owner
 * ruling, 2026-10-10).
 *
 * ⚠️ EVERY EXPECTED NUMBER IS A LITERAL, worked out independently of the app: from each
 * distribution's closed form (Normal, the lognormal with the PERT mean and SD, the Beta-PERT
 * beta with its λ found by bisection on the variance, Triangular, Uniform) and standard normal
 * quantiles. None is computed here by calling the code under test.
 *
 * The card is 80 × 30: Min is drawn at x = 2 and Max at x = 78, so a value v sits at
 * x = 2 + 76 (v − Min) ÷ (Max − Min); y runs from 28 (the baseline) up to 2 (the top), and a curve
 * is drawn to its own highest point. Every test renders the real grid row, so it reads the card a
 * user hovers.
 */

afterEach(cleanup);

const settings = createScenario("S", "2026-10-12").settings;

function activity(
  min: number,
  mostLikely: number,
  max: number,
  distributionType: DistributionType,
  confidenceLevel: RSMLevel = "mediumConfidence",
  extra: Partial<Activity> = {}
): Activity {
  return { ...createActivity("A", settings), min, mostLikely, max, distributionType, confidenceLevel, ...extra };
}

/** The row's schedule entry at an Activity target, from the app's own deterministic schedule. */
function scheduled(a: Activity, target: number) {
  return computeDeterministicSchedule([a], "2026-10-12", target).activities[0];
}

function renderRow(a: Activity, target = 0.5, withSchedule = false) {
  const { container } = render(
    <UnifiedActivityRow
      activity={a}
      scheduledActivity={withSchedule ? scheduled(a, target) : undefined}
      activityProbabilityTarget={target}
      onUpdate={() => {}}
      onDelete={() => {}}
      onValidityChange={() => {}}
    />
  );
  const select = container.querySelector('select[data-field="distribution"]')!;
  const button = container.querySelector('button[data-field="confidence"]')!;
  return {
    distribution: select.parentElement!,
    // The Confidence cell is the grid track around the control's own wrapper.
    confidence: button.parentElement!.parentElement!,
    durationText: [...container.querySelectorAll("span")].map((s) => s.textContent).find((t) => /^\d+d$/.test(t ?? "")),
  };
}

/** The stroke of the card in `cell`, as points; empty when the cell has no card. */
function strokeOf(cell: Element): Array<[number, number]> {
  const d = cell.querySelectorAll("svg path")[1]?.getAttribute("d") ?? "";
  return d
    .replace(/^M /, "")
    .split(" L ")
    .filter((p) => p.length > 0)
    .map((p) => p.split(",").map(Number) as [number, number]);
}

function markX(cell: Element, mark: "duration" | "most-likely"): number | null {
  const line = cell.querySelector(`svg line[data-mark="${mark}"]`);
  return line ? Number(line.getAttribute("x1")) : null;
}

/** The class of the card in `cell` — the element that places it and shows it on hover — or `null`. */
function cardClass(cell: Element): string | null {
  return cell.querySelector("svg")?.parentElement?.parentElement?.getAttribute("class") ?? null;
}

/** The drawn curve's height at x, as a fraction of the card's 26 px: the highest stroke point over x. */
function heightAt(points: Array<[number, number]>, x: number): number {
  let best = 28;
  for (let i = 0; i + 1 < points.length; i++) {
    const [xa, ya] = points[i]!;
    const [xb, yb] = points[i + 1]!;
    if (x < Math.min(xa, xb) - 1e-9 || x > Math.max(xa, xb) + 1e-9) continue;
    const y = Math.abs(xb - xa) < 1e-12 ? Math.min(ya, yb) : ya + ((yb - ya) * (x - xa)) / (xb - xa);
    best = Math.min(best, y);
  }
  return (28 - best) / 26;
}

/** How much of the card's width the curve spends at half its height or more, in px. */
function widthAtHalf(points: Array<[number, number]>): number {
  let n = 0;
  for (let x = 2; x <= 78 + 1e-9; x += 0.05) if (heightAt(points, x) >= 0.5) n++;
  return n * 0.05;
}

/** The x of the curve's highest drawn point — the middle of the run, where rounding makes a flat top. */
function peakX(points: Array<[number, number]>): number {
  const top = Math.min(...points.map(([, y]) => y));
  const xs = points.filter(([, y]) => y === top).map(([x]) => x);
  return (Math.min(...xs) + Math.max(...xs)) / 2;
}

/** The x of the first highest point, as the stroke lists it. */
function firstPeakX(points: Array<[number, number]>): number {
  return points.reduce((best, p) => (p[1] < best[1] ? p : best))[0];
}

describe("The distribution sparkline: its curve is the distribution the simulation samples from the row's estimate", () => {
  it("T-Normal is centred on the PERT mean, not on Most Likely", () => {
    // 10 / 12 / 40: the PERT mean is (10 + 48 + 40) ÷ 6 = 16.333, at x = 2 + 76 × 6.333 ÷ 30 = 18.04.
    // Most Likely, 12, is at x = 7.07 — where the picture used to put the peak.
    const { distribution } = renderRow(activity(10, 12, 40, "normal"));
    expect(Math.abs(peakX(strokeOf(distribution)) - 18.044)).toBeLessThan(0.5);
    expect(markX(distribution, "most-likely")).toBeCloseTo(7.067, 2);
  });

  it("T-Normal's width follows Confidence: 12.7 px at half height at Near certainty, 72.7 at Guesstimate", () => {
    // 10 / 20 / 30, σ = 20 × RSM: 2 √(2 ln 2) × σ × 76 ÷ 20 = 12.655 px (RSM 0.0707) and 72.696 (RSM 0.4062).
    const near = widthAtHalf(strokeOf(renderRow(activity(10, 20, 30, "normal", "nearCertainty")).distribution));
    expect(Math.abs(near - 12.655)).toBeLessThan(0.6);
    const guess = widthAtHalf(strokeOf(renderRow(activity(10, 20, 30, "normal", "guesstimate")).distribution));
    expect(Math.abs(guess - 72.696)).toBeLessThan(0.6);
  });

  it("LogNormal peaks at its own mode, left of Most Likely on 10 / 30 / 40", () => {
    // Mean 28.333, SD 6: the mode is mean ÷ (1 + cv²)^1.5 = 26.529 days, at x = 43.87; Most Likely is at 52.67.
    const { distribution } = renderRow(activity(10, 30, 40, "logNormal"));
    expect(Math.abs(peakX(strokeOf(distribution)) - 43.873)).toBeLessThan(0.6);
  });

  it("T-Normal and LogNormal are redrawn when Confidence changes", () => {
    for (const type of ["normal", "logNormal"] as const) {
      const near = renderRow(activity(10, 12, 40, type, "nearCertainty")).distribution.querySelectorAll("svg path")[1]!.getAttribute("d");
      const guess = renderRow(activity(10, 12, 40, type, "guesstimate")).distribution.querySelectorAll("svg path")[1]!.getAttribute("d");
      expect(near, type).not.toBe(guess);
    }
  });

  it("a T-Normal tail runs open off the frame, at its true height, and the area under it is filled down to the baseline", () => {
    // 10 / 12 / 40 Medium: at Min the density is exp(−½ (6.333 ÷ 6)²) = 0.5729 of the peak, y = 13.11.
    const { distribution } = renderRow(activity(10, 12, 40, "normal"));
    const points = strokeOf(distribution);
    expect(points[0]![0]).toBe(2);
    expect(Math.abs(points[0]![1] - 13.105)).toBeLessThan(0.3);
    // Open: no wall down to the baseline, because the distribution runs on below Min.
    expect(points[0]).not.toEqual([2, 28]);
    // The fill is the stroke closed along the baseline, from Min's foot to Max's, so the area under an
    // open tail is filled too: "M 2,28 L" + the stroke's points + "L 78,28 Z".
    const [fill, stroke] = [...distribution.querySelectorAll("svg path")].map((p) => p.getAttribute("d")!);
    expect(stroke!.startsWith("M 2.0,")).toBe(true);
    expect(fill).toBe(`M 2,28 L ${stroke!.slice(2)} L 78,28 Z`);
  });

  it("a Beta-PERT whose Most Likely equals Min climbs a wall at Min to a finite top, then falls to the baseline at Max", () => {
    // 5 / 5 / 20: α = 1, so the density is highest, and finite, at Min itself; β = 3.87 > 1, so it is 0 at Max.
    const points = strokeOf(renderRow(activity(5, 5, 20, "betaPert")).distribution);
    expect(points[0]).toEqual([2, 28]);
    expect(points[1]).toEqual([2, 2]);
    expect(points.at(-1)).toEqual([78, 28]);
  });

  it("Uniform fills the card: flat at the top, walled at Min and Max, with no Most Likely line", () => {
    const { distribution } = renderRow(activity(10, 12, 40, "uniform"));
    const points = strokeOf(distribution);
    expect(points.slice(1, -1).every(([, y]) => y === 2)).toBe(true);
    expect(points[0]).toEqual([2, 28]);
    expect(points.at(-1)).toEqual([78, 28]);
    // Uniform's shape does not depend on Most Likely, so no line marks it (the curve above is the control).
    expect(markX(distribution, "most-likely")).toBeNull();
  });

  it("a standard deviation set directly is drawn: with SD 20, T-Normal 10 / 12 / 40 still stands at half its peak at Max", () => {
    // exp(−½ ((40 − 16.333) ÷ 20)²) = 0.4965 of the peak, y = 15.09. With the level's own SD (6) it is 0.0004, y = 27.99.
    const set = strokeOf(renderRow(activity(10, 12, 40, "normal", "mediumConfidence", { sdOverride: 20 })).distribution);
    expect(Math.abs(set.at(-1)![1] - 15.091)).toBeLessThan(0.3);
    const own = strokeOf(renderRow(activity(10, 12, 40, "normal")).distribution);
    expect(Math.abs(own.at(-1)![1] - 27.989)).toBeLessThan(0.3);
  });

  it("a point estimate whose standard deviation was set directly draws its bell, centred on the estimate", () => {
    // 5 / 5 / 5 with SD 2: framed on its central 99.8 %, 5 ∓ 2 × 3.0902, the low end clamped at 0 days —
    // 0 to 11.1805 — so the peak, at 5, is at x = 2 + 76 × 5 ÷ 11.1805 = 35.99.
    const { distribution } = renderRow(activity(5, 5, 5, "normal", "mediumConfidence", { sdOverride: 2 }));
    expect(Math.abs(peakX(strokeOf(distribution)) - 35.988)).toBeLessThan(0.5);
  });

  it("a Beta-PERT that climbs almost straight up at Min is drawn so: half a pixel in, it is at 0.96 of its peak", () => {
    // 10 / 12 / 40 Guesstimate: α = 1.028, β = 1.393. At x = 2.5 (10.197 days) the density is 0.9604 of the peak.
    const points = strokeOf(renderRow(activity(10, 12, 40, "betaPert", "guesstimate")).distribution);
    expect(Math.abs(heightAt(points, 2.5) - 0.9604)).toBeLessThan(0.04);
  });

  it("Beta-PERT's curve is its own, not T-Normal's, on the same estimate", () => {
    const beta = strokeOf(renderRow(activity(10, 12, 40, "betaPert")).distribution);
    const normal = strokeOf(renderRow(activity(10, 12, 40, "normal")).distribution);
    expect(beta.length).toBeGreaterThan(0);
    expect(beta).not.toEqual(normal);
  });

  it("Beta-PERT peaks exactly at Most Likely, at the top of the card", () => {
    // 10 / 12 / 40: Most Likely is 2 ÷ 30 of the way along 76 px from x = 2, so x = 7.1 (to the stroke's 0.1 px).
    const skewed = strokeOf(renderRow(activity(10, 12, 40, "betaPert")).distribution);
    expect(firstPeakX(skewed)).toBe(7.1);
    expect(Math.min(...skewed.map(([, y]) => y))).toBe(2);
    // A symmetric estimate peaks in the middle; a Most Likely between two columns is drawn too: 2.5 ÷ 30 → 8.3.
    expect(firstPeakX(strokeOf(renderRow(activity(10, 20, 30, "betaPert")).distribution))).toBe(40);
    const offGrid = strokeOf(renderRow(activity(10, 12.5, 40, "betaPert")).distribution);
    expect(firstPeakX(offGrid)).toBe(8.3);
    expect(Math.min(...offGrid.map(([, y]) => y))).toBe(2);
  });

  it("Beta-PERT is redrawn at the row's Confidence: narrower at High than at Medium, and at Medium than at Low", () => {
    // 10 / 20 / 30 at half height: 25.1 px at High, 34.5 at Medium, 53.7 at Low.
    const width = (level: RSMLevel) => widthAtHalf(strokeOf(renderRow(activity(10, 20, 30, "betaPert", level)).distribution));
    const high = width("highConfidence");
    const medium = width("mediumConfidence");
    const low = width("lowConfidence");
    expect(high).toBeLessThan(medium);
    expect(medium).toBeLessThan(low);
  });

  it("never draws a NaN, at any level, for any in-order Beta-PERT estimate", () => {
    // "Does not throw" would pass on d="M 2.0,NaN …"; this reads the drawn paths themselves.
    let drawn = 0;
    for (const level of RSM_LEVELS) {
      for (const [min, ml, max] of [[0, 0, 1], [0, 1, 1], [10, 12, 40], [10, 38, 40], [1, 2, 3], [0, 5, 100], [5, 5.5, 6]] as const) {
        const paths = renderRow(activity(min, ml, max, "betaPert", level)).distribution.querySelectorAll("svg path");
        expect(paths).toHaveLength(2);
        for (const path of paths) expect(path.getAttribute("d")).not.toMatch(/NaN|Infinity/);
        drawn++;
        cleanup();
      }
    }
    expect(drawn).toBe(70);
  });

  it("Triangular is its exact triangle: the apex at Most Likely at the top, both ends on the baseline", () => {
    // 10 / 12 / 40: the apex at x = 7.067; every drawn point lies on one of the two straight sides.
    const points = strokeOf(renderRow(activity(10, 12, 40, "triangular")).distribution);
    const side = (x: number) => (x <= 7.0667 ? (x - 2) / 5.0667 : (78 - x) / 70.9333);
    for (const [x, y] of points) expect(Math.abs(28 - y - 26 * side(x))).toBeLessThan(0.3);
    expect(Math.abs(firstPeakX(points) - 7.067)).toBeLessThan(0.05);
    expect(points[0]).toEqual([2, 28]);
    expect(points.at(-1)).toEqual([78, 28]);
  });
});

describe("The distribution sparkline: its card", () => {
  it("is not drawn at all for an out-of-order estimate, of any type, or for LogNormal at zero", () => {
    // Nothing is sampled for a flagged row until it is fixed — not even an empty box.
    for (const [min, ml, max, type] of [
      [10, 50, 40, "betaPert"],
      [10, 50, 40, "normal"],
      [10, 50, 40, "logNormal"],
      [10, 50, 40, "triangular"],
      [20, 10, 30, "uniform"],
      [0, 0, 0, "logNormal"],
    ] as const) {
      const { distribution } = renderRow(activity(min, ml, max, type));
      expect(distribution.querySelector("svg"), `${min}/${ml}/${max} ${type}`).toBeNull();
      expect(distribution.querySelector(".bottom-full"), `${min}/${ml}/${max} ${type}`).toBeNull();
      cleanup();
    }
    // Control: an in-order row has its card.
    expect(renderRow(activity(10, 12, 40, "normal")).distribution.querySelector("svg")).not.toBeNull();
  });

  it("shows on the Confidence cell too, against the cell's right edge, shown only while its cell is hovered, where the level changes the curve, and not where it cannot", () => {
    const tNormal = renderRow(activity(10, 12, 40, "normal"));
    expect(tNormal.confidence.querySelector("svg")).not.toBeNull();
    expect(strokeOf(tNormal.confidence)).toEqual(strokeOf(tNormal.distribution));
    // Each card is hidden until its cell is hovered — a `group relative` cell, a card shown by
    // `group-hover:block` — which jsdom cannot do, so this pins the RENDERED CLASSES. The Distribution
    // card is centred on its 110-px cell. The 90-px card overhangs the 75-px Confidence cell, so there it
    // sits against the cell's right edge and overhangs only to the left: centred, its right side, where
    // Max is drawn, was clipped by the grid's scroll container (owner ruling, 2026-10-10).
    expect(tNormal.confidence.getAttribute("class")).toBe("group relative");
    expect(cardClass(tNormal.distribution)).toBe(
      "absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-20 pointer-events-none"
    );
    expect(cardClass(tNormal.confidence)).toBe(
      "absolute bottom-full right-0 mb-1 hidden group-hover:block z-20 pointer-events-none"
    );
    cleanup();
    // Triangular's shape does not depend on the level: its Confidence cell shows the dash, and no card.
    const triangular = renderRow(activity(10, 12, 40, "triangular"));
    expect(triangular.distribution.querySelector("svg")).not.toBeNull();
    expect(triangular.confidence.querySelector("svg")).toBeNull();
    cleanup();
    // Nor does T-Normal's, once its standard deviation was set directly: the dash, and no card there,
    // while its Distribution cell keeps its card.
    const setDirectly = renderRow(activity(10, 12, 40, "normal", "mediumConfidence", { sdOverride: 5 }));
    expect(setDirectly.distribution.querySelector("svg")).not.toBeNull();
    expect(setDirectly.confidence.querySelector("svg")).toBeNull();
  });
});

describe("The distribution sparkline: the scheduled duration", () => {
  it("is marked at the number the Duration cell shows, on three rows", () => {
    // Duration = max(1, ⌈quantile at the target⌉), P50 here. T-Normal 10 / 12 / 40: ⌈16.333⌉ = 17, x = 19.733.
    const tNormal = renderRow(activity(10, 12, 40, "normal"), 0.5, true);
    expect(tNormal.durationText).toBe("17d");
    expect(markX(tNormal.distribution, "duration")).toBeCloseTo(19.733, 2);
    cleanup();
    // LogNormal 10 / 30 / 40: the median is exp(μ) = 27.719, ⌈⌉ = 28, x = 47.6.
    const logNormal = renderRow(activity(10, 30, 40, "logNormal"), 0.5, true);
    expect(logNormal.durationText).toBe("28d");
    expect(markX(logNormal.distribution, "duration")).toBeCloseTo(47.6, 2);
    cleanup();
    // Triangular 10 / 12 / 40: 40 − √(0.5 × 30 × 28) = 19.506, ⌈⌉ = 20, x = 27.333.
    const triangular = renderRow(activity(10, 12, 40, "triangular"), 0.5, true);
    expect(triangular.durationText).toBe("20d");
    expect(markX(triangular.distribution, "duration")).toBeCloseTo(27.333, 2);
  });

  it("moves with the Activity target: 17 days at P50, 22 at P80", () => {
    // T-Normal 10 / 12 / 40: P80 = 16.333 + 0.8416 × 6 = 21.383, ⌈⌉ = 22, x = 2 + 76 × 12 ÷ 30 = 32.4.
    const p50 = renderRow(activity(10, 12, 40, "normal"), 0.5, true);
    expect(p50.durationText).toBe("17d");
    expect(markX(p50.distribution, "duration")).toBeCloseTo(19.733, 2);
    cleanup();
    const p80 = renderRow(activity(10, 12, 40, "normal"), 0.8, true);
    expect(p80.durationText).toBe("22d");
    expect(markX(p80.distribution, "duration")).toBeCloseTo(32.4, 2);
  });

  it("is marked on the Confidence cell's card too", () => {
    const { confidence } = renderRow(activity(10, 12, 40, "normal"), 0.5, true);
    expect(markX(confidence, "duration")).toBeCloseTo(19.733, 2);
  });

  it("is not marked on an in-progress or a complete row, with or without days worked or an actual: the line is for planned rows", () => {
    // The rule is the status, not whether days worked or an actual duration are set: each status is
    // tried with them and without. The Duration cell is read too — on a row in progress it is
    // max(days worked + 1, the planned 17), so 3 days worked still shows the planned number.
    const cases: Array<[Partial<Activity>, string]> = [
      [{ status: "inProgress", actualDuration: 3 }, "17d"],
      [{ status: "inProgress" }, "17d"],
      [{ status: "complete", actualDuration: 15 }, "15d"],
      [{ status: "complete" }, "17d"],
    ];
    for (const [extra, shown] of cases) {
      const label = `${extra.status} ${extra.actualDuration ?? "none"}`;
      const row = renderRow(activity(10, 12, 40, "normal", "mediumConfidence", extra), 0.5, true);
      expect(row.durationText, label).toBe(shown);
      expect(row.distribution.querySelector("svg"), label).not.toBeNull();
      expect(markX(row.distribution, "duration"), label).toBeNull();
      cleanup();
    }
    // Control: the same row, planned, is marked.
    expect(markX(renderRow(activity(10, 12, 40, "normal"), 0.5, true).distribution, "duration")).not.toBeNull();
  });

  it("is not marked where there is no curve", () => {
    // Out of order (its schedule still builds: 42 days) and a point estimate (5 days): no card, so no mark.
    for (const a of [activity(10, 50, 40, "normal"), activity(5, 5, 5, "normal")]) {
      const { distribution } = renderRow(a, 0.5, true);
      expect(distribution.querySelector('line[data-mark="duration"]')).toBeNull();
      cleanup();
    }
    // Control: a row with a curve and a schedule is marked.
    expect(markX(renderRow(activity(10, 12, 40, "normal"), 0.5, true).distribution, "duration")).not.toBeNull();
  });

  it("past Max is drawn on Max's edge, and below Min on Min's", () => {
    // T-Normal 10 / 20 / 30 Guesstimate at P95: 20 + 1.6449 × 8.124 = 33.363, ⌈⌉ = 34 — past Max (30).
    const high = renderRow(activity(10, 20, 30, "normal", "guesstimate"), 0.95, true);
    expect(high.durationText).toBe("34d");
    expect(markX(high.distribution, "duration")).toBe(78);
    cleanup();
    // T-Normal 10 / 10 / 40 Guesstimate at P30: 15 − 0.5244 × 12.186 = 8.610, ⌈⌉ = 9 — below Min (10).
    const low = renderRow(activity(10, 10, 40, "normal", "guesstimate"), 0.3, true);
    expect(low.durationText).toBe("9d");
    expect(markX(low.distribution, "duration")).toBe(2);
  });
});

describe("The distribution sparkline: its two dashed lines", () => {
  it("are drawn opaque, in the colours measured at 3:1 or more against the card and the fill, in both themes", () => {
    // jsdom computes no colour, so this pins the RENDERED CLASSES; the contrast itself was measured in a browser,
    // composited through a canvas against the white and gray-800 cards and the blue fill under the curve. The Most
    // Likely line had a 0.6 opacity and read under 3:1 in light mode (owner ruling, 2026-10-10).
    const { distribution } = renderRow(activity(10, 12, 40, "normal"), 0.5, true);
    const mostLikely = distribution.querySelector('svg line[data-mark="most-likely"]');
    expect(mostLikely).not.toBeNull();
    expect(mostLikely!.getAttribute("class")).toBe("stroke-blue-600 dark:stroke-blue-300");
    expect(mostLikely!.getAttribute("opacity")).toBeNull();
    const duration = distribution.querySelector('svg line[data-mark="duration"]');
    expect(duration).not.toBeNull();
    expect(duration!.getAttribute("class")).toBe("stroke-green-700 dark:stroke-green-400");
    expect(duration!.getAttribute("opacity")).toBeNull();
    cleanup();
    // Where the two coincide, the green is drawn over the blue (owner ruling, 2026-10-10): the duration line is the
    // card's LAST <line>. T-Normal 10 / 20 / 30 at P50: its median is the PERT mean, (10 + 80 + 30) ÷ 6 = 20, so the
    // Duration is ⌈20⌉ = 20 — Most Likely — and both lines sit at x = 2 + 76 × 10 ÷ 20 = 40.
    const both = renderRow(activity(10, 20, 30, "normal"), 0.5, true);
    expect(both.durationText).toBe("20d");
    const lines = [...both.distribution.querySelectorAll("svg line")];
    expect(lines.map((l) => [l.getAttribute("data-mark"), Number(l.getAttribute("x1"))])).toEqual([
      ["most-likely", 40],
      ["duration", 40],
    ]);
  });
});
