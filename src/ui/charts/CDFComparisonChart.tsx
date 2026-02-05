import { useRef } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { CDFPoint } from "@domain/models/types";
import { CopyImageButton } from "@ui/components/CopyImageButton";

export interface CDFDataset {
  label: string;
  points: CDFPoint[];
  color: string;
}

interface CDFComparisonChartProps {
  datasets: CDFDataset[];
  probabilityTarget?: number;
}

// Color palette for comparison lines
const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

/**
 * Displays multiple CDF curves overlaid for scenario comparison.
 */
export function CDFComparisonChart({
  datasets,
  probabilityTarget = 0.95,
}: CDFComparisonChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);

  if (datasets.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400 text-sm">
        No simulation results to compare.
      </div>
    );
  }

  // Merge all datasets into a single data array for Recharts
  // Find the union of all x-values (duration values) across datasets
  const allValues = new Set<number>();
  for (const dataset of datasets) {
    for (const pt of dataset.points) {
      if (Number.isFinite(pt.value)) {
        allValues.add(Number(pt.value.toFixed(2)));
      }
    }
  }
  const sortedValues = Array.from(allValues).sort((a, b) => a - b);

  // Create merged data with interpolated values for each dataset
  const mergedData = sortedValues.map((value) => {
    const row: Record<string, number> = { value };
    for (const dataset of datasets) {
      const prob = interpolateCDF(dataset.points, value);
      row[dataset.label] = Number((prob * 100).toFixed(1));
    }
    return row;
  });

  return (
    <div className="relative">
      <div className="absolute top-0 right-0 z-10">
        <CopyImageButton targetRef={chartRef} title="Copy chart as image" />
      </div>
      <div ref={chartRef} className="bg-white dark:bg-gray-800 p-2">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart
            data={mergedData}
            margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="value"
              type="number"
              tick={{ fontSize: 11 }}
              label={{ value: "Duration (days)", position: "insideBottom", offset: -5, fontSize: 12 }}
              domain={["dataMin", "dataMax"]}
            />
            <YAxis
              tick={{ fontSize: 11 }}
              label={{ value: "Probability (%)", angle: -90, position: "insideLeft", fontSize: 12 }}
              domain={[0, 100]}
            />
            <Tooltip
              formatter={(value: number | undefined, name?: string) => [`${value ?? 0}%`, name ?? ""]}
              labelFormatter={(label: unknown) => `${label} days`}
            />
            <Legend
              wrapperStyle={{ fontSize: 11 }}
              iconType="line"
            />
            {datasets.map((dataset, idx) => (
              <Line
                key={dataset.label}
                type="monotone"
                dataKey={dataset.label}
                stroke={dataset.color || COLORS[idx % COLORS.length]}
                dot={false}
                strokeWidth={2}
              />
            ))}
            {/* Reference line for target probability */}
            <line
              x1="0%"
              y1={`${100 - probabilityTarget * 100}%`}
              x2="100%"
              y2={`${100 - probabilityTarget * 100}%`}
              stroke="#6b7280"
              strokeDasharray="5 5"
              strokeWidth={1}
            />
          </LineChart>
        </ResponsiveContainer>
        {/* Target label */}
        <div className="text-xs text-gray-500 dark:text-gray-400 text-center mt-1">
          Dashed line: P{Math.round(probabilityTarget * 100)} target
        </div>
      </div>
    </div>
  );
}

/**
 * Interpolate probability from CDF points at a given value.
 * Uses linear interpolation between adjacent points.
 */
function interpolateCDF(points: CDFPoint[], targetValue: number): number {
  if (points.length === 0) return 0;

  // Find surrounding points
  let lower: CDFPoint | null = null;
  let upper: CDFPoint | null = null;

  for (const pt of points) {
    if (pt.value <= targetValue) {
      if (!lower || pt.value > lower.value) {
        lower = pt;
      }
    }
    if (pt.value >= targetValue) {
      if (!upper || pt.value < upper.value) {
        upper = pt;
      }
    }
  }

  // Edge cases
  if (!lower && upper) return upper.probability;
  if (!upper && lower) return lower.probability;
  if (!lower && !upper) return 0;
  if (lower === upper) return lower!.probability;

  // Linear interpolation
  const ratio = (targetValue - lower!.value) / (upper!.value - lower!.value);
  return lower!.probability + ratio * (upper!.probability - lower!.probability);
}
