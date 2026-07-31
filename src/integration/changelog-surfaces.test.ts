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
 *     authoritative, complete history, back to 0.1.0.
 *   - `CHANGELOG.md` — the record in the repository.
 *   - `public/CHANGELOG.md` — served at /CHANGELOG.md on the deployed site.
 *
 * The public copy is guarded separately, and deliberately so, in
 * `changelog-public-sync.test.ts` — that file documents the drift that prompted
 * it (43 releases behind, five months stale). This test covers the other pair,
 * which nothing had ever checked.
 *
 * The first two now hold the same versions in the same order, and this is the
 * first point at which that has ever been true. The count is deliberately not
 * written down here — `parses a date out of every CHANGELOG.md entry` asserts
 * the two surfaces are the same length, so a number in this comment would only
 * be a second thing to keep current. `CHANGELOG.md` was missing
 * 33 versions the app had always rendered, scattered through the pre-0.17.0
 * history rather than forming a clean cutoff. Thirty — 0.15.1 down to 0.1.0,
 * one contiguous run reaching the oldest entry in the data file — were appended
 * at the end of the file in v0.59.5. The last three interleaved rather than
 * appended, 0.16.4 and 0.16.3 beneath 0.17.0 and 0.16.1 between 0.16.2 and
 * 0.16.0, and went in in v0.59.6. KNOWN_MISSING_FROM_MARKDOWN is deliberately
 * kept at zero length rather than deleted; see the note on it below.
 *
 * Across the suite: SPERT AHP closed its single missing version in v0.18.16 and
 * MyScrumBudget reached zero in v0.34.6, transcribing 21. GanttApp is still
 * missing 17, recorded and ratcheted the same way.
 *
 * v0.57.1 used to be a 34th. It was not missing content — the entry's section
 * was sitting inside the v0.57.2 entry with no heading of its own, so the
 * release existed in the file but not as a release. Restored in v0.59.4.
 *
 * The second failure mode is an entry that renders as a bare heading: no
 * sections, or a section with no items. The data file is valid TypeScript
 * either way, so the build, types and lint all stay green. SPERT Forecaster
 * shipped two such entries and they were blank in-app for weeks.
 *
 * The third is a release date that was never filled in. v0.42.0 shipped as
 * `2026-05-XX` on 2026-05-07 and stayed that way, in all three surfaces, for
 * eighty-five days and eighty-two releases — visible on the changelog page the
 * whole time. `date` is typed `string`, so the placeholder type-checks, builds,
 * lints and renders exactly like a real date. v0.47.0 responded to that class of
 * defect by *documenting* a pre-merge grep scoped to the `date:` field; nothing
 * ran it, and it caught nothing. `RELEASE_DATES` below is the enforced version.
 */

/**
 * Versions present in `changelog-data.ts` but absent from `CHANGELOG.md`. Empty
 * as of 2026-07-31, and it should stay that way.
 *
 * This is kept at zero length on purpose rather than deleted, and the two tests
 * that read it are kept with it. Emptied, they assert something stronger than
 * they did while it had names in it: the "no NEW gap" test becomes a plain
 * every-version-is-in-both check with no exemptions, and the ratchet below it
 * becomes a guard against anyone reintroducing an exemption. Deleting the list
 * would mean deleting both, and the next release that forgot a changelog entry
 * would land unnoticed — which is the exact defect that took 33 versions to
 * accumulate here. Both directions were re-verified by mutation once the list
 * was emptied, not assumed.
 *
 * DO NOT add a name here to make a failing test pass. A name here means a
 * release was written into the app and never into the repository's changelog.
 * Write the entry instead; that is a two-minute job and this list is not.
 *
 * One trap, from closing MyScrumBudget's equivalent list: an entry whose
 * heading does not match `## X.Y.Z — YYYY-MM-DD` exactly is invisible to the
 * regex below, and while a version could sit on this list that failure was
 * SILENT — the entry in the file, uncounted, every assertion still passing.
 * With the list empty that hole is closed, because there is nothing left to
 * exempt a malformed entry from the "no NEW gap" check. (Note the heading
 * separator is an em dash, U+2014, not a hyphen.)
 */
