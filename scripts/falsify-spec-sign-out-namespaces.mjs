// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Falsification spec for WI-118: a sign-out clears only what is on show, and only while it is a signed-in user's —
// never this browser's signed-out storage ("local"), and never the storage of a user the app has not shown, as when a
// remembered sign-in whose terms acceptance on record is out of date is signed out from inside the sign-in — and that
// sign-out says why (owner ruling, 2026-10-10).
//
// Each straw breaks ONE guarantee. S1, S3, S4 and S20 are the tempting wrong designs: skipping the cleanup in that
// sign-out (so the account on show keeps its data), switching the active namespace to the user's around the cleanup
// (which clears the user's own storage and empties the screen), fixing only the words (the cleanup clears whatever is
// active, "local" included, as before), and clearing the user's own storage whenever cloud is the stored choice (that
// choice is browser-wide: an invitation link sets it to cloud while signed out, without moving work saved under Local
// Storage). Each straw names EXACTLY the tests it must fail, and no others — read "K failing; named-match K", not
// merely a non-zero exit: the runner prints ✔ when ANY named test fails. Each expected set was written before the run
// that first included it, never inferred from a run.
//
// NOT HERE, on purpose — one straw that cannot fail any test, run once by hand and measured as a survivor: deleting the
// terms flag's reset in the null callback. The flag is cleared again when a session opens, and that reset is the one a
// test pins.
//
// testFile is all of src/, so every straw runs against the whole suite.
const AUTH = new URL("../src/ui/providers/AuthProvider.tsx", import.meta.url).pathname;
const STORAGE = new URL("../src/ui/providers/StorageProvider.tsx", import.meta.url).pathname;

// AuthProvider.sign-out-namespaces.test.tsx
const N1 = "keeps this browser's signed-out projects and preferences, in storage, in memory and on screen";
const N2 = "keeps the user's own projects and settings in this browser";
const N3 = "says why, and that the projects are safe";
const N4 =
  "with local storage chosen, keeps the work saved in this browser while signed in, and this browser's signed-out projects";
const N5 =
  "a session that ends during the sign-in, before the app follows the user, keeps this browser's signed-out projects and the user's own, and says the session ended";
const N6 =
  "a second account signed out this way, while the first is shown, clears the first account's data, as before, and keeps the second account's and this browser's signed-out projects";
const N7 =
  "when the session has already ended by the time the terms are found out of date, a later session's end says the session ended";
const C2 = "control: an ordinary sign-out clears the user's own data and keeps this browser's signed-out projects";
const C4 =
  "control: a session ended from outside the app clears the user's own data and still says so in the words it used before";
// AuthProvider.test.tsx
const TC2 = "TC-2: silent null transition AFTER a signed-in session fires a persistent toast";
// ProjectsPage.cloud-loading.test.tsx
const EMPTY_AFTER_SIGN_OUT = "signing out after a cloud load: no loading message, and the empty Dashboard says so";

const escape = (s) => s.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

/** Matches exactly these test titles, as the verbose reporter prints them. */
const only = (...titles) => new RegExp(`> (?:${titles.map(escape).join("|")})$`);

const AUTH_IMPORT = 'import { runSignOutCleanup } from "@infrastructure/persistence/sign-out-cleanup-registry";';
const TERMS_CALL = "            termsSignOut = true;\n            await runSignOutCleanup();";
const GUARD = '      if (getActiveStorageNamespace() === "local") return;\n';

