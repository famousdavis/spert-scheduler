// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { AiActivityFeed } from "./AiActivityFeed";
import type { AiOp, AiOpOutcome } from "@app/api/ai-batch-service";

/**
 * WI-150 release C (Review 37, G2) — the feed's progress lines name each skipped activity, and WRAP at
 * the Connect AI panel's width (400 px) instead of pushing the label to nothing and scrolling
 * sideways. jsdom lays nothing out, so the wrapping is pinned by its classes here and measured in the
 * browser for the release's pictures: the outcome may shrink and wrap (`min-w-0`, never `shrink-0`),
 * and the label keeps its width (`shrink-0`, never `truncate`).
 */
afterEach(() => cleanup());

const op = { seq: 1, op: "bulk_set_activity_progress", payload: { updates: [] } } as unknown as AiOp;
const partial: AiOpOutcome = {
  status: "partial",
  appliedCount: 1,
  skippedItems: [
    { index: 1, id: "d", name: "Deploy", reason: "date_after_today" },
    { index: 2, id: "g", name: "Design", reason: "already_started" },
  ],
};

describe("the feed's progress line", () => {
  it("names each skipped activity with its reason", () => {
    render(<AiActivityFeed items={[{ feedId: 1, result: { op, outcome: partial } }]} />);
    const row = within(screen.getByRole("list", { name: "AI activity feed" })).getByRole("listitem");
    expect(row.textContent).toBe(
      "Record progress1 applied · 2 skipped: Deploy (date after today), Design (already started: only you can set it back to Planned)",
    );
  });

  it("wraps the outcome at the panel's width, and keeps the label whole", () => {
    render(<AiActivityFeed items={[{ feedId: 1, result: { op, outcome: partial } }]} />);
    const [label, outcome] = Array.from(screen.getByRole("listitem").children) as HTMLElement[];
    expect(label!.textContent).toBe("Record progress");
    expect(label!.classList.contains("shrink-0")).toBe(true);
    expect(label!.classList.contains("truncate")).toBe(false);
    expect(outcome!.classList.contains("min-w-0")).toBe(true);
    expect(outcome!.classList.contains("shrink-0")).toBe(false);
  });
});
