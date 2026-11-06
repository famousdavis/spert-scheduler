// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// WI-164 — falsification spec: the 51st Section. One straw on each of its two guards, the button and
// the store, and one on the line, which a locked scenario does not show.
//
//   node scripts/falsify.mjs scripts/falsify-spec-section-limit.mjs
const p = (rel) => new URL(`../${rel}`, import.meta.url).pathname;
const GRID = p("src/ui/components/UnifiedActivityGrid.tsx");
const STORE = p("src/ui/hooks/use-project-store.ts");
const escape = (s) => s.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
const only = (...titles) => new RegExp(`> (?:${titles.map(escape).join("|")})$`);

export const testFile = "src/";

export const mutations = [
  {
    id: "L1 the button stays on at 50",
    file: GRID,
    find: "const sectionsFull = !isScenarioLocked && bands.length >= SECTION_CAP;",
    replace: "const sectionsFull = !isScenarioLocked && bands.length > SECTION_CAP;",
    expectFailing: only("is off at 50, and the line under it, tied to the button, says why and what to do"),
  },
  {
    id: "L3 a locked scenario shows the line, though Delete one is not open there",
    file: GRID,
    find: "const sectionsFull = !isScenarioLocked && bands.length >= SECTION_CAP;",
    replace: "const sectionsFull = bands.length >= SECTION_CAP;",
    expectFailing: only("is off for the lock, with no line: Delete one is not open to the user there"),
  },
  {
    id: "L2 the store adds the 51st",
    file: STORE,
    find: "    if (sectionsAtCap(get().projects, projectId, scenarioId)) return;\n",
    replace: "",
    expectFailing: only("does not add a 51st, opens no undo frame, and a later edit still saves"),
  },
];
