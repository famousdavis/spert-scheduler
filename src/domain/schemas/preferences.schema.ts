// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { z } from "zod";
import {
  RSM_LEVELS,
  DISTRIBUTION_TYPES,
  DATE_FORMATS,
  THEME_OPTIONS,
  GANTT_VIEW_MODES,
} from "../models/types";
import { CalendarSchema } from "./project.schema";

export const UserPreferencesSchema = z.object({
  defaultTrialCount: z.number().int().min(1000).max(50000),
  defaultDistributionType: z.enum(DISTRIBUTION_TYPES),
  defaultConfidenceLevel: z.enum(RSM_LEVELS),
  defaultActivityTarget: z.number().min(0.01).max(0.99),
  defaultProjectTarget: z.number().min(0.01).max(0.99),
  dateFormat: z.preprocess(
    (v) => (v === "YYYY-MM-DD" ? "YYYY/MM/DD" : v),
    z.enum(DATE_FORMATS)
  ),
  autoRunSimulation: z.boolean(),
  theme: z.enum(THEME_OPTIONS).optional(),
  storeFullSimulationData: z.boolean().optional(),
  defaultHeuristicEnabled: z.boolean().optional(),
  defaultHeuristicMinPercent: z.number().int().min(1).max(99).optional(),
  defaultHeuristicMaxPercent: z.number().int().min(101).max(1000).optional(),
  defaultDependencyMode: z.boolean().optional(),
  globalCalendar: CalendarSchema.optional(),
  ganttViewMode: z.enum(GANTT_VIEW_MODES).optional(),
  ganttShowToday: z.boolean().optional(),
  ganttShowCriticalPath: z.boolean().optional(),
  ganttShowProjectName: z.boolean().optional(),
  defaultHolidayCountry: z.string().min(2).max(10).optional(),
  workDays: z.array(z.number().int().min(0).max(6)).min(1).max(7).optional(),
});
