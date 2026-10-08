// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * The Sensitivity panel's figures and its left-out line (v0.76.2).
 *
 * Each row shows its activity's own distribution, and an activity the panel cannot analyse —
 * estimates out of order, or a LogNormal whose estimates give it no mean — is left out of the
 * ranking and counted in one line under the description.
 */

import { describe, it, expect } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Activity } from "@domain/models/types";
import { SensitivityPanel } from "./SensitivityPanel";

/** A real Activity, annotated rather than cast. */
function activity(patch: Partial<Activity> & { id: string; name: string }): Activity {
  return {
    min: 2,
    mostLikely: 5,
    max: 10,
    confidenceLevel: "mediumConfidence",
    distributionType: "normal",
    status: "planned",
    ...patch,
  };
}

const VALID_A = activity({ id: "a", name: "Design" });
const VALID_B = activity({ id: "b", name: "Build", min: 4, mostLikely: 8, max: 16 });

describe("SensitivityPanel", () => {
  it("says nothing about left-out activities when every one can be analysed", () => {
    render(<SensitivityPanel activities={[VALID_A, VALID_B]} dependencyMode={false} />);
    expect(screen.queryByText(/left out/)).toBeNull();
  });

  it("counts one left-out activity in the singular, and does not list it", () => {
    const broken = activity({ id: "x", name: "Broken", distributionType: "triangular", min: 30, mostLikely: 15, max: 10 });
    render(<SensitivityPanel activities={[VALID_A, VALID_B, broken]} dependencyMode={false} />);
    expect(screen.getByText("1 activity is left out until its estimates are fixed.")).toBeTruthy();
    expect(screen.queryByText("Broken")).toBeNull();
  });

  it("counts two left-out activities in the plural", () => {
    const first = activity({ id: "x", name: "First", distributionType: "triangular", min: 30, mostLikely: 15, max: 10 });
    const second = activity({ id: "y", name: "Second", distributionType: "betaPert", min: 10, mostLikely: 25, max: 20 });
    render(<SensitivityPanel activities={[VALID_A, first, second]} dependencyMode={false} />);
    expect(screen.getByText("2 activities are left out until their estimates are fixed.")).toBeTruthy();
  });

  it("shows a Triangular activity's own mean and SD", () => {
    const triangular = activity({ id: "t", name: "Triangular", distributionType: "triangular", min: 10, mostLikely: 15, max: 30 });
    render(<SensitivityPanel activities={[VALID_A, triangular]} dependencyMode={false} />);
    // Its own: mean 55/3 = 18.33, SD √(325/18) = 4.25. A T-Normal's would be 16.7 and 4.0.
    expect(screen.getByText("μ=18.3d")).toBeTruthy();
    expect(screen.getByText("σ=4.2d")).toBeTruthy();
  });

  it("still renders beside a LogNormal too small to have a mean, and counts it as left out", () => {
    const tiny = activity({ id: "z", name: "Tiny", distributionType: "logNormal", min: 0, mostLikely: 0, max: 5e-324 });
    render(<SensitivityPanel activities={[VALID_A, VALID_B, tiny]} dependencyMode={false} />);
    expect(screen.getByText("1 activity is left out until its estimates are fixed.")).toBeTruthy();
    expect(screen.queryByText("Tiny")).toBeNull();
  });
});

/**
 * WI-104 — the panel says what its score is, and that it ignores dependencies.
 *
 * Every score reads an activity's OWN estimates (`computeSensitivityAnalysis` has no dependency or
 * critical-path term). The line under the title says so for each sort; in dependency mode a note says
 * what that means; the rank badge stops looking like an activity's "#N", and the name carries the
 * activity's real "#N" when the project numbers its activities. Each expected string is a literal.
 */
const IMPACT_LINE =
  "Ranks each activity by its own estimates: about how many days its 95th-percentile duration grows if its estimates rise 10%.";
const VARIANCE_LINE = "Ranks each activity by its own estimates: its share of the variance of every activity ranked here, added together.";
const CV_LINE = "Ranks each activity by its own estimates: its standard deviation as a share of its mean.";
const NOTE =
  "This ranking does not account for dependencies, so an activity with slack can rank high here without moving the finish date. To see what changing an activity does to the finish, try it in a copy of this scenario and compare the two.";

