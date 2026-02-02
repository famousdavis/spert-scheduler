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
import type { CDFPoint } from "@domain/models/types";

interface CDFChartProps {
  points: CDFPoint[];
  probabilityTarget: number;
  percentileValue: number;
}

export function CDFChart({
  points,
  probabilityTarget,
  percentileValue,
}: CDFChartProps) {
  const data = points.map((pt) => ({
    value: Number(pt.value.toFixed(2)),
    probability: Number((pt.probability * 100).toFixed(1)),
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart
        data={data}
        margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="value"
          tick={{ fontSize: 11 }}
          label={{ value: "Duration (days)", position: "insideBottom", offset: -5, fontSize: 12 }}
        />
        <YAxis
          tick={{ fontSize: 11 }}
          label={{ value: "Probability (%)", angle: -90, position: "insideLeft", fontSize: 12 }}
          domain={[0, 100]}
        />
        <Tooltip
          formatter={(value: number | undefined) => [`${value ?? 0}%`, "Probability"]}
          labelFormatter={(label: unknown) => `${label} days`}
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
            position: "right",
            fontSize: 11,
          }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
