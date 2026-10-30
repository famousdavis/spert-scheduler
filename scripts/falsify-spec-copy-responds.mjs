// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Falsification spec for a chart copy that responds at once and copies only the chart (WI-143).
//
// A copy showed nothing for over a second: html2canvas copied the whole page inside the click, so
// the spinner could not paint, and the colour fix then restyled that copy once per colour variable.
// The button now lets its busy state paint before the copy, stays focusable while busy and says the
// copy started and finished in a hidden status; the colour fix reads every value before it writes;
// html2canvas copies only the chart and its ancestors, except the comparison's distribution chart,
// whose width comes from the table beside it. Each straw undoes one of those and must fail the tests
// that pin it. Read "K failing; named-match K", not merely a non-zero exit: the runner prints ✔ when
// ANY named test fails. Each straw was run ALONE first, against the whole suite; its expected set is
// what that run observed.
const BUTTON = new URL("../src/ui/components/CopyImageButton.tsx", import.meta.url).pathname;
const COPY = new URL("../src/ui/helpers/export-chart.ts", import.meta.url).pathname;
const COMPARISON = new URL("../src/ui/components/ScenarioComparison.tsx", import.meta.url).pathname;

const escape = (s) => s.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

/** Matches exactly these test titles, as the verbose reporter prints them. */
const only = (...titles) => new RegExp(`> (?:${titles.map(escape).join("|")})$`);

const PAINT_FIRST = "shows the busy state, and lets a frame paint it, before html2canvas starts";
const NO_FRAME = "still copies when no frame comes, as in a hidden tab";
const STATUS = "says the copy started and that it finished, in a status the eye does not see, beside the button";
const STATUS_FAILURE = "leaves a failure to the error toast: the status says nothing";
const READS_FIRST = "in pass 1, on the root's colour variables, and in pass 2, on the chart's own elements";
const CHART_ONLY = "keeps the chart, what is inside it and its ancestors; leaves out the rest of <body>";
const COMPARISON_COPIES =
  "the distribution chart's copy keeps the table that sets its width; the table's copy leaves the chart out";

export const testFile = "src/";
export const mutations = [
  {
    id: "W1  the paint wait removed  [expect 2: the busy state first, and the hidden tab]",
    file: BUTTON,
    find: "    await afterNextPaint();",
    replace: "",
    expectFailing: only(PAINT_FIRST, NO_FRAME),
  },
  {
    id: "W2  the colour fix's reads and writes interleaved again  [expect 1: reads first]",
    file: COPY,
    find: "if (hasUnsupportedColorFunction(val)) rootFixes.push([prop, val.trim()]);",
    replace: "if (hasUnsupportedColorFunction(val)) root.style.setProperty(prop, resolve(val.trim()));",
    also: {
      find: "if (hasUnsupportedColorFunction(val)) fixes.push([el, prop, val]);",
      replace: "if (hasUnsupportedColorFunction(val)) el.style.setProperty(prop, resolve(val));",
    },
    expectFailing: only(READS_FIRST),
  },
  {
    id: "W3  the ignore rule cloning the whole page again  [expect 2: the chart only, and the comparison's two copies]",
    file: COPY,
    find: "(!copyWholePage && liesOutsideChart(el, element))",
    replace: "false",
    expectFailing: only(CHART_ONLY, COMPARISON_COPIES),
  },
  {
    id: "W4  the status removed  [expect 2: the status, and its silence on failure]",
    file: BUTTON,
    find: '      <span role="status" aria-live="polite" className="sr-only" data-capture-skip="">{STATUS_TEXT[status]}</span>',
    replace: "",
    expectFailing: only(STATUS, STATUS_FAILURE),
  },
  {
    id: "W5  the distribution chart copies only itself, losing the table's width  [expect 1: the comparison's two copies]",
    file: COMPARISON,
    find: '              title="Copy distribution comparison as image"\n              copyWholePage',
    replace: '              title="Copy distribution comparison as image"',
    expectFailing: only(COMPARISON_COPIES),
  },
];
