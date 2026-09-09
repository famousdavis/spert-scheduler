// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { GanttAppearanceSettings } from "@domain/models/types";
import { DEFAULT_GANTT_APPEARANCE } from "@domain/models/types";

// --- Interactive Gantt layout constants ---
export const LEFT_MARGIN = 260;
export const RIGHT_MARGIN = 40;
export const TOP_MARGIN = 32;
export const ROW_HEIGHT = 32;
export const BAR_HEIGHT = 22;
export const BAR_Y_OFFSET = (ROW_HEIGHT - BAR_HEIGHT) / 2;
export const BAR_RADIUS = 4;
/**
 * Minimum width of a bar's invisible click target, in px.
 *
 * Bars floor at 4px (`computeActivityRowGeometry`), and a 4px target is not reachable —
 * measured 2026-09-05, a 1-day activity's bar was 100% unclickable at its vertical centre.
 * The hit rect widens to this value ONLY when the bar is narrower than it; at or above it
 * the rect matches the bar exactly, so the hatched uncertainty extension stays inert.
 */
export const MIN_BAR_HIT_WIDTH = 14;
/**
 * How long a single click on an activity name waits before opening the editor, in ms.
 *
 * The wait exists only so a DOUBLE click can cancel it and start an inline rename
 * instead — the two gestures share one element, so the first cannot act until the
 * second has had a chance to arrive. A quarter second is the owner's accepted cost.
 */
export const NAME_CLICK_DELAY_MS = 250;
export const MIN_CHART_WIDTH = 900;
export const ARROW_HEAD_SIZE = 10;
export const MIN_TICK_SPACING_PX = 70;
/**
 * Breathing room between two KEPT tick labels, on top of their own widths.
 *
 * ⚠️ THIS IS A DENSITY CHOICE, NOT A COLLISION THRESHOLD, and the two were the same
 * number until v0.67.14. It used to be `minSpacingPx: 40` with the inline comment
 * `was MIN_LABEL_PX = 40` — a constant named for label WIDTH doing collision duty
 * while carrying no font size, so it could not adapt when the font changed. Overlap
 * is now decided by `labelHalfWidth` on each label's own text; this only stops a
 * technically-non-overlapping timeline from reading as a solid rule of dates.
 *
 * History: originally 60px (v0.32.0), reduced to 44px (v0.32.3), then 40 for element
 * proximity. Kept at 40 here so v0.67.14 changes which labels collide without also
 * changing how dense the timeline looks.
 */
export const TICK_LABEL_PITCH_PX = 40;
export const PROJECT_NAME_HEIGHT = 28;

// --- Header label typography ------------------------------------------------
//
// ⚠️ ONE SIZE PER CLASS, READ BY BOTH THE RENDERER AND THE SUPPRESSION MODEL. Before
// v0.67.14 each of these was a bare literal in the JSX and the suppression thresholds
// were unrelated hardcoded pixel counts, so a font change moved the labels and left
// the overlap test where it was. `use-gantt-layout` now derives every obstacle's
// half-width from these, which is only sound while the JSX and the model read the
// SAME constant — do not inline one back.
//
// ⚠️ A size that arrives through a constant is INVISIBLE to the source-text scan in
// `legibility-floor.test.ts`: its pattern matches a numeric literal in the JSX
// attribute, and an identifier is not one. Every constant below is therefore pinned BY
// VALUE in that guard. Adding another header font constant without adding it there
// re-opens the hole this comment describes.
//
// ⚠️ AND THIS COMMENT ITSELF TRIPPED THAT GUARD. Its first draft spelled the old
// literal out as an example and the scanner counted the PROSE as a sub-floor site —
// `gantt-constants.ts:63`, a font size that does not exist. A census that matches a
// spelling cannot tell code from a sentence about code.
/** Timeline tick labels. Raised 11 → 12 in v0.67.14, which is what the legibility
 *  floor's `GanttChart:745` exception was held open for: it was blocked only by the
 *  font-blind threshold above and by the milestone date label sharing its lane, and
 *  v0.67.14 fixes both. Clearance to the milestone date lane at 12px: 4.2px. */
