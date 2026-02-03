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

  return (
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
            position: "top",
            fontSize: 11,
          }}
        />
        <ReferenceLine
          x={Number(percentileValue.toFixed(1))}
          stroke="#10b981"
          strokeDasharray="5 5"
          label={{
            value: `P${Math.round(percentileTarget * 100)}: ${percentileValue.toFixed(1)}`,
            position: "top",
            fontSize: 11,
          }}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
