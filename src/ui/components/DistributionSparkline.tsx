import type { DistributionType } from "@domain/models/types";

interface DistributionSparklineProps {
  min: number;
  mostLikely: number;
  max: number;
  distributionType: DistributionType;
  width?: number;
  height?: number;
  className?: string;
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
  width = 60,
  height = 20,
  className = "",
}: DistributionSparklineProps) {
  // Normalize values to 0-1 range for plotting
  const range = max - min || 1;
  const mlNorm = (mostLikely - min) / range;

  // Generate path based on distribution type
  const path = generatePath(distributionType, mlNorm, width, height);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={`inline-block ${className}`}
      aria-hidden="true"
    >
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
      {/* Mode marker (vertical line at most likely) */}
      {distributionType !== "uniform" && (
        <line
          x1={mlNorm * width}
          y1={height - 2}
          x2={mlNorm * width}
          y2={2}
          className="stroke-blue-600 dark:stroke-blue-300"
          strokeWidth="1"
          strokeDasharray="2 1"
          opacity="0.6"
        />
      )}
    </svg>
  );
}

function generatePath(
  type: DistributionType,
  mlNorm: number,
  width: number,
  height: number
): { fill: string; stroke: string } {
  const pad = 2; // Padding from edges
  const maxY = height - pad;
  const minY = pad;

  switch (type) {
    case "normal":
    case "logNormal":
      return generateBellCurve(mlNorm, width, height, pad, minY, maxY, type === "logNormal");

    case "triangular":
      return generateTriangle(mlNorm, width, height, pad, minY, maxY);

    case "uniform":
      return generateUniform(width, height, pad, minY, maxY);

    default:
      return generateBellCurve(mlNorm, width, height, pad, minY, maxY, false);
  }
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
      // Log-normal: asymmetric with longer right tail
      const skewFactor = 0.3;
      const peakPos = Math.max(0.15, mlNorm * 0.7);
      const distFromPeak = t - peakPos;
      if (distFromPeak < 0) {
        // Left side - steeper
        y = Math.exp(-Math.pow(distFromPeak / (0.15), 2) * 3);
      } else {
        // Right side - longer tail
        y = Math.exp(-Math.pow(distFromPeak / (0.35 + skewFactor), 2) * 2);
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
