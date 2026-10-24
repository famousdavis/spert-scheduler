// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// WI-130: this browser's storage is one `localStorage` for every tab, and no tab hears another (no `storage` listener,
// no BroadcastChannel). Each test below is two tabs' repositories over that one storage, with a tab's on-screen list as
// a plain array of ids. Before WI-130 a drag stored the dragging tab's list as the index, so a project that tab did
// not show left this browser's list while its data stayed stored: out of reach, with no error.
//
// The ids are written out, and every index is read from storage, never from the code under test.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  LocalStorageRepository,
  _resetLegacyMigrationForTests,
  migrateLegacyKeysToLocal,
  setStorageNamespace,
} from "./local-storage-repository";
import type { Project } from "@domain/models/types";
import { SCHEMA_VERSION } from "@domain/models/types";

function project(id: string, name: string, schemaVersion: number = SCHEMA_VERSION): Project {
  return {
    id,
    name,
    createdAt: "2026-10-23T00:00:00.000Z",
    schemaVersion,
    owner: null,
    scenarios: [
      {
        id: `${id}-s1`,
        name: "Baseline",
        startDate: "2026-11-02",
        activities: [],
        dependencies: [],
        milestones: [],
        settings: {
          defaultConfidenceLevel: "mediumConfidence",
          defaultDistributionType: "normal",
          trialCount: 1000,
          rngSeed: "seed",
          probabilityTarget: 0.5,
          projectProbabilityTarget: 0.95,
          heuristicEnabled: false,
          heuristicMinPercent: 50,
          heuristicMaxPercent: 200,
          dependencyMode: false,
          parkinsonsLawEnabled: true,
        },
      },
    ],
  };
}

const keyOf = (namespace: string, id: string) => `spert:project:${namespace}:${id}`;
const indexKeyOf = (namespace: string) => `spert:project-index:${namespace}`;

/** The stored index, parsed — `null` when there is none. */
function storedIndex(namespace = "local"): unknown {
  const raw = localStorage.getItem(indexKeyOf(namespace));
  return raw === null ? null : JSON.parse(raw);
}

/** A project's JSON written straight to storage, as another version's tab would leave it. */
function storeRaw(namespace: string, id: string, value: string): void {
  localStorage.setItem(keyOf(namespace, id), value);
}

let tabA: LocalStorageRepository;
let tabB: LocalStorageRepository;

beforeEach(() => {
  localStorage.clear();
  setStorageNamespace("local");
  tabA = new LocalStorageRepository();
  tabB = new LocalStorageRepository();
});

afterEach(() => {
  vi.restoreAllMocks();
  setStorageNamespace("local");
});

