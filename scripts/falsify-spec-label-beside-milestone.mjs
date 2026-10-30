// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Falsification spec for a milestone no longer keeping a label off the Gantt's time axis (WI-107, v0.79.34).
//
// The milestone diamond's top point sat on the tick labels' baseline, so each diamond was a tick obstacle and the
// month beside a milestone was left out. The obstacle is deleted in both charts, the diamond lowered clear of the
// labels (3px on screen, 0.3 × the print tick font in print), and print's dashed line starts at `topMargin`, under the
// diamond at every font size. Each straw undoes one piece. Read "K failing; named-match K", not merely a non-zero
// exit: the runner prints ✔ when ANY named test fails. Each straw was run ALONE first, against the whole suite; its
// expected set is what that run observed.
const LAYOUT = new URL("../src/ui/hooks/use-gantt-layout.ts", import.meta.url).pathname;
const SCREEN = new URL("../src/ui/charts/GanttChart.tsx", import.meta.url).pathname;
const PRINT = new URL("../src/ui/charts/PrintGanttChart.tsx", import.meta.url).pathname;

const escape = (s) => s.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

/** Matches exactly these test titles, as the verbose reporter prints them. */
const only = (...titles) => new RegExp(`> (?:${titles.map(escape).join("|")})$`);

// gantt-label-beside-milestone.test.tsx — both sides of the rule, and the geometry rows.
const APR_DRAWN = (chart) => `${chart}: Apr, two days before the milestone, is drawn`;
const SCREEN_1280 = "interactive 1280 (container 1180), fit OFF";
const SCREEN_853 = "interactive 853 (container 769), fit ON";
const SCREEN_DIAMOND = "interactive: the diamond's top point is 3px below the tick labels' baseline";
const SIZES = [["small", "1.5", "2.5"], ["normal", "1.5", "2.5"], ["large", "1.8", "2.2"], ["xl", "2.1", "1.9"]];
const PRINT_DIAMOND = Object.fromEntries(SIZES.map(([size, top]) =>
  [size, `print, ${size} activity font: the diamond's top point is ${top}px below the tick labels' baseline`]));
const PRINT_LINE = Object.fromEntries(SIZES.map(([size, , line]) =>
  [size, `print, ${size} activity font: the dashed line starts ${line}px below the diamond's top`]));

// gantt-parity-oracle.test.tsx
const ORACLE_INTERACTIVE = "the INTERACTIVE chart matches its committed geometry";
const ORACLE_PRINT = "the PRINT chart matches its committed geometry";
const ORACLE_CROWDED_INTERACTIVE = "the crowded INTERACTIVE chart matches its committed geometry";
const ORACLE_CROWDED_PRINT = "the crowded PRINT chart matches its committed geometry";

// gantt-axis-years.test.tsx — the sweeps before a simulation run whose end year a milestone obstacle took, the
// 240px sweep whose middle year it took, and the named charts whose tick sets it changed.
const ALL_YEARS_BEFORE_RUN = (c) => `${c} — names every year it spans, an end year only a milestone reaches included`;
const NARROWEST = "interactive, container 640, wide name column, fit ON, today inside the span — names every year but the one before today's, under the today line";
const NAMED_PRINT_OCT = "print, start 2026-10-05, today the day before: 2027 is named on a tick";
const NAMED_853_NOV = "853 fit ON, start 2026-11-02, today the day before: 2027 is named on a tick";
const NAMED_1280_SEP = "1280 fit ON, start 2026-09-07, today 2026-10-05: 2026 settles on December, not on the tick beside today";
const NAMED_PRINT_AUG = "print, start 2026-08-17, today 2026-09-14: 2026 is named on a tick the today line leaves clear";
const NAMED_1280_DEC = "1280 fit ON, start 2026-12-07, today the day before: the first tick is the start, Dec '26";

