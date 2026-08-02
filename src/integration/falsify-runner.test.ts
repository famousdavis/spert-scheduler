// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";

import {
  parseTestTotal,
  parseFailedNames,
  checkRunComparable,
} from "../../scripts/falsify.mjs";

/**
 * Guard for the falsification runner's comparability check.
 *
 * ⚠️ WHY THIS EXISTS. On 2026-08-02 the runner produced a wrong answer that looked right: a
 * mutation swapped a JSX opening tag but not its closing tag, the file stopped parsing,
 * vitest ran ZERO tests, and the runner counted "0 failing" — which reads as SURVIVOR. A
 * strong test looked weak.
 *
 * That was the THIRD instance of the same defect inside this project's tooling — `cc`'s
 * region mode reporting a parse error as cc 0, `cc`'s suppression filter reporting "no
 * functions", and this. All three share one signature: a tool that cannot do its job
 * returns the value it returns when there is nothing to report, so ABSENCE OF A RESULT is
 * indistinguishable from a NULL RESULT.
 *
 * The rule the project keeps re-learning is that knowing about this confers no immunity —
 * only guards do. So the fix lives in the tool, and this file proves the fix can fail.
 */

// A real transform failure produces no "Tests" summary line at all.
const TRANSFORM_ERROR_OUTPUT = `
 RUN  v4.1.6 /repo

Error: Transform failed with 1 error:
/repo/src/ui/components/ScenarioTabs.tsx:189:10: ERROR: Unexpected closing "button" tag does not match opening "span" tag
`;

const GREEN_OUTPUT = ` Test Files  1 passed (1)
      Tests  25 passed (25)`;

const RED_OUTPUT = ` × src/x.test.tsx > suite > a keyboard user can focus a scenario tab 12ms
 Test Files  1 failed (1)
      Tests  1 failed | 24 passed (25)`;

describe("parseTestTotal", () => {
  it("reads the total from an all-passing run", () => {
    expect(parseTestTotal(GREEN_OUTPUT)).toBe(25);
  });

  it("reads the total from a run with failures, not just the passing count", () => {
    expect(parseTestTotal(RED_OUTPUT)).toBe(25);
  });

  it("RETURNS NULL WHEN NOTHING RAN — the case that produced the wrong answer", () => {
    // The whole point. If this returned 0, "0 failing" would be indistinguishable from a
    // surviving mutant, which is exactly the bug being guarded.
    expect(parseTestTotal(TRANSFORM_ERROR_OUTPUT)).toBeNull();
  });
});

describe("parseFailedNames", () => {
  it("extracts the named failing test", () => {
    expect(parseFailedNames(RED_OUTPUT)).toEqual([
      "src/x.test.tsx > suite > a keyboard user can focus a scenario tab",
    ]);
  });

  it("returns nothing for a green run", () => {
    expect(parseFailedNames(GREEN_OUTPUT)).toEqual([]);
  });
});

describe("checkRunComparable", () => {
  it("accepts a run that executed the same number of tests as the baseline", () => {
    expect(checkRunComparable(25, 25).ok).toBe(true);
  });

  it("REJECTS a run that never produced a summary, rather than reading it as zero failures", () => {
    const result = checkRunComparable(25, parseTestTotal(TRANSFORM_ERROR_OUTPUT));
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/failed to compile|NOTHING RAN/i);
  });

  it("rejects a run whose test count drifted, in either direction", () => {
    expect(checkRunComparable(25, 24).ok).toBe(false);
    expect(checkRunComparable(25, 26).ok).toBe(false);
  });

  it("a rejection always carries a reason, so an abort is never silent", () => {
    for (const mutantTotal of [null, 0, 24, 26]) {
      const result = checkRunComparable(25, mutantTotal);
      expect(result.ok).toBe(false);
      expect(result.reason).toBeTruthy();
    }
  });
});
