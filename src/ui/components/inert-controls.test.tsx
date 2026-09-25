// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { UnifiedActivityGrid } from "./UnifiedActivityGrid";
import { createScenario, createActivity } from "@app/api/project-service";
import type { Activity, DistributionType } from "@domain/models/types";

/**
 * **The grid's inert controls (owner ruling, 2026-09-17).** Distribution shows in grey text
 * where the estimate carries no uncertainty, and Confidence shows a dash wherever it cannot
 * apply. Each test renders the row under test beside a CONTROL row that must come out the other
 * way, so none of them can pass on a grid that never renders the treatment at all.
 *
 * Expected texts are written out, not read from the helpers under test.
 */

const settings = createScenario("S", "2026-09-18").settings;

function row(
  min: number,
  mostLikely: number,
  max: number,
  distributionType: DistributionType,
  extra: Partial<Activity> = {}
): Activity {
  return { ...createActivity("A", settings), min, mostLikely, max, distributionType, ...extra };
}

function renderGrid(
  activities: Activity[],
  opts: { heuristicEnabled?: boolean; isScenarioLocked?: boolean } = {}
) {
  render(
    <UnifiedActivityGrid
      activities={activities}
      bands={[]}
      scheduledActivities={[]}
      activityProbabilityTarget={0.5}
      onUpdate={vi.fn()}
      onDelete={vi.fn()}
      onAdd={vi.fn()}
      onAddBand={vi.fn()}
      onDeleteBand={vi.fn()}
      onUpdateBand={vi.fn()}
      onReorderWithBands={vi.fn()}
      onValidityChange={vi.fn()}
      dependencyMode={false}
      activityNumberMap={null}
      heuristicEnabled={opts.heuristicEnabled}
      isScenarioLocked={opts.isScenarioLocked}
    />
  );
}

const confidence = () =>
  Array.from(document.querySelectorAll<HTMLButtonElement>('[data-field="confidence"]'));
const distribution = () =>
  Array.from(document.querySelectorAll<HTMLSelectElement>('select[data-field="distribution"]'));

const NA_TRIANGULAR_UNIFORM =
  "Confidence only applies to T-Normal, LogNormal and Beta-PERT distributions";
const NA_ZERO_RANGE = "Min and Max are equal, so the spread is zero at every confidence level.";
const NA_SD_OVERRIDE =
  "This activity's standard deviation was set directly, so the confidence level does not change it.";
const NO_UNCERTAINTY =
  "Min, Most Likely and Max are equal, so this activity has no uncertainty and its distribution does not change its duration.";

afterEach(cleanup);

describe("Confidence shows a dash wherever it cannot apply", () => {
  it("on Triangular and Uniform rows; a T-Normal or LogNormal row with a range keeps its level", () => {
    renderGrid([
      row(3, 5, 10, "triangular"),
      row(3, 5, 10, "uniform"),
      row(3, 5, 10, "normal"),
      row(3, 5, 10, "logNormal"),
    ]);
    const [tri, uni, tn, ln] = confidence();
    expect([tri!, uni!, tn!, ln!].map((b) => b.textContent)).toEqual(["—", "—", "Med.", "Med."]);
    expect(tri!.title).toBe(NA_TRIANGULAR_UNIFORM);
    expect(tri!.getAttribute("aria-label")).toBe("Confidence: not applicable");
    expect(tn!.getAttribute("aria-label")).toBe("Medium");
  });

  it("on a zero-range T-Normal row: disabled, out of the tab order even with the heuristic on, and naming no level", () => {
    // Today this control is enabled, tabbable with the heuristic on, and announces "Medium",
    // although range × RSM is zero at every level.
    renderGrid([row(5, 5, 5, "normal"), row(3, 5, 10, "normal")], { heuristicEnabled: true });
    const [zero, control] = confidence();
    expect(zero!.disabled).toBe(true);
    expect(zero!.tabIndex).toBe(-1);
    expect(zero!.getAttribute("aria-label")).toBe("Confidence: not applicable");
    expect(zero!.textContent).toBe("—");
    expect(zero!.title).toBe(NA_ZERO_RANGE);
    // Positive control: the same distribution with a range stays live and tabbable.
    expect(control!.disabled).toBe(false);
    expect(control!.tabIndex).toBe(0);
    expect(control!.getAttribute("aria-label")).toBe("Medium");
  });

  it("on a T-Normal row whose standard deviation was set directly, with its own reason", () => {
    renderGrid([row(3, 5, 10, "normal", { sdOverride: 2 }), row(3, 5, 10, "normal")]);
    const [overridden, control] = confidence();
    expect(overridden!.textContent).toBe("—");
    expect(overridden!.title).toBe(NA_SD_OVERRIDE);
    expect(control!.textContent).toBe("Med.");
  });

  it("but a LOCKED T-Normal row still shows its level: the dash keys on the rule, not on `disabled`", () => {
    renderGrid([row(3, 5, 10, "normal"), row(3, 5, 10, "triangular")], { isScenarioLocked: true });
    const [locked, control] = confidence();
    expect(locked!.disabled).toBe(true);
    expect(locked!.textContent).toBe("Med.");
    expect(locked!.getAttribute("aria-label")).toBe("Medium");
    // Positive control: a locked Triangular row does show the dash.
    expect(control!.textContent).toBe("—");
  });
});

