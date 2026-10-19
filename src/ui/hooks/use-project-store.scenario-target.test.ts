// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach } from "vitest";
import { useProjectStore } from "./use-project-store";
import { createActivity, createProject, createScenario, addActivityToScenario } from "@app/api/project-service";
import { runSimulationSync } from "@app/api/simulation-service";
import { buildSimulationParams } from "@ui/helpers/build-simulation-params";
import type { Project, Scenario } from "@domain/models/types";

/**
 * WI-124 (owner ruling, 2026-10-16): each scenario keeps its own Finish Target date, and whether the Gantt shows it
 * stays one choice for the whole project. Here: the store's setter — the scenario it names and no other, its lock,
 * its undo entry, its runs left alone — its effect on that one choice, and every path that makes a scenario.
 *
 * ⚠️ The choice is turned off only when no scenario of the project has a date left — the owner's ruling (2026-10-18),
 * which the tests that pin it name in their titles.
 */

const DEC = "2026-12-18";
const JAN = "2027-01-29";
const MAR = "2027-03-31";
/** A scenario with no date: the key is absent, as on every new scenario. */
const ABSENT = "(no key)";

const store = () => useProjectStore.getState();
const projectOf = (id: string): Project => store().projects.find((p) => p.id === id)!;

/**
 * Each scenario's date — a date, or null — or ABSENT where it holds none. An in-memory key holding `undefined` (a copy
 * of a scenario with none) counts as absent: neither JSON nor Firestore keeps it.
 */
function datesOf(project: { scenarios: readonly object[] }): unknown[] {
  return project.scenarios.map((s) => {
    const date = (s as Record<string, unknown>).targetFinishDate;
    return date === undefined ? ABSENT : date;
  });
}

/** A project of scenarios with these dates (undefined: none), put in the store with an empty undo history. */
function seed(dates: Array<string | undefined>, extra: Partial<Project> = {}): Project {
  const base = createProject("Kestrel Ledger", "2026-11-02");
  const scenarios = dates.map((date, i) => ({
    ...createScenario(`Scenario ${i + 1}`, "2026-11-02"),
    ...(date === undefined ? {} : { targetFinishDate: date }),
  }));
  const project: Project = { ...base, ...extra, scenarios };
  useProjectStore.setState({ projects: [project], undoStack: [], redoStack: [] });
  return project;
}

/** The store's setter for one scenario's date, which 0.77.2 did not have. */
function setTargetIn(projectId: string, scenarioId: string, date: string | null): void {
  const setter = store().updateScenarioTargetFinishDate;
  expect(setter, "the store sets one scenario's Finish Target date").toBeTypeOf("function");
  setter(projectId, scenarioId, date);
}

/** A scenario carrying a real run. */
function withRun(scenario: Scenario): Scenario {
  const s = addActivityToScenario(scenario, { ...createActivity("Pallet audit", scenario.settings), min: 2, mostLikely: 4, max: 9 });
  const params = buildSimulationParams(
    s.activities, false, s.settings.probabilityTarget, s.dependencies, s.milestones, s.startDate, undefined, true,
  );
  const run = runSimulationSync(s.activities, 1000, "kestrel", params.deterministicDurations, params.dependencyParams, params.sequentialConstraints);
  return { ...s, simulationResults: run };
}

beforeEach(() => {
  localStorage.clear();
  useProjectStore.setState({ projects: [], loadError: false, loadErrors: [], undoStack: [], redoStack: [] });
});

describe("the per-scenario setter", () => {
  it("sets the date of the scenario it names and no other's; the project keeps no date of its own", () => {
    const p = seed([undefined, undefined, undefined]);
    setTargetIn(p.id, p.scenarios[1]!.id, DEC);
    expect(datesOf(projectOf(p.id))).toEqual([ABSENT, DEC, ABSENT]);
    expect("targetFinishDate" in projectOf(p.id)).toBe(false);
  });

  it("keeps each scenario's own date through changes to another's", () => {
    const p = seed([undefined, undefined, undefined]);
    setTargetIn(p.id, p.scenarios[0]!.id, DEC);
    setTargetIn(p.id, p.scenarios[1]!.id, JAN);
    setTargetIn(p.id, p.scenarios[0]!.id, MAR);
    expect(datesOf(projectOf(p.id))).toEqual([MAR, JAN, ABSENT]);
  });

  it("keeps the scenario's run: a target date is not a simulation input", () => {
    const p = seed([undefined]);
    const ran = withRun(p.scenarios[0]!);
    useProjectStore.setState({ projects: [{ ...p, scenarios: [ran] }] });
    setTargetIn(p.id, ran.id, DEC);
    expect(projectOf(p.id).scenarios[0]!.simulationResults).toBe(ran.simulationResults);
  });

  it("saves the dates in the scenarios, schema 25, nothing on the project", () => {
    const p = seed([undefined, undefined]);
    setTargetIn(p.id, p.scenarios[1]!.id, JAN);
    const saved = JSON.parse(localStorage.getItem(`spert:project:local:${p.id}`)!) as Project;
    expect(saved.schemaVersion).toBe(25);
    expect(datesOf(saved)).toEqual([ABSENT, JAN]);
    expect("targetFinishDate" in saved).toBe(false);
  });

  it("refuses a locked scenario: no change, and no undo entry", () => {
    const p = seed([undefined, JAN]);
    useProjectStore.setState({ projects: [{ ...p, scenarios: [p.scenarios[0]!, { ...p.scenarios[1]!, locked: true }] }] });
    setTargetIn(p.id, p.scenarios[1]!.id, DEC);
    setTargetIn(p.id, p.scenarios[1]!.id, null);
    expect(datesOf(projectOf(p.id))).toEqual([ABSENT, JAN]);
    expect(store().undoStack).toHaveLength(0);
  });

  it("a date set in another scenario leaves the locked scenario's own date", () => {
    const p = seed([undefined, JAN]);
    useProjectStore.setState({ projects: [{ ...p, scenarios: [p.scenarios[0]!, { ...p.scenarios[1]!, locked: true }] }] });
    setTargetIn(p.id, p.scenarios[0]!.id, DEC);
    expect(datesOf(projectOf(p.id))).toEqual([DEC, JAN]);
  });

  it("is one undo entry: undo restores the scenario's previous date, redo puts it back", () => {
    const p = seed([DEC, JAN]);
    setTargetIn(p.id, p.scenarios[0]!.id, MAR);
    expect(store().undoStack).toHaveLength(1);
    store().undo();
    expect(datesOf(projectOf(p.id))).toEqual([DEC, JAN]);
    store().redo();
    expect(datesOf(projectOf(p.id))).toEqual([MAR, JAN]);
  });
});

