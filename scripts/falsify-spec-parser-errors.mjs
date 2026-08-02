// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Proof the §3.4 per-column error-path tests can FAIL.
//
// The item was opened on a first-of-a-group finding: the existing tests "errors on
// non-integer duration" and "errors on negative duration" exercise the Optimistic
// (Min) column ONLY and assert `.toContain("non-negative integer")` — a substring all
// three columns share. The structurally identical Most Likely and Pessimistic (Max)
// blocks had never executed.
//
// ⚠️ P1/P2 BELOW ARE THE POINT OF THIS SPEC. They are the exact copy-paste slip the
// independent-expression heuristic predicted would be invisible: a wrong column label
// or a wrong echoed variable in one of three near-identical blocks. Nothing downstream
// restates which column a message names — not ActivitySchema, not the type system, not
// any other test — so if these two mutations are not killed here, that defect class is
// undetectable in this codebase. They ARE killed, which is what makes the new tests
// worth their line count.
const P = new URL("../src/core/import/flat-activity-parser.ts", import.meta.url).pathname;

export const testFile = "src/core/import/flat-activity-parser.test.ts";

export const mutations = [
  // -- the predicted defect class: label and value crossed between blocks ------
  {
    id: "P1  Max block carries the Min block's column label",
    file: P,
    find: `        column: "Pessimistic (Max)",`,
    replace: `        column: "Optimistic (Min)",`,
    expectFailing: /non-integer Max against its own column/,
  },
  {
    id: "P2  Max block echoes the Min cell instead of its own",
    file: P,
    find: `truncate(rawMax)`,
    replace: `truncate(rawMin)`,
    expectFailing: /non-integer Max against its own column/,
  },
  {
    id: "P3  Most Likely block carries the wrong column label",
    file: P,
    find: `        column: "Most Likely",`,
    replace: `        column: "Optimistic (Min)",`,
    expectFailing: /non-integer Most Likely against its own column/,
  },
  {
    id: "P4  Most Likely block echoes the Min cell instead of its own",
    file: P,
    find: `truncate(rawML)`,
    replace: `truncate(rawMin)`,
    expectFailing: /non-integer Most Likely against its own column/,
  },

  // -- the required-field guards ----------------------------------------------
  {
    id: "P5  missing Activity ID no longer reported",
    file: P,
    find: `    if (!rawActivityId) {`,
    replace: `    if (false && !rawActivityId) {`,
    expectFailing: /missing Activity ID against its own column/,
  },
  {
    id: "P6  missing Activity Name no longer reported",
    file: P,
    find: `    if (!rawName) {`,
    replace: `    if (false && !rawName) {`,
    expectFailing: /missing Activity Name against its own column/,
  },
  {
    id: "P7  the Activity ID message text drifts",
    file: P,
    find: `        message: "Activity ID is required.",`,
    replace: `        message: "Activity ID is required",`,
    expectFailing: /missing Activity ID against its own column/,
  },

  // -- row numbering and skip semantics ---------------------------------------
  {
    id: "P8  row numbers become 0-based (the classic off-by-one)",
    file: P,
    find: `    const rowNum = i + 1; // 1-based for user display`,
    replace: `    const rowNum = i; // 1-based for user display`,
    expectFailing: /numbers rows against the raw sheet/,
  },
  {
    id: "P9  a failed required-field row aborts the whole import",
    file: P,
    find: `        message: "Activity ID is required.",\n        severity: "error",\n      });\n      continue;`,
    replace: `        message: "Activity ID is required.",\n        severity: "error",\n      });\n      break;`,
    expectFailing: /does not let a failed row stop the rows behind it/,
  },

  // -- predecessor tokens and the default id generator -------------------------
  {
    id: "P10 the unparseable-token message collapses into the unresolved one",
    file: P,
    find: `Invalid predecessor token "\${truncate(token)}". Expected format: A1 or A1+3 or A1-2.`,
    replace: `Predecessor "\${truncate(token)}" not found. Check the Activity ID.`,
    expectFailing: /unparseable predecessor token/,
  },
  {
    id: "P11 the Predecessors column label drifts",
    file: P,
    find: `          column: "Predecessors",\n          message: \`Invalid predecessor token`,
    replace: `          column: "Predecessorz",\n          message: \`Invalid predecessor token`,
    expectFailing: /unparseable predecessor token/,
  },
  {
    id: "P12 the default id generator stops producing UUIDs",
    file: P,
    find: `  idGen: () => string = () => crypto.randomUUID(),`,
    replace: `  idGen: () => string = () => "not-a-uuid",`,
    expectFailing: /falls back to crypto.randomUUID/,
  },
];
