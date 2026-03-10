// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

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
