// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

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
export const MIN_CHART_WIDTH = 900;
export const ARROW_HEAD_SIZE = 10;
export const MIN_TICK_SPACING_PX = 70;
/** Minimum pixel distance between a tick label and the Today line label.
 *  Applied to ALL ticks including the first (unlike other suppression checks).
 *  Today's label is prominent (two lines: name + date) and already provides
 *  year context, so nearby ticks are suppressed to avoid overlap.
 *
 *  History: Originally 60px (v0.32.0). Reduced to 44px (v0.32.3) because on
 *  compressed fit-to-window timelines (~1,500+ day projects in ~900px), 60px
 *  suppressed quarterly ticks that had adequate visual clearance, leaving
 *  visible gaps (e.g. Q2 → gap → Q4). 44px sits just above MIN_LABEL_PX (40)
 *  giving the Today label modest breathing room without eating adjacent ticks.
 *
 *  Watchpoint: On extremely compressed charts with semiannual (sparse) ticks,
 *  even 44px could suppress a tick and leave a 6-month gap. If that surfaces,
 *  consider an adaptive threshold based on actual tick spacing rather than
 *  lowering this constant further. */
export const TODAY_PROXIMITY_PX = 44;
export const PROJECT_NAME_HEIGHT = 28;

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

  // Name column width → leftMargin + charLimit (base limits calibrated for 12px)
  const nameColumnMap = {
    narrow:  { leftMargin: 180, baseCharLimit: 24, printLeftMargin: 120, basePrintCharLimit: 18 },
    normal:  { leftMargin: 260, baseCharLimit: 38, printLeftMargin: 170, basePrintCharLimit: 26 },
    wide:    { leftMargin: 360, baseCharLimit: 54, printLeftMargin: 230, basePrintCharLimit: 36 },
  } as const;
  const col = nameColumnMap[s.nameColumnWidth];
  const fontScale = 12 / nameFontSize;
  const nameCharLimit = Math.floor(col.baseCharLimit * fontScale);
  const printNameCharLimit = Math.floor(col.basePrintCharLimit * fontScale);

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
    barComplete: presetColors.barComplete,
    criticalPath: presetColors.criticalPath,
    barLabel: s.barLabel,
    barLabelFontSize,
    printBarLabelFontSize,
    weekendShading: s.weekendShading,
    shadingColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)",
    fitToWindow: s.fitToWindow ?? false,
    timelineDensityPx: ({ sparse: 90, normal: 70, dense: 50 } as const)[s.timelineDensity ?? "normal"],
  };
}
