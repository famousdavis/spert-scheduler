// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Falsification spec for Compare's buffer-use rows (WI-125, v0.79.0).
//
// When a later scenario records progress the first does not — more activities In Progress or Complete, or more
// days in their Actual cells — Compare adds three rows after "Duration w/Buffer": Buffer used (days), the working
// days that column's End Date (no buffer) has moved past the first column's, counted on the project's work
// calendar (below 0 when days were recovered); Buffer left, the first column's Buffer (days) less used; and Buffer
// used (%), rounded. A note under the table names the first column and its buffer, or says why a cell is blank
// (a different Activity Target or Dependencies setting, validation errors, a schedule that cannot be calculated,
// no run); with the rows hidden because a later status update sits FIRST, it names the column to move. The rows
// and the note print with the comparison. Each straw below breaks one of those — often a plausible wrong metric
// — and names the tests that must go red.
//
// Each straw's set is EXACTLY the tests the prototype saw go red, each straw run alone, twice on two trees. The
// runner passes a straw when at least one named test fails, so read its "N failing; named-match M" line too:
// the set holds only when N and M both equal the count noted above `expectFailing`. Every title below occurs
// once among the three files' 40 tests, so `only()` matches each test at most once.
//
// Usage: node scripts/falsify.mjs scripts/falsify-spec-buffer-use.mjs
const MODEL = new URL("../src/ui/helpers/comparison-model.ts", import.meta.url).pathname;
const SCREEN = new URL("../src/ui/components/ScenarioComparison.tsx", import.meta.url).pathname;
const PRINT = new URL("../src/ui/components/print-sections.tsx", import.meta.url).pathname;

/** The tests' own titles, verbatim. */
const T = {
  late: "3 days late on the plan's path: used 3, left 10 − 3 = 7, 30 % — and the dates they are counted from",
  early: "finished early: used −2 (Thu 02-12 → Mon 02-16: Feb 12 13), left 12, −20 %",
  pastBuffer: "past the buffer: 14 late ends Mon 03-09 — used 14, left −4, 140 %",
  inProgressPast: "an activity In Progress past its planned 10 days (12 elapsed) is scheduled at 13: used 3",
  notDifference: "is NOT the difference of the two buffers: no slip, a smaller own buffer, still 0 used",
  movedStart: "a Start Date moved later counts: 5 working days later, nothing slipped — used 5 (Feb 16 18 19 20 23)",
  float: "a slip inside an activity's float moves nothing (Dependencies on); past it, only the excess counts",
  sumIsBuffer: "used + left is the first column's displayed Buffer (days), in every column",
  halfDay: "at the half-day boundary: P95 40.5 rounds BOTH the Buffer (+11) and the w/buffer date (position 41, Wed 03-04)",
  percent: "the percent is rounded to the nearest whole number: 7 of 11 is 63.6, shown 64%",
  rowsPlace: "three rows, right after \"Duration w/Buffer\" and before \"Activity Target\"",
  alternative: "an alternative plan (estimates changed, no progress): no rows, no note — control: a status update shows them",
  threeColumns: "three columns, an alternative and a status update: the alternative's cells blank, and why",
  elapsed: "more elapsed days on the same In Progress activity is progress: the rows show (used 0)",
  started: "one more activity started, with no days entered, is progress too",
  sameProgress: "the same progress in both (a re-plan of the status update): no rows, no note",
  hintTwo: "names the column to move",
  hintThree: "with three, names the one recording the LEAST progress — the likeliest baseline",
  firstNotRun: "the first column not run: used still counts; left and % need its buffer",
  laterNotRun: "a later column not run needs no run: all three show",
  firstNoBuffer: "the first column's Buffer (days) at 0, or below 0: used only, and why",
  activityTarget: "a later column at another Activity Target: blank, and how to fix it",
  dependencies: "Dependencies on in one and off in the other: blank, and how to fix it",
  projectParkinson: "the Project Target or Parkinson's Law differing needs no reason: the numbers stand",
  flaggedLater: "a flagged later column (Min above Most Likely, which still schedules): blank, and fix it first",
  flaggedFirst: "a flagged FIRST column: every cell blank, and fix it first",
  cycleLater: "a later column whose schedule fails on a dependency cycle: blank, and why",
  firstFails: "a FIRST column whose schedule fails, or that has no activities: every cell blank, and why",
  screenRows: "renders the three rows after \"Duration w/Buffer\", with each column's cells",
  screenNote: "puts the note first under the table, in grey, inside the captured region with no dark: variant",
  screenLongName: "names a long first column in the note, never in a label — the labels keep their width",
  screenAlternative: "an alternative plan with no progress: no rows and no note — control: the status update above shows both",
  screenHint: "the later status update first: no rows, and the note says which tab to drag",
  printRows: "prints the three rows after \"Duration w/Buffer\" with the screen's strings",
  printNote: "prints the note right under the table, before the other notes, and the closing line stays last",
  printHint: "prints the hint when the later status update sits first, and no buffer row",
};

