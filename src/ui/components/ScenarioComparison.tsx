// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useMemo, useCallback, useRef } from "react";
import type { Scenario, Calendar } from "@domain/models/types";
import type { WorkCalendar } from "@core/calendar/work-calendar";
import { useDateFormat } from "@ui/hooks/use-date-format";
import { durationToFinishDateISO } from "@core/calendar/calendar";
import { CDFComparisonChart } from "@ui/charts/CDFComparisonChart";
import { flagNote } from "@ui/helpers/flag-sentences";
import {
  buildComparisonModel,
  type CompareRunGate,
  type ComparisonColumn,
  type ComparisonFlagNote,
  type ComparisonModel,
} from "@ui/helpers/comparison-model";
import { CopyImageButton } from "./CopyImageButton";

function highlightClass(highlight: "best" | "worst" | null | undefined): string {
  if (highlight === "best") return "text-green-700 font-semibold";
  if (highlight === "worst") return "text-amber-700";
  return "text-gray-900";
}

/** No Compare run in flight: one set for every render, so a default never looks like a change. */
const NOTHING_RUNNING: ReadonlySet<string> = new Set();

interface ScenarioComparisonProps {
  scenarios: Scenario[];
  calendar?: WorkCalendar | Calendar;
  /** The project numbers its activities: a note then leads each row with its `#n` (WI-58). */
  showActivityNumbers?: boolean;
  activeRunGate?: CompareRunGate | null;
  /**
   * Runs one compared scenario where it is — the tab on screen does not change. Without it the
   * table has no Run row.
   */
  onRunScenario?: (scenarioId: string) => void;
  /** The scenarios whose Compare run is in flight: "Running..." in place of their Run. */
  runningIds?: ReadonlySet<string>;
  /** What the last Compare run did, for a screen reader — announced outside the captured region. */
  runStatus?: string;
}

/**
 * One column's Run cell: "Running..." while its run is in flight (the panel's own word), a Run
 * button when the model offers one, and nothing otherwise.
 */
function RunCell({ column, running, onRun }: { column: ComparisonColumn; running: boolean; onRun: (id: string) => void }) {
  if (running) return <span className="text-xs text-gray-600">Running...</span>;
  if (!column.offerRun) return null;
  return (
    <button
      type="button"
      aria-label={`Run simulation for ${column.name}`}
      onClick={() => onRun(column.id)}
      className="px-2 py-0.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700"
    >
      Run
    </button>
  );
}

/**
 * The Run row: under the scenario names, inside the header band, a Run under each scenario that
 * can run and draws no curve. Rendered only while some column offers a Run or is running.
 *
 * ⚠️ `data-capture-skip` keeps it out of the copied picture (`copyChartAsPng`), and it is never
 * printed — paper renders its own table. Its cells are `<td>`, not `<th>`, so no column header's
 * accessible name changes. Inside the captured region: light colours only, NO `dark:` variant —
 * and the `bg-gray-50` is load-bearing: without it "Running..." sits on white.
 */
function RunRow({
  columns,
  runningIds,
  onRunScenario,
}: {
  columns: ComparisonColumn[];
  runningIds: ReadonlySet<string>;
  onRunScenario: (scenarioId: string) => void;
}) {
  const rowRef = useRef<HTMLTableRowElement>(null);
  if (!columns.some((col) => col.offerRun || runningIds.has(col.id))) return null;
  // Focus moves to the column's header FIRST: the button is about to be replaced, and focus must
  // not fall to <body>. The header is matched by its dataset, never by a selector built from the id:
  // an imported id can hold a `"`, and querySelector would throw before the run starts.
  const run = (scenarioId: string) => {
    const headers = rowRef.current?.closest("table")?.querySelectorAll<HTMLElement>("th[data-scenario-id]");
    Array.from(headers ?? []).find((th) => th.dataset.scenarioId === scenarioId)?.focus();
    onRunScenario(scenarioId);
  };
  return (
    <tr ref={rowRef} className="bg-gray-50" data-capture-skip="">
      <td />
      {columns.map((col) => (
        <td key={col.id} className="px-4 pb-2 text-right whitespace-nowrap">
          <RunCell column={col} running={runningIds.has(col.id)} onRun={run} />
        </td>
      ))}
    </tr>
  );
}

/**
 * One flagged scenario's note (WI-58), in the owner's words: its name and the summary's heading in
 * medium weight, then the rows and what they stop. One row reads as one sentence run; several put each
 * row on its own line — at most three, as the Run toast — because Compare is a summary and the full
 * list is one tab away.
 */
