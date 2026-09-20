// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Falsification spec for the schedule-error banner's generic branch (WI-15, v0.71.3).
//
// The pin at schedule-error-banner.test.ts was UPDATED deliberately in this release — the branch
// stopped quoting the engine and started speaking the validation summary's words — so its
// falsification is re-run here. An updated pin that cannot fail would not have noticed the change
// it was updated for.
//
// W3 is the one that matters most. The banner must not state a rule the summary never states, and
// the only case where those diverge is Uniform 30/9/28: the engine fails it on Min > Max while the
// summary reports Min > Most Likely. A wording checked only against Triangular passes either way.
const BANNER = new URL("../src/ui/helpers/schedule-error-banner.ts", import.meta.url).pathname;

export const testFile = "src/ui/helpers/schedule-error-banner.test.ts";
export const mutations = [
  {
    // The whole point of the release: the row's problem comes from the summary's array, not from
    // a sentence this helper writes for itself.
    id: "W3  the banner writes its own rule instead of reusing the summary's",
    file: BANNER,
    find: '`${thrower.messages.join("; ")}. This activity has Min ',
    replace: '`Min is above Max. This activity has Min ',
    expectFailing: /summary's own words|Min vs Max, which the summary never mentions/,
  },
  {
    // The engine's text reaching the user again is the defect WI-15 exists to close.
    id: "W1  the generic branch goes back to quoting the engine",
    file: BANNER,
    find: '    message:\n',
    replace: '    message: error.message ||\n',
    expectFailing: /never repeats the ENGINE's words|naming that activity and its numbers/,
  },
  {
    // The old advice: named no activity, linked nowhere, and said nothing about consequence.
    id: "W2  the advice reverts to the pre-v0.71.3 sentence",
    file: BANNER,
    find: `    advice: "The schedule cannot be calculated until this activity's estimates are fixed.",`,
    replace: `    advice: "Check the affected activity's estimates and settings.",`,
    expectFailing: /naming that activity and its numbers/,
  },
  {
    // The `#N` must match the grid's own numbering, and must be absent when the grid shows none.
    id: "W4  the link label drops the activity number",
    file: BANNER,
    find: "      label: number == null ? thrower.name : `#${number} ${thrower.name}`,",
    replace: "      label: thrower.name,",
    expectFailing: /naming that activity and its numbers/,
  },
  {
    // The cells round (R40); a banner quoting 8.6 beside a cell reading 9 is its own defect.
    id: "W5  the numbers stop being rounded to match the cells",
    file: BANNER,
    find: "Min ${Math.round(thrower.min)}",
    replace: "Min ${thrower.min}",
    expectFailing: /rounds the numbers/,
  },
];
