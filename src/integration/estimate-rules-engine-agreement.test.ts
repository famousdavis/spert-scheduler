// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import { logNormalHasNoMean } from "@domain/helpers/estimate-rules";
import { computePertMean } from "@core/estimation/spert";
import { createDistributionForActivity } from "@core/distributions/factory";
import { suggestDistributionChange } from "@core/recommendation/recommendation";
import type { Activity } from "@domain/models/types";

/**
 * The schema's LogNormal rule is ARITHMETIC ON ITS OWN FIELDS (min + ML + max ≤ 0), so `domain`
 * can state it without importing `core`. It is exact only because the estimates are
 * nonnegative — this sweep is the evidence the predicate's doc comment cites, and it compares
 * with the engine's own test, `computePertMean(...) <= 0` (`factory.ts`).
 */
describe("logNormalHasNoMean agrees with the engine on every nonnegative integer triple 0–40", () => {
  it("68,921 triples, zero disagreements", () => {
    let checked = 0;
    const disagreements: string[] = [];
    for (let min = 0; min <= 40; min++) {
      for (let ml = 0; ml <= 40; ml++) {
        for (let max = 0; max <= 40; max++) {
          checked++;
          const engine = computePertMean(min, ml, max) <= 0;
          if (logNormalHasNoMean("logNormal", min, ml, max) !== engine) disagreements.push(`${min}/${ml}/${max}`);
        }
      }
    }
    expect(checked).toBe(68_921);
    expect(disagreements).toEqual([]);
  });

  it("and the factory throws exactly where it says so", () => {
    const base: Activity = {
      id: "x", name: "X", min: 0, mostLikely: 0, max: 0,
      confidenceLevel: "mediumConfidence", distributionType: "logNormal", status: "planned",
    };
    expect(() => createDistributionForActivity(base)).toThrow(/PERT mean must be > 0/);
    expect(() => createDistributionForActivity({ ...base, max: 1 })).not.toThrow();
  });
});

describe("the suggestion's ordering guard now reads the shared rule (v0.69.0)", () => {
  it("still gives no suggestion for an out-of-order or negative estimate", () => {
    expect(suggestDistributionChange(14, 13, 22, "normal")).toBeNull();
    expect(suggestDistributionChange(9, 30, 22, "triangular")).toBeNull();
    expect(suggestDistributionChange(-1, 5, 9, "normal")).toBeNull();
  });

  it("gives no suggestion for a NaN estimate either — the one input the `>` form lets past the guard", () => {
    for (const current of ["normal", "logNormal", "triangular"] as const) {
      expect(suggestDistributionChange(3, Number.NaN, 9, current)).toBeNull();
      expect(suggestDistributionChange(3, 5, Number.NaN, current)).toBeNull();
      expect(suggestDistributionChange(Number.NaN, 5, 9, current)).toBeNull();
    }
  });
});
