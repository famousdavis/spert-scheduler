// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

import { ScenarioComparisonTable } from "./ScenarioComparison";
import { createScenario, createActivity } from "@app/api/project-service";
import type { Scenario } from "@domain/models/types";

/**
 * The comparison table's `highlights` mechanism (WI-43 + WI-41, v0.67.16).
 *
 * The component had NO tests before this file; the only comparison coverage was
 * `use-scenario-comparison.test.ts`, which tests the hook (mode state, selection),
 * not the table.
 *
 * FALSIFICATION — pre-registered 4 failures / 2 passes before the file was written,
 * then run against the pre-fix component at 9a0201e. Result recorded in the PR body.
 * The two must-not-regress tests are falsified by mutation instead, since a test that
 * is green both before and after proves nothing on its own.
 *
 * ⚠️ `highlightsOf` detects a highlight by the `text-green-700` class that
 * `highlightClass` emits. A NEGATIVE class assertion goes silently vacuous if that
 * class is ever renamed — the highlight would still render and every "is not
 * highlighted" test would still pass. `Duration (days)` (below) asserts a cell IS
 * highlighted on the same render, so it is the positive control for the instrument:
 * rename the class and it fails loudly rather than turning the others green.
 */

afterEach(cleanup);

const START = "2026-01-05"; // Monday

/** Zero-uncertainty activity (min = mostLikely = max), so the deterministic
 *  schedule is exactly `days` regardless of the probability target. */
function scenarioLasting(name: string, days: number): Scenario {
  const scenario = createScenario(name, START);
  const activity = createActivity("Build", scenario.settings);
  return {
    ...scenario,
    activities: [{ ...activity, min: days, mostLikely: days, max: days }],
  };
}

/** Attaches simulation results, which is what gives a scenario a buffer.
 *  `p95` is read straight back out as `ScheduleBuffer.projectTargetDuration`. */
function withResults(scenario: Scenario, p95: number, mean: number): Scenario {
  return {
    ...scenario,
    simulationResults: {
      id: `run-${scenario.id}`,
      timestamp: "2026-01-05T00:00:00.000Z",
      trialCount: 1000,
      seed: "exec-16-fixture",
      engineVersion: "1.1.1",
      percentiles: { 50: p95 - 30, 75: p95 - 20, 90: p95 - 10, 95: p95 },
      histogramBins: [],
      mean,
      standardDeviation: 12.5,
      minSample: p95 - 50,
      maxSample: p95 + 10,
      samples: [p95 - 30, p95 - 10, p95],
    },
  };
}

const BEST_CLASS = "text-green-700";
const BLANK = "—"; // the &mdash; rendered for a null cell

/**
 * ⚠️ Rows are located by their LABEL CELL, never by `getByText`. Row labels are not
 * unique page text: `getByText("P95")` matches BOTH the `P95` row label and the
 * `Project Target` value cell, so a label-text lookup throws on the percentile rows
 * and any sweep over every row dies on an instrument fault rather than on the
 * behaviour under test. (Measured — it is how this file's first run failed.)
 */
const rowElements = (): HTMLTableRowElement[] =>
  Array.from(document.querySelectorAll("tbody tr"));

const labelOf = (row: HTMLTableRowElement): string =>
  row.querySelector("td")?.textContent?.trim() ?? "";

/** The value cells of a row — the first <td> is the label, the rest are scenarios. */
function cellsOf(label: string): HTMLTableCellElement[] {
  const row = rowElements().find((r) => labelOf(r) === label);
  if (!row) {
    throw new Error(
      `no row labelled "${label}". Rows present: ${rowElements().map(labelOf).join(" | ")}`
    );
  }
  return Array.from(row.querySelectorAll("td")).slice(1);
}

const textsOf = (label: string) =>
  cellsOf(label).map((c) => c.textContent?.trim() ?? "");

const highlightsOf = (label: string) =>
  cellsOf(label).map((c) => c.className.includes(BEST_CLASS));

/** Row labels where the scenario at `column` carries a best-highlight. */
function highlightedRowsForColumn(column: number): string[] {
  return rowElements()
    .filter((row) => {
      const cells = Array.from(row.querySelectorAll("td")).slice(1);
      return cells[column]?.className.includes(BEST_CLASS) === true;
    })
    .map(labelOf);
}

