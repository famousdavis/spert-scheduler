// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * The grid's two delete confirmations, migrated off `window.confirm()` in WI-6b (v0.67.9).
 *
 * ⚠️ WHY THESE LIVE IN THE GRID AND NOT IN `UnifiedActivityRow`. Both confirmations owe a
 * focus destination that only the grid can name — the deleted row's successor, and the
 * header checkbox that outlives the toolbar. Neither opener survives its own confirmed
 * action, so `ConfirmDialog`'s captured-`activeElement` restore reaches a detached node and
 * focus falls to `<body>`. **`<body>` was the shipped behaviour at both sites before this
 * release; these are the guards that fail against it.**
 *
 * ⚠️ THE HARNESS REALLY DELETES. `onDelete`/`onBulkDelete` mutate the harness's own state
 * rather than being bare `vi.fn()`s, because a mock leaves the row mounted — and a focus
 * assertion against a row that never unmounted would pass without the successor ever
 * having had to be found. The mock is the vacuous version of this test.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { useState } from "react";
import type { Activity } from "@domain/models/types";
import { createScenario, createActivity } from "@app/api/project-service";
import { useConfirmStore } from "@ui/hooks/use-confirm-store";
import { UnifiedActivityGrid } from "./UnifiedActivityGrid";
import { ConfirmHost } from "./ConfirmHost";

// ⚠️ The confirm store is a module singleton: a question left pending by one test is still
// showing in the next one. Same reset `ConfirmHost.test.tsx` opens with.
beforeEach(() => useConfirmStore.setState({ pending: null }));
afterEach(cleanup);

const settings = createScenario("S", "2026-09-07").settings;

function makeActivities(...names: string[]): Activity[] {
  return names.map((n) => createActivity(n, settings));
}

function Harness({
  initial,
  deleted,
  withBulkHandler = true,
}: {
  initial: Activity[];
  deleted: (ids: string[]) => void;
  withBulkHandler?: boolean;
}) {
  const [activities, setActivities] = useState(initial);
  const remove = (ids: string[]) => {
    setActivities((prev) => prev.filter((a) => !ids.includes(a.id)));
    deleted(ids);
  };
  return (
    <>
      <UnifiedActivityGrid
        activities={activities}
        bands={[]}
        scheduledActivities={[]}
        activityProbabilityTarget={0.5}
        onUpdate={vi.fn()}
        onDelete={(id) => remove([id])}
        onAdd={vi.fn()}
        onAddBand={vi.fn()}
        onDeleteBand={vi.fn()}
        onUpdateBand={vi.fn()}
        onReorderWithBands={vi.fn()}
        onValidityChange={vi.fn()}
        onBulkDelete={withBulkHandler ? (ids) => remove(ids) : undefined}
        dependencyMode={false}
        activityNumberMap={null}
      />
      <ConfirmHost />
    </>
  );
}

/** The dialog's own Confirm button. Scoped: the bulk toolbar's button reads "Delete" too. */
async function confirmInDialog(label: string) {
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: label }));
}

/**
 * Past the close, past Radix's deferred restore, then look.
 *
 * Matches `ConfirmDialog.test.tsx` P7's settle, because these call sites use the same
 * mechanism P7 measured: `queueMicrotask`, not `requestAnimationFrame`.
 *
 * ⚠️ rAF WAS TRIED FIRST AND IS WRONG HERE, in two independent ways worth keeping. In jsdom
 * a frame does not run for ~16 ms (probed: not fired at 5 ms, fired by 45 ms), so all three
 * focus assertions below failed against a correct implementation. And in Chromium a
 * non-painting tab runs no frame callbacks AT ALL — under automation the rAF simply never
 * fired, and `document.activeElement === <body>` is indistinguishable from a real bug.
 * A microtask has neither problem, and a browser probe confirmed the store write has already
 * committed by the time it runs.
 *
 * ⚠️ Deliberately NOT `waitFor(() => expect(activeElement).toBe(x))`: polling would also pass
 * if focus landed and was then stolen back. This settles once, then asserts once.
 *
 * ⚠️ The 5 ms is NOT load-bearing and this comment will not pretend it is: deleting it leaves
 * all seven green (measured), because `waitFor` above has already yielded past the microtask.
 * It is kept for symmetry with P7 and as headroom if a call site ever defers further.
 */
async function settleFocus() {
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await new Promise((r) => setTimeout(r, 5));
}

function nameFieldOf(activity: Activity) {
  return document.querySelector(`[data-row-id="${activity.id}"][data-field="name"]`);
}

