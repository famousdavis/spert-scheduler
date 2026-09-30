// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Falsification spec for two surfaces that had no test of their own (WI-47, WI-89, v0.72.11).
//
//   print-activity-table.test.tsx — what the printed Activities table shows in its Distribution,
//     Confidence and Status columns (WI-47).
//   ProjectPage.test.tsx — the Clone Scenario window refusing a clone at the scenario cap with a
//     toast (WI-89).
//
// G1 and G2 are the gaps themselves. Before the two tests existed each was run against the whole
// suite and NOTHING failed; now each must fail exactly the new test. S4 checks the Clone window's
// message is pinned apart from the + path's. Each straw names EXACTLY the tests it must fail, and no
// others. Read "K failing; named-match K", not merely a non-zero exit.
//
// ⚠️ S3 was run BY HAND and is deliberately not here: the shared label "T-Normal"
// renamed to "Gaussian" in format-labels.ts. It failed 14 tests, exactly the 14 named before the run —
// the new print test, format-labels' "formats normal correctly", two flat-activity-parser tests on the
// missing-Confidence message, and ten grid-cell-display tests. This runner could not report it before
// v0.73.1: that run wrote 1,119,386 bytes, and execFileSync's default maxBuffer (1 MiB) counts stdout
// and stderr together, so the output was cut off before vitest's summary and the runner aborted.
// v0.73.1 raised the buffer to 64 MiB; S3 now runs to a verdict, the same 14.
//
// ⚠️ G2 does NOT leave fifty-one scenarios. The store's own guard (duplicateScenario) refuses a
// clone at the cap too, so with the page's guard gone the test fails on the missing toast and the
// store still holds fifty.
//
// Scope is the whole suite (src/).
const PRINT = new URL("../src/ui/components/print-sections.tsx", import.meta.url).pathname;
const PAGE = new URL("../src/ui/pages/ProjectPage.tsx", import.meta.url).pathname;

const PRINT_LABELS =
  "prints each distribution's name, a level only where confidence applies, and the status";
const CLONE_CAP = "cloning past the scenario cap is refused with an explanatory toast";

const escape = (s) => s.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

/** Matches exactly these test titles, as the verbose reporter prints them. */
const only = (...titles) => new RegExp(`> (?:${titles.map(escape).join("|")})$`);

// handleClone's guard. The + path's handler (handleAddScenario) carries the same toast, so every
// needle here includes its first line, which only handleClone has.
const CLONE_GUARD =
  "      if (project && project.scenarios.length >= MAX_SCENARIOS_PER_PROJECT) {\n" +
  "        toast.error(\n" +
  "          `This project already has the maximum of ${MAX_SCENARIOS_PER_PROJECT} scenarios. Remove one to add another.`\n" +
  "        );\n" +
  "        return;\n" +
  "      }\n";

export const testFile = "src/";
export const mutations = [
  {
    // Print's own Confidence rule inverted: a level for Triangular and Uniform, a dash for the
    // other three.
    id: "G1  print's Confidence dash inverted  [expect 1: PRINT_LABELS]",
    file: PRINT,
    find: "{confidenceApplies(activity.distributionType)\n",
    replace: "{!confidenceApplies(activity.distributionType)\n",
    expectFailing: only(PRINT_LABELS),
  },
  {
    // No guard: the clone is attempted, the store refuses it silently, and no toast is shown.
    id: "G2  the Clone window's cap guard removed  [expect 1: CLONE_CAP]",
    file: PAGE,
    find: CLONE_GUARD,
    replace: "",
    expectFailing: only(CLONE_CAP),
  },
  {
    // The Clone window's toast no longer names the maximum. The + path's toast is untouched, so
    // its test stays green.
    id: "S4  the Clone window's toast words changed  [expect 1: CLONE_CAP]",
    file: PAGE,
    find: CLONE_GUARD,
    replace: CLONE_GUARD.replace("already has the maximum of", "has reached its limit of"),
    expectFailing: only(CLONE_CAP),
  },
];
