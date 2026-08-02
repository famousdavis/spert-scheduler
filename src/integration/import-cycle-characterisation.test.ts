// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// ===========================================================================
// CHARACTERISATION — what happens today when a project JSON carrying a broken
// dependency graph is imported. §3.5, import validation, Phase 1.
//
// ⚠️ RECORDED, NOT SPECIFIED. Several assertions below pin behaviour that is
// KNOWN TO BE WRONG or at least unchosen. They are held so that the fix landing
// next is a demonstrated change rather than an asserted one — the #246 → #247
// pattern, where the tests that found a defect shipped first with the wrong
// behaviour pinned, and the fix then converted each pin into a proven guard.
// Each such assertion says so at its site. Do not "correct" one in place; change
// it in the PR that changes the behaviour, so the diff shows the transition.
//
// THE GAP, re-derived rather than inherited:
//   - `ActivityDependencySchema` (project.schema.ts) is four field validators —
//     id lengths, a type enum, a lag range — with NO `.refine()`.
//   - `export-import-service.ts` never mentions dependencies at all.
//   - Every OTHER write path guards with detectCycle: the CSV parser,
//     dependency-service, DependencyPanel, DependencyEditModal, ai-op-handlers.
//     Project JSON import is the one that does not.
// ===========================================================================

import { describe, it, expect } from "vitest";
import {
  createProject,
  createActivity,
  addActivityToScenario,
  addDependency,
} from "@app/api/project-service";
import { serializeExport, validateImport } from "@app/api/export-import-service";
import { buildDependencyGraph, detectCycle } from "@core/schedule/dependency-graph";
import { computeDependencySchedule } from "@core/schedule/deterministic";
import { runDependencyTrials } from "@core/simulation/monte-carlo";
import { isCalendarError } from "@core/calendar/work-calendar";
import { getScheduleErrorBanner } from "@ui/helpers/schedule-error-banner";
import type { Project, ActivityDependency, Scenario } from "@domain/models/types";

const START = "2026-03-02";

/**
 * A project whose scenario carries `deps` VERBATIM.
 *
 * The dependencies are assigned directly rather than through `addDependency`, and that
 * bypass is the whole point: `addDependency` refuses to create a cycle (asserted below),
 * so a cyclic scenario cannot be built through the app's own API. A hand-edited export, a
 * foreign cloud document or a third-party generator can still produce one.
 */
function projectWithDeps(build: (a: string, b: string) => ActivityDependency[]): {
  project: Project;
  scenario: Scenario;
  ids: [string, string];
} {
  const base = createProject("Cyclic Import Characterisation", START);
  const s0 = base.scenarios[0]!;
  const a = createActivity("A", s0.settings);
  const b = createActivity("B", s0.settings);
  const withActs = addActivityToScenario(addActivityToScenario(s0, a), b);
  const scenario: Scenario = {
    ...withActs,
    dependencies: build(a.id, b.id),
    settings: { ...withActs.settings, dependencyMode: true },
  };
  return { project: { ...base, scenarios: [scenario] }, scenario, ids: [a.id, b.id] };
}

const twoCycle = (a: string, b: string): ActivityDependency[] => [
  { fromActivityId: a, toActivityId: b, type: "FS", lagDays: 0 },
  { fromActivityId: b, toActivityId: a, type: "FS", lagDays: 0 },
];
const selfLoop = (a: string, _b: string): ActivityDependency[] => [
  { fromActivityId: a, toActivityId: a, type: "FS", lagDays: 0 },
];
const danglingRef = (a: string, _b: string): ActivityDependency[] => [
  { fromActivityId: a, toActivityId: "does-not-exist", type: "FS", lagDays: 0 },
];

/** Import a project through the real envelope path and return its scenario. */
function importAndGetScenario(project: Project): Scenario {
  const result = validateImport(serializeExport([project]), []);
  expect(result.success).toBe(true);
  if (!result.success) throw new Error("unreachable — asserted above");
  return result.projects[0]!.scenarios[0]!;
}