export const TICK_LABEL_FONT_PX = 12;
/** Buffered-finish date beside the finish line. Shares the tick baseline. */
export const FINISH_LABEL_FONT_PX = 12;
/** "Today" over its date, two rows in their own stacked group. */
export const TODAY_LABEL_FONT_PX = 11;
export const TODAY_DATE_FONT_PX = 10;
/** ⚠️ "Today" was at `topMargin − 18`, which put its em box 0.13px INSIDE its own date
 *  label's — the fifth zero-clearance pair this campaign has turned up, and one neither
 *  analyst reported because a browser `getBBox` rounds it to a clean 0.00. 21 buys
 *  2.9px. The pair straddles the marker and tick lanes by design; the today line is an
 *  obstacle, so it clears ticks out of its own way. */
export const TODAY_LABEL_DY = 21;
export const TODAY_DATE_DY = 6;
/** "Target" beside the finish-target line. */
export const TARGET_LABEL_FONT_PX = 11;
/** Milestone name over its date — the second stacked group in the header. */
export const MILESTONE_NAME_FONT_PX = 12;
export const MILESTONE_DATE_FONT_PX = 10;

// --- Header label lanes -----------------------------------------------------
//
// ⚠️ MEASURED, NOT CHOSEN. Every offset below comes from browser `getBBox` boxes
// (ascent ≈ 0.96 em, descent ≈ 0.23 em) so that each lane clears the one below it by
// a STATED margin. Before v0.67.14 the milestone date sat 3px above the tick baseline
// and so lived INSIDE the tick/finish lane, overlapping it by 10.5px — which is why
// the finish label overlapped a milestone date by ~51px in every single interactive
// condition measured. The print chart already separated its lanes, which is why print
// was collision-free; it did so with 0.00px of clearance, which is why the margins
// here are stated rather than inherited.
/**
 * Three lanes, bottom to top, with the em-box clearance each one buys:
 *
 *   tick + finish   baseline `topMargin − 8`   (12px)  band [tm−19.5, tm−5.2]
 *   marker lane     baseline `topMargin − 25`  (10/11) band [tm−35.6, tm−22.5]   3.0px clear
 *   milestone name  baseline `topMargin − 42`  (12px)  band [tm−53.5, tm−39.2]   3.6px clear
 *
 * ⚠️ The MARKER lane holds the milestone date AND the "Target" label. They were 3px
 * apart before, in two different lanes, both partly inside the tick band; sharing one
 * lane is what makes both clearances statable. `Today` and its date deliberately do
 * NOT move — that pair straddles the marker and tick lanes by design, and the today
 * line is an obstacle that clears ticks out of its own way.
 */
export const MILESTONE_NAME_DY = 42;
export const MILESTONE_DATE_DY = 25;
/** "Target" shares the marker lane with the milestone date. Was `topMargin − 22`,
 *  which cleared the 11px tick band by 1.0px and the 12px band by −0.05px — i.e. the
 *  legibility raise would have put it INSIDE the tick lane. */
export const TARGET_LABEL_DY = 25;
/**
 * Vertical space the milestone block claims above `topMargin` for its FIRST row.
 * Unchanged at 26 since the header was introduced; the lanes above now fit inside it
 * with 4.5px of headroom rather than overlapping each other and the ticks.
 */
export const MILESTONE_HEADER_PX = 26;
/** Half-diagonal of the milestone diamond, and the only part of a milestone that still
 *  reaches the tick band (by 2.8px) now that its date label has its own lane. */
export const MILESTONE_DIAMOND_SIZE = 6;
/**
 * Vertical step between the two milestone NAME rows when names would collide.
 *
 * ⚠️ STAGGERING, NOT TRUNCATION. At 853 + fit-to-window the sample project's four
 * milestone names overlap in ONE CONTINUOUS CHAIN (67.6 / 51.2 / 36.3px). Truncating
 * would lose the names irrecoverably — the milestone group binds no pointer or focus
 * handler and renders no `<title>`, so THERE IS NO MILESTONE TOOLTIP to recover them
 * from. A second row costs vertical space and loses nothing.
 *
 * ⚠️ THE NAME MOVES; THE DATE DOES NOT. Lifting the whole name+date block would need a
 * step of 34px — the block is 31px tall, so a smaller step drops the lifted block's
 * DATE exactly onto the unlifted block's NAME. The first draft here used 17 and did
 * precisely that; the collision oracle's positive control caught it, on the same run
 * that proved the stagger was working. One row of names is 14.3px plus 3px of margin.
 */
