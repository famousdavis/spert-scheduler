// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import type { Activity } from "@domain/models/types";
import {
  computeConstraintUpdates,
  computeDescriptionUpdate,
  computeGeneralUpdates,
  computeEstimateUpdates,
} from "./activity-modal-sections";

function makeActivity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: "a1",
    name: "Activity 1",
    distributionType: "normal",
    confidenceLevel: "mediumConfidence",
    min: 1,
    mostLikely: 2,
    max: 3,
    status: "planned",
    ...overrides,
  } as Activity;
}

describe("computeConstraintUpdates", () => {
  it("returns empty object when nothing changes (all null)", () => {
    const a = makeActivity();
    expect(computeConstraintUpdates(a, null, null, null, null)).toEqual({});
  });

  it("returns empty object when nothing changes (all set, identical)", () => {
    const a = makeActivity({
      constraintType: "SNET",
      constraintDate: "2026-01-15",
      constraintMode: "soft",
      constraintNote: "kickoff",
    });
    expect(
      computeConstraintUpdates(a, "SNET", "2026-01-15", "soft", "kickoff"),
    ).toEqual({});
  });

  it("clears date/mode/note when type is cleared", () => {
    const a = makeActivity({
      constraintType: "MSO",
      constraintDate: "2026-02-01",
      constraintMode: "hard",
      constraintNote: "milestone",
    });
    expect(computeConstraintUpdates(a, null, "2026-02-01", "hard", "milestone")).toEqual({
      constraintType: null,
      constraintDate: null,
      constraintMode: null,
      constraintNote: null,
    });
  });

  it("emits diff only for changed fields", () => {
    const a = makeActivity({
      constraintType: "SNET",
      constraintDate: "2026-01-15",
      constraintMode: "soft",
      constraintNote: "old",
    });
    expect(
      computeConstraintUpdates(a, "SNET", "2026-01-15", "soft", "new"),
    ).toEqual({ constraintNote: "new" });
  });

  it("trims whitespace-only note to null", () => {
    const a = makeActivity({
      constraintType: "SNET",
      constraintDate: "2026-01-15",
      constraintMode: "soft",
      constraintNote: "kickoff",
    });
    expect(
      computeConstraintUpdates(a, "SNET", "2026-01-15", "soft", "   "),
    ).toEqual({ constraintNote: null });
  });

  it("treats undefined fields on activity as null for diff comparison", () => {
    const a = makeActivity();
    const updates = computeConstraintUpdates(a, "SNET", "2026-01-15", "soft", "go");
    expect(updates).toEqual({
      constraintType: "SNET",
      constraintDate: "2026-01-15",
      constraintMode: "soft",
      constraintNote: "go",
    });
  });

  it("does not emit constraintNote when trimmed empty equals existing null", () => {
    const a = makeActivity({
      constraintType: "SNET",
      constraintDate: "2026-01-15",
      constraintMode: "soft",
    });
    const updates = computeConstraintUpdates(a, "SNET", "2026-01-15", "soft", "");
    expect(updates).toEqual({});
  });
});

describe("computeDescriptionUpdate", () => {
  it("sets a new description (from absent)", () => {
    const a = makeActivity();
    expect(computeDescriptionUpdate(a, "Deploy the new API gateway")).toEqual({
      description: "Deploy the new API gateway",
    });
  });

  it("trims surrounding whitespace when setting", () => {
    const a = makeActivity();
    expect(computeDescriptionUpdate(a, "  scope text  ")).toEqual({
      description: "scope text",
    });
  });

  it("returns empty object when unchanged", () => {
    const a = makeActivity({ description: "scope text" });
    expect(computeDescriptionUpdate(a, "scope text")).toEqual({});
  });

  it("clears an existing description to undefined (the clear path)", () => {
    const a = makeActivity({ description: "scope text" });
    expect(computeDescriptionUpdate(a, "")).toEqual({ description: undefined });
    // The explicit undefined key is what Object.keys counts as a real change.
    expect(
      Object.prototype.hasOwnProperty.call(computeDescriptionUpdate(a, ""), "description"),
    ).toBe(true);
  });

  it("treats whitespace-only as a clear", () => {
    const a = makeActivity({ description: "scope text" });
    expect(computeDescriptionUpdate(a, "   ")).toEqual({ description: undefined });
  });

  it("no-op when clearing an already-absent description", () => {
    const a = makeActivity();
    expect(computeDescriptionUpdate(a, "")).toEqual({});
  });
});


