// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * The group commit's decision table (v0.70.0, WI-50): what one exit from a row's three estimate
 * cells writes and refuses, as a pure function. The row and page tests drive the same decisions
 * through real focus moves; this pins each rule on its own, with its boundary beside it.
 */

import { describe, it, expect } from "vitest";
import { commitEstimateGroup, refusedDraftsOnly, NO_DRAFTS } from "./activity-row-helpers";

const STORED = { min: 5, mostLikely: 10, max: 20 };
const HEURISTIC = { minPercent: 75, maxPercent: 200 };

describe("commitEstimateGroup", () => {
  it("nothing typed: nothing written, nothing refused", () => {
    expect(commitEstimateGroup(STORED, {}, null)).toEqual({ updates: null, refused: {} });
  });

  it("writes every typed cell that changes the number on screen, in ONE update", () => {
    expect(commitEstimateGroup(STORED, { min: "6", mostLikely: "11", max: "21" }, null)).toEqual({
      updates: { min: 6, mostLikely: 11, max: 21 },
      refused: {},
    });
  });

  it("saves an out-of-order triple as typed — the flag comes from the saved data, not from here", () => {
    expect(commitEstimateGroup(STORED, { min: "11" }, null).updates).toEqual({ min: 11 });
  });

  it("R40, both sides rounded: 5.4 over 5 writes nothing; 1 over a stored 0.75 writes nothing; 5.6 writes 6", () => {
    expect(commitEstimateGroup(STORED, { min: "5.4" }, null).updates).toBeNull();
    expect(commitEstimateGroup({ min: 0.75, mostLikely: 1, max: 2 }, { min: "1" }, null).updates).toBeNull();
    expect(commitEstimateGroup(STORED, { min: "5.6" }, null).updates).toEqual({ min: 6 });
  });

  it("refuses a cleared cell and a negative one, writing the other typed cells", () => {
    expect(commitEstimateGroup(STORED, { min: "", mostLikely: "12", max: "-3" }, null)).toEqual({
      updates: { mostLikely: 12 },
      refused: { min: "Enter a number.", max: "Enter 0 or more." },
    });
  });

  it("zero is an estimate, not a refusal", () => {
    expect(commitEstimateGroup(STORED, { min: "0" }, null)).toEqual({ updates: { min: 0 }, refused: {} });
  });

  describe("the heuristic (R185.7): typed values beat it", () => {
    it("Most Likely alone: Min and Max recomputed from it, rounded", () => {
      expect(commitEstimateGroup(STORED, { mostLikely: "30" }, HEURISTIC).updates).toEqual({
        min: 23,
        mostLikely: 30,
        max: 60,
      });
    });

    it("Most Likely with a typed Min: the Min is kept, only Max is filled", () => {
      expect(commitEstimateGroup(STORED, { min: "7", mostLikely: "30" }, HEURISTIC).updates).toEqual({
        min: 7,
        mostLikely: 30,
        max: 60,
      });
    });

    it("a refused cell is typed text too: it is not filled, and stays refused", () => {
      expect(commitEstimateGroup(STORED, { min: "", mostLikely: "30" }, HEURISTIC)).toEqual({
        updates: { mostLikely: 30, max: 60 },
        refused: { min: "Enter a number." },
      });
    });

    it("does nothing unless Most Likely CHANGED on screen", () => {
      expect(commitEstimateGroup(STORED, { mostLikely: "10.2" }, HEURISTIC).updates).toBeNull();
      expect(commitEstimateGroup(STORED, { min: "6" }, HEURISTIC).updates).toEqual({ min: 6 });
    });

    it("does nothing with the heuristic off", () => {
      expect(commitEstimateGroup(STORED, { mostLikely: "30" }, null).updates).toEqual({ mostLikely: 30 });
    });
  });
});

describe("refusedDraftsOnly", () => {
  it("keeps the refused drafts, which stay on screen, and drops the rest, which follow the store", () => {
    expect(refusedDraftsOnly({ min: "", mostLikely: "12", max: "-3" })).toEqual({ min: "", max: "-3" });
  });

  it("returns NO_DRAFTS itself when nothing is refused, so an ordinary exit sets no new state", () => {
    expect(refusedDraftsOnly({ min: "6" })).toBe(NO_DRAFTS);
  });
});
