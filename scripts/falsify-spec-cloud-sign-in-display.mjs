// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Falsification spec for WI-113's cloud sign-in display (owner ruling, 2026-10-16): from the commit that starts a cloud
// session until its first load ends, the project list holds none of this browser's signed-out projects, nor another
// user's — cleared in a layout effect keyed on the session's user, with the pages' own loads (the Dashboard on mount;
// Settings, the Calendar and a project's page when the list is empty) held back meanwhile; a failed cloud load — the
// first one, or the re-fetch after an invitation is claimed — is said on the Dashboard, where "No projects yet." was,
// once no load is pending, until a later re-fetch of the session answers or the session ends, and only for the running
// session; a change of user with no sign-out between is the first user's sign-out, then the second user's sign-in,
// without ending the second user's session; an account WITH settings in cloud storage takes, for what they lack, this
// browser's copy of that account's settings (read by key when the session starts), else Scheduler's default — never
// this browser's signed-out settings — while an account with none keeps the settings in use, as before; a project's
// page whose project is not in the list shows the Dashboard's loading line while a cloud load is pending, says the load
// failed after a failed load with none pending, and, signed out, gives advice that holds for any project (owner ruling,
// 2026-10-17); a switch to local storage while signed in loads the list again from this browser, unless an answer of
// the session filled it and it still holds projects; and a switch to cloud storage while signed in empties the list for
// the first load, as a sign-in does.
//
// Each straw breaks ONE guarantee. The WRONG DESIGNS are the tempting ones: the clear keyed on the storage mode, not
// the user; the clear in a passive effect; no clear at all (the display before this change); the user's own copy in
// this browser shown during the load; the failure flag set by a load from a session that has ended; "No projects yet."
// still shown under the failure line; the failure line beside the loading line; the first load's end clearing a
// re-fetch's failure, though that load began before the invitation was claimed; the change of user clearing the
// projects but not the settings, or run as a sign-out that ends the new session; the settings copy read from the
// storage active when the session starts; the copy applied over the cloud's settings; the project page's loading words
// keyed on the storage mode alone, or its own line about the project in place of the Dashboard's; the page's failure
// state ahead of its loading state; the first load's data-loss guard removed as dead code, now that the list is empty
// when that load begins; the clear keyed on the user alone, which misses a switch to cloud storage; and, for the list at
// a switch to local storage, the load left out, run at a sign-out too, run only once the first load has ended, run at
// every switch, run only when the list is empty, keyed on the failure flag, or run by the pages' own loads keyed on the
// storage mode. Each straw names EXACTLY the tests it must fail, and no others — read "K failing; named-match K", not
// merely a non-zero exit: the runner prints ✔ when ANY named test fails. Each expected set was written before the run
// that first included it; two — S16's and S21's — were then corrected by name from that run, each with its reason
// beside it. Eight of the first twenty-nine — S3's, S8's, S10's, S12's, S14's, S23's, S24's and S26's — were later
// extended by name with the tests of the project page's states and of the switches of storage while signed in (owner
// ruling, 2026-10-17), from a run of those tests' file with each straw applied, each with its reason beside it.
//
// NOT HERE, on purpose: the words themselves — every test that reads them names them in full, so a changed word fails a
// whole group.
//
// testFile is all of src/, so every straw runs against the whole suite.
const SYNC = new URL("../src/ui/hooks/use-cloud-sync.ts", import.meta.url).pathname;
const STORAGE = new URL("../src/ui/providers/StorageProvider.tsx", import.meta.url).pathname;
const DASHBOARD = new URL("../src/ui/pages/ProjectsPage.tsx", import.meta.url).pathname;
const SETTINGS = new URL("../src/ui/pages/SettingsPage.tsx", import.meta.url).pathname;
const CALENDAR = new URL("../src/ui/pages/CalendarPage.tsx", import.meta.url).pathname;
const PROJECT = new URL("../src/ui/pages/ProjectPage.tsx", import.meta.url).pathname;

// ProjectsPage.cloud-sign-in-display.test.tsx — the list while a cloud sign-in's first load runs
const D_RELOAD =
  "a reload with a remembered sign-in: once the sign-in is recognised, the Dashboard says the projects are loading, with none of this browser's signed-out projects, until the cloud's arrive";
const D_NONE =
  "when the cloud lists no projects, the Dashboard says 'No projects yet.' — the signed-out projects are not kept on show, and stay in this browser";
const D_FRESH = "a sign-in from the signed-out state: the signed-out projects leave the Dashboard as the sign-in is recognised";
const D_AGAIN =
  "a sign-in again in the same tab after a sign-out: the signed-out projects brought back by the sign-out leave the Dashboard during the next first load";