/**
 * The General and Estimates halves of ActivityEditModal's `buildFieldUpdates` were inline
 * in a `useCallback` inside a component at 0% coverage, and measured cognitive complexity
 * 20. Extracted here beside the constraint and description halves that were already
 * split out — the same B3 pattern, and the third time it has paid: field-by-field diff
 * logic is exactly the shape that hides `undefined`-vs-null-vs-unchanged edge cases.
 *
 * Lint went 10 -> 9 as a consequence. A removal, not a suppression.
 */
describe("computeGeneralUpdates", () => {
  it("returns nothing when nothing changed", () => {
    const a = makeActivity({ name: "Activity 1", status: "planned" });
    expect(computeGeneralUpdates(a, "Activity 1", "planned", "")).toEqual({});
  });

  describe("name", () => {
    it("saves a changed name, trimmed", () => {
      const a = makeActivity({ name: "Old" });
      expect(computeGeneralUpdates(a, "  New  ", "planned", "")).toEqual({ name: "New" });
    });

    it("ignores a name that only differs by surrounding whitespace", () => {
      const a = makeActivity({ name: "Same" });
      expect(computeGeneralUpdates(a, "  Same  ", "planned", "")).toEqual({});
    });

    it("CURRENTLY ignores a name that trims to empty — recorded, not endorsed", () => {
      // ⚠️ This pins the CURRENT BEHAVIOUR, not a contract. It is a product decision
      // nobody appears to have made: the user clears the field, clicks Save, and the app
      // silently discards the edit — no error state, no blank name, no feedback. The
      // plausible intents are "reject with an error" or "accept and blank it"; this does
      // a third thing.
      //
      // Same call as C2, which deliberately left the cyclic-graph behaviour unpinned
      // because "a test there would enshrine the behaviour rather than record the
      // question". The difference is that this one is trivially reachable, so leaving it
      // unpinned would let a refactor change it silently. It is pinned to hold the line
      // while the question is open — NOT because the behaviour is correct.
      //
      // If this is later decided deliberately, replace this test rather than adding to
      // it, and say which of the three behaviours was chosen.
      const a = makeActivity({ name: "Keep Me" });
      expect(computeGeneralUpdates(a, "", "planned", "")).toEqual({});
      expect(computeGeneralUpdates(a, "   ", "planned", "")).toEqual({});
    });
  });

  describe("status", () => {
    it("saves a changed status", () => {
      const a = makeActivity({ status: "planned" });
      expect(computeGeneralUpdates(a, a.name, "inProgress", "")).toEqual({
        status: "inProgress",
      });
    });
  });

  describe("actualDuration while complete or in progress", () => {
    it("saves a changed duration", () => {
      const a = makeActivity({ status: "complete", actualDuration: 5 });
      expect(computeGeneralUpdates(a, a.name, "complete", 8)).toEqual({ actualDuration: 8 });
    });

    it("ignores an unchanged duration", () => {
      const a = makeActivity({ status: "complete", actualDuration: 5 });
      expect(computeGeneralUpdates(a, a.name, "complete", 5)).toEqual({});
    });

    it("ignores an empty draft, so a half-typed field cannot overwrite a stored value", () => {
      const a = makeActivity({ status: "complete", actualDuration: 5 });
      expect(computeGeneralUpdates(a, a.name, "complete", "")).toEqual({});
    });

    it("floors a fractional duration to whole days", () => {
      const a = makeActivity({ status: "complete" });
      expect(computeGeneralUpdates(a, a.name, "complete", 7.9)).toEqual({ actualDuration: 7 });
    });

    it("clamps zero and negatives up to one day", () => {
      const a = makeActivity({ status: "complete" });
      expect(computeGeneralUpdates(a, a.name, "complete", 0)).toEqual({ actualDuration: 1 });
      expect(computeGeneralUpdates(a, a.name, "complete", -4)).toEqual({ actualDuration: 1 });
    });

    it("rejects non-numeric input rather than storing NaN", () => {
      // NaN survives both Math.floor and Math.max — `Math.max(1, NaN)` is NaN, not 1 —
      // so the isNaN guard after them is what actually rejects this.
      const a = makeActivity({ status: "complete" });
      expect(computeGeneralUpdates(a, a.name, "complete", "abc")).toEqual({});
    });

    it("applies to in-progress as well as complete", () => {
      const a = makeActivity({ status: "inProgress" });
      expect(computeGeneralUpdates(a, a.name, "inProgress", 3)).toEqual({ actualDuration: 3 });
    });
  });

  describe("leaving a status that had an actual duration", () => {
    it("emits an EXPLICIT undefined to clear it", () => {
      const a = makeActivity({ status: "complete", actualDuration: 5 });
      const updates = computeGeneralUpdates(a, a.name, "planned", 5);

      expect(updates.status).toBe("planned");
      expect(updates.actualDuration).toBeUndefined();
      // The distinction that matters: an own property whose value is undefined, which
      // Object.keys counts — not an absent key. Save and dismiss-detection both count
      // keys, so an absent key would silently leave the stale duration in place.
      expect(Object.prototype.hasOwnProperty.call(updates, "actualDuration")).toBe(true);
    });

    it("does not emit the clear when there was nothing to clear", () => {
      const a = makeActivity({ status: "complete" });
      const updates = computeGeneralUpdates(a, a.name, "planned", "");
      expect(Object.prototype.hasOwnProperty.call(updates, "actualDuration")).toBe(false);
    });
  });
});