const sortBy = (value: "impact" | "variance" | "cv") =>
  fireEvent.change(screen.getByLabelText("Sort by:"), { target: { value } });

/** A rank badge's text outside its visually hidden part — what is seen. */
function seenText(badge: HTMLElement, hidden: readonly HTMLElement[]): string {
  return Array.from(badge.childNodes)
    .filter((n) => !hidden.includes(n as HTMLElement))
    .map((n) => n.textContent)
    .join("");
}

describe("SensitivityPanel — what the ranking reads (WI-104)", () => {
  it("Impact, the default sort: the line names the activity's own 95th percentile and a 10% rise", () => {
    render(<SensitivityPanel activities={[VALID_A, VALID_B]} dependencyMode={false} />);
    expect(screen.getByText(IMPACT_LINE)).toBeInTheDocument();
    expect(screen.queryByText(/contribution to project schedule uncertainty/)).toBeNull();
  });

  it("Variance Contribution: the line names a share of the variance of every activity ranked here", () => {
    render(<SensitivityPanel activities={[VALID_A, VALID_B]} dependencyMode={false} />);
    sortBy("variance");
    expect(screen.getByText(VARIANCE_LINE)).toBeInTheDocument();
    expect(screen.queryByText(IMPACT_LINE)).toBeNull();
  });

  it("Relative Uncertainty: the line names the standard deviation as a share of the mean", () => {
    render(<SensitivityPanel activities={[VALID_A, VALID_B]} dependencyMode={false} />);
    sortBy("cv");
    expect(screen.getByText(CV_LINE)).toBeInTheDocument();
    expect(screen.queryByText(IMPACT_LINE)).toBeNull();
  });

  it("in dependency mode, a note above the list says the ranking does not account for dependencies", () => {
    render(<SensitivityPanel activities={[VALID_A, VALID_B]} dependencyMode={true} />);
    const note = screen.getByRole("note");
    expect(note.textContent).toBe(NOTE);
    // Above the list: the first ranked row's name comes after it.
    expect(note.compareDocumentPosition(screen.getByText("Build")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("outside dependency mode there is no note", () => {
    render(<SensitivityPanel activities={[VALID_A, VALID_B]} dependencyMode={false} />);
    expect(screen.queryByRole("note")).toBeNull();
    expect(screen.queryByText(/does not account for dependencies/)).toBeNull();
  });

  it("the rank badge shows the rank alone, with a visually hidden 'Rank ' before it", () => {
    const { container } = render(<SensitivityPanel activities={[VALID_A, VALID_B]} dependencyMode={false} />);
    const hidden = screen.getAllByText("Rank");
    expect(hidden.map((el) => el.textContent)).toEqual(["Rank ", "Rank "]);
    for (const el of hidden) expect(el).toHaveClass("sr-only");
    const badges = hidden.map((el) => el.parentElement!);
    // What a screen reader reads, and what is seen: the badge's text outside its hidden part.
    expect(badges.map((b) => b.textContent)).toEqual(["Rank 1", "Rank 2"]);
    expect(badges.map((b) => seenText(b, hidden))).toEqual(["1", "2"]);
    // No "#" anywhere: without the page's numbers, nothing on the panel looks like an activity's number.
    expect(container.textContent).not.toContain("#");
  });

  it("with the page's numbers, each name reads '#N name', and the number is outside the name's own span", () => {
    const numbers = new Map([
      ["a", 1],
      ["b", 2],
    ]);
    render(<SensitivityPanel activities={[VALID_A, VALID_B]} dependencyMode={false} activityNumberMap={numbers} />);
    const build = screen.getByText("Build");
    expect(build.textContent).toBe("Build"); // the name's span holds the name alone — the part that truncates
    expect(build.closest("p")!.textContent).toBe("#2 Build");
    expect(screen.getByText("Design").closest("p")!.textContent).toBe("#1 Design");
    // The rank is not the number: Build ranks first and is activity #2.
    expect(build.closest("div")!.parentElement!.textContent).toMatch(/^Rank 1#2 Build/);
  });

  it("without numbers — a project that does not show them — each name is shown alone", () => {
    render(<SensitivityPanel activities={[VALID_A, VALID_B]} dependencyMode={false} activityNumberMap={null} />);
    expect(screen.getByText("Build").closest("p")!.textContent).toBe("Build");
    expect(screen.getByText("Design").closest("p")!.textContent).toBe("Design");
  });
});