function FlagNoteView({ flag }: { flag: ComparisonFlagNote }) {
  const note = flagNote(flag.input, "compare");
  if (note.rows.length === 1 && !note.more) {
    return (
      <p className="px-4 py-2 text-xs text-amber-700 border-t border-gray-100">
        <span className="font-medium text-amber-800">{note.heading}</span> {note.rows[0]} {note.consequence}
      </p>
    );
  }
  return (
    <div className="px-4 py-2 text-xs text-amber-700 border-t border-gray-100 space-y-0.5">
      <p className="font-medium text-amber-800">{note.heading}</p>
      {note.rows.map((line, i) => (
        <p key={flag.rowIds[i]}>{line}</p>
      ))}
      {note.more && <p>{note.more}</p>}
      <p>{note.consequence}</p>
    </div>
  );
}

/**
 * The notes under the table, in this order: one amber note per flagged scenario (column order), the
 * grey run note, the red note. ⚠️ The wrapper is `w-0 min-w-full` so the notes WRAP AT THE TABLE'S
 * WIDTH and never widen the box — or the copied image — around it: a note contributes nothing to the
 * captured region's width, then stretches to it (WI-58; measured: the engine's error note had widened
 * the box from 404 to 1,216 px, and the copied image with it).
 * ⚠️ Inside the captured region: light colours only, NO `dark:` variant (see the note on tableRef).
 */
function ComparisonNotes({ model }: { model: ComparisonModel }) {
  if (model.flagNotes.length === 0 && !model.runNote && !model.failNote) return null;
  return (
    <div className="w-0 min-w-full">
      {model.flagNotes.map((f) => (
        <FlagNoteView key={f.scenarioId} flag={f} />
      ))}
      {model.runNote && (
        <p className="px-4 py-2 text-xs text-gray-500 border-t border-gray-100">{model.runNote}</p>
      )}
      {model.failNote && (
        <p className="px-4 py-2 text-xs text-red-700 border-t border-gray-100">{model.failNote}</p>
      )}
    </div>
  );
}

export function ScenarioComparisonTable({
  scenarios,
  calendar,
  showActivityNumbers = false,
  activeRunGate = null,
  onRunScenario,
  runningIds = NOTHING_RUNNING,
  runStatus = "",
}: ScenarioComparisonProps) {
  const formatDate = useDateFormat();
  const tableRef = useRef<HTMLDivElement>(null);
  const cdfRef = useRef<HTMLDivElement>(null);
  // What the comparison says — the same model the printed comparison renders (WI-61).
  const model = useMemo(
    () => buildComparisonModel({ scenarios, calendar, showActivityNumbers, runGate: activeRunGate, formatDate }),
    [scenarios, calendar, showActivityNumbers, activeRunGate, formatDate]
  );

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

  return (
    <div className="inline-block bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden [overflow-anchor:none]">
      {/* Comparison table — header bar (chrome, not in screenshot) above the
          captured region. Matches the GanttSection pattern: label on the left,
          copy button on the right. */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Scenario Comparison
        </h3>
        {/* The Run row's announcements: always mounted, so a screen reader hears each change. */}
        <p role="status" className="sr-only">{runStatus}</p>
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
          {/* The names and the Run row read as ONE grey band with ONE rule beneath it: the rule is
              the first body row's top border (below), not a border on either header row. */}
          <thead>
            <tr className="bg-gray-50">
              <th className="text-left px-4 py-2 text-gray-500 font-medium whitespace-nowrap">
                Metric
              </th>
              {model.columns.map((col) => (
                <th
                  key={col.id}
                  // A Run moves focus here before its button goes (see RunRow).
                  tabIndex={-1}
                  data-scenario-id={col.id}
                  className="text-right px-4 py-2 text-gray-900 font-semibold whitespace-nowrap min-w-[120px]"
                >
                  {col.name}
                  {/* A <div>, not a span: its own line, and a block the accessible name
                      separates with a space ("Fast-track 1 flagged"). The grid bar's words. */}
                  {col.flaggedCount > 0 && (
                    <div className="text-xs font-medium text-amber-700">
                      {col.flaggedCount} flagged
                    </div>
                  )}
                </th>
              ))}
            </tr>
            {onRunScenario && (
              <RunRow columns={model.columns} runningIds={runningIds} onRunScenario={onRunScenario} />
            )}
          </thead>
          <tbody>
            {model.rows.map((row, i) => (
              <tr
                key={row.label}
                // The header's rule is the FIRST body row's top border. On screen the collapsed
                // border falls on the line beneath the whole header band, Run row included. And
                // html2canvas paints a row's border but not a table section's: on <thead> the rule
                // was missing from the copied picture (measured), which had always shown it.
                className={i % 2 === 0 ? "bg-white first:border-t first:border-gray-200" : "bg-gray-50/50"}
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
        <ComparisonNotes model={model} />
      </div>

      {/* CDF Comparison Chart — same chrome pattern. The existing h4 inside the
          chart moves up into the header (so it isn't duplicated) and the ref'd
          region contains only the chart. */}
      {model.cdf && (
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
              datasets={model.cdf.datasets}
              probabilityTarget={model.cdf.target}
              caption={model.cdf.caption}
              formatDurationAsDate={formatDurationAsDate}
            />
          </div>
        </>
      )}
    </div>
  );
}
