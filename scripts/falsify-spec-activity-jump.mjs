// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Falsification spec for the shared jump-to-activity helper (WI-15, v0.71.3).
//
// `scrollToActivity` was extracted from ValidationSummary so the schedule-error banner's new link
// runs the SAME code rather than a second copy. These mutations exist to prove the extraction is
// load-bearing rather than tidy — each one breaks a detail the copy would most plausibly have
// lost, and the banner's own case must go red beside the summary's.
//
// MEASURED in Chrome at v0.71.2, with the grid collapsed: the row IS still in the DOM and
// querySelector finds it, but its rect is 0x0 and scrollIntoView + focus then do nothing at all,
// leaving document.activeElement on <body>. The failure is silent — no throw, no warning.
const JUMP = new URL("../src/ui/helpers/scroll-to-activity.ts", import.meta.url).pathname;

export const testFile = "src/ui/pages/ProjectPage.collapse.test.tsx";
export const mutations = [
  {
    // THE detail. Without flushSync the grid is still display:none when the query runs, so the
    // jump silently does nothing — for BOTH links, which is why both cases must go red.
    id: "J1  the reveal is no longer flushed before the row is looked for",
    file: JUMP,
    find: "  flushSync(revealGrid);",
    replace: "  revealGrid();",
    expectFailing: /expands FIRST|SCHEDULE-ERROR banner jumps too|locked scenario it expands/,
  },
  {
    // The grid is never revealed at all: the pre-v0.71.0 behaviour, which a reimplementation
    // written against an always-expanded grid would reproduce exactly.
    id: "J2  a collapsed grid is never expanded by the jump",
    file: JUMP,
    find: "  flushSync(revealGrid);",
    replace: "  void revealGrid;",
    expectFailing: /expands FIRST|SCHEDULE-ERROR banner jumps too|locked scenario it expands/,
  },
  {
    // Focus is half the affordance: scrolling to a row you cannot type in is not a jump.
    id: "J3  the row is scrolled to but never focused",
    file: JUMP,
    find: "    el.focus();",
    replace: "    void el;",
    expectFailing: /expands FIRST|SCHEDULE-ERROR banner jumps too|scrolls and focuses exactly as before/,
  },
];
