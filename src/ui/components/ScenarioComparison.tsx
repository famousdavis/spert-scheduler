// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useMemo, useCallback, useRef } from "react";
import type {
  Scenario,
  DeterministicSchedule,
  Calendar,
} from "@domain/models/types";
import type { WorkCalendar } from "@core/calendar/work-calendar";
import type { ScheduleBuffer } from "@core/schedule/buffer";
import { computeScheduleBuffer } from "@core/schedule/buffer";
import { computeSchedule } from "@app/api/schedule-service";
import { computeDependencySchedule } from "@core/schedule/deterministic";
import { cdf } from "@core/analytics/analytics";
import { useDateFormat } from "@ui/hooks/use-date-format";
import { durationToFinishDateISO } from "@core/calendar/calendar";
import { CDFComparisonChart, type CDFDataset } from "@ui/charts/CDFComparisonChart";
import { CopyImageButton } from "./CopyImageButton";

// Color palette for comparison lines
const COMPARISON_COLORS = ["#3b82f6", "#10b981", "#f59e0b"];

function pickBestHighlight(value: number | null, best: number | null): "best" | null {
  if (value === null || best === null) return null;
  return value === best ? "best" : null;
}

function formatSignedBuffer(b: number | null): string | null {
  if (b === null) return null;
  return `${b > 0 ? "+" : ""}${b}`;
}

function highlightClass(highlight: "best" | "worst" | null | undefined): string {
  if (highlight === "best") return "text-green-700 font-semibold";
  if (highlight === "worst") return "text-amber-700";
  return "text-gray-900";
}

interface ScenarioComparison {
  scenario: Scenario;
  schedule: DeterministicSchedule | null;
  buffer: ScheduleBuffer | null;
  error: string | null;
}

interface ScenarioComparisonProps {
  scenarios: Scenario[];
  calendar?: WorkCalendar | Calendar;
}

