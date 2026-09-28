// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";

import { ScenarioComparisonTable } from "./ScenarioComparison";
import { createScenario, createActivity } from "@app/api/project-service";
import type { Activity, Scenario } from "@domain/models/types";

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
 *
 * WI-60 (v0.72.1): a row marks a best only when at least two cells have a value. With
 * one scenario run and one not, WI-43's fix had moved the unearned mark from the unrun
 * column to the run one rather than removing it.
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

// Baseline is run and buffered to 140; the clone is UNRUN and its deterministic
// schedule is LONGER (120 vs 100), so post-fix it legitimately wins nothing.
// Shared by the WI-43 and WI-60 blocks below.
const RUN = withResults(scenarioLasting("Baseline", 100), 140, 200);
const UNRUN = scenarioLasting("Clone", 120);
const UNRUN_COL = 1;

describe("ScenarioComparisonTable — a scenario that has not been run (WI-43)", () => {
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

describe("ScenarioComparisonTable — no best without a rival (WI-60)", () => {
  it("marks no best in a row where only one scenario has a value", () => {
    render(<ScenarioComparisonTable scenarios={[RUN, UNRUN]} />);
    // Positive control ON THIS RENDER (see the "Buffer (days)" test below for why it
    // cannot live in a sibling): both scenarios have a deterministic schedule, so this
    // row HAS a rival, and its minimum must still be marked.
    expect(textsOf("Duration (days)")).toEqual(["100", "120"]);
    expect(highlightsOf("Duration (days)")).toEqual([true, false]);
    // Premise: the run scenario has a value in both rows below, the unrun one none.
    expect(textsOf("Duration w/Buffer")).toEqual(["140", BLANK]);
    expect(textsOf("Mean")).toEqual(["200.0", BLANK]);
    // One assertion over both rows, so the guard missing from EITHER fails it, and the
    // diff shows which.
    expect({
      "Duration w/Buffer": highlightsOf("Duration w/Buffer"),
      Mean: highlightsOf("Mean"),
    }).toEqual({
      "Duration w/Buffer": [false, false],
      Mean: [false, false],
    });
  });

  // Two run scenarios with the unrun one between them. The smaller buffered duration is
  // in the LAST column, so a highlight that defaulted to the first cell would miss it.
  const RUN_A = withResults(scenarioLasting("Plan A", 100), 160, 210);
  const UNRUN_B = scenarioLasting("Plan B", 130);
  const RUN_C = withResults(scenarioLasting("Plan C", 110), 140, 190);

  it("still marks the better of two run scenarios, and nothing in the unrun one", () => {
    render(<ScenarioComparisonTable scenarios={[RUN_A, UNRUN_B, RUN_C]} />);
    expect(textsOf("Duration w/Buffer")).toEqual(["160", BLANK, "140"]);
    expect(highlightsOf("Duration w/Buffer")).toEqual([false, false, true]);
    expect(textsOf("Mean")).toEqual(["210.0", BLANK, "190.0"]);
    expect(highlightsOf("Mean")).toEqual([false, false, true]);
    // Plan B is not the shortest on "Duration (days)" either (130 against 100 and 110),
    // so it has no row to win.
    expect(highlightedRowsForColumn(1)).toEqual([]);
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

// ── WI-58: a flagged scenario (validation errors in its SAVED activities) ─────────────────

/** A second, FLAGGED activity: Min above Most Likely on a T-Normal, which still builds. It runs
 *  alongside the first in dependency mode, so the scenario's Duration (days) is unchanged. */
function withParallelFlag(scenario: Scenario, name = "Change programme"): Scenario {
  const flaggedRow: Activity = {
    ...createActivity(name, scenario.settings),
    min: 5,
    mostLikely: 4,
    max: 10,
    distributionType: "normal",
  };
  return {
    ...scenario,
    settings: { ...scenario.settings, dependencyMode: true },
    activities: [...scenario.activities, flaggedRow],
  };
}

/** A scenario whose ONE activity stops its schedule: a Triangular out of order. */
function stoppedBy(name: string): Scenario {
  const scenario = createScenario(name, START);
  const row: Activity = {
    ...createActivity("Global design workshops", scenario.settings),
    min: 30,
    mostLikely: 26,
    max: 40,
    distributionType: "triangular",
  };
  return { ...scenario, activities: [row] };
}

/** Two activities that depend on each other: a cycle, which the UI refuses and an import can carry. */
function cyclic(name: string, extra: Activity[] = []): Scenario {
  const scenario = createScenario(name, START);
  const a = { ...createActivity("A", scenario.settings), min: 5, mostLikely: 10, max: 20 };
  const b = { ...createActivity("B", scenario.settings), min: 5, mostLikely: 10, max: 20 };
  return {
    ...scenario,
    settings: { ...scenario.settings, dependencyMode: true },
    activities: [a, b, ...extra],
    dependencies: [
      { fromActivityId: a.id, toActivityId: b.id, type: "FS", lagDays: 0 },
      { fromActivityId: b.id, toActivityId: a.id, type: "FS", lagDays: 0 },
    ],
  };
}

/** The notes under the table, in order, as the reader sees them: whatever follows the table in the
 *  captured region, located WITHOUT the wrapper's width classes so that removing those fails only the
 *  test that is about them. */
function notesBox(): Element | null {
  const table = document.querySelector("table")!;
  const after = table.nextElementSibling;
  return after && after.tagName === "DIV" ? after : null;
}
function notes(): { text: string; tone: string }[] {
  const nodes = notesBox() ? Array.from(notesBox()!.children) : [];
  return nodes.map((n) => {
    const cls = (n as HTMLElement).className;
    let tone = "grey";
    if (cls.includes("amber")) tone = "amber";
    else if (cls.includes("red")) tone = "red";
    return { text: n.textContent ?? "", tone };
  });
}

const ALL_ROWS = ["Duration (days)", "Duration w/Buffer", "Mean"];
const marksOf = () => Object.fromEntries(ALL_ROWS.map((l) => [l, highlightsOf(l)]));

describe("WI-58 — the flag in the column header", () => {
  it("reads '1 flagged' under the name, and the header's accessible name carries both", () => {
    render(<ScenarioComparisonTable scenarios={[RUN, withParallelFlag(scenarioLasting("Fast-track", 100))]} />);
    expect(screen.getByRole("columnheader", { name: "Fast-track 1 flagged" })).toBeDefined();
    expect(screen.getByRole("columnheader", { name: "Baseline" })).toBeDefined();
  });

  it("counts every flagged row: '2 flagged'", () => {
    const twice = withParallelFlag(withParallelFlag(scenarioLasting("Fast-track", 100)), "Data governance");
    render(<ScenarioComparisonTable scenarios={[RUN, twice]} />);
    expect(screen.getByRole("columnheader", { name: "Fast-track 2 flagged" })).toBeDefined();
  });
});

describe("WI-58 — a flagged scenario is never marked best (C1)", () => {
  it("does not compete, however low its values; the others still do", () => {
    const flaggedLowest = withParallelFlag(scenarioLasting("Flagged", 90));
    render(<ScenarioComparisonTable scenarios={[scenarioLasting("A", 100), flaggedLowest, scenarioLasting("C", 110)]} />);
    expect(textsOf("Duration (days)")).toEqual(["100", "90", "110"]);
    expect(highlightsOf("Duration (days)")).toEqual([true, false, false]);
  });

  it("with two compared and one flagged, marks nothing (WI-60: a best needs two contenders)", () => {
    render(<ScenarioComparisonTable scenarios={[scenarioLasting("A", 100), withParallelFlag(scenarioLasting("B", 90))]} />);
    expect(highlightsOf("Duration (days)")).toEqual([false, false]);
    cleanup();
    // Control: the same values without the flag mark the 90.
    render(<ScenarioComparisonTable scenarios={[scenarioLasting("A", 100), scenarioLasting("B", 90)]} />);
    expect(highlightsOf("Duration (days)")).toEqual([false, true]);
  });

  it("a three-way tie (S10): the two valid scenarios are best in all three rows, the flagged one in none", () => {
    const base = withResults(scenarioLasting("Baseline", 100), 140, 200);
    const twin = withResults(scenarioLasting("Twin", 100), 140, 200);
    const flagged = withResults(withParallelFlag(scenarioLasting("Flagged", 100)), 140, 200);
    render(<ScenarioComparisonTable scenarios={[base, flagged, twin]} />);
    expect(textsOf("Mean")).toEqual(["200.0", "200.0", "200.0"]);
    expect(marksOf()).toEqual({
      "Duration (days)": [true, false, true],
      "Duration w/Buffer": [true, false, true],
      Mean: [true, false, true],
    });
  });

  it("a flagged scenario WITH results and the lower values (S11) wins no row, in either column order", () => {
    const lean = withResults(withParallelFlag(scenarioLasting("Lean", 90)), 130, 190);
    const base = withResults(scenarioLasting("Baseline", 100), 140, 200);
    render(<ScenarioComparisonTable scenarios={[lean, base]} />);
    expect(marksOf()).toEqual({ "Duration (days)": [false, false], "Duration w/Buffer": [false, false], Mean: [false, false] });
    cleanup();
    render(<ScenarioComparisonTable scenarios={[base, lean]} />);
    expect(marksOf()).toEqual({ "Duration (days)": [false, false], "Duration w/Buffer": [false, false], Mean: [false, false] });
    cleanup();
    // Control: unflagged, the same values win all three rows.
    render(<ScenarioComparisonTable scenarios={[withResults(scenarioLasting("Lean", 90), 130, 190), base]} />);
    expect(marksOf()).toEqual({ "Duration (days)": [true, false], "Duration w/Buffer": [true, false], Mean: [true, false] });
  });
});

describe("WI-58 — the notes under the table: which, in what words, in what order", () => {
  it("W3: a flag that does not stop the schedule — one amber note, in the owner's words", () => {
    render(<ScenarioComparisonTable scenarios={[RUN, withParallelFlag(scenarioLasting("Fast-track", 100))]} />);
    expect(notes()).toEqual([
      {
        tone: "amber",
        text: "Fast-track: 1 activity has validation errors. Change programme: Min is above Most Likely. It cannot be simulated until this is fixed.",
      },
    ]);
  });

  it("W4: a flag that stops the schedule REPLACES the red engine note (C3)", () => {
    const { container } = render(<ScenarioComparisonTable scenarios={[RUN, stoppedBy("Aggressive")]} />);
    expect(notes()).toEqual([
      {
        tone: "amber",
        text: "Aggressive: 1 activity has validation errors. Global design workshops: Min is above Most Likely. Its schedule cannot be calculated until this is fixed.",
      },
    ]);
    for (const jargon of ["Cannot create", "Distribution:", "<=", "got a="]) {
      expect(container.textContent).not.toContain(jargon);
    }
  });

  it("a cycle keeps today's red note, word for word, with no flag (C3's control)", () => {
    render(<ScenarioComparisonTable scenarios={[RUN, cyclic("Cyclic")]} />);
    const red = notes().filter((n) => n.tone === "red");
    expect(red).toHaveLength(1);
    expect(red[0]!.text).toMatch(/^Could not compute a schedule for: Cyclic \(Dependency cycle detected/);
    expect(notes().filter((n) => n.tone === "amber")).toEqual([]);
  });

  it("a cycle AND a stopping row (S8b): the red cycle note, and the amber note with W3's words", () => {
    const thrower: Activity = { ...stoppedBy("x").activities[0]! };
    render(<ScenarioComparisonTable scenarios={[RUN, cyclic("Cyclic", [thrower])]} />);
    const tones = notes().map((n) => n.tone);
    expect(tones).toEqual(["amber", "red"]);
    expect(notes()[0]!.text).toMatch(/It cannot be simulated until this is fixed\.$/);
    expect(notes()[1]!.text).toMatch(/Dependency cycle detected/);
  });

  it("several rows (P-b): each on its own line — three, then 'and N more.' — then what they stop", () => {
    let many = scenarioLasting("Stretch", 100);
    for (const n of ["One", "Two", "Three", "Four", "Five"]) many = withParallelFlag(many, n);
    render(<ScenarioComparisonTable scenarios={[RUN, many]} />);
    const amber = notesBox()!.firstElementChild!;
    expect(Array.from(amber.children).map((p) => p.textContent)).toEqual([
      "Stretch: 5 activities have validation errors.",
      "One: Min is above Most Likely.",
      "Two: Min is above Most Likely.",
      "Three: Min is above Most Likely.",
      "and 2 more.",
      "It cannot be simulated until these are fixed.",
    ]);
  });

  it("numbers each row by ITS scenario's own order when the project numbers activities (P-e)", () => {
    const early = withParallelFlag(scenarioLasting("Early", 100)); // the flagged row is its #2
    const late = withParallelFlag(withParallelFlag(scenarioLasting("Late", 100), "Valid first"), "Flag"); // #2 and #3
    render(<ScenarioComparisonTable scenarios={[early, late]} showActivityNumbers />);
    expect(notes()[0]!.text).toContain("#2 Change programme: Min is above Most Likely.");
    expect(notes()[1]!.text).toContain("#3 Flag: Min is above Most Likely.");
    cleanup();
    render(<ScenarioComparisonTable scenarios={[early, late]} />);
    expect(notes()[0]!.text).toContain(" Change programme: Min is above Most Likely.");
    expect(notes()[0]!.text).not.toContain("#");
  });
});

describe("WI-58 — the grey note asks only for a run that can start (C4)", () => {
  const grey = () => notes().filter((n) => n.tone === "grey").map((n) => n.text);

  it("today's words when EVERY compared scenario can run — in the darker grey", () => {
    render(<ScenarioComparisonTable scenarios={[RUN, UNRUN]} />);
    expect(grey()).toEqual(["Run simulation on all scenarios for complete comparison data."]);
    const p = notesBox()!.lastElementChild!;
    expect(p.className).toContain("text-gray-500");
    expect(p.className).not.toContain("text-gray-400");
  });

  it("names the one that can when a flagged scenario is compared (S6c)", () => {
    render(<ScenarioComparisonTable scenarios={[scenarioLasting("Baseline", 100), withParallelFlag(scenarioLasting("Fast-track", 100))]} />);
    expect(grey()).toEqual(["Run simulation on Baseline to add its results to the comparison."]);
  });

  it("names two in column order, and 'their'", () => {
    const flagged = withParallelFlag(scenarioLasting("Fast-track", 100));
    render(<ScenarioComparisonTable scenarios={[scenarioLasting("Plan B", 100), flagged, scenarioLasting("Baseline", 100)]} />);
    expect(grey()).toEqual(["Run simulation on Plan B and Baseline to add their results to the comparison."]);
  });

  it("names the valid one beside a flagged scenario that HAS results (S9)", () => {
    const merged = withResults(withParallelFlag(scenarioLasting("Merged", 100)), 140, 200);
    render(<ScenarioComparisonTable scenarios={[merged, scenarioLasting("Baseline", 100)]} />);
    expect(grey()).toEqual(["Run simulation on Baseline to add its results to the comparison."]);
  });

  it("says nothing when no unrun scenario can run: flagged, stopped, empty or cyclic beside a run one", () => {
    const empty: Scenario = createScenario("Empty", START);
    for (const other of [withParallelFlag(scenarioLasting("Fast-track", 100)), stoppedBy("Aggressive"), empty, cyclic("Cyclic")]) {
      render(<ScenarioComparisonTable scenarios={[RUN, other]} />);
      expect(grey()).toEqual([]);
      cleanup();
    }
  });

  it("follows the SCREEN's Run gate for the scenario on screen: a refused cell stops its run being asked for (S4u)", () => {
    const planB = scenarioLasting("Plan B", 100);
    const base = scenarioLasting("Baseline", 100);
    render(<ScenarioComparisonTable scenarios={[base, planB]} activeRunGate={{ scenarioId: planB.id, runBlocked: true }} />);
    expect(grey()).toEqual(["Run simulation on Baseline to add its results to the comparison."]);
    cleanup();
    // The gate is that ONE scenario's: pointing at another id changes nothing here.
    render(<ScenarioComparisonTable scenarios={[base, planB]} activeRunGate={{ scenarioId: "someone-else", runBlocked: true }} />);
    expect(grey()).toEqual(["Run simulation on all scenarios for complete comparison data."]);
  });
});

describe("WI-58 — the captured region stays light (C7) and the notes cannot widen it", () => {
  it("carries no dark: variant anywhere inside the region the copy button captures", () => {
    render(<ScenarioComparisonTable scenarios={[RUN, withParallelFlag(scenarioLasting("Fast-track", 100)), cyclic("Cyclic")]} />);
    const region = document.querySelector("table")!.parentElement!;
    // Non-vacuity: the region holds the new text.
    expect(region.textContent).toContain("1 flagged");
    expect(notes().map((n) => n.tone)).toEqual(["amber", "red"]);
    expect(region.querySelectorAll('[class*="dark:"]')).toHaveLength(0);
  });

  it("wraps the notes in a box that contributes no width (measured in Chrome: the copied PNG stayed 810 px)", () => {
    render(<ScenarioComparisonTable scenarios={[RUN, withParallelFlag(scenarioLasting("Fast-track", 100))]} />);
    const wrap = notesBox()!;
    expect(wrap.textContent).toContain("validation errors"); // non-vacuity: it holds a note
    expect(wrap.className.split(/\s+/)).toEqual(expect.arrayContaining(["w-0", "min-w-full"]));
  });
});
