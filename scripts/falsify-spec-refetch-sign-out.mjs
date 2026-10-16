// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Falsification spec for WI-113 and WI-117 (owner ruling, 2026-10-10): the cloud data counts as loaded only when every
// cloud load of the session has ended — the first load and the invitation re-fetch, counted per session, each counted
// out once however many of its ends it reaches; a re-fetch answer from a session that has ended changes nothing; a
// sign-out puts this browser's signed-out projects back on show where the storage becomes this browser's own again,
// and this browser's signed-out settings back in use (owner ruling, 2026-10-15); Import Projects' Choose File, its
// note and its confirm follow one condition; the note and the file-pick refusal speak in one voice; a sign-out ends
// the session's cloud sync before it resets the preferences, so the defaults are never sent to the cloud — on all
// three ways a session ends — while a preference the user changes is still saved; and the sign-out window says what
// stays in this browser (owner ruling, 2026-10-15).
//
// Each straw breaks ONE guarantee. The WRONG DESIGNS are the tempting ones: the newest load deciding (the rejected
// option of the ruling), one count shared by every session, the handle check on the success callback only or on the
// storage mode, the re-load without the handle check, the re-load where the storage is still the user's, the re-load
// only after a session in cloud storage, the re-load at every change of user, the note's words without the button's
// condition, and ending the cloud sync after the preferences are reset. Each straw names
// EXACTLY the tests it must fail, and no others — read "K failing; named-match K", not merely a non-zero exit: the
// runner prints ✔ when ANY named test fails. Each expected set was written before the run that first included it,
// never inferred from a run.
//
// NOT HERE, on purpose:
// - Ending the cloud sync AFTER WI-118's guard instead of before it (the other place the call could go). Measured: the
//   whole suite passes with it, because no control of the app reaches the cleanup with the storage reading "local"
//   while a cloud session runs — the namespace follows the published user, and a session needs one. It differs only in
//   a state built by hand: there, a re-fetch answer landing between the cleanup and the session's teardown passes the
//   handle check and replaces this browser's signed-out list.
// - Ending the cloud sync on the user's own Sign out only (in AuthProvider's signOut, not the cleanup). It spans two
//   files and the runner applies one file per straw, so it was run once by hand: the terms sign-out and the session
//   ended from outside fail, and nothing else.
// - The first load's failure not counted down: the tile-delete spec breaks that line already.
//
// testFile is all of src/, so every straw runs against the whole suite.
const SYNC = new URL("../src/ui/hooks/use-cloud-sync.ts", import.meta.url).pathname;
const STORAGE = new URL("../src/ui/providers/StorageProvider.tsx", import.meta.url).pathname;
const SECTION = new URL("../src/ui/components/ImportSection.tsx", import.meta.url).pathname;
const WORDS = new URL("../src/ui/helpers/cloud-create-gate.ts", import.meta.url).pathname;
const IMPORT = new URL("../src/ui/hooks/use-import-state.ts", import.meta.url).pathname;
const MODAL = new URL("../src/ui/components/SignOutConfirmModal.tsx", import.meta.url).pathname;

// ProjectsPage.invitation-refetch.test.tsx — the Dashboard
const L_FIRST_ENDED =
  "with the first load ended empty and the invitation re-fetch still running, the Dashboard says the projects are loading, not that there are none";
const L_REFETCH_ENDED =
  "with the re-fetch ended empty and the first load still running, the Dashboard says the projects are loading until the first load ends too";
const L_REFETCH_FAILS =
  "a re-fetch that fails ends its part: with the first load ended empty, the Dashboard then says there are no projects";
const L_EMPTY_KEPT =
  "an empty re-fetch answer while this browser's signed-out projects are listed ends its part too: when the first load ends, Choose File comes back";
const L_ENDED_TWICE =
  "constructed — the first load's success callback throws after the load has ended, so its failure callback ends it again: a later re-fetch still ends the loading";
