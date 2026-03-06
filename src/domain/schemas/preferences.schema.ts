import { z } from "zod";
import {
  RSM_LEVELS,
  DISTRIBUTION_TYPES,
  DATE_FORMATS,
  THEME_OPTIONS,
} from "../models/types";

export const UserPreferencesSchema = z.object({
  defaultTrialCount: z.number().int().min(1000).max(50000),
  defaultDistributionType: z.enum(DISTRIBUTION_TYPES),
  defaultConfidenceLevel: z.enum(RSM_LEVELS),
  defaultActivityTarget: z.number().min(0.01).max(0.99),
  defaultProjectTarget: z.number().min(0.01).max(0.99),
  dateFormat: z.enum(DATE_FORMATS),
  autoRunSimulation: z.boolean(),
  theme: z.enum(THEME_OPTIONS).optional(), // Optional for backward compatibility
  storeFullSimulationData: z.boolean().optional(), // Optional for backward compatibility
  defaultHeuristicEnabled: z.boolean().optional(),
  defaultHeuristicMinPercent: z.number().int().min(1).max(99).optional(),
  defaultHeuristicMaxPercent: z.number().int().min(101).max(1000).optional(),
  defaultDependencyMode: z.boolean().optional(),
});
