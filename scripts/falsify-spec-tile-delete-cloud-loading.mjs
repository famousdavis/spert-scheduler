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
// fails. Each expected set is written here before the run, never inferred from it; where a first run read
// more than a set named, the straw's comment says so (W1; and S3, S5 and D1 with WI-113's sign-in display
// tests, owner ruling, 2026-10-16). S3's, S5's and D1's were then extended by name with the tests of the project
// page's states and of the switches of storage while signed in (owner ruling, 2026-10-17), from a run of those tests'
// file with each straw applied, each with its reason beside it.
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
// ProjectsPage.cloud-create-gate.test.tsx (WI-112)
const G_RESTORE =
  "control: while a remembered sign-in is still being restored nothing is greyed — the gate starts when the sign-in is recognised";
const G_EMPTY_REFETCH =
  "an empty re-fetch ending first: the Dashboard says it is loading, with New Project and Load Sample greyed, until the first load ends";
const G_DELETE_FOCUS =
  "while New Project is greyed out, deleting the last tile moves focus to the note, which says why, and on to New Project when the load ends";
const G_LATE_SETTINGS =
  "the first sign-in's settings, arriving while the second sign-in's load runs, leave New Project, Load Sample, the loading message and Choose File as they were until that load ends";
const G_LATE_FAILURE =
  "the first sign-in's settings load failing while the second sign-in's load runs leaves New Project, Load Sample, the loading message and Choose File as they were until that load ends";
// ProjectsPage.invitation-refetch.test.tsx and StorageProvider.sign-out-cleanup.test.tsx (WI-113)
const L_FIRST_ENDED =
  "with the first load ended empty and the invitation re-fetch still running, the Dashboard says the projects are loading, not that there are none";
const L_REFETCH_ENDED =
  "with the re-fetch ended empty and the first load still running, the Dashboard says the projects are loading until the first load ends too";
const L_REFETCH_FAILS =
  "a re-fetch that fails ends its part: with the first load ended empty, the Dashboard then says the load failed, not that there are no projects";
// ProjectsPage.cloud-sign-in-display.test.tsx and the sign-in display's pin (WI-113)
const D_RELOAD =
  "a reload with a remembered sign-in: once the sign-in is recognised, the Dashboard says the projects are loading, with none of this browser's signed-out projects, until the cloud's arrive";
const D_FRESH =
  "a sign-in from the signed-out state: the signed-out projects leave the Dashboard as the sign-in is recognised";
const D_AGAIN =
  "a sign-in again in the same tab after a sign-out: the signed-out projects brought back by the sign-out leave the Dashboard during the next first load";
const D_CHANGE =
  "a different user signed in with no sign-out between: the first user's projects leave the Dashboard at once, and the second user's first load fills it";
const D_DASHBOARD =
  "the Dashboard, opened again while the first load runs, does not load the user's copy in this browser into the list";
const D_C_NONE =
  "control: with no signed-out projects in this browser, a cloud sign-in says the projects are loading, then shows them, as before";
const F_FIRST =
  "a failed first load: the Dashboard says so, and not 'No projects yet.'";
const F_FIRST_LOCAL =
  "a failed first load with this browser's signed-out projects: the Dashboard says so, and shows none of them";
const F_REFETCH_BEFORE =
  "a failed invitation re-fetch before the first load ends: the Dashboard says the projects are loading until that load ends, then that loading failed — the first load began before the invitation was claimed";
const F_THEN_REFETCH =
  "a failed first load, then an invitation re-fetch that answers: the line goes, and the re-fetch's list is on show";
const F_SIGN_OUT =
  "the line goes when the session ends: after a sign-out the Dashboard shows this browser's signed-out projects, without it";
const F_NEW_SESSION =
  "a new session starts without the line: a failed load, a sign-out and a sign-in again — no line while the second load runs, nor after it";
const F_CHANGE =
  "a different user signed in after a failed load, with no sign-out between: the second user's Dashboard does not say a load failed";
const K_SIGN_IN_DISPLAY =
  "while a cloud sign-in's first load runs, the project list holds none of this browser's signed-out projects, nor the user's copy in this browser, and the Dashboard says the projects are loading";
const L_NO_INVITATION =
  "control: a sign-in with no invitation says the projects are loading until its one load ends, then shows them, as before";
const R_FAILS_LATE = "a re-fetch that fails after a sign-out does not end the next sign-in's load";
const R_ANSWERS_LATE =
  "a re-fetch that answers after a sign-out neither ends the next sign-in's load nor puts its projects on screen";
