import { useRef } from "react";
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
import type { HistogramBin } from "@domain/models/types";
import { CopyImageButton } from "@ui/components/CopyImageButton";

interface HistogramChartProps {
  bins: HistogramBin[];
  mean: number;
  percentileTarget: number;
  percentileValue: number;
  activityPercentileValue?: number;
}

export function HistogramChart({
  bins,
  mean,
  percentileTarget,
  percentileValue,
  activityPercentileValue,
}: HistogramChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);

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

  const showBufferZone =
    activityPercentileValue !== undefined &&
    activityPercentileValue < percentileValue;

  // Determine x-axis range so we can detect label proximity
  const xMin = data.length > 0 ? data[0]!.binMid : 0;
  const xMax = data.length > 0 ? data[data.length - 1]!.binMid : 1;
  const xRange = xMax - xMin || 1;

  // When mean and percentile labels are close (<15% of range), offset them
  const labelsTooClose = Math.abs(percentileValue - mean) / xRange < 0.15;
  const meanIsLeft = mean <= percentileValue;
  const meanLabelPos = labelsTooClose
    ? meanIsLeft ? "insideTopLeft" as const : "insideTopRight" as const
    : "top" as const;
  const pctLabelPos = labelsTooClose
    ? meanIsLeft ? "insideTopRight" as const : "insideTopLeft" as const
    : "top" as const;

  return (
    <div className="relative">
      <div className="absolute top-0 right-0 z-10">
        <CopyImageButton targetRef={chartRef} title="Copy chart as image" />
      </div>
      <div ref={chartRef} className="bg-white dark:bg-gray-800 p-2">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="binMid"
              type="number"
              tick={{ fontSize: 11 }}
              domain={["dataMin", "dataMax"]}
            />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(value: number | undefined) => [value ?? 0, "Trials"]}
              labelFormatter={(label: unknown) => `~${label} days`}
            />
            {showBufferZone && (
              <ReferenceArea
                x1={Number(activityPercentileValue.toFixed(1))}
                x2={Number(percentileValue.toFixed(1))}
                fill="#3b82f6"
                fillOpacity={0.1}
                label={{
                  value: "Buffer",
                  position: "insideTop",
                  fontSize: 10,
                  fill: "#3b82f6",
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
                fontSize: 10,
                fill: "#ef4444",
              }}
            />
            <ReferenceLine
              x={Number(percentileValue.toFixed(1))}
              stroke="#10b981"
              strokeDasharray="5 5"
              label={{
                value: `P${Math.round(percentileTarget * 100)}: ${percentileValue.toFixed(1)}`,
                position: pctLabelPos,
                fontSize: 10,
                fill: "#10b981",
              }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