export const MILESTONE_ROW_STEP = 18;
/** Clear space demanded between two header labels, on top of their own extents. */
export const LABEL_GAP_PX = 4;
/** The marker-line labels, as rendered. Shared so the suppression model measures the
 *  same strings the JSX draws — the drift this whole change exists to close. */
export const TODAY_LABEL_TEXT = "Today";
export const TARGET_LABEL_TEXT = "Target";
/**
 * A stand-in for any formatted date label, used to size the today and milestone date
 * labels without threading the user's formatter into the layout hook.
 *
 * ⚠️ Sound only while every `dateFormat` option is exactly ten characters —
 * `MM/DD/YYYY`, `DD/MM/YYYY` and `YYYY/MM/DD` all are, and `gantt-utils.test.ts`
 * asserts it so a fourth format cannot quietly make every date obstacle too narrow.
 */
export const DATE_LABEL_SPECIMEN = "00/00/0000";

// --- Print Gantt layout constants ---
export const PRINT_LEFT = 170;
export const PRINT_RIGHT = 20;
export const PRINT_TOP = 24;
export const PRINT_ROW = 18;
export const PRINT_BAR_H = 12;
export const PRINT_BAR_RADIUS = 2;
export const PRINT_ARROW_SIZE = 6;
export const PRINT_MIN_TICK_PX = 40;
export const PRINT_PROJECT_NAME_H = 16;
export const PRINT_MILESTONE_EXTRA_TOP = 14;
/**
 * Print header lanes, above `topMargin`. Same three-lane shape as the interactive
 * chart, and `Target` shares the marker lane with the milestone date here too.
 *
 * ⚠️ PRINT WAS THE CLEAN CHART IN EVERY CONDITION MEASURED — with EXACTLY 0.00px
 * between its milestone-date lane and its tick lane. It was collision-free with no
 * margin whatsoever, which is a coincidence rather than a design, and it is why the
 * interactive fix could not simply be copied from here. These offsets buy at least
 * 2.0px of clearance at EVERY font scale, checked at the largest (`fs5` = 6, `fs4` =
 * 5, reached when the activity font size is 14); at the shipped default the margins
 * are 4.3px and 3.1px.
 */
export const PRINT_MILESTONE_NAME_DY = 23;
export const PRINT_MILESTONE_DATE_DY = 14;
export const PRINT_TARGET_LABEL_DY = 14;
/** ⚠️ "Today" was at `topMargin − 9`, leaving 1.01px above its own date label at the
 *  default scale and OVERLAPPING it by 0.18px at the largest. Print's today line was
 *  invisible to every measurement in this round because the sample loads with a start
 *  in the future, so no condition rendered one until the collision oracle grew a
 *  today-in-span print case. 12 buys 4.0px, and 2.8px at the largest scale. */
export const PRINT_TODAY_LABEL_DY = 12;
export const PRINT_TODAY_DATE_DY = 3;
/** Half-diagonal of the print milestone diamond — the only part of a print milestone
 *  that reaches the tick band. */
export const PRINT_DIAMOND_SIZE = 4;
/** Print equivalent of MILESTONE_ROW_STEP — one milestone-name row at print scale. */
export const PRINT_MILESTONE_ROW_STEP = 10;
/** Print equivalent of LABEL_GAP_PX, at print's 4–6px type. */
export const PRINT_LABEL_GAP_PX = 2;
/** Padding (px) subtracted from the print name column width to get the usable text
 *  budget: reserves the right-anchor offset plus a little left-edge breathing room so
 *  a label neither touches the bars nor clips at the SVG's left edge. */
export const PRINT_NAME_EDGE_PAD = 8;
/** Average glyph advance as a fraction of font size, used to convert the print name
 *  column's pixel budget into a character limit. Matches the 0.6 factor the Gantt
 *  bar-label fit checks use; a slight over-estimate, so truncation errs toward not
 *  overflowing (a too-wide name clips harmlessly at the left edge rather than mid-word). */
