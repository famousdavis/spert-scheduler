/**
 * UI-specific constants for SPERT Scheduler.
 * Domain constants (RSM_LEVELS, STANDARD_PERCENTILES, etc.) are in @domain/models/types.ts
 */

// -- Undo/Redo --
export const UNDO_STACK_LIMIT = 50;

// -- Auto-run Simulation --
export const AUTO_RUN_DEBOUNCE_MS = 500;

// -- Chart Visualization --
export const DEFAULT_HISTOGRAM_BIN_COUNT = 50;
export const DEFAULT_CDF_MAX_POINTS = 300;
export const CHART_HEIGHT_PX = 300;

// -- Colors --
export const CHART_COLORS = {
  primary: "#3b82f6",    // blue-500
  success: "#10b981",    // emerald-500
  warning: "#f59e0b",    // amber-500
  danger: "#ef4444",     // red-500
  purple: "#8b5cf6",     // violet-500
  gray: "#6b7280",       // gray-500
} as const;

export const COMPARISON_COLORS = [
  CHART_COLORS.primary,
  CHART_COLORS.success,
  CHART_COLORS.warning,
  CHART_COLORS.danger,
  CHART_COLORS.purple,
] as const;

// -- Sensitivity Analysis --
export const SENSITIVITY_TOP_N_DEFAULT = 5;
export const SENSITIVITY_SCALE_FACTOR = 1.1; // 10% increase for impact calculation

// -- Bootstrap CI --
export const BOOTSTRAP_ITERATIONS_DEFAULT = 500;
export const CI_CONFIDENCE_LEVEL = 0.95;

// -- Toast Notifications --
export const TOAST_DURATION_MS = 3000;

// -- Grid/Table --
export const MAX_ACTIVITIES_BEFORE_VIRTUALIZATION = 50;

// -- Validation --
export const MIN_TRIAL_COUNT = 1000;
export const MAX_TRIAL_COUNT = 500000;
export const DEFAULT_TRIAL_COUNT = 50000;

// -- File Size Limits --
export const MAX_IMPORT_FILE_SIZE_MB = 10;
export const MAX_IMPORT_FILE_SIZE_BYTES = MAX_IMPORT_FILE_SIZE_MB * 1024 * 1024;
