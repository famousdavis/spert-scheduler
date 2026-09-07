// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * The bulk-apply heuristic-recalculation question, migrated off `window.confirm()` in WI-6c
 * (v0.67.11) — the ninth-site cohort's one member that is NOT an abort.
 *
 * ⚠️ WHY THIS SITE IS DIFFERENT FROM WI-6b's FIVE, AND WHY THAT IS WHAT THESE TESTS PIN.
 * Cancel here does not abort anything: it means "apply the distribution, but leave min/max
 * alone". `onApply` runs on BOTH answers. A dialog whose Cancel merely closed would silently
 * throw away the entire bulk apply — so the headline guard is not "does Cancel abort" but
 * **`onApply` fires EXACTLY ONCE on every one of the four outcomes**, carrying the right
 * `recalculateHeuristic`.
 *
 * That property is true BY CONSTRUCTION once the site awaits a promise, because a promise
 * settles once. It is pinned anyway: the construction is the thing that could be replaced.
 *
 * ⚠️ THE FOCUS HALF MOUNTS THE GRID, not the toolbar, and that is not incidental. Both
 * answers destroy the opener — `handleBulkApply` ends in an unconditional `clearSelection()`
 * and the toolbar renders under `{hasSelection && …}` — so the Apply button is detached by
 * the time `ConfirmDialog`'s captured-`activeElement` restore reaches it, and focus falls to
 * `<body>`. The destination (the header's select-all checkbox) is knowledge only the grid
 * has, which is why the tail lives there and why these assertions need the real grid.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { useState } from "react";
import type { Activity } from "@domain/models/types";
import { createScenario, createActivity } from "@app/api/project-service";
import { useConfirmStore } from "@ui/hooks/use-confirm-store";
import { BulkActionToolbar } from "./BulkActionToolbar";
import type { BulkApplyPayload } from "./BulkActionToolbar";
import { UnifiedActivityGrid } from "./UnifiedActivityGrid";
import { ConfirmHost } from "./ConfirmHost";

// ⚠️ The confirm store is a module singleton: a question left pending by one test is still
// showing in the next one. Same reset `ConfirmHost.test.tsx` and the WI-6b tests open with.
beforeEach(() => useConfirmStore.setState({ pending: null }));
afterEach(cleanup);

const settings = createScenario("S", "2026-09-07").settings;

const QUESTION = "Recalculate min/max for 2 selected activities?";
const RECALCULATE = "Recalculate";
const KEEP = "Keep current min/max";

// -- part A: the four outcomes, at the toolbar ---------------------------------

function renderToolbar(
  onApply: (staged: BulkApplyPayload) => void,
  overrides: { heuristicEnabled?: boolean } = {},
) {
  return render(
    <>
      <BulkActionToolbar
        selectedCount={2}
        onApply={onApply}
        onBulkDelete={vi.fn()}
        onClearSelection={vi.fn()}
        heuristicEnabled={overrides.heuristicEnabled ?? true}
        heuristicMinPercent={75}
        heuristicMaxPercent={200}
      />
      <ConfirmHost />
    </>,
  );
}

function stageDistribution() {
  fireEvent.change(screen.getByLabelText("Set distribution for selected activities"), {
    target: { value: "triangular" },
  });
}

/**
 * Stage a distribution, press Apply, and hand back the open question.
 *
 * ⚠️ Asserts the fixture's own premise before the behaviour: the dialog is really showing,
 * and `onApply` has NOT run yet. Without the second assertion an "exactly once" test would
 * pass just as well against a site that applied first and asked afterwards.
 */
async function askTheQuestion(onApply: ReturnType<typeof vi.fn>) {
  stageDistribution();
  fireEvent.click(screen.getByRole("button", { name: "Apply" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText(QUESTION)).toBeTruthy();
  expect(onApply).not.toHaveBeenCalled();
  return dialog;
}

/** Past the close and past any deferred restore, then look. */
async function settle() {
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await new Promise((r) => setTimeout(r, 5));
}

describe("WI-6c — the four outcomes — PREDICTION: onApply fires exactly once on each", () => {
  it("Recalculate → one apply, recalculateHeuristic true", async () => {
    const onApply = vi.fn();
    renderToolbar(onApply);
    const dialog = await askTheQuestion(onApply);

    fireEvent.click(within(dialog).getByRole("button", { name: RECALCULATE }));
    await settle();

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0]![0]).toMatchObject({
      distributionType: "triangular",
      recalculateHeuristic: true,
    });
  });

  it("Keep current min/max → one apply, recalculateHeuristic false — the apply is NOT aborted", async () => {
    const onApply = vi.fn();
    renderToolbar(onApply);
    const dialog = await askTheQuestion(onApply);

    fireEvent.click(within(dialog).getByRole("button", { name: KEEP }));
    await settle();

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0]![0]).toMatchObject({
      distributionType: "triangular",
      recalculateHeuristic: false,
    });
  });

  it("Escape → one apply, recalculateHeuristic false", async () => {
    const onApply = vi.fn();
    renderToolbar(onApply);
    const dialog = await askTheQuestion(onApply);

    fireEvent.keyDown(dialog, { key: "Escape" });
    await settle();

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0]![0]).toMatchObject({ recalculateHeuristic: false });
  });

  it("the confirm button is NOT styled as a destruction — nothing here is destroyed", async () => {
    // ⚠️ `destructive: false` is a CHOICE at this site, not an omission, and it is the one
    // difference from WI-6b's five that no other assertion here would catch. A migrator
    // copying that idiom would land `destructive: true` and turn "Recalculate" red, and every
    // outcome test above would still pass. Pinned so the choice has to be made again on purpose.
    const onApply = vi.fn();
    renderToolbar(onApply);
    const dialog = await askTheQuestion(onApply);

    const button = within(dialog).getByRole("button", { name: RECALCULATE });
    expect(button.className).toContain("bg-blue-600");
    expect(button.className).not.toContain("bg-red-600");
  });

  it("pointer-down outside → one apply, recalculateHeuristic false", async () => {
    const onApply = vi.fn();
    renderToolbar(onApply);
    await askTheQuestion(onApply);

    fireEvent.pointerDown(document.body);
    await settle();

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0]![0]).toMatchObject({ recalculateHeuristic: false });
  });
});