export const PRINT_NAME_CHAR_ADVANCE = 0.6;
/** Floor on the derived print name char limit — a guard against a pathologically
 *  narrow future column preset; never binds for the current narrow/normal/wide set. */
export const PRINT_NAME_MIN_CHARS = 8;

// --- Color palette ---
export const COLORS = {
  light: {
    barPlanned: "#3b82f6",
    barInProgress: "#f97316",
    barComplete: "#9ca3af",
    hatchBuffer: "#fbbf24",
    arrow: "#6b7280",
    arrowHover: "#374151",
    arrowHoverCritical: "#991b1b",
    gridLine: "#e5e7eb",
    text: "#111827",
    textMuted: "#6b7280",
    bg: "#ffffff",
    labelBg: "#f9fafb",
    tickLine: "#d1d5db",
    finishLine: "#16a34a",
    finishText: "#15803d",
    criticalPath: "#dc2626",
    todayLine: "#8b5cf6",
    todayText: "#7c3aed",
    terminal: "#111827",
  },
  dark: {
    barPlanned: "#60a5fa",
    barInProgress: "#fb923c",
    barComplete: "#6b7280",
    hatchBuffer: "#f59e0b",
    arrow: "#6b7280",
    arrowHover: "#d1d5db",
    arrowHoverCritical: "#fca5a5",
    gridLine: "#374151",
    text: "#f3f4f6",
    textMuted: "#9ca3af",
    bg: "#1f2937",
    labelBg: "#111827",
    tickLine: "#4b5563",
    finishLine: "#4ade80",
    finishText: "#4ade80",
    criticalPath: "#f87171",
    todayLine: "#a78bfa",
    todayText: "#a78bfa",
    terminal: "#d1d5db",
  },
} as const;

export const MILESTONE_COLORS = {
  light: {
    green: "#16a34a",
    amber: "#d97706",
    red: "#dc2626",
    line: "#9333ea",
    diamond: "#7c3aed",
  },
  dark: {
    green: "#4ade80",
    amber: "#fbbf24",
    red: "#f87171",
    line: "#c084fc",
    diamond: "#a78bfa",
  },
} as const;

export const TARGET_COLORS = {
  light: {
    green: "#16a34a",
    amber: "#d97706",
    red: "#dc2626",
    gray: "#9ca3af",
  },
  dark: {
    green: "#4ade80",
    amber: "#fbbf24",
    red: "#f87171",
    gray: "#6b7280",
  },
} as const;

/** Dash pattern per RAG state — distinguishable in monochrome */
export const TARGET_DASH_PATTERNS: Record<string, string> = {
  green: "8 4",
  amber: "4 4",
  red: "2 3",
  gray: "4 3",
};

export type GanttColorTheme = (typeof COLORS)["light"];

// --- Gantt Color Presets ---

export interface GanttPresetColors {
  barPlanned: string;
  barInProgress: string;
  barComplete: string;
  criticalPath: string;
}

