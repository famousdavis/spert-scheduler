// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * WI-32 (owner ruling, 2026-09-06): the bulk toolbar's Distribution menu comes before
 * Confidence, and Confidence is disabled — and cleared — while a distribution that ignores it
 * (Triangular, Uniform) is staged. With NOTHING staged it stays enabled, deliberately unlike the
 * grid; the reason is at `stagedDistributionIgnoresConfidence` in the component.
 *
 * Every expected value here is a literal. `CONFIDENCE_NA_TITLE` is deliberately NOT imported:
 * a test comparing the component's title to the same constant it renders would pass whatever
 * the sentence said.
 *
 * ⚠️ Each staging step also asserts the Distribution menu really holds the value. jsdom sets a
 * `<select>` to "" when told a value no option has, which here means "nothing staged", which
 * ENABLES Confidence — so a mistyped value would pass every "enabled" assertion vacuously.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { BulkActionToolbar } from "./BulkActionToolbar";
import type { BulkApplyPayload } from "./BulkActionToolbar";

afterEach(cleanup);

const DISTRIBUTION = "Set distribution for selected activities";
const CONFIDENCE = "Set confidence level for selected activities";
const STATUS = "Set status for selected activities";
const NA_TITLE = "Confidence only applies to T-Normal, LogNormal, and Beta-PERT distributions";

/** Heuristics OFF, so Apply calls `onApply` directly and no recalculation question opens. */
function renderToolbar(onApply: (staged: BulkApplyPayload) => void = vi.fn()) {
  return render(
    <BulkActionToolbar
      selectedCount={2}
      onApply={onApply}
      onBulkDelete={vi.fn()}
      onClearSelection={vi.fn()}
      heuristicEnabled={false}
    />,
  );
}

function menu(label: string): HTMLSelectElement {
  return screen.getByRole("combobox", { name: label });
}

/** Stage a value and prove the menu took it (see the header's ⚠️). */
function stage(label: string, value: string) {
  fireEvent.change(menu(label), { target: { value } });
  expect(menu(label).value).toBe(value);
}

function expectConfidenceEnabled() {
  expect(menu(CONFIDENCE)).toBeEnabled();
  expect(menu(CONFIDENCE)).not.toHaveAttribute("title");
}

function expectConfidenceDisabled() {
  expect(menu(CONFIDENCE)).toBeDisabled();
  expect(menu(CONFIDENCE)).toHaveAttribute("title", NA_TITLE);
  expect(menu(CONFIDENCE)).toHaveAccessibleDescription(NA_TITLE);
}

describe("WI-32 — the bulk toolbar's order", () => {
  it("reads Distribution, Confidence, Status — then Apply, Delete, Clear", () => {
    // The control is the fixed tail: Apply, Delete and Clear did not move, so a query that
    // missed a menu or returned them out of document order could not match this list.
    const { container } = renderToolbar();
    const controls = [...container.querySelectorAll("select, button")].map(
      (el) => el.getAttribute("aria-label") ?? el.textContent?.trim(),
    );
    expect(controls).toEqual([DISTRIBUTION, CONFIDENCE, STATUS, "Apply", "Delete", "Clear"]);
  });
});

describe("WI-32 — Confidence follows the STAGED distribution", () => {
  it("Triangular staged → Confidence disabled, with the shared title", () => {
    renderToolbar();
    expectConfidenceEnabled(); // control: enabled, and untitled, before anything is staged

    stage(DISTRIBUTION, "triangular");
    expectConfidenceDisabled();
  });

  it("Uniform staged → Confidence disabled, with the shared title", () => {
    renderToolbar();
    expectConfidenceEnabled(); // control

    stage(DISTRIBUTION, "uniform");
    expectConfidenceDisabled();
  });

  it("T-Normal, LogNormal and Beta-PERT staged → Confidence enabled", () => {
    renderToolbar();
    for (const type of ["normal", "logNormal", "betaPert"]) {
      stage(DISTRIBUTION, "triangular");
      expect(menu(CONFIDENCE)).toBeDisabled(); // control: each step starts from disabled

      stage(DISTRIBUTION, type);
      expectConfidenceEnabled();
    }
  });

  it("nothing staged → Confidence enabled, and returning to the placeholder re-enables it", () => {
    renderToolbar();
    expectConfidenceEnabled();

    stage(DISTRIBUTION, "triangular");
    expect(menu(CONFIDENCE)).toBeDisabled(); // control: this render can show a disabled menu

    stage(DISTRIBUTION, "");
    expectConfidenceEnabled();
  });
});

describe("WI-32 — a distribution that ignores Confidence CLEARS the staged level", () => {
  it("the menu falls back to its placeholder, and T-Normal brings it back EMPTY", () => {
    renderToolbar();
    stage(CONFIDENCE, "highConfidence"); // control: the level is really staged and showing

    stage(DISTRIBUTION, "triangular");
    expect(menu(CONFIDENCE).value).toBe("");
    expect(menu(CONFIDENCE).selectedOptions[0]?.textContent).toBe("Set Confidence...");

    stage(DISTRIBUTION, "normal");
    expect(menu(CONFIDENCE)).toBeEnabled();
    expect(menu(CONFIDENCE).value).toBe(""); // the earlier level is not restored
  });

  it("Apply sends no level with Triangular — and, the control, sends it with T-Normal", async () => {
    const onApply = vi.fn();
    renderToolbar(onApply);
    const apply = () => fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    stage(CONFIDENCE, "highConfidence");
    stage(DISTRIBUTION, "normal");
    apply();
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
    expect(onApply.mock.calls[0]![0]).toEqual({
      confidenceLevel: "highConfidence",
      distributionType: "normal",
    });

    // Apply resets the toolbar and, with no grid around it, leaves it mounted: stage again.
    stage(CONFIDENCE, "highConfidence");
    stage(DISTRIBUTION, "triangular");
    apply();
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(2));
    expect(onApply.mock.calls[1]![0]).toEqual({ distributionType: "triangular" });
    expect(onApply.mock.calls[1]![0]).not.toHaveProperty("confidenceLevel");
  });
});
