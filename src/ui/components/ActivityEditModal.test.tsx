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