export const GANTT_COLOR_PRESETS: Record<string, { light: GanttPresetColors; dark: GanttPresetColors }> = {
  classic: {
    light: { barPlanned: "#3b82f6", barInProgress: "#f97316", barComplete: "#9ca3af", criticalPath: "#dc2626" },
    dark:  { barPlanned: "#60a5fa", barInProgress: "#fb923c", barComplete: "#6b7280", criticalPath: "#f87171" },
  },
  professional: {
    light: { barPlanned: "#1e40af", barInProgress: "#b45309", barComplete: "#6b7280", criticalPath: "#991b1b" },
    dark:  { barPlanned: "#93c5fd", barInProgress: "#fbbf24", barComplete: "#9ca3af", criticalPath: "#fca5a5" },
  },
  colorful: {
    light: { barPlanned: "#7c3aed", barInProgress: "#0891b2", barComplete: "#9ca3af", criticalPath: "#e11d48" },
    dark:  { barPlanned: "#a78bfa", barInProgress: "#22d3ee", barComplete: "#6b7280", criticalPath: "#fb7185" },
  },
  grayscale: {
    light: { barPlanned: "#475569", barInProgress: "#64748b", barComplete: "#94a3b8", criticalPath: "#1e293b" },
    dark:  { barPlanned: "#94a3b8", barInProgress: "#cbd5e1", barComplete: "#64748b", criticalPath: "#e2e8f0" },
  },
  contrast: {
    light: { barPlanned: "#1d4ed8", barInProgress: "#ea580c", barComplete: "#6b7280", criticalPath: "#dc2626" },
    dark:  { barPlanned: "#60a5fa", barInProgress: "#fb923c", barComplete: "#9ca3af", criticalPath: "#f87171" },
  },
  forest: {
    light: { barPlanned: "#15803d", barInProgress: "#a16207", barComplete: "#9ca3af", criticalPath: "#b91c1c" },
    dark:  { barPlanned: "#4ade80", barInProgress: "#facc15", barComplete: "#6b7280", criticalPath: "#f87171" },
  },
  ocean: {
    light: { barPlanned: "#0891b2", barInProgress: "#0d9488", barComplete: "#94a3b8", criticalPath: "#be123c" },
    dark:  { barPlanned: "#22d3ee", barInProgress: "#2dd4bf", barComplete: "#64748b", criticalPath: "#fb7185" },
  },
  sunset: {
    light: { barPlanned: "#d97706", barInProgress: "#dc2626", barComplete: "#9ca3af", criticalPath: "#7c2d12" },
    dark:  { barPlanned: "#fbbf24", barInProgress: "#f87171", barComplete: "#6b7280", criticalPath: "#fca5a5" },
  },
  lavender: {
    light: { barPlanned: "#7e22ce", barInProgress: "#c026d3", barComplete: "#a1a1aa", criticalPath: "#9f1239" },
    dark:  { barPlanned: "#c084fc", barInProgress: "#e879f9", barComplete: "#71717a", criticalPath: "#fb7185" },
  },
  earth: {
    light: { barPlanned: "#92400e", barInProgress: "#b45309", barComplete: "#a8a29e", criticalPath: "#7c2d12" },
    dark:  { barPlanned: "#fbbf24", barInProgress: "#fb923c", barComplete: "#78716c", criticalPath: "#fca5a5" },
  },
};

export const KNOWN_PRESET_KEYS = Object.keys(GANTT_COLOR_PRESETS);

/** Standard color swatch palette for the custom color picker */
export const GANTT_STANDARD_COLORS = [
  "#dc2626", "#ea580c", "#d97706", "#ca8a04", "#65a30d",
  "#16a34a", "#0d9488", "#0891b2", "#0284c7", "#2563eb",
  "#4f46e5", "#7c3aed", "#9333ea", "#c026d3", "#db2777",
  "#475569", "#1e293b", "#78716c", "#57534e", "#0f172a",
];

// --- Resolved Gantt Appearance ---

export interface ResolvedGanttAppearance {
  // Layout
  leftMargin: number;
  nameCharLimit: number;
  nameFontSize: number;
  rowHeight: number;
  barHeight: number;
  barYOffset: number;
  // Print layout
  printLeftMargin: number;
  printNameCharLimit: number;
  printRowHeight: number;
  printBarHeight: number;
  // Colors
  barPlanned: string;
  barInProgress: string;
  barComplete: string;
  criticalPath: string;
  // Bar label
  barLabel: "duration" | "dates" | "none";
  barLabelFontSize: number;
  printBarLabelFontSize: number;
  // Weekend shading
  weekendShading: boolean;
  shadingColor: string;
  // Fit to window
  fitToWindow: boolean;
  // Timeline label density — pixel threshold for tick level selection
  timelineDensityPx: number;
  // Row guide lines
  rowGuideLines: boolean;
}

/**
 * Pure function: resolves GanttAppearanceSettings into concrete pixel values and colors.
 * When settings is undefined, returns defaults matching current hardcoded constants.
 */
