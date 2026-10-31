// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from "vitest";

/**
 * WI-128 (owner ruling, 2026-10-18): the save a load makes to upgrade a project is logged if refused, and never
 * reported as a cloud sync error. It carries no change of the user's, and as loadAll makes it — naming `_owner` and
 * `_members` — cloud storage refuses it for every document as 0.77.2's driver leaves one, so each refusal reported
 * after the first load (an invitation's re-fetch, for one) showed "Cloud sync error — changes may not have saved"
 * when nothing was lost. Every other save is reported as before.
 *
 * The fake Firestore applies the canonical rules' update rule for a project document: the caller must be an owner or
 * an editor of it, and every key the save AFFECTS — a field it names whose value differs from the stored one, or is
 * absent there — must be on the Scheduler's field list. Each document is stored as 0.77.2's driver left one: schema
 * 24, the project's date (or none) on the project, its owner and members, and no `_owner` or `_members`.
 */

/** The Scheduler's field list in the canonical rules (`spertSchedulerProjectFields`). */
const FIELD_LIST = [
  "name", "owner", "members",
  "schemaVersion", "createdAt", "updatedAt",
  "scenarios", "globalCalendarOverride", "convertedWorkDays",
  "forcedWorkDays", "targetFinishDate", "showTargetOnGantt",
  "showActivityIds", "ganttAppearance", "archived", "tileColor",
];

const cloud = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  /** Who is signed in: the rules read the caller's role from the stored document. */
  caller: "",
  /** Each save's document id, in the order tried; and those the rules let through. */
  tried: [] as string[],
  stored: [] as string[],
  clone: <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T,
}));

vi.mock("@infrastructure/firebase/firebase", () => ({
  db: { fake: true },
  auth: null,
  isFirebaseAvailable: true,
  getSendInvitationEmail: () => null,
  getClaimPendingInvitations: () => null,
  getRevokeInvite: () => null,
  getResendInvite: () => null,
}));

/** Equal as Firestore compares values: maps by key, whatever their order. */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => sameValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, _collection: string, id: string) => ({ id }),
  collection: () => ({}),
  query: () => ({}),
  where: () => ({}),
  getDocs: async () => ({
    docs: [...cloud.docs].map(([id, data]) => ({ id, data: () => cloud.clone(data) })),
  }),
  getDoc: async (ref: { id: string }) => ({
    id: ref.id,
    exists: () => cloud.docs.has(ref.id),
    data: () => cloud.clone(cloud.docs.get(ref.id)),
  }),
  // An update of an existing document: mergeFields replaces only the fields it names, and the rules decide.
  setDoc: async (ref: { id: string }, data: Record<string, unknown>, options?: { mergeFields?: string[] }) => {
    cloud.tried.push(ref.id);
    const before = cloud.docs.get(ref.id) ?? {};
    const after: Record<string, unknown> = { ...before };
    for (const field of options?.mergeFields ?? Object.keys(data)) after[field] = cloud.clone(data[field]);
    const affected = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
      (key) => !sameValue(before[key], after[key]),
    );
    const role = (before.members as Record<string, string> | undefined)?.[cloud.caller];
    const allowed =
      (role === "owner" || role === "editor") &&
      (role === "owner" || !affected.some((key) => key === "owner" || key === "members")) &&
      affected.every((key) => FIELD_LIST.includes(key));
    if (!allowed) {
      throw Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" });
    }
    cloud.docs.set(ref.id, after);
    cloud.stored.push(ref.id);
  },
  onSnapshot: () => () => {},
  deleteDoc: vi.fn(),
  deleteField: vi.fn(),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(),
  updateDoc: vi.fn(),
}));

import { FirestoreDriver } from "./firestore-driver";
import { createScenario } from "@app/api/project-service";
import { SCHEMA_VERSION } from "@domain/models/types";
import type { Project } from "@domain/models/types";

const OWNER = "uid-wi128-owner";
const VIEWER = "uid-wi128-viewer";
const DEC = "2026-12-18";
/** A scenario with no date: the key is absent. */
const ABSENT = "(no key)";

