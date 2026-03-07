// --- Interactive Gantt layout constants ---
export const LEFT_MARGIN = 180;
export const RIGHT_MARGIN = 40;
export const TOP_MARGIN = 32;
export const ROW_HEIGHT = 32;
export const BAR_HEIGHT = 22;
export const BAR_Y_OFFSET = (ROW_HEIGHT - BAR_HEIGHT) / 2;
export const BAR_RADIUS = 4;
export const MIN_CHART_WIDTH = 900;
export const ARROW_HEAD_SIZE = 10;
export const MIN_TICK_SPACING_PX = 70;

// --- Print Gantt layout constants ---
export const PRINT_LEFT = 120;
export const PRINT_RIGHT = 20;
export const PRINT_TOP = 24;
export const PRINT_ROW = 18;
export const PRINT_BAR_H = 12;

// --- Color palette ---
export const COLORS = {
  light: {
    barPlanned: "#3b82f6",
    barComplete: "#22c55e",
    hatchActivity: "#93c5fd",
    hatchBuffer: "#fbbf24",
    arrow: "#6b7280",
    gridLine: "#e5e7eb",
    text: "#111827",
    textMuted: "#6b7280",
    bg: "#ffffff",
    labelBg: "#f9fafb",
    tickLine: "#d1d5db",
    finishLine: "#16a34a",
    finishText: "#15803d",
  },
  dark: {
    barPlanned: "#60a5fa",
    barComplete: "#4ade80",
    hatchActivity: "#3b82f6",
    hatchBuffer: "#f59e0b",
    arrow: "#6b7280",
    gridLine: "#374151",
    text: "#f3f4f6",
    textMuted: "#9ca3af",
    bg: "#1f2937",
    labelBg: "#111827",
    tickLine: "#4b5563",
    finishLine: "#4ade80",
    finishText: "#4ade80",
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

export type GanttColorTheme = (typeof COLORS)["light"];
