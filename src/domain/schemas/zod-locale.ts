// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * Installs Zod's English validation messages. Imported for its side effect, FIRST, by
 * `src/main.tsx`; the call configures the library globally, before any message is produced.
 *
 * Zod installs this locale itself, with a top-level `config(en())` in its own entry module —
 * but zod declares `"sideEffects": false`, so the production bundler drops that call, and in
 * production every default message read "Invalid input" (a too-long activity name, for one)
 * where the dev server and vitest read "Too big: expected string to have <=200 characters".
 * A call in OUR module is kept. Messages written in the schemas themselves were never affected.
 * (2026-10-04.)
 */
import { z } from "zod";

z.config(z.locales.en());