/** A document as 0.77.2's driver left it, shared with a viewer. */
function storedBy0772(name: string, date: string | null | undefined): Record<string, unknown> {
  const stored: Record<string, unknown> = {
    name,
    createdAt: "2026-10-01T09:00:00.000Z",
    schemaVersion: 24,
    scenarios: cloud.clone([createScenario("Baseline", "2026-11-02"), createScenario("Status", "2026-11-09")]),
    showTargetOnGantt: typeof date === "string",
    owner: OWNER,
    members: { [OWNER]: "owner", [VIEWER]: "viewer" },
    updatedAt: "2026-10-18T03:21:02.840Z",
  };
  if (date !== undefined) stored.targetFinishDate = date;
  return stored;
}

const versionOf = (id: string) => cloud.docs.get(id)?.schemaVersion;

/** Each scenario's date, or ABSENT where it holds none. */
function datesOf(project: { scenarios: readonly object[] }): unknown[] {
  return project.scenarios.map((s) => {
    const date = (s as Record<string, unknown>).targetFinishDate;
    return date === undefined ? ABSENT : date;
  });
}

/** A driver signed in as `uid`, with every save error it reports collected. */
function driverFor(uid: string): { driver: FirestoreDriver; reported: unknown[] } {
  cloud.caller = uid;
  const driver = new FirestoreDriver(uid);
  const reported: unknown[] = [];
  driver.onSaveError((e) => reported.push(e));
  return { driver, reported };
}

/** A loaded project as the app holds it: `_owner` and `_members` taken off, the owner kept (as useCloudSync does). */
function asTheAppHoldsIt({ _owner, _members, ...project }: Project & { _owner: string; _members: unknown }): Project {
  return { ...project, owner: _owner };
}

let logged: MockInstance<typeof console.error>;