// -- site 1: the per-row ✕ ----------------------------------------------------

describe("site 1 — the row's ✕ — PREDICTION: it asks, and saying no is a true no-op", () => {
  it("asks before deleting, and nothing is deleted while the question is showing", async () => {
    const deleted = vi.fn();
    const [a, b] = makeActivities("Design", "Build");
    render(<Harness initial={[a!, b!]} deleted={deleted} />);

    fireEvent.click(screen.getAllByRole("button", { name: "Delete activity" })[0]!);

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Delete this activity?")).toBeTruthy();
    expect(deleted).not.toHaveBeenCalled();
  });

  it("dismissing leaves the activity exactly where it was", async () => {
    const deleted = vi.fn();
    const [a, b] = makeActivities("Design", "Build");
    render(<Harness initial={[a!, b!]} deleted={deleted} />);

    fireEvent.click(screen.getAllByRole("button", { name: "Delete activity" })[0]!);
    await confirmInDialog("Cancel");

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(deleted).not.toHaveBeenCalled();
    expect(nameFieldOf(a!)).not.toBeNull();
  });

  it("confirming deletes it and focus lands on the NEXT row's Name field, not <body>", async () => {
    const deleted = vi.fn();
    const [a, b] = makeActivities("Design", "Build");
    render(<Harness initial={[a!, b!]} deleted={deleted} />);

    fireEvent.click(screen.getAllByRole("button", { name: "Delete activity" })[0]!);
    await confirmInDialog("Delete");
    await settleFocus();

    expect(deleted).toHaveBeenCalledWith([a!.id]);
    await waitFor(() => expect(nameFieldOf(a!)).toBeNull()); // self-check: it really went
    expect(document.activeElement).toBe(nameFieldOf(b!));
  });

  it("deleting the LAST row falls back to the add-activity button", async () => {
    const deleted = vi.fn();
    const [a, b] = makeActivities("Design", "Build");
    render(<Harness initial={[a!, b!]} deleted={deleted} />);

    fireEvent.click(screen.getAllByRole("button", { name: "Delete activity" })[1]!);
    await confirmInDialog("Delete");
    await settleFocus();

    expect(deleted).toHaveBeenCalledWith([b!.id]);
    expect(document.activeElement).toBe(
      document.querySelector('[data-field="add-activity"]'),
    );
  });
});

// -- site 2: the bulk toolbar -------------------------------------------------

describe("site 2 — bulk delete — PREDICTION: dismissal preserves the SELECTION too", () => {
  function selectTwo(a: Activity, b: Activity) {
    fireEvent.click(screen.getByRole("checkbox", { name: `Select activity ${a.name}` }));
    fireEvent.click(screen.getByRole("checkbox", { name: `Select activity ${b.name}` }));
  }

  it("dismissing keeps both the activities AND the selection that opened the question", async () => {
    const deleted = vi.fn();
    const [a, b] = makeActivities("Design", "Build");
    render(<Harness initial={[a!, b!]} deleted={deleted} />);

    selectTwo(a!, b!);
    expect(screen.getByText("2 selected")).toBeTruthy(); // self-check: the toolbar is up
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await confirmInDialog("Cancel");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    expect(deleted).not.toHaveBeenCalled();
    // ⚠️ THE ASSERTION THIS FILE EXISTS FOR. `clearSelection()` sits below the guard; the
    // natural place to put it — an onOpenChange handler — would empty the selection on a
    // "no", which is a change nobody asked for.
    expect(screen.getByText("2 selected")).toBeTruthy();
  });

  it("confirming deletes them and focus lands on Select all activities, not <body>", async () => {
    const deleted = vi.fn();
    const [a, b] = makeActivities("Design", "Build");
    render(<Harness initial={[a!, b!]} deleted={deleted} />);

    selectTwo(a!, b!);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await confirmInDialog("Delete");
    await settleFocus();

    expect(deleted).toHaveBeenCalledWith([a!.id, b!.id]);
    expect(screen.queryByText("2 selected")).toBeNull(); // self-check: selection cleared
    expect(document.activeElement).toBe(
      screen.getByRole("checkbox", { name: "Select all activities" }),
    );
  });

  it("the question counts what is selected — one activity reads singular", async () => {
    const deleted = vi.fn();
    const [a, b] = makeActivities("Design", "Build");
    render(<Harness initial={[a!, b!]} deleted={deleted} />);

    fireEvent.click(screen.getByRole("checkbox", { name: `Select activity ${a!.name}` }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Delete 1 selected activity?")).toBeTruthy();
  });
});
