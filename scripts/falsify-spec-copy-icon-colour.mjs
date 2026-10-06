// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Falsification spec for the copy-image buttons that can be seen in both themes (WI-103).
//
// The idle icon and the copying spinner stroke `currentColor`, and nothing above the button sets
// a colour, so before the fix both inherited the page's default black in both themes — invisible
// on the dark header bars. The button now names its colour in each theme, and the success tick
// strokes a green that passes 3:1 on white and on the dark bars. Each part of that is undone once
// below, and each mutation names exactly the test it must fail: "K failing; named-match K" is the
// result to look for — the runner prints ✔ when ANY named test fails, so read K.
//
// The whole suite runs for every mutation ("src/"), so a mutation that also broke an unnamed test
// would show as K above its named-match.
const BUTTON = new URL("../src/ui/components/CopyImageButton.tsx", import.meta.url).pathname;

const T1 = "sets its own icon colour in both themes, and the idle icon strokes that colour";
const T2 = "draws the copying spinner in the button's colour, then the success tick in #059669";

const escape = (s) => s.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

/** Matches exactly these test titles, as the verbose reporter prints them. */
const only = (...titles) => new RegExp(`> (?:${titles.map(escape).join("|")})$`);

const COLOURS = "shrink-0 text-black dark:text-white transition-opacity";

/**
 * The head of one icon's <svg>, up to its stroke. The file has TWO `stroke="currentColor"` — the
 * spinner's and the idle icon's — so each needle starts at the status that draws its icon.
 */
const iconStroke = (status, stroke) =>
  `{status === "${status}" && (\n        <svg\n          width="18"\n          height="18"\n` +
  `          viewBox="0 0 24 24"\n          fill="none"\n          stroke="${stroke}"`;

export const testFile = "src/";
export const mutations = [
  {
    id: "C1  no colour in dark mode: the icon stays black on the dark bars  [expect 1: T1]",
    file: BUTTON,
    find: COLOURS,
    replace: "shrink-0 text-black transition-opacity",
    expectFailing: only(T1),
  },
  {
    id: "C2  no colour in light mode: the button inherits whatever surrounds it  [expect 1: T1]",
    file: BUTTON,
    find: COLOURS,
    replace: "shrink-0 dark:text-white transition-opacity",
    expectFailing: only(T1),
  },
  {
    id: "C3  the success tick back to #10b981, 2.54:1 on white  [expect 1: T2]",
    file: BUTTON,
    find: 'stroke="#059669"',
    replace: 'stroke="#10b981"',
    expectFailing: only(T2),
  },
  {
    id: "C4  the idle icon strokes a fixed black, whatever the button's colour  [expect 1: T1]",
    file: BUTTON,
    find: iconStroke("idle", "currentColor"),
    replace: iconStroke("idle", "#000000"),
    expectFailing: only(T1),
  },
  {
    id: "C5  the copying spinner strokes a fixed black, whatever the button's colour  [expect 1: T2]",
    file: BUTTON,
    find: iconStroke("copying", "currentColor"),
    replace: iconStroke("copying", "#000000"),
    expectFailing: only(T2),
  },
];
