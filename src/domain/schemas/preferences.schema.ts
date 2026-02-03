import { z } from "zod";
import {
  RSM_LEVELS,
  DISTRIBUTION_TYPES,
  DATE_FORMATS,
  THEME_OPTIONS,
} from "../models/types";

export const UserPreferencesSchema = z.object({
  defaultTrialCount: z.number().int().min(1000).max(500000),
  defaultDistributionType: z.enum(DISTRIBUTION_TYPES),
  defaultConfidenceLevel: z.enum(RSM_LEVELS),
  defaultActivityTarget: z.number().min(0.01).max(0.99),
  defaultProjectTarget: z.number().min(0.01).max(0.99),
  dateFormat: z.enum(DATE_FORMATS),
  autoRunSimulation: z.boolean(),
  theme: z.enum(THEME_OPTIONS).optional(), // Optional for backward compatibility
});
