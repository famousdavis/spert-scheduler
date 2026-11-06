// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import { cloneScenario, createActivity, createScenario } from "./project-service";
import { buildRenderList } from "@ui/helpers/band-utils";
import { DEFAULT_SCENARIO_SETTINGS, type Activity, type ActivityBand, type Scenario } from "@domain/models/types";

/**
 * WI-165: a reforecast copy drops Complete activities. A Section whose FIRST activity was one of them
 * used to fall to the bottom of the copy, because the copy read "no such activity" as null. It now
 * starts at the next activity left, as a delete does, and a Section with nothing left stays above
 * what came after it, or goes to the end when nothing did.
 */
function act(id: string, over: Partial<Activity> = {}): Activity {
  return { ...createActivity(id, DEFAULT_SCENARIO_SETTINGS), id, name: id, min: 3, mostLikely: 5, max: 7, distributionType: "triangular", ...over };
}
const done = (id: string) => act(id, { status: "complete", actualStartDate: "2026-11-02", actualFinishDate: "2026-11-03", actualDuration: 2 });
const band = (id: string, name: string, before: string | null): ActivityBand => ({ id, name, insertBeforeActivityId: before });
const scen = (activities: Activity[], bands: ActivityBand[]): Scenario => ({ ...createScenario("S1", "2026-11-02"), activities, bands });
const rows = (s: Scenario) => {
  const names = new Map(s.activities.map((a) => [a.id, a.name]));
  return buildRenderList(s.activities, s.bands ?? []).map((r) => (r.kind === "band" ? `[${r.band.name}]` : names.get(r.activity.id))).join(" ");
};
const reforecast = (s: Scenario) => cloneScenario(s, "Reforecast", { dropCompleted: true, reforecastFrom: "2026-11-05" });

describe("a reforecast copy keeps each Section above what it groups (WI-165)", () => {
  it("a Section whose first activity was dropped starts at the next one left", () => {
    const s = scen([done("c1"), act("a2"), act("a3")], [band("p1", "Phase 1", "c1"), band("p2", "Phase 2", "a3")]);
    expect(rows(reforecast(s))).toBe("[Phase 1] a2 [Phase 2] a3");
  });
  it("a Section with every activity dropped stays above what followed it, as an empty header", () => {
    const s = scen([done("c1"), done("c2"), act("a3")], [band("p1", "Phase 1", "c1"), band("p2", "Phase 2", "a3")]);
    expect(rows(reforecast(s))).toBe("[Phase 1] [Phase 2] a3");
  });
  it("goes to the end when nothing is left below it", () => {
    const s = scen([act("a1"), done("c2")], [band("p1", "Phase 1", "a1"), band("p2", "Phase 2", "c2")]);
    expect(rows(reforecast(s))).toBe("[Phase 1] a1 [Phase 2]");
  });
  it("a header at the end stays at the end, and the copy's anchors are its own ids", () => {
    const s = scen([done("c1"), act("a2")], [band("p1", "Phase 1", "c1"), band("p2", "End", null)]);
    const copy = reforecast(s);
    expect(rows(copy)).toBe("[Phase 1] a2 [End]");
    expect(copy.bands![0]!.insertBeforeActivityId).toBe(copy.activities[0]!.id);
    expect(copy.bands![0]!.id).not.toBe("p1");
  });
  it("a plain copy, which drops nothing, keeps the layout", () => {
    const s = scen([done("c1"), act("a2"), act("a3")], [band("p1", "Phase 1", "c1"), band("p2", "Phase 2", "a3")]);
    expect(rows(cloneScenario(s, "Copy"))).toBe("[Phase 1] c1 a2 [Phase 2] a3");
  });
});
