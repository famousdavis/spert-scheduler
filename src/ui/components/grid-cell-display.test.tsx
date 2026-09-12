// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { UnifiedActivityGrid } from "./UnifiedActivityGrid";
import { GRID_RSM_LABELS, gridDistributionLabel } from "./grid-labels";
import { createScenario, createActivity } from "@app/api/project-service";
import { recommendDistribution } from "@core/recommendation/recommendation";
import { distributionLabel } from "@domain/helpers/format-labels";
import { RSM_LABELS, DISTRIBUTION_TYPES } from "@domain/models/types";
import type { Activity, DistributionType, RSMLevel } from "@domain/models/types";

/**
 * **What the grid SHOWS, where it deliberately differs from what is stored or shared.**
 *
 * The activity grid is the one surface with a pixel budget, so three cells show something
 * other than the canonical value: the distribution `<option>`s abbreviate `LogNormal`, the
 * confidence button carries short labels, and the recommendation affordance is a dot
 * rather than a word. Each of those has a blast radius that must stay at zero — the
 * printed report and the XLSX/CSV export render the same activities from the *shared*
 * labels, and a relabel there changes the file a user sends to a client.
 *
 * ⚠️ **Every test here pins BOTH sides on the same gesture**: the grid-local value that
 * must change AND the shared value that must not. An assertion that only checks the grid
 * would pass just as happily if someone "simplified" this by editing `RSM_LABELS` or
 * `distributionLabel` — which is the exact failure these guards exist to catch.
 *
 * ⚠️ **jsdom has no layout, so nothing here measures a pixel.** The widths, gaps and
 * occlusion claims behind these choices were measured in a browser and are recorded in
 * `grid-columns.ts` and `grid-labels.ts`. What this file can hold is the *wiring*: which
 * label reaches which element, and that the constants the arithmetic depends on are still
 * the ones that were measured.
 */

const settings = createScenario("S", "2026-09-07").settings;

function activityFixture(overrides: Partial<Activity> = {}): Activity {
  return { ...createActivity("Design", settings), ...overrides };
}

function renderGrid(activities: Activity[], onUpdate = vi.fn()) {
  render(
    <UnifiedActivityGrid
      activities={activities}
      bands={[]}
      scheduledActivities={[]}
      activityProbabilityTarget={0.5}
      onUpdate={onUpdate}
      onDelete={vi.fn()}
      onAdd={vi.fn()}
      onAddBand={vi.fn()}
      onDeleteBand={vi.fn()}
      onUpdateBand={vi.fn()}
      onReorderWithBands={vi.fn()}
      onValidityChange={vi.fn()}
      dependencyMode={false}
      activityNumberMap={null}
    />,
  );
  return onUpdate;
}

const nameInput = () =>
  document.querySelector<HTMLInputElement>('[data-field="name"]')!;
const distributionSelect = () =>
  document.querySelector<HTMLSelectElement>('[data-field="distribution"]')!;
const confidenceButton = () =>
  document.querySelector<HTMLButtonElement>('[data-field="confidence"]')!;

afterEach(cleanup);

describe("the grid abbreviates LogNormal, and only in the grid", () => {
  it("renders LogNorm in the option list while the shared label stays LogNormal", () => {
    renderGrid([activityFixture()]);
    const options = Array.from(distributionSelect().options).map((o) => o.textContent);

    expect(options).toEqual(["T-Normal", "LogNorm", "Triangular", "Uniform"]);

    // ⚠️ The side that must NOT move, asserted on the same gesture. `distributionLabel`
    // feeds the printed report and the XLSX/CSV export; shortening it there would satisfy
    // the assertion above and silently change a file the user sends to a client.
    expect(distributionLabel("logNormal")).toBe("LogNormal");
    expect(options).not.toContain(distributionLabel("logNormal"));
  });

  it("overrides exactly one label and passes the rest through", () => {
    // Non-vacuity: if `gridDistributionLabel` were reduced to a pass-through, the test
    // above would still pass as soon as someone edited the shared label instead. This
    // pins the divergence itself — one type differs, three are identical.
    const differing = DISTRIBUTION_TYPES.filter(
      (dt) => gridDistributionLabel(dt) !== distributionLabel(dt),
    );
    expect(differing).toEqual(["logNormal"]);
    expect(gridDistributionLabel("logNormal")).toBe("LogNorm");
  });
});

describe("the confidence button is short, the dropdown behind it is not", () => {
  // `normal` so the control is enabled — `confidenceApplies` is false for triangular and
  // uniform, and a disabled button carries the "confidence does not apply" title instead.
  const level: RSMLevel = "nearCertainty";
  const withLevel = () =>
    activityFixture({ distributionType: "normal", confidenceLevel: level });

  it("shows the short label but names itself with the full one", () => {
    renderGrid([withLevel()]);
    const button = confidenceButton();

    expect(button.textContent).toBe("Near cert.");
    expect(button.getAttribute("aria-label")).toBe("Near certainty");
    expect(button.title).toBe("Near certainty");

    // The side that must NOT move: `RSM_LABELS` feeds print and export.
    expect(RSM_LABELS[level]).toBe("Near certainty");
    expect(button.textContent).not.toBe(RSM_LABELS[level]);
  });

  it("keeps the full wording in the dropdown, where a level is actually chosen", () => {
    renderGrid([withLevel()]);
    fireEvent.click(confidenceButton());

    // The dropdown is a portal on document.body, at a fixed 256px regardless of the
    // 75px button, which is why abbreviating the button costs the user nothing.
    const options = screen.getAllByRole("button").filter((b) => b.textContent?.includes("Near"));
    expect(options.length).toBeGreaterThan(0);
    expect(options.some((b) => within(b).queryByText("Near certainty"))).toBe(true);
  });

  it("gives every level a short label, and shortens only what needs it", () => {
    // Pre-registered composition, not a count: `High` and `Low` already fitted the 75px
    // track, so they are the two that must be IDENTICAL to the shared label. A guard on
    // "all ten differ" would fail correctly-unchanged labels; a guard on a count would
    // pass if the wrong two were left alone.
    const unchanged = (Object.keys(GRID_RSM_LABELS) as RSMLevel[]).filter(
      (l) => GRID_RSM_LABELS[l] === RSM_LABELS[l],
    );
    expect(unchanged.sort()).toEqual(["highConfidence", "lowConfidence"]);
    expect(Object.keys(GRID_RSM_LABELS).sort()).toEqual(Object.keys(RSM_LABELS).sort());
  });
});

