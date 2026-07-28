// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

/**
 * Sample project assembly.
 *
 * Turns the canonical "Cloud ERP Solution" fixture in `@domain/data/sample-project`
 * into a ready-to-store `Project`: a start date anchored to the load date, a work
 * calendar covering the schedule's span, and freshly minted ids throughout.
 *
 * The holiday calculation lives here rather than in the fixture because
 * `getUSHolidays` is in `/core` and `/domain` must never import upward.
 */

import type { Holiday, Project } from "@domain/models/types";
import { cloneProject } from "@app/api/project-service";
import { getUSHolidays } from "@core/calendar/us-holidays";

/**
 * Calendar days of holiday coverage to generate from the start date. The sample's
 * deterministic span is ~294 working days (~14 months); 550 leaves headroom for
 * the P95 tail so the far end of the schedule is still holiday-aware.
 */
const HOLIDAY_COVERAGE_DAYS = 550;

function toISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * The next Monday on or after `from`. A sample schedule reads better starting on
 * a week boundary than mid-week, and Monday is a working day under the default
 * Mon-Fri work week, so the first activity never begins on a skipped day.
 */
export function nextMondayISO(from: Date): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const day = d.getDay(); // 0=Sun … 6=Sat
  d.setDate(d.getDate() + (day === 1 ? 0 : (8 - day) % 7));
  return toISO(d);
}

/**
 * US business holidays spanning the sample's schedule, as project-level holidays.
 *
 * Marked `source: "manual"` rather than `"api"` because they are computed locally
 * by `getUSHolidays`, not fetched from the Nager service — and manual holidays stay
 * freely editable, which is what you want in a sample somebody is about to poke at.
 */
function sampleHolidays(startISO: string): Holiday[] {
  const start = new Date(`${startISO}T00:00:00`);
  const end = new Date(start.getTime() + HOLIDAY_COVERAGE_DAYS * 86_400_000);

  const holidays: Holiday[] = [];
  for (let year = start.getFullYear(); year <= end.getFullYear(); year++) {
    for (const h of getUSHolidays(year)) {
      holidays.push({
        id: `sample-us-${h.date}`,
        name: h.name,
        startDate: h.date,
        endDate: h.date,
        source: "manual",
        countryCodes: ["US"],
      });
    }
  }
  return holidays;
}

/**
 * Build a loadable copy of the sample project.
 *
 * Every call returns fresh ids: the canonical fixture is passed through
 * `cloneProject`, which mints a new project id, re-mints every activity,
 * checklist, deliverable, milestone, band and scenario id, remaps all
 * cross-references, and stamps the current `SCHEMA_VERSION`. Loading the sample
 * twice therefore produces two fully independent projects.
 *
 * `owner` is deliberately left null — the store action sets it per storage mode
 * (Lesson 38), exactly as it does for `addProject` and `cloneProject`.
 *
 * The fixture module is imported dynamically — it is ~65 KB of activity content
 * that most sessions never touch, so it is kept out of the main bundle (same
 * treatment as ExcelJS in the schedule export). Callers that only need the
 * sample's *name* should import `@domain/data/sample-project-meta`, which is
 * static and data-free.
 *
 * @param name - Project name to use (callers resolve collisions first).
 * @param startDate - Optional ISO `YYYY-MM-DD` scenario start. Defaults to the
 *   next Monday, so the sample always reads as a current, forward-looking plan.
 */
export async function buildSampleProject(
  name: string,
  startDate?: string
): Promise<Project> {
  const { createSampleProject } = await import("@domain/data/sample-project");
  const start = startDate ?? nextMondayISO(new Date());
  return cloneProject(createSampleProject(start, sampleHolidays(start)), name);
}
