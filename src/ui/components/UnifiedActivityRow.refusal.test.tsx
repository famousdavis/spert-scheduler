// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * What the grid row REFUSES to store (v0.69.0): an estimate that cannot be read as a number (a
 * cleared cell, v0.63.1) and, new, a NEGATIVE one — until then `-5` was stored and the next load
 * rejected the whole project. A refused entry stays on screen, red, and the row reports it; that
 * report is the one thing about the row saved data cannot see.
 */

import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import type { Activity } from "@domain/models/types";
import { createActivity, createScenario } from "@app/api/project-service";
import { UnifiedActivityRow } from "./UnifiedActivityRow";

function activityWith(patch: Partial<Activity>): Activity {
  return { ...createActivity("Task", createScenario("S", "2026-04-06").settings), id: "a1", ...patch };
}

function renderRow(patch: Partial<Activity>, heuristicEnabled = false) {
  const onUpdate = vi.fn();
  const onValidityChange = vi.fn();
  const utils = render(
    <UnifiedActivityRow
      activity={activityWith(patch)}
      activityProbabilityTarget={0.5}
      onUpdate={onUpdate}
      onDelete={vi.fn()}
      onValidityChange={onValidityChange}
      heuristicEnabled={heuristicEnabled}
      heuristicMinPercent={75}
      heuristicMaxPercent={200}
    />
  );
  const field = (name: string) =>
    utils.container.querySelector<HTMLInputElement>(`[data-row-id="a1"][data-field="${name}"]`)!;
  const enter = (name: string, value: string) => {
    const el = field(name);
    fireEvent.focus(el);
    fireEvent.change(el, { target: { value } });
    fireEvent.blur(el);
  };
  return { onUpdate, onValidityChange, field, enter };
}

describe("a negative estimate is refused at the blur", () => {
  it("writes nothing, keeps the text on screen, paints the cell red and reports it", () => {
    const { onUpdate, onValidityChange, field, enter } = renderRow({ min: 2, mostLikely: 5, max: 9 });
    enter("min", "-5");

    expect(onUpdate).not.toHaveBeenCalled();
    expect(field("min").value).toBe("-5");
    expect(field("min").getAttribute("title")).toBe("Enter 0 or more.");
    expect(field("min")).toHaveAttribute("aria-invalid", "true");
    expect(document.getElementById(field("min").getAttribute("aria-describedby")!)?.textContent).toBe("Enter 0 or more.");
    expect(onValidityChange).toHaveBeenLastCalledWith("a1", { midEntry: null, refused: { min: "Enter 0 or more." } });
  });

  it("is refused BEFORE the heuristic branch, which would otherwise write all three", () => {
    const { onUpdate, field, enter } = renderRow({ min: 2, mostLikely: 5, max: 9 }, true);
    enter("ml", "-5");
    expect(onUpdate).not.toHaveBeenCalled();
    expect(field("ml").value).toBe("-5");
  });

  it("CONTROL: zero is an estimate, not a refusal", () => {
    const { onUpdate, enter } = renderRow({ min: 2, mostLikely: 5, max: 9 });
    enter("min", "0");
    expect(onUpdate).toHaveBeenCalledWith("a1", { min: 0 });
  });
});

describe("the report describes the ROW, not the last cell", () => {
  it("a cleared Min stays reported — and red — after the next cell commits (Opus-2-2 P19)", () => {
    // Before v0.69.0 the ML commit wiped Min's message and reported the row valid, while Min
    // still showed an empty cell.
    const { onUpdate, onValidityChange, field, enter } = renderRow({ min: 2, mostLikely: 5, max: 9 });
    enter("min", "");
    enter("ml", "6");

    expect(onUpdate).toHaveBeenLastCalledWith("a1", { mostLikely: 6 });
    expect(field("min").value).toBe("");
    expect(field("min")).toHaveAttribute("aria-invalid", "true");
    expect(onValidityChange).toHaveBeenLastCalledWith("a1", { midEntry: null, refused: { min: "Enter a number." } });
  });

  it("a refused cell given a number clears its own entry", () => {
    const { onValidityChange, field, enter } = renderRow({ min: 2, mostLikely: 5, max: 9 });
    enter("min", "");
    enter("min", "3");
    expect(field("min")).not.toHaveAttribute("aria-invalid");
    expect(onValidityChange).toHaveBeenLastCalledWith("a1", { midEntry: null, refused: {} });
  });
});
