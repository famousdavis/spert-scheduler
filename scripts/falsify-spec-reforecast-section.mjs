// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// WI-165 — falsification spec: a reforecast copy keeps each Section above what it groups. One rule,
// one straw: the copy goes back to reading a dropped anchor as "at the end".
//
//   node scripts/falsify.mjs scripts/falsify-spec-reforecast-section.mjs
const p = (rel) => new URL(`../${rel}`, import.meta.url).pathname;
const SERVICE = p("src/app/api/project-service.ts");
const escape = (s) => s.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
const only = (...titles) => new RegExp(`> (?:${titles.map(escape).join("|")})$`);

export const testFile = "src/";

export const mutations = [
  {
    id: "R1 a Section whose first activity was dropped falls to the bottom",
    file: SERVICE,
    find: "const clonedBands: ActivityBand[] = bandsLeft.map((band) => ({",
    replace: "const clonedBands: ActivityBand[] = (scenario.bands ?? []).map((band) => ({",
    expectFailing: only(
      "a Section whose first activity was dropped starts at the next one left",
      "a Section with every activity dropped stays above what followed it, as an empty header",
      "a header at the end stays at the end, and the copy's anchors are its own ids",
      "re-anchors to the next activity left when its anchor was dropped (dropCompleted; WI-165)",
    ),
  },
];
