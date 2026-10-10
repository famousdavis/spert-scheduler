// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { Activity } from "@domain/models/types";
import type { Distribution } from "@core/distributions/distribution";
import { createDistributionForActivity } from "@core/distributions/factory";
import { estimateOrderIssues } from "@domain/helpers/estimate-rules";

/**
 * The geometry of the activity grid's distribution sparkline (WI-77).
 *
 * The curve is the density of THE distribution the simulation samples from the row's estimate — the
 * object `createDistributionForActivity` builds for the Monte Carlo engine, on the row's own Min, Most
 * Likely, Max, Confidence and any standard deviation set directly — for all five types
 * (owner ruling, 2026-10-08). Until WI-77 only Beta-PERT's was; T-Normal was a fixed-width bell
 * centred on Most Likely, although T-Normal is centred on the PERT mean, so on a right-skewed row
 * T-Normal and Beta-PERT both seemed to peak at Most Likely and a switch between them moved the
 * duration for no visible reason.
 *
 * It is the estimate as entered. Three things the simulation adds are not drawn: the floor under
 * every trial (the scheduled duration under Parkinson's Law, otherwise zero), the conditioning of a
 * row in progress on the days it has already worked, and a complete row's actual duration, used in
 * place of a draw — the last two where they are entered (owner ruling, 2026-10-10).
 *
 * ⚠️ THE DENSITY IS READ FROM THE OBJECT'S OWN `cdf`, by a central difference at each point. No
 * density formula is restated here, so a picture cannot drift from its sampling: a change to a
 * distribution, or a new type, is drawn from its `cdf` with no change in this file. (A sixth type
 * that the factory cannot build draws nothing, rather than another type's curve.)
 *
 * - FRAME: x runs from Min to Max, the row's own numbers, whatever the type, so a switch between
 *   types on one row keeps its axis. T-Normal and LogNormal run on past that frame; they are cut at
 *   its edges, where they end OPEN, while a distribution that ends at an edge (Beta-PERT,
 *   Triangular, Uniform, and a LogNormal whose Min is zero) is closed there by a vertical wall down
 *   to the baseline — so a curve cut off by the frame and one that ends there no longer look alike.
 * - SCALE: each curve is drawn to its own highest point in the frame, as before.
 * - NO CURVE (`null`) for a flagged estimate — out of order, or LogNormal at zero: Run refuses the
 *   row, so nothing is sampled for it until it is fixed — and for a point estimate, which has no
 *   spread to draw.
 */

/** The fields `createDistributionForActivity` reads to build the distribution. */
export type SparklineEstimate = Pick<
  Activity,
  "min" | "mostLikely" | "max" | "distributionType" | "confidenceLevel" | "sdOverride"
>;

export interface SparklineCurve {
  /** The area under the curve, closed along the baseline. */
  fill: string;
  /** The curve: walled at an edge where the distribution ends, open where it runs on past the frame. */
  stroke: string;
  /** The x of Most Likely; `null` for Uniform, whose curve does not depend on it. */
  mostLikelyX: number | null;
  /** The frame, in days, and where it sits in px: `lo` is drawn at `left`, `hi` at `right`. */
  lo: number;
  hi: number;
  left: number;
  right: number;
}

/**
 * The x at which this curve's frame puts `days`. A number outside the frame is drawn ON the edge it
 * lies beyond, never dropped: it happens only at the ends of the target range on a wide T-Normal or
 * LogNormal row, whose curve runs on past that same edge, or by a whole day of rounding past a
 * fractional Max — so the edge, on the side the number lies, is the truest place left to draw it.
 */
export function sparklineX(curve: SparklineCurve, days: number): number {
  const clipped = Math.min(curve.hi, Math.max(curve.lo, days));
  return curve.left + ((clipped - curve.lo) / (curve.hi - curve.lo)) * (curve.right - curve.left);
}

/** The space between the curve and the sparkline's edges, in px. */
const PAD = 2;

/**
 * Half the difference step, as a fraction of the frame: small enough that a Triangular's apex, a
 * corner, is read a hair low by a fraction of a pixel, and large enough that the CDFs' own error —
 * T-Normal's error function is an approximation, good to about 1e-7 — stays far below one.
 */
const STEP = 1e-4;

/** A zero-range estimate with a standard deviation set directly is framed on its central 99.8 %. */
const FRAME_TAIL = 0.001;

interface Frame {
  lo: number;
  hi: number;
}

/**
 * What an `Activity` needs beyond the estimate. The factory reads none of it but the name, and that
 * only to word an error this file discards, so any id, name and status will do.
 */
const SPARKLINE_ACTIVITY = { id: "sparkline", name: "", status: "planned" } as const;

/**
 * The distribution the simulation would sample for this estimate, or `null` where nothing is sampled:
 * an out-of-order triple (T-Normal, LogNormal and Uniform would still BUILD on one), or an estimate
 * the factory refuses, such as LogNormal at zero.
 */
function sampledDistribution(estimate: SparklineEstimate): Distribution | null {
  if (estimateOrderIssues(estimate.min, estimate.mostLikely, estimate.max).length > 0) return null;
  try {
    return createDistributionForActivity({ ...SPARKLINE_ACTIVITY, ...estimate });
  } catch {
    return null;
  }
}

