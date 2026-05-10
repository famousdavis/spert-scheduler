// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture the query() args so we can assert that limit(1) is included.
const queryCalls: unknown[][] = [];
const limitCalls: unknown[] = [];

vi.mock("firebase/firestore", () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
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

import { findUserByEmail } from "./firestore-sharing";

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
