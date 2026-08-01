// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect } from "vitest";

import { measure } from "../../scripts/measure-complexity.mjs";

/**
 * Guard for `npm run cc` (`scripts/measure-complexity.mjs`).
 *
 * WHY THIS EXISTS
 * The script measured cognitive complexity via `eslint.lintText`, which HONOURS in-file
 * `eslint-disable` directives — so a function carrying
 * `// eslint-disable-next-line sonarjs/cognitive-complexity` was filtered out before
 * counting, and the script then printed "no functions reported (every function measures
 * 0)": a claim it had never checked. Measured 2026-08-01, `firestore-migration.ts`
 * reported ZERO functions while hiding cc 21.
 *
 * That is the seventh "check that cannot fail" in this project and the second inside the
 * measurement tooling itself, and like the others it failed in the safe-looking
 * direction — a suppressed hot spot read as clean. It mattered because the two functions
 * it hid are precisely the decomposition targets the tool is meant to size.
 *
 * WHAT THIS ASSERTS
 * That a suppressed function is measured AND flagged. Each test first asserts its own
 * premise — that the fixture file still carries the directive — because if someone
 * removes a suppression, the interesting assertion below would go green against a file
 * that no longer exercises anything. Verified by breaking it: reverting `measure()` to a
 * single directive-honouring pass fails "reports a function whose finding is suppressed"
 * with `undefined`.
 */

const ROOT = process.cwd();

/** Directive whose presence is the precondition for the suppression tests. */
const DIRECTIVE = "eslint-disable-next-line sonarjs/cognitive-complexity";

/**
 * The two suppressed functions, keyed by NAME rather than line — every line reference in
 * this campaign is anchored to a commit and its own work moves them.
 */
const SUPPRESSED_FIXTURES = [
  { file: "src/infrastructure/persistence/migrations.ts", fn: "migrateV5toV6", cc: 18 },
  { file: "src/infrastructure/firebase/firestore-migration.ts", fn: "migrateLocalToCloud", cc: 21 },
] as const;

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf-8");
}

describe("measure-complexity — suppressed functions", () => {
  for (const { file, fn, cc } of SUPPRESSED_FIXTURES) {
    it(`reports ${fn}, whose finding is suppressed in ${file}`, async () => {
      const source = read(file);

      // Premise first. Without this the assertion below could pass against a file that
      // no longer carries a suppression, testing nothing.
      expect(
        source.includes(DIRECTIVE),
        `${file} no longer carries a cognitive-complexity suppression — this fixture must be re-pointed at one that does, not deleted`
      ).toBe(true);

      const rows = await measure(source, join(ROOT, file));
      const row = rows.find((r) => r.name === fn);

      expect(row, `${fn} was not reported at all — the suppression is hiding it again`).toBeDefined();
      expect(row!.suppressed).toBe(true);
      expect(row!.cc).toBe(cc);
    });
  }

  it("does not flag an unsuppressed function", async () => {
    const file = "src/core/import/flat-activity-parser.ts";
    const rows = await measure(read(file), join(ROOT, file));
    const row = rows.find((r) => r.name === "parseFlatActivityTable");

    expect(row).toBeDefined();
    expect(row!.suppressed).toBe(false);
    expect(row!.cc).toBe(110);
  });

  it("counts the suppressed function in the total, not just as a flag", async () => {
    const file = "src/infrastructure/firebase/firestore-migration.ts";
    const rows = await measure(read(file), join(ROOT, file));

    // The whole defect in one assertion: this file used to yield an empty array.
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => Number.isFinite(r.cc))).toBe(true);
  });
});

describe("measure-complexity — parse-failure guard", () => {
  /**
   * The close-out's sixth "check that cannot fail": a region starting mid-statement
   * produces a fatal parse message and NO rule messages, which is indistinguishable from
   * "every function measures 0". It must throw rather than report a zero. This had no
   * test until now.
   */
  it("throws on unparseable text instead of reporting zero", async () => {
    await expect(
      measure("function _region() {\n) : {\n}\n", join(ROOT, "src/core/_probe_measure.ts"))
    ).rejects.toThrow(/PARSE ERROR/);
  });

  it("measures a valid region without throwing", async () => {
    const rows = await measure(
      "function _region() {\n  if (a) { if (b) { return 1; } }\n  return 0;\n}\n",
      join(ROOT, "src/core/_probe_measure.ts")
    );
    expect(rows.find((r) => r.line === 1)?.cc).toBeGreaterThan(0);
  });
});
