// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Activity } from "@domain/models/types";
import {
  constraintBadgeClass,
  constraintBadgeLabel,
  hasAnyConstraint,
  shouldShowConstraintColumn,
  planBulkApply,
  maxTabTarget,
  buildTabFieldOrder,
  handleOffOrderTabNav,
  getActivityRowIds,
  handleCrossRowTabNav,
  handleInRowTabNav,
} from "./unified-activity-helpers";

const focusFieldMock = vi.fn();
const focusNextRowMock = vi.fn();
const focusPrevRowMock = vi.fn();

vi.mock("./activity-row-helpers", () => ({
  focusField: (...args: unknown[]) => focusFieldMock(...args),
  focusNextRow: (...args: unknown[]) => focusNextRowMock(...args),
  focusPrevRow: (...args: unknown[]) => focusPrevRowMock(...args),
}));

beforeEach(() => {
  focusFieldMock.mockReset();
  focusNextRowMock.mockReset();
  focusPrevRowMock.mockReset();
});

function makeKeyEvent(shiftKey: boolean, target?: HTMLElement): React.KeyboardEvent {
  const preventDefault = vi.fn();
  return { shiftKey, target: target as unknown as EventTarget, preventDefault } as unknown as React.KeyboardEvent;
}

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

describe("constraintBadgeClass", () => {
  it("returns inactive style when no constraint", () => {
    expect(constraintBadgeClass(false, null, false)).toContain("text-gray-300");
  });

  it("returns hard-mode style for hard constraints", () => {
    expect(constraintBadgeClass(true, "hard", false)).toContain("bg-blue-100");
  });

  it("returns warning style for soft constraint with warning", () => {
    expect(constraintBadgeClass(true, "soft", true)).toContain("bg-amber-50");
  });

  it("returns dashed neutral style for soft constraint without warning", () => {
    const cls = constraintBadgeClass(true, "soft", false);
    expect(cls).toContain("border-dashed");
    expect(cls).not.toContain("bg-amber-50");
  });
});

describe("constraintBadgeLabel", () => {
  it("returns em-dash when no constraint type", () => {
    expect(constraintBadgeLabel(null, null)).toBe("—");
    expect(constraintBadgeLabel(undefined, "soft")).toBe("—");
  });

  it("returns plain type when mode is hard", () => {
    expect(constraintBadgeLabel("MSO", "hard")).toBe("MSO");
  });

  it("appends ' S' suffix when mode is soft", () => {
    expect(constraintBadgeLabel("SNET", "soft")).toBe("SNET S");
  });
});

describe("maxTabTarget", () => {
  it("returns 'ml' when shift is held", () => {
    expect(maxTabTarget(true, true)).toBe("ml");
    expect(maxTabTarget(true, false)).toBe("ml");
  });

  it("returns 'confidence' when forward and confidence applies", () => {
    expect(maxTabTarget(false, true)).toBe("confidence");
  });

  it("returns 'distribution' when forward and confidence does not apply", () => {
    expect(maxTabTarget(false, false)).toBe("distribution");
  });
});

describe("buildTabFieldOrder", () => {
  it("heuristic + confidence + planned: name, ml, confidence, distribution, status", () => {
    expect(buildTabFieldOrder(true, true, false, false)).toEqual([
      "name",
      "ml",
      "confidence",
      "distribution",
      "status",
    ]);
  });

  it("heuristic without confidence omits confidence", () => {
    expect(buildTabFieldOrder(true, false, false, false)).toEqual([
      "name",
      "ml",
      "distribution",
      "status",
    ]);
  });

  it("heuristic + complete appends 'actual'", () => {
    const order = buildTabFieldOrder(true, true, true, false);
    expect(order[order.length - 1]).toBe("actual");
  });

  it("heuristic + inProgress appends 'actual'", () => {
    const order = buildTabFieldOrder(true, false, false, true);
    expect(order[order.length - 1]).toBe("actual");
  });

  it("non-heuristic planned: name, min, ml, max", () => {
    expect(buildTabFieldOrder(false, true, false, false)).toEqual(["name", "min", "ml", "max"]);
  });

  it("non-heuristic complete includes actual", () => {
    expect(buildTabFieldOrder(false, true, true, false)).toEqual([
      "name",
      "min",
      "ml",
      "max",
      "actual",
    ]);
  });

  it("non-heuristic inProgress includes actual", () => {
    expect(buildTabFieldOrder(false, false, false, true)).toEqual([
      "name",
      "min",
      "ml",
      "max",
      "actual",
    ]);
  });
});

