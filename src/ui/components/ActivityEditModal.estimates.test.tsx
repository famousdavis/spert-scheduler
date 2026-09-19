// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * The Edit Activity dialog's estimates (WI-49, v0.69.0).
 *
 * The owner's rulings (2026-09-17): the dialog SAVES an out-of-order estimate and the grid flags
 * it — with an advisory line that warns before Save — and the Estimates section opens by itself
 * only when the SAVED estimates are flagged. The LogNormal-at-zero state is treated the same
 * (R206.3). A NEGATIVE estimate is different: it is refused, because the next load would reject
 * the whole project (R206.2), and the reason is said on screen, as the empty-name case is.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

import { ActivityEditModal } from "./ActivityEditModal";
import { ConfirmHost } from "./ConfirmHost";
import { useConfirmStore } from "@ui/hooks/use-confirm-store";
import { useProjectStore } from "@ui/hooks/use-project-store";
import { createActivity, createProject, createScenario } from "@app/api/project-service";
import type { Activity, Project } from "@domain/models/types";

function projectWith(patch: Partial<Activity>): { project: Project; aid: string; sid: string } {
  const scenario = createScenario("Baseline", "2026-04-06");
  const activity: Activity = { ...createActivity("Heron culvert", scenario.settings), ...patch };
  const project = createProject("Dunlin Weir", "2026-04-06");
  return { project: { ...project, scenarios: [{ ...scenario, activities: [activity] }] }, aid: activity.id, sid: scenario.id };
}

function open(patch: Partial<Activity>) {
  const { project, aid, sid } = projectWith(patch);
  useProjectStore.setState({ projects: [project], loadError: false });
  const onClose = vi.fn();
  render(
    <>
      <ActivityEditModal activityId={aid} scenarioId={sid} projectId={project.id} onClose={onClose} schedule={undefined} />
      <ConfirmHost />
    </>
  );
  const saved = () => useProjectStore.getState().getProject(project.id)!.scenarios[0]!.activities[0]!;
  return { onClose, saved };
}

const minInput = () => screen.queryByLabelText<HTMLInputElement>("Min");
const mlInput = () => screen.getByLabelText<HTMLInputElement>("ML");
const maxInput = () => screen.getByLabelText<HTMLInputElement>("Max");
const saveButton = () => screen.getByRole<HTMLButtonElement>("button", { name: "Save" });
const expandEstimates = () => fireEvent.click(screen.getByRole("button", { name: "Estimates" }));

/** The element an input's aria-describedby names, by its text. */
function describedText(input: HTMLElement): string {
  const id = input.getAttribute("aria-describedby");
  expect(id).toBeTruthy();
  return document.getElementById(id!)?.textContent ?? "";
}

beforeEach(() => {
  localStorage.clear();
  useConfirmStore.setState({ pending: null });
  useProjectStore.setState({ projects: [], loadError: false, undoStack: [], redoStack: [] });
});

describe("Estimates opens by itself only for a SAVED flagged estimate", () => {
  it.each([
    ["out of order", { min: 14, mostLikely: 13, max: 22 }],
    ["LogNormal at zero", { min: 0, mostLikely: 0, max: 0, distributionType: "logNormal" as const }],
  ])("%s: the section is open at mount", (_label, patch) => {
    open(patch);
    expect(minInput()).not.toBeNull();
  });

  it("CONTROL: a valid saved estimate leaves the section collapsed (M18's default)", () => {
    open({ min: 9, mostLikely: 13, max: 22 });
    expect(minInput()).toBeNull();
  });
});

describe("an out-of-order draft is advised, not refused", () => {
  it("names the problem on the field, keeps Save enabled, and saves the numbers as typed", () => {
    const { onClose, saved } = open({ min: 9, mostLikely: 13, max: 22 });
    expandEstimates();
    fireEvent.change(maxInput(), { target: { value: "10" } }); // ML 13 > Max 10

    expect(mlInput()).toHaveAttribute("aria-invalid", "true");
    expect(describedText(mlInput())).toContain("Most Likely must be <= Max");
    expect(describedText(mlInput())).toContain("If you save it like this, Run stays off until it is fixed.");
    expect(minInput()).not.toHaveAttribute("aria-invalid");
    expect(saveButton().disabled).toBe(false);

    fireEvent.click(saveButton());
    expect(saved()).toMatchObject({ min: 9, mostLikely: 13, max: 10 });
    expect(onClose).toHaveBeenCalled();
  });

  it("advises a LogNormal estimate at zero on Max", () => {
    open({ min: 1, mostLikely: 2, max: 3, distributionType: "logNormal" });
    expandEstimates();
    for (const input of [minInput()!, mlInput(), maxInput()]) {
      fireEvent.change(input, { target: { value: "0" } });
    }
    expect(maxInput()).toHaveAttribute("aria-invalid", "true");
    expect(describedText(maxInput())).toContain("A LogNormal activity needs an estimate above zero");
    expect(saveButton().disabled).toBe(false);
  });

  it("says nothing while a draft is blank — a half-typed triple is not judged", () => {
    open({ min: 9, mostLikely: 13, max: 22 });
    expandEstimates();
    fireEvent.change(maxInput(), { target: { value: "" } });
    // By its text: `role="status"` also matches the Confidence dash, an <output>.
    expect(screen.queryByText(/If you save it like this/)).toBeNull();
    expect(maxInput()).not.toHaveAttribute("aria-invalid");
  });
});

describe("a negative draft is refused, and says why", () => {
  it("disables Save with the reason on the field; the dismiss prompt names it; fixing it re-enables Save", async () => {
    const { saved } = open({ min: 9, mostLikely: 13, max: 22 });
    expandEstimates();
    fireEvent.change(minInput()!, { target: { value: "-5" } });

    expect(saveButton().disabled).toBe(true);
    expect(minInput()).toHaveAttribute("aria-invalid", "true");
    expect(describedText(minInput()!)).toContain("Estimates can't be negative. Enter 0 or more.");
    fireEvent.click(saveButton());
    expect(saved().min).toBe(9);

    // Escape asks through the app's own dialog; with a negative estimate the sentence says so.
    fireEvent.keyDown(document, { key: "Escape" });
    const prompt = await screen.findByRole("dialog", { name: "Discard your changes?" });
    expect(within(prompt).getByText(/An estimate is negative/)).toBeTruthy();
    fireEvent.click(within(prompt).getByRole("button", { name: "Keep editing" }));

    fireEvent.change(minInput()!, { target: { value: "5" } });
    expect(saveButton().disabled).toBe(false);
    expect(minInput()).not.toHaveAttribute("aria-invalid");
  });
});