describe("import characterisation — a broken dependency graph in a project JSON", () => {
  // -- premises -------------------------------------------------------------
  // Every observation below is worthless if the fixtures are not the shapes they
  // claim. A payload that failed to be cyclic would import cleanly and schedule
  // cleanly, and would "prove" the opposite of what it is named for.

  it("PREMISE: the app's own API refuses to build the cycle, so the fixture had to bypass it", () => {
    const { scenario, ids } = projectWithDeps(() => []);
    const [a, b] = ids;
    const one = addDependency(scenario, a, b, "FS", 0);
    expect(one.dependencies).toHaveLength(1);
    // detectCycle rejects the closing edge: addDependency returns the scenario unchanged.
    expect(addDependency(one, b, a, "FS", 0).dependencies).toHaveLength(1);
  });

  it("PREMISE: the 2-cycle fixture is genuinely cyclic and the self-loop genuinely is not", () => {
    // dependency-graph.ts continues on `from === to`, so a self-edge never enters
    // inDegree and Kahn's sort completes. Measured, not assumed — the charter's §3.5
    // corrected an earlier claim that all cycles passed through.
    const { ids } = projectWithDeps(twoCycle);
    const [a, b] = ids;
    expect(() => buildDependencyGraph([a, b], twoCycle(a, b))).toThrow(/cycle/i);
    expect(() => buildDependencyGraph([a, b], selfLoop(a, b))).not.toThrow();
  });

  // -- the gap itself -------------------------------------------------------

  it("RECORDED, NOT SPECIFIED: a genuinely cyclic project imports cleanly, edges intact", () => {
    // ⚠️ This is the gap. The decision taken (2026-08-02) is to DETECT AND REPORT at
    // import while importing the project unmodified — so `dependencies` staying at 2 is
    // expected to REMAIN true after the fix, and only the reporting changes. Rejection
    // and silent repair were both considered and declined.
    const { project } = projectWithDeps(twoCycle);
    const s = importAndGetScenario(project);
    expect(s.dependencies).toHaveLength(2);
    expect(detectCycle(s.activities.map((a) => a.id), s.dependencies)).toBeTruthy();
  });

  it("RECORDED, NOT SPECIFIED: a dangling activity reference also imports cleanly", () => {
    // ⚠️ NOT a cycle, and detectCycle will never catch it — the id simply resolves to
    // nothing. ActivityDependencySchema validates that the ids are 1–64 character
    // strings, never that they refer to an activity that exists. Same product answer as
    // the cycle: report it, import unmodified.
    const { project } = projectWithDeps(danglingRef);
    const s = importAndGetScenario(project);
    expect(s.dependencies).toHaveLength(1);
    expect(s.dependencies[0]!.toActivityId).toBe("does-not-exist");
    const ids = new Set(s.activities.map((a) => a.id));
    expect(ids.has(s.dependencies[0]!.toActivityId)).toBe(false);
    // ...and it is invisible to the cycle detector, which is why it needs its own check.
    expect(detectCycle(s.activities.map((a) => a.id), s.dependencies)).toBeFalsy();
  });

  // -- what the user actually hits afterwards -------------------------------

  it("an imported 2-cycle throws in BOTH engines — deterministic and Monte Carlo", () => {
    const { project } = projectWithDeps(twoCycle);
    const s = importAndGetScenario(project);
    expect(() =>
      computeDependencySchedule(s.activities, s.dependencies, START, 0.5)
    ).toThrow(/cycle/i);
    expect(() =>
      runDependencyTrials({
        activities: s.activities,
        dependencies: s.dependencies,
        trialCount: 1000,
        rngSeed: "characterisation",
      })
    ).toThrow(/cycle/i);
  });

  it("a self-loop and a dangling reference both schedule and simulate without complaint", () => {
    // The contrast that gives the assertion above its meaning: the app is not simply
    // failing on any unusual graph.
    for (const build of [selfLoop, danglingRef]) {
      const { project } = projectWithDeps(build);
      const s = importAndGetScenario(project);
      expect(() =>
        computeDependencySchedule(s.activities, s.dependencies, START, 0.5)
      ).not.toThrow();
      expect(() =>
        runDependencyTrials({
          activities: s.activities,
          dependencies: s.dependencies,
          trialCount: 1000,
          rngSeed: "characterisation",
        })
      ).not.toThrow();
    }
  });

  // -- what the user is TOLD ------------------------------------------------

  it("RECORDED, NOT SPECIFIED — and KNOWN WRONG: a cycle is given estimates advice", () => {
    // ⚠️ HELD DELIBERATELY, AND IT IS WRONG. This asserts the real
    // getScheduleErrorBanner (imported from the app, not reimplemented here — an
    // earlier draft of this file recomputed the branch from isCalendarError and
    // therefore pinned nothing at all).
    //
    // getScheduleErrorBanner branches ONLY on isCalendarError. A dependency cycle is
    // not a calendar error, so it falls to the generic branch and the user is told to
    // "Check the affected activity's estimates and settings." The estimates are fine.
    // The graph is circular. The advice points at the wrong place entirely.
    //
    // This pin exists so the third branch landing next is a demonstrated change.
    const { project } = projectWithDeps(twoCycle);
    const s = importAndGetScenario(project);

    let caught: unknown = null;
    try {
      computeDependencySchedule(s.activities, s.dependencies, START, 0.5);
    } catch (e) {
      caught = e;
    }
    // Premise: the error really is the cycle error, and really is not a calendar error.
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toMatch(/cycle/i);
    expect(isCalendarError(caught)).toBe(false);

    // ProjectPage builds exactly this, from exactly this input.
    const banner = getScheduleErrorBanner({
      message: (caught as Error).message,
      isCalendarError: isCalendarError(caught),
    });
    expect(banner).not.toBeNull();
    expect(banner!.heading).toBe("Schedule Error");
    expect(banner!.message).toMatch(/cycle/i);
    expect(banner!.advice).toBe("Check the affected activity's estimates and settings.");
  });

  it("the calendar branch is unaffected — the wrong advice is specific to the other branch", () => {
    const banner = getScheduleErrorBanner({ message: "bad work week", isCalendarError: true });
    expect(banner!.heading).toBe("Calendar Configuration Error");
    expect(banner!.advice).toBe("Check your work week settings in Settings.");
  });

  it("no error yields no banner", () => {
    expect(getScheduleErrorBanner(null)).toBeNull();
  });
});
