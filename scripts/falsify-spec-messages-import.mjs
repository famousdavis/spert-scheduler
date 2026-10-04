// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Falsification spec for v0.76.1: Zod's English messages, the import under StrictMode, and two
// import refusals that say what is wrong.
//
// `zod-locale.ts` installs Zod's English messages and `main.tsx` imports it first; the import
// hook sets its mounted flag on mount, so the dev server's StrictMode no longer drops the file;
// and the import refuses an entry that is not an object, and a project whose migration throws,
// with a sentence instead of a thrown error. Each straw below names EXACTLY the tests it must
// fail, and no others — read "K failing; named-match K", not merely a non-zero exit: the runner
// prints ✔ when ANY named test fails. Each expected set is written here before the run, never
// inferred from it.
//
// testFile is all of src/, so one run reaches the locale, the section and the service tests.
const LOCALE = new URL("../src/domain/schemas/zod-locale.ts", import.meta.url).pathname;
const MAIN = new URL("../src/main.tsx", import.meta.url).pathname;
const HOOK = new URL("../src/ui/hooks/use-import-state.ts", import.meta.url).pathname;
const SERVICE = new URL("../src/app/api/export-import-service.ts", import.meta.url).pathname;

// zod-locale.test.ts — "zod-locale".
const Z_LOCALE = "installs the English messages a cleared locale lacks";
const Z_FIRST = "is the first import of main.tsx, so the locale is installed before any message is produced";
// ImportSection.test.tsx — "under React's StrictMode, as the dev server renders it".
const I_STRICT = "a valid export file reaches its preview and imports, with and without StrictMode";
// export-import-service.test.ts — "a malformed project is refused by what is wrong, never thrown".
const V_OBJECT = "refuses an entry that is not an object by its position, and still refuses the whole file";
const V_MIGRATE = "refuses a project whose migration throws, naming it, with the thrown message as the details";
const V_ARRAY = "leaves an array entry to the schema, which refuses it as before";
// export-import-service.test.ts — "validateImport — the validation details name the field".
const D_ROOT = "prints a root-level issue's message alone, and a field's issue with its path";

const escape = (s) => s.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

/** Matches exactly these test titles, as the verbose reporter prints them. */
const only = (...titles) => new RegExp(`> (?:${titles.map(escape).join("|")})$`);

export const testFile = "src/";
export const mutations = [
  {
    // vitest keeps Zod's own locale, so only the test that CLEARS it first can see this.
    id: "S1  the z.config call removed from zod-locale.ts  [expect 1: Z_LOCALE]",
    file: LOCALE,
    find: "z.config(z.locales.en());",
    replace: "void z;",
    expectFailing: only(Z_LOCALE),
  },
  {
    // No test imports main.tsx; the structural test reads it as text.
    id: "S2  the side-effect import removed from main.tsx  [expect 1: Z_FIRST]",
    file: MAIN,
    find: 'import "@domain/schemas/zod-locale";\n',
    replace: "",
    expectFailing: only(Z_FIRST),
  },
  {
    // The ref starts true, so every test rendered without StrictMode still passes.
    id: "S3  the ref no longer set on mount  [expect 1: I_STRICT]",
    file: HOOK,
    find: "    isMountedRef.current = true;\n    return () => {",
    replace: "    return () => {",
    expectFailing: only(I_STRICT),
  },
  {
    // [null] throws reading its name again; [42] reaches the migration and is refused as a
    // project that could not be updated, not as one that is not a project. Either way only
    // V_OBJECT holds these entries.
    id: "S4  the not-an-object check removed  [expect 1: V_OBJECT]",
    file: SERVICE,
    find: "    const notAProject = refuseNonObjectEntry(rawProjects[i], i);\n    if (notAProject) return notAProject;\n",
    replace: "",
    expectFailing: only(V_OBJECT),
  },
  {
    // A healthy older project never throws, so the existing migration tests hold.
    id: "S5  the migration catch rethrowing  [expect 1: V_MIGRATE]",
    file: SERVICE,
    find: "  } catch (err) {\n    return {\n      success: false,\n      error: `Project \"${projectLabel}\" could not be updated",
    replace: "  } catch (err) {\n    throw err;\n    return {\n      success: false,\n      error: `Project \"${projectLabel}\" could not be updated",
    expectFailing: only(V_MIGRATE),
  },
  {
    // D_ROOT's `[[]]` file is refused at the new check, with no details to read.
    id: "S6  the not-an-object check widened to arrays  [expect 2: V_ARRAY, D_ROOT]",
    file: SERVICE,
    find: 'if (typeof entry !== "object" || entry === null) {',
    replace: 'if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {',
    expectFailing: only(V_ARRAY, D_ROOT),
  },
];
