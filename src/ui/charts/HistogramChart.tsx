import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import type { HistogramBin } from "@domain/models/types";

interface HistogramChartProps {
  bins: HistogramBin[];
  mean: number;
  percentileTarget: number;
  percentileValue: number;
}

export function HistogramChart({
  bins,
  mean,
  percentileTarget,
  percentileValue,
}: HistogramChartProps) {
  const data = bins.map((bin) => ({
    binMid: Number(((bin.binStart + bin.binEnd) / 2).toFixed(1)),
    count: bin.count,
  }));

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
          formatter={(value: number) => [value, "Trials"]}
          labelFormatter={(label: number) => `~${label} days`}
        />
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