describe("Distribution shows in grey text where the estimate carries no uncertainty", () => {
  it("is greyed and titled on a point-mass row, and STAYS ENABLED and tabbable", () => {
    renderGrid([row(1, 1, 1, "triangular"), row(3, 5, 10, "triangular")], { heuristicEnabled: true });
    const [point, control] = distribution();
    expect(point!.className).toContain("text-gray-500");
    expect(point!.title).toBe(NO_UNCERTAINTY);
    expect(point!.disabled).toBe(false);
    expect(point!.tabIndex).toBe(0);
    // Positive control: a row with a range is not greyed and carries no title.
    expect(control!.className).not.toContain("text-gray-500");
    expect(control!.title).toBe("");
  });

  it("is greyed under every distribution for a point estimate above zero", () => {
    renderGrid([
      row(5, 5, 5, "normal"),
      row(5, 5, 5, "logNormal"),
      row(5, 5, 5, "triangular"),
      row(5, 5, 5, "uniform"),
    ]);
    expect(distribution().map((s) => s.title)).toEqual([
      NO_UNCERTAINTY,
      NO_UNCERTAINTY,
      NO_UNCERTAINTY,
      NO_UNCERTAINTY,
    ]);
  });

  it("is NOT greyed for 0/0/0 on LogNormal, which is broken rather than settled", () => {
    // LogNormal cannot be built at zero, so the schedule is blank; greying this row would make
    // it look settled. Its Confidence still shows the dash, because the range is zero.
    renderGrid([row(0, 0, 0, "logNormal"), row(0, 0, 0, "normal")]);
    const [broken, control] = distribution();
    expect(broken!.title).toBe("");
    expect(broken!.className).not.toContain("text-gray-500");
    expect(confidence()[0]!.textContent).toBe("—");
    // Positive control: 0/0/0 on T-Normal is a legitimate zero-length activity.
    expect(control!.title).toBe(NO_UNCERTAINTY);
  });

  it("is NOT greyed where the standard deviation was set directly: that point estimate has spread", () => {
    renderGrid([row(5, 5, 5, "normal", { sdOverride: 2 }), row(5, 5, 5, "normal")]);
    const [overridden, control] = distribution();
    expect(overridden!.title).toBe("");
    expect(control!.title).toBe(NO_UNCERTAINTY);
  });

  it("draws no hover sparkline on a greyed cell", () => {
    // The sparkline draws a curve even for a point estimate, beside a title saying there is
    // no uncertainty.
    renderGrid([row(1, 1, 1, "triangular"), row(3, 5, 10, "triangular")]);
    const [point, control] = distribution();
    expect(point!.parentElement!.querySelector("svg")).toBeNull();
    expect(control!.parentElement!.querySelector("svg")).not.toBeNull();
  });
});