const D_EFFECT = "a passive effect that runs as the sign-in is recognised already finds the list empty";
const D_EFFECT_CHANGE =
  "a passive effect that runs as a different user is recognised, with no sign-out between, already finds the list empty";
const D_SETTINGS =
  "Settings, opened while the first load runs, offers none of this browser's projects for export, nor the user's copy here";
const D_CALENDAR =
  "the Calendar, opened while the first load runs, does not load the user's copy in this browser into the list";
const D_DASHBOARD =
  "the Dashboard, opened again while the first load runs, does not load the user's copy in this browser into the list";
const D_PAGE =
  "a project's page open as the sign-in is recognised does not load the user's copy in this browser into the list, and says the projects are loading";
// … a failed load
const F_FIRST = "a failed first load: the Dashboard says so, and not 'No projects yet.'";
const F_FIRST_LOCAL =
  "a failed first load with this browser's signed-out projects: the Dashboard says so, and shows none of them";
const F_REFETCH_AFTER =
  "a failed invitation re-fetch, after the first load ended with projects: the Dashboard says so above them";
const F_REFETCH_BEFORE =
  "a failed invitation re-fetch before the first load ends: the Dashboard says the projects are loading until that load ends, then that loading failed — the first load began before the invitation was claimed";
const F_THEN_REFETCH =
  "a failed first load, then an invitation re-fetch that answers: the line goes, and the re-fetch's list is on show";
const F_SIGN_OUT =
  "the line goes when the session ends: after a sign-out the Dashboard shows this browser's signed-out projects, without it";
const F_CHANGE =
  "a different user signed in after a failed load, with no sign-out between: the second user's Dashboard does not say a load failed";
const F_ENDED =
  "a re-fetch from a session that has ended fails without the line: the next session's Dashboard does not say a load failed";
// … the two data-loss guards
const G_FIRST_EMPTY =
  "control: when the invitation re-fetch answers first, an empty answer from the first load keeps the invited project on show, as before";
const E_EMPTY =
  "after the first load listed the user's projects, an empty re-fetch answer keeps them on show and ends its part: Choose File comes back";
// … a project's page
const P_RELOAD =
  "a reload of a cloud project's page with a remembered sign-in: it says the projects are loading — before the sign-in is recognised, and until the first load brings it";
const P_REFETCH =
  "while an invitation re-fetch runs after the first load, the page of a project not yet listed says the projects are loading, until the re-fetch brings it";
const P_C_CLOUD = "control: signed in to cloud storage, everything loaded, a project not in the list keeps today's two lines";
const P_C_LOCAL = "control: signed in with local storage chosen, a project not in the list keeps today's two lines";
const N_LOCAL_PAGE =
  "the page of one of this browser's signed-out projects, open as a cloud sign-in is recognised: the Dashboard's loading line while the load runs — not a line about that project — then today's two lines";
const N_CHANGE_PAGE =
  "the first user's project page at a change of user: the Dashboard's loading line while the second user's load runs";
const N_FAILED_PAGE =
  "a reload of a cloud project's page, the first load failing: the page says the load failed, in place of both lines — not that the project may have been deleted";
const N_FAILED_PENDING =
  "a failed first load while the invitation re-fetch still runs: the page says the projects are loading, not that a load failed, until the re-fetch answers — and then, the line gone, today's two lines";
const N_SIGNED_OUT_RELOAD =
  "a reload of a cloud project's page with cloud storage chosen and no one signed in: the Dashboard's loading line until that is known, then the signed-out advice";
// … a switch of storage while signed in
const M_DURING =
  "a switch to local storage while the first load runs lists this browser's copy of the user's projects — not 'No projects yet.' — the ended load's late answer does not replace it, and nothing is sent";
const M_FAILED = "a switch to local storage after a failed first load lists this browser's copy of the user's projects";
const M_MADE =
  "a switch to local storage after a failed first load and a project made since lists the whole of this browser's copy, not only the new project";
const M_PAGE =
  "a switch to local storage from a project's page while the first load runs shows the project, from this browser's copy";
const M_C_LOADED =
  "control: a switch to local storage after the first load leaves the list as it was — a run's samples, held only in memory, are kept";
const M_C_REFETCH =
  "control: a switch to local storage after the invitation re-fetch answered, the first load still running, leaves the list as the re-fetch filled it";
const M_C_REFETCH_FAILED =
  "control: a switch to local storage after a failed invitation re-fetch, the first load having filled the list, leaves it as it was — a run's samples kept";
const M_C_SIGN_OUT =
  "control: a sign-out loads the list once, from this browser's signed-out storage — the switch's load does not run";
