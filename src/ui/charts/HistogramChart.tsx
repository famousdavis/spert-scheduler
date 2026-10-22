// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { RefObject } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
  ResponsiveContainer,
} from "recharts";

import { useIsDarkClass } from "@ui/hooks/use-dark-class";

import { axisTick, AXIS_TICK_FONT_SIZE } from "./axis-theme";
import type { HistogramBin } from "@domain/models/types";

/**
 * The text of the three reference labels (WI-102): a darker shade of each line's colour where the chart is
 * white, and the line's own colour or a lighter one where it is dark, so each reads at least 4.5:1 (WCAG AA)
 * on its own ground. The lines and the buffer area keep their colours.
 *   P95     #047857 on white 5.48 · #10b981 on gray-800 5.78  (was #10b981: 2.54 on white)
 *   Mean    #b91c1c on white 6.47 · #f87171 on gray-800 5.30  (was #ef4444: 3.76 / 3.90)
 *   Buffer  #1d4ed8 on its tint 5.99 · #60a5fa on its tint 5.08 (was #3b82f6: 3.28 / 3.52)
 */
const LABEL_TEXT = {
  light: { percentile: "#047857", mean: "#b91c1c", buffer: "#1d4ed8" },
  dark: { percentile: "#10b981", mean: "#f87171", buffer: "#60a5fa" },
} as const;

function labelText(isDark: boolean) {
  return isDark ? LABEL_TEXT.dark : LABEL_TEXT.light;
}

interface HistogramChartProps {
  bins: HistogramBin[];
  mean: number;
  percentileTarget: number;
  percentileValue: number;
  activityPercentileValue?: number;
  deterministicSpan?: number;
  /** Attached to the capture div so the panel's copy-image button can target it. */
  captureRef: RefObject<HTMLDivElement | null>;
}

export function HistogramChart({
  bins,
  mean,
  percentileTarget,
  percentileValue,
  activityPercentileValue,
  deterministicSpan,
  captureRef,
}: HistogramChartProps) {
  const isDark = useIsDarkClass();
  const text = labelText(isDark);
  // Filter out any bins with non-finite values (defensive check)
  const data = bins
    .filter(
      (bin) =>
        Number.isFinite(bin.binStart) &&
        Number.isFinite(bin.binEnd) &&
        Number.isFinite(bin.count)
    )
    .map((bin) => ({
      binMid: Number(((bin.binStart + bin.binEnd) / 2).toFixed(1)),
      count: bin.count,
    }));

  // Buffer left edge: deterministic schedule span (constraint-adjusted) when
  // available, otherwise fall back to MC activity percentile value
  const bufferLeft = deterministicSpan ?? activityPercentileValue;
  const showBufferZone =
    bufferLeft !== undefined &&
    bufferLeft < percentileValue;

  // Determine x-axis range so we can detect label proximity
  const xMin = data.length > 0 ? data[0]!.binMid : 0;
  const xMax = data.length > 0 ? data[data.length - 1]!.binMid : 1;
  const xRange = xMax - xMin || 1;

  // When mean and percentile labels are close (<15% of range), offset them
  const labelsTooClose = Math.abs(percentileValue - mean) / xRange < 0.15;
  const meanIsLeft = mean <= percentileValue;
  type LabelPos = "top" | "insideTopLeft" | "insideTopRight";
  let meanLabelPos: LabelPos = "top";
  let pctLabelPos: LabelPos = "top";
  if (labelsTooClose) {
    meanLabelPos = meanIsLeft ? "insideTopLeft" : "insideTopRight";
    pctLabelPos = meanIsLeft ? "insideTopRight" : "insideTopLeft";
  }

  return (
    <div ref={captureRef} className="bg-white dark:bg-gray-800">
      <ResponsiveContainer width="100%" height={350}>
        <BarChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="binMid"
            type="number"
            tick={axisTick(isDark)}
            domain={["dataMin", "dataMax"]}
          />
          <YAxis tick={axisTick(isDark)} />
          <Tooltip
            formatter={(value) => [value ?? 0, "Trials"]}
            labelFormatter={(label: unknown) => `~${label} days`}
          />
          {showBufferZone && (
            <ReferenceArea
              x1={Number(Math.max(bufferLeft, xMin).toFixed(1))}
              x2={Number(percentileValue.toFixed(1))}
              fill="#3b82f6"
              fillOpacity={0.1}
              label={{
                value: "Buffer",
                position: "insideTop",
                fontSize: AXIS_TICK_FONT_SIZE,
                fill: text.buffer,
              }}
            />
          )}
          <Bar dataKey="count" fill="#3b82f6" />
          <ReferenceLine
            x={Number(mean.toFixed(1))}
            stroke="#ef4444"
            strokeDasharray="5 5"
            label={{
              value: `Mean: ${mean.toFixed(1)}`,
              position: meanLabelPos,
              fontSize: AXIS_TICK_FONT_SIZE,
              fill: text.mean,
            }}
          />
          <ReferenceLine
            x={Number(percentileValue.toFixed(1))}
            stroke="#10b981"
            strokeDasharray="5 5"
            label={{
              value: `P${Math.round(percentileTarget * 100)}: ${percentileValue.toFixed(1)}`,
              position: pctLabelPos,
              fontSize: AXIS_TICK_FONT_SIZE,
              fill: text.percentile,
            }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
