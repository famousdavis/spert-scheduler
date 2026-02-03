import { useMemo } from "react";
import type {
  Scenario,
  DeterministicSchedule,
  Calendar,
} from "@domain/models/types";
import type { ScheduleBuffer } from "@core/schedule/buffer";
import { computeScheduleBuffer } from "@core/schedule/buffer";
import { computeSchedule } from "@app/api/schedule-service";
import { cdf } from "@core/analytics/analytics";
import { useDateFormat } from "@ui/hooks/use-date-format";
import {
  parseDateISO,
  addWorkingDays,
  formatDateISO,
} from "@core/calendar/calendar";
import { CDFComparisonChart, type CDFDataset } from "@ui/charts/CDFComparisonChart";

// Color palette for comparison lines
const COMPARISON_COLORS = ["#3b82f6", "#10b981", "#f59e0b"];

interface ScenarioComparison {
  scenario: Scenario;
  schedule: DeterministicSchedule | null;
  buffer: ScheduleBuffer | null;
}

interface ScenarioComparisonProps {
  scenarios: Scenario[];
  calendar?: Calendar;
}

function computeEntry(
  scenario: Scenario,
  calendar?: Calendar
): ScenarioComparison {
  let schedule: DeterministicSchedule | null = null;
  let buffer: ScheduleBuffer | null = null;

  if (scenario.activities.length > 0) {
    try {
      schedule = computeSchedule(
        scenario.activities,
        scenario.startDate,
        scenario.settings.probabilityTarget,
        calendar
      );
    } catch {
      // leave null
    }
  }

  if (schedule && scenario.simulationResults) {
    buffer = computeScheduleBuffer(
      schedule.totalDurationDays,
      scenario.simulationResults.percentiles,
      scenario.settings.probabilityTarget,
      scenario.settings.projectProbabilityTarget
    );
  }

  return { scenario, schedule, buffer };
}

function bestOf(
  values: (number | null)[],
  mode: "min" | "max"
): number | null {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length === 0) return null;
  return mode === "min" ? Math.min(...nums) : Math.max(...nums);
}

