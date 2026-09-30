// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Falsification spec for the scenario-cap page test (WI-88, v0.72.10).
//
// The test's two lookups now search the Add Scenario window instead of the whole page. That made
// it about five times faster; it must not have made it weaker. Each straw below breaks the path
// the test proves — the + button's Add Scenario window reaching handleAddScenario's guard, which
// refuses the fifty-first scenario with a toast — and names EXACTLY the tests it must fail, and no
// others. Read "K failing; named-match K", not merely a non-zero exit.
//
// ⚠️ S1 does NOT leave fifty-one scenarios. The store's own guard (duplicateScenario) refuses a
// clone at the cap too, so with the page's guard gone the test fails on the missing toast and the
// store still holds fifty — measured with a probe before this spec was written. The store's guard
// has its own test (use-project-store.test.ts), which no straw here touches.
//
// Scope is the whole suite (src/).
const PAGE = new URL("../src/ui/pages/ProjectPage.tsx", import.meta.url).pathname;
const DIALOG = new URL("../src/ui/components/NewScenarioDialog.tsx", import.meta.url).pathname;

const CAP_PAGE = "adding past the scenario cap is refused with an explanatory toast";

const escape = (s) => s.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

/** Matches exactly these test titles, as the verbose reporter prints them. */
const only = (...titles) => new RegExp(`> (?:${titles.map(escape).join("|")})$`);

// handleAddScenario's guard. The Clone Scenario handler carries the same toast, so every needle
// here includes a line only handleAddScenario has.
const GUARD =
  "      if (project.scenarios.length >= MAX_SCENARIOS_PER_PROJECT) {\n" +
  "        toast.error(\n" +
  "          `This project already has the maximum of ${MAX_SCENARIOS_PER_PROJECT} scenarios. Remove one to add another.`\n" +
  "        );\n" +
  "        return;\n" +
  "      }\n" +
  "      const newId = duplicateScenario(id, sourceScenarioId, name);";

export const testFile = "src/";
export const mutations = [
  {
    // No guard: the clone is attempted, the store refuses it silently, and no toast is shown.
    id: "S1  the page's cap guard removed  [expect 1: CAP_PAGE]",
    file: PAGE,
    find: GUARD,
    replace: "      const newId = duplicateScenario(id, sourceScenarioId, name);",
    expectFailing: only(CAP_PAGE),
  },
  {
    // The toast no longer names the maximum.
    id: "S2  the toast's words changed  [expect 1: CAP_PAGE]",
    file: PAGE,
    find: GUARD,
    replace: GUARD.replace("already has the maximum of", "has reached its limit of"),
    expectFailing: only(CAP_PAGE),
  },
  {
    // The cap read as "more than fifty": at exactly fifty the page lets the add through, and the
    // store refuses it without a word.
    id: "S3  the cap checked as more than fifty  [expect 1: CAP_PAGE]",
    file: PAGE,
    find: GUARD,
    replace: GUARD.replace(
      "if (project.scenarios.length >= MAX_SCENARIOS_PER_PROJECT) {",
      "if (project.scenarios.length > MAX_SCENARIOS_PER_PROJECT) {"
    ),
    expectFailing: only(CAP_PAGE),
  },
  {
    // The window's Add no longer reaches the page: the test's click must travel the real path.
    id: "S4  the Add Scenario window's submit disconnected  [expect 1: CAP_PAGE]",
    file: DIALOG,
    find: "      onCreate(name.trim(), sourceId);\n",
    replace: "",
    expectFailing: only(CAP_PAGE),
  },
];
