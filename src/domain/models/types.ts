// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

// ============================================================================
// SPERT Scheduler v1.0 — Domain Types and Constants
// ============================================================================

// -- Version Constants -------------------------------------------------------

/** Informational. Recorded in SimulationRun for auditability. */
export const ENGINE_VERSION = "1.0.0";

/** Operational. Drives persistence migration system. */
export const SCHEMA_VERSION = 19;

// -- Enums / Union Types -----------------------------------------------------

export const RSM_LEVELS = [
  "nearCertainty",
  "veryHighConfidence",
  "highConfidence",
  "mediumHighConfidence",
  "mediumConfidence",
  "mediumLowConfidence",
  "lowConfidence",
  "veryLowConfidence",
  "extremelyLowConfidence",
  "guesstimate",
] as const;

export type RSMLevel = (typeof RSM_LEVELS)[number];

export const DISTRIBUTION_TYPES = [
  "normal",
  "logNormal",
  "triangular",
  "uniform",
] as const;

export type DistributionType = (typeof DISTRIBUTION_TYPES)[number];

export const ACTIVITY_STATUSES = [
  "planned",
  "inProgress",
  "complete",
] as const;

export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];

export const CONSTRAINT_TYPES = [
  "MSO",
  "MFO",
  "SNET",
  "SNLT",
  "FNET",
  "FNLT",
] as const;

export type ConstraintType = (typeof CONSTRAINT_TYPES)[number];

export const CONSTRAINT_MODES = ["hard", "soft"] as const;

export type ConstraintMode = (typeof CONSTRAINT_MODES)[number];

export const DEPENDENCY_TYPES = ["FS", "SS", "FF"] as const;

export type DependencyType = (typeof DEPENDENCY_TYPES)[number];

// -- RSM Lookup Table --------------------------------------------------------
// RSM = sqrt(k) / 10 for specific k values

export const RSM_VALUES: Record<RSMLevel, number> = {
  nearCertainty: 0.070710678, // k = 0.5
  veryHighConfidence: 0.1, // k = 1.0
  highConfidence: 0.141421356, // k = 2.0
  mediumHighConfidence: 0.173205081, // k = 3.0
  mediumConfidence: 0.2, // k = 4.0
  mediumLowConfidence: 0.234520788, // k = 5.5
  lowConfidence: 0.273861279, // k = 7.5
  veryLowConfidence: 0.316227766, // k = 10.0
  extremelyLowConfidence: 0.353553391, // k = 12.5
  guesstimate: 0.40620192, // k = 16.5
};

export const RSM_LABELS: Record<RSMLevel, string> = {
  nearCertainty: "Near certainty",
  veryHighConfidence: "Very high",
  highConfidence: "High",
  mediumHighConfidence: "Medium-high",
  mediumConfidence: "Medium",
  mediumLowConfidence: "Medium-low",
  lowConfidence: "Low",
  veryLowConfidence: "Very low",
  extremelyLowConfidence: "Extremely low",
  guesstimate: "Guesstimate",
};

// -- Domain Interfaces -------------------------------------------------------

export interface Holiday {
  id: string;
  name: string; // description (e.g., "Christmas Break")
  startDate: string; // ISO "YYYY-MM-DD"
  endDate: string; // ISO "YYYY-MM-DD" (same as startDate for single day)
  source?: "manual" | "api"; // origin tracker; absence treated as "manual"
  countryCodes?: string[]; // which countries this holiday was loaded from (API only)
  locale?: string; // optional free-text locale/region label (e.g., "California", "Bavaria")
}

export interface Calendar {
  holidays: Holiday[];
}

export interface ChecklistItem {
  id: string;
  text: string; // max 200 chars
  completed: boolean;
}

export interface DeliverableItem {
  id: string;
  text: string; // max 200 chars
  completed: boolean;
}

