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
// condition, and ending the cloud sync after the preferences are reset. Each straw names EXACTLY the tests it must
// fail, and no others — read "K failing; named-match K", not merely a non-zero exit: the runner prints ✔ when ANY named
// test fails. Each expected set was written before the run that first included it, never inferred from a run — except
// four, corrected by name from their first run with WI-113's sign-in display tests (owner ruling, 2026-10-16), each
// with its reason beside it: S2's, S3's, S6's and S7's. Five — S2's, S3's, S8's, S9's and S20's — were then extended by
// name with the tests of the project page's states and of the switches of storage while signed in (owner ruling,
// 2026-10-17), from a run of those tests' file with each straw applied, each with its reason beside it.
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
  "a re-fetch that fails ends its part: with the first load ended empty, the Dashboard then says the load failed, not that there are no projects";
const L_EMPTY_KEPT =
  "an empty re-fetch answer, with the first load still running, ends its part too: when the first load ends, Choose File comes back";
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
// — what a cloud sign-in shows while its first load runs (WI-113, owner ruling, 2026-10-16)
const K_SIGN_IN_DISPLAY =
  "while a cloud sign-in's first load runs, the project list holds none of this browser's signed-out projects, nor the user's copy in this browser, and the Dashboard says the projects are loading";
// ProjectsPage.cloud-sign-in-display.test.tsx
const E_EMPTY =
  "after the first load listed the user's projects, an empty re-fetch answer keeps them on show and ends its part: Choose File comes back";
const D_AGAIN =
  "a sign-in again in the same tab after a sign-out: the signed-out projects brought back by the sign-out leave the Dashboard during the next first load";
const D_SETTINGS =
  "Settings, opened while the first load runs, offers none of this browser's projects for export, nor the user's copy here";
const D_CALENDAR =
  "the Calendar, opened while the first load runs, does not load the user's copy in this browser into the list";
const D_DASHBOARD =
  "the Dashboard, opened again while the first load runs, does not load the user's copy in this browser into the list";
const D_PAGE =
  "a project's page open as the sign-in is recognised does not load the user's copy in this browser into the list, and says the projects are loading";
const D_C_LOCAL =
  "control: signed in with local storage chosen, the Dashboard keeps this browser's signed-out projects, as before";
const F_SIGN_OUT =
  "the line goes when the session ends: after a sign-out the Dashboard shows this browser's signed-out projects, without it";
const F_ENDED =
  "a re-fetch from a session that has ended fails without the line: the next session's Dashboard does not say a load failed";
const F_REFETCH_AFTER =
  "a failed invitation re-fetch, after the first load ended with projects: the Dashboard says so above them";
const F_REFETCH_BEFORE =
  "a failed invitation re-fetch before the first load ends: the Dashboard says the projects are loading until that load ends, then that loading failed — the first load began before the invitation was claimed";
const P_C_CLOUD = "control: signed in to cloud storage, everything loaded, a project not in the list keeps today's two lines";
// StorageProvider.change-of-user.test.tsx
const U_SETTINGS =
  "the first user's settings are never saved to the second user's account: its next change carries its own cloud settings, and Scheduler's default for what they lack";
const U_NONE =
  "a second account with no settings in cloud storage starts from this browser's signed-out settings, as a sign-in after a sign-out does — not from the first user's";
const U_WHOLE =
  "control: the second user's session is whole — its own handle, a setting it changes saved by it, a project it creates uploaded by it";
const U_LOCAL =
  "with local storage chosen, the Dashboard then shows this browser's signed-out projects, not the first user's";
// use-cloud-sync.account-settings.test.tsx
const A_RELOAD =
  "a reload: a setting the account's cloud settings lack comes from this browser's copy of the account's settings, not from the signed-out settings, and is saved so at the next change";
const A_AGAIN =
  "a sign-in again in the same tab after a sign-out: a setting the cloud lacks takes Scheduler's default — the sign-out removed this browser's copy — not the signed-out settings";
