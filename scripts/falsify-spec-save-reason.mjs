// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Falsification spec for "why Save is off" in the Edit Activity window (v0.73.3).
//
// The window gives the FIRST reason Save is off, beside Save, and says under an empty Date field
// that a chosen constraint needs one; the discard prompt reads the same cause. Each straw below
// names EXACTLY the tests it must fail, and no others — read "K failing; named-match K", not merely
// a non-zero exit: the runner prints ✔ when ANY named test fails. A straw that under-fires looks
// exactly like a test that over-claims, so each expected set is written here before the run,
// never inferred from it.
//
// testFile is all of src/ui/, so one run reaches the decision table, the new modal rows and the
// existing modal rows together.
const MODAL = new URL("../src/ui/components/ActivityEditModal.tsx", import.meta.url).pathname;
const CAUSE = new URL("../src/ui/helpers/unsaveable-cause.ts", import.meta.url).pathname;

// ActivityEditModal.test.tsx — "why Save is off".
const M1 = "a constraint without a date: the Date field and the line beside Save both say so";
const M2 = "entering the date clears both, and Save is on with no description";
const M3 = "Clear constraint from a dateless constraint clears both, and Save is on";
const M4 = "an empty name: the line beside Save names it, and the field's own message stays";
const M5 = "an empty name AND a constraint without a date: the line names the name, first";
const M6 = "a negative estimate: the line beside Save names it";
// ActivityEditModal.test.tsx — the existing discard-prompt row, updated in this release.
const PINNED = "names the CONSTRAINT, not the name, when the constraint is what blocks saving";

// unsaveable-cause.test.ts — decision rows, parity rows and text rows, by their printed titles.
const D = "2026-12-01";
const row = (name, negative, type, date, mode) =>
  `[name ${name}, ${negative}, type ${type}, date ${date}, mode ${mode}]`;
const ROW_NAME_FIRST = [
  `${row("missing", "negative", "SNET", "none", "none")} → name`,
  `${row("missing", "negative", "SNET", "none", "hard")} → name`,
  `${row("missing", "negative", "SNET", D, "none")} → name`,
  `${row("missing", "no negative", "SNET", "none", "none")} → name`,
  `${row("missing", "no negative", "SNET", "none", "hard")} → name`,
  `${row("missing", "no negative", "SNET", D, "none")} → name`,
  `${row("set", "negative", "SNET", "none", "none")} → negativeEstimate`,
  `${row("set", "negative", "SNET", "none", "hard")} → negativeEstimate`,
  `${row("set", "negative", "SNET", D, "none")} → negativeEstimate`,
];
const ROW_TYPE_NO_DATE = [
  `${row("set", "no negative", "SNET", "none", "none")} → constraintDate`,
  `${row("set", "no negative", "SNET", "none", "hard")} → constraintDate`,
];
const PARITY_TYPE_NO_DATE_HARD = `parity ${row("set", "no negative", "SNET", "none", "hard")}`;
const TEXT_PROMPT_DATE = "prompt text for constraintDate";

const escape = (s) => s.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

/** Matches exactly these test titles, as the verbose reporter prints them. */
const only = (...titles) => new RegExp(`> (?:${titles.map(escape).join("|")})$`);

const ORDER = [
  '  if (nameMissing) return "name";',
  '  if (negativeEstimate) return "negativeEstimate";',
  '  if (constraintType && !constraintDate) return "constraintDate";',
  '  if (constraintType && !constraintMode) return "constraintMode";',
].join("\n");

export const testFile = "src/ui/";
export const mutations = [
  {
    // M2, M3 and M5 fail at their positive controls, which read the line before their action.
    id: "B1  the line beside Save not rendered  [expect 6: M1, M2, M3, M4, M5, M6]",
    file: MODAL,
    find: "            {saveBlocked && (\n              <p id={saveBlockedId}",
    replace: "            {false && (\n              <p id={saveBlockedId}",
    expectFailing: only(M1, M2, M3, M4, M5, M6),
  },
  {
    // M2 and M3 fail at their positive controls. M5 reads only the line beside Save, so it holds.
    id: "B2  the Date message not rendered  [expect 3: M1, M2, M3]",
    file: MODAL,
    find: "                      {!constraintDate && (\n                        <p id={fieldConstraintDateErrorId}",
    replace: "                      {false && (\n                        <p id={fieldConstraintDateErrorId}",
    expectFailing: only(M1, M2, M3),
  },
  {
    // Both constraint checks ahead of the name and the negative estimate. Nine decision rows
    // change their answer — every incomplete constraint under an empty name or a negative
    // estimate; no parity row moves, because whether Save is off does not depend on the order.
    id: "B3  the constraint checked before the name  [expect 10: M5, 9 decision rows]",
    file: CAUSE,
    find: ORDER,
    replace: [
      '  if (constraintType && !constraintDate) return "constraintDate";',
      '  if (constraintType && !constraintMode) return "constraintMode";',
      '  if (nameMissing) return "name";',
      '  if (negativeEstimate) return "negativeEstimate";',
    ].join("\n"),
    expectFailing: only(M5, ...ROW_NAME_FIRST),
  },
  {
    // A Type with no Date becomes saveable when Mode is set ("hard", as choosing a Type sets it),
    // so Save turns on and no line shows. M5 fails at its control. PINNED fails because Escape on
    // a saveable draft asks the three-way, not "Discard your changes?". Of the decision rows, the
    // two Type-without-Date rows move (no mode → constraintMode; hard → saveable); of the parity
    // rows, only the one that became saveable.
    id: "B4  the constraintDate branch removed  [expect 8: M1, M2, M3, M5, PINNED, 2 decision rows, 1 parity row]",
    file: CAUSE,
    find: '  if (constraintType && !constraintDate) return "constraintDate";\n',
    replace: "",
    expectFailing: only(M1, M2, M3, M5, PINNED, ...ROW_TYPE_NO_DATE, PARITY_TYPE_NO_DATE_HARD),
  },
  {
    // M2's positive control reads Save's aria-describedby before the date goes in, so it fails
    // with M1.
    id: "B5  Save's aria-describedby spread returns {}  [expect 2: M1, M2]",
    file: MODAL,
    find: 'return saveBlocked ? { "aria-describedby": reasonId } : {};',
    replace: "return {};",
    expectFailing: only(M1, M2),
  },
  {
    id: "B6  the constraintDate prompt text back to 'needs both a date and a mode'  [expect 2: PINNED, the text row]",
    file: CAUSE,
    find: "\"This activity's constraint needs a date, so",
    replace: "\"This activity's constraint needs both a date and a mode, so",
    expectFailing: only(PINNED, TEXT_PROMPT_DATE),
  },
  {
    id: "B7  the Date input's aria spread returns {}  [expect 1: M1]",
    file: MODAL,
    find: 'return constraintDate ? {} : { "aria-invalid": true, "aria-describedby": errorId };',
    replace: "return {};",
    expectFailing: only(M1),
  },
];
