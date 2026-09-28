// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import { savedScenarioFlags } from "./scenario-flags";
import { createActivity, createScenario } from "@app/api/project-service";
import type { Activity } from "@domain/models/types";

/**
 * WI-58 — what a scenario's SAVED activities flag, for Compare and print. The two questions each
 * surface asks: which rows, in the summary's own words and at their place in THIS scenario, and
 * whether any of them stops the schedule (a distribution that cannot be built).
 */

const settings = createScenario("S", "2026-04-06").settings;

function row(name: string, patch: Partial<Activity>): Activity {
  return { ...createActivity(name, settings), ...patch };
}

describe("savedScenarioFlags", () => {
  it("a valid plan: nothing flagged, nothing stops", () => {
    const flags = savedScenarioFlags([row("A", { min: 5, mostLikely: 10, max: 20 })], 0.5);
    expect(flags).toEqual({ rows: [], anyStops: false });
  });

  it("flags a T-Normal Min above Most Likely without stopping the schedule (it still builds)", () => {
    const acts = [row("A", { min: 5, mostLikely: 10, max: 20 }), row("OCM", { min: 50, mostLikely: 45, max: 84, distributionType: "normal" })];
    const flags = savedScenarioFlags(acts, 0.5);
    expect(flags.rows).toEqual([{ id: acts[1]!.id, position: 2, name: "OCM", messages: ["Min is above Most Likely"] }]);
    expect(flags.anyStops).toBe(false);
  });

  it("a Triangular out of order stops the schedule", () => {
    const flags = savedScenarioFlags([row("GDW", { min: 30, mostLikely: 26, max: 40, distributionType: "triangular" })], 0.5);
    expect(flags.rows.map((r) => r.messages)).toEqual([["Min is above Most Likely"]]);
    expect(flags.anyStops).toBe(true);
  });

  it("a LogNormal 0/0/0 stops it, with a message that is not about ordering", () => {
    const flags = savedScenarioFlags([row("DMS", { min: 0, mostLikely: 0, max: 0, distributionType: "logNormal" })], 0.5);
    expect(flags.rows.map((r) => r.messages)).toEqual([["A LogNormal activity needs an estimate above zero"]]);
    expect(flags.anyStops).toBe(true);
  });

  it("numbers each row by its place in THIS scenario's own list", () => {
    const acts = [
      row("A", { min: 5, mostLikely: 10, max: 20 }),
      row("B", { min: 5, mostLikely: 10, max: 20 }),
      row("C", { min: 12, mostLikely: 10, max: 20, distributionType: "normal" }),
    ];
    expect(savedScenarioFlags(acts, 0.5).rows.map((r) => r.position)).toEqual([3]);
    expect(savedScenarioFlags(acts.slice(1), 0.5).rows.map((r) => r.position)).toEqual([2]);
  });

  it("a COMPLETE activity with an actual duration is flagged but does not stop the schedule — the engine never builds it", () => {
    const done = row("Done", { min: 30, mostLikely: 26, max: 40, distributionType: "triangular", status: "complete", actualDuration: 12 });
    const flags = savedScenarioFlags([done], 0.5);
    expect(flags.rows).toHaveLength(1);
    expect(flags.anyStops).toBe(false);
  });
});