// — Import Projects
const I_REFETCH_FIRST =
  "the invited project on screen from the re-fetch, the first load still running: Choose File is greyed out, and the note says why";
const I_SETTINGS =
  "the projects on screen and the user's settings still loading: Choose File is greyed out, and the note says projects can't be imported until loading ends";
const I_PICKED =
  "a file reaching Import Projects while it waits is refused as it is picked, in the note's words; chosen again after the load, it imports";
const I_LATER_REFETCH =
  "a file confirmed while a later re-fetch runs is refused, with Choose File greyed out and the note shown; when the re-fetch ends, the file chosen again imports";
const I_CONSTRUCTED =
  "constructed — the cloud sync's own gate shut with the projects loaded, a state no control of the app reaches: Choose File is greyed out with the note, and the confirm refuses";
// — a re-fetch answer from a session that has ended
const R_SIGN_OUT =
  "after a sign-out, a late re-fetch answer leaves this browser's signed-out projects listed, stored and on screen";
const R_SIGN_OUT_EMPTY =
  "after a sign-out, a late EMPTY re-fetch answer leaves this browser's list of signed-out projects as it was";
const R_LOCAL =
  "after a switch to local storage, a late re-fetch answer leaves the projects on screen and the user's own stored list as they were";
const R_FAILS_LATE = "a re-fetch that fails after a sign-out does not end the next sign-in's load";
const R_ANSWERS_LATE =
  "a re-fetch that answers after a sign-out neither ends the next sign-in's load nor puts its projects on screen";
const R_NEXT_SESSION =
  "a re-fetch still running at a sign-out does not hold up the next sign-in: its one load ends the loading";
// — the cloud sign-in's display, left as it was
const K_SIGN_IN_DISPLAY =
  "known defect, unchanged: while a cloud sign-in's first load runs, the project list still holds this browser's signed-out projects, not the user's";
// StorageProvider.sign-out-cleanup.test.tsx
const O_DASHBOARD =
  "signed out on the Dashboard, the Dashboard shows this browser's signed-out projects, not 'No projects yet.'";
const O_SETTINGS = "signed out on Settings, Settings offers this browser's signed-out projects for export";
const O_LOCAL =
  "signed out with local storage chosen, the Dashboard shows this browser's signed-out projects, not 'No projects yet.'";
const PREF_DASHBOARD =
  "signed out on the Dashboard, the settings in use are this browser's signed-out ones; one changed then with the header's theme button keeps the others, and nothing is sent to the cloud";
const PREF_SETTINGS =
  "signed out on Settings, with no signed-out projects in this browser, the settings in use are this browser's signed-out ones; one changed then with the header's theme button keeps the others, and nothing is sent to the cloud";
const P_SIGN_OUT =
  "the user's own Sign out sends no preference save, and the preferences in this browser go back to the defaults";
const P_TERMS =
  "a second account signed out because its terms acceptance is out of date, while the first account's session runs, sends no preference save";
const P_ENDED = "a session ended from outside the app sends no preference save";
const P_CHANGE = "control: a preference the user changes while signed in is saved to the cloud";
const P_RESET = "control: Reset to defaults, pressed while signed in, is saved to the cloud";
const P_AGAIN = "control: a preference changed after signing out and in again is saved, by the new session";
// ProjectsPage.cloud-create-gate.test.tsx (WI-112)
const G_REFETCH_FIRST =
  "the invitation re-fetch ending first does not end it: the controls stay greyed until the first load ends";
const G_REFETCH_EMPTY =
  "an empty re-fetch ending first: the Dashboard says it is loading, with New Project and Load Sample greyed, until the first load ends";
const G_IMPORT =
  "Import Projects: while a cloud load runs nothing is imported — a file picked between the invitation re-fetch and the end of the first load is refused, and so is one confirmed while a later re-fetch runs";