const A_C_RETAINED =
  "control: a setting the cloud holds in a form this version cannot read is written back as it was, not replaced from this browser's copy";
const A_C_NONE =
  "control: a first sign-in with nothing in cloud storage keeps the signed-out settings, and saves them to the account at the next change";
const A_C_FAILS =
  "control: a settings read that fails keeps the settings in use, as before";
const A_C_117 =
  "control: nothing is sent to the cloud while the first load runs, nor at its end; a change after it is";
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

// ProjectsPage.cloud-sign-in-display.test.tsx — the project page's states and the switches of storage while signed in
// (owner ruling, 2026-10-17)
const N_LOCAL_PAGE =
  "the page of one of this browser's signed-out projects, open as a cloud sign-in is recognised: the Dashboard's loading line while the load runs — not a line about that project — then today's two lines";
const N_FAILED_PAGE =
  "a reload of a cloud project's page, the first load failing: the page says the load failed, in place of both lines — not that the project may have been deleted";
const N_FAILED_PENDING =
  "a failed first load while the invitation re-fetch still runs: the page says the projects are loading, not that a load failed, until the re-fetch answers — and then, the line gone, today's two lines";
const M_DURING =
  "a switch to local storage while the first load runs lists this browser's copy of the user's projects — not 'No projects yet.' — the ended load's late answer does not replace it, and nothing is sent";
const M_FAILED = "a switch to local storage after a failed first load lists this browser's copy of the user's projects";
const M_MADE =
  "a switch to local storage after a failed first load and a project made since lists the whole of this browser's copy, not only the new project";
const M_PAGE =
  "a switch to local storage from a project's page while the first load runs shows the project, from this browser's copy";
const M_C_REFETCH_FAILED =
  "control: a switch to local storage after a failed invitation re-fetch, the first load having filled the list, leaves it as it was — a run's samples kept";
const M_C_SIGN_OUT =
  "control: a sign-out loads the list once, from this browser's signed-out storage — the switch's load does not run";
const L_SWITCH =
  "signed in with local storage chosen and this browser's projects on show, a switch to cloud storage empties the list until the first load ends";
