// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { RefObject } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";

import { useIsDarkClass } from "@ui/hooks/use-dark-class";

import { axisTick, AXIS_TICK_FONT_SIZE } from "./axis-theme";
import type { CDFPoint } from "@domain/models/types";

/**
 * Where the label of the "Finish by" lookup's line goes (WI-127). The CDF climbs from the plot's bottom-left to its
 * top-right, so those two corners are where the curve is and the other two are empty. The x-axis runs
 * `dataMin…dataMax`. A line before the middle of that range takes its label at the top, to the line's right, so the
 * label never reaches the chart's left edge. A line at the middle or after it takes its label at the top too, to the
 * line's left (the place every "Finish by" label had before v0.78.1) — unless the project target is P96 or higher,
 * when it goes to the bottom, to the line's left, just above the x-axis.
 *
 * Why P96, measured at v0.78.1 (1280×720, the sample project): a top "Finish by" label's box spans y 12–26 and the
 * P95 label's starts at y 26.5, so the two cannot meet. The chart is 350 px tall at every width, so the height of the
 * project target's line does not depend on the width. From P96 that line is higher and its label, just below it,
 * rises into the top label's strip — P99's was measured at y 14.9 — so a label at or past the middle moves down.
 * The target is compared as the percentile its own label prints, `Math.round(probabilityTarget * 100)`, not as the
 * raw fraction. Min and max are computed, not read from the ends: no order is assumed.
 */
function targetLabelPosition(targetDuration: number, data: { value: number }[], probabilityTarget: number) {
  const lo = data.reduce((m, d) => Math.min(m, d.value), Infinity);
  const hi = data.reduce((m, d) => Math.max(m, d.value), -Infinity);
  if (targetDuration < (lo + hi) / 2) return "insideTopLeft";
  return Math.round(probabilityTarget * 100) >= 96 ? "insideBottomRight" : "insideTopRight";
}

interface CDFChartProps {
  points: CDFPoint[];
  probabilityTarget: number;
  percentileValue: number;
  formatDurationAsDate?: (days: number) => string;
  targetDuration?: number;
  targetProbability?: number;
  targetLabel?: string;
  targetColor?: string;
  /** Attached to the capture div so the panel's copy-image button can target it. */
  captureRef: RefObject<HTMLDivElement | null>;
}

export function CDFChart({
  points,
  probabilityTarget,
  percentileValue,
  formatDurationAsDate,
  targetDuration,
  targetProbability,
  targetLabel,
  targetColor = "#f59e0b",
  captureRef,
}: CDFChartProps) {
  const isDark = useIsDarkClass();
  // Filter out any points with non-finite values (defensive check)
  const data = points
    .filter(
      (pt) => Number.isFinite(pt.value) && Number.isFinite(pt.probability)
    )
    .map((pt) => ({
      value: Number(pt.value.toFixed(2)),
      probability: Number((pt.probability * 100).toFixed(1)),
    }));

  return (
    <div ref={captureRef} className="bg-white dark:bg-gray-800">
      <ResponsiveContainer width="100%" height={350}>
        <LineChart
          data={data}
          margin={{ top: 10, right: 30, left: 0, bottom: 20 }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="value"
            type="number"
            tick={axisTick(isDark)}
            tickFormatter={(v) => String(Math.round(v))}
            label={{ value: "Duration (days)", position: "insideBottom", offset: -5, fontSize: 12 }}
            domain={["dataMin", "dataMax"]}
          />
          <YAxis
            tick={axisTick(isDark)}
            label={{ value: "Probability (%)", angle: -90, position: "insideLeft", fontSize: 12 }}
            domain={[0, 100]}
          />
          <Tooltip
            formatter={(value) => [`${Math.round(Number(value ?? 0))}%`, "Probability"]}
            labelFormatter={(label: unknown) => {
              const days = Math.round(Number(label));
              const base = `${days} days`;
              if (!formatDurationAsDate) return base;
              const date = formatDurationAsDate(days);
              return date ? `${base}  —  Finish: ${date}` : base;
            }}
          />
          <Line
            type="monotone"
            dataKey="probability"
            stroke="#3b82f6"
            dot={false}
            strokeWidth={2}
          />
          <ReferenceLine
            y={probabilityTarget * 100}
            stroke="#10b981"
            strokeDasharray="5 5"
            label={{
              value: `P${Math.round(probabilityTarget * 100)} = ${percentileValue.toFixed(1)} days`,
              // Inside the plot at the line's right end (WI-127): below a line in the top half, above one in
              // the bottom half — the side away from the curve. "right" drew it in the 30 px margin.
              position: probabilityTarget >= 0.5 ? "insideTopRight" : "insideBottomRight",
              fontSize: AXIS_TICK_FONT_SIZE,
            }}
          />
          {targetDuration != null && targetProbability != null && (
            <ReferenceLine
              x={targetDuration}
              stroke={targetColor}
              strokeDasharray="5 5"
              label={{
                value: targetLabel ?? `${Math.round(targetProbability)}%`,
                position: targetLabelPosition(targetDuration, data, probabilityTarget),
                fontSize: AXIS_TICK_FONT_SIZE,
                fill: targetColor,
              }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
