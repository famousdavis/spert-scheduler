// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * `shareProject` and `updateMemberRole` — the two transaction paths (§3.9, 2026-08-03).
 *
 * ⚠️ WHY A SECOND FILE RATHER THAN CASES IN `firestore-sharing.test.ts`. That file mocks
 * `runTransaction` as a bare `vi.fn()`, which returns undefined and NEVER INVOKES ITS
 * CALLBACK — so both functions below showed 0 executions while the file read as covered.
 * The mock silently prevented the code from running and nothing flagged it. Implementing
 * the transaction there would change what its six existing tests exercise; a separate
 * file with a working `runTransaction` leaves them untouched.
 *
 * ⚠️ WHY THESE TWO AND NOT THE REST OF `src/infrastructure`. §3.9 was recorded as a
 * directory percentage. Re-measured, most of what looks uncovered is a SECOND expression
 * of a server-authoritative rule — `firestore-driver.ts` even says so in a comment:
 * "Firestore rule enforces; redundant by design". Covering those would produce a
 * percentage and nothing else.
 *
 * These two guards are the exception. `firestore.rules` gates `members` changes on the
 * caller being owner — so "only the owner can share / change roles" IS expressed
 * server-side. But nothing server-side stops an owner from demoting THEMSELVES: the rule
 * permits an owner to modify `members`, and the owner passes it. The self-demotion and
 * self-share guards are CLIENT-ONLY, and they were unexecuted.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

let docs: Record<string, Record<string, unknown>> = {};
let updates: Array<Record<string, unknown>> = [];
/** uid → email, consulted by the getDocs mock so findUserByEmail actually resolves. */
let profiles: Record<string, string> = {};

vi.mock("firebase/firestore", () => ({
  doc: vi.fn((_db: unknown, col: string, id: string) => ({ path: `${col}/${id}` })),
  getDoc: vi.fn(async (ref: { path: string }) => {
    const data = docs[ref.path];
    return { exists: () => data !== undefined, data: () => data };
  }),
  // ⚠️ `where` must CAPTURE its predicate and `getDocs` must honour it. The first version
  // of this mock returned `{ empty: true }` unconditionally, so `findUserByEmail` resolved
  // to null and three tests failed against a lookup that had never run — the harness
  // failing, not the code. A mock that ignores the query is the same class of defect as
  // the bare `runTransaction` this file exists to work around.
  getDocs: vi.fn(async (q: { __email?: string }) => {
    const uid = Object.keys(profiles).find((u) => profiles[u] === q.__email);
    if (!uid) return { empty: true, docs: [] };
    return {
      empty: false,
      docs: [{ id: uid, data: () => ({ email: profiles[uid], displayName: uid }) }],
    };
  }),
  collection: vi.fn(() => ({ __c: true })),
  query: vi.fn((_c: unknown, w: { __email?: string }) => ({ __email: w?.__email })),
  where: vi.fn((field: string, _op: string, value: string) =>
    field === "email" ? { __email: value } : {},
  ),
  limit: vi.fn(),
  // ⚠️ THE POINT OF THIS FILE: a runTransaction that actually runs the callback, and
  // propagates a throw from inside it the way Firestore does.
  runTransaction: vi.fn(async (_db: unknown, fn: (t: unknown) => Promise<void>) => {
    const tx = {
      get: async (ref: { path: string }) => {
        const data = docs[ref.path];
        return { exists: () => data !== undefined, data: () => data };
      },
      update: (_ref: { path: string }, patch: Record<string, unknown>) => {
        updates.push(patch);
      },
    };
    await fn(tx);
  }),
}));

vi.mock("./firebase", () => ({ db: { __mockDb: true } }));

import { shareProject, updateMemberRole } from "./firestore-sharing";

const OWNER = "owner-uid";
const OTHER = "other-uid";
const THIRD = "third-uid";
const PROJECT = "spertscheduler_projects/p1";

/** findUserByEmail resolves through the profiles collection; seed it per test. */
function seedProfile(uid: string, email: string) {
  profiles[uid] = email.toLowerCase().trim();
}

beforeEach(() => {
  docs = {};
  updates = [];
  profiles = {};
  docs[PROJECT] = { owner: OWNER, members: { [OWNER]: "owner" } };
});

describe("updateMemberRole — the guards, and which of them the server also enforces", () => {
  it("promotes a member and writes exactly the one members key", () => {
    return updateMemberRole(OWNER, "p1", OTHER, "editor").then((r) => {
      expect(r).toEqual({ success: true });
      expect(updates).toEqual([{ [`members.${OTHER}`]: "editor" }]);
    });
  });

  it("refuses a non-owner caller — a guard the Firestore rules ALSO enforce", async () => {
    const r = await updateMemberRole(OTHER, "p1", OWNER, "viewer");
    expect(r.success).toBe(false);
    expect(r.error).toBe("Only the project owner can change roles.");
    expect(updates).toEqual([]);
  });

  // ⚠️ THE CLIENT-ONLY GUARD. `firestore.rules` gates a `members` change on the caller
  // being owner — and the owner passes it — so the server would ACCEPT this write. This
  // check is the only thing preventing `owner: uid` alongside `members[uid]: "editor"`.
  it("refuses to demote the owner, which nothing server-side prevents", async () => {
    const r = await updateMemberRole(OWNER, "p1", OWNER, "editor");
    expect(r.success).toBe(false);
    expect(r.error).toBe("Cannot change the owner's role.");
    expect(updates).toEqual([]);
  });

  it("reports a missing project rather than writing", async () => {
    delete docs[PROJECT];
    const r = await updateMemberRole(OWNER, "p1", OTHER, "editor");
    expect(r.success).toBe(false);
    expect(r.error).toBe("Project not found.");
    expect(updates).toEqual([]);
  });
});

