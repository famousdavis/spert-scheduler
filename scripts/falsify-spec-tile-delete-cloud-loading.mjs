// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Falsification spec for WI-110 (a tile's delete confirmation keeps the Dashboard) and WI-109 (the
// Dashboard says cloud projects are loading, not that there are none).
//
// S1-S5 each put back ONE old behaviour. S2b, D1 and W1 are not old behaviours: S2b picks the wrong
// neighbour for the focus after a Delete (the one before rather than the one that takes the deleted
// tile's place), D1 removes the existing line WI-109's failure path depends on, and W1 is the tempting
// wrong design (the cloud flag without the storage mode). Each straw names EXACTLY the tests it must fail, and no others — read
// "K failing; named-match K", not merely a non-zero exit: the runner prints ✔ when ANY named test
// fails. Each expected set is written here before the run, never inferred from it.
//
// testFile is all of src/, so every straw runs against the whole suite.
const TILE = new URL("../src/ui/components/ProjectTile.tsx", import.meta.url).pathname;
const PAGE = new URL("../src/ui/pages/ProjectsPage.tsx", import.meta.url).pathname;
const SYNC = new URL("../src/ui/hooks/use-cloud-sync.ts", import.meta.url).pathname;

// ProjectsPage.tile-delete.test.tsx
const T_DELETE = "Delete removes the tile and the Dashboard stays";
const T_CANCEL = "Cancel closes the confirmation and the Dashboard stays, the tile with it";
const T_TEXT = "a click on the confirmation's own text opens nothing, and the confirmation stays open";
const T_ENTER_DELETE =
  "Enter on Delete removes the tile, the Dashboard stays, and focus moves to the tile that takes its place";
const T_SPACE_DELETE = "Space on Delete removes the tile and the Dashboard stays";
const T_ENTER_CANCEL =
  "Enter on Cancel, where the confirmation opens, keeps the Dashboard and the tile, and focus returns to the trash";
const T_FOCUS_NEXT = "after a Delete, focus moves to the next tile — the one that takes the deleted tile's place";
const T_FOCUS_PREV = "when the last tile is deleted, focus moves to the tile before it";
const T_FOCUS_NONE = "when no tile is left, focus moves to the New Project button at the top";
// ProjectTile.portal-press.test.tsx
const T_PRESS = "a press on the confirmation's text starts no drag; a press on the tile still does";
// ProjectsPage.cloud-loading.test.tsx
const C_LOCAL = "local storage: the empty Dashboard says 'No projects yet.' at once, signed in or not";
const C_RESTORE = "cloud storage: while a remembered sign-in is being restored, it says the projects are loading";
const C_LOADED = "signed in: it says the projects are loading until the cloud load ends, then shows them";
const C_NONE = "a cloud load that ends with no projects: loading first, then 'No projects yet.'";
const C_FAILED = "a cloud load that FAILS ends the loading message rather than leaving it up";
const C_SIGN_OUT = "signing out after a cloud load: no loading message, and the empty Dashboard says so";
const C_SWITCH = "switching to local storage ends it; switching back to cloud shows it until that load ends";
const C_SIGN_IN = "signing in during the session: loading, then the projects";

const escape = (s) => s.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

/** Matches exactly these test titles, as the verbose reporter prints them. */
const only = (...titles) => new RegExp(`> (?:${titles.map(escape).join("|")})$`);

