// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Falsification spec for the reforecast clone (WI-139).
//
// Clone Scenario's "Drop completed activities (reforecast)" gains a "Reforecast from" date — the copy's
// Start Date, by default the first working day after today by the page's calendar (owner, R608) — and
// carries each In Progress activity over as its remaining work: its estimates less the days in its Actual
// cell (Min never below 1, kept in order), still In Progress, its Actual emptied. With nothing in its
// Actual cell the estimates are carried over as they were (R608). The proposed name's date follows the
// Date Format setting (R608). Each straw below names EXACTLY the tests it must fail, and no others — read
// "K failing; named-match K", not merely a non-zero exit: the runner prints ✔ when ANY named test fails.
// Each set was predicted before the run and then written from what a run of that straw ALONE observed
// across the whole suite.
//
// testFile is all of src/, so one run reaches the service rows, the window rows, the page row and every
// existing test that clones a scenario.
const SERVICE = new URL("../src/app/api/project-service.ts", import.meta.url).pathname;
const DIALOG = new URL("../src/ui/components/CloneScenarioDialog.tsx", import.meta.url).pathname;
const PAGE = new URL("../src/ui/pages/ProjectPage.tsx", import.meta.url).pathname;

// project-service.test.ts — "cloneScenario — a reforecast carries In Progress work over as what remains (WI-139)".
const PA = "case A — 20–30–40 with 10 days done: 10–20–30, still In Progress, its Actual emptied";
const PB = "case B — 25 days done: 1–5–15, Min held at 1";
const PC = "case C — 35 days done: 1–1–5, Min held at 1 and Most Likely at Min";
const PE = "an empty Actual cell: nothing to take off, so 20–30–40 is carried over unchanged, still In Progress";
const P0 =
  "an Actual unset or 0: 0–2–5 stays 0–2–5 and an out-of-order 30–20–40 stays 30–20–40 — no clamp acts (R608)";
const P1 = "an Actual of 1 on the same two rows: the clamps act — 1–1–4 and 29–29–39";
const PX =
  "done past Max (45 of 20–30–40): 1–1–1, a point mass at 1 for every distribution type, Beta-PERT's Min = Max included";
const PU = "Uniform — 25 days done: 1–5–15, and its distribution runs from 1 to 15 (median 8)";
const PS = "an sdOverride is carried over as it was (owner, R608: kept)";
const PF = "fractions pass through: 22.5–30–60 with 7 days done is 15.5–23–53";
const PP =
  "no converted estimate is flagged — in order, Min at least 1, and a LogNormal above zero — and every type takes it";
const PD = "the copy starts on the reforecast date only with dropCompleted; otherwise, or with no date, on its source's";
const PK = "a Complete row is still dropped, and a Planned row keeps its estimate, Planned, with its Actual emptied";
const PN = "the proposed name: the day and month of the date in each Date Format, numbered when taken (R608)";

// CloneScenarioDialog.test.tsx — "CloneScenarioDialog — the reforecast date (WI-139)".
const D1 = "unticked: no date field, as before";
const D2 = "ticked: a date field appears, filled with the next working day, described by the note";
const dflt = (day, iso) => `the default on ${day} is ${iso}, the next working day by the page's calendar`;
const DT = dflt("Thursday 29 October", "2026-10-30");
const DF = dflt("Friday 30 October", "2026-11-02");
const DS = dflt("Saturday 31 October", "2026-11-02");
const DH = dflt("Wednesday 25 November, the day before a holiday", "2026-11-27");
const DZ = "a calendar with no working day ahead: today, rather than no window";
const D3 =
  "today is the LOCAL date: 20:38 on Wednesday 28 October in New York, already the 29th in UTC, gives 2026-10-29";
const D4 = "the untouched name follows the box and the date: '(Reforecast Oct 30)', then 'Nov 3', then '(Copy)' again";
const fmt = (f, name) => `the name's date follows the Date Format setting: ${f} gives '${name}'`;
const FM = fmt("MM/DD/YYYY", "Baseline (Reforecast Oct 30)");
const FD = fmt("DD/MM/YYYY", "Baseline (Reforecast 30 Oct)");
const FY = fmt("YYYY/MM/DD", "Baseline (Reforecast Oct 30)");
const D5 = "a typed name stays as typed through the box and the date";
const D6 = "ticked, Clone sends the name, true and the date";
const D7 = "unticked, Clone sends the name and false, and no date at all";
const D8 = "an empty date: Clone is off and the line beside it says why; unticking turns Clone back on";
// CloneScenarioDialog.test.tsx — the existing WI-108 row, unedited.
const TYPED_108 = "the user can still type any name — a taken one too — and Clone sends it as typed";

// ProjectPage.test.tsx — "ProjectPage — a reforecast clone (WI-139)".
const PG =
  "ticked, Clone makes a copy that starts on the reforecast date and carries an In Progress row's remaining work";

const escape = (s) => s.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

/** Matches exactly these test titles, as the verbose reporter prints them. */
const only = (...titles) => new RegExp(`> (?:${titles.map(escape).join("|")})$`);