const G_LATE_SETTINGS =
  "the first sign-in's settings, arriving while the second sign-in's load runs, leave New Project, Load Sample, the loading message and Choose File as they were until that load ends";
const G_LATE_FAILURE =
  "the first sign-in's settings load failing while the second sign-in's load runs leaves New Project, Load Sample, the loading message and Choose File as they were until that load ends";
const G_DELETE_UNLOADED =
  "while New Project is greyed out, deleting a project that could not be loaded moves focus to the note, and on to New Project when the load ends";
// AuthProvider.sign-out-namespaces.test.tsx (WI-118)
const W_ORDINARY =
  "control: an ordinary sign-out clears the user's own data and keeps this browser's signed-out projects";
// ImportSection.test.tsx and use-import-state.test.ts
const S_UNLOADED = "cloud mode with unloaded data disables the button and explains why";
const H_PICK = "cloud mode + cloudDataLoaded=false → error, no preview";
// SignOutConfirmModal.test.tsx
const C_STAYS =
  "TC-E: says what stays here — this browser's own projects and settings, back as soon as the sign-out is done";

const escape = (s) => s.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

/** Matches exactly these test titles, as the verbose reporter prints them. */
const only = (...titles) => new RegExp(`> (?:${titles.map(escape).join("|")})$`);

const REFETCH_SUCCESS_CHECK = "        if (getCloudSyncDriver() !== driver) return;\n        const projects = rawProjects.map(";
const REFETCH_FAILURE_CHECK =
  "        // WI-113: a failure from an ended session must not mark the NEXT session's data loaded.\n        if (getCloudSyncDriver() !== driver) return;\n";
const RELOAD_IF = "    if (followedUidRef.current !== null && uid === null) {\n";
const RELOAD = `${RELOAD_IF}      useProjectStore.getState().loadProjects();\n      usePreferencesStore.getState().loadPreferences();\n    }\n`;
const RELOAD_COMMENT_END =
  "    // the session's preference sync (WI-117), and it has stopped listening before this effect runs.\n";
const END_SYNC_AND_GUARD = '      endCloudSyncForSignOut();\n      if (getActiveStorageNamespace() === "local") return;\n';
const PICK_REFUSAL = "        setImportState(showError(CLOUD_PROJECT_IMPORT_WAIT_NOTE, CLOUD_PROJECT_IMPORT_PICK_AGAIN));";