const L_SWITCH =
  "signed in with local storage chosen and this browser's projects on show, a switch to cloud storage empties the list until the first load ends";
const L_SWITCH_EMPTY =
  "the same switch, the cloud listing no projects: this browser's projects are not kept on show in cloud storage";
// StorageProvider.change-of-user.test.tsx
const U_SETTINGS =
  "the first user's settings are never saved to the second user's account: its next change carries its own cloud settings, and Scheduler's default for what they lack";
const U_NONE =
  "a second account with no settings in cloud storage starts from this browser's signed-out settings, as a sign-in after a sign-out does — not from the first user's";
const U_WHOLE =
  "control: the second user's session is whole — its own handle, a setting it changes saved by it, a project it creates uploaded by it";
const U_STORAGE = "the first user's projects and settings leave this browser at the change; this browser's signed-out ones stay";
const U_LOCAL = "with local storage chosen, the Dashboard then shows this browser's signed-out projects, not the first user's";
// use-cloud-sync.account-settings.test.tsx
const A_RELOAD =
  "a reload: a setting the account's cloud settings lack comes from this browser's copy of the account's settings, not from the signed-out settings, and is saved so at the next change";
const A_NO_COPY =
  "a reload with no copy of the account's settings in this browser: a setting the cloud lacks takes Scheduler's default, not the signed-out settings";
const A_FIRST =
  "a first sign-in in this browser: a setting the account's cloud settings lack takes Scheduler's default, not the signed-out settings";
const A_AGAIN =
  "a sign-in again in the same tab after a sign-out: a setting the cloud lacks takes Scheduler's default — the sign-out removed this browser's copy — not the signed-out settings";
const A_C_CLOUD_WINS = "control: a setting the account's cloud settings hold wins over this browser's copy, as before";
const A_C_RETAINED =
  "control: a setting the cloud holds in a form this version cannot read is written back as it was, not replaced from this browser's copy";
// ProjectsPage.invitation-refetch.test.tsx and ProjectsPage.cloud-loading.test.tsx
const K_DISPLAY =
  "while a cloud sign-in's first load runs, the project list holds none of this browser's signed-out projects, nor the user's copy in this browser, and the Dashboard says the projects are loading";
const L_REFETCH_FAILS =
  "a re-fetch that fails ends its part: with the first load ended empty, the Dashboard then says the load failed, not that there are no projects";
const C_FAILED = "a cloud load that FAILS ends the loading message rather than leaving it up";
// StorageProvider.sign-out-cleanup.test.tsx
const PREF_DASHBOARD =
  "signed out on the Dashboard, the settings in use are this browser's signed-out ones; one changed then with the header's theme button keeps the others, and nothing is sent to the cloud";
const PREF_SETTINGS =
  "signed out on Settings, with no signed-out projects in this browser, the settings in use are this browser's signed-out ones; one changed then with the header's theme button keeps the others, and nothing is sent to the cloud";

const escape = (s) => s.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

/** Matches exactly these test titles, as the verbose reporter prints them. */
const only = (...titles) => new RegExp(`> (?:${titles.map(escape).join("|")})$`);

const SESSION_UID = "  const sessionUid = isCloudActive && user ? user.uid : null;\n";
const CLEAR = "    if (sessionUid !== null) useProjectStore.getState().clearAllData();\n";
const CLEAR_EFFECT = `  useLayoutEffect(() => {\n${CLEAR}  }, [sessionUid]);\n`;
const HELD_BACK = "    if (projects.length === 0 && !isCloudCreateBlocked()) {\n";
const START_RESET =
  "      // WI-113: no load of this session has failed yet.\n      useProjectStore.getState().setCloudLoadFailed(false);\n";
const END_RESET =
  "      // WI-113: the session's end ends what its failed loads said.\n      useProjectStore.getState().setCloudLoadFailed(false);\n";
const REFETCH_FAILURE_CHECK =
  "        // WI-113: a failure from an ended session must not mark the NEXT session's data loaded.\n        if (getCloudSyncDriver() !== driver) return;\n";
const REFETCH_FAILED =
  "        // WI-113: the Dashboard says the load failed (owner ruling, 2026-10-16).\n        useProjectStore.getState().setCloudLoadFailed(true);\n      });\n";
const REFETCH_ANSWERED = "it began before any claim.)\n        useProjectStore.getState().setCloudLoadFailed(false);\n";
const FIRST_ENDED = "          // WI-113: loaded only if no re-fetch is still running.\n          firstLoadEnded();\n";
const CHANGE_CLEAR = '      clearSignedInUserData();\n      setStorageNamespace("local");\n';
const CHANGE_SETTINGS = '      setStorageNamespace("local");\n      usePreferencesStore.getState().loadPreferences();\n';
const CHANGE_PROJECTS =
  '      if (persistedMode !== "cloud" || !isFirebaseAvailable) useProjectStore.getState().loadProjects();\n';
