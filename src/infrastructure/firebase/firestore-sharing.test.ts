// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture the query() args so we can assert that limit(1) is included.
const queryCalls: unknown[][] = [];
const limitCalls: unknown[] = [];

// Docs keyed by "collection/id"; an absent key means snapshot.exists() === false.
// Every getDoc path is recorded so we can assert read behaviour.
let docs: Record<string, Record<string, unknown>> = {};
let reads: string[] = [];

vi.mock("firebase/firestore", () => ({
  doc: vi.fn((_db: unknown, col: string, id: string) => ({ path: `${col}/${id}` })),
  getDoc: vi.fn(async (ref: { path?: string }) => {
    if (!ref?.path) return { exists: () => false, data: () => undefined };
    reads.push(ref.path);
    const data = docs[ref.path];
    return { exists: () => data !== undefined, data: () => data };
  }),
  getDocs: vi.fn(async () => ({ empty: true, docs: [] })),
  collection: vi.fn(),
  query: vi.fn((...args: unknown[]) => {
    queryCalls.push(args);
    return { __mockQuery: true };
  }),
  where: vi.fn((field: string, op: string, value: unknown) => ({ __where: [field, op, value] })),
  limit: vi.fn((n: number) => {
    limitCalls.push(n);
    return { __limit: n };
  }),
  runTransaction: vi.fn(),
}));

vi.mock("./firebase", () => ({
  db: { __mockDb: true },
}));

import { findUserByEmail, getProjectMembers } from "./firestore-sharing";

describe("findUserByEmail (v0.42.6 H3 code-side)", () => {
  beforeEach(() => {
    queryCalls.length = 0;
    limitCalls.length = 0;
  });

  it("includes limit(1) in the Firestore query", async () => {
    await findUserByEmail("alice@example.com");
    expect(limitCalls).toContain(1);
    expect(queryCalls.length).toBeGreaterThan(0);
    const lastArgs = queryCalls.at(-1);
    expect(lastArgs).toBeDefined();
    const hasLimit = lastArgs!.some(
      (a) => typeof a === "object" && a !== null && "__limit" in a,
    );
    expect(hasLimit).toBe(true);
  });

  it("normalizes email to lowercase + trim before query", async () => {
    await findUserByEmail("  ALICE@Example.com  ");
    const lastArgs = queryCalls.at(-1);
    expect(lastArgs).toBeDefined();
    const whereArg = lastArgs!.find(
      (a) => typeof a === "object" && a !== null && "__where" in a,
    ) as { __where: [string, string, string] } | undefined;
    expect(whereArg?.__where[2]).toBe("alice@example.com");
  });
});

// Regression: the Share panel rendered a raw 28-char Firebase Auth UID where a
// name or email belonged. getProjectMembers resolved profiles against
// spertscheduler_profiles only, but that doc is written by AuthProvider on THIS
// app's sign-in. The cross-app invitation Cloud Function resolves an invitee BY
// their spertsuite_profiles doc and then writes only members.{uid} — it never
// seeds a per-app profile. Anyone who had used another SPERT app but never
// signed into Scheduler therefore had no per-app profile at all.
// Fixed suite-wide 2026-07-29; first found in SPERT Story Map v0.49.3.
describe("getProjectMembers — suite profile fallback", () => {
  const OWNER = "owner-uid-0000000000000000";
  const MEMBER = "nT5V5xk8pcNHpHE7IjMxJtmQBPa2";

  beforeEach(() => {
    reads = [];
    docs = {
      "spertscheduler_projects/p1": {
        members: { [OWNER]: "owner", [MEMBER]: "editor" },
      },
      [`spertscheduler_profiles/${OWNER}`]: {
        displayName: "William W Davis",
        email: "davisw2@ufl.edu",
      },
    };
  });

  it("falls back to spertsuite_profiles when the per-app profile is missing", async () => {
    docs[`spertsuite_profiles/${MEMBER}`] = {
      displayName: "William W Davis",
      email: "famousdavispmp@gmail.com",
    };

    const members = await getProjectMembers("p1");
    const m = members.find((x) => x.uid === MEMBER);
    expect(m?.email).toBe("famousdavispmp@gmail.com");
    expect(m?.displayName).toBe("William W Davis");
  });

  it("does not read the suite mirror when the per-app profile exists", async () => {
    docs[`spertscheduler_profiles/${MEMBER}`] = {
      displayName: "Local Profile",
      email: "local@example.com",
    };
    docs[`spertsuite_profiles/${MEMBER}`] = {
      displayName: "Suite Profile",
      email: "suite@example.com",
    };

    const members = await getProjectMembers("p1");
    expect(members.find((x) => x.uid === MEMBER)?.displayName).toBe("Local Profile");
    expect(reads).not.toContain(`spertsuite_profiles/${MEMBER}`);
  });

  it("leaves email/displayName undefined when neither profile exists", async () => {
    const members = await getProjectMembers("p1");
    const m = members.find((x) => x.uid === MEMBER);
    expect(m?.email).toBeUndefined();
    expect(m?.displayName).toBeUndefined();
    // Both lookups were attempted before giving up.
    expect(reads).toContain(`spertscheduler_profiles/${MEMBER}`);
    expect(reads).toContain(`spertsuite_profiles/${MEMBER}`);
  });
});
