// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_COLUMN_ORDER,
  parseFlatActivityTable,
  resolveHeaders,
} from "@core/import/flat-activity-parser";
import type { CSVParseResult } from "@core/import/types";
import { importActivitiesFromCSV, parseClipboardTable } from "@app/api/csv-import-service";

/**
 * **The CSV import template and the headerless column order are ONE contract** (v0.73.0).
 *
 * The importer reads a file WITH a header row by its headings, in any order. Rows with NO
 * header row — pasted, then "Treat first row as data" — are read by position, in
 * `DEFAULT_COLUMN_ORDER`. The template (`public/spert-activity-import-template.csv`) is what a
 * user copies those rows from, so its columns must be in that same order. Until WI-32 nothing
 * tied the two together; v0.73.0 moved Distribution before Confidence in both, in one change.
 *
 * ⚠️ The template's Type column is NOT in `DEFAULT_COLUMN_ORDER`: a headerless paste ignores it
 * (the template says so in its own comment), so its Section row is read as an activity and
 * refused. The second test pins that as the one expected difference.
 */

const TEMPLATE = readFileSync(join(process.cwd(), "public", "spert-activity-import-template.csv"), "utf8");

/** The template's lines that are not comments: the header row, then the data rows. */
const TABLE_LINES = TEMPLATE.split("\n").filter((line) => line !== "" && !line.startsWith("#"));

/** A template line's cells. Handles the quoted multi-predecessor cells ("A3,A4"). */
function cells(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === "," && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** The fields a header row resolves to, in column order. */
function resolvedOrder(header: string[]): string[] {
  const result = resolveHeaders(header);
  if ("missingFields" in result) throw new Error(`unresolved: ${result.missingFields.join(", ")}`);
  return Object.entries(result.headers)
    .sort(([, a], [, b]) => a - b)
    .map(([field]) => field);
}

/** An activity or dependency with its generated ids replaced by the activity's name. */
function byName(r: CSVParseResult) {
  const nameOf = new Map(r.activities.map((a) => [a.id, a.name]));
  const swap = (o: object) =>
    Object.fromEntries(
      Object.entries(o).map(([k, v]) => [k, typeof v === "string" && nameOf.has(v) ? `@${nameOf.get(v)}` : v]),
    );
  return { activities: r.activities.map(swap), dependencies: r.dependencies.map(swap) };
}

/** Rows pasted from a spreadsheet holding these template lines, headerless. */
function pasteHeaderless(lines: string[]): CSVParseResult {
  let n = 0;
  const tsv = lines.map((line) => cells(line).join("\t")).join("\n");
  return parseFlatActivityTable(parseClipboardTable(tsv), () => `id-${++n}`, {
    assumeDefaultColumnOrder: true,
  });
}

describe("the CSV import template and the headerless column order", () => {
  it("the template's header resolves to DEFAULT_COLUMN_ORDER, then Type", () => {
    const templateOrder = resolvedOrder(cells(TABLE_LINES[0]!));
    expect(templateOrder).toEqual([...DEFAULT_COLUMN_ORDER, "type"]);
    expect(templateOrder).toEqual([
      "activityId", "name", "min", "mostLikely", "max",
      "distribution", "confidence", "status", "predecessors", "type",
    ]);

    // Control: the header as it stood before v0.73.0 resolves every field too, and in an order
    // this comparison tells apart — so a template swapped back could not pass it.
    const before = resolvedOrder([
      "Activity ID", "Activity Name", "Optimistic (Min)", "Most Likely", "Pessimistic (Max)",
      "Confidence Level", "Distribution", "Status", "Predecessors", "Type",
    ]);
    expect(before).toHaveLength(10);
    expect(before).not.toEqual([...DEFAULT_COLUMN_ORDER, "type"]);
  });

  it("its rows import the same pasted without the header as from the file with it", async () => {
    const withHeader = await importActivitiesFromCSV(new File([TEMPLATE], "template.csv", { type: "text/csv" }));
    expect(withHeader.errors).toEqual([]);
    expect(withHeader.activities).toHaveLength(10);
    expect(withHeader.dependencies).toHaveLength(13);

    const headerless = pasteHeaderless(TABLE_LINES.slice(1));
    expect(byName(headerless)).toEqual(byName(withHeader));
    // The one expected difference: the Section row (row 11), whose Type is not read headerless.
    expect(headerless.errors.map((e) => e.row)).toEqual([11]);

    // Control: the same rows with Confidence and Distribution in their pre-v0.73.0 places do
    // NOT import the same, so the comparison above can see an order mismatch.
    const swapped = TABLE_LINES.slice(1).map((line) => {
      const c = cells(line);
      [c[5], c[6]] = [c[6]!, c[5]!];
      return c.map((v) => (v.includes(",") ? `"${v}"` : v)).join(",");
    });
    expect(byName(pasteHeaderless(swapped))).not.toEqual(byName(withHeader));
  });
});
