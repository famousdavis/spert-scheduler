// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { UnifiedActivityRow } from "./UnifiedActivityRow";
import { createScenario, createActivity } from "@app/api/project-service";

/**
 * The grid's activity-name commit.
 *
 * Clearing an established activity's name used to persist `""`, and — until
 * v0.65.0 relaxed `ActivitySchema.name` — that made the whole project fail to
 * load on the next open. The relaxation removes the brick; this guard removes
 * the way in.
 *
 * ⚠️ Rendered, not unit-tested against `commitActivityName` directly. The claim
 * is about what a person does — type into the cell, tab away — and the buffered
 * field, the blur wiring and the `placeholder` all sit between the helper and
 * that. A unit test of the helper would pass with the callback unwired.
 *
 * ⚠️ The field is BUFFERED: it commits on blur, never per keystroke. Every case
 * here must fire `blur` before asserting.
 */

const settings = createScenario("S", "2026-09-07").settings;

function renderRow(name: string, onUpdate = vi.fn()) {
  const activity = createActivity(name, settings);
  render(
    <table>
      <tbody>
        <UnifiedActivityRow
          activity={activity}
          activityProbabilityTarget={0.5}
          onUpdate={onUpdate}
          onDelete={vi.fn()}
          onValidityChange={vi.fn()}
        />
      </tbody>
    </table>,
  );
  return { activity, onUpdate, input: screen.getByLabelText("Activity name") as HTMLInputElement };
}

function editTo(input: HTMLInputElement, next: string) {
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: next } });
  fireEvent.blur(input);
}

afterEach(cleanup);

describe("UnifiedActivityRow — activity name commit", () => {
  it("refuses to clear an established name", () => {
    const { onUpdate, input } = renderRow("Design");

    editTo(input, "");

    expect(onUpdate).not.toHaveBeenCalled();
    // The buffer resyncs to the stored name, so the cell shows it again rather
    // than sitting empty over a name that is still in the store.
    expect(input.value).toBe("Design");
  });

  it("refuses a whitespace-only name", () => {
    const { onUpdate, input } = renderRow("Design");

    editTo(input, "   ");

    expect(onUpdate).not.toHaveBeenCalled();
    expect(input.value).toBe("Design");
  });

  it("commits a real name — the control", () => {
    const { activity, onUpdate, input } = renderRow("Design");

    editTo(input, "Build");

    expect(onUpdate).toHaveBeenCalledWith(activity.id, { name: "Build" });
  });

  it("trims what it commits, matching InlineEdit and the edit modal", () => {
    const { activity, onUpdate, input } = renderRow("Design");

    editTo(input, "  Build  ");

    // v0.65.0 behaviour change, stated deliberately: the grid used to store
    // padding verbatim. It now matches the modal, which already trimmed.
    expect(onUpdate).toHaveBeenCalledWith(activity.id, { name: "Build" });
  });

  it("does not fire when trimming makes the value identical to the stored name", () => {
    const { onUpdate, input } = renderRow("Design");

    editTo(input, "  Design  ");

    // No undo frame and no simulation invalidation for a no-op edit.
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("keeps the placeholder on a row that is unnamed, and does not name it", () => {
    // `+ Add Activity` persists `name: ""` so this placeholder can render. The
    // guard must not fire on that row, and nothing may store a default into it.
    const { onUpdate, input } = renderRow("");

    expect(input.value).toBe("");
    expect(input.placeholder).toBe("Add an activity name");

    // Focusing and leaving without typing changes nothing.
    fireEvent.focus(input);
    fireEvent.blur(input);

    expect(onUpdate).not.toHaveBeenCalled();
    expect(input.value).toBe("");
  });

  it("lets an unnamed row be named", () => {
    const { activity, onUpdate, input } = renderRow("");

    editTo(input, "Design");

    expect(onUpdate).toHaveBeenCalledWith(activity.id, { name: "Design" });
  });
});
