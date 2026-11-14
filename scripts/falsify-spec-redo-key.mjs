// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// v0.86.5 — falsification spec: the undo/redo keys read the letter without its case.
// R1 puts the v0.86.4 handler back: the rows that send the keys as a browser does must fail.
// R2–R5 break the new rule one part at a time; R6–R9 break the handler around it, to show the
// rows that now send "Z" are live (with "z" they could not tell a guard from a deaf handler).
// Against the whole suite.
//
// ⚠️ Every straw is one needle, with no `also`, so that a runner that applies only `find` still
// makes the straw it names. `falsify.mjs` passes a straw on ANY named match: the `[expect N]`
// in each id is the count measured when this spec was written, for the reader.
//
//   node scripts/falsify.mjs scripts/falsify-spec-redo-key.mjs
const PAGE = new URL("../src/ui/pages/ProjectPage.tsx", import.meta.url).pathname;
const RULE = new URL("../src/ui/helpers/undo-keys.ts", import.meta.url).pathname;
const escape = (s) => s.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
const only = (...titles) => new RegExp(`> (?:${titles.map(escape).join("|")})$`);

// Page rows (ProjectPage.test.tsx, "ProjectPage — undo/redo keyboard shortcuts").
const CTRL_SHIFT_Z = 'Ctrl+Shift+Z redoes what Ctrl+Z undid, sent as a browser sends it (key "Z")';
const CMD_SHIFT_Z_UPPER = 'Cmd+Shift+Z redoes on a Mac, sent as Mac Chrome sends it (key "Z")';
const CMD_SHIFT_Z_LOWER = 'Cmd+Shift+Z still redoes where a Mac browser drops Shift from the key (key "z")';
const CAPS_Z = 'Caps Lock: Ctrl+Z arrives as "Z" with Shift off, and still undoes';
const CAPS_Y = 'Caps Lock: Ctrl+Y arrives as "Y" with Shift off, and still redoes';
const SHIFT_Y = 'Ctrl+Shift+Y stays unbound, as "Y" and as "y": no redo, and the key is not taken';
const NO_KEY = "a Ctrl keydown with no key does nothing and throws nothing";
const NAME_CELL = "Ctrl+Shift+Z in an activity name cell does not redo";
// ProjectPage.scenario-target.test.tsx and ProjectPage.undo-in-window.test.tsx.
const SCENARIO_DATE =
  "Ctrl+Z restores the scenario's previous date and leaves the other's; Ctrl+Shift+Z puts it back";
const IN_WINDOW = "Ctrl+Y and Ctrl+Shift+Z on the window's Save leave an undone change undone";
// Unit rows (undo-keys.test.ts).
const U_SHIFT_Z = "Shift+Z as a browser sends it, 'Z': redo";
const U_SHIFT_Z_DROPPED = "Shift+Z as a Mac browser that drops Shift with Cmd sends it, 'z': redo";
const U_CAPS_Z = "Caps Lock z, 'Z' with Shift off: undo";
const U_CAPS_Y = "Caps Lock y, 'Y' with Shift off: redo";
const U_SHIFT_Y = "Shift+Y as a browser sends it, 'Y': nothing";
const U_SHIFT_Y_DROPPED = "Shift+Y with Shift dropped, 'y': nothing";
const U_NO_KEY = "no key at all: nothing";
const U_NO_KEY_SHIFT = "no key at all, Shift held: nothing";
const U_NULL = "a null key: nothing";
const U_NUMBER = "a number: nothing";

const NEW_DECISION = `      const action = undoRedoForKey(e.key, e.shiftKey);
      if (action === null) return;
      e.preventDefault();
      if (action === "undo") undo();
      else redo();
`;
const OLD_DECISION = `      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.key === "z" && e.shiftKey) || e.key === "y") {
        e.preventDefault();
        redo();
      }
`;
const NULL_THEN_PREVENT = `      if (action === null) return;
      e.preventDefault();
`;

export const testFile = "src/";

export const mutations = [
  {
    id: "R1 the v0.86.4 handler, which matched only a lowercase z or y [expect 6]",
    file: PAGE,
    find: NEW_DECISION,
    replace: OLD_DECISION,
    expectFailing: only(CTRL_SHIFT_Z, CMD_SHIFT_Z_UPPER, CAPS_Z, CAPS_Y, SHIFT_Y, SCENARIO_DATE),
  },
  {
    id: "R2 the rule reads the letter with its case [expect 8]",
    file: RULE,
    find: "  const letter = key.toLowerCase();\n",
    replace: "  const letter = key;\n",
    expectFailing: only(
      U_SHIFT_Z, U_CAPS_Z, U_CAPS_Y,
      CTRL_SHIFT_Z, CMD_SHIFT_Z_UPPER, CAPS_Z, CAPS_Y, SCENARIO_DATE,
    ),
  },
  {
    id: "R3 Y with Shift redoes too [expect 3]",
    file: RULE,
    find: `  if (letter === "y" && !shiftKey) return "redo";\n`,
    replace: `  if (letter === "y") return "redo";\n`,
    expectFailing: only(U_SHIFT_Y, U_SHIFT_Y_DROPPED, SHIFT_Y),
  },
  {
    id: "R4 the rule lowercases a key that is not a string [expect 5]",
    file: RULE,
    find: `  if (typeof key !== "string") return null;\n`,
    replace: "",
    expectFailing: only(U_NO_KEY, U_NO_KEY_SHIFT, U_NULL, U_NUMBER, NO_KEY),
  },
  {
    id: "R5 Shift is ignored on Z, so Shift+Z undoes [expect 6]",
    file: RULE,
    find: `  if (letter === "z") return shiftKey ? "redo" : "undo";\n`,
    replace: `  if (letter === "z") return "undo";\n`,
    expectFailing: only(
      U_SHIFT_Z, U_SHIFT_Z_DROPPED,
      CTRL_SHIFT_Z, CMD_SHIFT_Z_UPPER, CMD_SHIFT_Z_LOWER, SCENARIO_DATE,
    ),
  },
  {
    id: "R6 the handler no longer takes the key it acts on [expect 2 of these, and older rows]",
    file: PAGE,
    find: NULL_THEN_PREVENT,
    replace: "      if (action === null) return;\n",
    expectFailing: only(CTRL_SHIFT_Z, CAPS_Z),
  },
  {
    id: "R7 the handler takes every Ctrl/Cmd key, Shift+Y included [expect 1 of these, and older rows]",
    file: PAGE,
    find: NULL_THEN_PREVENT,
    replace: "      e.preventDefault();\n      if (action === null) return;\n",
    expectFailing: only(SHIFT_Y),
  },
  {
    id: "R8 a text field no longer keeps its own undo: the name cell's \"Z\" row is live [expect 1 of these, and older rows]",
    file: PAGE,
    find: `      if (inTextField && target.dataset?.undoScope !== "store") return;\n`,
    replace: "",
    expectFailing: only(NAME_CELL),
  },
  {
    id: "R9 an open window no longer keeps the keys: the window's \"Z\" row is live [expect 1 of these, and older rows]",
    file: PAGE,
    find: `      if (target.closest?.('[role="dialog"], [role="alertdialog"]')) return;\n`,
    replace: "",
    expectFailing: only(IN_WINDOW),
  },
];
