// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
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

/**
 * WI-82 (owner ruling, 2026-09-28): a Compare tick only ticks. The tab selects on `click`, and the
 * checkbox used to stop only its `change` — so its click reached the tab, and ticking a scenario
 * also switched to it. The controls are the two ways a tab is still chosen: its name, and a click
 * anywhere on the tab that is not one of its controls.
 */
describe("ScenarioTabs Compare tick (WI-82)", () => {
  it("a tick toggles the scenario and does not select it; its name and the tab itself still select it", () => {
    const a = createScenario("Oboe Baseline", "2026-01-05");
    const b = createScenario("Oboe Crash", "2026-01-05");
    const onSelect = vi.fn();
    const onToggleCompare = vi.fn();
    render(
      <ScenarioTabs
        scenarios={[a, b]}
        activeScenarioId={a.id}
        onSelect={onSelect}
        onAdd={vi.fn()}
        onClone={vi.fn()}
        onDelete={vi.fn()}
        compareMode
        selectedForCompare={new Set<string>()}
        onToggleCompare={onToggleCompare}
      />
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "Compare scenario Oboe Crash" }));
    expect(onToggleCompare).toHaveBeenCalledTimes(1);
    expect(onToggleCompare).toHaveBeenCalledWith(b.id);
    expect(onSelect).not.toHaveBeenCalled();

    // The controls, same test: B's name selects it, and so does B's tab outside its controls.
    const name = screen.getByRole("button", { name: "Oboe Crash" });
    fireEvent.click(name);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenLastCalledWith(b.id);
    const tab = name.parentElement!;
    expect(tab).toContainElement(screen.getByRole("checkbox", { name: "Compare scenario Oboe Crash" })); // it IS B's tab
    fireEvent.click(tab);
    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(onSelect).toHaveBeenLastCalledWith(b.id);
    expect(onToggleCompare).toHaveBeenCalledTimes(1); // neither selection ticked anything
  });
});