describe("the recommendation affordance is a dot, and still applies the recommendation", () => {
  // Asserted, not assumed: the fixture only exercises the affordance if the recommended
  // type actually differs from the stored one.
  const stored: DistributionType = "uniform";
  const recommendation = recommendDistribution(3, 5, 10, "mediumConfidence");
  const badgeRow = () =>
    activityFixture({ min: 3, mostLikely: 5, max: 10, distributionType: stored });

  it("the fixture really is a recommendation row", () => {
    expect(recommendation.recommended).not.toBe(stored);
  });

  it("renders no text, names itself, and carries the rationale on hover", () => {
    renderGrid([badgeRow()]);
    const dot = screen.getByRole("button", {
      name: /Apply the recommended distribution/,
    });

    // The whole point: a word here cost the `<select>` 24.27px and clipped its label on
    // every row that had one. Text coming back is the regression.
    expect(dot.textContent).toBe("");
    expect(dot.title).toBe(recommendation.rationale);
    expect(dot.getAttribute("aria-label")).toContain(
      distributionLabel(recommendation.recommended),
    );

    // ⚠️ These two class literals ARE the arithmetic and jsdom cannot check the layout
    // they produce: 25px is the native `<select>`'s arrow (20) plus its right padding (4)
    // and border (1), so the dot's right edge lands exactly on the arrow's left edge at
    // any track width, and `h-3 w-3` is the 12px the label-to-arrow gap affords. A silent
    // change to either is what this catches; whether it LOOKS right is a browser check.
    expect(dot.className).toContain("right-[25px]");
    expect(dot.className).toContain("h-3 w-3");
  });

  it("applies the recommendation when clicked", () => {
    const onUpdate = renderGrid([badgeRow()]);
    fireEvent.click(
      screen.getByRole("button", { name: /Apply the recommended distribution/ }),
    );
    expect(onUpdate).toHaveBeenCalledWith(expect.any(String), {
      distributionType: recommendation.recommended,
    });
  });

  it("does not render at all when the stored type is already the recommended one", () => {
    // The leave-alone half. Without it, a component that never renders the affordance
    // would pass nothing above — but every assertion here would also be unreachable, and
    // an unreachable failure reads as a pass in a file this size.
    renderGrid([activityFixture({
      min: 3,
      mostLikely: 5,
      max: 10,
      distributionType: recommendation.recommended,
    })]);
    expect(
      screen.queryByRole("button", { name: /Apply the recommended distribution/ }),
    ).toBeNull();
  });
});

describe("a clipped activity name is readable on hover", () => {
  /**
   * jsdom reports `scrollWidth === clientWidth === 0` for everything, so the clipped and
   * unclipped cases are indistinguishable unless both are stubbed. The real figures came
   * from a browser: a clipped name input measured 280 against 201, and 235 against 201.
   */
  function stubWidths(el: HTMLElement, scrollWidth: number, clientWidth: number) {
    Object.defineProperty(el, "scrollWidth", { value: scrollWidth, configurable: true });
    Object.defineProperty(el, "clientWidth", { value: clientWidth, configurable: true });
  }

  it("sets the title when the name overflows and leaves it empty when it fits", () => {
    renderGrid([activityFixture({ name: "Environment Provisioning (Dev/Test/Prod)" })]);
    const input = nameInput();

    // Vacuity control: nothing has hovered yet, so a handler that never runs would leave
    // this empty and the clipped assertion below would fail rather than pass silently.
    expect(input.title).toBe("");

    stubWidths(input, 280, 201);
    fireEvent.mouseOver(input);
    expect(input.title).toBe("Environment Provisioning (Dev/Test/Prod)");

    // The must-NOT-change half, on the same element and the same gesture: a redundant
    // tooltip over a name that is fully visible is the thing the conditional buys.
    stubWidths(input, 201, 201);
    fireEvent.mouseOver(input);
    expect(input.title).toBe("");
  });

  it("reveals what is ON SCREEN, not what is in the store", () => {
    // ⚠️ The binding trap, pinned. The input is `value={localName}` from
    // `useBufferedField`, which deliberately holds a value the store does not have —
    // while the user types, and whenever it ignores an external write. A tooltip whose
    // job is "show me the part that is cut off" must reveal the string being cut off.
    const onUpdate = renderGrid([activityFixture({ name: "Stored name" })]);
    const input = nameInput();

    fireEvent.change(input, { target: { value: "Typed but not yet committed" } });
    // The premise: nothing has been written back, so the two really do differ.
    expect(onUpdate).not.toHaveBeenCalled();
    expect(input.value).not.toBe("Stored name");

    stubWidths(input, 300, 100);
    fireEvent.mouseOver(input);
    expect(input.title).toBe("Typed but not yet committed");
    expect(input.title).not.toBe("Stored name");
  });
});
