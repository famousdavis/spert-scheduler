// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * `updateMemberRole` — the transaction path (§3.9, 2026-08-03).
 *
 * ⚠️ WHY A SECOND FILE RATHER THAN CASES IN `firestore-sharing.test.ts`. That file mocks
 * `runTransaction` as a bare `vi.fn()`, which returns undefined and NEVER INVOKES ITS
 * CALLBACK — so this function showed 0 executions while the file read as covered. The mock
 * silently prevented the code from running and nothing flagged it. Implementing the
 * transaction there would change what its existing tests exercise; a separate file with a
 * working `runTransaction` leaves them untouched.
 *
 * (v0.79.18 removed the companion `shareProject` path — the dead legacy share-by-email
 * flow — with its client-only self-share guard and this file's `shareProject` cases.)
 *
 * ⚠️ WHY THIS ONE AND NOT THE REST OF `src/infrastructure`. §3.9 was recorded as a
 * directory percentage. Re-measured, most of what looks uncovered is a SECOND expression
 * of a server-authoritative rule — `firestore-driver.ts` even says so in a comment:
 * "Firestore rule enforces; redundant by design". Covering those would produce a
 * percentage and nothing else.
 *
 * This guard is the exception. `firestore.rules` gates `members` changes on the caller
 * being owner — so "only the owner can change roles" IS expressed server-side. But nothing
 * server-side stops an owner from demoting THEMSELVES: the rule permits an owner to modify
 * `members`, and the owner passes it. The self-demotion guard is CLIENT-ONLY, and it was
 * unexecuted.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

let docs: Record<string, Record<string, unknown>> = {};
let updates: Array<Record<string, unknown>> = [];

vi.mock("firebase/firestore", () => ({
  doc: vi.fn((_db: unknown, col: string, id: string) => ({ path: `${col}/${id}` })),
  getDoc: vi.fn(async (ref: { path: string }) => {
    const data = docs[ref.path];
    return { exists: () => data !== undefined, data: () => data };
  }),
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

import { updateMemberRole } from "./firestore-sharing";

const OWNER = "owner-uid";
const OTHER = "other-uid";
const PROJECT = "spertscheduler_projects/p1";

beforeEach(() => {
  docs = {};
  updates = [];
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

  it("keys every privileged operation on members[uid], NOT on the owner field — which is what makes self-demotion IRREVERSIBLE", () => {
    // ⚠️ THIS IS THE STAKE THE CLIENT GUARD IS PROTECTING, and it is why "the server
    // still treats them as owner" is FALSE. Both privileged operations read `members`:
    //
    //   before   members[uid] = 'owner'  → an update touching `members` is ALLOWED
    //   write    members[uid] = 'editor' → permitted; the last privileged write possible
    //   after    every `members` change AND `delete` require members[uid] == 'owner'
    //
    // So the demotion succeeds and then locks the user out of their own project
    // permanently — unrecoverable from any client, whatever the `owner` field still says.
    //
    // The UI compounds it by disagreeing with itself: canShareProject gates the dashboard
    // Share icon on the OWNER FIELD (still true), while SharingSection:194 gates the
    // controls on members[uid] === "owner" (now false). The affordance is offered on the
    // tile and withheld in the panel.
    // ⚠️ Scoped to the two rules that decide recoverability. An earlier draft asserted
    // `not.toContain("resource.data.owner == request.auth.uid")` over the whole block and
    // failed — that string is a SUBSTRING of the CREATE rule's
    // `request.resource.data.owner == request.auth.uid`, which binds owner to the caller
    // and is both correct and unrelated. The test caught its own over-reach.
    const deleteRule = projectsBlock.match(/allow delete:[^;]*;/)?.[0] ?? "";
    expect(deleteRule).not.toBe("");
    expect(deleteRule).toContain("resource.data.members[request.auth.uid] == 'owner'");
    expect(deleteRule).not.toContain(".owner ==");

    const updateRule = projectsBlock.match(/allow update:[\s\S]*?;/)?.[0] ?? "";
    expect(updateRule).not.toBe("");
    // The clause that gates changing `members` reads members, not the owner field.
    expect(updateRule).toContain("resource.data.members[request.auth.uid] == 'owner'");
  });

  it("does NOT prevent an owner from demoting themselves — hence the client-only guard", () => {
    // Nothing compares the AFFECTED member key against the owner. If that ever appears,
    // this fails and the client guard should be re-examined rather than duplicated.
    // ⚠️ ONE anchored literal check, not a permissive pattern. An earlier draft added a
    // second `[\s\S]*?` regex here that introduced a `sonarjs/slow-regex` finding and
    // caught nothing the line below does not — the falsification fired on this one.
    expect(projectsBlock).not.toContain("members[request.resource.data.owner]");
  });

  it("CI-2: a non-owner member can Leave — a separate allow-update that deletes only their own entry", () => {
    // Mirrored from canonical (v2.6.5). A member who is NOT the owner may remove exactly their
    // own `members` key and nothing else — keyed on `!= 'owner'` so it never lets the owner
    // orphan the project, and set-equality (not hasOnly) pins the exact keys changed. This is the
    // server side of the Scheduler "Leave project" action. If the rule is dropped from the mirror,
    // this fails (the landing check-scheduler-mirror is the authoritative drift guard; this is the
    // readable Scheduler-side pin).
    expect(projectsBlock).toContain("resource.data.members[request.auth.uid] != 'owner'");
    expect(projectsBlock).toContain("affectedKeys() == ['members'].toSet()");
    expect(projectsBlock).toContain("affectedKeys() == [request.auth.uid].toSet()");
    expect(projectsBlock).toContain("!(request.auth.uid in request.resource.data.members)");
  });
});
