// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Falsification spec for the comparison chart that stays light in both themes (WI-101).
//
// The chart renders only inside the comparison's copied region, which is white in both themes;
// before the fix its own panel, caption and axis ticks followed the theme, so dark mode showed a
// dark chart inside a white frame, on screen and in the copy. Each part of the pin is undone once
// below, and each mutation names exactly the test it must fail: "K failing; named-match K" is the
// result to look for — the runner prints ✔ when ANY named test fails, so read K.
//
// The whole suite runs for every mutation ("src/"), so a mutation that also broke an unnamed test
// would show as K above its named-match.
const CHART = new URL("../src/ui/charts/CDFComparisonChart.tsx", import.meta.url).pathname;

const REGION = "carries no dark: variant anywhere inside the chart region the copy button captures";
const TICKS = "keeps CDFComparisonChart's ticks light in dark mode — it sits in the comparison's white region";

/** Matches exactly these test titles, as the verbose reporter prints them. */
const only = (...titles) => new RegExp(`> (?:${titles.join("|")})$`);

const FOLLOWS_THEME = 'axisTick(document.documentElement.classList.contains("dark"))';

export const testFile = "src/";
export const mutations = [
  {
    id: "W1  the chart's panel follows the theme again  [expect 1: REGION]",
    file: CHART,
    find: '<div className="bg-white p-2">',
    replace: '<div className="bg-white dark:bg-gray-800 p-2">',
    expectFailing: only(REGION),
  },
  {
    id: "W2  the caption follows the theme again  [expect 1: REGION]",
    file: CHART,
    find: '<div className="text-xs text-gray-500 text-center mt-1">',
    replace: '<div className="text-xs text-gray-500 dark:text-gray-400 text-center mt-1">',
    expectFailing: only(REGION),
  },
  {
    id: "W3  the X axis's ticks follow the theme again  [expect 1: TICKS]",
    file: CHART,
    find: "tick={axisTick(false)}\n              tickFormatter",
    replace: `tick={${FOLLOWS_THEME}}\n              tickFormatter`,
    expectFailing: only(TICKS),
  },
  {
    id: "W4  the Y axis's ticks follow the theme again  [expect 1: TICKS]",
    file: CHART,
    find: "tick={axisTick(false)}\n              label=",
    replace: `tick={${FOLLOWS_THEME}}\n              label=`,
    expectFailing: only(TICKS),
  },
];
