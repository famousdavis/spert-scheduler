// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { CHANGELOG } from "../ui/pages/changelog-data";

/**
 * The changelog lives in three places:
 *
 *   - `src/ui/pages/changelog-data.ts` — what ChangelogPage renders. This is the
 *     authoritative, complete history (215 entries, back to 0.1.0).
 *   - `CHANGELOG.md` — the record in the repository (182 entries).
 *   - `public/CHANGELOG.md` — served at /CHANGELOG.md on the deployed site.
 *
 * The public copy is guarded separately, and deliberately so, in
 * `changelog-public-sync.test.ts` — that file documents the drift that prompted
 * it (43 releases behind, five months stale). This test covers the other pair,
 * which nothing has ever checked.
 *
 * `CHANGELOG.md` is missing 33 versions the app has always rendered, scattered
 * through the pre-0.17.0 history rather than forming a clean cutoff: it has
 * 0.15.2, 0.15.3, 0.16.0, 0.16.2 and 0.17.0 but not 0.15.0, 0.15.1, 0.16.1,
 * 0.16.3 or 0.16.4. That backlog predates this guard and is recorded rather
 * than fixed, so no NEW gap can open while the decision to backfill stays open.
 * The same defect exists across the suite: SPERT AHP was missing one version,
 * GanttApp 17, MyScrumBudget 21.
 *
 * v0.57.1 used to be a 34th. It was not missing content — the entry's section
 * was sitting inside the v0.57.2 entry with no heading of its own, so the
 * release existed in the file but not as a release. Restored in v0.59.4.
 *
 * The second failure mode is an entry that renders as a bare heading: no
 * sections, or a section with no items. The data file is valid TypeScript
 * either way, so the build, types and lint all stay green. SPERT Forecaster
 * shipped two such entries and they were blank in-app for weeks.
 */

/**
 * Versions present in `changelog-data.ts` but absent from `CHANGELOG.md`, as
 * measured on 2026-07-30.
 *
 * DO NOT add to this list to make a failing test pass. A new name here means a
 * release was written into the app and never into the repository's changelog.
 * Removing a name after backfilling is the intended direction.
 */
const KNOWN_MISSING_FROM_MARKDOWN = [
  "0.16.4",
  "0.16.3",
  "0.16.1",
  "0.15.1",
  "0.15.0",
  "0.14.5",
  "0.14.4",
  "0.14.3",
  "0.14.2",
  "0.14.1",
  "0.14.0",
  "0.13.0",
  "0.12.3",
  "0.12.2",
  "0.12.1",
  "0.12.0",
  "0.11.2",
  "0.11.1",
  "0.11.0",
  "0.10.1",
  "0.10.0",
  "0.9.0",
  "0.8.0",
  "0.7.1",
  "0.7.0",
  "0.6.2",
  "0.6.1",
  "0.6.0",
  "0.5.0",
  "0.4.0",
  "0.3.0",
  "0.2.0",
  "0.1.0",
];

describe("CHANGELOG.md ↔ changelog-data.ts", () => {
  const markdown = fs.readFileSync(path.resolve(process.cwd(), "CHANGELOG.md"), "utf-8");

  const markdownVersions = [...markdown.matchAll(/^## (\d+\.\d+\.\d+)/gm)]
    .map((m) => m[1])
    .filter((v): v is string => v !== undefined);
  const dataVersions = CHANGELOG.map((e) => e.version);

  it("both surfaces carry entries", () => {
    expect(dataVersions.length).toBeGreaterThan(0);
    expect(markdownVersions.length).toBeGreaterThan(0);
  });

  it("every CHANGELOG.md entry also exists in the app", () => {
    const missing = markdownVersions.filter((v) => !dataVersions.includes(v));

    expect(
      missing,
      `these versions are in CHANGELOG.md but never render in the app: ${missing.join(", ")}`
    ).toEqual([]);
  });

  it("opens no NEW gap between the app and CHANGELOG.md", () => {
    const missing = dataVersions.filter((v) => !markdownVersions.includes(v));
    const unexpected = missing.filter((v) => !KNOWN_MISSING_FROM_MARKDOWN.includes(v));

    expect(
      unexpected,
      `these versions render in the app but were never written into CHANGELOG.md: ` +
        `${unexpected.join(", ")}. Add the entry to CHANGELOG.md — do not add it to ` +
        `KNOWN_MISSING_FROM_MARKDOWN.`
    ).toEqual([]);
  });

  it("keeps the recorded gap accurate as entries are backfilled", () => {
    // The ratchet: once a version is backfilled it must leave the list, so the
    // recorded debt stays honest and can only shrink.
    const stillMissing = new Set(dataVersions.filter((v) => !markdownVersions.includes(v)));
    const backfilled = KNOWN_MISSING_FROM_MARKDOWN.filter((v) => !stillMissing.has(v));

    expect(
      backfilled,
      `these versions are now in CHANGELOG.md — remove them from ` +
        `KNOWN_MISSING_FROM_MARKDOWN: ${backfilled.join(", ")}`
    ).toEqual([]);
  });

  it("agrees on the newest entry", () => {
    expect(dataVersions[0]).toBe(markdownVersions[0]);
  });

  it("gives every entry at least one section", () => {
    const empty = CHANGELOG.filter((e) => e.sections.length === 0).map((e) => e.version);

    expect(
      empty,
      `these versions render as a bare heading with no content: ${empty.join(", ")}`
    ).toEqual([]);
  });

  it("gives every section at least one item", () => {
    const empty = CHANGELOG.flatMap((e) =>
      e.sections.filter((s) => s.items.length === 0).map((s) => `v${e.version} → "${s.title}"`)
    );

    expect(
      empty,
      `these sections render as a heading with nothing beneath it: ${empty.join("; ")}`
    ).toEqual([]);
  });
});
