// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MilestonePanel } from "./MilestonePanel";
import type { Milestone } from "@domain/models/types";

/**
 * The milestone rename commit.
 *
 * Adding a milestone was already guarded and trimmed (`MilestonePanel.tsx:105-106`,
 * `if (!newName.trim() || !newDate) return;`). Renaming one was not guarded on any
 * hop, and `updateMilestone` performs no validation at all — so a cleared name was
 * persisted and the project failed to load next time it was opened. This makes
 * rename match add, which is the asymmetry that was the defect.
 *
 * ⚠️ Rendered through the real panel, not unit-tested against the commit callback.
 * The claim is about what a person does — clear the field, tab away — and the
 * buffered field and blur wiring sit between the rule and that.
 *
 * ⚠️ The field is BUFFERED: it commits on blur. Every case fires `blur` first.
 */

const MILESTONE: Milestone = { id: "m1", name: "Go-Live", targetDate: "2026-12-01" };

function renderPanel(name: string) {
  const onUpdateMilestone = vi.fn();
  render(
    <MilestonePanel
      milestones={[{ ...MILESTONE, name }]}
      activities={[]}
      milestoneBuffers={null}
      onAddMilestone={vi.fn()}
      onRemoveMilestone={vi.fn()}
      onUpdateMilestone={onUpdateMilestone}
      onAssignActivity={vi.fn()}
      onSetStartsAt={vi.fn()}
    />,
  );
  return {
    onUpdateMilestone,
    input: screen.getByLabelText("Milestone name") as HTMLInputElement,
  };
}

function editTo(input: HTMLInputElement, next: string) {
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: next } });
  fireEvent.blur(input);
}

afterEach(cleanup);

describe("MilestonePanel — milestone name commit", () => {
  it("refuses to clear an established name", () => {
    const { onUpdateMilestone, input } = renderPanel("Go-Live");

    editTo(input, "");

    expect(onUpdateMilestone).not.toHaveBeenCalled();
    // The buffer resyncs, so the field shows the stored name again rather than
    // sitting empty over a name that is still there.
    expect(input.value).toBe("Go-Live");
  });

  it("refuses a whitespace-only name", () => {
    const { onUpdateMilestone, input } = renderPanel("Go-Live");

    editTo(input, "   ");

    expect(onUpdateMilestone).not.toHaveBeenCalled();
    expect(input.value).toBe("Go-Live");
  });

  it("commits a real name — the control", () => {
    const { onUpdateMilestone, input } = renderPanel("Go-Live");

    editTo(input, "Launch");

    expect(onUpdateMilestone).toHaveBeenCalledWith("m1", { name: "Launch" });
  });

  it("trims what it commits, matching the add form beside it", () => {
    const { onUpdateMilestone, input } = renderPanel("Go-Live");

    editTo(input, "  Launch  ");

    expect(onUpdateMilestone).toHaveBeenCalledWith("m1", { name: "Launch" });
  });

  it("does not fire when trimming makes the value identical to the stored name", () => {
    const { onUpdateMilestone, input } = renderPanel("Go-Live");

    editTo(input, "  Go-Live  ");

    expect(onUpdateMilestone).not.toHaveBeenCalled();
  });

  it("keeps the placeholder on an unnamed milestone, and does not name it", () => {
    // Same rule as the activity grid: the input's value stays raw so its own
    // placeholder can render. `(unnamed)` is a display label elsewhere, never here.
    const { onUpdateMilestone, input } = renderPanel("");

    expect(input.value).toBe("");
    expect(input.placeholder).toBe("Milestone name");

    fireEvent.focus(input);
    fireEvent.blur(input);

    expect(onUpdateMilestone).not.toHaveBeenCalled();
    expect(input.value).toBe("");
  });

  it("lets an unnamed milestone be named", () => {
    const { onUpdateMilestone, input } = renderPanel("");

    editTo(input, "Go-Live");

    expect(onUpdateMilestone).toHaveBeenCalledWith("m1", { name: "Go-Live" });
  });
});