export function ScenarioComparisonTable({
  scenarios,
  calendar,
}: ScenarioComparisonProps) {
  const formatDate = useDateFormat();
  const entries = scenarios.map((s) => computeEntry(s, calendar));

  // Build CDF datasets for scenarios with simulation results
  const cdfDatasets = useMemo<CDFDataset[]>(() => {
    return entries
      .filter((e) => e.scenario.simulationResults?.samples)
      .map((e, idx) => ({
        label: e.scenario.name,
        points: cdf(
          new Float64Array(e.scenario.simulationResults!.samples),
          300 // Use fewer points for comparison chart
        ),
        color: COMPARISON_COLORS[idx % COMPARISON_COLORS.length]!,
      }));
  }, [entries]);

  // Get the first scenario's project probability target for the reference line
  const probabilityTarget =
    scenarios[0]?.settings.projectProbabilityTarget ?? 0.95;

  const durations = entries.map((e) => e.schedule?.totalDurationDays ?? null);
  const buffers = entries.map((e) => e.buffer?.bufferDays ?? null);
  const totalDurations = entries.map((e) =>
    e.schedule && e.buffer && e.buffer.bufferDays > 0
      ? e.schedule.totalDurationDays + e.buffer.bufferDays
      : e.schedule?.totalDurationDays ?? null
  );
  const means = entries.map(
    (e) => e.scenario.simulationResults?.mean ?? null
  );
  const stdDevs = entries.map(
    (e) => e.scenario.simulationResults?.standardDeviation ?? null
  );

  const bestDuration = bestOf(durations, "min");
  const bestTotal = bestOf(totalDurations, "min");
  const bestMean = bestOf(means, "min");

  const percentileKeys = [50, 75, 90, 95];

  type RowDef = {
    label: string;
    values: (string | null)[];
    highlights?: ("best" | "worst" | null)[];
  };

  const rows: RowDef[] = [
    {
      label: "Start Date",
      values: entries.map((e) => formatDate(e.scenario.startDate)),
    },
    {
      label: "End Date (no buffer)",
      values: entries.map((e) =>
        e.schedule ? formatDate(e.schedule.projectEndDate) : null
      ),
    },
    {
      label: "Duration (days)",
      values: durations.map((d) => (d !== null ? String(d) : null)),
      highlights: durations.map((d) =>
        d === null ? null : d === bestDuration ? "best" : null
      ),
    },
    {
      label: "Buffer (days)",
      values: buffers.map((b) =>
        b !== null ? `${b > 0 ? "+" : ""}${b}` : null
      ),
    },
    {
      label: "End Date (w/buffer)",
      values: entries.map((e) => {
        if (!e.schedule || !e.buffer || e.buffer.bufferDays <= 0) return null;
        const buffered = addWorkingDays(
          parseDateISO(e.schedule.projectEndDate),
          e.buffer.bufferDays,
          calendar
        );
        return formatDate(formatDateISO(buffered));
      }),
    },
    {
      label: "Duration w/Buffer",
      values: totalDurations.map((d) => (d !== null ? String(d) : null)),
      highlights: totalDurations.map((d) =>
        d === null ? null : d === bestTotal ? "best" : null
      ),
    },
    {
      label: "Activity Target",
      values: entries.map(
        (e) => `P${Math.round(e.scenario.settings.probabilityTarget * 100)}`
      ),
    },
    {
      label: "Project Target",
      values: entries.map(
        (e) =>
          `P${Math.round(e.scenario.settings.projectProbabilityTarget * 100)}`
      ),
    },
    {
      label: "Mean",
      values: means.map((m) => (m !== null ? m.toFixed(1) : null)),
      highlights: means.map((m) =>
        m === null ? null : m === bestMean ? "best" : null
      ),
    },
    {
      label: "Std Dev",
      values: stdDevs.map((s) => (s !== null ? s.toFixed(1) : null)),
    },
    ...percentileKeys.map((pct) => ({
      label: `P${pct}`,
      values: entries.map((e) => {
        const val = e.scenario.simulationResults?.percentiles[pct];
        return val !== undefined ? val.toFixed(1) : null;
      }),
    })),
  ];

  return (
    <div className="inline-block bg-white border border-gray-200 rounded-lg overflow-hidden">
      <table className="text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-left px-4 py-2 text-gray-500 font-medium whitespace-nowrap">
              Metric
            </th>
            {entries.map((e) => (
              <th
                key={e.scenario.id}
                className="text-right px-4 py-2 text-gray-900 font-semibold whitespace-nowrap min-w-[120px]"
              >
                {e.scenario.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={row.label}
              className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}
            >
              <td className="px-4 py-1.5 text-gray-600 whitespace-nowrap">
                {row.label}
              </td>
              {row.values.map((val, j) => {
                const highlight = row.highlights?.[j];
                return (
                  <td
                    key={j}
                    className={`px-4 py-1.5 text-right tabular-nums whitespace-nowrap ${
                      highlight === "best"
                        ? "text-green-700 font-semibold"
                        : highlight === "worst"
                          ? "text-amber-600"
                          : "text-gray-900"
                    }`}
                  >
                    {val ?? <span className="text-gray-300">&mdash;</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {entries.some((e) => !e.scenario.simulationResults) && (
        <p className="px-4 py-2 text-xs text-gray-400 border-t border-gray-100">
          Run simulation on all scenarios for complete comparison data.
        </p>
      )}

      {/* CDF Comparison Chart */}
      {cdfDatasets.length >= 2 && (
        <div className="p-4 border-t border-gray-100">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Cumulative Distribution Comparison
          </h4>
          <CDFComparisonChart
            datasets={cdfDatasets}
            probabilityTarget={probabilityTarget}
            exportFilename="scenario-comparison-cdf"
          />
        </div>
      )}
    </div>
  );
}