/** A regex naming exactly these tests: each title, at the end of the runner's "file > describe > title". */
function only(...names) {
  return new RegExp(names.map((n) => `> ${T[n].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`).join("|"));
}

// The three test files, and no others: comparison-model, ScenarioComparison and print-comparison.
export const testFile = "buffer-use.test";
export const mutations = [
  {
    id: "S1  used counted on the plain Mon–Fri week, not the project's calendar",
    file: MODEL,
    find: "if (toISO >= fromISO) return countWorkingDays(parseDateISO(fromISO), parseDateISO(toISO), calendar);",
    replace: "if (toISO >= fromISO) return countWorkingDays(parseDateISO(fromISO), parseDateISO(toISO));",
    // 13 red
    expectFailing: only("late", "pastBuffer", "inProgressPast", "movedStart", "float", "halfDay", "percent", "alternative", "threeColumns", "firstNotRun", "laterNotRun", "firstNoBuffer", "projectParkinson"),
  },
  {
    id: "S2  used = the difference of the two scenarios' own buffers (the metric Orch-28 warned against)",
    file: MODEL,
    find: "return bufferCellsOf(workingDaysFrom(ref.endDate, e.schedule!.projectEndDate, calendar), ref.buffer);",
    replace: "return bufferCellsOf((ref.buffer ?? 0) - (e.buffer?.bufferDays ?? 0), ref.buffer);",
    // 19 red
    expectFailing: only("late", "early", "pastBuffer", "inProgressPast", "notDifference", "movedStart", "float", "halfDay", "percent", "alternative", "threeColumns", "elapsed", "started", "firstNotRun", "laterNotRun", "firstNoBuffer", "projectParkinson", "screenRows", "printRows"),
  },
  {
    id: "S3  used = the spans' difference (ignores a moved Start Date)",
    file: MODEL,
    find: "return bufferCellsOf(workingDaysFrom(ref.endDate, e.schedule!.projectEndDate, calendar), ref.buffer);",
    replace: "return bufferCellsOf(e.schedule!.spanDays - first.schedule!.spanDays, ref.buffer);",
    // 1 red
    expectFailing: only("movedStart"),
  },
  {
    id: "S4  a recovery (earlier finish) counted as a positive number",
    file: MODEL,
    find: "return -countWorkingDays(parseDateISO(toISO), parseDateISO(fromISO), calendar);",
    replace: "return countWorkingDays(parseDateISO(toISO), parseDateISO(fromISO), calendar);",
    // 1 red
    expectFailing: only("early"),
  },
  {
    id: "S5  left = the whole buffer, not the buffer less used",
    file: MODEL,
    find: "left: String(buffer - used)",
    replace: "left: String(buffer)",
    // 15 red
    expectFailing: only("late", "early", "pastBuffer", "inProgressPast", "movedStart", "float", "sumIsBuffer", "halfDay", "percent", "alternative", "threeColumns", "laterNotRun", "projectParkinson", "screenRows", "printRows"),
  },
  {
    id: "S6  the percent floored, not rounded",
    file: MODEL,
    find: "pct: `${Math.round((used / buffer) * 100)}%`",
    replace: "pct: `${Math.floor((used / buffer) * 100)}%`",
    // 1 red
    expectFailing: only("percent"),
  },
  {
    id: "S7  the rows for ANY two columns (rule 'always')",
    file: MODEL,
    find: "if (!later.some((e) => recordsProgressBeyond(e.scenario, first.scenario))) {",
    replace: "if (later.length < 1) {",
    // 7 red
    expectFailing: only("alternative", "sameProgress", "hintTwo", "hintThree", "screenAlternative", "screenHint", "printHint"),
  },
  {
    id: "S8  progress = activities started only (misses an elapsed-only update)",
    file: MODEL,
    find: "return l.started > f.started || l.days > f.days;",
    replace: "return l.started > f.started;",
    // 1 red
    expectFailing: only("elapsed"),
  },
  {
    id: "S9  progress = days entered only (misses a start with no days)",
    file: MODEL,
    find: "return l.started > f.started || l.days > f.days;",
    replace: "return l.days > f.days;",
    // 1 red
    expectFailing: only("started"),
  },
  {
    id: "S10 no reason for a different Activity Target",
    file: MODEL,
    find: "if (targetOf(l) !== targetOf(f)) {",
    replace: "if (targetOf(l) !== targetOf(l)) {",
    // 1 red
    expectFailing: only("activityTarget"),
  },
  {
    id: "S11 no reason for a different Dependencies setting",
    file: MODEL,
    find: "if (l.settings.dependencyMode !== f.settings.dependencyMode) {",
    replace: "if (l.settings.dependencyMode !== l.settings.dependencyMode) {",
    // 1 red
    expectFailing: only("dependencies"),
  },
  {
    id: "S12 a flagged later column counted",
    file: MODEL,
    find: "if (later.flags.rows.length > 0) return",
    replace: "if (later.flags.rows.length > 99) return",
    // 1 red
    expectFailing: only("flaggedLater"),
  },
  {
    id: "S13 a flagged first column used as the reference",
    file: MODEL,
    find: "if (first.flags.rows.length > 0) {",
    replace: "if (first.flags.rows.length > 99) {",
    // 1 red
    expectFailing: only("flaggedFirst"),
  },
  {
    id: "S14 the rows dropped from the table",
    file: MODEL,
    find: "    ...bufferRows,\n",
    replace: "",
    // 27 red
    expectFailing: only("late", "early", "pastBuffer", "inProgressPast", "notDifference", "movedStart", "float", "sumIsBuffer", "halfDay", "percent", "rowsPlace", "alternative", "threeColumns", "elapsed", "started", "firstNotRun", "laterNotRun", "firstNoBuffer", "activityTarget", "dependencies", "projectParkinson", "flaggedLater", "flaggedFirst", "cycleLater", "firstFails", "screenRows", "printRows"),
  },
  {
    id: "S15 the note not rendered on screen",
    file: SCREEN,
    find: "{model.bufferNote && (",
    replace: "{false && (",
    // 3 red
    expectFailing: only("screenNote", "screenLongName", "screenHint"),
  },
  {
    id: "S16 the note not printed",
    file: PRINT,
    find: "{model.bufferNote && <p",
    replace: "{false && <p",
    // 2 red
    expectFailing: only("printNote", "printHint"),
  },
  {
    id: "S17 the first column's own cells blank (the dash alternative)",
    file: MODEL,
    find: "if (i === 0) return bufferCellsOf(0, ref.buffer);",
    replace: "if (i === 0) return NO_CELLS;",
    // 8 red
    expectFailing: only("late", "float", "sumIsBuffer", "threeColumns", "firstNotRun", "firstNoBuffer", "screenRows", "printRows"),
  },
  {
    id: "S18 the hint names the first later column, not the least-progress one",
    file: MODEL,
    find: "const b = leastProgress(behind).scenario.name;",
    replace: "const b = behind[0]!.scenario.name;",
    // 1 red
    expectFailing: only("hintThree"),
  },
  {
    id: "S19 no hint when the later status update sits first",
    file: MODEL,
    find: "return { rows: [], note: reorderHint(first, later) };",
    replace: "return { rows: [], note: null };",
    // 4 red
    expectFailing: only("hintTwo", "hintThree", "screenHint", "printHint"),
  },
  {
    id: "S20 a differing Project Target treated as a reason",
    file: MODEL,
    find: "if (targetOf(l) !== targetOf(f)) {",
    replace: "if (targetOf(l) !== targetOf(f) || l.settings.projectProbabilityTarget !== f.settings.projectProbabilityTarget) {",
    // 1 red
    expectFailing: only("projectParkinson"),
  },
];
