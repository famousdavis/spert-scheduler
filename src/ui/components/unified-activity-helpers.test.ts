// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Activity } from "@domain/models/types";
import {
  constraintBadgeClass,
  constraintBadgeLabel,
  hasAnyConstraint,
  shouldShowConstraintColumn,
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
