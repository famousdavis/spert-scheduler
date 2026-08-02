// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Proof the §3.8 migration characterisation tests can FAIL.
//
// These tests exist because `migrateV11toV12`'s write-forward had NEVER executed
// (v8 branch counts [0, 0] against the whole suite) and `migrateV10toV11`'s
// preserve-existing-data branch had never been taken ([2, 0]). Tests written over
// never-executed code are exactly the tests most likely to be inert: nothing about
// them was ever disproved by a red run. Each mutation below is a plausible slip a
// decomposition of these functions could make.
//
// Note the shape of the preserve-case tests they defend: each fixture carries BOTH a
// value the migration must rewrite and one it must leave alone. M3 and M7 exist to
// prove that pairing works — they break only the leave-alone half.
const MIG = new URL("../src/infrastructure/persistence/migrations.ts", import.meta.url)
  .pathname;

export const testFile = "src/infrastructure/persistence/migrations.test.ts";

export const mutations = [
  // -- migrateV10toV11 -------------------------------------------------------
  {
    id: "M1  constraint guard: || → && (the classic De Morgan slip)",
    file: MIG,
    find: `      if (!hasType || !hasDate || !hasMode) {`,
    replace: `      if (!hasType && !hasDate && !hasMode) {`,
    expectFailing: /nulls a constraint missing only constraintMode/,
  },
  {
    id: "M2  constraint guard drops the !hasMode clause (never the deciding one before)",
    file: MIG,
    find: `      if (!hasType || !hasDate || !hasMode) {`,
    replace: `      if (!hasType || !hasDate) {`,
    expectFailing: /nulls a constraint missing only constraintMode/,
  },
  {
    id: "M3  constraint nulling becomes unconditional (wipes a valid constraint)",
    file: MIG,
    find: `      if (!hasType || !hasDate || !hasMode) {`,
    replace: `      if (true || !hasType || !hasDate || !hasMode) {`,
    expectFailing: /preserves a fully-specified constraint/,
  },
  {
    id: "M4  nulling extended to constraintNote",
    file: MIG,
    find: `            activity.constraintMode = null;`,
    replace: `            activity.constraintMode = null;\n            activity.constraintNote = null;`,
    expectFailing: /leaves an unrelated constraintNote in place/,
  },
  {
    id: "M5  activities truthiness guard removed",
    file: MIG,
    find: `      if (activities) {`,
    replace: `      if (true) {`,
    expectFailing: /skips a scenario with no activities array/,
  },

  // -- migrateV11toV12 -------------------------------------------------------
  {
    id: "M6  write-forward handles undefined but no longer null",
    file: MIG,
    find: `          if (dep.type === undefined || dep.type === null) {`,
    replace: `          if (dep.type === undefined) {`,
    expectFailing: /writes type = FS onto dependencies missing or nulling the field/,
  },
  {
    id: "M7  write-forward becomes an unconditional overwrite",
    file: MIG,
    find: `          if (dep.type === undefined || dep.type === null) {\n            dep.type = "FS";\n          }`,
    replace: `          dep.type = "FS";`,
    expectFailing: /preserves an existing SS type/,
  },
  {
    id: "M8  write-forward writes the wrong default type",
    file: MIG,
    find: `            dep.type = "FS";`,
    replace: `            dep.type = "SS";`,
    expectFailing: /does not default the required lagDays field/,
  },
  {
    id: "M9  write-forward also defaults lagDays (the asymmetry closed)",
    file: MIG,
    find: `            dep.type = "FS";`,
    replace: `            dep.type = "FS";\n            if (dep.lagDays === undefined) dep.lagDays = 0;`,
    expectFailing: /does not default the required lagDays field/,
  },
  {
    id: "M10 dependencies truthiness guard removed",
    file: MIG,
    find: `      if (deps) {`,
    replace: `      if (true) {`,
    expectFailing: /skips a scenario with no dependencies array/,
  },
  {
    id: "M11 both loops guarded with Array.isArray (containment claim would change)",
    file: MIG,
    find: `      if (deps) {`,
    replace: `      if (Array.isArray(deps)) {`,
    also: {
      find: `      if (activities) {`,
      replace: `      if (Array.isArray(activities)) {`,
    },
    expectFailing: /throws, and callers catch it/,
  },
];
