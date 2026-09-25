// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Falsification spec for the Gantt copy's full-width capture (WI-57, v0.71.6).
//
// The fix is a chain — GanttSection opts in, CopyImageButton forwards the option,
// copyChartAsPng's onclone widens html2canvas's CLONE — and each link is broken once below.
// Every mutation names exactly the tests it must fail, and no others: "K failing;
// named-match K" is the result to look for, not merely a non-zero exit. The filter
// "full-width.test" runs both test files, export-chart.full-width.test.ts (H) and
// GanttSection.full-width.test.tsx (G).
//
// ⚠️ S10 pins the helper's CONTRACT, not a user-visible path. Tailwind's preflight makes
// every element in this app border-box already, so dropping the line changes no copy here;
// it matters for a content-box element, which jsdom's default is.
//
// ⚠️ The parity oracle is NOT a net for this fix. None of these three files is in
// gantt-parity-oracle.test.tsx's module graph — a module-level throw planted in all three
// leaves it green, while the same throw in GanttChart.tsx fails it — so it passing says
// nothing about the copy.
const HELPER = new URL("../src/ui/helpers/export-chart.ts", import.meta.url).pathname;
const BUTTON = new URL("../src/ui/components/CopyImageButton.tsx", import.meta.url).pathname;
const SECTION = new URL("../src/ui/components/GanttSection.tsx", import.meta.url).pathname;

const H1 = "widens an overflowing element to its whole scroll width and stops it clipping";
const H2 = "leaves an element with nothing hidden untouched";
const H3 = "with captureFullWidth expands html2canvas's clone, never the live element";
const H4 = "without captureFullWidth the clone keeps its visible box";
const G1 = "the Gantt's copy captures the chart's whole scroll width";
const G2 = "a copy button that does not opt in keeps the visible box";

/** Matches exactly these test titles, as the verbose reporter prints them. */
const only = (...titles) => new RegExp(`> (?:${titles.join("|")})$`);

const EXPAND_IN_ONCLONE = "      if (captureFullWidth) expandToFullWidth(clonedEl);\n";

export const testFile = "full-width.test";
export const mutations = [
  {
    id: "S1  GanttSection stops opting in  [expect 1: G1]",
    file: SECTION,
    find: 'title="Copy Gantt chart as image" captureFullWidth />',
    replace: 'title="Copy Gantt chart as image" />',
    expectFailing: only(G1),
  },
  {
    id: "S2  CopyImageButton drops the option  [expect 1: G1]",
    file: BUTTON,
    find: "await copyChartAsPng(targetRef.current, { captureFullWidth });",
    replace: "await copyChartAsPng(targetRef.current);",
    expectFailing: only(G1),
  },
  {
    id: "S3  CopyImageButton opts every site in by default  [expect 1: G2]",
    file: BUTTON,
    find: "  captureFullWidth = false,",
    replace: "  captureFullWidth = true,",
    expectFailing: only(G2),
  },
  {
    id: "S4  the helper ignores captureFullWidth  [expect 2: H3, G1]",
    file: HELPER,
    find: EXPAND_IN_ONCLONE,
    replace: "",
    expectFailing: only(H3, G1),
  },
  {
    id: "S5  the helper expands whether asked or not  [expect 2: H4, G2]",
    file: HELPER,
    find: EXPAND_IN_ONCLONE,
    replace: "      expandToFullWidth(clonedEl);\n",
    expectFailing: only(H4, G2),
  },
  {
    // Moving the call out of onclone widens the LIVE container instead — the page itself —
    // and leaves html2canvas's clone clipped exactly as before.
    id: "S6  the helper expands the LIVE element, not the clone  [expect 2: H3, G1]",
    file: HELPER,
    find: EXPAND_IN_ONCLONE,
    replace: "",
    also: {
      find: "  const canvas = await html2canvas(element, {",
      replace: "  if (captureFullWidth) expandToFullWidth(element);\n  const canvas = await html2canvas(element, {",
    },
    expectFailing: only(H3, G1),
  },
  {
    id: "S7  the expansion keeps clipping  [expect 3: H1, H3, G1]",
    file: HELPER,
    find: '  el.style.overflow = "visible";\n',
    replace: "",
    expectFailing: only(H1, H3, G1),
  },
  {
    id: "S8  the expansion adds no width  [expect 3: H1, H3, G1]",
    file: HELPER,
    find: "  el.style.width = `${el.offsetWidth + hidden}px`;",
    replace: "  el.style.width = `${el.offsetWidth}px`;",
    expectFailing: only(H1, H3, G1),
  },
  {
    id: "S9  the expansion drops its nothing-hidden guard  [expect 1: H2]",
    file: HELPER,
    find: "  if (hidden <= 0) return;\n",
    replace: "",
    expectFailing: only(H2),
  },
  {
    id: "S10 the expansion drops border-box  [expect 1: H1]",
    file: HELPER,
    find: '  el.style.boxSizing = "border-box";\n',
    replace: "",
    expectFailing: only(H1),
  },
];