export const testFile = "src/";
export const mutations = [
  // -- the wrong designs ---------------------------------------------------------------------------------
  {
    id: "S1  WRONG DESIGN: the terms sign-out skips the cleanup, both its own and the one after it  [expect 1: N6]",
    file: AUTH,
    find: TERMS_CALL,
    replace: "            termsSignOut = true;",
    also: {
      find: "const hadSession = wasSignedIn; // capture before reset — gates cleanup below",
      replace: "const hadSession = wasSignedIn && !termsSignOut; // capture before reset — gates cleanup below",
    },
    expectFailing: only(N6),
  },
  {
    id: "S3  WRONG DESIGN: switch to the user's namespace around the cleanup  [expect 4: N1, N2, N4, N6]",
    file: AUTH,
    find: "            await runSignOutCleanup();\n            await firebaseSignOut(auth!);",
    replace: `            const shown = getActiveStorageNamespace();
            setStorageNamespace(firebaseUser.uid);
            await runSignOutCleanup();
            setStorageNamespace(shown);
            await firebaseSignOut(auth!);`,
    also: {
      find: AUTH_IMPORT,
      replace: `${AUTH_IMPORT}\nimport { getActiveStorageNamespace, setStorageNamespace } from "@infrastructure/persistence/local-storage-repository";`,
    },
    expectFailing: only(N1, N2, N4, N6),
  },
  {
    id: "S4  WRONG DESIGN: only the words fixed — the cleanup clears whatever is active, local included, as before  [expect 3: N1, N4, N5]",
    file: STORAGE,
    find: GUARD,
    replace: "",
    expectFailing: only(N1, N4, N5),
  },
  {
    id: "S20 WRONG DESIGN: the user's own projects cleared when cloud is the stored choice  [expect 2: N2, N6]",
    file: AUTH,
    find: TERMS_CALL,
    replace: `            termsSignOut = true;
            if (localStorage.getItem("spert:storage-mode") === "cloud") new LocalStorageRepository(firebaseUser.uid).clearAll();
            await runSignOutCleanup();`,
    also: {
      find: AUTH_IMPORT,
      replace: `${AUTH_IMPORT}\nimport { LocalStorageRepository } from "@infrastructure/persistence/local-storage-repository";`,
    },
    expectFailing: only(N2, N6),
  },
  // -- the cleanup ---------------------------------------------------------------------------------------------
  {
    id: "S5  memory cleared even when nothing of a signed-in user's is on show  [expect 2: N1, N5]",
    file: STORAGE,
    find: `${GUARD}      useProjectStore.getState().clearAllData();
      new LocalStorageRepository().clearAll();
      clearAllLastScenarios();
      clearAllCollapsedSections();
      clearPreferences();
      usePreferencesStore.getState().clearInMemory();`,
    replace: `      useProjectStore.getState().clearAllData();
      usePreferencesStore.getState().clearInMemory();
${GUARD}      new LocalStorageRepository().clearAll();
      clearAllLastScenarios();
      clearAllCollapsedSections();
      clearPreferences();`,
    expectFailing: only(N1, N5),
  },
  {
    id: "S21 an ordinary sign-out clears the user's storage but not memory — their projects stay on screen  [expect 2: C2, the Dashboard's empty-after-sign-out test]",
    file: STORAGE,
    find: "      useProjectStore.getState().clearAllData();\n",
    replace: "",
    also: { find: "      usePreferencesStore.getState().clearInMemory();\n", replace: "" },
    expectFailing: only(C2, EMPTY_AFTER_SIGN_OUT),
  },
  // -- the words -------------------------------------------------------------------------------------------
  {
    id: "S8  the terms sign-out is not marked, so it says the session ended  [expect 2: N3, N4]",
    file: AUTH,
    find: "            termsSignOut = true;\n",
    replace: "",
    expectFailing: only(N3, N4),
  },
  {
    id: "S9  the terms sign-out says something else  [expect 2: N3, N4]",
    file: AUTH,
    find: '"You were signed out because you haven’t accepted the current Terms of Service and Privacy Policy. Sign in again to review and accept them — your projects are safe."',
    replace: '"You were signed out. Sign in again to accept the Terms of Service and Privacy Policy."',
    expectFailing: only(N3, N4),
  },
  {
    id: "S22 the terms flag is not cleared when a session opens, so a later session's end gets the terms words  [expect 1: N7]",
    file: AUTH,
    find: "        // WI-118: a session opens without the terms flag (see its declaration).\n        termsSignOut = false;\n",
    replace: "",
    expectFailing: only(N7),
  },
  {
    id: "S23 every session that ends before the user is shown gets the terms words  [expect 3: N5, N7, TC-2]",
    file: AUTH,
    find: "toast.info(termsSignOut ? TERMS_SIGN_OUT_MESSAGE : SESSION_ENDED_MESSAGE, 0);",
    replace:
      'toast.info(termsSignOut || getActiveStorageNamespace() === "local" ? TERMS_SIGN_OUT_MESSAGE : SESSION_ENDED_MESSAGE, 0);',
    also: {
      find: AUTH_IMPORT,
      replace: `${AUTH_IMPORT}\nimport { getActiveStorageNamespace } from "@infrastructure/persistence/local-storage-repository";`,
    },
    expectFailing: only(N5, N7, TC2),
  },
  {
    id: "S10 a session ended from outside says something else  [expect 3: N5, N7, C4]",
    file: AUTH,
    find: 'Your projects are safe in cloud storage — sign in again to restore them.";',
    replace: 'Your projects are safe in cloud storage.";',
    expectFailing: only(N5, N7, C4),
  },
];
