// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ScenarioTabs } from "./ScenarioTabs";
import { createScenario } from "@app/api/project-service";

/**
 * The tab's clone control was the Unicode glyph ⎘ (U+2398, written as `&#x2398;`) —
 * font-dependent, and measured at 7 px wide beside 14 px SVG neighbours (audit L1). It
 * is now an SVG with an accessible name, like the lock beside it. Falsified at
 * 1c9b1db: all three assertions fail — text content outranks `title` in accessible-name
 * computation, so the button's name WAS the glyph, and the role query finds nothing named
 * "Clone scenario". (This test's first draft assumed the name came from `title`; the
 * pre-fix run corrected it.)
 */
afterEach(cleanup);

function renderTabs() {
  const scenario = createScenario("Marimba Baseline", "2026-01-05");
  render(
    <ScenarioTabs
      scenarios={[scenario]}
      activeScenarioId={scenario.id}
      onSelect={vi.fn()}
      onAdd={vi.fn()}
      onClone={vi.fn()}
      onDelete={vi.fn()}
    />
  );
}

describe("ScenarioTabs clone control", () => {
  it("is an SVG icon with an accessible name, not a text glyph", () => {
    renderTabs();
    const clone = screen.getByRole("button", { name: "Clone scenario" });
    expect(clone).toHaveAccessibleName("Clone scenario");
    expect(clone.querySelector("svg")).not.toBeNull();
    expect(clone.textContent!.trim()).toBe("");
  });
});
