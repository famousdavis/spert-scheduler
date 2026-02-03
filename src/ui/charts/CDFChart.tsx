import { useRef, useState, useCallback } from "react";
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
import { exportChartAsPng } from "@ui/helpers/export-chart";
import { toast } from "@ui/hooks/use-notification-store";

interface CDFChartProps {
  points: CDFPoint[];
  probabilityTarget: number;
  percentileValue: number;
  exportFilename?: string;
}

export function CDFChart({
  points,
  probabilityTarget,
  percentileValue,
  exportFilename = "cdf",
}: CDFChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = useCallback(async () => {
    if (!chartRef.current || isExporting) return;
    setIsExporting(true);
    try {
      await exportChartAsPng(chartRef.current, exportFilename);
      toast.success("Chart exported");
    } catch {
      toast.error("Failed to export chart");
    } finally {
      setIsExporting(false);
    }
  }, [exportFilename, isExporting]);

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