describe("computeEstimateUpdates", () => {
  const base = makeActivity({
    min: 1,
    mostLikely: 2,
    max: 3,
    confidenceLevel: "mediumConfidence",
    distributionType: "normal",
  });

  it("returns nothing when nothing changed", () => {
    expect(
      computeEstimateUpdates(base, 1, 2, 3, "mediumConfidence", "normal"),
    ).toEqual({});
  });

  it("saves each changed estimate independently", () => {
    expect(computeEstimateUpdates(base, 5, 2, 3, "mediumConfidence", "normal")).toEqual({ min: 5 });
    expect(computeEstimateUpdates(base, 1, 6, 3, "mediumConfidence", "normal")).toEqual({ mostLikely: 6 });
    expect(computeEstimateUpdates(base, 1, 2, 9, "mediumConfidence", "normal")).toEqual({ max: 9 });
  });

  it("compares numerically, so a string draft equal to the stored number is not a change", () => {
    expect(computeEstimateUpdates(base, "1", "2", "3", "mediumConfidence", "normal")).toEqual({});
  });

  it("converts a changed string draft to a number", () => {
    const updates = computeEstimateUpdates(base, "5", 2, 3, "mediumConfidence", "normal");
    expect(updates.min).toBe(5);
    expect(typeof updates.min).toBe("number");
  });

  it("skips an empty draft, so a half-typed field cannot overwrite a stored estimate", () => {
    // Without the `!== ""` guards, Number("") is 0 and every cleared field would silently
    // become zero.
    expect(computeEstimateUpdates(base, "", "", "", "mediumConfidence", "normal")).toEqual({});
  });

  it("saves a changed confidence level and distribution type", () => {
    expect(
      computeEstimateUpdates(base, 1, 2, 3, "lowConfidence", "normal"),
    ).toEqual({ confidenceLevel: "lowConfidence" });
    expect(
      computeEstimateUpdates(base, 1, 2, 3, "mediumConfidence", "triangular"),
    ).toEqual({ distributionType: "triangular" });
  });

  it("collects several changes at once", () => {
    expect(
      computeEstimateUpdates(base, 4, 5, 6, "lowConfidence", "uniform"),
    ).toEqual({
      min: 4,
      mostLikely: 5,
      max: 6,
      confidenceLevel: "lowConfidence",
      distributionType: "uniform",
    });
  });

  it("accepts zero as a real estimate rather than treating it as empty", () => {
    // `!== ""` rather than a truthiness check is what makes this work, and min = 0 is a
    // legitimate estimate the app supports (see the zero-uncertainty work in v0.53.0).
    expect(computeEstimateUpdates(base, 0, 2, 3, "mediumConfidence", "normal")).toEqual({ min: 0 });
  });
});
