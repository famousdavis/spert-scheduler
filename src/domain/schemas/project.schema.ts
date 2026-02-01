import { z } from "zod";
import {
  RSM_LEVELS,
  DISTRIBUTION_TYPES,
  ACTIVITY_STATUSES,
} from "../models/types";

// -- Primitive Schemas -------------------------------------------------------

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

const ISODateString = z.string().regex(isoDateRegex, "Must be YYYY-MM-DD");

// -- Calendar ----------------------------------------------------------------

export const CalendarSchema = z.object({
  holidays: z.array(ISODateString),
});

// -- Activity ----------------------------------------------------------------

export const ActivitySchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    min: z.number().nonnegative(),
    mostLikely: z.number().nonnegative(),
    max: z.number().nonnegative(),
    confidenceLevel: z.enum(RSM_LEVELS),
    sdOverride: z.number().positive().optional(),
    distributionType: z.enum(DISTRIBUTION_TYPES),
    status: z.enum(ACTIVITY_STATUSES),
    actualDuration: z.number().nonnegative().optional(),
  })
  .refine((a) => a.min <= a.mostLikely, {
    message: "Min must be <= Most Likely",
    path: ["min"],
  })
  .refine((a) => a.mostLikely <= a.max, {
    message: "Most Likely must be <= Max",
    path: ["mostLikely"],
  });

// -- Scenario Settings -------------------------------------------------------

export const ScenarioSettingsSchema = z.object({
  defaultConfidenceLevel: z.enum(RSM_LEVELS),
  defaultDistributionType: z.enum(DISTRIBUTION_TYPES),
  trialCount: z.number().int().min(1000).max(500000),
  rngSeed: z.string().min(1),
  probabilityTarget: z.number().min(0.01).max(0.99),
  projectProbabilityTarget: z.number().min(0.01).max(0.99),
});

// -- Histogram / CDF ---------------------------------------------------------

export const HistogramBinSchema = z.object({
  binStart: z.number(),
  binEnd: z.number(),
  count: z.number().int().nonnegative(),
});

export const CDFPointSchema = z.object({
  value: z.number(),
  probability: z.number().min(0).max(1),
});

// -- Simulation Run ----------------------------------------------------------

export const SimulationRunSchema = z.object({
  id: z.string().min(1),
  timestamp: z.string(),
  trialCount: z.number().int().positive(),
  seed: z.string().min(1),
  engineVersion: z.string().min(1),
  percentiles: z.record(z.coerce.number(), z.number()),
  histogramBins: z.array(HistogramBinSchema),
  mean: z.number(),
  standardDeviation: z.number().nonnegative(),
  minSample: z.number(),
  maxSample: z.number(),
  samples: z.array(z.number()),
});

// -- Scenario ----------------------------------------------------------------

export const ScenarioSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  startDate: ISODateString,
  activities: z.array(ActivitySchema),
  settings: ScenarioSettingsSchema,
  simulationResults: SimulationRunSchema.optional(),
});

// -- Project -----------------------------------------------------------------

export const ProjectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  createdAt: z.string(),
  schemaVersion: z.number().int().positive(),
  globalCalendarOverride: CalendarSchema.optional(),
  scenarios: z.array(ScenarioSchema),
});
