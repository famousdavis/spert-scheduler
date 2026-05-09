// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import type { Activity } from "@domain/models/types";
import { computeConstraintUpdates } from "./activity-modal-sections";

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