export const testFile = "src/";
export const mutations = [
  {
    id: "S1  the interactive milestone obstacle restored  [expect 11: Apr at both widths, crowded INTERACTIVE oracle, 4 interactive sweeps before a run, the 240px sweep, 3 interactive named charts]",
    file: LAYOUT,
    find: "    return out;\n  }, [finishLabelX, finishHalfWidth, showToday, todayX, targetX]);",
    replace:
      "    for (const mx of milestoneXPositions) out.push({ x: mx, halfWidth: 6 });\n" +
      "    return out;\n  }, [finishLabelX, finishHalfWidth, showToday, todayX, targetX]);",
    expectFailing: only(
      APR_DRAWN(SCREEN_1280), APR_DRAWN(SCREEN_853), ORACLE_CROWDED_INTERACTIVE,
      ALL_YEARS_BEFORE_RUN("interactive 1280 (container 1180), fit OFF"),
      ALL_YEARS_BEFORE_RUN("interactive 1280 (container 1180), fit ON"),
      ALL_YEARS_BEFORE_RUN("interactive 853 (container 769), fit OFF"),
      ALL_YEARS_BEFORE_RUN("interactive 1280, fit ON, today inside the span"),
      NARROWEST, NAMED_853_NOV, NAMED_1280_SEP, NAMED_1280_DEC,
    ),
  },
  {
    id: "S2  the print milestone obstacle restored  [expect 6: Apr in print, crowded PRINT oracle, 2 print sweeps before a run, 2 print named charts]",
    file: PRINT,
    find: "    return out;\n    // eslint-disable-next-line react-hooks/preserve-manual-memoization -- the imported label-width",
    replace:
      "    for (const mx of milestoneXPositions) out.push({ x: mx, halfWidth: PRINT_DIAMOND_SIZE });\n" +
      "    return out;\n    // eslint-disable-next-line react-hooks/preserve-manual-memoization -- the imported label-width",
    expectFailing: only(
      APR_DRAWN("print"), ORACLE_CROWDED_PRINT,
      ALL_YEARS_BEFORE_RUN("print"), ALL_YEARS_BEFORE_RUN("print, today inside the span"),
      NAMED_PRINT_OCT, NAMED_PRINT_AUG,
    ),
  },
  {
    id: "S3  the interactive diamond back on the tick labels' baseline  [expect 3: the interactive geometry row, INTERACTIVE and crowded INTERACTIVE oracle]",
    file: SCREEN,
    find: "diamondCy = topMargin - 2 + MILESTONE_DIAMOND_DROP_PX;",
    replace: "diamondCy = topMargin - 2;",
    expectFailing: only(SCREEN_DIAMOND, ORACLE_INTERACTIVE, ORACLE_CROWDED_INTERACTIVE),
  },
  {
    id: "S4  the interactive diamond lowered 2px, not 3  [expect 3: S3's set]",
    file: SCREEN,
    find: "diamondCy = topMargin - 2 + MILESTONE_DIAMOND_DROP_PX;",
    replace: "diamondCy = topMargin - 2 + 2;",
    expectFailing: only(SCREEN_DIAMOND, ORACLE_INTERACTIVE, ORACLE_CROWDED_INTERACTIVE),
  },
  {
    id: "S5  the print diamond back on the tick labels' baseline  [expect 10: the 8 print geometry rows, PRINT and crowded PRINT oracle]",
    file: PRINT,
    find: "const cy = topMargin + PRINT_DIAMOND_DROP_PER_FONT_PX * fs5;",
    replace: "const cy = topMargin;",
    expectFailing: only(...Object.values(PRINT_DIAMOND), ...Object.values(PRINT_LINE), ORACLE_PRINT, ORACLE_CROWDED_PRINT),
  },
  {
    id: "S6  the print diamond lowered a fixed 1.5px at every font size  [expect 4: the Large and XL diamond and line rows; the oracle prints at Normal, where 1.5 is right]",
    file: PRINT,
    find: "const cy = topMargin + PRINT_DIAMOND_DROP_PER_FONT_PX * fs5;",
    replace: "const cy = topMargin + 1.5;",
    expectFailing: only(PRINT_DIAMOND.large, PRINT_DIAMOND.xl, PRINT_LINE.large, PRINT_LINE.xl),
  },
  {
    id: "S7  the print dashed line back at topMargin - 2  [expect 6: the 4 print line rows (XL: above the tip), PRINT and crowded PRINT oracle]",
    file: PRINT,
    find: "<line x1={x} y1={topMargin} x2={x} y2={topMargin + totalRows * ra.printRowHeight}",
    replace: "<line x1={x} y1={topMargin - 2} x2={x} y2={topMargin + totalRows * ra.printRowHeight}",
    expectFailing: only(...Object.values(PRINT_LINE), ORACLE_PRINT, ORACLE_CROWDED_PRINT),
  },
];
