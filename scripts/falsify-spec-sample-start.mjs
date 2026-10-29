// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Falsification spec for the sample project's default start (v0.79.29, WI-106).
//
// With no start date passed, the sample starts on the first Monday on or after the load date
// that is not one of its own US holidays — a holiday Monday moves it a whole week, to the Monday
// after. An explicit start date is used exactly as given. Each straw below names EXACTLY the
// tests it must fail, and no others — read "K failing; named-match K", not merely a non-zero
// exit: the runner prints ✔ when ANY named test fails. Each expected set was observed with the
// straw run ALONE against the whole suite, then written here.
//
// testFile is all of src/, so one run reaches every test that loads the sample.
const SERVICE = new URL("../src/app/api/sample-project-service.ts", import.meta.url).pathname;

// sample-project-service.test.ts — "sampleStartISO — the default start skips the sample's own holidays".
const T1 = "in the week of 2026-10-05, it skips Columbus Day (2026-10-12) to 2026-10-19";
const T2 = "from Columbus Day itself (2026-10-12, a Monday holiday), it starts on 2026-10-19";
const T4 =
  "a fixed-date holiday on a Monday moves it too: Independence Day 2033 (2033-07-04) to 2033-07-11";
const T4B =
  "Christmas Day 2028 and New Year's Day 2029, both Mondays, move it two weeks, to 2029-01-08";
// sample-project-service.test.ts — "buildSampleProject — the start date (WI-106)".
const T6 = "with no startDate, a load on 2026-10-07 starts on 2026-10-19, not Columbus Day";

const escape = (s) => s.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

/** Matches exactly these test titles, as the verbose reporter prints them. */
const only = (...titles) => new RegExp(`> (?:${titles.map(escape).join("|")})$`);

export const testFile = "src/";
export const mutations = [
  {
    // Every holiday Monday is kept, as before v0.79.29. The ordinary week (T3) and the explicit
    // start (T5) hold: neither meets a holiday Monday through the default.
    id: "S1  the holiday check removed  [expect 5: T1, T2, T4, T4B, T6]",
    file: SERVICE,
    find: "  while (sampleHolidays(start).some((h) => h.startDate === start)) {\n",
    replace: "  while (false) {\n",
    expectFailing: only(T1, T2, T4, T4B, T6),
  },
  {
    // A one-day skip lands on the Tuesday after the holiday — no holiday, so it stops there,
    // off the week boundary.
    id: "S2  the skip made +1 day instead of +7  [expect 5: T1, T2, T4, T4B, T6]",
    file: SERVICE,
    find: "    d.setDate(d.getDate() + 7);\n",
    replace: "    d.setDate(d.getDate() + 1);\n",
    expectFailing: only(T1, T2, T4, T4B, T6),
  },
  {
    // The helper is right but unused: only the test that loads the sample with no start date
    // under a holiday week can see it.
    id: "S3  the default bypassing the helper  [expect 1: T6]",
    file: SERVICE,
    find: "  const start = startDate ?? sampleStartISO(new Date());\n",
    replace: "  const start = startDate ?? nextMondayISO(new Date());\n",
    expectFailing: only(T6),
  },
];