export const testFile = "src/";
export const mutations = [
  {
    // The control test (name and tile body open the project) holds: those clicks start in the tile.
    id: "S1  the tile opens on any click that reaches it  [expect 9: T_DELETE, T_CANCEL, T_TEXT, T_ENTER_DELETE, T_SPACE_DELETE, T_ENTER_CANCEL, T_FOCUS_NEXT, T_FOCUS_PREV, T_FOCUS_NONE]",
    file: TILE,
    find: "if (startedInTile(e)) open();",
    replace: "open();",
    expectFailing: only(
      T_DELETE,
      T_CANCEL,
      T_TEXT,
      T_ENTER_DELETE,
      T_SPACE_DELETE,
      T_ENTER_CANCEL,
      T_FOCUS_NEXT,
      T_FOCUS_PREV,
      T_FOCUS_NONE,
    ),
  },
  {
    id: "S1b  the drag listener hears any press that reaches the tile  [expect 1: T_PRESS]",
    file: TILE,
    find: "if (startedInTile(e)) listeners?.onPointerDown?.(e);",
    replace: "listeners?.onPointerDown?.(e);",
    expectFailing: only(T_PRESS),
  },
  {
    // The Dashboard still stays; only where focus lands changes (back to <body>).
    id: "S2  no focus destination after a tile's Delete  [expect 4: T_ENTER_DELETE, T_FOCUS_NEXT, T_FOCUS_PREV, T_FOCUS_NONE]",
    file: PAGE,
    find: "deleteProject(id);\n      queueMicrotask(() => {\n        focusAfterTileDelete(gridRef.current, neighbourId, newProjectRef.current);\n      });",
    replace: "deleteProject(id);",
    expectFailing: only(T_ENTER_DELETE, T_FOCUS_NEXT, T_FOCUS_PREV, T_FOCUS_NONE),
  },
  {
    // The wrong neighbour: the tile before, ahead of the one that takes the deleted tile's place. Only
    // a Delete with tiles on BOTH sides can tell — T_FOCUS_NEXT. T_ENTER_DELETE deletes the first tile
    // (nothing before it), T_FOCUS_PREV the last (nothing after it), T_FOCUS_NONE the only one.
    id: "S2b  the tile before is preferred to the one that takes the place  [expect 1: T_FOCUS_NEXT]",
    file: PAGE,
    find: "const neighbourId = (filteredProjects[at + 1] ?? filteredProjects[at - 1])?.id;",
    replace: "const neighbourId = (filteredProjects[at - 1] ?? filteredProjects[at + 1])?.id;",
    expectFailing: only(T_FOCUS_NEXT),
  },
  {
    // C_LOCAL and C_SIGN_OUT never expect the loading message, so they hold.
    id: "S3  'No projects yet.' whenever the list is empty  [expect 6: C_RESTORE, C_LOADED, C_NONE, C_FAILED, C_SWITCH, C_SIGN_IN]",
    file: PAGE,
    find: "if (projects.length === 0 && cloudLoadPending) {",
    replace: "if (projects.length === 0 && false) {",
    expectFailing: only(C_RESTORE, C_LOADED, C_NONE, C_FAILED, C_SWITCH, C_SIGN_IN),
  },
  {
    // Only C_RESTORE looks at the dashboard before the auth listener has answered.
    id: "S4  the sign-in restore shows 'No projects yet.'  [expect 1: C_RESTORE]",
    file: PAGE,
    find: 'const cloudLoadPending = !storageReady || (mode === "cloud" && !cloudDataLoaded);',
    replace: 'const cloudLoadPending = mode === "cloud" && !cloudDataLoaded;',
    expectFailing: only(C_RESTORE),
  },
  {
    id: "S5  the cloud load shows 'No projects yet.'  [expect 5: C_LOADED, C_NONE, C_FAILED, C_SWITCH, C_SIGN_IN]",
    file: PAGE,
    find: 'const cloudLoadPending = !storageReady || (mode === "cloud" && !cloudDataLoaded);',
    replace: "const cloudLoadPending = !storageReady;",
    expectFailing: only(C_LOADED, C_NONE, C_FAILED, C_SWITCH, C_SIGN_IN),
  },
  {
    // A dependency, not an old behaviour: the failed load no longer ends cloud sync's first load,
    // so the message stays up for good. Only C_FAILED fails a load.
    id: "D1  a failed cloud load never marks the load ended  [expect 1: C_FAILED]",
    file: SYNC,
    find: "state after a transient load failure (pitfall #88).\n          useProjectStore.getState().setCloudDataLoaded(true);",
    replace: "state after a transient load failure (pitfall #88).",
    expectFailing: only(C_FAILED),
  },
  {
    // The wrong design: the flag alone is false in local storage too, so the message shows there.
    // C_LOADED, C_NONE and C_FAILED end in cloud storage with the flag set, so they hold. T_FOCUS_NONE
    // fails too: its local-storage Dashboard, emptied by the Delete, shows the message instead of the
    // empty state, whose own New Project it counts. (v2's first run measured that sixth failure before
    // this set named it: "6 failing; named-match 5".)
    id: "W1  the cloud flag without the storage mode  [expect 6: C_LOCAL, C_RESTORE, C_SIGN_OUT, C_SWITCH, C_SIGN_IN, T_FOCUS_NONE]",
    file: PAGE,
    find: 'const cloudLoadPending = !storageReady || (mode === "cloud" && !cloudDataLoaded);',
    replace: "const cloudLoadPending = !storageReady || !cloudDataLoaded;",
    expectFailing: only(C_LOCAL, C_RESTORE, C_SIGN_OUT, C_SWITCH, C_SIGN_IN, T_FOCUS_NONE),
  },
];