const KNOWN_MISSING_FROM_MARKDOWN: string[] = [];

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
    // The list being permanently empty is the point, not an oversight: with no
    // exemptions available this filter is an identity and the assertion below
    // becomes an unconditional every-version-is-in-both check. See the note on
    // the declaration for why it is kept rather than deleted.
    // eslint-disable-next-line sonarjs/no-empty-collection
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
    // Reading an empty list is exactly what this guard is for now: it fails the
    // moment someone adds a name back, which is the only way the list can stop
    // being empty.
    // eslint-disable-next-line sonarjs/no-empty-collection
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

/**
 * A shape check is not enough here. `2026-05-XX` fails a `\d{4}-\d{2}-\d{2}`
 * match, but `2026-02-30` and `2026-13-01` both pass one and neither is a day
 * that exists — and a wrong-but-well-formed date is the harder defect to notice,
 * because nothing about it looks unfinished. So the value is round-tripped
 * through `Date`: parse it as UTC midnight and require the result to serialise
 * back to the same ten characters. JavaScript rolls overflow forward rather than
 * rejecting it, so 2026-02-30 comes back as 2026-03-02 and fails the comparison.
 * `T00:00:00Z` is not optional — a bare `new Date("2026-05-07")` is UTC but
 * `new Date("2026-5-7")` is local, and mixing the two makes the round-trip
 * timezone-dependent.
 */
const isRealCalendarDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

describe("changelog release dates", () => {
  const markdown = fs.readFileSync(path.resolve(process.cwd(), "CHANGELOG.md"), "utf-8");

  // `## X.Y.Z — YYYY-MM-DD`. The separator is an em dash (U+2014), matching
  // shipgate.config.json's headingPattern. Captures the rest of the line rather
  // than a date shape, so a malformed date is caught by the assertion below
  // instead of silently failing to match and disappearing from the check.
  //
  // Two notes on the shape, both from sonarjs/slow-regex rejecting earlier
  // versions of it. The padding is `[ \t]*` rather than `\s*` because `\s`
  // matches a newline, which under `m` lets the pattern run past the end of the
  // heading; a heading and its date are on one line by definition. And there is
  // no padding after the em dash, because `[ \t]*(.*)` is ambiguous — a space
  // could be matched by either side — which is exactly the super-linear
  // backtracking the rule looks for. The capture is trimmed below instead.
  const markdownDates = new Map(
    [...markdown.matchAll(/^## (\d+\.\d+\.\d+)[ \t]*—(.*)$/gm)].map((m) => [
      m[1] as string,
      (m[2] ?? "").trim(),
    ])
  );

  it("parses a date out of every CHANGELOG.md entry", () => {
    // Guards the regex itself: if the heading format ever drifts, the three
    // assertions below would pass vacuously over an empty or short map.
    const headingCount = [...markdown.matchAll(/^## \d+\.\d+\.\d+/gm)].length;

    expect(markdownDates.size).toBe(headingCount);
    expect(markdownDates.size).toBe(CHANGELOG.length);
  });

  it("gives every in-app entry a real calendar date", () => {
    const bad = CHANGELOG.filter((e) => !isRealCalendarDate(e.date)).map(
      (e) => `v${e.version} → "${e.date}"`
    );

    expect(
      bad,
      `these entries carry a date that is not a real YYYY-MM-DD day, so the ` +
        `changelog page renders it verbatim: ${bad.join("; ")}`
    ).toEqual([]);
  });

  it("gives every CHANGELOG.md entry a real calendar date", () => {
    const bad = [...markdownDates]
      .filter(([, date]) => !isRealCalendarDate(date))
      .map(([version, date]) => `v${version} → "${date}"`);

    expect(
      bad,
      `these CHANGELOG.md headings carry a date that is not a real YYYY-MM-DD ` +
        `day: ${bad.join("; ")}`
    ).toEqual([]);
  });

  it("agrees on the date of every version, in both surfaces", () => {
    const disagreements = CHANGELOG.filter(
      (e) => markdownDates.has(e.version) && markdownDates.get(e.version) !== e.date
    ).map((e) => `v${e.version}: app says "${e.date}", CHANGELOG.md says "${markdownDates.get(e.version)}"`);

    expect(
      disagreements,
      `the two surfaces date the same release differently: ${disagreements.join("; ")}`
    ).toEqual([]);
  });
});