export function resolveGanttAppearance(
  settings: GanttAppearanceSettings | undefined,
  isDark: boolean,
): ResolvedGanttAppearance {
  const s = settings ?? DEFAULT_GANTT_APPEARANCE;

  // Font size (resolve first — char limits depend on it)
  const fontSizeMap = { small: 11, normal: 12, large: 14, xl: 16 } as const;
  const nameFontSize = fontSizeMap[s.activityFontSize];

  // Name column width → leftMargin + charLimit (interactive base limits calibrated for 12px)
  const nameColumnMap = {
    narrow:  { leftMargin: 180, baseCharLimit: 24, printLeftMargin: 120 },
    normal:  { leftMargin: 260, baseCharLimit: 38, printLeftMargin: 170 },
    wide:    { leftMargin: 360, baseCharLimit: 54, printLeftMargin: 230 },
  } as const;
  const col = nameColumnMap[s.nameColumnWidth];
  const fontScale = 12 / nameFontSize;
  const nameCharLimit = Math.floor(col.baseCharLimit * fontScale);

  // Print name char limit is DERIVED from the column's pixel width and the actual print
  // font size, not a hardcoded per-width constant. The print label is right-anchored at
  // `printLeftMargin - 4` and grows leftward toward the SVG's left edge, so the usable
  // text budget is `printLeftMargin - PRINT_NAME_EDGE_PAD`; dividing by the average glyph
  // advance (font size × PRINT_NAME_CHAR_ADVANCE) yields how many characters fit. This
  // fills the whole column — the previous fixed limits were calibrated for a ~12px font
  // and truncated at ~2/3 of the 7px print column's real capacity, ellipsizing names with
  // a third of the column unused (v0.53.2). Print font size mirrors PrintGanttChart's
  // `fs7 = round(7 × nameFontSize / 12)`.
  const printFontSize = Math.round(7 * (nameFontSize / 12));
  const printNameCharLimit = Math.max(
    PRINT_NAME_MIN_CHARS,
    Math.floor((col.printLeftMargin - PRINT_NAME_EDGE_PAD) / (printFontSize * PRINT_NAME_CHAR_ADVANCE)),
  );

  // Row density
  const densityMap = {
    compact:     { rowHeight: 24, barHeight: 16 },
    normal:      { rowHeight: 32, barHeight: 22 },
    comfortable: { rowHeight: 44, barHeight: 30 },
  } as const;
  const density = densityMap[s.rowDensity];

  // Print row density (proportionally scaled)
  const printDensityMap = {
    compact:     { printRowHeight: 14, printBarHeight: 9 },
    normal:      { printRowHeight: 18, printBarHeight: 12 },
    comfortable: { printRowHeight: 25, printBarHeight: 17 },
  } as const;
  const printDensity = printDensityMap[s.rowDensity];

  // Colors from preset (fall back to classic if unknown)
  const presetKey = s.colorPreset in GANTT_COLOR_PRESETS ? s.colorPreset : "classic";
  const preset = GANTT_COLOR_PRESETS[presetKey]!;
  const presetColors = isDark ? preset.dark : preset.light;

  // Custom colors override preset
  const barPlanned = s.customPlannedColor ?? presetColors.barPlanned;
  const barInProgress = s.customInProgressColor ?? presetColors.barInProgress;
  const barComplete = s.customCompletedColor ?? presetColors.barComplete;

  // Bar label font size: scales with activity font, capped to fit bar height
  const barLabelFontMap = { small: 10, normal: 10, large: 11, xl: 13 } as const;
  const barLabelFontSize = Math.min(barLabelFontMap[s.activityFontSize], density.barHeight - 6);

  const printBarLabelFontMap = { small: 5, normal: 6, large: 7, xl: 8 } as const;
  const printBarLabelFontSize = Math.min(
    printBarLabelFontMap[s.activityFontSize],
    printDensity.printBarHeight - 4,
  );

  return {
    leftMargin: col.leftMargin,
    nameCharLimit,
    nameFontSize,
    rowHeight: density.rowHeight,
    barHeight: density.barHeight,
    barYOffset: (density.rowHeight - density.barHeight) / 2,
    printLeftMargin: col.printLeftMargin,
    printNameCharLimit,
    printRowHeight: printDensity.printRowHeight,
    printBarHeight: printDensity.printBarHeight,
    barPlanned,
    barInProgress,
    barComplete,
    criticalPath: presetColors.criticalPath,
    barLabel: s.barLabel,
    barLabelFontSize,
    printBarLabelFontSize,
    weekendShading: s.weekendShading,
    shadingColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)",
    fitToWindow: s.fitToWindow ?? false,
    timelineDensityPx: ({ sparse: 90, normal: 70, dense: 50 } as const)[s.timelineDensity ?? "normal"],
    rowGuideLines: s.rowGuideLines ?? true,
  };
}