const O_NONE =
  "control: with no signed-out projects in this browser, the Dashboard says 'No projects yet.' after a sign-out, as before";

// ProjectsPage.cloud-sign-in-display.test.tsx — the project page's states and the switches of storage while signed in
// (owner ruling, 2026-10-17)
const N_FAILED_PAGE =
  "a reload of a cloud project's page, the first load failing: the page says the load failed, in place of both lines — not that the project may have been deleted";
const N_FAILED_PENDING =
  "a failed first load while the invitation re-fetch still runs: the page says the projects are loading, not that a load failed, until the re-fetch answers — and then, the line gone, today's two lines";
const M_DURING =
  "a switch to local storage while the first load runs lists this browser's copy of the user's projects — not 'No projects yet.' — the ended load's late answer does not replace it, and nothing is sent";
const M_FAILED = "a switch to local storage after a failed first load lists this browser's copy of the user's projects";
const L_SWITCH =
  "signed in with local storage chosen and this browser's projects on show, a switch to cloud storage empties the list until the first load ends";
const escape = (s) => s.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

/** Matches exactly these test titles, as the verbose reporter prints them. */
const only = (...titles) => new RegExp(`> (?:${titles.map(escape).join("|")})$`);

export const testFile = "src/";
export const mutations = [
  {
    // The control test (name and tile body open the project) holds: those clicks start in the tile.
    id: "S1  the tile opens on any click that reaches it  [expect 10: T_DELETE, T_CANCEL, T_TEXT, T_ENTER_DELETE, T_SPACE_DELETE, T_ENTER_CANCEL, T_FOCUS_NEXT, T_FOCUS_PREV, T_FOCUS_NONE, G_DELETE_FOCUS]",
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
      G_DELETE_FOCUS,
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
    id: "S2  no focus destination after a tile's Delete  [expect 5: T_ENTER_DELETE, T_FOCUS_NEXT, T_FOCUS_PREV, T_FOCUS_NONE, G_DELETE_FOCUS]",
    file: PAGE,
    find:
      "deleteProject(id);\n      queueMicrotask(() => {\n        focusAfterTileDelete(\n          gridRef.current,\n          neighbourId,\n          lastResortFocus(newProjectRef.current, createNoteRef.current)\n        );\n      });",
    replace: "deleteProject(id);",
    expectFailing: only(T_ENTER_DELETE, T_FOCUS_NEXT, T_FOCUS_PREV, T_FOCUS_NONE, G_DELETE_FOCUS),
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
    // Extended by name with tests added later (owner ruling, 2026-10-17): the loading line they read is replaced by it.
    // C_LOCAL and C_SIGN_OUT never expect the loading message, so they hold. (Its first run with WI-113's failure-line
    // tests read "24 failing; named-match 23" before this set named F_REFETCH_BEFORE, which expects the loading message
    // while the first load still runs.)
    id: "S3  'No projects yet.' whenever the list is empty  [expect 26: C_RESTORE, C_LOADED, C_NONE, C_FAILED, C_SWITCH, C_SIGN_IN, G_RESTORE, G_EMPTY_REFETCH, G_LATE_SETTINGS, G_LATE_FAILURE, L_FIRST_ENDED, L_REFETCH_ENDED, L_REFETCH_FAILS, L_NO_INVITATION, R_FAILS_LATE, R_ANSWERS_LATE, D_RELOAD, D_FRESH, D_AGAIN, D_CHANGE, D_DASHBOARD, D_C_NONE, K_SIGN_IN_DISPLAY, F_REFETCH_BEFORE, M_DURING, L_SWITCH]",
    file: PAGE,
    find: "if (projects.length === 0 && cloudLoadPending) {",
    replace: "if (projects.length === 0 && false) {",
        expectFailing: only(
      C_RESTORE, C_LOADED, C_NONE, C_FAILED, C_SWITCH, C_SIGN_IN, G_RESTORE, G_EMPTY_REFETCH, G_LATE_SETTINGS, G_LATE_FAILURE, L_FIRST_ENDED, L_REFETCH_ENDED, L_REFETCH_FAILS, L_NO_INVITATION, R_FAILS_LATE, R_ANSWERS_LATE, D_RELOAD, D_FRESH, D_AGAIN, D_CHANGE, D_DASHBOARD, D_C_NONE, K_SIGN_IN_DISPLAY, F_REFETCH_BEFORE, M_DURING, L_SWITCH,
    ),
  },
  {
    // Only C_RESTORE looks at the dashboard before the auth listener has answered.
    id: "S4  the sign-in restore shows 'No projects yet.'  [expect 2: C_RESTORE, G_RESTORE]",
    file: PAGE,
    find: 'const cloudLoadPending = !storageReady || (mode === "cloud" && !cloudDataLoaded);',
    replace: 'const cloudLoadPending = mode === "cloud" && !cloudDataLoaded;',
    expectFailing: only(C_RESTORE, G_RESTORE),
  },
  {
    // Extended by name with tests added later (owner ruling, 2026-10-17): the loading line they read is replaced by it.
    // (Its first run with WI-113's failure-line tests read "22 failing; named-match 21" before this set named
    // F_REFETCH_BEFORE, as in S3.)
    id: "S5  the cloud load shows 'No projects yet.'  [expect 24: C_LOADED, C_NONE, C_FAILED, C_SWITCH, C_SIGN_IN, G_EMPTY_REFETCH, G_LATE_SETTINGS, G_LATE_FAILURE, L_FIRST_ENDED, L_REFETCH_ENDED, L_REFETCH_FAILS, L_NO_INVITATION, R_FAILS_LATE, R_ANSWERS_LATE, D_RELOAD, D_FRESH, D_AGAIN, D_CHANGE, D_DASHBOARD, D_C_NONE, K_SIGN_IN_DISPLAY, F_REFETCH_BEFORE, M_DURING, L_SWITCH]",
    file: PAGE,
    find: 'const cloudLoadPending = !storageReady || (mode === "cloud" && !cloudDataLoaded);',
    replace: "const cloudLoadPending = !storageReady;",
        expectFailing: only(
      C_LOADED, C_NONE, C_FAILED, C_SWITCH, C_SIGN_IN, G_EMPTY_REFETCH, G_LATE_SETTINGS, G_LATE_FAILURE, L_FIRST_ENDED, L_REFETCH_ENDED, L_REFETCH_FAILS, L_NO_INVITATION, R_FAILS_LATE, R_ANSWERS_LATE, D_RELOAD, D_FRESH, D_AGAIN, D_CHANGE, D_DASHBOARD, D_C_NONE, K_SIGN_IN_DISPLAY, F_REFETCH_BEFORE, M_DURING, L_SWITCH,
    ),
  },
  {
    // Extended by name with tests added later (owner ruling, 2026-10-17): a failed load still counts as running, so a
    // project's page keeps the loading line, and the failure line one of them reads first is never shown.
    // A dependency, not an old behaviour: the failed load no longer ends cloud sync's first load,
    // so the loading message stays up for good — and WI-113's failure line, said only once no load is
    // pending, never shows. C_FAILED and the failure-line tests that fail a first load read it. (Its
    // first run with those tests read "7 failing; named-match 2" before this set named the other five.)
    id: "D1  a failed cloud load never marks the load ended  [expect 10: C_FAILED, F_FIRST, F_FIRST_LOCAL, F_THEN_REFETCH, F_SIGN_OUT, F_NEW_SESSION, F_CHANGE, N_FAILED_PAGE, N_FAILED_PENDING, M_FAILED]",
    file: SYNC,
    find:
      "state after a transient load failure (pitfall #88) — once no\n          // re-fetch is still running (WI-113).\n          firstLoadEnded();",
    replace: "state after a transient load failure (pitfall #88) — once no\n          // re-fetch is still running (WI-113).",
        expectFailing: only(
      C_FAILED, F_FIRST, F_FIRST_LOCAL, F_THEN_REFETCH, F_SIGN_OUT, F_NEW_SESSION, F_CHANGE, N_FAILED_PAGE, N_FAILED_PENDING, M_FAILED,
    ),
  },
  {
    // The wrong design: the flag alone is false in local storage too, so the message shows there.
    // C_LOADED, C_NONE and C_FAILED end in cloud storage with the flag set, so they hold. T_FOCUS_NONE
    // fails too: its local-storage Dashboard, emptied by the Delete, shows the message instead of the
    // empty state, whose own New Project it counts. (v2's first run measured that sixth failure before
    // this set named it: "6 failing; named-match 5".)
    id: "W1  the cloud flag without the storage mode  [expect 7: C_LOCAL, C_RESTORE, C_SIGN_OUT, C_SWITCH, C_SIGN_IN, T_FOCUS_NONE, O_NONE]",
    file: PAGE,
    find: 'const cloudLoadPending = !storageReady || (mode === "cloud" && !cloudDataLoaded);',
    replace: "const cloudLoadPending = !storageReady || !cloudDataLoaded;",
    expectFailing: only(C_LOCAL, C_RESTORE, C_SIGN_OUT, C_SWITCH, C_SIGN_IN, T_FOCUS_NONE, O_NONE),
  },
];
