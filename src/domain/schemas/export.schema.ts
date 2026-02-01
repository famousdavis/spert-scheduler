import { z } from "zod";
import { ProjectSchema } from "./project.schema";

/**
 * Zod schema for the SPERT Scheduler export envelope.
 *
 * The `format` field is a magic discriminator that lets us distinguish
 * our own export files from arbitrary JSON on import.
 */
export const SpertExportSchema = z.object({
  format: z.literal("spert-scheduler-export"),
  appVersion: z.string().min(1),
  exportedAt: z.string(),
  schemaVersion: z.number().int().positive(),
  projects: z.array(ProjectSchema).min(1),
});

export type SpertExportEnvelope = z.infer<typeof SpertExportSchema>;
