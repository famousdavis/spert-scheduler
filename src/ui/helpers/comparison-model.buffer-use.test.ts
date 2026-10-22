// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import { buildComparisonModel, type ComparisonModel } from "./comparison-model";
import { createScenario, createActivity, cloneScenario } from "@app/api/project-service";
import { buildWorkCalendar } from "@core/calendar/work-calendar";
import type { Activity, Scenario, ScenarioSettings, SimulationRun } from "@domain/models/types";

/**
 * WI-125 — how much of the FIRST column's buffer a later status update has used.
 *
 * Every expected value below is COUNTED BY HAND from this calendar, never computed by calling the model
 * or the calendar code. Mon–Fri, with two holidays: Mon 2026-01-19 and Tue 2026-02-17. Working-day
 * positions from Mon 2026-01-05 (= 1):
 *
 *   Jan  5  6  7  8  9 →  1– 5     Feb  2  3  4  5  6 → 20–24     Mar  2  3  4  5  6 → 39–43
 *   Jan 12 13 14 15 16 →  6–10     Feb  9 10 11 12 13 → 25–29     Mar  9             → 44
 *   Jan 20 21 22 23    → 11–14     Feb 16 18 19 20    → 30–33     (Jan 19, Feb 17: holidays)
 *   Jan 26 27 28 29 30 → 15–19     Feb 23 24 25 26 27 → 34–38
 *
 * The plan: three activities of exactly 10 days, in list order (Min = Most Likely = Max, so every target
 * schedules 10). Its End Date (no buffer) is position 30, Mon 02-16. A run whose P95 is 40 gives a Buffer
 * of 40 − 30 = +10 and an End Date (w/buffer) at position 40, Tue 03-03.
 */

const START = "2026-01-05";
const CAL = buildWorkCalendar([1, 2, 3, 4, 5], [
  { id: "h1", name: "Holiday one", startDate: "2026-01-19", endDate: "2026-01-19", source: "manual" },
  { id: "h2", name: "Holiday two", startDate: "2026-02-17", endDate: "2026-02-17", source: "manual" },
], []);
const formatDate = (iso: string) => `D:${iso}`;

function plan(name: string, days: number[] = [10, 10, 10], settings: Partial<ScenarioSettings> = {}): Scenario {
  const s = createScenario(name, START);
  return {
    ...s,
    settings: { ...s.settings, ...settings },
    activities: days.map((d, i) => ({ ...createActivity(`Row ${i + 1}`, s.settings), min: d, mostLikely: d, max: d })),
  };
}

/** A copy as Add Scenario makes it (new ids, the same names, order and settings), then a status update. */
function statusOf(source: Scenario, name: string, patches: Record<number, Partial<Activity>>): Scenario {
  const copy = cloneScenario(source, name);
  return { ...copy, activities: copy.activities.map((a, i) => ({ ...a, ...patches[i + 1] })) };
}
const complete = (actual: number): Partial<Activity> => ({ status: "complete", actualDuration: actual });
const inProgress = (elapsed: number): Partial<Activity> => ({ status: "inProgress", actualDuration: elapsed });

