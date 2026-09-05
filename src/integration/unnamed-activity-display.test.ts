// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import { nameOrUnnamed, UNNAMED_LABEL } from "@domain/helpers/display-name";
import { activityDisplayName, buildActivityTooltip } from "@ui/charts/gantt-utils";
import { buildGridRows } from "@app/api/schedule-export-service";
import { serializeExport } from "@app/api/export-import-service";
import {
  buildScenarioSnapshot,
  buildProjectSnapshot,
  classifyAndComputeScenario,
  truncateSnapshotToBudget,
} from "@app/api/ai-snapshot-service";
import {
  createProject,
  createActivity,
  addActivityToScenario,
} from "@app/api/project-service";
import { computeDeterministicSchedule } from "@core/schedule/deterministic";
import type { Project } from "@domain/models/types";

/**
 * `(unnamed)` is a DISPLAY substitution. The two halves of that sentence are
 * tested here: it reaches the surfaces a person reads, and it never reaches the
 * two places where it would become data.
 */

function projectWithActivityNamed(name: string): Project {
  const project = createProject("Display Fixture", "2026-09-07");
  const scenario = project.scenarios[0]!;
  return {
    ...project,
    scenarios: [addActivityToScenario(scenario, createActivity(name, scenario.settings))],
  };
}

describe("nameOrUnnamed", () => {
  it.each(["", " ", "   ", "\t", "\n", " \t\n "])("substitutes for %j", (name) => {
    expect(nameOrUnnamed(name)).toBe(UNNAMED_LABEL);
  });

  it.each(["Design", " Design ", "(unnamed)", "0"])("leaves %j alone", (name) => {
    expect(nameOrUnnamed(name)).toBe(name);
  });

  it("handles a missing name without throwing", () => {
    expect(nameOrUnnamed(undefined)).toBe(UNNAMED_LABEL);
  });
});

describe("the Gantt seam", () => {
  const base = {
    name: "",
    activityId: "a1",
    activityIndexMap: null as Map<string, number> | null,
    startDate: "2026-09-07",
    endDate: "2026-09-09",
    duration: 3,
    totalFloat: undefined as number | undefined,
    freeFloat: undefined as number | undefined,
    dependencyMode: false,
    formatDate: (iso: string) => iso,
  };

  it("labels an unnamed bar", () => {
    expect(activityDisplayName("", "a1", null)).toBe(UNNAMED_LABEL);
  });

  it("keeps the #n prefix when activity numbering is on", () => {
    const map = new Map([["a1", 3]]);
    expect(activityDisplayName("", "a1", map)).toBe(`#3 ${UNNAMED_LABEL}`);
  });

  it("no longer produces a tooltip that begins with a colon", () => {
    // Was ": 2026-09-07 – 2026-09-09 (3d)".
    expect(buildActivityTooltip(base)).toBe(`${UNNAMED_LABEL}: 2026-09-07 – 2026-09-09 (3d)`);
  });

  it("control: a named bar is untouched", () => {
    expect(buildActivityTooltip({ ...base, name: "Build" })).toBe(
      "Build: 2026-09-07 – 2026-09-09 (3d)",
    );
  });
});

describe("the schedule export (XLSX and CSV share this builder)", () => {
  function rowsFor(name: string) {
    const project = projectWithActivityNamed(name);
    const scenario = project.scenarios[0]!;
    return buildGridRows({
      projectName: project.name,
      scenarioName: scenario.name,
      startDate: scenario.startDate,
      activities: scenario.activities,
      schedule: computeDeterministicSchedule(
        scenario.activities,
        scenario.startDate,
        scenario.settings.probabilityTarget,
      ),
      buffer: null,
      settings: scenario.settings,
      dependencies: scenario.dependencies,
      milestones: scenario.milestones,
      dateFormat: "MM/DD/YYYY",
    });
  }

  it("writes the placeholder rather than a blank name cell", () => {
    expect(rowsFor("").map((r) => r.name)).toEqual([UNNAMED_LABEL]);
  });

  it("control: a real name is written verbatim", () => {
    expect(rowsFor("Design").map((r) => r.name)).toEqual(["Design"]);
  });
});

describe("what must stay RAW", () => {
  // ⚠️ These two are the "never writes" half of the rule, and they are the
  // reason the helper is applied per-surface instead of once at the source.
  it("JSON export carries the empty name, not the placeholder", () => {
    // A round-trip through the placeholder would turn it into a real stored
    // name that the user then has to find and delete.
    const json = serializeExport([projectWithActivityNamed("")]);

    expect(JSON.parse(json).projects[0].scenarios[0].activities[0].name).toBe("");
    expect(json).not.toContain(UNNAMED_LABEL);
  });

  it("the AI snapshot shows the empty name, not the placeholder", () => {
    // The AI has to be able to SEE that an activity is unnamed — renaming one is
    // the thing it is most likely to be asked to do. A placeholder here would be
    // indistinguishable from an activity someone named "(unnamed)".
    const scenario = projectWithActivityNamed("").scenarios[0]!;
    const snapshot = buildScenarioSnapshot(scenario, classifyAndComputeScenario(scenario));

    expect(JSON.stringify(snapshot)).not.toContain(UNNAMED_LABEL);
    expect(JSON.stringify(snapshot)).toContain('"name":""');
  });

  it("the AI snapshot stays raw down the TRUNCATION path too", () => {
    // ⚠️ `minimalActivity` is a SECOND place a name is written into the
    // snapshot, reached only when the project exceeds the size budget. The
    // assertion above cannot see it: it exercises `buildActivitySnapshot`
    // only, and a falsification run proved it stayed green while the helper
    // was applied here. Found by falsifying against the wrong site — the
    // reason this case exists.
    const project = projectWithActivityNamed("");
    const snapshot = buildProjectSnapshot(project, undefined, null, 0);

    // budget 0 forces both reduction passes, so minimalActivity really runs.
    const truncated = truncateSnapshotToBudget(snapshot, 0);

    const json = JSON.stringify(truncated);
    expect(json).not.toContain(UNNAMED_LABEL);
    expect(json).toContain('"name":""');
  });

  it("control: the snapshot does carry a real name, so the check can fail", () => {
    const scenario = projectWithActivityNamed("Design").scenarios[0]!;
    const snapshot = buildScenarioSnapshot(scenario, classifyAndComputeScenario(scenario));

    expect(JSON.stringify(snapshot)).toContain("Design");
  });
});
