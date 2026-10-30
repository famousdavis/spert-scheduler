// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Falsification spec for a constraint conflict listed once (WI-140, v0.79.33).
//
// With Dependencies on, the forward pass reports a hard Must Start On or Must Finish On conflict, and the post-pass
// sweep (`detectSoftConflicts`) reported the same conflict again, so one conflict read as "2 conflicts". The sweep now
// skips a hard MSO / MFO. Each straw moves that skip and must fail the rows of deterministic.test.ts's WI-140 table it
// concerns, plus the deterministic oracle's cases that pin those conflicts. Read "K failing; named-match K", not merely
// a non-zero exit: the runner prints ✔ when ANY named test fails. Each straw was run ALONE first, against the whole
// suite; its expected set is what that run observed.
const DETERMINISTIC = new URL("../src/core/schedule/deterministic.ts", import.meta.url).pathname;

const escape = (s) => s.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

/** Matches exactly these test titles, as the verbose reporter prints them. */
const only = (...titles) => new RegExp(`> (?:${titles.map(escape).join("|")})$`);

const MSO_ROW = "dependency schedule, hard Must Start On conflicting with its predecessor";
const MFO_ROW = "dependency schedule, hard Must Finish On conflicting with its predecessor";
const SNLT_ROW = "dependency schedule, hard Start No Later Than conflicting with its predecessor (control: the post-pass's own)";
const ORACLE = (name) => `matches the pinned output: ${name}`;

export const testFile = "src/";
export const mutations = [
  {
    id: "W1  the skip removed  [expect 5: the MSO and MFO rows, and the oracle's three doubled cases]",
    file: DETERMINISTIC,
    find: 'if (activity.constraintMode === "hard" && forwardPassReports) continue;',
    replace: "",
    expectFailing: only(
      MSO_ROW,
      MFO_ROW,
      ORACLE("constraint MFO hard"),
      ORACLE("hard MSO on successor forces an FS violation"),
      ORACLE("hard MFO on successor forces an FF violation"),
    ),
  },
  {
    id: "W2  the skip widened to every hard constraint  [expect 2: the SNLT row, the oracle's FNLT hard]",
    file: DETERMINISTIC,
    find: 'activity.constraintMode === "hard" && forwardPassReports',
    replace: 'activity.constraintMode === "hard"',
    expectFailing: only(SNLT_ROW, ORACLE("constraint FNLT hard")),
  },
  {
    id: "W3  the skip narrowed to Must Start On only  [expect 3: the MFO row, the oracle's two MFO cases]",
    file: DETERMINISTIC,
    find: 'activity.constraintType === "MSO" || activity.constraintType === "MFO"',
    replace: 'activity.constraintType === "MSO"',
    expectFailing: only(
      MFO_ROW,
      ORACLE("constraint MFO hard"),
      ORACLE("hard MFO on successor forces an FF violation"),
    ),
  },
];
