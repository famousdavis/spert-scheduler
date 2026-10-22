// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { ScenarioComparisonTable } from "./ScenarioComparison";
import { createScenario, createActivity, cloneScenario } from "@app/api/project-service";
import type { Activity, Scenario, SimulationRun } from "@domain/models/types";

/**
 * WI-125 on the screen: the three buffer-use rows render in the table's own order and the note that names
 * the first column renders FIRST under the table, inside the copied region. Values are hand-counted on
 * the plain Mon–Fri week (no calendar): three activities of 10 days from Mon 2026-01-05 end Fri 2026-02-13
 * (working day 30); one finished 3 days late ends Wed 2026-02-18 (33). A P95 of 40 gives a Buffer of +10.
 */

afterEach(cleanup);

const START = "2026-01-05";

function plan(name: string): Scenario {
  const s = createScenario(name, START);
  return { ...s, activities: [1, 2, 3].map((n) => ({ ...createActivity(`Row ${n}`, s.settings), min: 10, mostLikely: 10, max: 10 })) };
}
function ran(s: Scenario, p95: number): Scenario {
  const results: SimulationRun = {
    id: `run-${s.id}`,
    timestamp: "2026-01-05T00:00:00.000Z",
    trialCount: 3,
    seed: "wi125-screen",
    engineVersion: "1.1.1",
    percentiles: { 50: p95 - 5, 75: p95 - 3, 90: p95 - 1, 95: p95 },
    histogramBins: [],
    mean: p95 - 5,
    standardDeviation: 2,
    minSample: p95 - 8,
    maxSample: p95 + 2,
    samples: [p95 - 8, p95 - 5, p95],
  };
  return { ...s, simulationResults: results };
}
function lateBy3(source: Scenario, name: string): Scenario {
  const copy = cloneScenario(source, name);
  return { ...copy, activities: copy.activities.map((a, i): Activity => (i === 0 ? { ...a, status: "complete", actualDuration: 13 } : a)) };
}

const rowElements = (): HTMLTableRowElement[] => Array.from(document.querySelectorAll("tbody tr"));
const labelOf = (row: HTMLTableRowElement) => row.querySelector("td")?.textContent?.trim() ?? "";
const textsOf = (label: string) =>
  Array.from(rowElements().find((r) => labelOf(r) === label)?.querySelectorAll("td") ?? []).slice(1).map((c) => c.textContent?.trim());
/** The notes box: whatever follows the table in the captured region. */
const notesBox = () => document.querySelector("table")!.nextElementSibling as HTMLElement | null;

const LABELS = ["Buffer used (days)", "Buffer left (days)", "Buffer used (%)"];

describe("ScenarioComparisonTable — buffer use against the first column (WI-125)", () => {
  it("renders the three rows after \"Duration w/Buffer\", with each column's cells", () => {
    render(<ScenarioComparisonTable scenarios={[ran(plan("Baseline"), 40), lateBy3(plan("Baseline"), "Week 3")]} />);
    const labels = rowElements().map(labelOf);
    const at = labels.indexOf("Duration w/Buffer");
    expect(labels.slice(at + 1, at + 4)).toEqual(LABELS);
    expect(textsOf("End Date (no buffer)")).toEqual(["02/13/2026", "02/18/2026"]);
    expect(LABELS.map(textsOf)).toEqual([["0", "3"], ["10", "7"], ["0%", "30%"]]);
  });

  it("puts the note first under the table, in grey, inside the captured region with no dark: variant", () => {
    render(<ScenarioComparisonTable scenarios={[ran(plan("Baseline"), 40), lateBy3(plan("Baseline"), "Week 3")]} />);
    const note = notesBox()!.firstElementChild as HTMLElement;
    expect(note.textContent).toBe(
      "Buffer used and Buffer left are measured against the first column, Baseline, and its 10 buffer days. " +
        "Used: the working days a column's End Date (no buffer) has moved past Baseline's — below 0, days were recovered. " +
        "Left: 10 less used. " +
        "A column's own Buffer (days) is recalculated from the work still ahead, so it is not its buffer left."
    );
    expect(note.className).toContain("text-gray-600");
    expect(note.className).not.toMatch(/amber|red/);
    const region = document.querySelector("table")!.parentElement!;
    expect(region.contains(note)).toBe(true);
    expect(region.querySelectorAll('[class*="dark:"]')).toHaveLength(0);
  });

  it("names a long first column in the note, never in a label — the labels keep their width", () => {
    const longName = `Baseline ${"x".repeat(191)}`; // 200 characters, NAME_MAX_LENGTH
    render(<ScenarioComparisonTable scenarios={[ran(plan(longName), 40), lateBy3(plan(longName), "Week 3")]} />);
    for (const row of rowElements()) expect(labelOf(row)).not.toContain(longName);
    expect(notesBox()!.firstElementChild!.textContent).toContain(`the first column, ${longName}, and its 10 buffer days`);
    expect(notesBox()!.className.split(/\s+/)).toEqual(expect.arrayContaining(["w-0", "min-w-full"]));
  });

  it("an alternative plan with no progress: no rows and no note — control: the status update above shows both", () => {
    const alt = cloneScenario(plan("Baseline"), "Fast-track");
    render(<ScenarioComparisonTable scenarios={[ran(plan("Baseline"), 40), alt]} />);
    expect(rowElements().map(labelOf).filter((l) => LABELS.includes(l))).toEqual([]);
    expect(notesBox()?.textContent ?? "").not.toContain("Buffer use");
  });

  it("the later status update first: no rows, and the note says which tab to drag", () => {
    render(<ScenarioComparisonTable scenarios={[lateBy3(plan("Baseline"), "Week 3"), ran(plan("Baseline"), 40)]} />);
    expect(rowElements().map(labelOf).filter((l) => LABELS.includes(l))).toEqual([]);
    expect(notesBox()!.firstElementChild!.textContent).toBe(
      "Buffer use is measured against the first column. To see Week 3's use of Baseline's buffer, drag Baseline's tab to the left of Week 3's."
    );
  });
});
