// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * WI-2 · the DISPLAY half: an estimate cell shows what the store holds.
 *
 * The commit half — what a blur is allowed to WRITE — is in
 * `UnifiedActivityRow.estimate-commit.test.tsx`. They are split because they fail for
 * different reasons and a reader chasing one should not have to read the other.
 *
 * ⚠️ INSTRUMENT, and it is the one that silently lies here. The estimate inputs are now
 * CONTROLLED. `el.value = "20"` — the idiom the analysis harnesses used against the old
 * uncontrolled inputs — is swallowed by React's value tracker and the edit never reaches
 * the component. A swallowed edit looks exactly like a passing test. Every typed edit in
 * this file goes through `fireEvent.change`.
 *
 * ⚠️ The chosen focus policy, pinned by `keeps the typed draft…` below, is
 * STALE-BUT-FOCUSED: the cell follows the store unless the user has typed since focusing.
 * The alternative (a value-bearing `key`, as the actual-duration cell uses) was rejected:
 * measured in real Chromium, a remount inside the blur microtask lands focus on <body>, so
 * clicking from ML straight into Min or Max with the heuristic on loses the click.
 */

import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { act } from "react";
import type { Activity } from "@domain/models/types";
import { UnifiedActivityRow } from "./UnifiedActivityRow";

/** Typed, never cast — a cast would disable the check that catches fixture errors. */
function makeActivity(over: Partial<Activity> = {}): Activity {
  return {
    id: "a1",
    name: "Design",
    min: 2,
    mostLikely: 5,
    max: 9,
    confidenceLevel: "mediumConfidence",
    distributionType: "normal",
    status: "planned",
    ...over,
  };
}

const cell = (field: string) =>
  document.querySelector<HTMLInputElement>(`[data-row-id="a1"][data-field="${field}"]`)!;

type RowProps = Parameters<typeof UnifiedActivityRow>[0];

function Row(props: Partial<RowProps> & { activity: Activity }) {
  return (
    <UnifiedActivityRow
      activityProbabilityTarget={0.5}
      onUpdate={vi.fn()}
      onDelete={vi.fn()}
      onValidityChange={vi.fn()}
      {...props}
    />
  );
}

describe("UnifiedActivityRow — estimate cells follow the store", () => {
  it("shows a new value written while the cell is unfocused, in the same DOM nodes", () => {
    // ⚠️ TWO conjuncts, and each is useless alone.
    //
    // The value alone is satisfied by any mechanism that remounts the input — including
    // the value-bearing `key` this fix deliberately did NOT use, and including the
    // incidental heals that hide this defect in the wild (switch scenario tab, navigate
    // away and back, reload). Node identity alone is TRUE at HEAD, where the input never
    // remounts and never updates either.
    //
    // Row-node identity is the criterion; input-node identity is asserted as well, and
    // that is the stronger claim: it pins that this cell is updated in place.
    const a = makeActivity({ min: 2 });
    const { container, rerender } = render(<Row activity={a} />);
    const rowBefore = container.firstElementChild;
    const inputBefore = cell("min");
    expect(inputBefore.value).toBe("2");

    rerender(<Row activity={{ ...a, min: 3 }} />);

    expect({
      shows: cell("min").value,
      sameRowNode: container.firstElementChild === rowBefore,
      sameInputNode: cell("min") === inputBefore,
    }).toEqual({ shows: "3", sameRowNode: true, sameInputNode: true });
  });

  it("keeps the typed draft when the store changes underneath a focused cell, and commits the draft", () => {
    // REGRESSION GUARD, not acceptance — this passes at HEAD too, where the uncontrolled
    // input simply keeps whatever the DOM holds. It is here because it is the half of the
    // focus policy a fix could easily lose: protecting in-progress typing from an undo, a
    // cloud echo, an AI Connect write or a collaborator is the whole reason the cell is
    // allowed to diverge from the store at all.
    const onUpdate = vi.fn();
    const a = makeActivity({ mostLikely: 5 });
    const { rerender } = render(<Row activity={a} onUpdate={onUpdate} />);
    const ml = cell("ml");
    act(() => { ml.focus(); });
    fireEvent.change(ml, { target: { value: "20" } });

    rerender(<Row activity={{ ...a, mostLikely: 13 }} onUpdate={onUpdate} />);
    expect(ml.value).toBe("20"); // the user's typing survives the external write

    act(() => { ml.blur(); });
    expect(onUpdate).toHaveBeenCalledWith("a1", expect.objectContaining({ mostLikely: 20 }));
  });

  it("shows the rounded number after a fractional entry is committed", () => {
    // Constraint 9's display half. At HEAD the "4" on screen came from a direct DOM write
    // in EstimateInputs' blur handler; that write is deleted, and the rounded value now
    // arrives the same way every other value does — from the store, through the prop.
    // ⚠️ This is what proves deleting that write was safe, so do not merge it away.
    const a = makeActivity({ min: 2 });
    const onUpdate = vi.fn();
    const { rerender } = render(<Row activity={a} onUpdate={onUpdate} />);
    const min = cell("min");
    act(() => { min.focus(); });
    fireEvent.change(min, { target: { value: "3.7" } });
    act(() => { min.blur(); });

    expect(onUpdate).toHaveBeenCalledWith("a1", expect.objectContaining({ min: 4 }));

    // The store's answer comes back down the prop, as it would in the app.
    rerender(<Row activity={{ ...a, min: 4 }} onUpdate={onUpdate} />);
    expect(cell("min").value).toBe("4");
  });

  it("shows the recalculated min and max after a heuristic ML commit", () => {
    // Constraint 7's jsdom half, and the other proof that a deletion was safe: at HEAD the
    // sibling cells were written by a document-scoped `document.querySelector` inside
    // handleBlur. That lookup is gone. jsdom cannot see the half that mattered most — that
    // the click's FOCUS survives — which is why constraint 7 is also a browser check.
    const a = makeActivity({ min: 5, mostLikely: 18, max: 20 });
    const onUpdate = vi.fn();
    const { rerender } = render(
      <Row activity={a} onUpdate={onUpdate} heuristicEnabled heuristicMinPercent={75} heuristicMaxPercent={200} />,
    );
    const ml = cell("ml");
    act(() => { ml.focus(); });
    fireEvent.change(ml, { target: { value: "30" } });
    act(() => { ml.blur(); });

    expect(onUpdate).toHaveBeenCalledWith("a1", { mostLikely: 30, min: 23, max: 60 });

    rerender(
      <Row
        activity={{ ...a, min: 22.5, mostLikely: 30, max: 60 }}
        onUpdate={onUpdate}
        heuristicEnabled
        heuristicMinPercent={75}
        heuristicMaxPercent={200}
      />,
    );
    expect([cell("min").value, cell("ml").value, cell("max").value]).toEqual(["23", "30", "60"]);
  });
});
