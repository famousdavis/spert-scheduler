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
 * Cancel discards. Escape asks. The asymmetry IS the requirement.
 *
 * Owner ruling, v0.67.5: "If I click Cancel on the edit modal, no changes should be saved and
 * the edit modal should close. That's it." Cancel is an explicit, deliberate discard — you
 * clicked the control that means abandon. Escape and a stray click on the overlay can be
 * accidental, so those keep the unsaved-changes prompt via Dialog.Root onOpenChange.
 *
 * ⚠️ THIS FILE PREVIOUSLY ASSERTED THE OPPOSITE, UNDER THE TITLE "Escape and Cancel are
 * indistinguishable". v0.67.3 routed Cancel through handleDismiss for parity; the owner rejected
 * it the same day because it removed the ONLY way to abandon a valid change — the prompt's two
 * answers are save and keep-editing, and neither discards. Before v0.67.3 Cancel had been a plain
 * onClose() discard continuously since v0.29.1.
 *
 * ⚠️ Do not restore "parity" on the v0.64.1 argument. That incident was never about the Cancel
 * button — the button region's line history runs v0.29.1 → v0.67.3, with no v0.64.1 commit in it.
 * v0.64.1 fixed handleDismiss's invalid-name branch, which Escape and overlay-click still reach
 * and which the Escape rows below still pin, unchanged.
 *
 * ⚠️ The rows are deliberately NOT a shared loop any more. A loop running identical expectations
 * through both gestures is what the previous version was, and it cannot express a requirement in
 * which the two gestures differ. Only the nothing-changed case is genuinely shared, and it is the
 * one row that CANNOT discriminate the two — marked as such at its site rather than counted.
 *
 * ⚠️ Draft survival on a declined prompt is not asserted here. RTL renders this component directly
 * and `onClose` is a spy, so nothing unmounts either way and the assertion would pass vacuously
 * against the very code it targets. It was watched in a browser instead.
 */
describe("ActivityEditModal — dismissing the modal", () => {
  const storedStatus = () =>
    useProjectStore.getState().projects[0]!.scenarios[0]!.activities[0]!.status;
  const storedName = () =>
    useProjectStore.getState().projects[0]!.scenarios[0]!.activities[0]!.name;

  const clickCancel = () =>
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  const pressEscape = () => fireEvent.keyDown(document, { key: "Escape" });

  // ⚠️ Positive control for the store read-back, FIRST on purpose. Every "the store is unchanged"
  // assertion below is a leave-alone, and a leave-alone proves nothing unless the same instrument
  // has been shown to register a change. If this fails, `storedStatus()` is reading something the
  // modal never writes to and the unchanged-assertions are all passing for the wrong reason.
  it("PRECONDITION: the store read-back can observe a save landing", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    open();

    expect(storedStatus()).toBe("planned");
    fireEvent.change(statusSelect(), { target: { value: "inProgress" } });
    pressEscape();

    expect(storedStatus()).toBe("inProgress");
  });

  describe("the Cancel button discards, without asking", () => {
    it("throws away a valid draft and closes, with no prompt", () => {
      // The capability v0.67.3 removed: abandoning a change you decided against.
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
      const { onClose } = open();

      fireEvent.change(statusSelect(), { target: { value: "inProgress" } });
      clickCancel();

      expect(confirmSpy).not.toHaveBeenCalled();
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(storedStatus()).toBe("planned"); // discarded, not saved
    });

    it("throws away a draft that cannot be saved, and closes, with no prompt", () => {
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
      const { onClose } = open();

      fireEvent.change(statusSelect(), { target: { value: "inProgress" } });
      clearName(nameInput());
      clickCancel();

      expect(confirmSpy).not.toHaveBeenCalled();
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(storedStatus()).toBe("planned");
      expect(storedName()).toBe("Discovery");
    });
  });

  // ⚠️ These four are the CONTROL for the revert and are carried over unedited. They passed before
  // it and must pass after: the revert is scoped to the Cancel button, and a red row here would
  // mean it reached further than intended, not that the row is wrong.
  describe("Escape still asks", () => {
    it("offers to save a valid draft, and saving closes the modal", () => {
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
      const { onClose } = open();

      fireEvent.change(statusSelect(), { target: { value: "inProgress" } });
      pressEscape();

      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(confirmSpy.mock.calls[0]![0]).toBe("You have unsaved changes. Save them?");
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(storedStatus()).toBe("inProgress");
    });

    it("returns to the modal, and writes nothing, when the save offer is declined", () => {
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
      const { onClose } = open();

      fireEvent.change(statusSelect(), { target: { value: "inProgress" } });
      pressEscape();

      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(onClose).not.toHaveBeenCalled();
      expect(storedStatus()).toBe("planned");
    });

    it("warns before discarding a draft that cannot be saved", () => {
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
      const { onClose } = open();

      fireEvent.change(statusSelect(), { target: { value: "inProgress" } });
      clearName(nameInput());
      pressEscape();

      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(confirmSpy.mock.calls[0]![0]).toBe(
        "This activity needs a name, so your changes can't be saved. Discard them?",
      );
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(storedStatus()).toBe("planned");
      expect(storedName()).toBe("Discovery");
    });

    it("stays put when the discard warning is declined", () => {
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
      const { onClose } = open();

      fireEvent.change(statusSelect(), { target: { value: "inProgress" } });
      clearName(nameInput());
      pressEscape();

      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(onClose).not.toHaveBeenCalled();
      expect(storedStatus()).toBe("planned");
    });
  });

  // ⚠️ The only genuinely shared case — and it CANNOT discriminate the two gestures, by
  // construction: with no changes handleDismiss reduces to a bare onClose(), so routing through it
  // and calling it directly are identical. Here because it is the common path and must not
  // regress, NOT as evidence that Cancel discards.
  describe("with nothing changed, both just close", () => {
    for (const [label, dismiss] of [
      ["the Cancel button", clickCancel],
      ["Escape", pressEscape],
    ] as const) {
      it(`${label} closes with no prompt at all`, () => {
        const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
        const { onClose } = open();

        dismiss();

        expect(confirmSpy).not.toHaveBeenCalled();
        expect(onClose).toHaveBeenCalledTimes(1);
      });
    }
  });
});
