// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";

import { axisTick, AXIS_TICK_FONT_SIZE } from "./axis-theme";
import { mergeCdfDatasets, CDF_TARGET_DASH, CDF_TARGET_STROKE, type CDFDataset } from "./cdf-comparison-data";
// Note: CopyImageButton intentionally NOT imported here. The parent
// (ScenarioComparison) provides its own copy button in the chrome header.
// Previously this component had its own floating top-right button, which
// produced a duplicate when ScenarioComparison added one in v0.44.0/0.44.1.

interface CDFComparisonChartProps {
  datasets: CDFDataset[];
  probabilityTarget?: number;
  /** The words under the chart, from the comparison model — the printed chart prints the same (WI-61). */
  caption: string;
  formatDurationAsDate?: (days: number) => string;
}

// Color palette for comparison lines
const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

/**
 * Displays multiple CDF curves overlaid for scenario comparison.
 */
export function CDFComparisonChart({
  datasets,
  probabilityTarget = 0.95,
  caption,
  formatDurationAsDate,
}: CDFComparisonChartProps) {
  if (datasets.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400 text-sm">
        No simulation results to compare.
      </div>
    );
  }

  // One data array for Recharts, keyed by scenario ID — the printed chart draws from the same transform.
  const mergedData = mergeCdfDatasets(datasets);
  // ⚠️ The legend follows the TABLE's column order (WI-61). Recharts 3.8.1's Legend sorts by
  // `itemSorter: 'value'` by default — alphabetically — while the columns follow the tabs. Not
  // 'dataKey' (that is now the scenario ID: a random order) and not `null` (the registration order,
  // which Recharts documents as unstable between renders): a function returning the column index.
  const columnOf = new Map(datasets.map((d, i) => [d.id, i]));

  // ⚠️ LIGHT IN BOTH THEMES, deliberately (WI-101). This chart renders only inside the
  // comparison's copied region, which stays white so its copy reads on html2canvas's white
  // backdrop — see the note on `tableRef` in ScenarioComparison. A dark panel here showed a
  // dark chart inside a white frame, on screen and in the copy. So no `dark:` class, and the
  // axis ticks take their LIGHT colour whatever the theme.
  return (
    <div className="bg-white p-2">
      <ResponsiveContainer width="100%" height={300}>
          <LineChart
            data={mergedData}
            margin={{ top: 10, right: 30, left: 0, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="value"
              type="number"
              tick={axisTick(false)}
              tickFormatter={(v) => String(Math.round(v))}
              domain={["dataMin", "dataMax"]}
            />
            <YAxis
              tick={axisTick(false)}
              label={{ value: "Probability (%)", angle: -90, position: "insideLeft", fontSize: 12 }}
              domain={[0, 100]}
            />
            <Tooltip
              formatter={(value, name) => [`${Math.round(Number(value ?? 0))}%`, name ?? ""]}
              labelFormatter={(label: unknown) => {
                const days = Math.round(Number(label));
                const base = `${days} days`;
                if (!formatDurationAsDate) return base;
                const date = formatDurationAsDate(days);
                return date ? `${base}  —  Finish: ${date}` : base;
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: AXIS_TICK_FONT_SIZE }}
              iconType="line"
              itemSorter={(item) => columnOf.get(String(item.dataKey)) ?? 0}
            />
            {datasets.map((dataset, idx) => (
              <Line
                key={dataset.id}
                type="monotone"
                dataKey={dataset.id}
                name={dataset.label}
                stroke={dataset.color || COLORS[idx % COLORS.length]}
                dot={false}
                strokeWidth={2}
              />
            ))}
            {/* The target line ON THE PLOT'S SCALE (WI-61). It was a raw <line> at 5 % of the whole
                SVG, which put the "P95" line at 97.9 % and ran it across the axis labels. */}
            <ReferenceLine
              y={probabilityTarget * 100}
              stroke={CDF_TARGET_STROKE}
              strokeDasharray={CDF_TARGET_DASH}
              strokeWidth={1}
            />
          </LineChart>
        </ResponsiveContainer>
      {/* Target label */}
      <div className="text-xs text-gray-500 text-center mt-1">
        {caption}
      </div>
    </div>
  );
}

