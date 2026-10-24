// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Falsification spec for WI-130: a Dashboard drag in one tab must not drop projects from this browser's list.
//
// Before the fix a drag stored the dragging tab's own list as the index, so a project that tab did not show — one
// another tab had made since it loaded, or one it could not open — left the list while its data stayed stored. The fix
// has two halves: a drag keeps every stored project it does not name, each in its own place (`reorderIndex`), and a
// load in this browser's signed-out storage drops the ids whose data is gone and lists every project stored there that
// the index leaves out — only one that parses and carries schema 21 or higher — after the indexed ones, in id order,
// storing the list so only when something changed and never over an index it cannot read (`list`). `save` writes the
// list itself. The cloud's answer still replaces a signed-in user's copy whole (`replaceIndex`).
//
// Each straw breaks one guarantee and names EXACTLY the tests it must fail — read "K failing; named-match K", not merely
// a non-zero exit: the runner prints ✔ when ANY named test fails. Each expected set was written before the run that
// first included it, never inferred from a run.
//
// Usage: node scripts/falsify.mjs scripts/falsify-spec-two-tabs.mjs
const REPO = new URL("../src/infrastructure/persistence/local-storage-repository.ts", import.meta.url).pathname;
const STORE = new URL("../src/ui/hooks/use-project-store.ts", import.meta.url).pathname;

/** Matches the failing tests whose titles begin with these ids, as the verbose reporter prints them. */
const ids = (...names) => new RegExp(`> (?:${names.join("|")}) `);

const DRAG_IS_STORED = "orderWithin(this.list(), ids, (id) => this.isStored(id))";
const HEAL_WRITE =
  "    try {\n      localStorage.setItem(this.indexKey, JSON.stringify(all));\n    } catch {\n" +
  "      // Storage full: the same projects are found again at the next read.\n    }\n";
const FLOOR = "typeof schemaVersion === \"number\" && schemaVersion >= RECOVERABLE_SCHEMA_VERSION";

