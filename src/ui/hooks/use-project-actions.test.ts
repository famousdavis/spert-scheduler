// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";

import { useProjectActions } from "./use-project-actions";
import { useProjectStore } from "./use-project-store";

/**
 * At 0% coverage before charter §3.2. Tier 1 — a single `useShallow` selector bundle.
 *
 * There is no logic to test, so the useful assertion is the CONTRACT: CLAUDE.md says
 * "keep the field set in sync with the page's destructure", and nothing enforced that.
 * A field silently dropped from this bundle becomes `undefined` at the ProjectPage call
 * site — a runtime error on click, not a compile error, because the page destructures
 * from an inferred type that simply loses the key.
 *
 * So this pins two things: every advertised key is present, and every one that should be
 * callable actually is.
 */

/** Every key ProjectPage relies on. Update deliberately, never to make a test pass. */
const EXPECTED_ACTIONS = [
  "loadProjects",
  "addScenario", "deleteScenario", "duplicateScenario",
  "addActivity", "insertActivityAfterActivity", "insertActivityAfterBand",
  "deleteActivity", "updateActivityField",
  "addBand", "deleteBand", "updateBand", "reorderWithBands",
  "setSimulationResults",
  "updateScenarioStartDate", "updateScenarioSettings",
  "renameProject", "renameScenario",
  "bulkUpdateActivities", "bulkDeleteActivities",
  "undo", "redo", "canUndo", "canRedo",
  "toggleScenarioLock",
  "addDependency", "removeDependency", "updateDependencyLag", "updateDependencyType",
  "addMilestone", "removeMilestone", "updateMilestone",
  "assignActivityToMilestone", "setActivityStartsAtMilestone",
  "updateProjectField", "updateGanttAppearance", "updateScenarioNotes",
  "reorderScenarios", "beginUndoGroup", "endUndoGroup",
] as const;

describe("useProjectActions", () => {
  it("exposes the projects array", () => {
    useProjectStore.setState({ projects: [] });
    const { result } = renderHook(() => useProjectActions());
    expect(Array.isArray(result.current.projects)).toBe(true);
  });

  it("exposes every action the page depends on, and all are callable", () => {
    const { result } = renderHook(() => useProjectActions());
    const bundle = result.current as unknown as Record<string, unknown>;

    const missing = EXPECTED_ACTIONS.filter((k) => typeof bundle[k] !== "function");
    expect(missing, `not exposed as functions: ${missing.join(", ")}`).toEqual([]);
  });

  it("carries nothing beyond projects and the expected actions", () => {
    // Catches the other direction: a field added here but never consumed adds a store
    // subscription that re-renders ProjectPage for no reason. CLAUDE.md calls this out
    // explicitly — "avoid pulling in subscriptions that aren't actually read".
    const { result } = renderHook(() => useProjectActions());
    const extra = Object.keys(result.current).filter(
      (k) => k !== "projects" && !(EXPECTED_ACTIONS as readonly string[]).includes(k),
    );
    expect(extra, `unexpected keys: ${extra.join(", ")}`).toEqual([]);
  });

  it("hands back the store's own function references, not copies", () => {
    const { result } = renderHook(() => useProjectActions());
    const store = useProjectStore.getState();
    expect(result.current.addActivity).toBe(store.addActivity);
    expect(result.current.undo).toBe(store.undo);
    expect(result.current.endUndoGroup).toBe(store.endUndoGroup);
  });

  it("keeps a stable identity across a re-render with no store change", () => {
    // The entire reason for useShallow — without it every render of ProjectPage would get
    // a new object and re-run everything downstream of it.
    const { result, rerender } = renderHook(() => useProjectActions());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it("re-issues the bundle when the projects array changes", () => {
    useProjectStore.setState({ projects: [] });
    const { result, rerender } = renderHook(() => useProjectActions());
    const first = result.current;

    useProjectStore.setState({
      projects: [{ id: "p1", name: "P1", scenarios: [] }] as never,
    });
    rerender();

    expect(result.current).not.toBe(first);
    expect(result.current.projects).toHaveLength(1);
  });
});