/**
 * Min to Max. Where they are equal, only a T-Normal or LogNormal whose standard deviation was set
 * directly (a file import or the cloud) still has spread: it is framed on its central mass, never
 * below a zero duration. Every point estimate has none, and gets no frame.
 */
function sparklineFrame(estimate: SparklineEstimate, dist: Distribution): Frame | null {
  if (estimate.max > estimate.min) return { lo: estimate.min, hi: estimate.max };
  const lo = Math.max(0, dist.inverseCDF(FRAME_TAIL));
  const hi = dist.inverseCDF(1 - FRAME_TAIL);
  return hi > lo ? { lo, hi } : null;
}

/**
 * Points every fifth of a pixel inside the first and last pixel columns, where a curve can be
 * near-vertical. Fifths, not quarters: the path is written to a tenth of a pixel, and a quarter
 * would be rounded sideways by up to a twentieth — on a steep side, a quarter of a pixel up or down.
 */
const EDGE_STEPS = [0.2, 0.4, 0.6, 0.8, -0.8, -0.6, -0.4, -0.2];

/**
 * One point per pixel column, with Most Likely and the mean in place of the column point nearest
 * each: the peaks of Triangular and Beta-PERT (Most Likely) and of T-Normal (the mean) are then drawn
 * exactly, and drawn once, not beside a neighbour a hair away. The two edge columns are sampled every
 * fifth of a pixel: a Beta-PERT whose Most Likely sits near Min or Max climbs almost vertically there,
 * and so does a wide LogNormal starting at zero.
 */
function samplePoints({ lo, hi }: Frame, landmarks: number[], columns: number): number[] {
  const pixel = (hi - lo) / columns;
  const inside = landmarks.filter((x, i) => x > lo && x < hi && landmarks.indexOf(x) === i);
  const near = (x: number, within: number) => inside.some((m) => Math.abs(x - m) < within);
  const grid = Array.from({ length: columns + 1 }, (_, i) => lo + i * pixel).filter(
    (x, i) => i === 0 || i === columns || !near(x, pixel / 2)
  );
  const edges = EDGE_STEPS.map((k) => (k > 0 ? lo + k * pixel : hi + k * pixel)).filter(
    (x) => !near(x, pixel / 8)
  );
  return [...grid, ...edges, ...inside].sort((a, b) => a - b);
}

/** The density at `x`: the CDF's central difference, one-sided at the frame's edges. */
function densityAt(dist: Distribution, x: number, { lo, hi }: Frame): number {
  const h = (hi - lo) * STEP;
  const a = Math.max(lo, x - h);
  const b = Math.min(hi, x + h);
  return Math.max(0, (dist.cdf(b) - dist.cdf(a)) / (b - a));
}

/** The highest density in the frame, or `null` when there is none to scale to. */
function peakOf(densities: number[]): number | null {
  const peak = Math.max(...densities);
  return peak > 0 && Number.isFinite(peak) ? peak : null;
}

/**
 * The sparkline for this estimate, `width` × `height` px, or `null` when there is nothing to draw —
 * and then no hover card either (WI-77: an out-of-order Beta-PERT row used to show an empty one).
 */
export function sparklineCurve(
  estimate: SparklineEstimate,
  width: number,
  height: number
): SparklineCurve | null {
  const dist = sampledDistribution(estimate);
  const frame = dist && sparklineFrame(estimate, dist);
  if (!dist || !frame) return null;
  const columns = width - 2 * PAD;
  const samples = samplePoints(frame, [estimate.mostLikely, dist.mean()], columns).map((x) => ({
    x,
    density: densityAt(dist, x, frame),
  }));
  const peak = peakOf(samples.map((s) => s.density));
  if (peak === null) return null;

  const baseY = height - PAD;
  const toX = (x: number) => PAD + ((x - frame.lo) / (frame.hi - frame.lo)) * columns;
  const points = samples.map(
    ({ x, density }) => `${toX(x).toFixed(1)},${(baseY - (density / peak) * (baseY - PAD)).toFixed(1)}`
  );
  const leftFoot = `${PAD},${baseY}`;
  const rightFoot = `${width - PAD},${baseY}`;
  // A wall where the distribution ends: nothing below the frame, or nothing above it.
  const stroke = [
    ...(dist.cdf(frame.lo) <= 0 ? [leftFoot] : []),
    ...points,
    ...(dist.cdf(frame.hi) >= 1 ? [rightFoot] : []),
  ];
  const showsMostLikely =
    estimate.distributionType !== "uniform" &&
    estimate.mostLikely >= frame.lo &&
    estimate.mostLikely <= frame.hi;
  return {
    fill: `M ${[leftFoot, ...points, rightFoot].join(" L ")} Z`,
    stroke: `M ${stroke.join(" L ")}`,
    mostLikelyX: showsMostLikely ? toX(estimate.mostLikely) : null,
    lo: frame.lo,
    hi: frame.hi,
    left: PAD,
    right: width - PAD,
  };
}
