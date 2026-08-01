// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Unit tests for planImportDecisions — the SD-1 extraction (v0.60.0).
//
// The point of these is that they exist at all. Until this ladder moved to the
// service layer it could only be exercised through the real Zustand store; the
// behavioural coverage in use-project-store.test.ts stays as the integration
// contract, and these test the decision logic directly, as a pure function.

import { describe, it, expect } from "vitest";
import { planImportDecisions, type ConflictDecision } from "./export-import-service";
import { createProject } from "./project-service";
import type { Project } from "@domain/models/types";

/** A decision helper — every field matters, so none of them are defaulted away. */
function decide(
  importedProjectId: string,
  kind: "id" | "name",
  originalExistingId: string,
  action: "skip" | "replace" | "copy"
): ConflictDecision {
  return { importedProjectId, kind, originalExistingId, action };
}

function plan(
  projects: Project[],
  importedProjects: Project[],
  decisions: ConflictDecision[] = [],
  skipConflictDetection = false
) {
  return planImportDecisions({ projects, importedProjects, decisions, skipConflictDetection });
}

describe("planImportDecisions", () => {
  it("adds a project that conflicts with nothing", () => {
    const result = plan([createProject("Existing")], [createProject("Fresh")]);
    expect(result.toAdd).toHaveLength(1);
    expect(result.driftSkipped).toHaveLength(0);
    expect(result.toReplace).toHaveLength(0);
  });

  it("counts an explicit skip without planning any work", () => {
    const incoming = createProject("Skipped");
    const result = plan([], [incoming], [decide(incoming.id, "id", incoming.id, "skip")]);
    expect(result.skipped).toBe(1);
    expect(result.toAdd).toHaveLength(0);
    expect(result.toCopy).toHaveLength(0);
  });

  // -- Layer 2 drift guards --------------------------------------------------

  it("skips a no-decision project whose ID now collides", () => {
    const existing = createProject("Existing");
    const incoming = { ...createProject("Different"), id: existing.id };
    const result = plan([existing], [incoming]);
    expect(result.toAdd).toHaveLength(0);
    expect(result.driftSkipped[0]!.reason).toMatch(/ID conflict/i);
  });

  it("skips a no-decision project whose NAME now collides", () => {
    const result = plan([createProject("Same Name")], [createProject("Same Name")]);
    expect(result.toAdd).toHaveLength(0);
    expect(result.driftSkipped[0]!.reason).toMatch(/Name conflict/i);
  });

  it("skipConflictDetection bypasses the no-decision guards", () => {
    const result = plan([createProject("Same Name")], [createProject("Same Name")], [], true);
    expect(result.toAdd).toHaveLength(1);
    expect(result.driftSkipped).toHaveLength(0);
  });

  it("replace-by-id whose target vanished, with a name collision, is drift", () => {
    const bystander = createProject("Shared");
    const incoming = createProject("Shared"); // its id is NOT in the store
    const result = plan([bystander], [incoming], [decide(incoming.id, "id", incoming.id, "replace")]);
    expect(result.toReplace).toHaveLength(0);
    expect(result.toAdd).toHaveLength(0);
    expect(result.driftSkipped[0]!.reason).toMatch(/ID target deleted/i);
  });

  it("replace-by-id whose target vanished, with no collision, becomes an add", () => {
    const incoming = createProject("Unique");
    const result = plan([createProject("Other")], [incoming], [decide(incoming.id, "id", incoming.id, "replace")]);
    expect(result.toAdd).toHaveLength(1);
    expect(result.driftSkipped).toHaveLength(0);
  });

  it("replace-by-name whose target is gone, with an ID collision, is drift", () => {
    const collider = createProject("Holds The Id");
    const incoming = { ...createProject("Vanished"), id: collider.id };
    const result = plan([collider], [incoming], [decide(incoming.id, "name", "ghost-id", "replace")]);
    expect(result.toReplace).toHaveLength(0);
    expect(result.driftSkipped[0]!.reason).toMatch(/Name target gone/i);
  });

  it("replace-by-name does not replace a project the decision never named", () => {
    // The name still resolves — but to a project other than originalExistingId.
    const bystander = createProject("Shared");
    const incoming = createProject("Shared");
    const result = plan([bystander], [incoming], [decide(incoming.id, "name", "some-other-id", "replace")]);
    expect(result.toReplace).toHaveLength(0);
    expect(result.toAdd).toHaveLength(1);
  });

  // -- Replace preserves identity -------------------------------------------

  it("a replacement keeps the existing project's id, owner and createdAt", () => {
    const existing = { ...createProject("Target"), owner: "uid-A", createdAt: "2020-01-01T00:00:00.000Z" };
    const incoming = {
      ...createProject("Target"),
      id: existing.id,
      owner: "uid-importer",
      createdAt: "2099-01-01T00:00:00.000Z",
    };
    const result = plan([existing], [incoming], [decide(existing.id, "id", existing.id, "replace")]);

    expect(result.toReplace).toHaveLength(1);
    const { oldId, replacement } = result.toReplace[0]!;
    expect(oldId).toBe(existing.id);
    expect(replacement.id).toBe(existing.id);
    expect(replacement.owner).toBe("uid-A"); // pitfall #7
    expect(replacement.createdAt).toBe(existing.createdAt); // pitfall #65
  });

  // -- Copy naming -----------------------------------------------------------

  it("a copy is disambiguated against current state", () => {
    const existing = createProject("Q4 Plan");
    const incoming = createProject("Q4 Plan");
    const result = plan([existing], [incoming], [decide(incoming.id, "name", existing.id, "copy")]);
    expect(result.toCopy[0]!.name).toBe("Q4 Plan (Copy)");
  });

  it("copies in the SAME batch do not collide with each other", () => {
    // The v0.59.13 regression: takenNames must grow as each copy is minted.
    const existing = createProject("Q4 Plan");
    const first = createProject("Q4 Plan");
    const second = createProject("Q4 Plan");
    const result = plan(
      [existing],
      [first, second],
      [decide(first.id, "name", existing.id, "copy"), decide(second.id, "name", existing.id, "copy")]
    );
    const names = result.toCopy.map((p) => p.name);
    expect(names).toHaveLength(2);
    expect(new Set(names).size).toBe(2);
    expect(names).toContain("Q4 Plan (Copy)");
    expect(names).toContain("Q4 Plan (Copy 2)");
  });

  it("a copy gets fresh ids throughout and keeps the importer's owner", () => {
    const existing = createProject("Source");
    const incoming = { ...createProject("Source"), owner: "uid-importer" };
    const result = plan([existing], [incoming], [decide(incoming.id, "name", existing.id, "copy")]);

    const copy = result.toCopy[0]!;
    expect(copy.id).not.toBe(incoming.id);
    expect(copy.owner).toBe("uid-importer");
    const incomingScenarioIds = incoming.scenarios.map((s) => s.id);
    for (const s of copy.scenarios) expect(incomingScenarioIds).not.toContain(s.id);
  });

  // -- Purity ----------------------------------------------------------------

  it("does not mutate the projects it is given", () => {
    const existing = createProject("Existing");
    const before = JSON.stringify(existing);
    const incoming = createProject("Existing");
    plan([existing], [incoming], [decide(incoming.id, "name", existing.id, "copy")]);
    expect(JSON.stringify(existing)).toBe(before);
  });

  it("plans a mixed batch in one pass", () => {
    const target = createProject("Replace Me");
    const nameHolder = createProject("Copy Me");
    const incomingReplace = { ...createProject("Replace Me"), id: target.id };
    const incomingCopy = createProject("Copy Me");
    const incomingSkip = createProject("Skip Me");
    const incomingAdd = createProject("Add Me");

    const result = plan(
      [target, nameHolder],
      [incomingReplace, incomingCopy, incomingSkip, incomingAdd],
      [
        decide(incomingReplace.id, "id", target.id, "replace"),
        decide(incomingCopy.id, "name", nameHolder.id, "copy"),
        decide(incomingSkip.id, "id", incomingSkip.id, "skip"),
      ]
    );

    expect(result.toReplace).toHaveLength(1);
    expect(result.toCopy).toHaveLength(1);
    expect(result.skipped).toBe(1);
    expect(result.toAdd).toHaveLength(1);
    expect(result.toAdd[0]!.name).toBe("Add Me");
  });
});
