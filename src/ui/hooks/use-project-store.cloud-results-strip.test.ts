// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// CI-4 (v0.79.x security audit): the store must never adopt simulation results
// delivered by the cloud. Results are stripped on every cloud SAVE, so any
// present on an incoming Firestore document are anomalous — a collaborator
// writing the doc directly through the Firestore API — and a crafted/oversized
// percentiles map crashes the project page on render. These exercise both
// cloud->store entry actions (setProjects on load, mergeProject on subscription)
// through the real store.

import { describe, it, expect, beforeEach } from "vitest";
import { useProjectStore } from "./use-project-store";
import { createProject } from "@app/api/project-service";
import type { Project, SimulationRun } from "@domain/models/types";

// The merge copies the whole results object by reference; its fields are never
// inspected here, so a tagged sentinel is enough to tell local from cloud.
const run = (marker: string) => ({ marker }) as unknown as SimulationRun;

function withResults(p: Project, marker: string): Project {
  return {
    ...p,
    scenarios: p.scenarios.map((s) => ({ ...s, simulationResults: run(marker) })),
  };
}
const markerOf = (r: SimulationRun | undefined) =>
  (r as unknown as { marker: string } | undefined)?.marker;

describe("CI-4 — cloud-delivered simulation results are never adopted", () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.getState().setProjects([]);
  });

  it("setProjects (initial cloud load) drops results a cloud doc carries", () => {
    useProjectStore.getState().setProjects([withResults(createProject("Cloud P"), "CLOUD")]);
    const stored = useProjectStore.getState().projects[0]!;
    expect(stored.scenarios[0]!.simulationResults).toBeUndefined();
  });

  it("mergeProject (subscription) drops results on a brand-new project", () => {
    // No local prior: the new-project branch used to keep the incoming project as-is.
    useProjectStore.getState().mergeProject(withResults(createProject("New Shared"), "CLOUD"));
    const stored = useProjectStore.getState().projects.at(-1)!;
    expect(stored.scenarios[0]!.simulationResults).toBeUndefined();
  });

  it("mergeProject keeps LOCAL results and rejects the incoming cloud echo", () => {
    const p = createProject("P");
    const scenarioId = p.scenarios[0]!.id;
    useProjectStore.getState().setProjects([p]);
    useProjectStore.getState().setSimulationResults(p.id, scenarioId, run("LOCAL"));
    useProjectStore.getState().mergeProject(withResults(p, "CLOUD"));
    const merged = useProjectStore.getState().projects.find((x) => x.id === p.id)!;
    expect(markerOf(merged.scenarios[0]!.simulationResults)).toBe("LOCAL");
  });

  it("control: localStorage mirror never receives cloud results", () => {
    const p = withResults(createProject("Cloud Q"), "CLOUD");
    useProjectStore.getState().setProjects([p]);
    const raw = localStorage.getItem(`spert:project:local:${p.id}`) ?? "";
    expect(raw).not.toContain("CLOUD");
  });
});