const L_SWITCH_EMPTY =
  "the same switch, the cloud listing no projects: this browser's projects are not kept on show in cloud storage";
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
    // Extended by name with tests added later (owner ruling, 2026-10-17), through the same earlier test as the first
    // correction: the shared count never reaches zero, so they wait on a load that has ended.
    // Corrected after its first run with WI-113's sign-in display tests, which it also fails (owner ruling,
    // 2026-10-16): the count is module-level here, so it outlives a test. Those tests end any load still running before
    // they unmount, but a session that ENDS with a load running leaves it counted for good — this straw's wrong design
    // itself — and two later tests in that file that need the loading to end then fail: E_EMPTY and P_C_CLOUD.
    id: "S2  WRONG DESIGN: one count shared by every session — a load left running when a session ends holds up the next  [expect 11: R_NEXT_SESSION, G_LATE_SETTINGS, G_LATE_FAILURE, E_EMPTY, P_C_CLOUD, N_LOCAL_PAGE, N_FAILED_PAGE, N_FAILED_PENDING, M_FAILED, M_C_REFETCH_FAILED, L_SWITCH_EMPTY]",
    file: SYNC,
    find: "      const loads: CloudLoads = { running: 1 };\n      loadsRef.current = loads;",
    replace: "      sharedLoads.running += 1;\n      const loads: CloudLoads = sharedLoads;\n      loadsRef.current = loads;",
    also: {
      find: "interface CloudLoads {\n  running: number;\n}\n",
      replace: "interface CloudLoads {\n  running: number;\n}\nconst sharedLoads: CloudLoads = { running: 0 };\n",
    },
        expectFailing: only(
      R_NEXT_SESSION, G_LATE_SETTINGS, G_LATE_FAILURE, E_EMPTY, P_C_CLOUD, N_LOCAL_PAGE, N_FAILED_PAGE, N_FAILED_PENDING, M_FAILED, M_C_REFETCH_FAILED, L_SWITCH_EMPTY,
    ),
  },
  {
    // Extended by name with a test added later (owner ruling, 2026-10-17): it reads the line after a failed re-fetch first.
    // Corrected after its first run: WI-113's failure line is said once no load is pending, so a failed re-fetch
    // never counted down also keeps it from F_REFETCH_AFTER and F_REFETCH_BEFORE (owner ruling, 2026-10-16).
    id: "S3  a re-fetch that fails is not counted down, so the loading never ends  [expect 4: L_REFETCH_FAILS, F_REFETCH_AFTER, F_REFETCH_BEFORE, M_C_REFETCH_FAILED]",
    file: SYNC,
    find:
      '        console.error("spert:models-changed re-fetch failed:", err);\n        // Defensive flip-to-true so the UI doesn\'t wedge on the disabled state\n        // — once no other load is still running (WI-113).\n        refetchEnded();\n',
    replace: '        console.error("spert:models-changed re-fetch failed:", err);\n',
        expectFailing: only(L_REFETCH_FAILS, F_REFETCH_AFTER, F_REFETCH_BEFORE, M_C_REFETCH_FAILED),
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
    id: "S5  WRONG DESIGN: the check in the success callback only — a late FAILURE still marks the next session's data loaded  [expect 2: R_FAILS_LATE, F_ENDED]",
    file: SYNC,
    find: REFETCH_FAILURE_CHECK,
    replace: "",
    expectFailing: only(R_FAILS_LATE, F_ENDED),
  },
  {
    // Corrected after its first run: its failure-path check, keyed on the mode, also lets an ended session's late
    // failure say the load failed in the next session (F_ENDED, WI-113 — owner ruling, 2026-10-16).
    id: "S6  WRONG DESIGN: the check keyed on the storage mode, not the session's handle — a new sign-in to cloud storage passes it  [expect 3: R_FAILS_LATE, R_ANSWERS_LATE, F_ENDED]",
    file: SYNC,
    find: REFETCH_SUCCESS_CHECK,
    replace:
      "        if (!useProjectStore.getState().cloudSyncActive) return;\n        const projects = rawProjects.map(",
    also: {
      find: REFETCH_FAILURE_CHECK,
      replace:
        "        // WI-113: a failure from an ended session must not mark the NEXT session's data loaded.\n        if (!useProjectStore.getState().cloudSyncActive) return;\n",
    },
    expectFailing: only(R_FAILS_LATE, R_ANSWERS_LATE, F_ENDED),
  },
  // -- the list after a sign-out -----------------------------------------------------------------------------
  {
    // Corrected after its first run, as S6: without the failure-path check, F_ENDED fails too.
    id: "S7  WRONG DESIGN: the re-load without the handle check — a late answer replaces the list it brought back  [expect 5: R_SIGN_OUT, R_LOCAL, R_FAILS_LATE, R_ANSWERS_LATE, F_ENDED]",
    file: SYNC,
    find: REFETCH_SUCCESS_CHECK,
    replace: "        const projects = rawProjects.map(",
    also: { find: REFETCH_FAILURE_CHECK, replace: "" },
    expectFailing: only(R_SIGN_OUT, R_LOCAL, R_FAILS_LATE, R_ANSWERS_LATE, F_ENDED),
  },
  {
    // Extended by name with a test added later (owner ruling, 2026-10-17): the sign-out's one load is missing.
    id: "S8  WRONG DESIGN: no re-load at the sign-out — the Dashboard's own load on mount is left to bring the list back  [expect 11: O_DASHBOARD, O_SETTINGS, O_LOCAL, PREF_DASHBOARD, PREF_SETTINGS, R_SIGN_OUT, R_SIGN_OUT_EMPTY, W_ORDINARY, D_AGAIN, F_SIGN_OUT, M_C_SIGN_OUT]",
    file: STORAGE,
    find: RELOAD,
    replace: "",
        expectFailing: only(
      O_DASHBOARD, O_SETTINGS, O_LOCAL, PREF_DASHBOARD, PREF_SETTINGS, R_SIGN_OUT, R_SIGN_OUT_EMPTY, W_ORDINARY, D_AGAIN, F_SIGN_OUT, M_C_SIGN_OUT,
    ),
  },
  {
    // Extended by name with a test added later (owner ruling, 2026-10-17): the sign-out's load reads the user's storage.
    id: "S9  WRONG DESIGN: the list and settings re-loaded while the storage is still the user's, as an effect inside the cloud sync would  [expect 11: O_DASHBOARD, O_SETTINGS, O_LOCAL, PREF_DASHBOARD, PREF_SETTINGS, R_SIGN_OUT, R_SIGN_OUT_EMPTY, W_ORDINARY, D_AGAIN, F_SIGN_OUT, M_C_SIGN_OUT]",
    file: STORAGE,
    find: '    setStorageNamespace(uid ?? "local");\n',
    replace: `${RELOAD}    setStorageNamespace(uid ?? "local");\n`,
    also: { find: `${RELOAD_COMMENT_END}${RELOAD}`, replace: RELOAD_COMMENT_END },
        expectFailing: only(
      O_DASHBOARD, O_SETTINGS, O_LOCAL, PREF_DASHBOARD, PREF_SETTINGS, R_SIGN_OUT, R_SIGN_OUT_EMPTY, W_ORDINARY, D_AGAIN, F_SIGN_OUT, M_C_SIGN_OUT,
    ),
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
      find: "      clearSignedInUserData();\n    });",
      replace: "      clearSignedInUserData();\n      endCloudSyncForSignOut();\n    });",
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
    id: "S17 WRONG DESIGN: the preference sync removed — nothing the user changes reaches the cloud  [expect 10: P_CHANGE, P_RESET, P_AGAIN, U_SETTINGS, U_WHOLE, A_RELOAD, A_AGAIN, A_C_RETAINED, A_C_NONE, A_C_117]",
    file: SYNC,
    find: "        driver.savePreferences(state.preferences);",
    replace: "        void state;",
    expectFailing: only(P_CHANGE, P_RESET, P_AGAIN, U_SETTINGS, U_WHOLE, A_RELOAD, A_AGAIN, A_C_RETAINED, A_C_NONE, A_C_117),
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
    id: "S19 the re-fetch's empty-answer exit is not counted down, so the loading never ends  [expect 1: E_EMPTY]",
    file: SYNC,
    find: "          useProjectStore.getState().setCloudLoadErrors(errors);\n          refetchEnded();\n          return;\n",
    replace: "          useProjectStore.getState().setCloudLoadErrors(errors);\n          return;\n",
    expectFailing: only(E_EMPTY),
  },
  {
    // Extended by name with tests added later (owner ruling, 2026-10-17): the sign-in's load lists the user's copy, which
    // replaces the loading line or the list each of them reads before its switch.
    id: "S20 WRONG DESIGN: the re-load at every change of user, a sign-in included — the sign-in shows the user's copy in this browser  [expect 15: K_SIGN_IN_DISPLAY, D_SETTINGS, D_CALENDAR, D_DASHBOARD, D_PAGE, D_C_LOCAL, A_C_NONE, A_C_FAILS, U_NONE, U_LOCAL, M_DURING, M_MADE, M_PAGE, L_SWITCH, L_SWITCH_EMPTY]",
    file: STORAGE,
    find: RELOAD_IF,
    replace: "    if (followedUidRef.current !== uid) {\n",
        expectFailing: only(
      K_SIGN_IN_DISPLAY, D_SETTINGS, D_CALENDAR, D_DASHBOARD, D_PAGE, D_C_LOCAL, A_C_NONE, A_C_FAILS, U_NONE, U_LOCAL, M_DURING, M_MADE, M_PAGE, L_SWITCH, L_SWITCH_EMPTY,
    ),
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
    find: "      useProjectStore.getState().loadProjects();\n      usePreferencesStore.getState().loadPreferences();\n",
    replace: "      useProjectStore.getState().loadProjects();\n",
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