describe("shareProject — the guards, and which of them the server also enforces", () => {
  it("adds the target at the requested role", async () => {
    seedProfile(OTHER, "other@example.com");
    const r = await shareProject(OWNER, "p1", "other@example.com", "viewer");
    expect(r).toEqual({ success: true });
    expect(updates).toEqual([{ [`members.${OTHER}`]: "viewer" }]);
  });

  it("refuses an email that matches no profile", async () => {
    const r = await shareProject(OWNER, "p1", "nobody@example.com", "editor");
    expect(r.success).toBe(false);
    expect(r.error).toBe("Unable to share. Verify the email and try again.");
    expect(updates).toEqual([]);
  });

  // ⚠️ ALSO CLIENT-ONLY, and it closes the same door as the guard above: only the owner
  // reaches the transaction, so "share with yourself" IS "demote the owner". Pinned
  // separately because it is a different function and a different message — a future
  // change to one would not fail the other's test.
  it("refuses sharing with yourself, which is how the owner would reach the same state", async () => {
    seedProfile(OWNER, "owner@example.com");
    const r = await shareProject(OWNER, "p1", "owner@example.com", "editor");
    expect(r.success).toBe(false);
    expect(r.error).toBe("Cannot share with yourself.");
    expect(updates).toEqual([]);
  });

  it("refuses a non-owner caller — a guard the Firestore rules ALSO enforce", async () => {
    // ⚠️ The target must be a THIRD user. The self-share guard runs BEFORE the owner
    // check, so calling with caller === target returns "Cannot share with yourself." and
    // the owner guard is never reached — the first version of this test did exactly that
    // and asserted the wrong message.
    seedProfile(THIRD, "third@example.com");
    const r = await shareProject(OTHER, "p1", "third@example.com", "editor");
    expect(r.success).toBe(false);
    expect(r.error).toBe("Only the project owner can share.");
    expect(updates).toEqual([]);
  });

  it("checks self-share BEFORE ownership — a non-owner sharing with themselves is told the former", async () => {
    // Pins the ordering the test above depends on, so it cannot silently change.
    seedProfile(OTHER, "other@example.com");
    const r = await shareProject(OTHER, "p1", "other@example.com", "editor");
    expect(r.error).toBe("Cannot share with yourself.");
  });
});

// ---------------------------------------------------------------------------
// The premise the client-only guards rest on, asserted rather than read
// ---------------------------------------------------------------------------

describe("firestore.rules — what it does and does not enforce about members", () => {
  /**
   * ⚠️ THIS CONVERTS A READING INTO A CHECK. The two guards above are described as
   * "client-only" because `firestore.rules` gates a `members` change on the caller being
   * owner and stops there — an owner demoting themselves passes. That was established by
   * READING the mirrored ruleset in August 2026, which is a fact about one afternoon.
   *
   * Precedent: `preferences-firestore-sync.test.ts` already reads this file at runtime as
   * a drift guard. ⚠️ The local `firestore.rules` is a REFERENCE MIRROR — canonical lives
   * in the spert-landing-page repo — so this pins the mirror, not the deployed ruleset.
   * If someone adds a server-side owner-demotion rule, this fails and tells you the client
   * guard became redundant, rather than leaving two expressions drifting silently.
   */
  const rules = readFileSync(resolve(process.cwd(), "firestore.rules"), "utf-8");
  const projectsBlock =
    rules.match(/match \/spertscheduler_projects\/\{projectId\}[\s\S]*?\n {4}\}/)?.[0] ?? "";

  it("finds the projects block, so the assertions below are not vacuous", () => {
    // Premise first: a regex that stopped matching would make every check pass on "".
    expect(projectsBlock).not.toBe("");
    expect(projectsBlock).toContain("allow update");
  });

  it("gates member changes on the caller being owner — the guard that IS server-enforced", () => {
    expect(projectsBlock).toMatch(/affectedKeys\(\)\.hasAny\(\['owner', 'members'\]\)/);
    expect(projectsBlock).toContain("resource.data.members[request.auth.uid] == 'owner'");
  });

  it("does NOT prevent an owner from demoting themselves — hence the client-only guard", () => {
    // Nothing compares the AFFECTED member key against the owner. If that ever appears,
    // this fails and the client guard should be re-examined rather than duplicated.
    // ⚠️ ONE anchored literal check, not a permissive pattern. An earlier draft added a
    // second `[\s\S]*?` regex here that introduced a `sonarjs/slow-regex` finding and
    // caught nothing the line below does not — the falsification fired on this one.
    expect(projectsBlock).not.toContain("members[request.resource.data.owner]");
  });
});
