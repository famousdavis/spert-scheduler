// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Project } from "@domain/models/types";

// Same mock shape as firestore-driver.test.ts: `db` must be a truthy sentinel,
// and firebase/firestore is stubbed so nothing touches the network.
vi.mock("./firebase", () => ({
  db: { __mock: true },
  auth: null,
  isFirebaseAvailable: true,
  getSendInvitationEmail: vi.fn(() => null),
  getClaimPendingInvitations: vi.fn(() => null),
  getRevokeInvite: vi.fn(() => null),
  getResendInvite: vi.fn(() => null),
}));

vi.mock("firebase/firestore", () => ({
  doc: vi.fn((_db: unknown, _col: string, id: string) => ({ id })),
  setDoc: vi.fn().mockResolvedValue(undefined),
  getDoc: vi.fn(),
  deleteDoc: vi.fn(),
  deleteField: vi.fn(() => "__delete__"),
  getDocs: vi.fn(),
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  onSnapshot: vi.fn(),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(() => "__ts__"),
  updateDoc: vi.fn(),
}));

import { getDocs } from "firebase/firestore";
import { FirestoreDriver } from "./firestore-driver";
import {
  createProject,
  createActivity,
  addActivityToScenario,
} from "@app/api/project-service";

const UID = "uid-out-of-order";

/**
 * An out-of-order estimate in CLOUD storage (WI-49, v0.69.0).
 *
 * Cloud failed SILENTLY here, as it did for WI-1's unnamed activity: `processProjectDoc` turned a
 * `ProjectSchema` failure into `{ kind: "skip" }`, so the project vanished from the dashboard of
 * its owner and every member with `errors: []`. The load gate now tolerates the ordering, and the
 * page flags the row instead. The count is the load-bearing assertion — `errors: []` was the
 * silence itself.
 */
function docFor(project: Project) {
  return {
    id: project.id,
    data: () => ({
      ...project,
      owner: UID,
      members: { [UID]: "owner" },
      updatedAt: "__ts__",
    }),
  };
}

function projectWithEstimate(min: number, mostLikely: number, max: number): Project {
  const project = createProject("Cloud Estimate Fixture", "2026-09-18");
  const scenario = project.scenarios[0]!;
  const activity = { ...createActivity("Design", scenario.settings), min, mostLikely, max };
  return { ...project, scenarios: [addActivityToScenario(scenario, activity)] };
}

describe("FirestoreDriver.loadAll with an out-of-order estimate", () => {
  beforeEach(() => {
    vi.mocked(getDocs).mockReset();
  });

  it("loads the project and reads the estimate back verbatim", async () => {
    const project = projectWithEstimate(14, 13, 22);
    vi.mocked(getDocs).mockResolvedValue({ docs: [docFor(project)] } as never);

    const result = await new FirestoreDriver(UID).loadAll();

    expect(result.projects).toHaveLength(1);
    expect(result.projects[0]!.scenarios[0]!.activities[0]).toMatchObject({ min: 14, mostLikely: 13, max: 22 });
    expect(result.errors).toHaveLength(0);
  });

  it("control: a negative estimate is still skipped — the tolerance is for ordering only", async () => {
    const project = projectWithEstimate(-1, 13, 22);
    vi.mocked(getDocs).mockResolvedValue({ docs: [docFor(project)] } as never);

    const result = await new FirestoreDriver(UID).loadAll();

    expect(result.projects).toHaveLength(0);
  });
});