describe("WI-130 — a drag in one tab keeps the projects that tab does not show", () => {
  it("D1 a project another tab made after this tab loaded stays listed, at the end where it was saved", () => {
    tabA.save(project("p1", "Alpha"));
    tabA.save(project("p2", "Bravo"));
    const shownInA = tabA.list();
    expect(shownInA).toEqual(["p1", "p2"]);

    tabB.save(project("p3", "Charlie"));
    expect(storedIndex()).toEqual(["p1", "p2", "p3"]);

    // Tab A drags Bravo before Alpha. Its list is the one it loaded: it has never heard of p3.
    tabA.reorderIndex(["p2", "p1"]);

    expect(storedIndex()).toEqual(["p2", "p1", "p3"]);
    expect(localStorage.getItem(keyOf("local", "p3"))).not.toBeNull();
  });

  it("D2 a project another tab moved to the front keeps its place; this tab's projects take the other places in its order", () => {
    tabA.save(project("p1", "Alpha"));
    tabA.save(project("p2", "Bravo"));
    tabB.save(project("p3", "Charlie"));
    tabB.reorderIndex(["p3", "p1", "p2"]);
    expect(storedIndex()).toEqual(["p3", "p1", "p2"]);

    tabA.reorderIndex(["p2", "p1"]);

    expect(storedIndex()).toEqual(["p3", "p2", "p1"]);
  });

  it("D3 a project deleted in another tab stays deleted — before WI-130 its id came back with no data behind it", () => {
    tabA.save(project("p1", "Alpha"));
    tabA.save(project("p2", "Bravo"));
    // Tab A shows both. Tab B deletes Alpha.
    tabB.remove("p1");
    expect(storedIndex()).toEqual(["p2"]);
    expect(localStorage.getItem(keyOf("local", "p1"))).toBeNull();

    tabA.reorderIndex(["p2", "p1"]);

    expect(storedIndex()).toEqual(["p2"]);
    expect(localStorage.getItem(keyOf("local", "p1"))).toBeNull();
  });

  it("D4 a project this tab cannot open — saved by a newer version — keeps its place and still loads as that version's", () => {
    tabA.save(project("p1", "Alpha"));
    storeRaw("local", "pz", JSON.stringify(project("pz", "Zulu", SCHEMA_VERSION + 1)));
    tabA.save(project("p2", "Bravo"));
    localStorage.setItem(indexKeyOf("local"), JSON.stringify(["p1", "pz", "p2"]));
    // The tab shows the two it can open.
    tabA.reorderIndex(["p2", "p1"]);

    expect(storedIndex()).toEqual(["p2", "pz", "p1"]);
    const zulu = tabA.loadWithDiagnostics("pz");
    expect(zulu.success).toBe(false);
    expect(!zulu.success && zulu.error.type).toBe("future_version");
  });

  it("D5 a damaged project this tab cannot open keeps its place and its error", () => {
    tabA.save(project("p1", "Alpha"));
    storeRaw("local", "bad", "not json{");
    tabA.save(project("p2", "Bravo"));
    localStorage.setItem(indexKeyOf("local"), JSON.stringify(["p1", "bad", "p2"]));

    tabA.reorderIndex(["p2", "p1"]);

    expect(storedIndex()).toEqual(["p2", "bad", "p1"]);
    const bad = tabA.loadWithDiagnostics("bad");
    expect(!bad.success && bad.error.type).toBe("json_parse");
  });

  it("D6 two tabs drag in turn, each from its own list: every project stays, and the later drag orders the projects it shows", () => {
    for (const [id, name] of [["p1", "Alpha"], ["p2", "Bravo"], ["p3", "Charlie"]] as const) {
      tabA.save(project(id, name));
    }
    const shownInA = tabA.list();
    tabB.save(project("p4", "Delta"));
    const shownInB = tabB.list();
    expect(shownInA).toEqual(["p1", "p2", "p3"]);
    expect(shownInB).toEqual(["p1", "p2", "p3", "p4"]);

    tabA.reorderIndex(["p3", "p1", "p2"]);
    expect(storedIndex()).toEqual(["p3", "p1", "p2", "p4"]);

    // Tab B never saw A's drag; it drags Delta to the front of ITS list.
    tabB.reorderIndex(["p4", "p1", "p2", "p3"]);
    expect(storedIndex()).toEqual(["p4", "p1", "p2", "p3"]);
  });

  it("D7 in a signed-in user's storage, a project the list lost but this tab shows goes back in, in this tab's order", () => {
    const tab = new LocalStorageRepository("uid-A");
    tab.save(project("q1", "Quebec"));
    tab.save(project("q2", "Romeo"));
    tab.save(project("q3", "Sierra"));
    // An older version's drag stored its own list, without q1; q1's data stayed.
    localStorage.setItem(indexKeyOf("uid-A"), JSON.stringify(["q2", "q3"]));

    // This tab shows q1 and q2 (it loaded before that drag) and drags q1 to the front.
    tab.reorderIndex(["q1", "q2"]);

    expect(storedIndex("uid-A")).toEqual(["q1", "q3", "q2"]);
  });
});

