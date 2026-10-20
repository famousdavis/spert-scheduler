// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Falsification spec for the comparison's Finish Target row (WI-132, v0.78.3).
//
// Since v0.78.0 each scenario keeps its own Finish Target date, and until v0.78.3 Compare did not show it.
// The comparison model now lists it in a row directly after "End Date (w/buffer)", on screen and on paper:
// each scenario's date through the page's formatter, null (a dash) for a scenario without one, and no "best"
// mark — it is an input, not a result. Each straw below breaks one of those and names the tests that must go red.
//
// Usage: node scripts/falsify.mjs scripts/falsify-spec-compare-target.mjs
const MODEL = new URL("../src/ui/helpers/comparison-model.ts", import.meta.url).pathname;

const ROW = `    {
      // Each scenario's own Finish Target date (WI-132; per scenario since v0.78.0), in the summary
      // card's words. An INPUT, not a result, so it never competes for "best": no \`highlights\`.
      label: "Finish Target",
      values: entries.map((e) => (e.scenario.targetFinishDate ? formatDate(e.scenario.targetFinishDate) : null)),
    },
`;

export const testFile = "src/";
export const mutations = [
  {
    id: "S1  the Finish Target row removed",
    file: MODEL,
    find: ROW,
    replace: "",
    expectFailing: /sits directly after "End Date \(w\/buffer\)"|null for one without a date, and no highlight|the key absent|shows the row right after "End Date \(w\/buffer\)"|prints each scenario's Finish Target date/,
  },
  {
    id: "S2  the Finish Target row moved before \"End Date (w/buffer)\"",
    file: MODEL,
    find: ROW,
    replace: "",
    also: {
      find: '    {\n      label: "End Date (w/buffer)",',
      replace: `${ROW}    {\n      label: "End Date (w/buffer)",`,
    },
    expectFailing: /sits directly after "End Date \(w\/buffer\)"|shows the row right after "End Date \(w\/buffer\)"|prints each scenario's Finish Target date/,
  },
  {
    id: "S3  the Finish Target row given best highlights",
    file: MODEL,
    find: 'label: "Finish Target",',
    replace: 'label: "Finish Target", highlights: entries.map(() => "best" as const),',
    expectFailing: /null for one without a date, and no highlight|shows the row right after "End Date \(w\/buffer\)"|carries no best-highlight in any row|still marks the better of two run scenarios/,
  },
  {
    // An empty string, not null: the renderers' dash is for null, so a blank cell shows nothing at all.
    id: "S4  a missing Finish Target date shown as an empty string, not null",
    file: MODEL,
    find: "formatDate(e.scenario.targetFinishDate) : null)",
    replace: 'formatDate(e.scenario.targetFinishDate) : "")',
    expectFailing: /null for one without a date, and no highlight|the key absent|shows the row right after "End Date \(w\/buffer\)"|prints each scenario's Finish Target date/,
  },
];