describe("WI-6c — the no-dialog paths — PREDICTION: unchanged, and they PASS before this item too", () => {
  // ⚠️ Declared at zero falsifications on purpose. These two do not fail against the
  // pre-WI-6c tree — they are regression guards on the paths the migration must not break
  // (the `confirm()` was always gated on `stagedDistribution && heuristicEnabled`), not
  // evidence that anything changed. Saying so beats implying they were falsified.

  it("heuristics off: no question, and the apply still runs", async () => {
    const onApply = vi.fn();
    renderToolbar(onApply, { heuristicEnabled: false });

    stageDistribution();
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await new Promise((r) => setTimeout(r, 5));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0]![0]).not.toHaveProperty("recalculateHeuristic");
  });

  it("no distribution staged: no question, and the apply still runs", async () => {
    const onApply = vi.fn();
    renderToolbar(onApply);

    fireEvent.change(screen.getByLabelText("Set confidence level for selected activities"), {
      target: { value: "highConfidence" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await new Promise((r) => setTimeout(r, 5));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0]![0]).toMatchObject({ confidenceLevel: "highConfidence" });
  });
});

// -- part B: the focus destination, in the real grid ---------------------------

function makeActivities(...names: string[]): Activity[] {
  return names.map((n) => createActivity(n, settings));
}

function GridHarness({ initial }: { initial: Activity[] }) {
  const [activities, setActivities] = useState(initial);
  const apply = (ids: string[], updates: Partial<Activity>) =>
    setActivities((prev) => prev.map((a) => (ids.includes(a.id) ? { ...a, ...updates } : a)));
  return (
    <>
      <UnifiedActivityGrid
        activities={activities}
        bands={[]}
        scheduledActivities={[]}
        activityProbabilityTarget={0.5}
        onUpdate={(id, updates) => apply([id], updates)}
        onDelete={vi.fn()}
        onAdd={vi.fn()}
        onAddBand={vi.fn()}
        onDeleteBand={vi.fn()}
        onUpdateBand={vi.fn()}
        onReorderWithBands={vi.fn()}
        onValidityChange={vi.fn()}
        onBulkUpdate={apply}
        heuristicEnabled
        heuristicMinPercent={75}
        heuristicMaxPercent={200}
        dependencyMode={false}
        activityNumberMap={null}
      />
      <ConfirmHost />
    </>
  );
}

function selectAllBox() {
  return screen.getByLabelText("Select all activities");
}

/** Select every activity, which is what makes the toolbar exist at all. */
function selectEverything() {
  fireEvent.click(selectAllBox());
  return screen.getByRole("button", { name: "Apply" });
}

describe("WI-6c — focus after the toolbar unmounts — PREDICTION: select-all on BOTH branches, <body> today", () => {
  it("Recalculate: focus lands on the select-all checkbox, not <body>", async () => {
    render(<GridHarness initial={makeActivities("Design", "Build")} />);
    selectEverything();
    stageDistribution();
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: RECALCULATE }));
    await settle();

    expect(document.activeElement).toBe(selectAllBox());
  });

  it("Keep current min/max: focus lands there too — the dismissal destroys the opener as well", async () => {
    render(<GridHarness initial={makeActivities("Design", "Build")} />);
    selectEverything();
    stageDistribution();
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: KEEP }));
    await settle();

    expect(document.activeElement).toBe(selectAllBox());
  });

  it("the no-dialog apply also leaves focus somewhere, and <body> is what it leaves it on today", async () => {
    // ⚠️ This is the clean falsification of the three. The other two cannot even reach their
    // assertion against the pre-WI-6c tree (there is no dialog to answer); this one runs the
    // whole path unchanged and fails purely on the destination.
    render(<GridHarness initial={makeActivities("Design", "Build")} />);
    selectEverything();
    fireEvent.change(screen.getByLabelText("Set confidence level for selected activities"), {
      target: { value: "highConfidence" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await new Promise((r) => setTimeout(r, 5));

    expect(screen.queryByRole("button", { name: "Apply" })).toBeNull(); // the toolbar really unmounted
    expect(document.activeElement).toBe(selectAllBox());
  });
});