const COPY_READ = "      const accountCopy = readStoredPreferences(uid);\n";
const SETTINGS_IMPORT =
  'import { readStoredPreferences, getRetainedPreferences } from "@infrastructure/persistence/preferences-repository";\n';
const PAGE_LOADING = '  const cloudLoadPending = !storageReady || (mode === "cloud" && !cloudDataLoaded);\n';
const PAGE_WORDS =
  '        {user ? "It may have been deleted or is no longer shared with you." : PROJECT_SIGNED_OUT_LINE}\n';
const PAGE_FAILED_STATE =
  '  if (cloudLoadFailed) {\n    return (\n      <p role="alert" className="text-lg font-medium text-gray-900 dark:text-gray-100">\n        {PROJECT_LOAD_FAILED_LINE}\n      </p>\n    );\n  }\n';
const PAGE_LOADING_STATE =
  '  if (cloudLoadPending) {\n    return (\n      <p role="status" className="text-lg font-medium text-gray-900 dark:text-gray-100">\n        {CLOUD_LOADING_LINE}\n      </p>\n    );\n  }\n';
const RELOAD_CALL = "      if (loadAgain) useProjectStore.getState().loadProjects();\n";
const RELOAD_USER = "        endedUid === user?.uid &&\n";
const RELOAD_GATE = "        (!listAnsweredRef.current || useProjectStore.getState().projects.length === 0);\n";
const ANSWERED_FIRST = "          listAnsweredRef.current = true;\n          // LAST store write for error state on this path";
const ANSWERED_REFETCH = "        useProjectStore.getState().setCloudLoadFailed(false);\n        listAnsweredRef.current = true;\n";

