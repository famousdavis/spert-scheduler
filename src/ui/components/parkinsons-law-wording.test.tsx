// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * Parkinson's Law floors each simulated duration at the deterministic duration, and that
 * duration is computed at the scenario's Activity Target (`build-simulation-params.ts`) —
 * which can be P30 through P95. Both explanations used to say "(P50)".
 *
 * Each string must name no fixed percentile AND must name a control that the same render
 * actually has, so a rename of the control fails here instead of leaving the explanation
 * pointing at nothing. The card is rendered at P80, the case the old wording got wrong.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { DEFAULT_SCENARIO_SETTINGS, DEFAULT_USER_PREFERENCES } from "@domain/models/types";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";
import { ScenarioSummaryCard } from "./ScenarioSummaryCard";
import { PreferencesSection } from "./PreferencesSection";

afterEach(cleanup);

const NAMED_PERCENTILE = /\bP\d+\b/;

describe("Parkinson's Law wording names the target, not a percentile", () => {
  it("summary card tooltip points at the Activity target control", () => {
    render(
      <ScenarioSummaryCard
        startDate="2026-01-05"
        schedule={null}
        buffer={null}
        settings={{ ...DEFAULT_SCENARIO_SETTINGS, rngSeed: "wording", probabilityTarget: 0.8 }}
        hasSimulationResults={false}
        onSettingsChange={vi.fn()}
        onStartDateChange={vi.fn()}
        onNewSeed={vi.fn()}
        projectName="Wording"
        scenarioName="S"
        activities={[]}
        bands={[]}
        dependencies={[]}
        milestones={[]}
      />
    );
    const tooltip = screen
      .getByRole("switch", { name: "Parkinson's Law" })
      .closest("[title]")
      ?.getAttribute("title");

    expect(tooltip).not.toMatch(NAMED_PERCENTILE);
    expect(tooltip).toContain("Activity target");
    expect(screen.getByLabelText("Activity").tagName).toBe("SELECT");
  });

  it("Settings description points at the Default Activity Target control", () => {
    usePreferencesStore.setState({ preferences: { ...DEFAULT_USER_PREFERENCES } });
    render(<PreferencesSection />);
    const description = screen.getByText(/^Clamp simulated activity durations/).textContent;

    expect(description).not.toMatch(NAMED_PERCENTILE);
    expect(description).toContain("Default Activity Target");
    expect(screen.getByLabelText("Default Activity Target").tagName).toBe("SELECT");
  });
});
