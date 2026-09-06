// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { ActivityEditModal } from "./ActivityEditModal";
import { useProjectStore } from "@ui/hooks/use-project-store";
import type { Project } from "@domain/models/types";

/**
 * The empty-activity-name behaviour, corrected.
 *
 * ⚠️ A NOTE ON HOW THIS WAS GOT WRONG, because it is the campaign's own defect class.
 * The §3.3 Tier A work extracted `computeGeneralUpdates`, saw that it drops a name which
 * trims to empty, and concluded from that unit alone that "the user clears the field,
 * clicks Save, and the app silently discards the edit". **That was false.** `isValid`
 * already required a non-empty name and the Save button was already `disabled`. A
 * user-facing claim was inferred from a guard without checking the component above it.
 *
 * Measured with a real render, the two actual defects were:
 *   1. Save was correctly disabled, but NOTHING said why — no message, no invalid styling.
 *   2. Worse: `handleDismiss` only prompted when `hasChanges && isValid`. With an empty
 *      name the guard was suppressed by the very state that made saving impossible, so
 *      dismissing threw away EVERY edit — status, estimates, constraint, notes — with no
 *      prompt at all.
 *
 * Both are fixed; these tests pin the fixed behaviour, and they replace the earlier test
 * that pinned the unit in isolation.
 */

const baseProject = (): Project =>
  ({
    id: "p1",
    name: "P1",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    schemaVersion: 23,
    scenarios: [
      {
        id: "s1",
        name: "Baseline",
        startDate: "2026-04-06",
        activities: [
          {
            id: "a1",
            name: "Discovery",
            min: 3,
            mostLikely: 5,
            max: 10,
            confidenceLevel: "mediumConfidence",
            distributionType: "normal",
            status: "planned",
          },
        ],
        dependencies: [],
        milestones: [],
        settings: {
          defaultConfidenceLevel: "mediumConfidence",
          defaultDistributionType: "normal",
          trialCount: 10000,
          rngSeed: "s",
          probabilityTarget: 0.5,
          projectProbabilityTarget: 0.95,
        },
      },
    ],
  }) as unknown as Project;

const open = (onClose = vi.fn()) => {
  render(
    <ActivityEditModal
      activityId="a1"
      scenarioId="s1"
      projectId="p1"
      onClose={onClose}
      schedule={undefined}
    />,
  );
  return { onClose };
};

// ⚠️ Looked up by NAME attribute, not by display value. The first draft used
// getByDisplayValue("Discovery"), which stops matching the moment the field is cleared —
// the exact thing every test here does.
const nameInput = () =>
  document.querySelector('input[name="activityName"]') as HTMLInputElement;
const saveButton = () => screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
const statusSelect = () =>
  document.querySelector('select[name="activityStatus"]') as HTMLSelectElement;

const clearName = (input: HTMLInputElement) =>
  fireEvent.change(input, { target: { value: "   " } });

