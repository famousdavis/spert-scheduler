// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * The label shown for an entity whose name is blank.
 *
 * Matches the vocabulary already in the codebase — `(unnamed section)` for bands
 * (GanttChart.tsx, PrintGanttChart.tsx) and `(unnamed)` in ValidationSummary.
 */
export const UNNAMED_LABEL = "(unnamed)";

/**
 * Display-time substitution for a blank name. **Never write the result back.**
 *
 * An activity may legitimately hold `name: ""` — `+ Add Activity` and both insert
 * strips persist an empty name so the grid's native `placeholder` can render, and
 * `ActivitySchema` allows it so that one unnamed row cannot make a whole project
 * fail to load. This turns that empty name into something a person can read, at
 * the point it is rendered, without ever storing a value.
 *
 * ⚠️ Keyed on `trim()`, not `=== ""`. A whitespace-only name is "unnamed" to a
 * person but "named" to the code: it passes the schema, and the grid and the AI
 * both store it verbatim.
 *
 * ⚠️ **Do NOT apply this at a write site.** Two in particular:
 *   - JSON export (`export-import-service.ts`) must carry the raw name, or a
 *     round-trip turns the placeholder into a real stored name.
 *   - The AI snapshot (`ai-snapshot-service.ts`) must show the raw name, or an
 *     agent cannot tell an unnamed activity from one named `(unnamed)` — and
 *     renaming a blank activity is the thing it is most likely to be asked to do.
 *
 * Reused for milestone names; see WI-22.
 */
export function nameOrUnnamed(name: string | undefined): string {
  return name && name.trim() !== "" ? name : UNNAMED_LABEL;
}
