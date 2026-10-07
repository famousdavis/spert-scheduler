// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Falsification spec for the darkened band names (WI-100).
//
// On a white chart — the Gantt in light mode, the light render a copy is taken from, and the
// printed Gantt — a band's NAME is its colour scaled toward black just far enough to read 4.5:1,
// by `readableOnWhite`; its rule keeps the colour, dark mode is unchanged, and a band with no
// colour keeps the muted fallback. Each link is broken once below. Every mutation names exactly
// the tests it must fail, and no others: "K failing; named-match K" is the result to look for,
// not merely a non-zero exit — the runner prints ✔ as soon as ANY named test fails. Every
// mutation runs the WHOLE suite ("src/"), so one that also broke a test elsewhere shows as K
// above its named-match.
const UTILS = new URL("../src/ui/charts/gantt-utils.ts", import.meta.url).pathname;
const CHART = new URL("../src/ui/charts/GanttChart.tsx", import.meta.url).pathname;
const PRINT = new URL("../src/ui/charts/PrintGanttChart.tsx", import.meta.url).pathname;

/** The eight per-preset helper tests, as the verbose reporter prints them (`it.each` quotes `$name`). */
const BECOMES = [
  ["Slate", "#6c7786"],
  ["Sage", "#5d7d6b"],
  ["Sky", "#4a7c95"],
  ["Lavender", "#7a7292"],
  ["Rose", "#986b6b"],
  ["Amber", "#8a734a"],
  ["Teal", "#4b7f7b"],
  ["Clay", "#8c7160"],
].map(([name, readable]) => `'${name}' becomes '${readable}', which reads at least 4.5:1 on white`);
const UNCHANGED = "a colour that already reads 4.5:1 on white comes back unchanged, byte for byte";
const ONE_STEP = "a colour just under the line moves exactly one step: #3c7cac becomes #3c7bab";
const UPPER = "an upper-case colour darkens as its lower-case form does";
const LIGHT =
  "the Gantt in light mode: each band NAME is darkened, each rule keeps the band colour, no colour keeps the fallback";
const DARK = "the Gantt in dark mode: name and rule both keep the band colour, no colour keeps the fallback";
const COPY = "the light render a copy takes in dark mode: each band NAME is darkened, each rule keeps the band colour";
const PRINTED =
  "the printed Gantt: each band NAME is darkened, each rule keeps the band colour, no colour keeps the fallback";

/** Every test that reads the helper's output for a pale colour. */
const DARKENED = [...BECOMES, ONE_STEP, UPPER, LIGHT, COPY, PRINTED];

const escape = (s) => s.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

/** Matches exactly these test titles, as the verbose reporter prints them. */
const only = (...titles) => new RegExp(`> (?:${titles.map(escape).join("|")})$`);

const SCREEN_FILL = "fill={isDark ? bandColor : readableOnWhite(bandColor)}";
const PRINT_FILL = "fill={readableOnWhite(bandColor)}";
const FALLBACK = "const bandColor = item.band.color ?? c.textMuted;";

export const testFile = "src/";
export const mutations = [
  {
    id: "N1  the helper returns its input  [expect 13: the eight, one step, upper case, light, copy, print]",
    file: UTILS,
    find: "export function readableOnWhite(hex: string): string {\n",
    replace: "export function readableOnWhite(hex: string): string {\n  return hex;\n",
    expectFailing: only(...DARKENED),
  },
  {
    id: "N2  the Gantt draws the original colour in light mode  [expect 2: light, copy]",
    file: CHART,
    find: SCREEN_FILL,
    replace: "fill={bandColor}",
    expectFailing: only(LIGHT, COPY),
  },
  {
    id: "N3  the Gantt darkens in dark mode too  [expect 1: dark]",
    file: CHART,
    find: SCREEN_FILL,
    replace: "fill={readableOnWhite(bandColor)}",
    expectFailing: only(DARK),
  },
  {
    id: "N4  the Gantt's rule is darkened with its name  [expect 2: light, copy]",
    file: CHART,
    find: "stroke={bandColor}",
    replace: "stroke={isDark ? bandColor : readableOnWhite(bandColor)}",
    expectFailing: only(LIGHT, COPY),
  },
  {
    id: "N5  the printed rule is darkened with its name  [expect 1: print]",
    file: PRINT,
    find: "stroke={bandColor}",
    replace: "stroke={readableOnWhite(bandColor)}",
    expectFailing: only(PRINTED),
  },
  {
    id: "N6  print draws the original colour  [expect 1: print]",
    file: PRINT,
    find: PRINT_FILL,
    replace: "fill={bandColor}",
    expectFailing: only(PRINTED),
  },
  {
    // Keep stepping until the PREVIOUS step reads, so the colour returned is one step past it.
    id: "N7  the search over-darkens by one step  [expect 13: as N1]",
    file: UTILS,
    find: "  } while (contrastOnWhite(darker) < READABLE_CONTRAST);",
    replace: "  } while (contrastOnWhite(towardBlack(rgb, (step - 1) / DARKEN_STEPS)) < READABLE_CONTRAST);",
    expectFailing: only(...DARKENED),
  },
  {
    id: "N8  the search stops one step short  [expect 13: as N1]",
    file: UTILS,
    find: "  return `#${hexByte(darker.r)}",
    replace: "  darker = towardBlack(rgb, (step - 1) / DARKEN_STEPS);\n  return `#${hexByte(darker.r)}",
    expectFailing: only(...DARKENED),
  },
  {
    id: "N9  a band with no colour loses the fallback on the Gantt  [expect 3: light, dark, copy]",
    file: CHART,
    find: FALLBACK,
    replace: "const bandColor = item.band.color ?? c.text;",
    expectFailing: only(LIGHT, DARK, COPY),
  },
  {
    id: "N10 a band with no colour loses the fallback in print  [expect 1: print]",
    file: PRINT,
    find: FALLBACK,
    replace: "const bandColor = item.band.color ?? c.text;",
    expectFailing: only(PRINTED),
  },
  {
    // 3:1 is the large-text and non-text threshold, not the one ruled for these names.
    id: "N11 the threshold is 3:1, not 4.5:1  [expect 13: as N1]",
    file: UTILS,
    find: "const READABLE_CONTRAST = 4.5;",
    replace: "const READABLE_CONTRAST = 3;",
    expectFailing: only(...DARKENED),
  },
  {
    // Luminance straight from the 0–255 value, without the sRGB curve: #6b7280 then reads
    // 2.1:1, so the no-colour fallback is darkened too.
    id: "N12 luminance without the sRGB curve  [expect 14: as N1, and unchanged]",
    file: UTILS,
    find: "  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;",
    replace: "  return s;",
    expectFailing: only(...DARKENED, UNCHANGED),
  },
];