/** Results whose P95 is `p95` — read straight back as the buffer's projectTargetDuration. */
function ran(s: Scenario, p95: number): Scenario {
  const results: SimulationRun = {
    id: `run-${s.id}`,
    timestamp: "2026-01-05T00:00:00.000Z",
    trialCount: 3,
    seed: "wi125-fixture",
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

function model(scenarios: Scenario[]): ComparisonModel {
  return buildComparisonModel({ scenarios, calendar: CAL, showActivityNumbers: false, runGate: null, formatDate });
}
const BUFFER_LABELS = ["Buffer used (days)", "Buffer left (days)", "Buffer used (%)"];
/** The three rows' cells, column by column: [used, left, %]. */
function bufferCells(m: ComparisonModel): (string | null)[][] {
  const rows = BUFFER_LABELS.map((l) => m.rows.find((r) => r.label === l));
  if (rows.some((r) => !r)) throw new Error(`buffer rows missing: ${m.rows.map((r) => r.label).join(" | ")}`);
  return m.columns.map((_, i) => rows.map((r) => r!.values[i]!));
}
const valueOf = (m: ComparisonModel, label: string) => m.rows.find((r) => r.label === label)?.values;

const BASELINE = ran(plan("Baseline"), 40);
/** Row 1 finished in 13 days, 3 late: the plan ends at position 33, Fri 02-20. */
const LATE = statusOf(plan("Baseline"), "Week 3", { 1: complete(13) });

const RUN_NOTE =
  "Buffer used and Buffer left are measured against the first column, Baseline, and its 10 buffer days. " +
  "Used: the working days a column's End Date (no buffer) has moved past Baseline's — below 0, days were recovered. " +
  "Left: 10 less used. " +
  "A column's own Buffer (days) is recalculated from the work still ahead, so it is not its buffer left.";
const USED_SENTENCE =
  "Buffer used is measured against the first column, Baseline: the working days a column's End Date (no buffer) has moved past Baseline's — below 0, days were recovered.";

describe("the metric (D1): working days the later End Date (no buffer) has moved past the first's", () => {
  it("3 days late on the plan's path: used 3, left 10 − 3 = 7, 30 % — and the dates they are counted from", () => {
    const m = model([BASELINE, ran(LATE, 41)]);
    expect(valueOf(m, "End Date (no buffer)")).toEqual(["D:2026-02-16", "D:2026-02-20"]);
    expect(valueOf(m, "End Date (w/buffer)")?.[0]).toBe("D:2026-03-03");
    // Feb 16 18 19 (17 is a holiday) → 3, not the 4 calendar days.
    expect(bufferCells(m)).toEqual([["0", "10", "0%"], ["3", "7", "30%"]]);
  });

  it("finished early: used −2 (Thu 02-12 → Mon 02-16: Feb 12 13), left 12, −20 %", () => {
    const early = statusOf(plan("Baseline"), "Week 3", { 1: complete(8) });
    const m = model([BASELINE, early]);
    expect(valueOf(m, "End Date (no buffer)")?.[1]).toBe("D:2026-02-12");
    expect(bufferCells(m)[1]).toEqual(["-2", "12", "-20%"]);
  });

  it("past the buffer: 14 late ends Mon 03-09 — used 14, left −4, 140 %", () => {
    const over = statusOf(plan("Baseline"), "Week 9", { 1: complete(24) });
    const m = model([BASELINE, over]);
    expect(valueOf(m, "End Date (no buffer)")?.[1]).toBe("D:2026-03-09");
    expect(bufferCells(m)[1]).toEqual(["14", "-4", "140%"]);
  });

  it("an activity In Progress past its planned 10 days (12 elapsed) is scheduled at 13: used 3", () => {
    const m = model([BASELINE, statusOf(plan("Baseline"), "Week 3", { 1: inProgress(12) })]);
    expect(bufferCells(m)[1]).toEqual(["3", "7", "30%"]);
  });

  it("is NOT the difference of the two buffers: no slip, a smaller own buffer, still 0 used", () => {
    // Row 1 Complete on time; its own run's P95 of 35 gives it a Buffer of +5 — the buffers differ by 5.
    const onTime = ran(statusOf(plan("Baseline"), "Week 3", { 1: complete(10) }), 35);
    const m = model([BASELINE, onTime]);
    expect(valueOf(m, "Buffer (days)")).toEqual(["+10", "+5"]);
    expect(bufferCells(m)[1]).toEqual(["0", "10", "0%"]);
  });

  it("a Start Date moved later counts: 5 working days later, nothing slipped — used 5 (Feb 16 18 19 20 23)", () => {
    // Its own span is the Baseline's 30, so the spans' difference would say 0. The commitment did not move.
    const moved = { ...statusOf(plan("Baseline"), "Moved", { 1: complete(10) }), startDate: "2026-01-12" };
    const m = model([BASELINE, moved]);
    expect(valueOf(m, "End Date (no buffer)")?.[1]).toBe("D:2026-02-24");
    expect(bufferCells(m)[1]).toEqual(["5", "5", "50%"]);
  });

  it("a slip inside an activity's float moves nothing (Dependencies on); past it, only the excess counts", () => {
    // A 10 and B 5 run side by side from Mon 01-05; the plan ends with A, Fri 01-16 (position 10).
    const deps = ran(plan("Baseline", [10, 5], { dependencyMode: true }), 14);
    const inFloat = statusOf(deps, "B late", { 2: complete(8) }); // ends Wed 01-14, still before A's end
    const pastFloat = statusOf(deps, "B later", { 2: complete(12) }); // ends Wed 01-21 (01-19 a holiday)
    const m = model([deps, inFloat, pastFloat]);
    expect(valueOf(m, "End Date (no buffer)")).toEqual(["D:2026-01-16", "D:2026-01-16", "D:2026-01-21"]);
    // Jan 16 20 → 2.
    expect(bufferCells(m)).toEqual([["0", "4", "0%"], ["0", "4", "0%"], ["2", "2", "50%"]]);
  });
});

describe("the table never contradicts itself (D2)", () => {
  it("used + left is the first column's displayed Buffer (days), in every column", () => {
    const m = model([BASELINE, LATE, statusOf(plan("Baseline"), "Week 4", { 1: complete(8) })]);
    expect(valueOf(m, "Buffer (days)")?.[0]).toBe("+10");
    for (const [used, left] of bufferCells(m)) expect(Number(used) + Number(left)).toBe(10);
  });

  it("at the half-day boundary: P95 40.5 rounds BOTH the Buffer (+11) and the w/buffer date (position 41, Wed 03-04)", () => {
    const m = model([ran(plan("Baseline"), 40.5), LATE]);
    expect(valueOf(m, "Buffer (days)")?.[0]).toBe("+11");
    expect(valueOf(m, "End Date (w/buffer)")?.[0]).toBe("D:2026-03-04");
    // Left 8 = the working days from Fri 02-20 to Wed 03-04: Feb 20 23 24 25 26 27, Mar 2 3.
    expect(bufferCells(m)[1]).toEqual(["3", "8", "27%"]);
  });

  it("the percent is rounded to the nearest whole number: 7 of 11 is 63.6, shown 64%", () => {
    // Row 1 in 17 days: the plan ends at position 37, Thu 02-26; Feb 16 18 19 20 23 24 25 → 7.
    const seven = statusOf(plan("Baseline"), "Week 4", { 1: complete(17) });
    expect(bufferCells(model([ran(plan("Baseline"), 40.5), seven]))[1]).toEqual(["7", "4", "64%"]);
  });
});

describe("where the rows go, and what they are never given", () => {
  it("three rows, right after \"Duration w/Buffer\" and before \"Activity Target\"", () => {
    const labels = model([BASELINE, LATE]).rows.map((r) => r.label);
    const at = labels.indexOf("Duration w/Buffer");
    expect(labels.slice(at + 1, at + 5)).toEqual([...BUFFER_LABELS, "Activity Target"]);
  });

  it("no best highlight in any of the three", () => {
    const m = model([BASELINE, ran(LATE, 41), statusOf(plan("Baseline"), "Week 4", { 1: complete(8) })]);
    for (const l of BUFFER_LABELS) expect(m.rows.find((r) => r.label === l)?.highlights).toBeUndefined();
  });

  it("the note: what the rows are measured against, in the first column's own name and buffer", () => {
    expect(model([BASELINE, LATE]).bufferNote).toBe(RUN_NOTE);
  });

  it("one buffer day reads \"1 buffer day\"", () => {
    expect(model([ran(plan("Baseline"), 31), LATE]).bufferNote).toContain("and its 1 buffer day. ");
  });
});

describe("when the rows show (D4): a later column that records progress the first does not", () => {
  const altPlan = (): Scenario => ({ ...cloneScenario(plan("Baseline"), "Fast-track"), activities: plan("x", [10, 7, 10]).activities });

  it("an alternative plan (estimates changed, no progress): no rows, no note — control: a status update shows them", () => {
    const alt = model([BASELINE, altPlan()]);
    expect(alt.rows.filter((r) => BUFFER_LABELS.includes(r.label))).toEqual([]);
    expect(alt.bufferNote).toBeNull();
    expect(bufferCells(model([BASELINE, LATE]))[1]).toEqual(["3", "7", "30%"]);
  });

  it("three columns, an alternative and a status update: the alternative's cells blank, and why", () => {
    const m = model([BASELINE, altPlan(), LATE]);
    expect(bufferCells(m)).toEqual([["0", "10", "0%"], [null, null, null], ["3", "7", "30%"]]);
    expect(m.bufferNote).toBe(
      `${RUN_NOTE} Fast-track records no more progress than Baseline (activities In Progress or Complete), so it is read as another plan, not a status update, and shows no buffer use.`
    );
  });

  it("more elapsed days on the same In Progress activity is progress: the rows show (used 0)", () => {
    const week1 = statusOf(plan("Baseline"), "Week 1", { 1: inProgress(3) });
    const week2 = statusOf(plan("Baseline"), "Week 2", { 1: inProgress(6) });
    expect(bufferCells(model([ran(week1, 40), week2]))[1]).toEqual(["0", "10", "0%"]);
  });

  it("one more activity started, with no days entered, is progress too", () => {
    const started = statusOf(plan("Baseline"), "Week 1", { 1: inProgress(0) });
    expect(bufferCells(model([BASELINE, started]))[1]).toEqual(["0", "10", "0%"]);
  });

  it("the same progress in both (a re-plan of the status update): no rows, no note", () => {
    const replan = { ...statusOf(LATE, "Re-plan", {}), activities: LATE.activities.map((a, i) => (i === 2 ? { ...a, min: 8, mostLikely: 8, max: 8 } : a)) };
    const m = model([ran(LATE, 43), replan]);
    expect(m.rows.filter((r) => BUFFER_LABELS.includes(r.label))).toEqual([]);
    expect(m.bufferNote).toBeNull();
  });

  it("one scenario alone: nothing to measure", () => {
    const m = model([BASELINE]);
    expect(m.rows.filter((r) => BUFFER_LABELS.includes(r.label))).toEqual([]);
    expect(m.bufferNote).toBeNull();
  });
});

describe("the later status update sits FIRST (C12): no rows, and the note says how to see them", () => {
  it("names the column to move", () => {
    const m = model([ran(LATE, 41), BASELINE]);
    expect(m.rows.filter((r) => BUFFER_LABELS.includes(r.label))).toEqual([]);
    expect(m.bufferNote).toBe(
      "Buffer use is measured against the first column. To see Week 3's use of Baseline's buffer, drag Baseline's tab to the left of Week 3's."
    );
  });

  it("with three, names the one recording the LEAST progress — the likeliest baseline", () => {
    const week5 = statusOf(plan("Baseline"), "Week 5", { 1: complete(13), 2: complete(10) });
    expect(model([week5, LATE, BASELINE]).bufferNote).toBe(
      "Buffer use is measured against the first column. To see Week 5's use of Baseline's buffer, drag Baseline's tab to the left of Week 5's."
    );
  });
});

describe("a reason instead of a number (D3)", () => {
  it("the first column not run: used still counts; left and % need its buffer", () => {
    const m = model([plan("Baseline"), LATE]);
    expect(bufferCells(m)).toEqual([["0", null, null], ["3", null, null]]);
    expect(m.bufferNote).toBe(
      `${USED_SENTENCE} Buffer left and Buffer used (%) need Baseline's buffer: run simulation on Baseline to calculate it.`
    );
  });

  it("a later column not run needs no run: all three show", () => {
    expect(bufferCells(model([BASELINE, LATE]))[1]).toEqual(["3", "7", "30%"]);
    expect(valueOf(model([BASELINE, LATE]), "Buffer (days)")?.[1]).toBeNull();
  });

  it("the first column's Buffer (days) at 0, or below 0: used only, and why", () => {
    const zero = model([ran(plan("Baseline"), 30), LATE]);
    expect(bufferCells(zero)).toEqual([["0", null, null], ["3", null, null]]);
    expect(zero.bufferNote).toBe(`${USED_SENTENCE} Baseline's Buffer (days) is 0, so it has no buffer for a column to use.`);
    const below = model([ran(plan("Baseline"), 28), LATE]);
    expect(valueOf(below, "Buffer (days)")?.[0]).toBe("-2");
    expect(below.bufferNote).toBe(`${USED_SENTENCE} Baseline's Buffer (days) is below 0, so it has no buffer for a column to use.`);
  });

  it("a later column at another Activity Target: blank, and how to fix it", () => {
    const p80 = { ...LATE, settings: { ...LATE.settings, probabilityTarget: 0.8 } };
    const m = model([BASELINE, p80]);
    expect(bufferCells(m)[1]).toEqual([null, null, null]);
    expect(m.bufferNote).toBe(
      `${RUN_NOTE} Week 3's Activity Target is P80 and Baseline's is P50, which moves every planned duration: set them the same to see Week 3's buffer use.`
    );
  });

  it("Dependencies on in one and off in the other: blank, and how to fix it", () => {
    const deps = { ...LATE, settings: { ...LATE.settings, dependencyMode: true } };
    const m = model([BASELINE, deps]);
    expect(bufferCells(m)[1]).toEqual([null, null, null]);
    expect(m.bufferNote).toBe(
      `${RUN_NOTE} Dependencies is on for Week 3 and off for Baseline, which changes how the End Date (no buffer) is worked out: set it the same for both to see Week 3's buffer use.`
    );
  });

  it("the Project Target or Parkinson's Law differing needs no reason: the numbers stand", () => {
    const p90 = { ...LATE, settings: { ...LATE.settings, projectProbabilityTarget: 0.9, parkinsonsLawEnabled: false } };
    const m = model([BASELINE, p90]);
    expect(bufferCells(m)[1]).toEqual(["3", "7", "30%"]);
    expect(m.bufferNote).toBe(RUN_NOTE);
  });

  it("a flagged later column (Min above Most Likely, which still schedules): blank, and fix it first", () => {
    const flagged = { ...LATE, activities: LATE.activities.map((a, i) => (i === 2 ? { ...a, min: 12, mostLikely: 10, max: 20, distributionType: "normal" as const } : a)) };
    const m = model([BASELINE, flagged]);
    expect(m.columns[1]!.flaggedCount).toBe(1);
    expect(bufferCells(m)[1]).toEqual([null, null, null]);
    expect(m.bufferNote).toBe(`${RUN_NOTE} Fix Week 3's validation errors to see its buffer use.`);
  });

  it("a flagged FIRST column: every cell blank, and fix it first", () => {
    const flaggedFirst = { ...BASELINE, activities: BASELINE.activities.map((a, i) => (i === 2 ? { ...a, min: 12, mostLikely: 10, max: 20, distributionType: "normal" as const } : a)) };
    const m = model([flaggedFirst, LATE]);
    expect(bufferCells(m)).toEqual([[null, null, null], [null, null, null]]);
    expect(m.bufferNote).toBe(
      "Buffer use is measured against the first column, Baseline, which has validation errors: fix them, then run simulation on Baseline."
    );
  });

  it("a later column whose schedule fails on a dependency cycle: blank, and why", () => {
    const [x, , z] = LATE.activities as [Activity, Activity, Activity];
    const cyclic: Scenario = {
      ...LATE,
      settings: { ...LATE.settings, dependencyMode: true },
      dependencies: [
        { fromActivityId: x.id, toActivityId: z.id, type: "FS", lagDays: 0 },
        { fromActivityId: z.id, toActivityId: x.id, type: "FS", lagDays: 0 },
      ],
    };
    const deps = { ...BASELINE, settings: { ...BASELINE.settings, dependencyMode: true } };
    const m = model([deps, cyclic]);
    expect(bufferCells(m)[1]).toEqual([null, null, null]);
    expect(m.bufferNote).toContain(" Week 3's schedule cannot be calculated, so its buffer use cannot be shown.");
  });

  it("a FIRST column whose schedule fails, or that has no activities: every cell blank, and why", () => {
    const [x, y] = BASELINE.activities as [Activity, Activity];
    const cyclicFirst: Scenario = {
      ...BASELINE,
      settings: { ...BASELINE.settings, dependencyMode: true },
      dependencies: [
        { fromActivityId: x.id, toActivityId: y.id, type: "FS", lagDays: 0 },
        { fromActivityId: y.id, toActivityId: x.id, type: "FS", lagDays: 0 },
      ],
    };
    const failing = model([cyclicFirst, { ...LATE, settings: { ...LATE.settings, dependencyMode: true } }]);
    expect(bufferCells(failing)).toEqual([[null, null, null], [null, null, null]]);
    expect(failing.bufferNote).toBe("Buffer use is measured against the first column, Baseline, whose schedule cannot be calculated.");
    const empty = model([createScenario("Baseline", START), LATE]);
    expect(bufferCells(empty)).toEqual([[null, null, null], [null, null, null]]);
    expect(empty.bufferNote).toBe("Buffer use is measured against the first column, Baseline, which has no activities.");
  });
});
