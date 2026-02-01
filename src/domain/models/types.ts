// ============================================================================
// SPERT Scheduler v1.0 — Domain Types and Constants
// ============================================================================

// -- Version Constants -------------------------------------------------------

/** Informational. Recorded in SimulationRun for auditability. */
export const ENGINE_VERSION = "1.0.0";

/** Operational. Drives persistence migration system. */
export const SCHEMA_VERSION = 3;

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
}

export interface Calendar {
  holidays: Holiday[];
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
}

export interface ScenarioSettings {
  defaultConfidenceLevel: RSMLevel;
  defaultDistributionType: DistributionType;
  trialCount: number; // 1,000 - 500,000 (default 50,000)
  rngSeed: string; // auto-generated, user-editable
  probabilityTarget: number; // Activity-level (deterministic schedule), 0.01 - 0.99 (default 0.50)
  projectProbabilityTarget: number; // Project-level (MC percentile lookup), 0.01 - 0.99 (default 0.95)
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
}

export interface Scenario {
  id: string;
  name: string;
  startDate: string; // "YYYY-MM-DD"
  activities: Activity[];
  settings: ScenarioSettings;
  simulationResults?: SimulationRun;
}

export interface Project {
  id: string;
  name: string;
  createdAt: string; // ISO 8601
  schemaVersion: number;
  globalCalendarOverride?: Calendar;
  scenarios: Scenario[];
}

// -- Schedule Output Types ---------------------------------------------------

export interface ScheduledActivity {
  activityId: string;
  name: string;
  duration: number; // working days
  startDate: string; // "YYYY-MM-DD"
  endDate: string; // "YYYY-MM-DD"
  isActual: boolean; // true if from actualDuration
}

export interface DeterministicSchedule {
  activities: ScheduledActivity[];
  totalDurationDays: number;
  projectEndDate: string; // "YYYY-MM-DD"
}

// -- Defaults ----------------------------------------------------------------

export const DEFAULT_SCENARIO_SETTINGS: ScenarioSettings = {
  defaultConfidenceLevel: "mediumConfidence",
  defaultDistributionType: "normal",
  trialCount: 50000,
  rngSeed: "placeholder", // overridden at createScenario() time
  probabilityTarget: 0.5, // P50 per-activity (deterministic schedule)
  projectProbabilityTarget: 0.95, // P95 project-level (MC confidence)
};

export const STANDARD_PERCENTILES = [5, 10, 25, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 96, 97, 98, 99] as const;

export const BASELINE_SCENARIO_NAME = "Baseline";

// -- Date Format Preference ---------------------------------------------------

export const DATE_FORMATS = ["MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD"] as const;

export type DateFormatPreference = (typeof DATE_FORMATS)[number];

// -- User Preferences ---------------------------------------------------------

export interface UserPreferences {
  defaultTrialCount: number;
  defaultDistributionType: DistributionType;
  defaultConfidenceLevel: RSMLevel;
  defaultActivityTarget: number;
  defaultProjectTarget: number;
  dateFormat: DateFormatPreference;
  autoRunSimulation: boolean;
}

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  defaultTrialCount: 50000,
  defaultDistributionType: "normal",
  defaultConfidenceLevel: "mediumConfidence",
  defaultActivityTarget: 0.5,
  defaultProjectTarget: 0.95,
  dateFormat: "MM/DD/YYYY",
  autoRunSimulation: false,
};

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