export interface Activity {
  id: string;
  name: string;
  min: number; // optimistic estimate (working days)
  mostLikely: number; // most likely estimate (working days)
  max: number; // pessimistic estimate (working days)
  confidenceLevel: RSMLevel;
  sdOverride?: number; // bypasses RSM calculation if set
  distributionType: DistributionType;
  status: ActivityStatus;
  actualDuration?: number; // filled when status is "complete"
  milestoneId?: string; // which milestone this activity must finish before
  startsAtMilestoneId?: string; // activity starts on this milestone's target date
  constraintType?: ConstraintType | null; // scheduling constraint type
  constraintDate?: string | null; // ISO "YYYY-MM-DD" constraint date
  constraintMode?: ConstraintMode | null; // "hard" overrides, "soft" is advisory
  constraintNote?: string | null; // optional rationale for the constraint
  checklist?: ChecklistItem[]; // task checklist, max 50 items
  deliverables?: DeliverableItem[]; // deliverable checklist, max 50 items
  notes?: string; // free-text activity notes, max 2000 chars
}

export interface ActivityDependency {
  fromActivityId: string; // predecessor
  toActivityId: string; // successor
  type: DependencyType; // FS only for v1
  lagDays: number; // 0 default; negative = lead time
}

export interface Milestone {
  id: string;
  name: string; // e.g., "DR Cutover", "Phase 1 Complete"
  targetDate: string; // "YYYY-MM-DD" — the hard deadline
}

export interface ScenarioSettings {
  defaultConfidenceLevel: RSMLevel;
  defaultDistributionType: DistributionType;
  trialCount: number; // 1,000 - 500,000 (default 50,000)
  rngSeed: string; // auto-generated, user-editable
  probabilityTarget: number; // Activity-level (deterministic schedule), 0.01 - 0.99 (default 0.50)
  projectProbabilityTarget: number; // Project-level (MC percentile lookup), 0.01 - 0.99 (default 0.95)
  heuristicEnabled: boolean; // when true, min/max auto-calculated from ML (default false)
  heuristicMinPercent: number; // 1-99, percentage of ML for min estimate (default 50)
  heuristicMaxPercent: number; // 101-1000, percentage of ML for max estimate (default 200)
  dependencyMode: boolean; // when true, use dependency graph instead of sequential order (default false)
  parkinsonsLawEnabled: boolean; // when true, clamp MC samples to deterministic floor (default true)
}

export interface HistogramBin {
  binStart: number;
  binEnd: number;
  count: number;
}

export interface CDFPoint {
  value: number;
  probability: number;
}

export interface SimulationRun {
  id: string;
  timestamp: string; // ISO 8601
  trialCount: number;
  seed: string;
  engineVersion: string;
  percentiles: Record<number, number>; // P5, P10, P25, P50, P75, P85, P90, P95
  histogramBins: HistogramBin[];
  mean: number;
  standardDeviation: number;
  minSample: number;
  maxSample: number;
  samples: number[]; // raw trial results for persistence
  milestoneResults?: Record<string, {
    percentiles: Record<number, number>;
    mean: number;
    standardDeviation: number;
  }>;
}

export interface Scenario {
  id: string;
  name: string;
  startDate: string; // "YYYY-MM-DD"
  activities: Activity[];
  dependencies: ActivityDependency[];
  milestones: Milestone[];
  settings: ScenarioSettings;
  simulationResults?: SimulationRun;
  locked?: boolean; // default false - prevents modifications when true
  notes?: string; // free-text scenario notes, max 2000 chars
}

// -- Gantt Appearance Settings ------------------------------------------------

export interface GanttAppearanceSettings {
  nameColumnWidth: "narrow" | "normal" | "wide";
  activityFontSize: "small" | "normal" | "large" | "xl";
  rowDensity: "compact" | "normal" | "comfortable";
  barLabel: "duration" | "dates" | "none";
  colorPreset: string;
  customPlannedColor?: string;
  customInProgressColor?: string;
  weekendShading: boolean;
  fitToWindow: boolean;
  timelineDensity?: "sparse" | "normal" | "dense";
  rowGuideLines?: boolean;
}