beforeEach(() => {
  useProjectStore.setState({ projects: [baseProject()] });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ActivityEditModal — an emptied activity name", () => {
  it("disables Save", () => {
    open();
    expect(saveButton().disabled).toBe(false);
    clearName(nameInput());
    expect(saveButton().disabled).toBe(true);
  });

  it("EXPLAINS why Save is disabled", () => {
    // The gap that made it feel like a silent discard: the button greyed out and gave no
    // reason. Storing a blank name was never an option — ActivitySchema requires
    // `name: z.string().min(1)` — so telling the user is the whole fix here.
    open();
    expect(screen.queryByText("Activity name is required.")).toBeNull();
    clearName(nameInput());
    expect(screen.getByText("Activity name is required.")).toBeTruthy();
  });

  it("marks the field invalid for assistive technology, not only visually", () => {
    open();
    clearName(nameInput());
    expect(nameInput().getAttribute("aria-invalid")).toBe("true");
    const describedBy = nameInput().getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)?.textContent).toBe(
      "Activity name is required.",
    );
  });

  it("clears the error once a name is typed back", () => {
    open();
    clearName(nameInput());
    fireEvent.change(nameInput(), { target: { value: "Renamed" } });

    expect(screen.queryByText("Activity name is required.")).toBeNull();
    expect(nameInput().getAttribute("aria-invalid")).toBe("false");
    expect(saveButton().disabled).toBe(false);
  });

  describe("dismissing with unsaved changes", () => {
    it("WARNS before discarding, instead of closing silently", () => {
      // The real defect. Previously `hasChanges && isValid` was false, so this fell
      // straight through to onClose() and every edit vanished without a prompt.
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
      const { onClose } = open();

      fireEvent.change(statusSelect(), { target: { value: "inProgress" } });
      clearName(nameInput());
      fireEvent.keyDown(document, { key: "Escape" });

      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(confirmSpy.mock.calls[0]![0]).toMatch(/needs a name/i);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("keeps the modal open when the user declines to discard", () => {
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
      const { onClose } = open();

      fireEvent.change(statusSelect(), { target: { value: "inProgress" } });
      clearName(nameInput());
      fireEvent.keyDown(document, { key: "Escape" });

      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(onClose).not.toHaveBeenCalled();
    });

    it("closes without any prompt when nothing was changed", () => {
      // An empty name alone is not a change — computeGeneralUpdates drops it — so there
      // is nothing to warn about.
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
      const { onClose } = open();

      clearName(nameInput());
      fireEvent.keyDown(document, { key: "Escape" });

      expect(confirmSpy).not.toHaveBeenCalled();
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("still offers to SAVE when the form is valid", () => {
      // The pre-existing path must be untouched by the new branch.
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
      open();

      fireEvent.change(statusSelect(), { target: { value: "inProgress" } });
      fireEvent.keyDown(document, { key: "Escape" });

      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(confirmSpy.mock.calls[0]![0]).toMatch(/unsaved changes/i);
    });
  });
});

/**
 * Handing off to the dependency dialog must NOT close this modal.
 *
 * The same defect class as the block above, found the same way — by a person using the
 * app, not by any metric. `handleDismiss` is the unsaved-changes guard, and it hangs off
 * `Dialog.Root onOpenChange`, so Escape and overlay clicks route through it. Both
 * dependency handoffs called the parent's `onClose()` DIRECTLY, which walks around the
 * guard entirely: ActivityEditModal unmounted and every draft in it — name, estimates,
 * constraint, description, checklist, deliverables, notes — was discarded with no prompt.
 * Reproduced against v0.64.0 in a browser before the fix.
 *
 * The dependency dialog now stacks on top instead. `onClose` NOT being called IS the
 * mechanism, so that is what these assert.
 *
 * ⚠️ Do not "strengthen" these by asserting the draft field still holds its value after
 * the click. RTL renders this component directly and `onClose` is a spy, so nothing
 * unmounts in the test either way — that assertion passes vacuously against the very
 * code it is supposed to catch. Ask the harness only what it can actually answer.
 */
describe("ActivityEditModal — handing off to the dependency dialog", () => {
  const projectWithDependency = (): Project => {
    const p = baseProject();
    const sc = p.scenarios[0]!;
    sc.activities.push({
      id: "a2",
      name: "Build",
      min: 4,
      mostLikely: 6,
      max: 12,
      confidenceLevel: "mediumConfidence",
      distributionType: "normal",
      status: "planned",
    } as unknown as (typeof sc.activities)[number]);
    sc.dependencies.push({
      fromActivityId: "a1",
      toActivityId: "a2",
      type: "FS",
      lagDays: 0,
    } as unknown as (typeof sc.dependencies)[number]);
    return p;
  };

  const openWithDeps = () => {
    const onClose = vi.fn();
    const onAddDependency = vi.fn();
    const onEditDependency = vi.fn();
    useProjectStore.setState({ projects: [projectWithDependency()] });
    render(
      <ActivityEditModal
        activityId="a1"
        scenarioId="s1"
        projectId="p1"
        onClose={onClose}
        schedule={undefined}
        dependencyMode
        onAddDependency={onAddDependency}
        onEditDependency={onEditDependency}
      />,
    );
    // The section is collapsed on mount (defaultOpen={false}); its controls do not exist
    // until it is opened, so this click is a precondition, not part of the behaviour.
    fireEvent.click(screen.getByRole("button", { name: "Dependencies" }));
    return { onClose, onAddDependency, onEditDependency };
  };

  it("renders the handoff controls once the section is expanded", () => {
    // Guards the two tests below from passing because the buttons were never there.
    openWithDeps();
    expect(screen.getByRole("button", { name: "+ Add Dependency" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy();
  });

  it("keeps the modal open when adding a dependency, with no prompt", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { onClose, onAddDependency } = openWithDeps();

    // An unsaved draft is what made the old behaviour destructive.
    fireEvent.change(statusSelect(), { target: { value: "inProgress" } });
    fireEvent.click(screen.getByRole("button", { name: "+ Add Dependency" }));

    expect(onAddDependency).toHaveBeenCalledWith("a1");
    expect(onClose).not.toHaveBeenCalled();
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("keeps the modal open when editing a dependency, with no prompt", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { onClose, onEditDependency } = openWithDeps();

    fireEvent.change(statusSelect(), { target: { value: "inProgress" } });
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(onEditDependency).toHaveBeenCalledWith("a1", "a2");
    expect(onClose).not.toHaveBeenCalled();
    expect(confirmSpy).not.toHaveBeenCalled();
  });
});

/**
 * Dismissal parity: the Cancel button must behave exactly as Escape does.
 *
 * Escape and overlay-click have routed through `handleDismiss` since v0.64.1, via
 * `Dialog.Root onOpenChange`. The Cancel button did not — it called the parent's
 * `onClose()` directly, which is the same call, on the same component, that the v0.64.1
 * incident was about: it walks around the unsaved-changes guard entirely. Escape was safe
 * and the button most users reach for was not, which is the asymmetry these pin.
 *
 * ⚠️ WHY THESE ASSERT ABSOLUTES AND NOT "Cancel matches Escape".
 * A parity test written as `cancelResult === escapeResult` is satisfiable by BOTH sides
 * being wrong together, and would have passed against the defect had the defect been in
 * `handleDismiss` instead of at the call site. Each gesture is therefore pinned against
 * fixed expected values — the literal prompt text, the `onClose` count, the store contents
 * — and the two gestures are run through the SAME expectations. The Escape rows are the
 * control: they passed before this fix and must keep passing, so a failure confined to the
 * Cancel rows localises the defect to the call site rather than to these assertions.
 *
 * ⚠️ DO NOT add "the draft field still holds its value" here. RTL renders this component
 * directly and `onClose` is a spy, so nothing unmounts on dismissal either way — that
 * assertion passes vacuously against the very code it would be meant to catch. It is the
 * same trap already recorded in the dependency-handoff block above. Draft survival was
 * verified in a browser instead, where the modal really does unmount.
 */
describe("ActivityEditModal — Escape and Cancel are indistinguishable", () => {
  const storedStatus = () =>
    useProjectStore.getState().projects[0]!.scenarios[0]!.activities[0]!.status;
  const storedName = () =>
    useProjectStore.getState().projects[0]!.scenarios[0]!.activities[0]!.name;

  const dismissals = [
    { label: "Escape", dismiss: () => fireEvent.keyDown(document, { key: "Escape" }) },
    {
      label: "the Cancel button",
      dismiss: () => fireEvent.click(screen.getByRole("button", { name: "Cancel" })),
    },
  ];

  // ⚠️ Positive control for the store read-back, and it runs FIRST on purpose.
  // Every "the grid is unchanged" assertion below is a leave-alone, and a leave-alone is
  // worthless unless the same instrument has been shown to register a change. If this test
  // fails, `storedStatus()` is reading something the modal never writes to and the
  // unchanged-assertions are all passing for the wrong reason.
  it("PRECONDITION: the store read-back can observe a save landing", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    open();

    expect(storedStatus()).toBe("planned");
    fireEvent.change(statusSelect(), { target: { value: "inProgress" } });
    fireEvent.keyDown(document, { key: "Escape" });

    expect(storedStatus()).toBe("inProgress");
  });

  for (const { label, dismiss } of dismissals) {
    describe(`dismissing with ${label}`, () => {
      it("offers to save a valid draft, and saving closes the modal", () => {
        const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
        const { onClose } = open();

        fireEvent.change(statusSelect(), { target: { value: "inProgress" } });
        dismiss();

        expect(confirmSpy).toHaveBeenCalledTimes(1);
        expect(confirmSpy.mock.calls[0]![0]).toBe("You have unsaved changes. Save them?");
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(storedStatus()).toBe("inProgress");
      });

      it("returns to the modal, and writes nothing, when the save offer is declined", () => {
        const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
        const { onClose } = open();

        fireEvent.change(statusSelect(), { target: { value: "inProgress" } });
        dismiss();

        expect(confirmSpy).toHaveBeenCalledTimes(1);
        expect(onClose).not.toHaveBeenCalled();
        expect(storedStatus()).toBe("planned");
      });

      it("warns before discarding a draft that cannot be saved", () => {
        const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
        const { onClose } = open();

        fireEvent.change(statusSelect(), { target: { value: "inProgress" } });
        clearName(nameInput());
        dismiss();

        expect(confirmSpy).toHaveBeenCalledTimes(1);
        expect(confirmSpy.mock.calls[0]![0]).toBe(
          "This activity needs a name, so your changes can't be saved. Discard them?",
        );
        expect(onClose).toHaveBeenCalledTimes(1);
        // Discarding closes with the grid untouched — neither the edited field nor the
        // cleared name reaches the store.
        expect(storedStatus()).toBe("planned");
        expect(storedName()).toBe("Discovery");
      });

      it("stays put when the discard warning is declined", () => {
        const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
        const { onClose } = open();

        fireEvent.change(statusSelect(), { target: { value: "inProgress" } });
        clearName(nameInput());
        dismiss();

        expect(confirmSpy).toHaveBeenCalledTimes(1);
        expect(onClose).not.toHaveBeenCalled();
        expect(storedStatus()).toBe("planned");
      });

      // ⚠️ This row CANNOT discriminate the defect and is not claimed to. With no changes
      // `handleDismiss` reduces to a bare `onClose()`, so routing through it and calling it
      // directly are identical by construction. It is here because it is the common case and
      // must not regress — not as evidence that the fix works.
      it("closes with no prompt at all when nothing was changed", () => {
        const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
        const { onClose } = open();

        dismiss();

        expect(confirmSpy).not.toHaveBeenCalled();
        expect(onClose).toHaveBeenCalledTimes(1);
      });
    });
  }
});
