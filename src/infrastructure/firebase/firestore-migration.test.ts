// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// CHARACTERISATION (§3.8 Item B) — `migrateLocalToCloud` was at 0% on all four
// coverage metrics. Its suppression at firestore-migration.ts:52 justifies itself
// with "effectively untestable in CI (it needs a live Firestore), so a refactor
// here would be unverifiable by construction."
//
// That JUSTIFICATION is refuted by the two files next to it: firestore-driver.test.ts
// (19 tests) and firestore-sharing.test.ts (6 tests) both test this kind of code by
// mocking `firebase/firestore` and `./firebase` and importing the REAL module. No
// emulator, no live Firestore. This file uses that committed pattern. Whether the
// suppression should be RETIRED is a separate call that comes after these tests,
// not with them.
//
// ⚠️ WHAT THESE TESTS DO NOT CLAIM. They pin how the client responds to each
// outcome the Firestore SDK can hand it. They say NOTHING about which of those
// outcomes the deployed security rules can actually produce — see the
// "reachability" test at the end, and the note above it. A test that pins
// behaviour for an input the real system can never produce is still worth having,
// but it is not evidence that the branch runs in production.
//
// Only `firebase/firestore` and `./firebase` are mocked. The sanitizer, the schema
// version, `LocalStorageRepository` and `loadPreferences` are all REAL — local
// projects are seeded through real `localStorage`, so the local half of this
// "local → cloud" migration is genuinely exercised rather than simulated.

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Project } from "@domain/models/types";
import { SCHEMA_VERSION } from "@domain/models/types";
import { createProject } from "@app/api/project-service";

// -- Firestore mock ---------------------------------------------------------
// Docs keyed by "collection/id". An absent key means snapshot.exists() === false.
let docs: Record<string, Record<string, unknown>> = {};
// Paths whose getDoc should reject, as the real rules do for a non-member read.
let denyGet: Set<string> = new Set();
// Paths whose setDoc should reject, standing in for a failed write.
let denySet: Set<string> = new Set();
// Paths whose setDoc rejects with a NON-Error value — the SDK is not obliged to
// throw an Error, and the reason field narrows with `instanceof`.
let denySetRaw: Set<string> = new Set();
let writes: Array<{ path: string; data: Record<string, unknown> }> = [];

class MockPermissionDenied extends Error {
  code = "permission-denied";
  constructor() {
    super("Missing or insufficient permissions.");
  }
}

vi.mock("firebase/firestore", () => ({
  doc: vi.fn((_db: unknown, col: string, id: string) => ({ path: `${col}/${id}` })),
  getDoc: vi.fn(async (ref: { path: string }) => {
    if (denyGet.has(ref.path)) throw new MockPermissionDenied();
    const data = docs[ref.path];
    return { exists: () => data !== undefined, data: () => data };
  }),
  setDoc: vi.fn(
    async (ref: { path: string }, data: Record<string, unknown>) => {
      if (denySetRaw.has(ref.path)) throw "raw string rejection";
      if (denySet.has(ref.path)) throw new Error("write rejected");
      writes.push({ path: ref.path, data });
      docs[ref.path] = data;
    }
  ),
  serverTimestamp: vi.fn(() => ({ __sentinel: "serverTimestamp" })),
}));

vi.mock("./firebase", () => ({ db: { __mockDb: true } }));

import { migrateLocalToCloud } from "./firestore-migration";

// -- Local seeding ----------------------------------------------------------
// The real LocalStorageRepository reads these keys directly; the function under
// test constructs its own repository over the SAME "local" namespace.
const KEY = (id: string) => `spert:project:local:${id}`;
const INDEX = "spert:project-index:local";

/** A real Project from the real factory — annotated, never cast. */
function localProject(id: string, name: string): Project {
  return { ...createProject(name, "2026-01-05"), id };
}