export const DEFAULT_GANTT_APPEARANCE: GanttAppearanceSettings = {
  nameColumnWidth: "normal",
  activityFontSize: "normal",
  rowDensity: "normal",
  barLabel: "duration",
  colorPreset: "classic",
  weekendShading: false,
  fitToWindow: false,
  timelineDensity: "normal",
  rowGuideLines: true,
};

// -- Project -----------------------------------------------------------------

export interface Project {
  id: string;
  name: string;
  createdAt: string; // ISO 8601
  schemaVersion: number;
  globalCalendarOverride?: Calendar;
  convertedWorkDays?: string[]; // ISO date strings for non-work days converted to work days
  targetFinishDate?: string | null; // ISO "YYYY-MM-DD", null/undefined = unset
  showTargetOnGantt?: boolean; // default false
  showActivityIds?: boolean; // default false — persist "Show Activity IDs" toggle
  ganttAppearance?: GanttAppearanceSettings;
  scenarios: Scenario[];
  archived?: boolean; // default false
}

// -- Schedule Output Types ---------------------------------------------------

export interface ScheduledActivity {
  activityId: string;
  name: string;
  duration: number; // working days
  startDate: string; // "YYYY-MM-DD"
  endDate: string; // "YYYY-MM-DD"
  isActual: boolean; // true if from actualDuration
  lateStart?: string; // constraint-adjusted late start (display only)
  lateFinish?: string; // constraint-adjusted late finish (display only)
  lateStartNet?: string; // network-driven late start (for SNLT/FNLT eval)
  lateFinishNet?: string; // network-driven late finish (for SNLT/FNLT eval)
  totalFloat?: number; // lateStartNet − ES_net (network-driven CPM float)
  freeFloat?: number;  // min gap to successors' early start (working days)
}

export interface ConstraintConflict {
  type: "constraint-conflict" | "constraint-violation";
  activityId: string;
  activityName: string;
  constraintType: ConstraintType;
  constraintDate: string;
  constraintMode: ConstraintMode;
  computedDate: string;
  deltaWorkingDays: number;
  severity: "error" | "warning";
  message: string;
}

export interface DependencyConflict {
  type: "dependency-violation";
  fromActivityId: string;
  fromActivityName: string;
  toActivityId: string;
  toActivityName: string;
  dependencyType: DependencyType;
  lagDays: number;
  severity: "warning";
  message: string;
}

export interface DeterministicSchedule {
  activities: ScheduledActivity[];
  totalDurationDays: number;
  projectEndDate: string; // "YYYY-MM-DD"
  constraintConflicts?: ConstraintConflict[];
  dependencyConflicts?: DependencyConflict[];
}

export interface MilestoneBufferInfo {
  milestone: Milestone;
  deterministicEndDate: string; // latest end date among milestone's activities
  deterministicDuration: number; // working days from project start
  bufferedEndDate: string | null; // after adding buffer
  bufferDays: number | null;
  slackDays: number | null; // working days between bufferedEnd and targetDate (positive = healthy)
  health: "green" | "amber" | "red";
}

// -- Defaults ----------------------------------------------------------------

export const DEFAULT_SCENARIO_SETTINGS: ScenarioSettings = {
  defaultConfidenceLevel: "mediumConfidence",
  defaultDistributionType: "triangular",
  trialCount: 50000,
  rngSeed: "placeholder", // overridden at createScenario() time
  probabilityTarget: 0.5, // P50 per-activity (deterministic schedule)
  projectProbabilityTarget: 0.95, // P95 project-level (MC confidence)
  heuristicEnabled: false,
  heuristicMinPercent: 75, // min = ML * 75%
  heuristicMaxPercent: 200, // max = ML * 200%
  dependencyMode: false,
  parkinsonsLawEnabled: true,
};

export const STANDARD_PERCENTILES = [5, 10, 25, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 96, 97, 98, 99] as const;

export const BASELINE_SCENARIO_NAME = "Baseline";

// -- Date Format Preference ---------------------------------------------------

export const DATE_FORMATS = ["MM/DD/YYYY", "DD/MM/YYYY", "YYYY/MM/DD"] as const;