const BUFFER_ROWS = ["Buffer (days)", "End Date (w/buffer)", "Duration w/Buffer"];

describe("ScenarioComparisonTable — a scenario that has not been run (WI-43)", () => {
  // Baseline is run and buffered to 140; the clone is UNRUN and its deterministic
  // schedule is LONGER (120 vs 100), so post-fix it legitimately wins nothing.
  const RUN = withResults(scenarioLasting("Baseline", 100), 140, 200);
  const UNRUN = scenarioLasting("Clone", 120);
  const UNRUN_COL = 1;

  const renderPair = () =>
    render(<ScenarioComparisonTable scenarios={[RUN, UNRUN]} />);

  it("leaves its 'Duration w/Buffer' cell blank rather than publishing the unbuffered duration", () => {
    renderPair();
    // Premise: the unbuffered duration exists and is NOT what this row may show.
    expect(textsOf("Duration (days)")[UNRUN_COL]).toBe("120");
    expect(textsOf("Duration w/Buffer")[UNRUN_COL]).toBe(BLANK);
  });

  it("blanks ALL THREE buffer-derived rows identically", () => {
    renderPair();
    // The run scenario proves each row can produce a value, so the blanks below
    // are a decision about the unrun scenario and not an empty table.
    for (const label of BUFFER_ROWS) {
      expect(textsOf(label)[0]).not.toBe(BLANK);
    }
    expect(BUFFER_ROWS.map((label) => textsOf(label)[UNRUN_COL])).toEqual([
      BLANK,
      BLANK,
      BLANK,
    ]);
  });

  it("carries no best-highlight in any row, so it is never declared the winner", () => {
    renderPair();
    // Positive control on the SAME render: an empty sweep is also what a broken
    // sweep returns, so prove the run scenario's highlight is visible to it first.
    expect(highlightedRowsForColumn(0)).toContain("Duration (days)");
    expect(highlightedRowsForColumn(UNRUN_COL)).toEqual([]);
  });
});

describe("ScenarioComparisonTable — highlighting matches what the cells display (WI-41)", () => {
  // Two means that differ in the second decimal and so RENDER IDENTICALLY as
  // "323.3". Beta's is the smaller raw float.
  const ALPHA = withResults(scenarioLasting("Alpha", 100), 140, 323.34);
  const BETA = withResults(scenarioLasting("Beta", 120), 170, 323.28);

  const renderPair = () =>
    render(<ScenarioComparisonTable scenarios={[ALPHA, BETA]} />);

  it("gives two cells that display the same string the same highlight", () => {
    renderPair();
    const [a, b] = textsOf("Mean");
    expect(a).toBe("323.3");
    expect(b).toBe("323.3"); // visibly identical...
    expect(highlightsOf("Mean")[0]).toBe(highlightsOf("Mean")[1]); // ...so identically marked
  });

  it("still highlights exactly the minimum of 'Duration (days)' — the positive control", () => {
    renderPair();
    expect(textsOf("Duration (days)")).toEqual(["100", "120"]);
    expect(highlightsOf("Duration (days)")).toEqual([true, false]);
  });

  it("leaves 'Buffer (days)' unhighlighted even when the two values differ", () => {
    renderPair();
    const [a, b] = textsOf("Buffer (days)");
    // Non-vacuity: both cells carry a real, DIFFERENT value, so "no highlight"
    // is a decision rather than an empty row. More buffer is not better — see
    // the comment at the row itself.
    expect(a).not.toBe(BLANK);
    expect(b).not.toBe(BLANK);
    expect(a).not.toBe(b);
    // ⚠️ Positive control ON THIS RENDER. Measured: renaming the highlight class left
    // this test GREEN while the row was still being highlighted — a negative class
    // assertion cannot tell "not highlighted" from "cannot see highlights". Relying on
    // the control in the test above was not enough; it has to be in this one.
    expect(highlightsOf("Duration (days)")).toContain(true);
    expect(highlightsOf("Buffer (days)")).toEqual([false, false]);
  });
});
