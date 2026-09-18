// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ActivityEditModal } from "./ActivityEditModal";
import { useProjectStore } from "@ui/hooks/use-project-store";
import { createProject, createScenario, createActivity } from "@app/api/project-service";
import type { Activity, Project } from "@domain/models/types";

/**
 * **The Edit Activity dialog greys its Distribution for a point estimate, as the grid does**
 * (owner ruling, 2026-09-18). It reads the DRAFTS, so it follows the user's edits before Save,
 * and the control stays ENABLED. Each test carries its own control that must come out the
 * other way.
 */

const NO_UNCERTAINTY =
  "Min, Most Likely and Max are equal, so this activity has no uncertainty and its distribution does not change its duration.";

function openFor(overrides: Partial<Activity>) {
  const scenario = createScenario("S", "2026-04-06");
  const activity: Activity = {
    ...createActivity("Discovery", scenario.settings),
    min: 3,
    mostLikely: 5,
    max: 10,
    distributionType: "normal",
    ...overrides,
  };
  const project: Project = {
    ...createProject("P", "2026-04-06"),
    scenarios: [{ ...scenario, activities: [activity] }],
  };
  useProjectStore.setState({ projects: [project] });
  render(
    <ActivityEditModal
      activityId={activity.id}
      scenarioId={scenario.id}
      projectId={project.id}
      onClose={vi.fn()}
      schedule={undefined}
    />
  );
  // The Estimates section starts collapsed; its fields are not in the DOM until it opens.
  fireEvent.click(screen.getByRole("button", { name: /Estimates/ }));
}

const distribution = () =>
  document.querySelector('select[name="distributionType"]') as HTMLSelectElement;
const setDraft = (name: "estimateMin" | "estimateMostLikely" | "estimateMax", value: string) =>
  fireEvent.change(document.querySelector(`input[name="${name}"]`) as HTMLInputElement, {
    target: { value },
  });
const greyed = () => distribution().className.includes("text-gray-500");

afterEach(cleanup);

describe("ActivityEditModal — Distribution greys out where it cannot change the duration", () => {
  it("greys a point-estimate draft, titles it, and keeps it enabled; a ranged draft is not greyed", () => {
    openFor({ min: 3, mostLikely: 5, max: 10 });
    // Control: a range is not greyed and has no title.
    expect(greyed()).toBe(false);
    expect(distribution().title).toBe("");

    setDraft("estimateMin", "5");
    setDraft("estimateMax", "5");

    // Driven off the DRAFTS: nothing has been saved.
    expect(greyed()).toBe(true);
    expect(distribution().title).toBe(NO_UNCERTAINTY);
    expect(distribution().disabled).toBe(false);
  });

  it("does not read a blank draft as a point estimate", () => {
    openFor({ min: 5, mostLikely: 5, max: 5, distributionType: "triangular" });
    // Positive control: the saved point estimate is greyed.
    expect(greyed()).toBe(true);

    setDraft("estimateMin", "");
    expect(greyed()).toBe(false);
  });

  it("does not grey 0/0/0 on LogNormal, which is broken rather than settled", () => {
    openFor({ min: 0, mostLikely: 0, max: 0, distributionType: "logNormal" });
    expect(greyed()).toBe(false);

    // Control, same estimate: on T-Normal it is a legitimate zero-length activity.
    fireEvent.change(distribution(), { target: { value: "normal" } });
    expect(greyed()).toBe(true);
  });

  it("does not grey a point estimate whose standard deviation was set directly", () => {
    openFor({ min: 5, mostLikely: 5, max: 5, sdOverride: 2 });
    expect(greyed()).toBe(false);
    cleanup();

    // Control: the same point estimate without the override is greyed.
    openFor({ min: 5, mostLikely: 5, max: 5 });
    expect(greyed()).toBe(true);
  });
});