describe("WI-130 — a load lists every project stored in this browser's signed-out storage", () => {
  it("L1 a list an earlier drag damaged is repaired at the next read: the projects it left out follow, in id order, and the list is stored with them", () => {
    tabA.save(project("p1", "Alpha"));
    tabA.save(project("p2", "Bravo"));
    storeRaw("local", "zz", JSON.stringify(project("zz", "Zulu")));
    storeRaw("local", "aa", JSON.stringify(project("aa", "Able")));
    // What a drag before WI-130 left: the index names two, four are stored.
    localStorage.setItem(indexKeyOf("local"), JSON.stringify(["p2", "p1"]));
    // This storage hands its keys back in the order they were written (zz before aa) — read as the scan reads them,
    // `Object.keys` — so the order below is the sort's.
    const written = Object.keys(localStorage);
    expect(written.filter((k) => k.endsWith(":zz") || k.endsWith(":aa"))).toEqual([keyOf("local", "zz"), keyOf("local", "aa")]);

    expect(tabB.list()).toEqual(["p2", "p1", "aa", "zz"]);
    expect(storedIndex()).toEqual(["p2", "p1", "aa", "zz"]);
  });

  it("L2 a project made after the repair goes after the repaired ones, and one deleted stays deleted", () => {
    tabA.save(project("p1", "Alpha"));
    storeRaw("local", "zz", JSON.stringify(project("zz", "Zulu")));
    storeRaw("local", "aa", JSON.stringify(project("aa", "Able")));
    localStorage.setItem(indexKeyOf("local"), JSON.stringify(["p1"]));
    expect(tabA.list()).toEqual(["p1", "aa", "zz"]);

    tabA.save(project("p0", "Zero"));
    expect(storedIndex()).toEqual(["p1", "aa", "zz", "p0"]);

    tabA.remove("aa");
    expect(storedIndex()).toEqual(["p1", "zz", "p0"]);
    expect(localStorage.getItem(keyOf("local", "aa"))).toBeNull();
    expect(tabB.list()).toEqual(["p1", "zz", "p0"]);
  });

  it("L3 an id in the list whose data is gone — one a drag before WI-130 wrote back after another tab deleted it — is dropped at the next read, and the list stored so", () => {
    tabA.save(project("p1", "Alpha"));
    tabA.save(project("p2", "Bravo"));
    localStorage.setItem(indexKeyOf("local"), JSON.stringify(["p1", "gone", "p2"]));
    expect(localStorage.getItem(keyOf("local", "gone"))).toBeNull();

    expect(tabB.list()).toEqual(["p1", "p2"]);
    expect(storedIndex()).toEqual(["p1", "p2"]);
  });

  it("L4 a read with nothing to add or drop writes nothing", () => {
    tabA.save(project("p1", "Alpha"));
    tabA.save(project("p2", "Bravo"));
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    expect(tabB.list()).toEqual(["p1", "p2"]);
    expect(setItem).not.toHaveBeenCalled();
  });

  it("F1 a project the list leaves out, saved at schema 20 — before v0.45.0, like the copies of cloud projects v0.42.6 moved here — stays hidden, as before WI-130; so does one whose schema is not a number", () => {
    // Storage as v0.42.5 left it: the copy of a cloud project the cloud had stopped naming kept its key, not its place.
    localStorage.setItem("spert:project-index", JSON.stringify(["L1"]));
    localStorage.setItem("spert:project:L1", JSON.stringify(project("L1", "Lima", 20)));
    localStorage.setItem("spert:project:C9", JSON.stringify({ ...project("C9", "Unshared from me", 20), owner: "uid-OTHER" }));
    _resetLegacyMigrationForTests();
    migrateLegacyKeysToLocal();
    expect(localStorage.getItem(keyOf("local", "C9"))).not.toBeNull();
    storeRaw("local", "tx", JSON.stringify({ ...project("tx", "Tango"), schemaVersion: "25" }));
    const before = localStorage.getItem(indexKeyOf("local"));
    expect(before).toBe(JSON.stringify(["L1"]));

    expect(tabA.list()).toEqual(["L1"]);
    expect(localStorage.getItem(indexKeyOf("local"))).toBe(before);
    expect(localStorage.getItem(keyOf("local", "C9"))).not.toBeNull();
    expect(localStorage.getItem(keyOf("local", "tx"))).not.toBeNull();
  });

  it("F2 one saved at schema 21 — v0.45.0 — is listed again, after the listed ones, and the list stored so", () => {
    tabA.save(project("p1", "Alpha"));
    storeRaw("local", "s21", JSON.stringify(project("s21", "Sierra", 21)));

    expect(tabB.list()).toEqual(["p1", "s21"]);
    expect(storedIndex()).toEqual(["p1", "s21"]);
  });

  it("N1 no key of another namespace is ever listed: a signed-in user's copy, listed or not, a look-alike namespace, the legacy form", () => {
    tabA.save(project("p1", "Alpha"));
    const user = new LocalStorageRepository("uid-A");
    user.save(project("q1", "Quebec"));
    storeRaw("uid-A", "q2", JSON.stringify(project("q2", "Romeo")));
    storeRaw("localx", "r1", JSON.stringify(project("r1", "Uniform")));
    localStorage.setItem("spert:project:legacy1", JSON.stringify(project("legacy1", "Legacy")));

    expect(tabA.list()).toEqual(["p1"]);
    expect(storedIndex()).toEqual(["p1"]);
  });

  it("N2 in a signed-in user's storage a stored project the list does not name is never listed, and nothing is written", () => {
    const user = new LocalStorageRepository("uid-A");
    user.save(project("q1", "Quebec"));
    // q2: the cloud's answer no longer names it (deleted on another device, or no longer shared); its copy stayed.
    storeRaw("uid-A", "q2", JSON.stringify(project("q2", "Romeo")));
    const before = localStorage.getItem(indexKeyOf("uid-A"));

    expect(user.list()).toEqual(["q1"]);
    expect(localStorage.getItem(indexKeyOf("uid-A"))).toBe(before);

    setStorageNamespace("uid-A");
    expect(new LocalStorageRepository().list()).toEqual(["q1"]);
  });

  it("V1 a stored value the list leaves out that does not parse stays hidden, as before WI-130; one the list names still loads as damaged", () => {
    tabA.save(project("p1", "Alpha"));
    storeRaw("local", "bad", "not json{");
    storeRaw("local", "dmg", "{damaged");
    localStorage.setItem(indexKeyOf("local"), JSON.stringify(["p1", "dmg"]));
    const before = localStorage.getItem(indexKeyOf("local"));

    expect(tabA.list()).toEqual(["p1", "dmg"]);
    expect(localStorage.getItem(indexKeyOf("local"))).toBe(before);
    expect(localStorage.getItem(keyOf("local", "bad"))).toBe("not json{");
    const dmg = tabA.loadWithDiagnostics("dmg");
    expect(!dmg.success && dmg.error.type).toBe("json_parse");
  });

  it("V2 a project saved by a newer version is listed and loads as that version's, never as a project", () => {
    tabA.save(project("p1", "Alpha"));
    storeRaw("local", "pz", JSON.stringify(project("pz", "Zulu", SCHEMA_VERSION + 1)));

    expect(tabA.list()).toEqual(["p1", "pz"]);
    const zulu = tabA.loadWithDiagnostics("pz");
    expect(!zulu.success && zulu.error.type).toBe("future_version");
    expect(tabA.load("pz")).toBeNull();
  });

  it("V3 an index this version cannot read no longer hides every project, and a read never writes over it — damaged, a newer shape, or a list holding a non-id", () => {
    storeRaw("local", "p2", JSON.stringify(project("p2", "Bravo")));
    storeRaw("local", "p1", JSON.stringify(project("p1", "Alpha")));

    localStorage.setItem(indexKeyOf("local"), "{not an index");
    expect(tabA.list()).toEqual(["p1", "p2"]);
    expect(localStorage.getItem(indexKeyOf("local"))).toBe("{not an index");

    const newerShape = JSON.stringify({ format: 2, order: ["p2", "p1"] });
    localStorage.setItem(indexKeyOf("local"), newerShape);
    expect(tabA.list()).toEqual(["p1", "p2"]);
    expect(localStorage.getItem(indexKeyOf("local"))).toBe(newerShape);

    const withNonId = JSON.stringify(["p2", 7]);
    localStorage.setItem(indexKeyOf("local"), withNonId);
    expect(tabA.list()).toEqual(["p2", "p1"]);
    expect(localStorage.getItem(indexKeyOf("local"))).toBe(withNonId);
  });

  it("V4 with storage full, a read still lists them and does not throw; the index stays as it was", () => {
    tabA.save(project("p1", "Alpha"));
    storeRaw("local", "p3", JSON.stringify(project("p3", "Charlie")));
    const before = localStorage.getItem(indexKeyOf("local"));
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === indexKeyOf("local")) throw new DOMException("full", "QuotaExceededError");
      setItem.call(this, key, value);
    });

    expect(tabA.list()).toEqual(["p1", "p3"]);
    expect(localStorage.getItem(indexKeyOf("local"))).toBe(before);
  });

  it("W1 saving a new project writes the list itself: when that write fails it throws, as before WI-130, the project's data stays, and the next read lists it", () => {
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === indexKeyOf("local")) throw new DOMException("full", "QuotaExceededError");
      setItem.call(this, key, value);
    });

    let thrown: unknown;
    try {
      tabA.save(project("p1", "Alpha"));
    } catch (e) {
      thrown = e;
    }
    expect(thrown instanceof DOMException && thrown.name).toBe("QuotaExceededError");
    expect(localStorage.getItem(keyOf("local", "p1"))).not.toBeNull();
    expect(localStorage.getItem(indexKeyOf("local"))).toBeNull();

    vi.restoreAllMocks();
    expect(tabB.list()).toEqual(["p1"]);
  });

  it("C1 clearing this browser's signed-out storage (Discard local copy) removes the projects its index left out as well", () => {
    tabA.save(project("p1", "Alpha"));
    storeRaw("local", "p2", JSON.stringify(project("p2", "Bravo")));
    const user = new LocalStorageRepository("uid-A");
    user.save(project("q1", "Quebec"));
    // As at Discard: the signed-in user's namespace is the active one; the call names "local".
    setStorageNamespace("uid-A");

    new LocalStorageRepository("local").clearAll();

    expect(localStorage.getItem(keyOf("local", "p1"))).toBeNull();
    expect(localStorage.getItem(keyOf("local", "p2"))).toBeNull();
    expect(localStorage.getItem(indexKeyOf("local"))).toBeNull();
    expect(localStorage.getItem(keyOf("uid-A", "q1"))).not.toBeNull();
    expect(new LocalStorageRepository("local").list()).toEqual([]);
  });

  it("C2 unchanged: clearing a signed-in user's storage (the sign-out cleanup) removes its listed projects and its index, and leaves a key its list does not name", () => {
    const user = new LocalStorageRepository("uid-A");
    user.save(project("q1", "Quebec"));
    storeRaw("uid-A", "q2", JSON.stringify(project("q2", "Romeo")));
    tabA.save(project("p1", "Alpha"));
    setStorageNamespace("uid-A");

    new LocalStorageRepository().clearAll();

    expect(localStorage.getItem(keyOf("uid-A", "q1"))).toBeNull();
    expect(localStorage.getItem(indexKeyOf("uid-A"))).toBeNull();
    expect(localStorage.getItem(keyOf("uid-A", "q2"))).not.toBeNull();
    expect(localStorage.getItem(keyOf("local", "p1"))).not.toBeNull();
    expect(storedIndex("local")).toEqual(["p1"]);
  });
});