beforeEach(() => {
  cloud.docs.clear();
  cloud.caller = "";
  cloud.tried.length = 0;
  cloud.stored.length = 0;
  logged = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("the save a load makes to upgrade a project (WI-128)", () => {
  it("loadAll: each project's upgrade save is tried and refused, logged, and reported to no one; the documents stay at 24", async () => {
    cloud.docs.set("p-alder", storedBy0772("Alder", DEC));
    cloud.docs.set("p-birch", storedBy0772("Birch", null));
    cloud.docs.set("p-cedar", storedBy0772("Cedar", undefined));
    const { driver, reported } = driverFor(OWNER);
    const { projects, errors } = await driver.loadAll();
    expect(cloud.tried, "an upgrade save tried for each project").toEqual(["p-alder", "p-birch", "p-cedar"]);
    expect(cloud.stored, "none let through").toEqual([]);
    expect(logged.mock.calls.filter(([what]) => what === "Firestore write error:"), "each refusal logged").toHaveLength(3);
    expect(reported, "no refusal reported").toEqual([]);
    expect([versionOf("p-alder"), versionOf("p-birch"), versionOf("p-cedar")]).toEqual([24, 24, 24]);
    expect(errors).toEqual([]);
    expect(projects.map((p) => [p.name, datesOf(p)])).toEqual([
      ["Alder", [DEC, DEC]],
      ["Birch", [ABSENT, ABSENT]],
      ["Cedar", [ABSENT, ABSENT]],
    ]);
  });

  it("load: a viewer's upgrade save is refused and reported to no one; the document stays at 24", async () => {
    cloud.docs.set("p-alder", storedBy0772("Alder", DEC));
    const { driver, reported } = driverFor(VIEWER);
    const project = await driver.load("p-alder");
    expect(cloud.tried, "an upgrade save tried").toEqual(["p-alder"]);
    expect(cloud.stored, "not let through").toEqual([]);
    expect(reported, "the refusal reported to no one").toEqual([]);
    expect(versionOf("p-alder")).toBe(24);
    expect(project && datesOf(project)).toEqual([DEC, DEC]);
  });

  it("load: its upgrade save names neither internal field, so an owner's is stored at the current schema", async () => {
    cloud.docs.set("p-alder", storedBy0772("Alder", DEC));
    const { driver, reported } = driverFor(OWNER);
    const project = await driver.load("p-alder");
    expect(cloud.stored, "let through").toEqual(["p-alder"]);
    expect(versionOf("p-alder")).toBe(SCHEMA_VERSION);
    expect(datesOf(cloud.docs.get("p-alder") as { scenarios: object[] })).toEqual([DEC, DEC]);
    expect(reported).toEqual([]);
    expect(project && datesOf(project)).toEqual([DEC, DEC]);
  });

  it("loadAll: a document that already holds `_owner` and `_members` with the same values is stored at the current schema as it loads", async () => {
    const stored = storedBy0772("Alder", DEC);
    cloud.docs.set("p-alder", { ...stored, _owner: stored.owner, _members: cloud.clone(stored.members) });
    const { driver, reported } = driverFor(OWNER);
    await driver.loadAll();
    expect(cloud.stored, "let through").toEqual(["p-alder"]);
    expect(versionOf("p-alder")).toBe(SCHEMA_VERSION);
    expect(datesOf(cloud.docs.get("p-alder") as { scenarios: object[] })).toEqual([DEC, DEC]);
    expect(reported).toEqual([]);
  });

  it("control: a change's refused save is reported, immediate or debounced", async () => {
    // Stamped with this build's version, so its load makes no upgrade save.
    cloud.docs.set("p-alder", { ...storedBy0772("Alder", DEC), schemaVersion: SCHEMA_VERSION });
    const { driver, reported } = driverFor(VIEWER);
    const { projects } = await driver.loadAll();
    const project = asTheAppHoldsIt(projects[0]!);
    await driver.saveImmediate({ ...project, name: "Alder, renamed" });
    expect(reported, "the immediate save's refusal").toHaveLength(1);
    vi.useFakeTimers();
    driver.save({ ...project, name: "Alder, renamed again" });
    await vi.advanceTimersByTimeAsync(250);
    expect(reported, "and the debounced save's").toHaveLength(2);
    expect(cloud.stored).toEqual([]);
  });

  it("a change's save is let through, and stores the project at the current schema with each scenario's date", async () => {
    cloud.docs.set("p-alder", storedBy0772("Alder", DEC));
    const { driver, reported } = driverFor(OWNER);
    const { projects } = await driver.loadAll();
    const project = asTheAppHoldsIt(projects[0]!);
    await driver.saveImmediate({ ...project, name: "Alder, renamed" });
    expect(versionOf("p-alder")).toBe(SCHEMA_VERSION);
    expect(cloud.stored).toEqual(["p-alder"]);
    expect(datesOf(cloud.docs.get("p-alder") as { scenarios: object[] })).toEqual([DEC, DEC]);
    expect(cloud.docs.get("p-alder")?.name).toBe("Alder, renamed");
    expect(reported).toEqual([]);
  });

  it("a second loadAll on the same driver, as at an invitation's re-fetch: each upgrade save is tried and refused again, and still reported to no one", async () => {
    cloud.docs.set("p-alder", storedBy0772("Alder", DEC));
    cloud.docs.set("p-birch", storedBy0772("Birch", null));
    cloud.docs.set("p-cedar", storedBy0772("Cedar", undefined));
    const { driver, reported } = driverFor(OWNER);
    await driver.loadAll();
    expect(reported, "the first load reports none").toEqual([]);
    await driver.loadAll();
    expect(cloud.tried, "each upgrade save tried at both loads").toEqual([
      "p-alder", "p-birch", "p-cedar", "p-alder", "p-birch", "p-cedar",
    ]);
    expect(cloud.stored, "none let through").toEqual([]);
    expect(reported, "the second load reports none either").toEqual([]);
    expect([versionOf("p-alder"), versionOf("p-birch"), versionOf("p-cedar")]).toEqual([24, 24, 24]);
  });
});
