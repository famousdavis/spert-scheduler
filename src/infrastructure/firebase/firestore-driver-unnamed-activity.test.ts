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

const UID = "uid-unnamed-activity";

/**
 * An unnamed activity in CLOUD storage.
 *
 * ⚠️ Cloud does not fail the way local does, and this is the reason this file
 * exists. On `ProjectSchema.safeParse` failure `processProjectDoc` returns
 * `{ kind: "skip" }` and `loadAll` discards skips — **no error card, no Export,
 * no Delete**. The project is simply absent from the dashboard, for every
 * member, on every device, with nothing on screen to say so. There is no
 * recovery affordance at all, and a viewer could not repair it if there were.
 *
 * So the local error-card assertions elsewhere cannot stand in for this: they
 * observe a surface cloud never reaches.
 *
 * Measured at c55f780 (pre-fix): `{ projects: 0, errors: [] }` for the unnamed
 * doc, while the named control loaded — the empty `errors` array being the
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

function projectWithActivityNamed(name: string): Project {
  const project = createProject("Cloud Fixture", "2026-09-07");
  const scenario = project.scenarios[0]!;
  return {
    ...project,
    scenarios: [addActivityToScenario(scenario, createActivity(name, scenario.settings))],
  };
}

describe("FirestoreDriver.loadAll with an unnamed activity", () => {
  beforeEach(() => {
    vi.mocked(getDocs).mockReset();
  });

  it("loads a project whose activity has an empty name", async () => {
    const project = projectWithActivityNamed("");
    vi.mocked(getDocs).mockResolvedValue({ docs: [docFor(project)] } as never);

    const result = await new FirestoreDriver(UID).loadAll();

    expect(result.projects).toHaveLength(1);
    expect(result.projects[0]!.scenarios[0]!.activities[0]!.name).toBe("");
    // Silent skip produced `errors: []` too, so "no errors" alone proves
    // nothing — the project count is the load-bearing assertion.
    expect(result.errors).toHaveLength(0);
  });

  it("loads a project whose activity name is whitespace only", async () => {
    const project = projectWithActivityNamed("   ");
    vi.mocked(getDocs).mockResolvedValue({ docs: [docFor(project)] } as never);

    const result = await new FirestoreDriver(UID).loadAll();

    expect(result.projects).toHaveLength(1);
  });

  it("control: a named project loads, so the harness can produce both answers", async () => {
    const project = projectWithActivityNamed("Design");
    vi.mocked(getDocs).mockResolvedValue({ docs: [docFor(project)] } as never);

    const result = await new FirestoreDriver(UID).loadAll();

    expect(result.projects).toHaveLength(1);
    expect(result.projects[0]!.scenarios[0]!.activities[0]!.name).toBe("Design");
  });

  it("control: a genuinely invalid doc is still skipped silently", async () => {
    // The relaxation must not turn `skip` into "load anything". A project whose
    // activity has a non-numeric estimate is still refused — and still without
    // an error, which is the pre-existing cloud behaviour this change leaves
    // alone.
    const project = projectWithActivityNamed("Design");
    const broken = {
      ...project,
      scenarios: [
        {
          ...project.scenarios[0]!,
          activities: [{ ...project.scenarios[0]!.activities[0]!, min: "not a number" }],
        },
      ],
    } as unknown as Project;
    vi.mocked(getDocs).mockResolvedValue({ docs: [docFor(broken)] } as never);

    const result = await new FirestoreDriver(UID).loadAll();

    expect(result.projects).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it("one unnamed activity no longer hides the other projects in the account", async () => {
    const unnamed = projectWithActivityNamed("");
    const healthy = projectWithActivityNamed("Design");
    vi.mocked(getDocs).mockResolvedValue({
      docs: [docFor(unnamed), docFor(healthy)],
    } as never);

    const result = await new FirestoreDriver(UID).loadAll();

    expect(result.projects).toHaveLength(2);
  });
});