function computeEntry(
  scenario: Scenario,
  calendar?: WorkCalendar | Calendar
): ScenarioComparison {
  let schedule: DeterministicSchedule | null = null;
  let buffer: ScheduleBuffer | null = null;
  let error: string | null = null;

  if (scenario.activities.length > 0) {
    try {
      schedule = scenario.settings.dependencyMode
        ? computeDependencySchedule(
            scenario.activities,
            scenario.dependencies,
            scenario.startDate,
            scenario.settings.probabilityTarget,
            calendar,
            scenario.milestones
          )
        : computeSchedule(
            scenario.activities,
            scenario.startDate,
            scenario.settings.probabilityTarget,
            calendar
          );
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  if (schedule && scenario.simulationResults) {
    buffer = computeScheduleBuffer(
      schedule.spanDays,
      scenario.simulationResults.percentiles,
      scenario.settings.probabilityTarget,
      scenario.settings.projectProbabilityTarget
    );
  }

  return { scenario, schedule, buffer, error };
}

function bestOf(
  values: (number | null)[],
  mode: "min" | "max"
): number | null {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length === 0) return null;
  return mode === "min" ? Math.min(...nums) : Math.max(...nums);
}

/**
 * Picks the best cell(s) of a row from the strings the row actually DISPLAYS,
 * rather than from the underlying numbers.
 *
 * ⚠️ WI-41 (2026-09-12): the "Mean" row showed `323.3` against `323.3` — two visibly
 * identical numbers — and bolded only one of them, because the row rendered
 * `m.toFixed(1)` while the winner was chosen from the raw means, which differed in the
 * second decimal. Deriving the highlight from the displayed string makes that whole
 * class of mismatch unrepresentable rather than patched: two cells showing the same
 * string necessarily carry the same highlight, because they are the same input.
 *
 * Pass the SAME array to a row's `values` and to this function — that is what closes
 * the gap; two parallel arrays would just be a second place to diverge.
 *
 * Scope: `String(n)` round-trips every double exactly, so the rows formatted with it
 * ("Duration (days)", "Duration w/Buffer") highlight identically under this helper and
 * under the raw-number comparison it replaced. `toFixed` is the only lossy formatter
 * in this table, which is why "Mean" was the only row affected.
 */
function highlightBestDisplayed(
  displayed: (string | null)[],
  mode: "min" | "max"
): ("best" | null)[] {
  const parsed = displayed.map((s) => {
    if (s === null) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  });
  const best = bestOf(parsed, mode);
  return parsed.map((v) => pickBestHighlight(v, best));
}

export function ScenarioComparisonTable({
  scenarios,
  calendar,
}: ScenarioComparisonProps) {
  const formatDate = useDateFormat();
  const tableRef = useRef<HTMLDivElement>(null);
  const cdfRef = useRef<HTMLDivElement>(null);
  const entries = scenarios.map((s) => computeEntry(s, calendar));

  // Format duration as finish date for CDF tooltip (uses first scenario's start date)
  const firstStartDate = scenarios[0]?.startDate;
  const formatDurationAsDate = useCallback(
    (days: number): string => {
      if (!firstStartDate) return "";
      const finish = durationToFinishDateISO(firstStartDate, days, calendar);
      return finish ? formatDate(finish) : "";
    },
    [firstStartDate, calendar, formatDate]
  );

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
  // ⚠️ NO FALLBACK TO THE UNBUFFERED DURATION (WI-43, 2026-09-12). This row is
  // labelled "Duration w/Buffer"; when there is no buffer it must blank, exactly as
  // its two siblings above and below already do (`buffers`, and "End Date (w/buffer)").
  // Until v0.67.16 it fell back to `e.schedule.totalDurationDays` — a DIFFERENT
  // quantity under a label promising a buffered one — and because `bestOf` then
  // compared that smaller number against the others' genuinely buffered ones, an
  // un-simulated scenario was green-bolded as the winner (measured: 294 against a run
  // scenario's 351). Blanking removes the cell from the contest on its own: `bestOf`
  // filters nulls.
  const totalDurations = entries.map((e) =>
    e.buffer ? Math.round(e.buffer.projectTargetDuration) : null
  );
  const constraintDelays = entries.map((e) => {
    if (!e.schedule || !e.buffer) return null;
    const hasErrorConflict = e.schedule.constraintConflicts?.some((c) => c.severity === "error") ?? false;
    if (hasErrorConflict) return null;
    return e.buffer.deterministicSpan - e.schedule.totalDurationDays;
  });
  const anyConstraintDelay = constraintDelays.some((d) => d !== null && d > 0);
  const means = entries.map(
    (e) => e.scenario.simulationResults?.mean ?? null
  );
  const stdDevs = entries.map(
    (e) => e.scenario.simulationResults?.standardDeviation ?? null
  );

  // The displayed strings for the three highlighted rows. Each is handed to BOTH the
  // row's `values` and `highlightBestDisplayed`, so display and comparison cannot drift
  // apart (WI-41 — see the helper).
  const durationValues = durations.map((d) => (d !== null ? String(d) : null));
  const totalDurationValues = totalDurations.map((d) =>
    d !== null ? String(d) : null
  );
  const meanValues = means.map((m) => (m !== null ? m.toFixed(1) : null));

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
      values: durationValues,
      highlights: highlightBestDisplayed(durationValues, "min"),
    },
    {
      // ⚠️ DELIBERATELY NOT HIGHLIGHTED, and it is not an oversight (WI-41, 2026-09-12).
      // More buffer is not unambiguously better: a large buffer means the simulation
      // found a wide spread, which is as likely to signal an uncertain plan as a safe
      // one. Marking a "best" here would make the table assert a preference the app
      // has no basis for — doubly so because this row is DERIVED from the two either
      // side of it, both of which are highlighted or blank on their own terms.
      label: "Buffer (days)",
      values: buffers.map(formatSignedBuffer),
    },
    ...(anyConstraintDelay
      ? [{
          label: "Constraint Delay (days)",
          values: constraintDelays.map((d) => (d !== null ? String(d) : null)),
        }]
      : []),
    {
      label: "End Date (w/buffer)",
      values: entries.map((e) => {
        if (!e.buffer) return null;
        const buffered = durationToFinishDateISO(
          e.scenario.startDate,
          e.buffer.projectTargetDuration,
          calendar
        );
        return buffered ? formatDate(buffered) : null;
      }),
    },
    {
      label: "Duration w/Buffer",
      values: totalDurationValues,
      highlights: highlightBestDisplayed(totalDurationValues, "min"),
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
      values: meanValues,
      highlights: highlightBestDisplayed(meanValues, "min"),
    },
    {
      label: "Standard Deviation",
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
    <div className="inline-block bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      {/* Comparison table — header bar (chrome, not in screenshot) above the
          captured region. Matches the GanttSection pattern: label on the left,
          copy button on the right. */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Scenario Comparison
        </h3>
        <CopyImageButton
          targetRef={tableRef}
          title="Copy comparison table as image"
        />
      </div>
      {/* Explicit bg-white + inline-block on the captured element: html2canvas 1.4.1
          can fail to compute bounds on a bare div inside an inline-block/overflow-hidden
          parent, producing "Failed to copy image to clipboard" for the table button.

          ⚠️ THE bg-white IS ALSO DELIBERATE FOR THEMING, and must stay (WI-3, v0.66.1).
          `copyChartAsPng` passes `backgroundColor: "#ffffff"` to html2canvas, which forces
          the canvas BACKDROP white but does not touch element colours. A captured region
          that followed the dark theme would put light text on that white backdrop —
          unreadable, and worse than a dark PNG. Only the CHROME around this region follows
          the theme. */}
      <div ref={tableRef} className="inline-block bg-white">
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
                      className={`px-4 py-1.5 text-right tabular-nums whitespace-nowrap ${highlightClass(highlight)}`}
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
        {entries.some((e) => e.error) && (
          <p className="px-4 py-2 text-xs text-red-700 border-t border-gray-100">
            Could not compute a schedule for:{" "}
            {entries
              .filter((e) => e.error)
              .map((e) => `${e.scenario.name} (${e.error})`)
              .join("; ")}
          </p>
        )}
      </div>

      {/* CDF Comparison Chart — same chrome pattern. The existing h4 inside the
          chart moves up into the header (so it isn't duplicated) and the ref'd
          region contains only the chart. */}
      {cdfDatasets.length >= 2 && (
        <>
          <div className="flex items-center justify-between px-4 py-2 border-t border-gray-200 dark:border-gray-700 border-b border-gray-100 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Cumulative Distribution Comparison
            </h3>
            <CopyImageButton
              targetRef={cdfRef}
              title="Copy distribution comparison as image"
            />
          </div>
          {/* Captured by html2canvas — stays light in both themes; see the note on
              tableRef above. */}
          <div ref={cdfRef} className="p-4 bg-white">
            <CDFComparisonChart
              datasets={cdfDatasets}
              probabilityTarget={probabilityTarget}
              formatDurationAsDate={formatDurationAsDate}
            />
          </div>
        </>
      )}
    </div>
  );
}
