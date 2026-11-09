// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// WI-172 — falsification spec: Sections stand out on the Gantt chart (A + D).
//
// Each rule broken ALONE, against the WHOLE suite ("src/"). Each straw names exactly the tests it
// must fail, and its label says how many: "K failing; named-match K" is the result to look for —
// the runner prints ✔ as soon as ANY named test fails, so a count above the named-match means a
// test elsewhere broke too. Run:
//
//   node scripts/falsify.mjs scripts/falsify-spec-section-bands.mjs
//
// ⚠️ Never while a dev server serves this tree: a straw's edit would be served.
//
// ⚠️ WI-173 (v0.86.2) took the Section entry off both legends (owner: Sections are self-explanatory, and
// the entry could wrap the legend onto a second line). B29–B32 broke when the entry showed and its words,
// and had nothing left to break (their needles were gone), so they were retired, as WI-172 retired
// WI-100's straws. B13 no longer fails the legend tests, which no longer read the bar. B42 and B43 put an
// entry back into each legend; B1 and B2 still fail the legend tests, which check each Section's tint
// so that "with Sections drawn" cannot pass with none drawn.
const SECTIONS = new URL("../src/ui/charts/gantt-sections.ts", import.meta.url).pathname;
const CHART = new URL("../src/ui/charts/GanttChart.tsx", import.meta.url).pathname;
const PRINT = new URL("../src/ui/charts/PrintGanttChart.tsx", import.meta.url).pathname;
const LEGEND = new URL("../src/ui/charts/GanttLegend.tsx", import.meta.url).pathname;

const escape = (s) => s.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
/** Matches exactly these "describe > test" titles, as the verbose reporter prints them. */
const only = (...titles) => new RegExp(`> (?:${titles.map(escape).join("|")})$`);
const t = (describe) => (title) => `${describe} > ${title}`;

// gantt-sections.test.ts
const GROUPS = t("sectionGroups: each Section with the rows it covers")(
  "groups each Section's own row with its activities, down to the next Section or the end of the list");
const SPAN = t("sectionSpan: the first start and the last finish of a Section's activities");
const SPAN_EVERY = SPAN("reads every activity, not the first and the last listed");
const SPAN_RECORDED = SPAN("a Section holding a Complete row with recorded dates runs from that row's recorded start");
const SPAN_EMPTY = SPAN("a one-day activity is a span of one day; an empty Section, or one with no schedule, has none");
const EXT = t("solidBarsExtent: where the solid bars start and end, by the chart's own rule");
const EXT_FIRST = EXT("from the first bar's start to the last bar's end");
const EXT_MIN = EXT("ends where a bar drawn at the minimum width ends, past its own finish date");
const REST = t("the rest of what a Section draws");
const UNNAMED = REST("an unnamed Section shows the placeholder, by trim");
const GROUND = REST("the tint's ground is composited at the 8-bit alpha the browser uses (46/255), not 0.18");
const SHAPE = REST("the summary bar is one path: a bar with a point down at each end");
const WORDS = REST("the hover text: name, first start – last finish in the given format, and how many activities");
const LAYERS = REST("sectionLayers: a tint for every Section, a bar for every Section that holds activities");

// gantt-section-bands.test.tsx
const ROW = t("each Section's row: the tint, and the bar once it holds activities (WI-172)");
const ROW_SCREEN = ROW("the Gantt: a tint on every Section's row, under the bar on the same row; no bar on an empty Section");
const ROW_PRINT = ROW("the printed Gantt: a tint on every Section's row, under the bar on the same row; no bar on an empty Section");
const SPANS = t("the bar runs from the group's first solid-bar start to its last solid-bar end (WI-172)");
const SPANS_DET = SPANS("Deterministic");
const SPANS_UNC = SPANS("With Uncertainty");
const SPANS_PRINT = SPANS("the printed Gantt");
const LEG = t("neither legend names Sections, with Sections drawn or with none (WI-173)");
const LEG_SCREEN = LEG("the Gantt");
const LEG_PRINT = LEG("the printed Gantt");
const TIP = t("hovering the bar shows the Section's name, dates and number of activities (WI-172)")(
  "after the hover delay, in the user's Date Format; an unnamed Section by its placeholder");
const HALO = t("every lag label has a halo in the chart's ground (WI-172)");
const HALO_LIGHT = HALO("the Gantt, light");
const HALO_DARK = HALO("the Gantt, dark");
const HALO_PRINT = HALO("the printed Gantt");