export const testFile = "src/";
export const mutations = [
  {
    // The code before WI-139: every remaining row reset to Planned with its whole estimate. PD and PN do
    // not read an In Progress row's estimate or status, so they hold.
    id: "R1  an In Progress row reset to Planned, whole estimate (the code before)  [expect 13: PA PB PC PE P0 P1 PX PU PS PF PP PK PG]",
    file: SERVICE,
    find: '        a.status === "inProgress" ? asRemainingWork(a) : { ...a, actualDuration: undefined }\n',
    replace: '        ({ ...a, status: "planned" as const, actualDuration: undefined })\n',
    expectFailing: only(PA, PB, PC, PE, P0, P1, PX, PU, PS, PF, PP, PK, PG),
  },
  {
    // Only a reduction that goes below 1 moves: B, C, past Max, Uniform at 25, the sdOverride row at 25,
    // 0–2–5 less 1, and the property.
    id: "R2  Min not held at 1  [expect 7: PB PC P1 PX PU PS PP]",
    file: SERVICE,
    find: "  const min = Math.max(1, a.min - t);\n",
    replace: "  const min = a.min - t;\n",
    expectFailing: only(PB, PC, P1, PX, PU, PS, PP),
  },
  {
    // Most Likely falls below Min when the days done pass it (C, past Max) or when it was below Min (30–20–40).
    id: "R3  Most Likely not held at Min  [expect 4: PC P1 PX PP]",
    file: SERVICE,
    find: "  const mostLikely = Math.max(min, a.mostLikely - t);\n",
    replace: "  const mostLikely = a.mostLikely - t;\n",
    expectFailing: only(PC, P1, PX, PP),
  },
  {
    // Max falls below Most Likely only past Max (45 of 40).
    id: "R4  Max not held at Most Likely  [expect 2: PX PP]",
    file: SERVICE,
    find: "  const max = Math.max(mostLikely, a.max - t);\n",
    replace: "  const max = a.max - t;\n",
    expectFailing: only(PX, PP),
  },
  {
    // The rows that read the copy's Actual after a reduction: A, B and the page row. E and P0 take the
    // early return, which empties it on its own line.
    id: "R5  the Actual carried into the copy  [expect 3: PA PB PG]",
    file: SERVICE,
    find: "  return { ...a, min, mostLikely, max, actualDuration: undefined };\n",
    replace: "  return { ...a, min, mostLikely, max };\n",
    expectFailing: only(PA, PB, PG),
  },
  {
    // R608's ruling undone: the clamps act on a row with nothing in its Actual cell (the prototype).
    id: "N3  the clamps act when the Actual is unset or 0  [expect 1: P0]",
    file: SERVICE,
    find: "  const t = a.actualDuration;\n  if (!t) return { ...a, actualDuration: undefined };\n",
    replace: "  const t = a.actualDuration ?? 0;\n",
    expectFailing: only(P0),
  },
  {
    id: "R6  the reforecast date applied without dropCompleted  [expect 1: PD]",
    file: SERVICE,
    find: "    startDate: (options.dropCompleted && options.reforecastFrom) || scenario.startDate,\n",
    replace: "    startDate: options.reforecastFrom || scenario.startDate,\n",
    expectFailing: only(PD),
  },
  {
    id: "R7  the reforecast date never applied  [expect 2: PD PG]",
    file: SERVICE,
    find: "    startDate: (options.dropCompleted && options.reforecastFrom) || scenario.startDate,\n",
    replace: "    startDate: scenario.startDate,\n",
    expectFailing: only(PD, PG),
  },
  {
    // The service ignores its format: every name in MM/DD/YYYY's "Oct 30" form.
    id: "N2s the name's date ignores the format passed  [expect 2: PN FD]",
    file: SERVICE,
    find: "  const label = `Reforecast ${formatDateShort(reforecastFrom, dateFormat)}`;\n",
    replace: "  const label = `Reforecast ${formatDateShort(reforecastFrom)}`;\n",
    expectFailing: only(PN, FD),
  },
  {
    id: "W1  the date shown while unticked  [expect 1: D1]",
    file: DIALOG,
    find: '              {dropCompleted && (\n                <div className="mt-2 ml-6">',
    replace: '              {true && (\n                <div className="mt-2 ml-6">',
    expectFailing: only(D1),
  },
  {
    // The prototype's default. DZ expects today and D6 types its own date, so both hold.
    id: "N1  the default is today  [expect 12: D2 DT DF DS DH D3 D4 FM FD FY D8 PG]",
    file: DIALOG,
    find: "    return formatDateISO(addWorkingDays(parseDateISO(today), 1, calendar));\n",
    replace: "    return today;\n",
    expectFailing: only(D2, DT, DF, DS, DH, D3, D4, FM, FD, FY, D8, PG),
  },
  {
    // The suite runs in UTC, so only D3, which moves the zone, can tell the two apart.
    id: "W2  today read in UTC, not local time  [expect 1: D3]",
    file: DIALOG,
    find: "  const today = formatDateISO(new Date());\n",
    replace: "  const today = new Date().toISOString().slice(0, 10);\n",
    expectFailing: only(D3),
  },
  {
    id: "F1  no fallback for a calendar with no working day  [expect 1: DZ]",
    file: DIALOG,
    find: "    if (isCalendarError(err)) return today;\n",
    replace: "",
    expectFailing: only(DZ),
  },
  {
    // D8 reads the name after the date is cleared; the page row reads the copy's name.
    id: "W3  the name ignores the box  [expect 7: D4 FM FD FY D6 D8 PG]",
    file: DIALOG,
    find: "  const proposedName = dropCompleted\n    ? reforecastCloneName(sourceName, nameDate, existingNames, dateFormat)\n    : copyName;\n",
    replace: "  const proposedName = copyName;\n",
    expectFailing: only(D4, FM, FD, FY, D6, D8, PG),
  },
  {
    // The window ignores the preference: MM/DD/YYYY and YYYY/MM/DD read alike, so only DD/MM/YYYY can tell.
    id: "N2  the name ignores the Date Format setting  [expect 1: FD]",
    file: DIALOG,
    find: "reforecastCloneName(sourceName, nameDate, existingNames, dateFormat)",
    replace: 'reforecastCloneName(sourceName, nameDate, existingNames, "MM/DD/YYYY")',
    expectFailing: only(FD),
  },
  {
    // The existing WI-108 row types a name that is not the proposal, so it fails too.
    id: "W4  a typed name overwritten by the proposal  [expect 2: D5 TYPED_108]",
    file: DIALOG,
    find: "  const name = typedName ?? proposedName;\n",
    replace: "  const name = proposedName;\n",
    expectFailing: only(D5, TYPED_108),
  },
  {
    // An empty field then names "undefined NaN": only D8 reads the name while the field is empty.
    id: "W5  the name reads a half-typed date  [expect 1: D8]",
    file: DIALOG,
    find: "reforecastCloneName(sourceName, nameDate, existingNames, dateFormat)",
    replace: "reforecastCloneName(sourceName, reforecastFrom, existingNames, dateFormat)",
    expectFailing: only(D8),
  },
  {
    id: "W6  Clone not off for an empty date  [expect 1: D8]",
    file: DIALOG,
    find: "                disabled={!name.trim() || dateMissing}\n",
    replace: "                disabled={!name.trim()}\n",
    expectFailing: only(D8),
  },
  {
    id: "W7  the line beside Clone not rendered  [expect 1: D8]",
    file: DIALOG,
    find: "              {dateMissing && (\n                <p id={reasonId}",
    replace: "              {false && (\n                <p id={reasonId}",
    expectFailing: only(D8),
  },
  {
    id: "W8  Clone's aria-describedby spread dropped  [expect 1: D8]",
    file: DIALOG,
    find: "                {...describedByWhile(dateMissing, reasonId)}\n",
    replace: "",
    expectFailing: only(D8),
  },
  {
    // Enter in a field submits the form whatever the button's state.
    id: "W9  the submit guard on the date dropped  [expect 1: D8]",
    file: DIALOG,
    find: "    if (!trimmed || dateMissing) return;\n",
    replace: "    if (!trimmed) return;\n",
    expectFailing: only(D8),
  },
  {
    id: "W10 the date field not described by the note  [expect 1: D2]",
    file: DIALOG,
    find: "                    aria-describedby={dateMissing ? `${noteId} ${reasonId}` : noteId}\n",
    replace: "",
    expectFailing: only(D2),
  },
  {
    id: "W11 ticked, Clone sends no date  [expect 2: D6 PG]",
    file: DIALOG,
    find: "    if (dropCompleted) onClone(trimmed, true, reforecastFrom);\n",
    replace: "    if (dropCompleted) onClone(trimmed, true);\n",
    expectFailing: only(D6, PG),
  },
  {
    // Any third argument breaks the existing WI-108 row's two-argument expectation.
    id: "W12 unticked, Clone sends a date too  [expect 2: D7 TYPED_108]",
    file: DIALOG,
    find: "    else onClone(trimmed, false);\n",
    replace: "    else onClone(trimmed, false, reforecastFrom);\n",
    expectFailing: only(D7, TYPED_108),
  },
  {
    id: "G1  the page drops the date on its way to the store  [expect 1: PG]",
    file: PAGE,
    find: "duplicateScenario(id, cloneSourceId, newName, { dropCompleted, reforecastFrom })",
    replace: "duplicateScenario(id, cloneSourceId, newName, { dropCompleted })",
    expectFailing: only(PG),
  },
  {
    // Without the page's calendar the window counts Monday to Friday, and the project's holiday on
    // Friday 30 October is missed: only the page row can tell.
    id: "G2  the page gives the window no calendar  [expect 1: PG]",
    file: PAGE,
    find: "          workCalendar={workCalendar}\n",
    replace: "",
    expectFailing: only(PG),
  },
];
