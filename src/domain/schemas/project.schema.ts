// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { z } from "zod";
import {
  RSM_LEVELS,
  DISTRIBUTION_TYPES,
  ACTIVITY_STATUSES,
  DEPENDENCY_TYPES,
  CONSTRAINT_TYPES,
  CONSTRAINT_MODES,
} from "../models/types";

// -- Primitive Schemas -------------------------------------------------------

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

const ISODateString = z
  .string()
  .regex(isoDateRegex, "Must be YYYY-MM-DD")
  .refine((s) => {
    const [y, m, d] = s.split("-").map(Number);
    const date = new Date(y!, m! - 1, d!);
    return date.getFullYear() === y && date.getMonth() === m! - 1 && date.getDate() === d;
  }, "Must be a valid calendar date");

// -- Calendar ----------------------------------------------------------------

export const HolidaySchema = z
  .object({
    id: z.string().min(1).max(64),
    name: z.string().max(200), // allow empty for migrated data
    startDate: ISODateString,
    endDate: ISODateString,
    source: z.enum(["manual", "api"]).optional(),
    countryCodes: z.array(z.string().min(2).max(10)).max(200).optional(),
    locale: z.string().max(100).optional(),
  })
  .refine((h) => h.endDate >= h.startDate, {
    message: "End date must be >= start date",
    path: ["endDate"],
  })
  .refine(
    (h) => {
      if (h.startDate === h.endDate) return true;
      const [sy, sm, sd] = h.startDate.split("-").map(Number);
      const [ey, em, ed] = h.endDate.split("-").map(Number);
      const start = new Date(sy!, sm! - 1, sd!);
      const end = new Date(ey!, em! - 1, ed!);
      const diffMs = end.getTime() - start.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
      return diffDays <= 366;
    },
    {
      message:
        "Holiday ranges cannot exceed one year. Please split into multiple entries.",
      path: ["endDate"],
    }
  );

export const CalendarSchema = z.object({
  holidays: z.array(HolidaySchema).max(1000),
});

// -- Activity ----------------------------------------------------------------

export const ActivitySchema = z
  .object({
    id: z.string().min(1).max(64),
    name: z.string().min(1).max(200),
    min: z.number().nonnegative(),
    mostLikely: z.number().nonnegative(),
    max: z.number().nonnegative(),
    confidenceLevel: z.enum(RSM_LEVELS),
    sdOverride: z.number().positive().optional(),
    distributionType: z.enum(DISTRIBUTION_TYPES),
    status: z.enum(ACTIVITY_STATUSES),
    actualDuration: z.number().nonnegative().optional(),
    milestoneId: z.string().max(64).optional(),
    startsAtMilestoneId: z.string().max(64).optional(),
    constraintType: z.enum(CONSTRAINT_TYPES).nullable().optional(),
    constraintDate: ISODateString.nullable().optional(),
    constraintMode: z.enum(CONSTRAINT_MODES).nullable().optional(),
    constraintNote: z.string().max(500).nullable().optional(),
  })
  .refine((a) => a.min <= a.mostLikely, {
    message: "Min must be <= Most Likely",
    path: ["min"],
  })
  .refine((a) => a.mostLikely <= a.max, {
    message: "Most Likely must be <= Max",
    path: ["mostLikely"],
  })
  .superRefine((a, ctx) => {
    const hasType = a.constraintType != null;
    const hasDate = a.constraintDate != null;
    const hasMode = a.constraintMode != null;
    if (hasType !== hasDate || hasType !== hasMode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Constraint fields must be all set or all null: constraintType, constraintDate, and constraintMode",
        path: ["constraintType"],
      });
    }
  });

// -- Activity Dependency -----------------------------------------------------

export const ActivityDependencySchema = z.object({
  fromActivityId: z.string().min(1).max(64),
  toActivityId: z.string().min(1).max(64),
  type: z.enum(DEPENDENCY_TYPES),
  lagDays: z.number().int().min(-365).max(365),
});

// -- Milestone ---------------------------------------------------------------

export const MilestoneSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  targetDate: ISODateString,
});

// -- Scenario Settings -------------------------------------------------------

export const ScenarioSettingsSchema = z.object({
  defaultConfidenceLevel: z.enum(RSM_LEVELS),
  defaultDistributionType: z.enum(DISTRIBUTION_TYPES),
  trialCount: z.number().int().min(1000).max(50000),
  rngSeed: z.string().min(1).max(100),
  probabilityTarget: z.number().min(0.01).max(0.99),
  projectProbabilityTarget: z.number().min(0.01).max(0.99),
  heuristicEnabled: z.boolean().optional(),
  heuristicMinPercent: z.number().int().min(1).max(99).optional(),
  heuristicMaxPercent: z.number().int().min(101).max(1000).optional(),
  dependencyMode: z.boolean().optional(),
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
  id: z.string().min(1).max(64),
  timestamp: z.string().max(64),
  trialCount: z.number().int().positive(),
  seed: z.string().min(1).max(100),
  engineVersion: z.string().min(1).max(20),
  percentiles: z.record(z.coerce.number(), z.number()),
  histogramBins: z.array(HistogramBinSchema).max(1000),
  mean: z.number(),
  standardDeviation: z.number().nonnegative(),
  minSample: z.number(),
  maxSample: z.number(),
  samples: z.array(z.number()).max(100000),
  milestoneResults: z.record(z.string(), z.object({
    percentiles: z.record(z.coerce.number(), z.number()),
    mean: z.number(),
    standardDeviation: z.number().nonnegative(),
  })).optional(),
});

// -- Scenario ----------------------------------------------------------------

export const ScenarioSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  startDate: ISODateString,
  activities: z.array(ActivitySchema).max(500),
  dependencies: z.array(ActivityDependencySchema).max(2000),
  milestones: z.array(MilestoneSchema).max(100),
  settings: ScenarioSettingsSchema,
  simulationResults: SimulationRunSchema.optional(),
  locked: z.boolean().optional(), // default false
});

// -- Project -----------------------------------------------------------------

export const ProjectSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  createdAt: z.string().max(64),
  schemaVersion: z.number().int().positive(),
  globalCalendarOverride: CalendarSchema.optional(),
  convertedWorkDays: z.array(ISODateString).max(500).optional(),
  scenarios: z.array(ScenarioSchema).max(20),
  archived: z.boolean().optional(),
});
