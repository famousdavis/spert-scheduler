// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import { ProjectSchema } from "@domain/schemas/project.schema";
import { createProject } from "./project-service";
import type { ActivityDependency, Project } from "@domain/models/types";

// Spike V4 (P0.4 — blocks Phase 1B). Documents the blast radius the client
// DEPENDENCY_CAP guard forecloses. The domain schema caps dependencies at 2000
// (project.schema.ts). But the localStorage save path does NOT validate — it
// JSON.stringifies and writes — so before the cap, applying a 2001st edge in
// memory would persist SILENTLY, then fail ProjectSchema.safeParse on the NEXT
// load (repository loadWithDiagnostics), rendering the whole project
// unloadable. P0.4's per-item cap_exceeded skip stops the 2001st edge from ever
// being applied, so the scenario never exceeds 2000 and the project stays
// loadable. These assertions pin that failure mode.

function projectWithDependencyCount(count: number): Project {
  const base = createProject("V4", "2025-01-06");
  const deps: ActivityDependency[] = Array.from({ length: count }, (_, i) => ({
    fromActivityId: `a${i}`,
    toActivityId: `b${i}`,
    type: "FS" as const,
    lagDays: 0,
  }));
  return {
    ...base,
    scenarios: base.scenarios.map((s) => ({ ...s, dependencies: deps })),
  };
}

describe("Spike V4 — DEPENDENCY_CAP blast radius", () => {
  it("a scenario at the 2000 cap still validates (loadable)", () => {
    expect(ProjectSchema.safeParse(projectWithDependencyCount(2000)).success).toBe(true);
  });

  it("2001 dependencies fail ProjectSchema — the whole project becomes unloadable", () => {
    // This is the blast radius: save() does not validate, so the over-cap
    // scenario would persist silently and only fail here, on the next load.
    const result = ProjectSchema.safeParse(projectWithDependencyCount(2001));
    expect(result.success).toBe(false);
  });
});
