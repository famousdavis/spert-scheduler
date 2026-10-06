// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Falsification spec for the always-light Gantt copy (WI-26).
//
// The fix is a chain. GanttSection opts in with a callback that redraws the chart light — both
// GanttChart's own palette (`forceLight`) and the appearance GanttSection resolves — and returns
// the redraw back. CopyImageButton forwards it. copyChartAsPng calls it immediately before the
// synchronous html2canvas call and finishes the CSS transitions the redraw started; restores in a
// `finally` before the promise is awaited, finishing them again; and takes `dark` off
// html2canvas's copy of the document as the first step of onclone. Each link is broken once
// below. Every mutation names exactly the tests it must fail, and no others: "K failing;
// named-match K" is the result to look for, not merely a non-zero exit — the runner prints ✔ as
// soon as ANY named test fails. Every mutation runs the WHOLE suite ("src/"), so a mutation that
// also broke a test outside the copy would show as K above its named-match (measured: none does).
const HELPER = new URL("../src/ui/helpers/export-chart.ts", import.meta.url).pathname;
const BUTTON = new URL("../src/ui/components/CopyImageButton.tsx", import.meta.url).pathname;
const SECTION = new URL("../src/ui/components/GanttSection.tsx", import.meta.url).pathname;
const CHART = new URL("../src/ui/charts/GanttChart.tsx", import.meta.url).pathname;

const T1 = "dark mode: the chart is light at the instant html2canvas is called, and dark again before its promise settles";
const T2 = "the Gantt's onclone takes dark off the clone document's root, before the colour neutraliser runs";
const T3 = "a copy site that does not opt in forces nothing, and its clone keeps dark";
const T4 = "a synchronous throw from html2canvas still puts the dark chart back";
const T5 = "light mode: the copy leaves the live chart exactly as it was";
const T6 =
  "the copy finishes the colour transitions its light redraw starts, after the redraw and again after the restore, and nothing else";

/** Matches exactly these test titles, as the verbose reporter prints them. */
const only = (...titles) => new RegExp(`> (?:${titles.join("|")})$`);

const REMOVAL = '      if (captureLight) doc.documentElement.classList.remove("dark");\n';
const SECTION_IS_DARK = "const isDark = useIsDarkClass() && !forceLight;";

export const testFile = "src/";
export const mutations = [
  {
    id: "L1  no enter: the palette is never forced  [expect 3: T1, T4, T6]",
    file: SECTION,
    find: "    flushSync(() => setForceLight(true));\n",
    replace: "",
    expectFailing: only(T1, T4, T6),
  },
  {
    // An async helper awaiting html2canvas runs its `finally` only when the promise settles.
    id: "L2  the restore moved after the await  [expect 1: T1]",
    file: HELPER,
    find: "function startRender(",
    replace: "async function startRender(",
    also: {
      find: "    return html2canvas(element, options);",
      replace: "    return await html2canvas(element, options);",
    },
    expectFailing: only(T1),
  },
  {
    id: "L3  the class removal dropped  [expect 1: T2]",
    file: HELPER,
    find: REMOVAL,
    replace: "",
    expectFailing: only(T2),
  },
  {
    id: "L4  the class removal made unconditional  [expect 1: T3]",
    file: HELPER,
    find: REMOVAL,
    replace: '      doc.documentElement.classList.remove("dark");\n',
    expectFailing: only(T3),
  },
  {
    id: "L5  the class removal moved after the neutraliser  [expect 1: T2]",
    file: HELPER,
    find: REMOVAL,
    replace: "",
    also: {
      find: "      neutralizeUnsupportedColors(doc, clonedEl);\n",
      replace: `      neutralizeUnsupportedColors(doc, clonedEl);\n${REMOVAL}`,
    },
    expectFailing: only(T2),
  },
  {
    id: "L6  GanttChart ignores forceLight  [expect 3: T1, T4, T6]",
    file: CHART,
    find: "  const isDark = useIsDarkClass() && !forceLight;",
    replace: "  const isDark = useIsDarkClass();",
    expectFailing: only(T1, T4, T6),
  },
  {
    id: "L7  GanttSection's appearance ignores it  [expect 3: T1, T4, T6]",
    file: SECTION,
    find: SECTION_IS_DARK,
    replace: "const isDark = useIsDarkClass();",
    expectFailing: only(T1, T4, T6),
  },
  {
    id: "L8  no finally: a synchronous throw skips the restore  [expect 1: T4]",
    file: HELPER,
    find: "  try {\n    return html2canvas(element, options);\n  } finally {\n    restore?.();\n  }\n",
    replace: "  const rendering = html2canvas(element, options);\n  restore?.();\n  return rendering;\n",
    expectFailing: only(T4),
  },
  {
    id: "L9  the Gantt does not opt in  [expect 4: T1, T2, T4, T6]",
    file: SECTION,
    find: " captureLight={captureLight}",
    replace: "",
    expectFailing: only(T1, T2, T4, T6),
  },
  {
    id: "L10 CopyImageButton drops the option  [expect 4: T1, T2, T4, T6]",
    file: BUTTON,
    find: "await copyChartAsPng(targetRef.current, { captureFullWidth, captureLight });",
    replace: "await copyChartAsPng(targetRef.current, { captureFullWidth });",
    expectFailing: only(T1, T2, T4, T6),
  },
  {
    // Toggling instead of forcing: right in dark mode, and turns a LIGHT page's copy dark.
    id: "L11 the copy swaps the theme instead of forcing light  [expect 1: T5]",
    file: SECTION,
    find: SECTION_IS_DARK,
    replace: "const isDark = useIsDarkClass() !== forceLight;",
    expectFailing: only(T5),
  },
  {
    id: "L12 the restore dropped  [expect 3: T1, T4, T6]",
    file: HELPER,
    find: "  } finally {\n    restore?.();\n  }\n",
    replace: "  } finally {\n    // restore dropped\n  }\n",
    expectFailing: only(T1, T4, T6),
  },
  {
    id: "L13 no settle before the copy  [expect 1: T6]",
    file: HELPER,
    find: "  const restore = captureLight();\n  settleTransitions(element);\n",
    replace: "  const restore = captureLight();\n",
    expectFailing: only(T6),
  },
  {
    id: "L14 no settle after the restore  [expect 1: T6]",
    file: HELPER,
    find: "    restore();\n    settleTransitions(element);\n",
    replace: "    restore();\n",
    expectFailing: only(T6),
  },
  {
    id: "L15 every animation finished, not only transitions  [expect 1: T6]",
    file: HELPER,
    find: "    if (animation instanceof CSSTransition) animation.finish();",
    replace: "    animation.finish();",
    expectFailing: only(T6),
  },
  {
    // Without `{ subtree: true }` getAnimations answers for the container alone: the arrows'
    // transitions keep running, and a dark copy draws the critical arrows in the dark red.
    id: "L16 the settle searches the container alone, not its subtree  [expect 1: T6]",
    file: HELPER,
    find: "  for (const animation of el.getAnimations({ subtree: true })) {",
    replace: "  for (const animation of el.getAnimations()) {",
    expectFailing: only(T6),
  },
];