export const testFile = "src/";
export const mutations = [
  // -- the list during the first load ----------------------------------------------------------------------
  {
    id: "S1  WRONG DESIGN: the clear keyed on the storage mode, not the user — a change of user leaves the first user's list for a passive effect to find  [expect 1: D_EFFECT_CHANGE]",
    file: SYNC,
    find: SESSION_UID,
    replace: '  const sessionUid = isCloudActive ? "cloud" : null;\n',
    expectFailing: only(D_EFFECT_CHANGE),
  },
  {
    id: "S2  WRONG DESIGN: the clear in a passive effect — a passive effect of the commit that starts the session finds the old list  [expect 2: D_EFFECT, D_EFFECT_CHANGE]",
    file: SYNC,
    find: CLEAR_EFFECT,
    replace: `  useEffect(() => {\n${CLEAR}  }, [sessionUid]);\n`,
    expectFailing: only(D_EFFECT, D_EFFECT_CHANGE),
  },
  {
    // Extended by name with tests added later (owner ruling, 2026-10-17): with no clear, a signed-out project's page keeps
    // showing it at a sign-in, the loading line the switch tests read first is not shown, and a switch to cloud
    // storage keeps this browser's projects on show.
    id: "S3  WRONG DESIGN: no clear — the display before this change, with the pages' loads still held back  [expect 14: D_RELOAD, D_NONE, D_FRESH, D_AGAIN, D_EFFECT, D_EFFECT_CHANGE, D_SETTINGS, D_PAGE, F_FIRST_LOCAL, K_DISPLAY, N_LOCAL_PAGE, M_DURING, L_SWITCH, L_SWITCH_EMPTY]",
    file: SYNC,
    find: CLEAR,
    replace: "",
        expectFailing: only(
      D_RELOAD, D_NONE, D_FRESH, D_AGAIN, D_EFFECT, D_EFFECT_CHANGE, D_SETTINGS, D_PAGE, F_FIRST_LOCAL, K_DISPLAY, N_LOCAL_PAGE, M_DURING, L_SWITCH, L_SWITCH_EMPTY,
    ),
  },
  {
    id: "S4  the Dashboard's load on mount not held back while the first load runs  [expect 1: D_DASHBOARD]",
    file: DASHBOARD,
    find: "    if (isCloudCreateBlocked()) return;\n    loadProjects();\n",
    replace: "    loadProjects();\n",
    expectFailing: only(D_DASHBOARD),
  },
  {
    id: "S5  Settings' load when the list is empty not held back  [expect 1: D_SETTINGS]",
    file: SETTINGS,
    find: HELD_BACK,
    replace: "    if (projects.length === 0) {\n",
    expectFailing: only(D_SETTINGS),
  },
  {
    id: "S6  the Calendar's load when the list is empty not held back  [expect 1: D_CALENDAR]",
    file: CALENDAR,
    find: HELD_BACK,
    replace: "    if (projects.length === 0) {\n",
    expectFailing: only(D_CALENDAR),
  },
  {
    id: "S7  a project page's load when the list is empty not held back  [expect 1: D_PAGE]",
    file: PROJECT,
    find: HELD_BACK,
    replace: "    if (projects.length === 0) {\n",
    expectFailing: only(D_PAGE),
  },
  {
    // Extended by name with tests added later (owner ruling, 2026-10-17): the copy shown during the load replaces the
    // loading line two of them read before the switch, and the new project the third reads after a failed load.
    id: "S8  WRONG DESIGN: the user's own copy in this browser shown during the load  [expect 8: D_SETTINGS, D_CALENDAR, D_DASHBOARD, D_PAGE, K_DISPLAY, M_DURING, M_MADE, M_PAGE]",
    file: STORAGE,
    find: '    setStorageNamespace(uid ?? "local");\n',
    replace:
      '    setStorageNamespace(uid ?? "local");\n    if (uid !== null && uid !== followed && persistedMode === "cloud") useProjectStore.getState().loadProjects();\n',
        expectFailing: only(D_SETTINGS, D_CALENDAR, D_DASHBOARD, D_PAGE, K_DISPLAY, M_DURING, M_MADE, M_PAGE),
  },
  // -- a failed load ----------------------------------------------------------------------------------------
  {
    id: "S9  the failure flag not reset when a session starts — after a change of user the second user is told a load failed  [expect 1: F_CHANGE]",
    file: SYNC,
    find: START_RESET,
    replace: "",
    expectFailing: only(F_CHANGE),
  },
  {
    // Extended by name with a test added later (owner ruling, 2026-10-17): after a switch to local storage the line stays.
    id: "S10 the failure flag not reset when the session ends — the line stays after a sign-out  [expect 2: F_SIGN_OUT, M_FAILED]",
    file: SYNC,
    find: END_RESET,
    replace: "",
        expectFailing: only(F_SIGN_OUT, M_FAILED),
  },
  {
    id: "S11 WRONG DESIGN: the failure flag set by a re-fetch from a session that has ended  [expect 1: F_ENDED]",
    file: SYNC,
    find: REFETCH_FAILURE_CHECK,
    replace: `        useProjectStore.getState().setCloudLoadFailed(true);\n${REFETCH_FAILURE_CHECK}`,
    expectFailing: only(F_ENDED),
  },
  {
    // Extended by name with a test added later (owner ruling, 2026-10-17): it reads the line after a failed re-fetch first.
    id: "S12 the failure line for the first load only — a failed re-fetch says nothing  [expect 4: F_REFETCH_AFTER, F_REFETCH_BEFORE, L_REFETCH_FAILS, M_C_REFETCH_FAILED]",
    file: SYNC,
    find: REFETCH_FAILED,
    replace: "      });\n",
        expectFailing: only(F_REFETCH_AFTER, F_REFETCH_BEFORE, L_REFETCH_FAILS, M_C_REFETCH_FAILED),
  },
  {
    id: "S13 WRONG DESIGN: 'No projects yet.' still shown under the failure line  [expect 4: F_FIRST, F_FIRST_LOCAL, L_REFETCH_FAILS, C_FAILED]",
    file: DASHBOARD,
    find: "        if (projects.length === 0 && cloudLoadFailed) return null;\n",
    replace: "",
    expectFailing: only(F_FIRST, F_FIRST_LOCAL, L_REFETCH_FAILS, C_FAILED),
  },
  {
    id: "S13b WRONG DESIGN: the failure line beside the loading line, while a load still runs  [expect 1: F_REFETCH_BEFORE]",
    file: DASHBOARD,
    find: "      {cloudLoadFailed && !cloudLoadPending && (\n",
    replace: "      {cloudLoadFailed && (\n",
    expectFailing: only(F_REFETCH_BEFORE),
  },
  {
    // Extended by name with a test added later (owner ruling, 2026-10-17): the page keeps saying the load failed.
    id: "S14 the line not cleared by a later re-fetch that answers  [expect 2: F_THEN_REFETCH, N_FAILED_PENDING]",
    file: SYNC,
    find: REFETCH_ANSWERED,
    replace: "it began before any claim.)\n",
        expectFailing: only(F_THEN_REFETCH, N_FAILED_PENDING),
  },
  {
    id: "S15 WRONG DESIGN: the first load's end clears a re-fetch's failure, though that load began before the invitation was claimed  [expect 1: F_REFETCH_BEFORE]",
    file: SYNC,
    find: FIRST_ENDED,
    replace: `${FIRST_ENDED}          useProjectStore.getState().setCloudLoadFailed(false);\n`,
    expectFailing: only(F_REFETCH_BEFORE),
  },
  // -- a change of user -------------------------------------------------------------------------------------
  {
    // Corrected after its first run, which read 3, not 4: U_SETTINGS holds, because the second account there HAS
    // settings in cloud storage, and their merge replaces every setting in use, whatever the change left. Only an
    // account with none (U_NONE) keeps the settings in use, and so shows the first user's.
    id: "S16 WRONG DESIGN: a change of user clears the projects but not the settings, nor the first user's copy in this browser  [expect 3: U_NONE, U_STORAGE, U_LOCAL]",
    file: STORAGE,
    find: `      clearSignedInUserData();\n${CHANGE_SETTINGS}`,
    replace: "      useProjectStore.getState().clearAllData();\n",
    expectFailing: only(U_NONE, U_STORAGE, U_LOCAL),
  },
  {
    id: "S17 WRONG DESIGN: the change of user run as the sign-out cleanup, after the second session started — it lets go of that session's handle  [expect 2: U_SETTINGS, U_WHOLE]",
    file: STORAGE,
    find: CHANGE_CLEAR,
    replace: `      getCloudSyncDriver()?.cancelPendingSaves();\n      endCloudSyncForSignOut();\n${CHANGE_CLEAR}`,
    expectFailing: only(U_SETTINGS, U_WHOLE),
  },
  {
    id: "S18 the change of user does not bring back this browser's signed-out settings  [expect 1: U_NONE]",
    file: STORAGE,
    find: CHANGE_SETTINGS,
    replace: '      setStorageNamespace("local");\n',
    expectFailing: only(U_NONE),
  },
  {
    id: "S19 the change of user does not bring back this browser's signed-out projects in local storage  [expect 1: U_LOCAL]",
    file: STORAGE,
    find: CHANGE_PROJECTS,
    replace: "",
    expectFailing: only(U_LOCAL),
  },
  // -- the account's settings -------------------------------------------------------------------------------
  {
    id: "S20 WRONG DESIGN: the account's copy read from the storage active when the session starts — this browser's signed-out settings at a sign-in, the first user's at a change of user  [expect 5: A_RELOAD, A_NO_COPY, A_FIRST, A_AGAIN, U_SETTINGS]",
    file: SYNC,
    find: COPY_READ,
    replace: "      const accountCopy = readStoredPreferences(getActiveStorageNamespace());\n",
    also: {
      find: SETTINGS_IMPORT,
      replace: `${SETTINGS_IMPORT}import { getActiveStorageNamespace } from "@infrastructure/persistence/local-storage-repository";\n`,
    },
    expectFailing: only(A_RELOAD, A_NO_COPY, A_FIRST, A_AGAIN, U_SETTINGS),
  },
  {
    // Corrected after its first run, which read 10, not 8: A_FIRST fails too, because a spread leaves a setting that no
    // source holds at its signed-out value instead of dropping it; and U_NONE, at its first check — the first account's
    // own setting in cloud storage is lost before the change of user.
    id: "S21 WRONG DESIGN: the copy or the default applied over the account's cloud settings  [expect 10: A_RELOAD, A_NO_COPY, A_FIRST, A_AGAIN, A_C_CLOUD_WINS, A_C_RETAINED, U_SETTINGS, U_NONE, PREF_DASHBOARD, PREF_SETTINGS]",
    file: SYNC,
    find: "  return { ...(update as Partial<UserPreferences>), ...cloud };\n",
    replace: "  return { ...cloud, ...(lacking as Partial<UserPreferences>) };\n",
    expectFailing: only(
      A_RELOAD, A_NO_COPY, A_FIRST, A_AGAIN, A_C_CLOUD_WINS, A_C_RETAINED, U_SETTINGS, U_NONE, PREF_DASHBOARD, PREF_SETTINGS,
    ),
  },
  {
    id: "S22 a setting the cloud holds in a form this version cannot read replaced from the copy, and its value lost  [expect 1: A_C_RETAINED]",
    file: SYNC,
    find: "    if (key in cloud || key in retained) continue;\n",
    replace: "    if (key in cloud) continue;\n",
    expectFailing: only(A_C_RETAINED),
  },
  // -- a project's page -------------------------------------------------------------------------------------
  {
    // Extended by name with a test added later (owner ruling, 2026-10-17): before the auth state is known, no one signed in.
    id: "S23 the page's loading words only once the sign-in is recognised — before that it says the project is no longer available  [expect 2: P_RELOAD, N_SIGNED_OUT_RELOAD]",
    file: PROJECT,
    find: PAGE_LOADING,
    replace: '  const cloudLoadPending = mode === "cloud" && !cloudDataLoaded;\n',
        expectFailing: only(P_RELOAD, N_SIGNED_OUT_RELOAD),
  },
  {
    // Extended by name with tests added later (owner ruling, 2026-10-17): loading for good hides today's two lines
    // after a load, and the failure line after a failed one.
    id: "S24 WRONG DESIGN: the page's loading words keyed on the storage mode alone — loading for good in cloud storage  [expect 4: P_C_CLOUD, N_LOCAL_PAGE, N_FAILED_PAGE, N_FAILED_PENDING]",
    file: PROJECT,
    find: PAGE_LOADING,
    replace: '  const cloudLoadPending = !storageReady || mode === "cloud";\n',
        expectFailing: only(P_C_CLOUD, N_LOCAL_PAGE, N_FAILED_PAGE, N_FAILED_PENDING),
  },
  {
    id: "S25 the signed-out words keyed on the storage mode, not on who is signed in  [expect 1: P_C_LOCAL]",
    file: PROJECT,
    find: PAGE_WORDS,
    replace:
      '        {mode === "cloud" ? "It may have been deleted or is no longer shared with you." : PROJECT_SIGNED_OUT_LINE}\n',
    expectFailing: only(P_C_LOCAL),
  },
  {
    // Extended by name with tests added later (owner ruling, 2026-10-17): signed in, after a load, they expect today's lines.
    id: "S26 the signed-out words in every state  [expect 4: P_C_CLOUD, P_C_LOCAL, N_LOCAL_PAGE, N_FAILED_PENDING]",
    file: PROJECT,
    find: PAGE_WORDS,
    replace: "        {PROJECT_SIGNED_OUT_LINE}\n",
        expectFailing: only(P_C_CLOUD, P_C_LOCAL, N_LOCAL_PAGE, N_FAILED_PENDING),
  },
  // -- the two data-loss guards -----------------------------------------------------------------------------
  {
    id: "S27 WRONG DESIGN: the first load's data-loss guard removed as dead code — an empty first answer drops the invited project an earlier re-fetch answer brought  [expect 1: G_FIRST_EMPTY]",
    file: SYNC,
    find: "          if (projects.length === 0 && localProjects.length > 0) {\n            console.warn(\n              `Cloud returned 0 projects",
    replace: "          if (false) {\n            console.warn(\n              `Cloud returned 0 projects",
    expectFailing: only(G_FIRST_EMPTY),
  },
  {
    id: "S28 the re-fetch's data-loss guard removed — an empty re-fetch answer empties the list the first load filled  [expect 1: E_EMPTY]",
    file: SYNC,
    find: "        if (projects.length === 0 && localProjects.length > 0) {\n          console.warn(\n            `spert:models-changed returned 0 projects",
    replace: "        if (false) {\n          console.warn(\n            `spert:models-changed returned 0 projects",
    expectFailing: only(E_EMPTY),
  },
  // -- added with the project page's four states and the switches of storage while signed in ----------------------
  {
    id: "S29 WRONG DESIGN: the clear keyed on the user alone, held to cloud sync by the store's flag — it misses a switch to cloud storage while signed in  [expect 2: L_SWITCH, L_SWITCH_EMPTY]",
    file: SYNC,
    find: SESSION_UID,
    replace: "  const sessionUid = user ? user.uid : null;\n",
    also: {
      find: CLEAR,
      replace: "    if (sessionUid !== null && useProjectStore.getState().cloudSyncActive) useProjectStore.getState().clearAllData();\n",
    },
    expectFailing: only(L_SWITCH, L_SWITCH_EMPTY),
  },
  {
    id: "S30 the page's failure state left out — after a failed load it says the project may have been deleted  [expect 1: N_FAILED_PAGE]",
    file: PROJECT,
    find: PAGE_FAILED_STATE,
    replace: "",
    expectFailing: only(N_FAILED_PAGE),
  },
  {
    id: "S31 WRONG DESIGN: the page's failure state ahead of its loading state — a failed first load is said while the re-fetch still runs  [expect 1: N_FAILED_PENDING]",
    file: PROJECT,
    find: PAGE_LOADING_STATE + PAGE_FAILED_STATE,
    replace: PAGE_FAILED_STATE + PAGE_LOADING_STATE,
    expectFailing: only(N_FAILED_PENDING),
  },
  {
    // "Keyed on the storage mode alone" is S24's edit; this one is the line itself.
    id: "S32 WRONG DESIGN: the page's own line about the project while loading, in place of the Dashboard's — the previous design  [expect 9: D_PAGE, P_RELOAD, P_REFETCH, N_LOCAL_PAGE, N_CHANGE_PAGE, N_FAILED_PAGE, N_FAILED_PENDING, N_SIGNED_OUT_RELOAD, M_PAGE]",
    file: PROJECT,
    find: "        {CLOUD_LOADING_LINE}\n",
    replace: '        {"Loading this project from cloud storage…"}\n',
    expectFailing: only(
      D_PAGE, P_RELOAD, P_REFETCH, N_LOCAL_PAGE, N_CHANGE_PAGE, N_FAILED_PAGE, N_FAILED_PENDING, N_SIGNED_OUT_RELOAD, M_PAGE,
    ),
  },
  {
    id: "S33 the list not loaded again at a switch to local storage — 'No projects yet.' over this browser's copy  [expect 4: M_DURING, M_FAILED, M_MADE, M_PAGE]",
    file: SYNC,
    find: RELOAD_CALL,
    replace: "",
    expectFailing: only(M_DURING, M_FAILED, M_MADE, M_PAGE),
  },
  {
    id: "S34 WRONG DESIGN: the switch's load run at a sign-out too — keyed on a session's end alone, not on its user still signed in  [expect 1: M_C_SIGN_OUT]",
    file: SYNC,
    find: RELOAD_USER,
    replace: "",
    expectFailing: only(M_C_SIGN_OUT),
  },
  {
    id: "S35 WRONG DESIGN: the switch's load only once the first load has ended, answered or failed — it misses a switch while that load runs  [expect 2: M_DURING, M_PAGE]",
    file: SYNC,
    find: "      const loadAgain =\n        endedUid !== null &&\n",
    replace: "      const loadAgain =\n        useProjectStore.getState().cloudSyncReady &&\n        endedUid !== null &&\n",
    expectFailing: only(M_DURING, M_PAGE),
  },
  {
    id: "S36 WRONG DESIGN: the switch's load at every switch to local storage — it drops what lives only in memory, a run's samples  [expect 3: M_C_LOADED, M_C_REFETCH, M_C_REFETCH_FAILED]",
    file: SYNC,
    find: RELOAD_GATE,
    replace: "        true;\n",
    expectFailing: only(M_C_LOADED, M_C_REFETCH, M_C_REFETCH_FAILED),
  },
  {
    id: "S37 WRONG DESIGN: the switch's load only when the list is empty — after a failed load, a project made since hides the rest of this browser's copy  [expect 1: M_MADE]",
    file: SYNC,
    find: RELOAD_GATE,
    replace: "        useProjectStore.getState().projects.length === 0;\n",
    expectFailing: only(M_MADE),
  },
  {
    id: "S38 WRONG DESIGN: the switch's load keyed on the failure flag — a failed re-fetch after the first load filled the list drops a run's samples  [expect 1: M_C_REFETCH_FAILED]",
    file: SYNC,
    find: RELOAD_GATE,
    replace: "        (useProjectStore.getState().cloudLoadFailed || useProjectStore.getState().projects.length === 0);\n",
    expectFailing: only(M_C_REFETCH_FAILED),
  },
  {
    id: "S39 the re-fetch's answer not counted as filling the list  [expect 1: M_C_REFETCH]",
    file: SYNC,
    find: ANSWERED_REFETCH,
    replace: "        useProjectStore.getState().setCloudLoadFailed(false);\n",
    expectFailing: only(M_C_REFETCH),
  },
  {
    id: "S40 the first load's answer not counted as filling the list  [expect 2: M_C_LOADED, M_C_REFETCH_FAILED]",
    file: SYNC,
    find: ANSWERED_FIRST,
    replace: "          // LAST store write for error state on this path",
    expectFailing: only(M_C_LOADED, M_C_REFETCH_FAILED),
  },
  {
    // One file per straw (the runner applies `also` to the same file), so the switch's own load stays: this is the
    // Dashboard's load keyed on the storage mode, beside it.
    id: "S41 WRONG DESIGN: the Dashboard's own load keyed on the storage mode — it runs at a sign-out too, and drops a run's samples at a switch  [expect 4: M_C_LOADED, M_C_REFETCH, M_C_REFETCH_FAILED, M_C_SIGN_OUT]",
    file: DASHBOARD,
    find: "    if (isCloudCreateBlocked()) return;\n    loadProjects();\n  }, [loadProjects]);\n",
    replace: "    if (isCloudCreateBlocked()) return;\n    loadProjects();\n  }, [loadProjects, mode]);\n",
    expectFailing: only(M_C_LOADED, M_C_REFETCH, M_C_REFETCH_FAILED, M_C_SIGN_OUT),
  },
];
