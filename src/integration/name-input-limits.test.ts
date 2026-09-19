// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, it, expect } from "vitest";
import { NAME_MAX_LENGTH } from "@domain/models/types";

/**
 * Every input that edits a NAME the schema bounds carries that bound as `maxLength` (v0.69.0,
 * WI-49, owner ruling 1a widened to every name input).
 *
 * Until v0.69.0 the grid's activity-name input had no limit: 202 characters committed silently,
 * Run stayed enabled, and the next load rejected the whole project. Project, scenario and band
 * names reached the same state through their own inputs. The schema's limit is one constant,
 * `NAME_MAX_LENGTH`, and so is every input's.
 *
 * ⚠️ A SOURCE CENSUS, keyed on the input's `name` attribute: every `<input>` whose name mentions
 * "name" is a name editor, and must carry `maxLength`. A new one fails this until it does — or is
 * named here as an exception, with a reason.
 */
const EXCEPTIONS: Record<string, string> = {
  // Reported at WI-49's Checkpoint 1 (2026-09-18), NOT fixed in v0.69.0: the owner's ruling
  // covers project, scenario, activity, milestone and band names. A holiday name is bounded too
  // (200), and a project holiday rides the project's load gate.
  'src/ui/components/CalendarEditor.tsx:name="holidayName"': "holiday name — reported, outside 1a",
  'src/ui/components/HolidayList.tsx:name="editHolidayName"': "holiday name — reported, outside 1a",
};

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (full.endsWith(".tsx") && !full.endsWith(".test.tsx")) out.push(full);
  }
  return out;
}

const root = process.cwd();

/** Every `<input … />` element in the file, as its source text. */
function inputElements(source: string): string[] {
  return source.match(/<input\b[\s\S]*?\/>/g) ?? [];
}

function nameAttribute(element: string): string | null {
  const m = element.match(/\bname=(\{[^}]*\}|"[^"]*")/);
  return m ? m[0] : null;
}

function nameEditors(): Array<{ key: string; element: string }> {
  const found: Array<{ key: string; element: string }> = [];
  for (const file of sourceFiles(join(root, "src", "ui"))) {
    const rel = relative(root, file).split(sep).join("/");
    for (const element of inputElements(readFileSync(file, "utf8"))) {
      const name = nameAttribute(element);
      if (name && /name/i.test(name.replace(/^name=/, "")) && !/type="(checkbox|radio|file)"/.test(element)) {
        found.push({ key: `${rel}:${name}`, element });
      }
    }
  }
  return found;
}

describe("every name input carries the schema's limit", () => {
  const editors = nameEditors();

  it("the census finds the name inputs it is meant to (a guard that finds nothing passes vacuously)", () => {
    // Measured at v0.69.0: eleven name editors across ten files, plus the two holiday names.
    expect(editors.length).toBe(13);
    const keys = editors.map((e) => e.key);
    for (const expected of [
      'src/ui/components/UnifiedActivityRow.tsx:name="activityName"',
      'src/ui/components/ActivityEditModal.tsx:name="activityName"',
      "src/ui/components/InlineEdit.tsx:name={name}",
      'src/ui/components/NewProjectDialog.tsx:name="projectName"',
      'src/ui/components/BandHeaderRow.tsx:name="bandName"',
      'src/ui/components/MilestonePanel.tsx:name="newMilestoneName"',
    ]) {
      expect(keys).toContain(expected);
    }
  });

  it("each carries maxLength, and the named constant where it was written for v0.69.0", () => {
    const missing = editors
      .filter((e) => !(e.key in EXCEPTIONS))
      .filter((e) => !/maxLength=\{(NAME_MAX_LENGTH|200)\}/.test(e.element))
      .map((e) => e.key);
    expect(missing).toEqual([]);
  });

  it("the exceptions still exist, so a stale entry cannot hide a new input under an old name", () => {
    const keys = new Set(editors.map((e) => e.key));
    for (const key of Object.keys(EXCEPTIONS)) expect(keys.has(key)).toBe(true);
  });

  it("the limit is the schema's", () => {
    expect(NAME_MAX_LENGTH).toBe(200);
  });
});