// gantt-band-name-contrast.test.tsx (WI-100, re-pinned in WI-172)
const NAMES = t("band names on the Gantt and the printed Gantt (WI-100, re-pinned in WI-172)");
const NAMES_LIGHT = NAMES("the Gantt in light mode: each NAME and bar darkened to 4.5:1 on its row's tint, no colour on the grey tint, no rule");
const NAMES_DARK = NAMES("the Gantt in dark mode: each NAME and bar lightened where it does not already read 4.5:1 on its tint, no rule");
const NAMES_COPY = NAMES("the light render a copy takes in dark mode: the light chart's names, tints and bars");
const NAMES_PRINT = NAMES("the printed Gantt: the light chart's names, tints and bars, no rule");
const NAMES_SCREEN = [NAMES_LIGHT, NAMES_DARK, NAMES_COPY];

// gantt-parity-oracle.test.tsx
const PARITY_SCREEN = [
  t("gantt parity oracle — geometry")("the INTERACTIVE chart matches its committed geometry"),
  t("gantt parity oracle — crowded milestones (name stagger)")("the crowded INTERACTIVE chart matches its committed geometry"),
];
const PARITY_PRINT = [
  t("gantt parity oracle — geometry")("the PRINT chart matches its committed geometry"),
  t("gantt parity oracle — crowded milestones (name stagger)")("the crowded PRINT chart matches its committed geometry"),
];

const SCREEN_TINT = "          {sections.map((s) => (\n            <rect key={`band-tint-";
const PRINT_TINT = "        {sections.map((s) => (\n          <rect key={`band-tint-";
const SCREEN_TINT_BLOCK = `          {/* WI-172: each Section's own row tinted across the name column and the chart, as the grid
              tints it. The first layer: weekend shading, grid lines and every marker line draw over it. */}
          {sections.map((s) => (
            <rect key={\`band-tint-\${s.group.band.id}\`} data-section-tint={s.group.band.id}
              x={0} y={topMargin + s.group.row * ra.rowHeight} width={chartWidth} height={ra.rowHeight} fill={s.tint} />
          ))}
`;
const SCREEN_BAR_COMMENT = "          {/* WI-172: each Section's summary bar on its own row";
const COLOURS = "}, { muted: c.textMuted, ground: c.bg }),";