/**
 * Seed the local namespace. `extraIndexIds` are ids listed in the index with no
 * payload behind them — the "corrupt" rung.
 *
 * ⚠️ They are placed FIRST deliberately. Per-item isolation is a property of the
 * LOOP: a rung that aborts the run instead of continuing is only observable if a
 * HEALTHY project sits behind the handled one. With the corrupt id last, swapping
 * `continue` for `break` changes nothing, and the test that claims to cover
 * isolation covers none of it. Falsification caught exactly that — twice.
 */
function seed(projects: Project[], extraIndexIds: string[] = []): void {
  for (const p of projects) {
    localStorage.setItem(KEY(p.id), JSON.stringify({ ...p, schemaVersion: SCHEMA_VERSION }));
  }
  localStorage.setItem(
    INDEX,
    JSON.stringify([...extraIndexIds, ...projects.map((p) => p.id)])
  );
}

const UID = "user-1";
const cloudPath = (id: string) => `spertscheduler_projects/${id}`;

beforeEach(() => {
  localStorage.clear();
  docs = {};
  denyGet = new Set();
  denySet = new Set();
  denySetRaw = new Set();
  writes = [];
});

// ---------------------------------------------------------------------------
// The four-way collision ladder, as the JSDoc at firestore-migration.ts:43 states it
// ---------------------------------------------------------------------------

