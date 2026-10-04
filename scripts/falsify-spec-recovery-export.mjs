// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Falsification spec for the recovery card's Export (v0.75.1).
//
// The card's Export wraps a project this app could not load, verbatim, in the export file's
// envelope, so the backup imports once whatever broke it is fixed; stored text that is not a JSON
// object still downloads as it is. The import's validation details name each failing field. And
// the card lists only the projects still not loaded, so its Delete cannot reach a restored one.
// Each straw below names EXACTLY the tests it must fail, and no others — read "K failing;
// named-match K", not merely a non-zero exit: the runner prints ✔ when ANY named test fails. Each
// expected set is written here before the run, never inferred from it.
//
// testFile is all of src/, so one run reaches the service tests and the dashboard tests together.
const PAGE = new URL("../src/ui/pages/ProjectsPage.tsx", import.meta.url).pathname;
const SERVICE = new URL("../src/app/api/export-import-service.ts", import.meta.url).pathname;

// export-import-service.test.ts — "serializeRecoveryExport".
const R_HEALTHY =
  "wraps a healthy project's stored text into a file the import accepts; the text alone is refused";
const R_BROKEN = "names the failing field of a broken project, and imports once the file is fixed by hand";
const R_VERBATIM = "keeps the stored project verbatim, simulation results and samples included";
const R_FIELDS = "carries exactly the export file's envelope fields";
const R_NULL = "returns null for stored text that is not a JSON object, so the card saves it as it is";
const R_NO_VERSION =
  "wraps a project with no schemaVersion as it is, and the import migrates it from version 1";
// export-import-service.test.ts — "validateImport — the validation details name the field".
const D_ROOT = "prints a root-level issue's message alone, and a field's issue with its path";
// ProjectsPage.test.tsx — "the recovery card's Export".
const P_WRAPPED = "downloads an export file whose one project is the stored data, under the same filename";
// ProjectsPage.test.tsx — "a project that is loaded leaves the recovery card".
const G_LOADED = "lists a load error while its project is not loaded, and drops it once the project is";
const G_ARCHIVED = "counts an archived project as loaded";
const G_COUNT = "counts and lists only the projects still not loaded";

const escape = (s) => s.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

/** Matches exactly these test titles, as the verbose reporter prints them. */
const only = (...titles) => new RegExp(`> (?:${titles.map(escape).join("|")})$`);

export const testFile = "src/";
export const mutations = [
  {
    // The "Corrupted data" page test holds: its text was never wrapped.
    id: "S1  the card's Export back to the stored text  [expect 1: P_WRAPPED]",
    file: PAGE,
    find: "downloadFile(serializeRecoveryExport(raw) ?? raw, filename",
    replace: "downloadFile(raw, filename",
    expectFailing: only(P_WRAPPED),
  },
  {
    // Every test that wraps an object fails; R_NULL fails at its `{}` control. The root-issue
    // test and the "Corrupted data" page test never wrap anything, so they hold.
    id: "S2  null for an object  [expect 7: R_HEALTHY, R_BROKEN, R_VERBATIM, R_FIELDS, R_NULL, R_NO_VERSION, P_WRAPPED]",
    file: SERVICE,
    find: "  const envelope = {\n    format",
    replace: "  return null;\n  const envelope = {\n    format",
    expectFailing: only(R_HEALTHY, R_BROKEN, R_VERBATIM, R_FIELDS, R_NULL, R_NO_VERSION, P_WRAPPED),
  },
  {
    id: "S3  an array wrapped  [expect 1: R_NULL]",
    file: SERVICE,
    find: "stored === null || Array.isArray(stored)) return null;",
    replace: "stored === null) return null;",
    expectFailing: only(R_NULL),
  },
  {
    // Only R_VERBATIM's project carries results; the others' projects equal the stored parse
    // with or without the strip. ⚠️ The `?.` is load-bearing: without it the straw itself
    // throws on R_NULL's `{}` control, which has no `scenarios`, and the run read "2 failing;
    // named-match 1" — a defect in the straw, not a second test that pins a strip.
    id: "S4  simulation results stripped  [expect 1: R_VERBATIM]",
    file: SERVICE,
    find: "    projects: [stored],",
    replace:
      "    projects: [{ ...stored, scenarios: stored.scenarios?.map((s) => ({ ...s, simulationResults: undefined })) }],",
    expectFailing: only(R_VERBATIM),
  },
  {
    // D_ROOT fails at its control (a field's issue must start "id: "), not at the root issue.
    id: "S5  the path dropped from the details  [expect 2: R_BROKEN, D_ROOT]",
    file: SERVICE,
    find: 'issue.path.length > 0 ? `${issue.path.join(".")}: ${issue.message}` : issue.message;',
    replace: "issue.message;",
    expectFailing: only(R_BROKEN, D_ROOT),
  },
  {
    id: "S6  a root-level issue printed \": \"-first  [expect 1: D_ROOT]",
    file: SERVICE,
    find: 'issue.path.length > 0 ? `${issue.path.join(".")}: ${issue.message}` : issue.message;',
    replace: '`${issue.path.join(".")}: ${issue.message}`;',
    expectFailing: only(D_ROOT),
  },
  // The card lists only the projects still not loaded: an import saves the restored project
  // under the same id, and the card's Delete removes stored data by id.
  {
    id: "S7  the card lists every load error again  [expect 3: G_LOADED, G_ARCHIVED, G_COUNT]",
    file: PAGE,
    find: "return loadErrors.filter((e) => !loaded.has(e.projectId));",
    replace: "return loadErrors;",
    expectFailing: only(G_LOADED, G_ARCHIVED, G_COUNT),
  },
  {
    // In G_LOADED and G_ARCHIVED the panel is hidden by its condition, so no count is read.
    id: "S8  the heading counts every load error  [expect 1: G_COUNT]",
    file: PAGE,
    find: "{unloadedProjectErrors.length === 1\n                ? \"1 project could not be loaded\"\n                : `${unloadedProjectErrors.length} projects",
    replace: "{loadErrors.length === 1\n                ? \"1 project could not be loaded\"\n                : `${loadErrors.length} projects",
    expectFailing: only(G_COUNT),
  },
  {
    // The panel shows with "0 projects could not be loaded" and no rows. G_COUNT keeps one row,
    // so its panel shows either way.
    id: "S9  the panel shown for any load error  [expect 2: G_LOADED, G_ARCHIVED]",
    file: PAGE,
    find: "{loadError && unloadedProjectErrors.length > 0 && (",
    replace: "{loadError && loadErrors.length > 0 && (",
    expectFailing: only(G_LOADED, G_ARCHIVED),
  },
  {
    // In G_LOADED and G_ARCHIVED the panel is hidden by its condition, so no row is rendered.
    id: "S10  a row for every load error  [expect 1: G_COUNT]",
    file: PAGE,
    find: "{unloadedProjectErrors.map((error) => {",
    replace: "{loadErrors.map((error) => {",
    expectFailing: only(G_COUNT),
  },
  {
    id: "S11  an archived project not counted as loaded  [expect 1: G_ARCHIVED]",
    file: PAGE,
    find: "const loaded = new Set(projects.map((p) => p.id));",
    replace: "const loaded = new Set(activeProjects.map((p) => p.id));",
    expectFailing: only(G_ARCHIVED),
  },
];
