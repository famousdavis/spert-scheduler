// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { DistributionType, RSMLevel } from "@domain/models/types";
import { betaPertShape } from "@core/distributions/beta-pert";
import { estimateOrderIssues } from "@domain/helpers/estimate-rules";

interface DistributionSparklineProps {
  min: number;
  mostLikely: number;
  max: number;
  distributionType: DistributionType;
  /** Beta-PERT's curve is drawn at this level, because its spread follows it. The other types'
   *  pictures do not use it. */
  confidenceLevel: RSMLevel;
  width?: number;
  height?: number;
  className?: string;
}

/** The three points and the level, for the one curve that needs them. */
interface SparklineEstimate {
  min: number;
  mostLikely: number;
  max: number;
  mlNorm: number;
  confidenceLevel: RSMLevel;
}

interface SparklinePath {
  fill: string;
  stroke: string;
}

/**
 * Renders a small SVG sparkline showing the distribution shape.
 * Width and height default to 60x20 pixels.
 */
export function DistributionSparkline({
  min,
  mostLikely,
  max,
  distributionType,
  confidenceLevel,
  width = 60,
  height = 20,
  className = "",
}: DistributionSparklineProps) {
  // Normalize values to 0-1 range for plotting
  const range = max - min || 1;
  const mlNorm = (mostLikely - min) / range;

  // Generate path based on distribution type. `null` is "no curve": an estimate Beta-PERT cannot
  // be drawn for.
  const path = generatePath(
    distributionType,
    { min, mostLikely, max, mlNorm, confidenceLevel },
    width,
    height
  );

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={`inline-block ${className}`}
      aria-hidden="true"
    >
      {path && (
        <>
          {/* Fill area under the curve */}
          <path
            d={path.fill}
            className="fill-blue-100 dark:fill-blue-900/40"
          />
          {/* Line on top */}
          <path
            d={path.stroke}
            className="fill-none stroke-blue-500 dark:stroke-blue-400"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
      {/* Mode marker (vertical line at most likely) */}
      {path && distributionType !== "uniform" && (() => {
        const pad = 2;
        const markerX = pad + mlNorm * (width - 2 * pad);
        return (
        <line
          x1={markerX}
          y1={height - 2}
          x2={markerX}
          y2={2}
          className="stroke-blue-600 dark:stroke-blue-300"
          strokeWidth="1"
          strokeDasharray="2 1"
          opacity="0.6"
        />
        );
      })()}
    </svg>
  );
}

function generatePath(
  type: DistributionType,
  estimate: SparklineEstimate,
  width: number,
  height: number
): SparklinePath | null {
  const pad = 2; // Padding from edges
  const maxY = height - pad;
  const minY = pad;
  const { mlNorm } = estimate;

  switch (type) {
    case "normal":
    case "logNormal":
      return generateBellCurve(mlNorm, width, height, pad, minY, maxY, type === "logNormal");

    case "betaPert":
      return generateBetaPert(estimate, width, pad, minY, maxY);

    case "triangular":
      return generateTriangle(mlNorm, width, height, pad, minY, maxY);

    case "uniform":
      return generateUniform(width, height, pad, minY, maxY);

    default:
      return generateBellCurve(mlNorm, width, height, pad, minY, maxY, false);
  }
}

/**
 * Beta-PERT's TRUE curve at the row's Confidence level — the one sparkline here that is not
 * schematic — scaled to its own peak, as the others are, with the peak exactly at Most Likely.
 *
 * ⚠️ No curve (`null`) for an estimate it cannot be drawn for. An out-of-order row is flagged and
 * its distribution cannot be built, but the grid still renders this sparkline for it (only a
 * point estimate hides it), so the check must live here. And never a `NaN` in a path: with
 * α, β ≥ 1 on [0, 1] the density is finite everywhere, and `0 ** 0` is 1 at a J-shape's end.
 */
function generateBetaPert(
  estimate: SparklineEstimate,
  width: number,
  pad: number,
  minY: number,
  maxY: number
): SparklinePath | null {
  const { min, mostLikely, max, mlNorm, confidenceLevel } = estimate;
  if (min === max || estimateOrderIssues(min, mostLikely, max).length > 0) return null;
  const { alpha, beta } = betaPertShape(min, mostLikely, max, confidenceLevel);
  const density = (t: number) => t ** (alpha - 1) * (1 - t) ** (beta - 1);
  const peak = density(mlNorm);
  // 31 even samples, plus Most Likely itself so the drawn peak is the real one.
  const ts = [...Array.from({ length: 31 }, (_, i) => i / 30), mlNorm].sort((a, b) => a - b);
  const points = ts.map((t) => {
    const x = pad + t * (width - 2 * pad);
    const svgY = maxY - (density(t) / peak) * (maxY - minY);
    return `${x.toFixed(1)},${svgY.toFixed(1)}`;
  });

  const strokePath = `M ${points.join(" L ")}`;
  const fillPath = `${strokePath} L ${width - pad},${maxY} L ${pad},${maxY} Z`;
  return { fill: fillPath, stroke: strokePath };
}

function generateBellCurve(
  mlNorm: number,
  width: number,
  _height: number,
  pad: number,
  minY: number,
  maxY: number,
  skewed: boolean
): { fill: string; stroke: string } {
  const points: string[] = [];
  const numPoints = 30;

  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    const x = pad + t * (width - 2 * pad);

    // Bell curve: peak at mlNorm
    let y: number;
    if (skewed) {
      // Log-normal: asymmetric with peak at mlNorm, longer right tail
      const leftWidth = Math.max(0.08, mlNorm * 0.6);
      const rightWidth = Math.max(0.25, (1 - mlNorm) * 0.6);
      const distFromPeak = t - mlNorm;
      if (distFromPeak < 0) {
        // Left side - steeper
        y = Math.exp(-Math.pow(distFromPeak / leftWidth, 2) * 3);
      } else {
        // Right side - longer tail
        y = Math.exp(-Math.pow(distFromPeak / rightWidth, 2) * 2);
      }
    } else {
      // Normal: symmetric bell curve centered at mlNorm
      const sigma = 0.2;
      const distFromPeak = t - mlNorm;
      y = Math.exp(-Math.pow(distFromPeak / sigma, 2) * 0.5);
    }

    // Convert to SVG coordinates (y increases downward)
    const svgY = maxY - y * (maxY - minY);
    points.push(`${x.toFixed(1)},${svgY.toFixed(1)}`);
  }

  const strokePath = `M ${points.join(" L ")}`;
  const fillPath = `${strokePath} L ${width - pad},${maxY} L ${pad},${maxY} Z`;

  return { fill: fillPath, stroke: strokePath };
}

function generateTriangle(
  mlNorm: number,
  width: number,
  _height: number,
  pad: number,
  minY: number,
  maxY: number
): { fill: string; stroke: string } {
  const leftX = pad;
  const peakX = pad + mlNorm * (width - 2 * pad);
  const rightX = width - pad;

  const strokePath = `M ${leftX},${maxY} L ${peakX},${minY} L ${rightX},${maxY}`;
  const fillPath = `${strokePath} Z`;

  return { fill: fillPath, stroke: strokePath };
}

function generateUniform(
  width: number,
  _height: number,
  pad: number,
  minY: number,
  maxY: number
): { fill: string; stroke: string } {
  const midY = (minY + maxY) / 2;

  const strokePath = `M ${pad},${maxY} L ${pad},${midY} L ${width - pad},${midY} L ${width - pad},${maxY}`;
  const fillPath = `M ${pad},${maxY} L ${pad},${midY} L ${width - pad},${midY} L ${width - pad},${maxY} Z`;

  return { fill: fillPath, stroke: strokePath };
}