export const testFile = "src/";
export const mutations = [
  // -- the count -------------------------------------------------------------------------------------------
  {
    id: "S1  WRONG DESIGN: the newest load decides — a re-fetch's answer marks the data loaded while the first load still runs  [expect 4: L_REFETCH_ENDED, G_REFETCH_FIRST, G_REFETCH_EMPTY, G_IMPORT]",
    file: SYNC,
    find: "          addProjectListener(project.id);\n        }\n        refetchEnded();\n      })",
    replace:
      "          addProjectListener(project.id);\n        }\n        loads.running = 0;\n        useProjectStore.getState().setCloudDataLoaded(true);\n      })",
    expectFailing: only(L_REFETCH_ENDED, G_REFETCH_FIRST, G_REFETCH_EMPTY, G_IMPORT),
  },
  {
    id: "S2  WRONG DESIGN: one count shared by every session — a load left running when a session ends holds up the next  [expect 3: R_NEXT_SESSION, G_LATE_SETTINGS, G_LATE_FAILURE]",
    file: SYNC,
    find: "      const loads: CloudLoads = { running: 1 };\n      loadsRef.current = loads;",
    replace: "      sharedLoads.running += 1;\n      const loads: CloudLoads = sharedLoads;\n      loadsRef.current = loads;",
    also: {
      find: "interface CloudLoads {\n  running: number;\n}\n",
      replace: "interface CloudLoads {\n  running: number;\n}\nconst sharedLoads: CloudLoads = { running: 0 };\n",
    },
    expectFailing: only(R_NEXT_SESSION, G_LATE_SETTINGS, G_LATE_FAILURE),
  },
  {
    id: "S3  a re-fetch that fails is not counted down, so the loading never ends  [expect 1: L_REFETCH_FAILS]",
    file: SYNC,
    find:
      '        console.error("spert:models-changed re-fetch failed:", err);\n        // Defensive flip-to-true so the UI doesn\'t wedge on the disabled state\n        // — once no other load is still running (WI-113).\n        refetchEnded();\n',
    replace: '        console.error("spert:models-changed re-fetch failed:", err);\n',
    expectFailing: only(L_REFETCH_FAILS),
  },
  // -- a re-fetch answer from a session that has ended --------------------------------------------------------
  {
    id: "S4  the success callback does not check the session  [expect 3: R_SIGN_OUT, R_LOCAL, R_ANSWERS_LATE]",
    file: SYNC,
    find: REFETCH_SUCCESS_CHECK,
    replace: "        const projects = rawProjects.map(",
    expectFailing: only(R_SIGN_OUT, R_LOCAL, R_ANSWERS_LATE),
  },
  {
    id: "S5  WRONG DESIGN: the check in the success callback only — a late FAILURE still marks the next session's data loaded  [expect 1: R_FAILS_LATE]",
    file: SYNC,
    find: REFETCH_FAILURE_CHECK,
    replace: "",
    expectFailing: only(R_FAILS_LATE),
  },
  {
    id: "S6  WRONG DESIGN: the check keyed on the storage mode, not the session's handle — a new sign-in to cloud storage passes it  [expect 2: R_FAILS_LATE, R_ANSWERS_LATE]",
    file: SYNC,
    find: REFETCH_SUCCESS_CHECK,
    replace:
      "        if (!useProjectStore.getState().cloudSyncActive) return;\n        const projects = rawProjects.map(",
    also: {
      find: REFETCH_FAILURE_CHECK,
      replace:
        "        // WI-113: a failure from an ended session must not mark the NEXT session's data loaded.\n        if (!useProjectStore.getState().cloudSyncActive) return;\n",
    },
    expectFailing: only(R_FAILS_LATE, R_ANSWERS_LATE),
  },
  // -- the list after a sign-out -----------------------------------------------------------------------------
  {
    id: "S7  WRONG DESIGN: the re-load without the handle check — a late answer replaces the list it brought back  [expect 4: R_SIGN_OUT, R_LOCAL, R_FAILS_LATE, R_ANSWERS_LATE]",
    file: SYNC,
    find: REFETCH_SUCCESS_CHECK,
    replace: "        const projects = rawProjects.map(",
    also: { find: REFETCH_FAILURE_CHECK, replace: "" },
    expectFailing: only(R_SIGN_OUT, R_LOCAL, R_FAILS_LATE, R_ANSWERS_LATE),
  },
  {
    id: "S8  WRONG DESIGN: no re-load at the sign-out — the Dashboard's own load on mount is left to bring the list back  [expect 8: O_DASHBOARD, O_SETTINGS, O_LOCAL, PREF_DASHBOARD, PREF_SETTINGS, R_SIGN_OUT, R_SIGN_OUT_EMPTY, W_ORDINARY]",
    file: STORAGE,
    find: RELOAD,
    replace: "",
    expectFailing: only(O_DASHBOARD, O_SETTINGS, O_LOCAL, PREF_DASHBOARD, PREF_SETTINGS, R_SIGN_OUT, R_SIGN_OUT_EMPTY, W_ORDINARY),
  },
  {
    id: "S9  WRONG DESIGN: the list and settings re-loaded while the storage is still the user's, as an effect inside the cloud sync would  [expect 8: O_DASHBOARD, O_SETTINGS, O_LOCAL, PREF_DASHBOARD, PREF_SETTINGS, R_SIGN_OUT, R_SIGN_OUT_EMPTY, W_ORDINARY]",
    file: STORAGE,
    find: '    setStorageNamespace(uid ?? "local");\n',
    replace: `${RELOAD}    setStorageNamespace(uid ?? "local");\n`,
    also: { find: `${RELOAD_COMMENT_END}${RELOAD}`, replace: RELOAD_COMMENT_END },
    expectFailing: only(O_DASHBOARD, O_SETTINGS, O_LOCAL, PREF_DASHBOARD, PREF_SETTINGS, R_SIGN_OUT, R_SIGN_OUT_EMPTY, W_ORDINARY),
  },
  // -- Import Projects -----------------------------------------------------------------------------------------
  {
    id: "S10 WRONG DESIGN: the note's words only — Choose File still greyed on cloudDataLoaded alone  [expect 1: I_CONSTRUCTED]",
    file: SECTION,
    find: "    importWaitsForCloud,\n    applyPreferences,",
    replace: "    cloudDataLoaded,\n    applyPreferences,",
    also: {
      find: "  const cloudPending = importWaitsForCloud;",
      replace: '  const cloudPending = mode === "cloud" && !cloudDataLoaded;',
    },
    expectFailing: only(I_CONSTRUCTED),
  },
  {
    id: "S11 the note keeps its old words  [expect 10: I_REFETCH_FIRST, I_SETTINGS, I_PICKED, I_LATER_REFETCH, I_CONSTRUCTED, G_IMPORT, G_LATE_SETTINGS, G_LATE_FAILURE, S_UNLOADED, H_PICK]",
    file: WORDS,
    find: 'export const CLOUD_PROJECT_IMPORT_WAIT_NOTE = "Projects can’t be imported until loading from cloud storage ends.";',
    replace:
      'export const CLOUD_PROJECT_IMPORT_WAIT_NOTE = "Cloud projects are still loading. The button above will enable when loading is complete.";',
    expectFailing: only(
      I_REFETCH_FIRST,
      I_SETTINGS,
      I_PICKED,
      I_LATER_REFETCH,
      I_CONSTRUCTED,
      G_IMPORT,
      G_LATE_SETTINGS,
      G_LATE_FAILURE,
      S_UNLOADED,
      H_PICK,
    ),
  },
  {
    id: "S12 the file-pick refusal keeps its old words  [expect 3: I_PICKED, G_IMPORT, H_PICK]",
    file: IMPORT,
    find: PICK_REFUSAL,
    replace:
      '        setImportState(showError("Cloud projects are still loading.", "Please wait for sync to complete before importing."));',
    expectFailing: only(I_PICKED, G_IMPORT, H_PICK),
  },
  {
    id: "S13 the file-pick refusal loses its second line  [expect 1: I_PICKED]",
    file: IMPORT,
    find: PICK_REFUSAL,
    replace: "        setImportState(showError(CLOUD_PROJECT_IMPORT_WAIT_NOTE));",
    expectFailing: only(I_PICKED),
  },
  // -- the preferences at a sign-out ---------------------------------------------------------------------------
  {
    id: "S14 the cleanup does not end the cloud sync  [expect 5: P_SIGN_OUT, P_TERMS, P_ENDED, PREF_DASHBOARD, PREF_SETTINGS]",
    file: STORAGE,
    find: END_SYNC_AND_GUARD,
    replace: '      if (getActiveStorageNamespace() === "local") return;\n',
    expectFailing: only(P_SIGN_OUT, P_TERMS, P_ENDED, PREF_DASHBOARD, PREF_SETTINGS),
  },
  {
    id: "S15 WRONG DESIGN: the cloud sync ended after the preferences are reset  [expect 5: P_SIGN_OUT, P_TERMS, P_ENDED, PREF_DASHBOARD, PREF_SETTINGS]",
    file: STORAGE,
    find: END_SYNC_AND_GUARD,
    replace: '      if (getActiveStorageNamespace() === "local") return;\n',
    also: {
      find: "      usePreferencesStore.getState().clearInMemory();\n    });",
      replace: "      usePreferencesStore.getState().clearInMemory();\n      endCloudSyncForSignOut();\n    });",
    },
    expectFailing: only(P_SIGN_OUT, P_TERMS, P_ENDED, PREF_DASHBOARD, PREF_SETTINGS),
  },
  {
    id: "S16 the preference sync does not check the session's handle  [expect 5: P_SIGN_OUT, P_TERMS, P_ENDED, PREF_DASHBOARD, PREF_SETTINGS]",
    file: SYNC,
    find: "      if (initialLoadDoneRef.current && driver && driver === currentDriver) {",
    replace: "      if (initialLoadDoneRef.current && driver) {",
    expectFailing: only(P_SIGN_OUT, P_TERMS, P_ENDED, PREF_DASHBOARD, PREF_SETTINGS),
  },
  {
    id: "S17 WRONG DESIGN: the preference sync removed — nothing the user changes reaches the cloud  [expect 3: P_CHANGE, P_RESET, P_AGAIN]",
    file: SYNC,
    find: "        driver.savePreferences(state.preferences);",
    replace: "        void state;",
    expectFailing: only(P_CHANGE, P_RESET, P_AGAIN),
  },
  // -- the re-load at the sign-out, the count's ends, and the sign-out window ------------------------------------
  {
    id: "S18 WRONG DESIGN: the re-load only after a session in cloud storage — with local storage chosen, the sign-out leaves the list empty  [expect 1: O_LOCAL]",
    file: STORAGE,
    find: RELOAD_IF,
    replace: '    if (followedUidRef.current !== null && uid === null && persistedMode === "cloud") {\n',
    expectFailing: only(O_LOCAL),
  },
  {
    id: "S19 the re-fetch's empty-answer exit is not counted down, so the loading never ends  [expect 1: L_EMPTY_KEPT]",
    file: SYNC,
    find: "          useProjectStore.getState().setCloudLoadErrors(errors);\n          refetchEnded();\n          return;\n",
    replace: "          useProjectStore.getState().setCloudLoadErrors(errors);\n          return;\n",
    expectFailing: only(L_EMPTY_KEPT),
  },
  {
    id: "S20 WRONG DESIGN: the re-load at every change of user, a sign-in included — the sign-in shows the user's copy in this browser  [expect 2: K_SIGN_IN_DISPLAY, G_DELETE_UNLOADED]",
    file: STORAGE,
    find: RELOAD_IF,
    replace: "    if (followedUidRef.current !== uid) {\n",
    expectFailing: only(K_SIGN_IN_DISPLAY, G_DELETE_UNLOADED),
  },
  {
    id: "S21 a load's end counts it out every time it is called, so a load that reaches two ends is counted out twice  [expect 1: L_ENDED_TWICE]",
    file: SYNC,
    find: "    if (ended) return;\n",
    replace: "",
    expectFailing: only(L_ENDED_TWICE),
  },
  {
    id: "S22 the sign-out brings back the projects only — the settings stay at the defaults  [expect 2: PREF_DASHBOARD, PREF_SETTINGS]",
    file: STORAGE,
    find: "      usePreferencesStore.getState().loadPreferences();\n",
    replace: "",
    expectFailing: only(PREF_DASHBOARD, PREF_SETTINGS),
  },
  {
    id: "S23 the sign-out window does not say what stays here  [expect 1: C_STAYS]",
    file: MODAL,
    find: '            <div>\n              <span className="font-medium text-gray-900 dark:text-gray-100">\n                What stays here:\n              </span>{" "}\n              Any projects and settings this browser keeps for use without\n              signing in. They come back as soon as you have signed out.\n            </div>\n',
    replace: "",
    expectFailing: only(C_STAYS),
  },
];
