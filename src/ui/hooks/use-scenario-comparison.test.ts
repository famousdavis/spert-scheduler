// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { useScenarioComparison } from "./use-scenario-comparison";
import type { Scenario } from "@domain/models/types";

/**
 * At 0% coverage before charter §3.2. Pure local state — no providers, no storage, no
 * network. It was untested because nothing forced it to be, not because anything made it
 * hard.
 */

const scenario = (id: string): Scenario => ({ id, name: `Scenario ${id}` }) as Scenario;

const SCENARIOS = ["s1", "s2", "s3", "s4"].map(scenario);

const setup = (scenarios: Scenario[] = SCENARIOS) =>
  renderHook(() => useScenarioComparison(scenarios));

describe("useScenarioComparison", () => {
  it("starts with compare mode off, nothing selected, and no comparison list", () => {
    const { result } = setup();
    expect(result.current.compareMode).toBe(false);
    expect(result.current.selectedForCompare.size).toBe(0);
    expect(result.current.compareScenarios).toEqual([]);
  });

  describe("selection", () => {
    it("adds a scenario on first toggle and removes it on the second", () => {
      const { result } = setup();

      act(() => result.current.handleToggleCompare("s1"));
      expect(result.current.selectedForCompare.has("s1")).toBe(true);

      act(() => result.current.handleToggleCompare("s1"));
      expect(result.current.selectedForCompare.has("s1")).toBe(false);
    });

    it("caps the selection at three", () => {
      const { result } = setup();

      act(() => {
        result.current.handleToggleCompare("s1");
        result.current.handleToggleCompare("s2");
        result.current.handleToggleCompare("s3");
      });
      expect(result.current.selectedForCompare.size).toBe(3);

      act(() => result.current.handleToggleCompare("s4"));
      expect(result.current.selectedForCompare.size).toBe(3);
      expect(result.current.selectedForCompare.has("s4")).toBe(false);
    });

    it("frees a slot when one is deselected at the cap", () => {
      const { result } = setup();
      act(() => {
        result.current.handleToggleCompare("s1");
        result.current.handleToggleCompare("s2");
        result.current.handleToggleCompare("s3");
      });

      act(() => result.current.handleToggleCompare("s2"));
      act(() => result.current.handleToggleCompare("s4"));

      expect(result.current.selectedForCompare.size).toBe(3);
      expect(result.current.selectedForCompare.has("s4")).toBe(true);
      expect(result.current.selectedForCompare.has("s2")).toBe(false);
    });
  });

  describe("compare mode", () => {
    it("toggles on and off", () => {
      const { result } = setup();
      act(() => result.current.handleToggleCompareMode());
      expect(result.current.compareMode).toBe(true);
      act(() => result.current.handleToggleCompareMode());
      expect(result.current.compareMode).toBe(false);
    });

    it("clears the selection when switching ON, but NOT when switching off", () => {
      // The asymmetry is deliberate in the implementation — the reset is inside the
      // `if (!prev)` branch — and it is the kind of thing a refactor would silently
      // make symmetric.
      const { result } = setup();

      act(() => result.current.handleToggleCompare("s1"));
      act(() => result.current.handleToggleCompareMode()); // off -> on: clears
      expect(result.current.selectedForCompare.size).toBe(0);

      act(() => result.current.handleToggleCompare("s2"));
      act(() => result.current.handleToggleCompareMode()); // on -> off: keeps
      expect(result.current.compareMode).toBe(false);
      expect(result.current.selectedForCompare.has("s2")).toBe(true);
    });
  });

  describe("compareScenarios", () => {
    it("stays empty while compare mode is off, even with scenarios selected", () => {
      const { result } = setup();
      act(() => result.current.handleToggleCompare("s1"));
      expect(result.current.selectedForCompare.has("s1")).toBe(true);
      expect(result.current.compareScenarios).toEqual([]);
    });

    it("lists the selected scenarios once compare mode is on", () => {
      const { result } = setup();
      act(() => result.current.handleToggleCompareMode());
      act(() => {
        result.current.handleToggleCompare("s1");
        result.current.handleToggleCompare("s3");
      });
      expect(result.current.compareScenarios.map((s) => s.id)).toEqual(["s1", "s3"]);
    });

    it("follows the order of the scenarios array, not the order they were selected", () => {
      const { result } = setup();
      act(() => result.current.handleToggleCompareMode());
      act(() => {
        result.current.handleToggleCompare("s3");
        result.current.handleToggleCompare("s1");
      });
      expect(result.current.compareScenarios.map((s) => s.id)).toEqual(["s1", "s3"]);
    });

    it("drops a selected scenario that no longer exists", () => {
      const { result, rerender } = renderHook(
        ({ scenarios }) => useScenarioComparison(scenarios),
        { initialProps: { scenarios: SCENARIOS } },
      );
      act(() => result.current.handleToggleCompareMode());
      act(() => {
        result.current.handleToggleCompare("s1");
        result.current.handleToggleCompare("s4");
      });

      rerender({ scenarios: SCENARIOS.filter((s) => s.id !== "s4") });

      expect(result.current.compareScenarios.map((s) => s.id)).toEqual(["s1"]);
      // The id stays in the selection set — the filter is what protects the render.
      expect(result.current.selectedForCompare.has("s4")).toBe(true);
    });
  });
});
