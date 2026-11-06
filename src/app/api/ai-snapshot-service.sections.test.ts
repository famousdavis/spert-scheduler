// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import { buildProjectSnapshot, truncateSnapshotToBudget } from "./ai-snapshot-service";
import { createActivity, createProject, createScenario } from "./project-service";
import { sanitizeForFirestore } from "@infrastructure/firebase/firestore-sanitize";
import { createSampleProject } from "@domain/data/sample-project";
import { DEFAULT_SCENARIO_SETTINGS, type Activity, type ActivityBand, type Project, type Scenario } from "@domain/models/types";

function act(id: string): Activity {
  return { ...createActivity(id, DEFAULT_SCENARIO_SETTINGS), id, name: id, min: 3, mostLikely: 5, max: 7, distributionType: "triangular" };
}
const band = (id: string, name: string, before: string | null, color?: string): ActivityBand => ({ id, name, insertBeforeActivityId: before, color });
function snapshotOf(ids: string[], bands: ActivityBand[] | undefined) {
  const s: Scenario = { ...createScenario("S1", "2026-11-02"), activities: ids.map(act), bands };
  const project: Project = { ...createProject("P", "2026-11-02"), scenarios: [s] };
  return buildProjectSnapshot(project, undefined, s.id, 0, undefined, "2026-11-05");
}
const sections = (ids: string[], bands: ActivityBand[] | undefined) => snapshotOf(ids, bands).scenarios[0]!.sections;

describe("the snapshot's sections (WI-162)", () => {
  it("lists them in ON-SCREEN order, not the stored array's", () => {
    const list = sections(["a1", "a2", "a3"], [band("late", "Late", "a3"), band("end", "End", null), band("early", "Early", "a1"), band("mid", "Mid", "a3")]);
    expect(list.map((s) => s.id)).toEqual(["early", "late", "mid", "end"]);
  });
  it("is an empty array when the scenario has none, stored as [] or absent: a missing key means an older tab", () => {
    expect(sections(["a1"], [])).toEqual([]);
    expect(sections(["a1"], undefined)).toEqual([]);
  });
  it("gives each what it groups: the first activity below, the last, and how many", () => {
    expect(sections(["a1", "a2", "a3", "a4"], [band("h1", "One", "a2"), band("h2", "Two", "a4")])).toEqual([
      { id: "h1", name: "One", color: "none", beforeActivityId: "a2", lastActivityId: "a3", activityCount: 2 },
      { id: "h2", name: "Two", color: "none", beforeActivityId: "a4", lastActivityId: "a4", activityCount: 1 },
    ]);
  });
  it("a header directly above another groups nothing, and both name the activity below them", () => {
    expect(sections(["a1"], [band("h1", "One", "a1"), band("h2", "Two", "a1")])).toEqual([
      { id: "h1", name: "One", color: "none", beforeActivityId: "a1", activityCount: 0 },
      { id: "h2", name: "Two", color: "none", beforeActivityId: "a1", lastActivityId: "a1", activityCount: 1 },
    ]);
  });
  it("a header at the end, or above an activity no longer there, reads null, as it renders", () => {
    expect(sections(["a1"], [band("h1", "One", null), band("h2", "Ghost", "gone")])).toEqual([
      { id: "h1", name: "One", color: "none", beforeActivityId: null, activityCount: 0 },
      { id: "h2", name: "Ghost", color: "none", beforeActivityId: null, activityCount: 0 },
    ]);
  });
  it("names a colour by its swatch, whatever the case of the stored hex, and shows any other colour as itself", () => {
    const list = sections(["a1"], [band("h1", "A", "a1", "#94a3b8"), band("h2", "B", "a1", "#94A3B8"), band("h3", "C", "a1", "#123456"), band("h4", "D", "a1")]);
    expect(list.map((s) => s.color)).toEqual(["Slate", "Slate", "#123456", "none"]);
  });
  it("shows the raw name: an unnamed header is \"\", never a placeholder", () => {
    expect(sections(["a1"], [band("h1", "", "a1")])[0]!.name).toBe("");
  });
  it("copies each field by name (AI-7): a field added to a band later does not reach the AI", () => {
    const extra = { ...band("h1", "One", "a1"), secret: "not for the AI" } as ActivityBand;
    expect(JSON.stringify(sections(["a1"], [extra]))).not.toContain("not for the AI");
  });
  it("keeps null through the Firestore sanitizer, which drops only undefined", () => {
    const clean = sanitizeForFirestore(snapshotOf(["a1"], [band("h1", "One", null)]));
    expect(clean.scenarios[0]!.sections[0]!.beforeActivityId).toBeNull();
    expect("lastActivityId" in clean.scenarios[0]!.sections[0]!).toBe(false);
  });
  it("survives both truncation stages whole", () => {
    const s = snapshotOf(["a1", "a2"], [band("h1", "One", "a1", "#7dd3fc")]);
    const cut = truncateSnapshotToBudget(s, 1);
    expect(cut).not.toBe(s);
    expect(cut.scenarios[0]!.activities[0]!.min).toBeUndefined();
    expect(cut.scenarios[0]!.sections).toEqual(s.scenarios[0]!.sections);
  });
  it("shows the sample project's eight Sections, in order, counting its forty activities once", () => {
    const project = createSampleProject("2026-11-02");
    const scenario = project.scenarios[0]!;
    const list = buildProjectSnapshot(project, undefined, scenario.id, 0, undefined, "2026-11-05").scenarios[0]!.sections;
    expect(list).toHaveLength(8);
    expect(list.map((s) => s.activityCount).reduce((a, b) => a + b, 0)).toBe(scenario.activities.length);
    expect(list[0]!.beforeActivityId).toBe(scenario.activities[0]!.id);
  });
});