describe("handleOffOrderTabNav", () => {
  it("returns false when not in heuristic mode", () => {
    const e = makeKeyEvent(false);
    expect(handleOffOrderTabNav(e, "min", "a1", false, -1, true)).toBe(false);
    expect(focusFieldMock).not.toHaveBeenCalled();
  });

  it("returns false when field is in normal order", () => {
    const e = makeKeyEvent(false);
    expect(handleOffOrderTabNav(e, "name", "a1", true, 0, true)).toBe(false);
  });

  it("min + tab forward focuses ml", () => {
    const e = makeKeyEvent(false);
    expect(handleOffOrderTabNav(e, "min", "a1", true, -1, true)).toBe(true);
    expect(focusFieldMock).toHaveBeenCalledWith("a1", "ml");
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it("min + shift+tab focuses name", () => {
    const e = makeKeyEvent(true);
    handleOffOrderTabNav(e, "min", "a1", true, -1, true);
    expect(focusFieldMock).toHaveBeenCalledWith("a1", "name");
  });

  it("max + tab forward + confidence applies focuses confidence", () => {
    const e = makeKeyEvent(false);
    handleOffOrderTabNav(e, "max", "a1", true, -1, true);
    expect(focusFieldMock).toHaveBeenCalledWith("a1", "confidence");
  });

  it("max + tab forward + no confidence focuses distribution", () => {
    const e = makeKeyEvent(false);
    handleOffOrderTabNav(e, "max", "a1", true, -1, false);
    expect(focusFieldMock).toHaveBeenCalledWith("a1", "distribution");
  });

  it("max + shift+tab focuses ml", () => {
    const e = makeKeyEvent(true);
    handleOffOrderTabNav(e, "max", "a1", true, -1, true);
    expect(focusFieldMock).toHaveBeenCalledWith("a1", "ml");
  });
});

describe("getActivityRowIds", () => {
  it("returns null when no grid ancestor", () => {
    const orphan = document.createElement("div");
    expect(getActivityRowIds(orphan)).toBeNull();
  });

  it("returns ordered, deduped row ids from grid ancestor", () => {
    const grid = document.createElement("div");
    grid.setAttribute("data-activity-grid", "");
    const r1 = document.createElement("div");
    r1.setAttribute("data-row-id", "a1");
    const r2 = document.createElement("div");
    r2.setAttribute("data-row-id", "a2");
    const r1Dup = document.createElement("div");
    r1Dup.setAttribute("data-row-id", "a1");
    const target = document.createElement("input");
    grid.append(r1, target, r2, r1Dup);
    document.body.appendChild(grid);

    expect(getActivityRowIds(target)).toEqual(["a1", "a2"]);

    document.body.removeChild(grid);
  });
});

describe("handleCrossRowTabNav", () => {
  function makeTargetInGrid(): HTMLElement {
    const grid = document.createElement("div");
    grid.setAttribute("data-activity-grid", "");
    const row = document.createElement("div");
    row.setAttribute("data-row-id", "a1");
    const input = document.createElement("input");
    grid.appendChild(row);
    grid.appendChild(input);
    document.body.appendChild(grid);
    return input;
  }

  it("Tab from last field calls focusNextRow", () => {
    const input = makeTargetInGrid();
    const e = makeKeyEvent(false, input);
    expect(handleCrossRowTabNav(e, "max", "max", "a1", false)).toBe(true);
    expect(focusNextRowMock).toHaveBeenCalledWith("a1", ["a1"]);
    document.body.innerHTML = "";
  });

  it("Tab from non-last field returns false", () => {
    const input = makeTargetInGrid();
    const e = makeKeyEvent(false, input);
    expect(handleCrossRowTabNav(e, "ml", "max", "a1", false)).toBe(false);
    expect(focusNextRowMock).not.toHaveBeenCalled();
    document.body.innerHTML = "";
  });

  it("Shift+Tab from name field calls focusPrevRow with status hint when heuristic", () => {
    const input = makeTargetInGrid();
    const e = makeKeyEvent(true, input);
    expect(handleCrossRowTabNav(e, "name", "max", "a1", true)).toBe(true);
    expect(focusPrevRowMock).toHaveBeenCalledWith("a1", ["a1"], "status");
    document.body.innerHTML = "";
  });

  it("Shift+Tab from name without heuristic uses undefined hint", () => {
    const input = makeTargetInGrid();
    const e = makeKeyEvent(true, input);
    handleCrossRowTabNav(e, "name", "max", "a1", false);
    expect(focusPrevRowMock).toHaveBeenCalledWith("a1", ["a1"], undefined);
    document.body.innerHTML = "";
  });

  it("Shift+Tab from non-name field returns false", () => {
    const input = makeTargetInGrid();
    const e = makeKeyEvent(true, input);
    expect(handleCrossRowTabNav(e, "ml", "max", "a1", false)).toBe(false);
    document.body.innerHTML = "";
  });
});

describe("handleInRowTabNav", () => {
  it("Tab forward focuses next field in order", () => {
    const e = makeKeyEvent(false);
    handleInRowTabNav(e, ["name", "ml", "max"], 1, "a1");
    expect(focusFieldMock).toHaveBeenCalledWith("a1", "max");
    expect(e.preventDefault).toHaveBeenCalled();
  });

  it("Shift+Tab focuses previous field", () => {
    const e = makeKeyEvent(true);
    handleInRowTabNav(e, ["name", "ml", "max"], 2, "a1");
    expect(focusFieldMock).toHaveBeenCalledWith("a1", "ml");
  });

  it("does nothing when at the first field with shift", () => {
    const e = makeKeyEvent(true);
    handleInRowTabNav(e, ["name", "ml", "max"], 0, "a1");
    expect(focusFieldMock).not.toHaveBeenCalled();
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it("does nothing when at the last field forward", () => {
    const e = makeKeyEvent(false);
    handleInRowTabNav(e, ["name", "ml", "max"], 2, "a1");
    expect(focusFieldMock).not.toHaveBeenCalled();
  });
});

describe("hasAnyConstraint", () => {
  it("returns false for an empty list", () => {
    expect(hasAnyConstraint([])).toBe(false);
  });

  it("returns false when no activity has a constraintType", () => {
    expect(hasAnyConstraint([makeActivity(), makeActivity({ id: "a2" })])).toBe(false);
  });

  it("returns true when at least one activity has a constraintType", () => {
    const activities = [
      makeActivity(),
      makeActivity({ id: "a2", constraintType: "MSO", constraintDate: "2026-01-15", constraintMode: "hard" }),
    ];
    expect(hasAnyConstraint(activities)).toBe(true);
  });
});

describe("shouldShowConstraintColumn", () => {
  it("is true in dependency mode even with zero constraints", () => {
    expect(shouldShowConstraintColumn(true, [makeActivity()])).toBe(true);
  });

  it("is false in sequential mode with zero constraints", () => {
    expect(shouldShowConstraintColumn(false, [makeActivity()])).toBe(false);
  });

  it("is true in sequential mode once a constraint exists", () => {
    const activities = [makeActivity({ constraintType: "FNLT", constraintDate: "2026-02-01", constraintMode: "soft" })];
    expect(shouldShowConstraintColumn(false, activities)).toBe(true);
  });

  it("is true in dependency mode regardless of constraints", () => {
    const activities = [makeActivity({ constraintType: "MFO", constraintDate: "2026-03-01", constraintMode: "hard" })];
    expect(shouldShowConstraintColumn(true, activities)).toBe(true);
  });

  it("is false in sequential mode when undefined dependencyMode and no constraints", () => {
    expect(shouldShowConstraintColumn(undefined, [makeActivity()])).toBe(false);
  });
});

// -- planBulkApply ------------------------------------------------------------

/**
 * Extracted from UnifiedActivityGrid's bulk-apply handler (cognitive complexity 25, in a
 * component at 0% coverage). The routing rules below are the part worth pinning: which
 * staged fields go out as ONE shared update and which have to be issued per activity.
 */
describe("planBulkApply", () => {
  const heuristicFn = (ml: number, minPct: number, maxPct: number) => ({
    min: (ml * minPct) / 100,
    max: (ml * maxPct) / 100,
  });

  const act = (id: string, mostLikely = 10): Activity =>
    ({
      id,
      name: id,
      min: 5,
      mostLikely,
      max: 20,
      confidenceLevel: "mediumConfidence",
      distributionType: "normal",
      status: "planned",
    }) as Activity;

  const ACTS = [act("a1"), act("a2")];
  const SCHED = [
    { activityId: "a1", duration: 4 },
    { activityId: "a2", duration: 7 },
  ];
  const IDS = ["a1", "a2"];
  const NO_HEURISTIC = { enabled: false };

  const plan = (
    staged: Parameters<typeof planBulkApply>[0],
    heuristic: Parameters<typeof planBulkApply>[4] = NO_HEURISTIC,
  ) => planBulkApply(staged, IDS, ACTS, SCHED, heuristic, heuristicFn);

  it("plans nothing when nothing is staged", () => {
    const p = plan({});
    expect(p.sharedUpdates).toBeNull();
    expect(p.perActivity).toEqual([]);
  });

  describe("shared fields", () => {
    it("collects confidence and distribution into a single update", () => {
      const p = plan({ confidenceLevel: "lowConfidence", distributionType: "triangular" });
      expect(p.sharedUpdates).toEqual({
        confidenceLevel: "lowConfidence",
        distributionType: "triangular",
      });
      expect(p.perActivity).toEqual([]);
    });

    it("treats a non-complete status as shared", () => {
      expect(plan({ status: "inProgress" }).sharedUpdates).toEqual({ status: "inProgress" });
    });
  });

  describe('the "complete" status is routed per activity, not shared', () => {
    it("carries each activity's own scheduled duration as its actual duration", () => {
      // This is why it cannot be a shared update: the value differs per activity.
      const p = plan({ status: "complete" });
      expect(p.sharedUpdates).toBeNull();
      expect(p.perActivity).toEqual([
        { id: "a1", updates: { status: "complete", actualDuration: 4 } },
        { id: "a2", updates: { status: "complete", actualDuration: 7 } },
      ]);
    });

    it("leaves actualDuration undefined for an activity with no schedule entry", () => {
      const p = planBulkApply(
        { status: "complete" },
        ["a1", "ghost"],
        ACTS,
        SCHED,
        NO_HEURISTIC,
        heuristicFn,
      );
      const ghost = p.perActivity.find((e) => e.id === "ghost")!;
      expect(ghost.updates.status).toBe("complete");
      expect(ghost.updates.actualDuration).toBeUndefined();
    });

    it("still shares confidence and distribution alongside a complete status", () => {
      const p = plan({ status: "complete", confidenceLevel: "lowConfidence" });
      expect(p.sharedUpdates).toEqual({ confidenceLevel: "lowConfidence" });
      expect(p.perActivity).toHaveLength(2);
    });
  });

  describe("heuristic recalculation", () => {
    const ON = { enabled: true, minPercent: 50, maxPercent: 200 };

    it("recalculates min and max from each activity's own mostLikely", () => {
      const p = plan({ recalculateHeuristic: true }, ON);
      expect(p.perActivity).toEqual([
        { id: "a1", updates: { min: 5, max: 20 } },
        { id: "a2", updates: { min: 5, max: 20 } },
      ]);
    });

    it("does nothing when the heuristic is disabled, even if staged", () => {
      expect(plan({ recalculateHeuristic: true }, { enabled: false }).perActivity).toEqual([]);
    });

    it("does nothing when not staged, even if enabled", () => {
      expect(plan({}, ON).perActivity).toEqual([]);
    });

    it("falls back to 50/200 percentages when they are absent", () => {
      const p = plan({ recalculateHeuristic: true }, { enabled: true });
      expect(p.perActivity[0]!.updates).toEqual({ min: 5, max: 20 });
    });

    it("skips an activity whose mostLikely is zero", () => {
      // Both bounds would be 0, which is not a useful estimate.
      const p = planBulkApply(
        { recalculateHeuristic: true },
        IDS,
        [act("a1", 0), act("a2", 10)],
        SCHED,
        ON,
        heuristicFn,
      );
      expect(p.perActivity.map((e) => e.id)).toEqual(["a2"]);
    });

    it("skips an id with no matching activity", () => {
      const p = planBulkApply(
        { recalculateHeuristic: true },
        ["ghost"],
        ACTS,
        SCHED,
        ON,
        heuristicFn,
      );
      expect(p.perActivity).toEqual([]);
    });
  });

  it("issues TWO entries for an activity that is both completed and recalculated", () => {
    // ⚠️ Deliberate, and the reason perActivity is a list rather than a map. The original
    // handler made two separate onUpdate calls in this order; merging them into one
    // update would change what a consumer observes.
    const p = plan(
      { status: "complete", recalculateHeuristic: true },
      { enabled: true, minPercent: 50, maxPercent: 200 },
    );
    expect(p.perActivity).toEqual([
      { id: "a1", updates: { status: "complete", actualDuration: 4 } },
      { id: "a2", updates: { status: "complete", actualDuration: 7 } },
      { id: "a1", updates: { min: 5, max: 20 } },
      { id: "a2", updates: { min: 5, max: 20 } },
    ]);
  });
});
