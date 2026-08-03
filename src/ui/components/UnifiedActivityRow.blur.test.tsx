// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * `UnifiedActivityRow`'s estimate commit-on-blur path (§3.3, 2026-08-03).
 *
 * ⚠️ THIS FILE EXISTS TO TEST THE CHARTER'S OPEN RIDER, not to raise coverage. The rider
 * (recorded 2026-08-01, status "hypothesis, never tested") says v0.62.0's defect was a
 * guard that conditions *"warn the user they're about to lose work"* on that work being
 * VALID — backwards, because invalid work is still work the user typed. Its own note says
 * a textual sweep under-detects by construction and the handlers have to be READ.
 *
 * This is the same family in a different component: a commit-on-blur path with a validity
 * concept (`onValidityChange`), where `handleBlur` opens `if (!isNaN(parsed))` and has no
 * `else`. The estimate inputs are UNCONTROLLED (`defaultValue` in EstimateInputs.tsx:46),
 * so React never resets them — which decides whether "do nothing" is invisible to the user.
 *
 * These tests PIN WHAT IT ACTUALLY DOES. They assert no intent beyond the observed
 * behaviour, and any verdict on the rider belongs in the report, not here.
 */

import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import type { Activity } from "@domain/models/types";
import { UnifiedActivityRow } from "./UnifiedActivityRow";

function activityWith(patch: Partial<Activity> = {}): Activity {
  return {
    id: "a1",
    name: "Task",
    min: 2,
    mostLikely: 5,
    max: 9,
    confidenceLevel: "mediumConfidence",
    distributionType: "normal",
    status: "planned",
    ...patch,
  } as Activity;
}

function renderRow(over: Partial<Parameters<typeof UnifiedActivityRow>[0]> = {}) {
  const onUpdate = vi.fn();
  const onValidityChange = vi.fn();
  const utils = render(
    <table>
      <tbody>
        <UnifiedActivityRow
          activity={activityWith()}
          activityProbabilityTarget={0.5}
          onUpdate={onUpdate}
          onDelete={vi.fn()}
          onValidityChange={onValidityChange}
          {...over}
        />
      </tbody>
    </table>,
  );
  const field = (name: string) =>
    utils.container.querySelector<HTMLInputElement>(`[data-row-id="a1"][data-field="${name}"]`)!;
  return { ...utils, onUpdate, onValidityChange, field };
}

describe("UnifiedActivityRow — estimate commit on blur", () => {
  it("commits a changed numeric value", () => {
    const { field, onUpdate } = renderRow();
    const min = field("min");
    fireEvent.focus(min);
    fireEvent.change(min, { target: { value: "3" } });
    fireEvent.blur(min);
    expect(onUpdate).toHaveBeenCalledWith("a1", expect.objectContaining({ min: 3 }));
  });

  it("rounds a fractional entry before committing", () => {
    const { field, onUpdate } = renderRow();
    const min = field("min");
    fireEvent.focus(min);
    fireEvent.change(min, { target: { value: "3.7" } });
    fireEvent.blur(min);
    expect(onUpdate).toHaveBeenCalledWith("a1", expect.objectContaining({ min: 4 }));
  });

  // ⚠️ THE RIDER'S CASE. Clearing a numeric field is an ordinary user action — select all,
  // delete, tab away. `parseFloat("")` is NaN, so handleBlur's `if (!isNaN(parsed))` is
  // skipped and there is no `else`.
  it("does nothing at all when the field is cleared — no commit, no validity change", () => {
    const { field, onUpdate, onValidityChange } = renderRow();
    const min = field("min");
    fireEvent.focus(min);
    fireEvent.change(min, { target: { value: "" } });
    fireEvent.blur(min);

    expect(onUpdate).not.toHaveBeenCalled();
    expect(onValidityChange).not.toHaveBeenCalled();
  });

  it("leaves the cleared field showing empty while the stored value is unchanged", () => {
    // The composition half of the same case: the input is uncontrolled, so React does not
    // reset it. Whether the user can TELL that nothing was committed is a property of what
    // the field displays afterwards, not of the handler.
    const { field } = renderRow();
    const min = field("min");
    fireEvent.focus(min);
    fireEvent.change(min, { target: { value: "" } });
    fireEvent.blur(min);

    expect(min.value).toBe("");
  });

  it("marks no error on the cleared field", () => {
    // If the row flagged the field, the user would at least see something happened.
    const { field } = renderRow();
    const min = field("min");
    fireEvent.focus(min);
    fireEvent.change(min, { target: { value: "" } });
    fireEvent.blur(min);

    expect(min.className).not.toContain("border-red");
    // title falls back to the field's own label when there is no error to show
    // (EstimateInputs.tsx:58 — `title={f.error ?? f.title}`).
    expect(min.getAttribute("title")).toBe("Optimistic estimate (days)");
  });

  it("commits an out-of-order estimate and reports it invalid, rather than discarding it", () => {
    // Contrast case, and the reason the cleared-field result is notable: a NUMERIC but
    // schema-invalid entry IS committed and IS reported. Only the unparseable one vanishes.
    const { field, onUpdate } = renderRow();
    const max = field("max");
    fireEvent.focus(max);
    fireEvent.change(max, { target: { value: "1" } }); // max < min < mostLikely
    fireEvent.blur(max);

    expect(onUpdate).toHaveBeenCalledWith("a1", expect.objectContaining({ max: 1 }));
  });
});