export type DateFormatPreference = (typeof DATE_FORMATS)[number];

// -- Theme Preference ---------------------------------------------------------

export const THEME_OPTIONS = ["light", "dark", "system"] as const;

export type ThemePreference = (typeof THEME_OPTIONS)[number];

// -- User Preferences ---------------------------------------------------------

export const GANTT_VIEW_MODES = ["deterministic", "uncertainty"] as const;

export type GanttViewMode = (typeof GANTT_VIEW_MODES)[number];

export interface UserPreferences {
  defaultTrialCount: number;
  defaultDistributionType: DistributionType;
  defaultConfidenceLevel: RSMLevel;
  defaultActivityTarget: number;
  defaultProjectTarget: number;
  dateFormat: DateFormatPreference;
  autoRunSimulation: boolean;
  theme: ThemePreference;
  /** When false, strip samples array from simulation results to save storage (~90% reduction) */
  storeFullSimulationData: boolean;
  defaultHeuristicEnabled: boolean;
  defaultHeuristicMinPercent: number;
  defaultHeuristicMaxPercent: number;
  defaultDependencyMode: boolean;
  defaultParkinsonsLawEnabled: boolean;
  /** Company-wide holidays that apply to all projects */
  globalCalendar?: Calendar;
  /** Gantt chart view mode: deterministic bars or with uncertainty hatching */
  ganttViewMode: GanttViewMode;
  /** Show today's date line on Gantt chart */
  ganttShowToday: boolean;
  /** Show critical path highlighting on Gantt chart */
  ganttShowCriticalPath: boolean;
  /** Show project name header on Gantt chart */
  ganttShowProjectName: boolean;
  /** Show dependency arrows on Gantt chart */
  ganttShowArrows: boolean;
  /** ISO 3166-1 alpha-2 country code for holiday loader (default: "US") */
  defaultHolidayCountry?: string;
  /** Active work days: array of day indices (0=Sun, 1=Mon, ..., 6=Sat). Default: [1,2,3,4,5] (Mon–Fri) */
  workDays?: number[];
  /** Finish Target RAG: percentile at or above which the target is green (default 80) */
  targetFinishGreenPct?: number;
  /** Finish Target RAG: percentile at or above which the target is amber (default 50) */
  targetFinishAmberPct?: number;
}

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  defaultTrialCount: 10000,
  defaultDistributionType: "triangular",
  defaultConfidenceLevel: "mediumConfidence",
  defaultActivityTarget: 0.5,
  defaultProjectTarget: 0.95,
  dateFormat: "MM/DD/YYYY",
  autoRunSimulation: false,
  theme: "system",
  storeFullSimulationData: false, // Save storage by default
  defaultHeuristicEnabled: false,
  defaultHeuristicMinPercent: 75,
  defaultHeuristicMaxPercent: 200,
  defaultDependencyMode: false,
  defaultParkinsonsLawEnabled: true,
  ganttViewMode: "deterministic",
  ganttShowToday: true,
  ganttShowCriticalPath: true,
  ganttShowProjectName: false,
  ganttShowArrows: true,
  workDays: [1, 2, 3, 4, 5], // Mon–Fri
};

// -- Weekday Labels -----------------------------------------------------------

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

// -- RSM Descriptions (tooltips) ----------------------------------------------

export const RSM_DESCRIPTIONS: Record<RSMLevel, string> = {
  nearCertainty: "Very narrow range. Highly confident in estimates.",
  veryHighConfidence: "Narrow range with strong certainty.",
  highConfidence: "Reasonably tight range. Well-understood work.",
  mediumHighConfidence: "Moderate range with good understanding.",
  mediumConfidence: "Balanced range. Typical for familiar work.",
  mediumLowConfidence: "Wider range. Some unknowns present.",
  lowConfidence: "Broad range. Significant uncertainty.",
  veryLowConfidence: "Very broad range. Limited information.",
  extremelyLowConfidence: "Extremely wide range. Mostly unknown.",
  guesstimate: "Widest range. Barely an educated guess.",
};
