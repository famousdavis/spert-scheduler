import { useRef } from "react";
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
import { CopyImageButton } from "@ui/components/CopyImageButton";

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
  const chartRef = useRef<HTMLDivElement>(null);

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
    <div className="relative">
      <div className="absolute top-0 right-0 z-10">
        <CopyImageButton targetRef={chartRef} title="Copy chart as image" />
      </div>
      <div ref={chartRef} className="bg-white dark:bg-gray-800 p-2">
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
      </div>
    </div>
  );
}
