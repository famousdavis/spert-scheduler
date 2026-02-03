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
import { useChartExport } from "@ui/hooks/use-chart-export";

interface HistogramChartProps {
  bins: HistogramBin[];
  mean: number;
  percentileTarget: number;
  percentileValue: number;
  activityPercentileValue?: number;
  exportFilename?: string;
}

export function HistogramChart({
  bins,
  mean,
  percentileTarget,
  percentileValue,
  activityPercentileValue,
  exportFilename = "histogram",
}: HistogramChartProps) {
  const { chartRef, handleExport, isExporting } = useChartExport(exportFilename);

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
    <div className="relative">
      <button
        onClick={handleExport}
        disabled={isExporting}
        className="absolute top-0 right-0 z-10 p-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50"
        title="Export as PNG"
        aria-label="Export chart as PNG"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
      </button>
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
      </div>
    </div>
  );
}
