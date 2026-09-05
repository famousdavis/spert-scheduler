// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import { parseFlatActivityTable } from "@core/import/flat-activity-parser";

/**
 * **Does reordering the export's columns break import? Measured, not reasoned.**
 *
 * v0.67.0 moves Distribution before Confidence in the schedule export, which is a
 * user-visible file format. R27 settled that no accommodation is made for previously
 * exported files — but the question of whether *import* cares is a factual one, and the
 * source read ("`resolveHeaders` builds a field→index map from `HEADER_ALIASES`, so
 * order is irrelevant") is a different claim from "I watched it round-trip".
 *
 * ⚠️ **This file is the second claim.** It drives the real parser with real CSV rows.
 *
 * Two independent findings, both exercised below:
 *   1. The activity importer resolves columns **by name**, so any column order imports
 *      identically — including the pre- and post-swap orders.
 *   2. The **schedule export is not re-importable in either order**, because it emits no
 *      `activityId` column and that is a `REQUIRED_FIELD`. Its first column is `#`.
 *      So the schedule export has no consumer inside the app, and the swap cannot break
 *      one. ⚠️ Note `activityId` *does* exist on the internal `GridRow` object — it is
 *      dropped at the formatter boundary — so "the export has no activity id" is true of
 *      the file and false of the data structure.
 */

const HEADERS_OLD = ["Activity ID", "Activity Name", "Min", "Most Likely", "Max", "Confidence", "Distribution", "Status"];
const HEADERS_NEW = ["Activity ID", "Activity Name", "Min", "Most Likely", "Max", "Distribution", "Confidence", "Status"];

const ROW_OLD = ["a1", "Design", "3", "5", "10", "Medium", "T-Normal", "Planned"];
const ROW_NEW = ["a1", "Design", "3", "5", "10", "T-Normal", "Medium", "Planned"];

let seq = 0;
const idGen = () => `id-${++seq}`;

function parse(headers: string[], row: string[]) {
  seq = 0;
  return parseFlatActivityTable([headers, row], idGen);
}

describe("column order and the activity importer", () => {
  it("imports the PRE-swap order cleanly — the control", () => {
    const r = parse(HEADERS_OLD, ROW_OLD);
    expect(r.errors, JSON.stringify(r.errors)).toHaveLength(0);
    expect(r.activities).toHaveLength(1);
    expect(r.activities[0]!.name).toBe("Design");
  });

  it("imports the POST-swap order cleanly", () => {
    const r = parse(HEADERS_NEW, ROW_NEW);
    expect(r.errors, JSON.stringify(r.errors)).toHaveLength(0);
    expect(r.activities).toHaveLength(1);
  });

  it("produces the IDENTICAL activity from both orders", () => {
    // ⚠️ The load-bearing assertion. "Both imported without errors" would pass even if
    // the swapped file silently put the confidence value into the distribution field.
    expect(parse(HEADERS_NEW, ROW_NEW).activities).toEqual(
      parse(HEADERS_OLD, ROW_OLD).activities,
    );
  });

  it("is genuinely name-keyed, not merely tolerant of this one swap", () => {
    // Reverse every column. If resolution were positional this could not survive.
    const rev = (a: string[]) => [...a].reverse();
    const r = parse(rev(HEADERS_OLD), rev(ROW_OLD));
    expect(r.errors, JSON.stringify(r.errors)).toHaveLength(0);
    expect(r.activities).toEqual(parse(HEADERS_OLD, ROW_OLD).activities);
  });

  it("control: the parser DOES reject a file missing a required column", () => {
    // Without this, "no errors" above would be consistent with a parser that never
    // reports anything.
    const noId = HEADERS_OLD.filter((h) => h !== "Activity ID");
    const r = parse(noId, ROW_OLD.slice(1));
    expect(r.errors.length).toBeGreaterThan(0);
    expect(JSON.stringify(r.errors)).toContain("activityId");
  });
});

describe("the schedule export is not re-importable, in either order", () => {
  // Its real header row, which begins with "#" and carries no activity id.
  const SCHEDULE_HEADERS = ["#", "Activity Name", "Min", "Most Likely", "Max", "Distribution", "Confidence", "Status"];
  const SCHEDULE_ROW = ["1", "Design", "3", "5", "10", "T-Normal", "Medium", "Planned"];

  it("is refused for a missing activityId — before column order is ever consulted", () => {
    const r = parse(SCHEDULE_HEADERS, SCHEDULE_ROW);
    expect(r.errors.length).toBeGreaterThan(0);
    expect(JSON.stringify(r.errors)).toContain("activityId");
    expect(r.activities).toHaveLength(0);
  });

  it("was refused identically BEFORE the swap, so the swap did not cause this", () => {
    const before = ["#", "Activity Name", "Min", "Most Likely", "Max", "Confidence", "Distribution", "Status"];
    const r = parse(before, ["1", "Design", "3", "5", "10", "Medium", "T-Normal", "Planned"]);
    expect(JSON.stringify(r.errors)).toContain("activityId");
  });
});
