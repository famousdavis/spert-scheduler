// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { PrintableReport } from "./PrintableReport";
import { createActivity, createProject, createScenario, cloneScenario } from "@app/api/project-service";
import type { Activity, Scenario, SimulationRun } from "@domain/models/types";

/**
 * WI-125 on paper: the printed comparison carries the three buffer-use rows with the screen's strings, and
 * the note that names the first column prints right under the table — before any other note, and before the
 * line naming the scenario whose report follows. Hand-counted on the plain Mon–Fri week: 3 × 10 days from
 * Mon 2026-04-06 end Fri 2026-05-15 (working day 30); 3 days late, Wed 2026-05-20 (33). P95 40 → Buffer +10.
 */

afterEach(cleanup);

const START = "2026-04-06";

function plan(name: string): Scenario {
  const s = createScenario(name, START);
  return { ...s, activities: [1, 2, 3].map((n) => ({ ...createActivity(`Row ${n}`, s.settings), min: 10, mostLikely: 10, max: 10 })) };
}
function ran(s: Scenario, p95: number): Scenario {
  const results: SimulationRun = {
    id: `run-${s.id}`,
    timestamp: "2026-04-06T00:00:00.000Z",
    trialCount: 3,
    seed: "wi125-print",
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

function printedSection(onScreen: Scenario, compared: Scenario[]): HTMLElement {
  const project = { ...createProject("Harbour works", START), scenarios: compared };
  const { container } = render(
    <PrintableReport
      project={project}
      scenario={onScreen}
      schedule={null}
      scheduledActivities={[]}
      buffer={null}
      scheduleError={null}
      compareScenarios={compared}
      showActivityNumbers
    />
  );
  const report = container.querySelector(".print-report") as HTMLElement;
  return Array.from(report.querySelectorAll("section")).find((s) => s.querySelector("h2")?.textContent === "Scenario Comparison")!;
}
const rowsOf = (s: HTMLElement) => Array.from(s.querySelectorAll("tbody tr")).map((tr) => Array.from(tr.children).map((td) => td.textContent));

describe("the printed comparison — buffer use against the first column (WI-125)", () => {
  it("prints the three rows after \"Duration w/Buffer\" with the screen's strings", () => {
    const base = ran(plan("Baseline"), 40);
    const week3 = lateBy3(plan("Baseline"), "Week 3");
    const rows = rowsOf(printedSection(week3, [base, week3]));
    const at = rows.findIndex((r) => r[0] === "Duration w/Buffer");
    expect(rows.slice(at + 1, at + 4)).toEqual([
      ["Buffer used (days)", "0", "3"],
      ["Buffer left (days)", "10", "7"],
      ["Buffer used (%)", "0%", "30%"],
    ]);
    expect(rows.find((r) => r[0] === "End Date (no buffer)")).toEqual(["End Date (no buffer)", "05/15/2026", "05/20/2026"]);
  });

  it("prints the note right under the table, before the other notes, and the closing line stays last", () => {
    const base = ran(plan("Baseline"), 40);
    const week3 = lateBy3(plan("Baseline"), "Week 3"); // unrun: the grey run note prints too
    const s = printedSection(week3, [base, week3]);
    const note = s.querySelector("table")!.nextElementSibling!;
    expect(note.textContent).toBe(
      "Buffer used and Buffer left are measured against the first column, Baseline, and its 10 buffer days. " +
        "Used: the working days a column's End Date (no buffer) has moved past Baseline's — below 0, days were recovered. " +
        "Left: 10 less used. " +
        "A column's own Buffer (days) is recalculated from the work still ahead, so it is not its buffer left."
    );
    expect(note.nextElementSibling!.textContent).toBe("Run simulation on Week 3 to add its results to the comparison.");
    expect(s.lastElementChild!.textContent).toBe("The rest of this report describes Week 3.");
  });

  it("prints the hint when the later status update sits first, and no buffer row", () => {
    const base = ran(plan("Baseline"), 40);
    const week3 = ran(lateBy3(plan("Baseline"), "Week 3"), 41);
    const s = printedSection(base, [week3, base]);
    expect(rowsOf(s).map((r) => r[0]).filter((l) => l!.startsWith("Buffer used") || l!.startsWith("Buffer left"))).toEqual([]);
    expect(s.querySelector("table")!.nextElementSibling!.textContent).toBe(
      "Buffer use is measured against the first column. To see Week 3's use of Baseline's buffer, drag Baseline's tab to the left of Week 3's."
    );
  });
});