// Both test files: local-storage-repository.two-tabs.test.ts (D, L, N, F, V, W, C) and use-project-store.two-tabs.test.ts (T).
export const testFile = "two-tabs.test";
export const mutations = [
  {
    // THE defect, as main has it: the drag stores the tab's list as given.
    id: "S1  the drag stores its own list as the index  [expect 10: D1 D2 D3 D4 D5 D6 D7 T1 T3 T5]",
    file: REPO,
    find: `    const order = ${DRAG_IS_STORED};\n    localStorage.setItem(this.indexKey, JSON.stringify(order));`,
    replace: "    localStorage.setItem(this.indexKey, JSON.stringify(ids));",
    expectFailing: ids("D1", "D2", "D3", "D4", "D5", "D6", "D7", "T1", "T3", "T5"),
  },
  {
    // Half the fix: drags keep what they do not show, but a list an older drag damaged stays damaged.
    id: "S2  a load adds back nothing the index left out  [expect 9: L1 L2 F2 V2 V3 V4 W1 C1 T2]",
    file: REPO,
    find: "    const unlisted = this.unlistedIds(ids);",
    replace: "    const unlisted: string[] = [];",
    expectFailing: ids("L1", "L2", "F2", "V2", "V3", "V4", "W1", "C1", "T2"),
  },
  {
    // The over-reach: a signed-in user's copy lists a project the cloud no longer names.
    id: "S3  the load adds back unlisted keys in a signed-in user's storage too  [expect 3: N2 C2 T4]",
    file: REPO,
    find: "    if (this.namespace !== SIGNED_OUT_NAMESPACE) return ids;\n",
    replace: "",
    expectFailing: ids("N2", "C2", "T4"),
  },
  {
    // The scan reads a project key of ANY namespace as this one's.
    id: "S4  the load adds back a stored project of any namespace  [expect 3: N1 C1 C2]",
    file: REPO,
    find: "      if (!key.startsWith(prefix)) continue;\n      const id = key.slice(prefix.length);",
    replace: "      const m = /^spert:project:[^:]+:(.+)$/.exec(key);\n      if (!m) continue;\n      const id = m[1]!;",
    expectFailing: ids("N1", "C1", "C2"),
  },
  {
    // A deleted project's id written back by a tab that still shows it — what main did.
    id: "S5  the drag keeps an id that is no longer stored  [expect 1: D3]",
    file: REPO,
    find: DRAG_IS_STORED,
    replace: "orderWithin(this.list(), ids, () => true)",
    expectFailing: ids("D3"),
  },
  {
    // The drag keeps only the ids already listed, so one the list lost cannot come back through it.
    id: "S6  the drag drops a shown project the list lost  [expect 1: D7]",
    file: REPO,
    find: DRAG_IS_STORED,
    replace: "orderWithin(this.list(), ids, () => false)",
    expectFailing: ids("D7"),
  },
  {
    // The plausible half-fix: keep the projects not shown, but move them to the end.
    id: "S7  the projects the tab does not show go to the end  [expect 5: D2 D4 D5 D7 T3]",
    file: REPO,
    find: "  return [...placed, ...named.slice(next)];",
    replace: "  return [...named, ...listed.filter((id) => !isNamed.has(id))];",
    expectFailing: ids("D2", "D4", "D5", "D7", "T3"),
  },
  {
    // The cloud's answer only orders this copy's list: a project it no longer names stays listed.
    id: "S8  the cloud's answer goes through the drag's order  [expect 1: T4]",
    file: STORE,
    find: "    repo.replaceIndex(projects.map((p) => p.id));",
    replace: "    repo.reorderIndex(projects.map((p) => p.id));",
    expectFailing: ids("T4"),
  },
  {
    // The repaired list is never stored. `save` writes its own, so a new project is still indexed — fixed ids only.
    id: "S9  the repaired list is not stored  [expect 4: L1 L3 F2 T2]",
    file: REPO,
    find: HEAL_WRITE,
    replace: "",
    expectFailing: ids("L1", "L3", "F2", "T2"),
  },
  {
    id: "S10 storage full makes the load throw  [expect 1: V4]",
    file: REPO,
    find: HEAL_WRITE,
    replace: "    localStorage.setItem(this.indexKey, JSON.stringify(all));\n",
    expectFailing: ids("V4"),
  },
  {
    // The order the browser hands keys back in — insertion order here, something else elsewhere.
    id: "S11 the added projects in the order the storage lists its keys  [expect 3: L1 L2 V3]",
    file: REPO,
    find: "    return unlisted.sort((a, b) => (a < b ? -1 : 1));",
    replace: "    return unlisted;",
    expectFailing: ids("L1", "L2", "V3"),
  },
  {
    // Discard local copy clears the indexed projects only, and the next load brings the others back.
    id: "S12 clearing removes the indexed projects only  [expect 1: C1]",
    file: REPO,
    find: "  clearAll(): void {\n    const ids = this.list();",
    replace: "  clearAll(): void {\n    const ids = this.readIndex();",
    expectFailing: ids("C1"),
  },
  {
    // No floor: the copies of cloud projects v0.42.6 moved into signed-out storage come back as this browser's own.
    id: "S13 a left-out project of any schema is listed again  [expect 1: F1]",
    file: REPO,
    find: "schemaVersion >= RECOVERABLE_SCHEMA_VERSION",
    replace: "true",
    expectFailing: ids("F1"),
  },
  {
    id: "S14 the floor excludes schema 21 itself  [expect 1: F2]",
    file: REPO,
    find: "schemaVersion >= RECOVERABLE_SCHEMA_VERSION",
    replace: "schemaVersion > RECOVERABLE_SCHEMA_VERSION",
    expectFailing: ids("F2"),
  },
  {
    // A schema written as text compares as a number.
    id: "S15 a schema that is not a number passes the floor  [expect 1: F1]",
    file: REPO,
    find: FLOOR,
    replace: "(schemaVersion as number) >= RECOVERABLE_SCHEMA_VERSION",
    expectFailing: ids("F1"),
  },
  {
    id: "S16 a left-out value that does not parse is listed again  [expect 1: V1]",
    file: REPO,
    find: `    return ${FLOOR};\n  } catch {\n    return false;`,
    replace: `    return ${FLOOR};\n  } catch {\n    return true;`,
    expectFailing: ids("V1"),
  },
  {
    // GAP-2: an id whose data is gone stays listed, a "Project data not found" card whose Export does nothing.
    // Written before its first run as [expect 1: L3]; that run also failed V3, whose list ["p2", 7] holds 7 — an id
    // with no data, which this half drops too. The set below is amended for that reason, the one set not as written.
    id: "S17 the load keeps an id whose data is gone  [expect 2: L3 V3]",
    file: REPO,
    find: "    const kept = ids.filter((id) => this.isStored(id));",
    replace: "    const kept = ids;",
    expectFailing: ids("L3", "V3"),
  },
  {
    // A tab of this version writes over a list a newer version stored in a shape it cannot read.
    id: "S18 a load writes over an index it cannot read  [expect 1: V3]",
    file: REPO,
    find: "    if (!this.indexIsReadable()) return all;\n",
    replace: "",
    expectFailing: ids("V3"),
  },
  {
    id: "S19 a list holding a non-id counts as readable  [expect 1: V3]",
    file: REPO,
    find: 'Array.isArray(parsed) && parsed.every((id) => typeof id === "string")',
    replace: "Array.isArray(parsed)",
    expectFailing: ids("V3"),
  },
  {
    // The prototype's `save`: it leaves a new project's place in the list to `list`'s write, which swallows a failure.
    id: "S20 save relies on the load's write for a new project  [expect 1: W1]",
    file: REPO,
    find: "    if (!ids.includes(project.id)) {",
    replace: "    if (!this.list().includes(project.id)) {",
    expectFailing: ids("W1"),
  },
  {
    id: "S21 every load in signed-out storage writes the list  [expect 1: L4]",
    file: REPO,
    find: "    if (kept.length === ids.length && unlisted.length === 0) return ids;\n",
    replace: "",
    expectFailing: ids("L4"),
  },
];