describe("'show target on Gantt', one choice for the project (turned off only when no date is left: owner ruling, 2026-10-18)", () => {
  it("stays on when one scenario's date is cleared while another scenario has one", () => {
    const p = seed([DEC, JAN], { showTargetOnGantt: true });
    setTargetIn(p.id, p.scenarios[1]!.id, null);
    expect(projectOf(p.id).showTargetOnGantt).toBe(true);
  });

  it("turns off when the project's last date is cleared, and one undo brings back the date and the choice", () => {
    const p = seed([DEC, undefined], { showTargetOnGantt: true });
    setTargetIn(p.id, p.scenarios[0]!.id, null);
    expect(projectOf(p.id).showTargetOnGantt).toBe(false);
    store().undo();
    expect(datesOf(projectOf(p.id))).toEqual([DEC, ABSENT]);
    expect(projectOf(p.id).showTargetOnGantt).toBe(true);
  });

  it("a project of one scenario, as before: clearing its date turns the choice off", () => {
    const p = seed([DEC], { showTargetOnGantt: true });
    setTargetIn(p.id, p.scenarios[0]!.id, null);
    expect(projectOf(p.id).showTargetOnGantt).toBe(false);
  });

  it("is never turned ON by setting a date", () => {
    const p = seed([undefined, undefined], { showTargetOnGantt: false });
    setTargetIn(p.id, p.scenarios[0]!.id, DEC);
    expect(projectOf(p.id).showTargetOnGantt).toBe(false);
  });
});

describe("the paths that make a scenario", () => {
  it("a new scenario made from another starts with that scenario's date", () => {
    const p = seed([DEC, JAN]);
    // The first scenario locked, as a baseline is: its copy must take its date too.
    useProjectStore.setState({ projects: [{ ...p, scenarios: [{ ...p.scenarios[0]!, locked: true }, p.scenarios[1]!] }] });
    const copyId = store().duplicateScenario(p.id, p.scenarios[1]!.id, "Scenario 2 (Copy)")!;
    const lockedCopyId = store().duplicateScenario(p.id, p.scenarios[0]!.id, "Scenario 1 (Copy)")!;
    const scenarioOf = (id: string) => projectOf(p.id).scenarios.find((s) => s.id === id)!;
    expect(datesOf({ scenarios: [scenarioOf(copyId)] })).toEqual([JAN]);
    expect(scenarioOf(p.scenarios[0]!.id).locked, "the source is locked").toBe(true);
    expect(datesOf({ scenarios: [scenarioOf(lockedCopyId)] }), "the copy of the locked scenario").toEqual([DEC]);
  });

  it("control: a new scenario made from one with no date has none", () => {
    const p = seed([DEC, undefined]);
    const copyId = store().duplicateScenario(p.id, p.scenarios[1]!.id, "Scenario 2 (Copy)")!;
    const copy = projectOf(p.id).scenarios.find((s) => s.id === copyId)!;
    expect(datesOf({ scenarios: [copy] })).toEqual([ABSENT]);
  });

  it("Clone Project copies each scenario's own date", () => {
    const p = seed([DEC, JAN, undefined], { showTargetOnGantt: true });
    const clone = store().cloneProject(p.id, null)!;
    expect(datesOf(clone)).toEqual([DEC, JAN, ABSENT]);
    expect("targetFinishDate" in clone).toBe(false);
    expect(clone.showTargetOnGantt).toBe(true);
  });

  it("control: New Project starts with none", () => {
    const created = store().addProject("Heron Plinth", null);
    expect(datesOf(projectOf(created.id))).toEqual([ABSENT]);
  });

  it("control: a scenario added to a project — the page's backfill — starts with none, not another's date", () => {
    const p = seed([DEC]);
    store().addScenario(p.id, "Baseline", "2026-11-09");
    expect(datesOf(projectOf(p.id))).toEqual([DEC, ABSENT]);
  });

  it("control: a scenario Import Activities adds to a project starts with none", () => {
    const p = seed([DEC]);
    store().importScenarioToProject(p.id, createScenario("Imported rows", "2026-11-16"));
    expect(datesOf(projectOf(p.id))).toEqual([DEC, ABSENT]);
  });

  it("control: the sample project starts with none", async () => {
    const sample = await store().loadSampleProject(null);
    expect(sample).not.toBeNull();
    expect(new Set(datesOf(projectOf(sample!.id)))).toEqual(new Set([ABSENT]));
  });
});