export const testFile = "src/";
export const mutations = [
  // -- The tint: each Section's own row, across the name column and the chart, first, at 0.18 --------
  {
    id: "B1  the Gantt draws no tint  [expect 9: row, both views, legend, names ×3, parity ×2]",
    file: CHART,
    find: SCREEN_TINT,
    replace: SCREEN_TINT.replace("{sections.map(", "{sections.filter(() => false).map("),
    expectFailing: only(ROW_SCREEN, SPANS_DET, SPANS_UNC, LEG_SCREEN, ...NAMES_SCREEN, ...PARITY_SCREEN),
  },
  {
    id: "B2  the printed Gantt draws no tint  [expect 6: row, span, legend, names, parity ×2]",
    file: PRINT,
    find: PRINT_TINT,
    replace: PRINT_TINT.replace("{sections.map(", "{sections.filter(() => false).map("),
    expectFailing: only(ROW_PRINT, SPANS_PRINT, LEG_PRINT, NAMES_PRINT, ...PARITY_PRINT),
  },
  {
    id: "B3  the tint starts at the chart, not across the name column  [expect 3: row, parity ×2]",
    file: CHART,
    find: "x={0} y={topMargin + s.group.row * ra.rowHeight}",
    replace: "x={ra.leftMargin} y={topMargin + s.group.row * ra.rowHeight}",
    expectFailing: only(ROW_SCREEN, ...PARITY_SCREEN),
  },
  {
    id: "B4  the tint is drawn over the Section names, not first  [expect 3: row, parity ×2]",
    file: CHART,
    find: SCREEN_TINT_BLOCK,
    replace: "",
    also: { find: SCREEN_BAR_COMMENT, replace: SCREEN_TINT_BLOCK + SCREEN_BAR_COMMENT },
    expectFailing: only(ROW_SCREEN, ...PARITY_SCREEN),
  },
  {
    id: "B5  the tint is 0.12, not the grid's 0.18  [expect 5: layers, names ×4]",
    file: SECTIONS,
    find: "export const SECTION_ROW_TINT_ALPHA = 0.18;",
    replace: "export const SECTION_ROW_TINT_ALPHA = 0.12;",
    expectFailing: only(LAYERS, ...NAMES_SCREEN, NAMES_PRINT),
  },
  {
    id: "B6  the ground is composited at 0.18, not at the browser's 8 bits  [expect 4: ground, names light/copy/print]",
    file: SECTIONS,
    find: "compositeOver(rgb, Math.round(alpha * 255) / 255, hexToRgb(ground)!)",
    replace: "compositeOver(rgb, alpha, hexToRgb(ground)!)",
    expectFailing: only(GROUND, NAMES_LIGHT, NAMES_COPY, NAMES_PRINT),
  },
  {
    id: "B7  the Gantt tints a Section with no colour in the text colour  [expect 3: names ×3]",
    file: CHART,
    find: COLOURS,
    replace: "}, { muted: c.text, ground: c.bg }),",
    expectFailing: only(...NAMES_SCREEN),
  },
  {
    id: "B8  the printed Gantt tints a Section with no colour in the text colour  [expect 1: names]",
    file: PRINT,
    find: COLOURS,
    replace: "}, { muted: c.text, ground: c.bg }),",
    expectFailing: only(NAMES_PRINT),
  },
  // -- The faint rule goes ---------------------------------------------------------------------------
  {
    id: "B9  the Gantt's rule comes back  [expect 6: row, names ×3, parity ×2]",
    file: CHART,
    find: "                  {truncated}\n                </text>\n",
    // On the </text> line itself, so no line below moves: legibility-floor pins GanttChart.tsx by line number.
    replace: "                  {truncated}\n                </text><line x1={ra.leftMargin} y1={midY} x2={chartWidth} y2={midY} />\n",
    expectFailing: only(ROW_SCREEN, ...NAMES_SCREEN, ...PARITY_SCREEN),
  },
  {
    id: "B10 the printed rule comes back  [expect 4: row, names, parity ×2]",
    file: PRINT,
    find: "                {truncated}\n              </text>\n",
    replace: "                {truncated}\n              </text>\n              <line x1={ra.printLeftMargin} y1={midY} x2={chartW} y2={midY} />\n",
    expectFailing: only(ROW_PRINT, NAMES_PRINT, ...PARITY_PRINT),
  },
  // -- The summary bar: drawn once a Section holds activities, none on an empty one --------------------
  {
    id: "B11 the Gantt draws no summary bar  [expect 9: row, both views, tooltip, names ×3, parity ×2]",
    file: CHART,
    find: "          {sections.map((s) => s.bar && (",
    replace: "          {sections.map((s) => false && s.bar && (",
    expectFailing: only(ROW_SCREEN, SPANS_DET, SPANS_UNC, TIP, ...NAMES_SCREEN, ...PARITY_SCREEN),
  },
  {
    id: "B12 the printed Gantt draws no summary bar  [expect 5: row, span, names, parity ×2]",
    file: PRINT,
    find: "        {sections.map((s) => s.bar && (",
    replace: "        {sections.map((s) => false && s.bar && (",
    expectFailing: only(ROW_PRINT, SPANS_PRINT, NAMES_PRINT, ...PARITY_PRINT),
  },
  {
    id: "B13 an empty Section gets a bar  [expect 5: span, extent, layers, rows ×2]",
    file: SECTIONS,
    find: "  return start !== undefined && end !== undefined ? { start, end } : null;",
    replace: "  return { start: start ?? \"2026-04-06\", end: end ?? \"2026-04-06\" };",
    also: { find: "  return x1 === Infinity ? null : { x1, x2 };", replace: "  return x1 === Infinity ? { x1: 0, x2: 4 } : { x1, x2 };" },
    expectFailing: only(SPAN_EMPTY, EXT_MIN, LAYERS, ROW_SCREEN, ROW_PRINT),
  },
  // -- Its dates and extent: the first start and the last finish of the SOLID bars ---------------------
  {
    id: "B14 the span starts at the latest start  [expect 4: span ×2, layers, tooltip]",
    file: SECTIONS,
    find: "if (start === undefined || sa.startDate < start) start = sa.startDate;",
    replace: "if (start === undefined || sa.startDate > start) start = sa.startDate;",
    expectFailing: only(SPAN_EVERY, SPAN_RECORDED, LAYERS, TIP),
  },
  {
    id: "B15 the span ends at the earliest finish  [expect 4: span ×2, layers, tooltip]",
    file: SECTIONS,
    find: "if (end === undefined || sa.endDate > end) end = sa.endDate;",
    replace: "if (end === undefined || sa.endDate < end) end = sa.endDate;",
    expectFailing: only(SPAN_EVERY, SPAN_RECORDED, LAYERS, TIP),
  },
  {
    id: "B16 the bar starts at the latest solid-bar start  [expect 9: extent, layers, all three views, parity ×4]",
    file: SECTIONS,
    find: "    x1 = Math.min(x1, barX);",
    replace: "    x1 = x1 === Infinity ? barX : Math.max(x1, barX);",
    expectFailing: only(EXT_FIRST, LAYERS, SPANS_DET, SPANS_UNC, SPANS_PRINT, ...PARITY_SCREEN, ...PARITY_PRINT),
  },
  {
    id: "B17 the bar ends at the last finish date, not where a minimum-width bar ends  [expect 4: extent, all three views]",
    file: SECTIONS,
    find: "    x2 = Math.max(x2, barX + Math.max(minWidth, toX(sa.endDate) - barX));",
    replace: "    x2 = Math.max(x2, toX(sa.endDate));",
    expectFailing: only(EXT_MIN, SPANS_DET, SPANS_UNC, SPANS_PRINT),
  },
  {
    id: "B18 the Gantt's minimum is 2, not its bars' 4  [expect 2: both views]",
    file: CHART,
    find: "minBarWidth: 4,",
    replace: "minBarWidth: 2,",
    expectFailing: only(SPANS_DET, SPANS_UNC),
  },
  {
    id: "B19 the printed minimum is 4, not its bars' 2  [expect 1: print]",
    file: PRINT,
    find: "minBarWidth: 2,",
    replace: "minBarWidth: 4,",
    expectFailing: only(SPANS_PRINT),
  },
  {
    id: "B20 With Uncertainty, the bar runs to the hatched tails  [expect 1: With Uncertainty]",
    file: CHART,
    find: "  const sections = useMemo(() => sectionLayers(renderItems, scheduleMap, {",
    replace: "  const sections = useMemo(() => sectionLayers(renderItems, new Map([...scheduleMap].map(([k, v]) => [k, { ...v, endDate: activityExtendedEndDates.get(k) ?? v.endDate }])), {",
    expectFailing: only(SPANS_UNC),
  },
  {
    id: "B21 the bar is flat, with no point at either end  [expect 6: shape, layers, parity ×4]",
    file: SECTIONS,
    find: "V${top + th + drop} L${x2 - cap},${top + th} H${x1 + cap} L${x1},${top + th + drop} Z",
    replace: "V${top + th} H${x1} Z",
    expectFailing: only(SHAPE, LAYERS, ...PARITY_SCREEN, ...PARITY_PRINT),
  },
  // -- The name, and the bar, in the Section's ink: 4.5:1 against its own tint ----------------------
  {
    id: "B22 the Gantt's bar is drawn in the tint, not the name's colour  [expect 3: names ×3]",
    file: CHART,
    find: "d={s.bar.d} fill={s.ink}",
    replace: "d={s.bar.d} fill={s.tint}",
    expectFailing: only(...NAMES_SCREEN),
  },
  {
    id: "B23 the printed bar is drawn in the tint  [expect 1: names]",
    file: PRINT,
    find: "d={s.bar.d} fill={s.ink}",
    replace: "d={s.bar.d} fill={s.tint}",
    expectFailing: only(NAMES_PRINT),
  },
  {
    id: "B24 the Gantt's names keep the Section's own colour  [expect 3: names ×3]",
    file: CHART,
    find: "fill={sectionInkById.get(item.band.id)}",
    replace: "fill={item.band.color ?? c.textMuted}",
    expectFailing: only(...NAMES_SCREEN),
  },
  {
    id: "B25 the printed names keep the Section's own colour  [expect 1: names]",
    file: PRINT,
    find: "fill={sectionInkById.get(item.band.id)}",
    replace: "fill={item.band.color ?? c.textMuted}",
    expectFailing: only(NAMES_PRINT),
  },
  {
    id: "B26 the ink reads 3:1, not 4.5:1  [expect 4: names ×4]",
    file: SECTIONS,
    find: "const SECTION_TEXT_RATIO = 4.5;",
    replace: "const SECTION_TEXT_RATIO = 3;",
    expectFailing: only(...NAMES_SCREEN, NAMES_PRINT),
  },
  {
    id: "B27 the ink is read against the plain chart, not its tint  [expect 4: names ×4]",
    file: SECTIONS,
    find: "tintGround(color, muted, SECTION_ROW_TINT_ALPHA, ground), SECTION_TEXT_RATIO",
    replace: "hexToRgb(ground)!, SECTION_TEXT_RATIO",
    expectFailing: only(...NAMES_SCREEN, NAMES_PRINT),
  },
  {
    id: "B28 on the dark chart the ink moves toward black  [expect 1: names dark]",
    file: SECTIONS,
    find: "  const towardWhite = luminance(ground) < 0.18;",
    replace: "  const towardWhite = false;",
    expectFailing: only(NAMES_DARK),
  },
  // -- The legend: no Section entry in either (WI-173; B29–B32 retired, see the header) -----------------
  {
    id: "B42 the Gantt's legend names Sections again  [expect 1: legend]",
    file: LEGEND,
    find: "      {/* Date prepared — pushed to far right */}\n",
    replace: "      <span><span className=\"align-middle\">Section: first start to last finish</span></span>\n      {/* Date prepared — pushed to far right */}\n",
    expectFailing: only(LEG_SCREEN),
  },
  {
    id: "B43 the printed legend names Sections again, while a bar is drawn  [expect 1: legend]",
    file: PRINT,
    find: "        <span className=\"ml-auto text-gray-500\">\n          Date prepared:",
    replace: "        {sections.some((s) => s.bar) && <span className=\"flex items-center gap-1\">Section: first start to last finish</span>}\n        <span className=\"ml-auto text-gray-500\">\n          Date prepared:",
    expectFailing: only(LEG_PRINT),
  },
  // -- The hover text --------------------------------------------------------------------------------
  {
    id: "B33 the hover text shows at once, with no hover delay  [expect 1: tooltip]",
    file: CHART,
    find: "onMouseEnter={(e) => scheduleTooltip(e.clientX, e.clientY,\n                sectionTooltip(",
    replace: "onMouseEnter={(e) => ((x: number, y: number, text: string) => setTooltip({ x, y, text }))(e.clientX, e.clientY,\n                sectionTooltip(",
    expectFailing: only(TIP),
  },
  {
    id: "B34 the hover text's dates ignore the user's Date Format  [expect 1: tooltip]",
    file: CHART,
    find: "s.group.activityIds.length, formatDate))}",
    replace: "s.group.activityIds.length, (iso: string) => iso))}",
    expectFailing: only(TIP),
  },
  {
    id: "B35 the hover text uses the raw name, not the chart's placeholder  [expect 1: tooltip]",
    file: CHART,
    find: "sectionTooltip(sectionDisplayName(s.group.band), s.bar!",
    replace: "sectionTooltip(s.group.band.name, s.bar!",
    expectFailing: only(TIP),
  },
  {
    id: "B36 one activity reads \"1 activities\"  [expect 2: words, tooltip]",
    file: SECTIONS,
    find: "count === 1 ? \"1 activity\" :",
    replace: "count === 1 ? \"1 activities\" :",
    expectFailing: only(WORDS, TIP),
  },
  {
    id: "B37 the placeholder is not by trim  [expect 2: unnamed, tooltip]",
    file: SECTIONS,
    find: "  return band.name.trim() || \"(unnamed section)\";",
    replace: "  return band.name || \"(unnamed section)\";",
    expectFailing: only(UNNAMED, TIP),
  },
  // -- The lag-label halo, in the chart's ground ------------------------------------------------------
  {
    id: "B38 the Gantt's lag labels have no halo  [expect 2: light, dark]",
    file: CHART,
    find: "                    stroke={c.bg} strokeWidth=\"3\" paintOrder=\"stroke fill\"\n",
    replace: "",
    expectFailing: only(HALO_LIGHT, HALO_DARK),
  },
  {
    id: "B39 the Gantt's halo is white in dark mode too  [expect 1: dark]",
    file: CHART,
    find: "stroke={c.bg} strokeWidth=\"3\" paintOrder=\"stroke fill\"",
    replace: "stroke=\"#ffffff\" strokeWidth=\"3\" paintOrder=\"stroke fill\"",
    expectFailing: only(HALO_DARK),
  },
  {
    id: "B40 the printed lag labels have no halo  [expect 1: print]",
    file: PRINT,
    find: "\n                  stroke={c.bg} strokeWidth=\"1.5\" paintOrder=\"stroke fill\">",
    replace: ">",
    expectFailing: only(HALO_PRINT),
  },
  // -- Which rows a Section covers ---------------------------------------------------------------------
  {
    id: "B41 a group stops at its own row  [expect 1: groups]",
    file: SECTIONS,
    find: "      open.endRow = idx + 1;\n",
    replace: "",
    expectFailing: only(GROUPS),
  },
];