describe("migrateLocalToCloud — collision ladder", () => {
  it("rung 4 (no cloud doc): uploads under the ORIGINAL id and reports 'migrated'", async () => {
    const p = localProject("keep-me", "Alpha");
    seed([p]);

    const result = await migrateLocalToCloud(UID);

    expect(result).toMatchObject({ uploaded: 1, skipped: 0, failed: 0 });
    expect(result.items[0]).toMatchObject({
      id: "keep-me",
      name: "Alpha",
      status: "migrated",
    });
    expect(result.items[0]).not.toHaveProperty("newId");
    // Premise: the write actually happened, at the original id.
    expect(writes.map((w) => w.path)).toContain(cloudPath("keep-me"));
  });

  it("rung 1 (doc exists, caller IS a member): skips and does not write", async () => {
    const p = localProject("already-there", "Beta");
    seed([p]);
    docs[cloudPath("already-there")] = { members: { [UID]: "owner" } };

    const result = await migrateLocalToCloud(UID);

    expect(result).toMatchObject({ uploaded: 0, skipped: 1, failed: 0 });
    expect(result.items[0]).toMatchObject({
      status: "skipped",
      reason: "exists",
    });
    // No project write at all — the preferences write is the only one permitted.
    expect(writes.filter((w) => w.path.startsWith("spertscheduler_projects/"))).toHaveLength(0);
  });

  it("a skipped project does not stop the ones behind it", async () => {
    // Added because falsification found the gap: with only ONE project in the
    // rung-1 fixture, swapping that rung's `continue` for a `break` killed nothing.
    // Per-item isolation is a property of the LOOP, so it needs a second item to
    // be observable at all — the same reason the rung-2 and corrupt fixtures pair
    // a handled item with a healthy one.
    seed([localProject("mine-already", "Beta"), localProject("still-new", "Beta2")]);
    docs[cloudPath("mine-already")] = { members: { [UID]: "owner" } };

    const result = await migrateLocalToCloud(UID);

    expect(result).toMatchObject({ uploaded: 1, skipped: 1, failed: 0 });
    expect(result.items.find((i) => i.id === "mine-already")!.status).toBe("skipped");
    expect(result.items.find((i) => i.id === "still-new")!.status).toBe("migrated");
  });

  it("rung 2 (doc exists, caller is NOT a member): re-ids and reports 'migrated-new-id'", async () => {
    const p = localProject("taken", "Gamma");
    seed([p]);
    docs[cloudPath("taken")] = { members: { "someone-else": "owner" } };

    const result = await migrateLocalToCloud(UID);

    expect(result).toMatchObject({ uploaded: 1, skipped: 0, failed: 0 });
    const item = result.items[0]!;
    expect(item.status).toBe("migrated-new-id");
    expect(item.id).toBe("taken");
    expect(item.newId).toBeDefined();
    expect(item.newId).not.toBe("taken");
    // The stranger's document is untouched; the upload went to the new id.
    expect(docs[cloudPath("taken")]).toEqual({ members: { "someone-else": "owner" } });
    expect(writes.map((w) => w.path)).toContain(cloudPath(item.newId!));
  });

  it("rung 3 (read denied): re-ids rather than trusting the read", async () => {
    const p = localProject("denied", "Delta");
    seed([p]);
    denyGet.add(cloudPath("denied"));

    const result = await migrateLocalToCloud(UID);

    const item = result.items[0]!;
    expect(item.status).toBe("migrated-new-id");
    expect(item.newId).not.toBe("denied");
    expect(result.uploaded).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// What the ladder writes, and what it leaves alone
// ---------------------------------------------------------------------------

describe("migrateLocalToCloud — the uploaded document", () => {
  it("stamps owner, members, schemaVersion and updatedAt, and drops the id field", async () => {
    seed([localProject("doc-shape", "Epsilon")]);

    await migrateLocalToCloud(UID);
    const written = writes.find((w) => w.path === cloudPath("doc-shape"))!.data;

    expect(written.owner).toBe(UID);
    expect(written.members).toEqual({ [UID]: "owner" });
    expect(written.schemaVersion).toBe(SCHEMA_VERSION);
    expect(written.updatedAt).toEqual({ __sentinel: "serverTimestamp" });
    // `id` is destructured out — it is the document key, not a field.
    expect(written).not.toHaveProperty("id");
    expect(written.name).toBe("Epsilon");
  });

  it("leaves the local copy in place as a backup", async () => {
    const p = localProject("backup", "Zeta");
    seed([p]);

    await migrateLocalToCloud(UID);

    expect(localStorage.getItem(KEY("backup"))).not.toBeNull();
    expect(JSON.parse(localStorage.getItem(INDEX)!)).toContain("backup");
  });
});

// ---------------------------------------------------------------------------
// Per-item failure isolation
// ---------------------------------------------------------------------------

describe("migrateLocalToCloud — failures are per project", () => {
  it("counts an unreadable local project as skipped/corrupt and continues", async () => {
    // "ghost" is in the index but has no payload — the repository returns null.
    seed([localProject("good", "Eta")], ["ghost"]);

    const result = await migrateLocalToCloud(UID);

    expect(result.uploaded).toBe(1);
    expect(result.skipped).toBe(1);
    const ghost = result.items.find((i) => i.id === "ghost")!;
    expect(ghost).toMatchObject({ status: "skipped", reason: "corrupt" });
    // Premise: the healthy sibling still migrated.
    expect(result.items.find((i) => i.id === "good")!.status).toBe("migrated");
  });

  it("records a failed write with its reason and still migrates the others", async () => {
    seed([localProject("bad-write", "Theta"), localProject("fine", "Iota")]);
    denySet.add(cloudPath("bad-write"));

    const result = await migrateLocalToCloud(UID);

    expect(result).toMatchObject({ uploaded: 1, failed: 1 });
    expect(result.items.find((i) => i.id === "bad-write")).toMatchObject({
      status: "failed",
      reason: "write rejected",
    });
    expect(result.items.find((i) => i.id === "fine")!.status).toBe("migrated");
  });

  it("stringifies a non-Error rejection into the failure reason", async () => {
    seed([localProject("raw-throw", "Sigma")]);
    denySetRaw.add(cloudPath("raw-throw"));

    const result = await migrateLocalToCloud(UID);

    expect(result.failed).toBe(1);
    expect(result.items[0]).toMatchObject({
      status: "failed",
      reason: "raw string rejection",
    });
  });

  it("still reports project results when the preferences write fails", async () => {
    seed([localProject("prefs-fail", "Kappa")]);
    denySet.add(`spertscheduler_settings/${UID}`);

    const result = await migrateLocalToCloud(UID);

    // The preferences failure is swallowed (console.error) and must not be
    // counted against the projects or abort the run.
    expect(result).toMatchObject({ uploaded: 1, failed: 0, skipped: 0 });
  });

  it("writes preferences to the caller's settings document", async () => {
    seed([localProject("with-prefs", "Lambda")]);

    await migrateLocalToCloud(UID);

    expect(writes.map((w) => w.path)).toContain(`spertscheduler_settings/${UID}`);
  });

  it("returns an empty result when there is nothing local to migrate", async () => {
    const result = await migrateLocalToCloud(UID);
    expect(result).toMatchObject({ items: [], uploaded: 0, skipped: 0, failed: 0 });
  });
});

// ---------------------------------------------------------------------------
// Reachability — recorded as a QUESTION, not asserted as a defect
// ---------------------------------------------------------------------------

describe("migrateLocalToCloud — what the rules can actually produce", () => {
  it("rungs 2 and 3 are the same action, so the ladder has three distinct outcomes, not four", async () => {
    // This is the one thing about reachability these tests CAN establish, because
    // it is a property of the client alone: "doc exists but caller is not a member"
    // and "read denied" both take targetId = crypto.randomUUID() and produce an
    // identical MigrationItemResult shape. They are two routes to one rung.
    //
    // ⚠️ OPEN QUESTION, deliberately not asserted here. The `allow get` in the
    // spertscheduler_projects match block of firestore.rules reads
    //   allow get: if isAuth() && request.auth.uid in resource.data.members;
    // A non-member read is therefore DENIED, not answered — so rung 2's snapshot
    // (exists() === true, members lacking uid) may be a shape the deployed rules
    // can never hand the client, making the `catch` the only live route. Whether a
    // read of a MISSING doc is likewise denied (`resource` is null) decides whether
    // rung 4 is reachable at all. Neither is decidable from this repo: the canonical
    // ruleset lives in the Landing Page repo and deploys from it via CI, and no
    // emulator is configured here. Recorded for the owner rather than guessed.
    const viaExists = localProject("via-exists", "Mu");
    const viaDenied = localProject("via-denied", "Nu");
    seed([viaExists, viaDenied]);
    docs[cloudPath("via-exists")] = { members: { stranger: "owner" } };
    denyGet.add(cloudPath("via-denied"));

    const result = await migrateLocalToCloud(UID);

    const a = result.items.find((i) => i.id === "via-exists")!;
    const b = result.items.find((i) => i.id === "via-denied")!;
    expect(a.status).toBe("migrated-new-id");
    expect(b.status).toBe(a.status);
    expect(a.newId).toBeDefined();
    expect(b.newId).toBeDefined();
    expect(b.newId).not.toBe(a.newId); // distinct fresh ids, same rung
  });

  it("a members map without the caller is treated as someone else's project", async () => {
    // Guards the `data.members && data.members[uid]` test specifically: an EMPTY
    // members map is falsy-per-key, not falsy-per-object, and must not read as
    // "mine". Pinned because `members: {}` is the shape a partially-written or
    // rules-rejected document would have.
    seed([localProject("empty-members", "Xi")]);
    docs[cloudPath("empty-members")] = { members: {} };

    const result = await migrateLocalToCloud(UID);

    expect(result.items[0]!.status).toBe("migrated-new-id");
  });

  it("a document with no members field at all is treated as someone else's project", async () => {
    seed([localProject("no-members", "Omicron")]);
    docs[cloudPath("no-members")] = { owner: "stranger" };

    const result = await migrateLocalToCloud(UID);

    expect(result.items[0]!.status).toBe("migrated-new-id");
  });
});
