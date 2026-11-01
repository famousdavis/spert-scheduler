// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// WI-154 (a data date) and WI-151 (an overtaken link's float), v0.82.0 — falsification spec.
// The design seat's two specs (D1–D7, U1–U6; its U7 tested option B, which the owner's C′ replaced),
// re-pointed at the code as built, then one straw per Review 35 fix and per gap both seats named
// (verification G1–G5; the design's U3). Each [expect N] is the count of failing tests, every one
// named, written before the spec ran. U1 is open-ended, as the design pre-registered it: it names
// the tests that must fail and leaves the rest (the design measured 36) to the run.
//
//   node scripts/falsify.mjs scripts/falsify-spec-data-date.mjs
const p = (rel) => new URL(`../${rel}`, import.meta.url).pathname;
const SCHEDULE = p("src/core/schedule/deterministic.ts");
const GRAPH = p("src/core/schedule/dependency-graph.ts");
const RECORD = p("src/core/schedule/recorded-progress.ts");
const ENGINE = p("src/core/simulation/monte-carlo.ts");
const PARAMS = p("src/ui/helpers/build-simulation-params.ts");
const WORKER = p("src/workers/simulation.worker.ts");
const CLIENT = p("src/core/simulation/worker-client.ts");
const WORDS = p("src/ui/helpers/progress-note-words.ts");
const PAGE = p("src/ui/pages/ProjectPage.tsx");
const VIEW = p("src/ui/hooks/use-data-date-view.ts");
const ROW = p("src/ui/components/activity-row-helpers.ts");
const PREVIEW = p("src/ui/helpers/passed-constraint-preview.ts");
const WINDOW = p("src/ui/components/ActivityEditModal.tsx");
const SNAPSHOT = p("src/app/api/ai-snapshot-service.ts");
const COMPARISON = p("src/ui/helpers/comparison-model.ts");
const EXPORT = p("src/ui/components/ScheduleExportSection.tsx");
const escape = (s) => s.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
const only = (...titles) => new RegExp(`> (?:${titles.map(escape).join("|")})$`);

// The tests, by title. data-date.test.ts (the design's):
const DD5 = "with today, Fri 10/30: Docs and Training start 10/30; the recorded rows and Test do not move";
const DD6 = "floats: Docs and Training have 5 days to the end (11/06 → 11/13); Design, Build and Test are critical";
const DD8 = "dependencies on: a Planned row after finished work starts on the data date; the simulation agrees";
const DD9 = "dependencies off: the first Planned row after the finished one moves; the row below follows it";
const DD12 = "a hard Must Start On that has passed: started today in both engines, its red error in true words";
const DD13 = "a hard Must Finish On that has passed: the same, finished on 11/02, and the simulation's trial too";
const DD15 = "case 1 — B started 10/12, before A finished: A and P have 7 days (end 10/23), not 0; only B is critical";
const DD18 = "case 4 — case 1 with a 40-day Y driving the end (11/27): A and P 32, not 22; only Y critical";
const DD19 = "R598's example, today 10/27: A (Complete 10/05–10/23) has 15 days, not 0; B and C critical";
const DD3 = "applies only in a scenario that holds a record";
// data-date-ui.test.ts (the design's):
const UI1 = "today Tue 10/27, with a record: 16 working days from 10/05, in both modes";
const UI2 = "today Sat 10/31: the next working day, Mon 11/02, 20 working days";
const UI3 = "nothing with no record, no today, or today on the Start Date — so those requests are as before";
const UI4 = "one row — the Edit Activity window's line";
const UI5 = "several rows are ONE line on the page and in print, three names and a count";
// data-date-fixes.test.ts:
const F1 = "dependencies on: P starts today; C and L keep their place from the Start Date — finished work is not pushed past today";
const F2 = "… and the simulation agrees: every trial ends with P, at day 21 (16 + 5), not 26";
const F3 = "an In Progress row's forecast finish is not held by a finish-to-finish link from work that has not started";
const F4 = "dependencies off: a started row below one that has not started follows the last started row";
const F5 = "the data date never moves a started row: the same dates for today 10/27 and today 11/16";
const R2A = "Must Start On 10/12: X starts after P, 11/10 – 11/16, in both engines (31 = 31), and the words say when";
const R2B = "Must Finish On 10/16: Y starts after P and runs its five days, 11/10 – 11/16, in both engines";
const R2C = "start-to-start, 3 days' lag, from P: X starts 10/30 — P's start and its lag — in both engines (26 = 26)";
const R2D = "dependencies off: after the row above, which ends past today (both engines: 31)";
const E3A = "no data date: A finishes 10/16, before its Finish No Later Than 10/20 — no red error, though B overtook A → B";
const E3B = "with the data date (today Sat 10/31): A, not started, Finish No Later Than 11/12, finishing 11/06 — no red error";
const W4 = "W4: only the reworded Must Start On or Must Finish On error silences a row's line; a soft or No Later Than one does not";
const W5 = "W5: the grouped line names the rows in the grid's order, not the network's";
const E4 = "E4: a start-to-start link from work that has not started never says it started";
const W7 = "W7 and G3: each out-of-sequence start has its own true line in the window, and ONE line on the page";
const G3CP = "G3 and ruling 6: the critical path such a start leaves — the link it overtook is not on it";
const G3SEQ = "dependencies off, G3: the grouped line names the rows that started below rows that have not";
// data-date-surfaces.test.ts:
const CP1 = "each Planned row in the grid's rows carries its plan dates; the dates shown are today's";
const CP2 = "Review 35's E2: every row of a chain completed late takes its own scheduled dates (R622), not today";
const CP3 = "interactions G1: a late start keeps the date it was late against, and the bulk toolbar keeps the same";
const CP4 = "interactions E3: a row's own constraint is in the plan — a future Start No Earlier Than is not due; a passed Must Start On is";
const PV1 = "as saved: the page's own red words, exactly — never \"Constraint date held\"";
const ST1 = "are stale when the day they were simulated on had an earlier data date — a weekend shares Monday's";
const ST2 = "never in a scenario with no record, or with no results";
const ST4 = "the comparison shows them as not run, offers a Run, and says why";
const ST5 = "the comparison reads today as the page does: Next starts today, 10/27, so the end is 11/02";
const ST6 = "the AI snapshot says \"stale\", with the sentence";
const AI1 = "the snapshot's schedule starts work that has not started today";
const AI2 = "a new day is a new entry: the cache does not answer with yesterday's floor";
const UT = "Tue 23:59:30 → Wed, 31 seconds later";
// simulation-worker-data-date.test.ts, gantt-data-date-arrow.test.tsx, use-run-paths-data-date.test.ts:
const WK1 = "dependencies on: Next starts at the offset";
const WK2 = "dependencies off: the same";
const WK3 = "an offset that is not a whole number of days above zero is dropped, as a malformed map entry is";
const WK4 = "16 is sent; none is not";
const GA1 = "P, Q and S are all critical, and P → S is the link S overtook";
const GA2 = "on screen: P → S dashed in the ordinary colour; P → Q red";
const GA3 = "in print: the same";
const RP1 = "sends the data date's offset, 16";
const RP2 = "16 on Tue 10/27; on Wed 10/28 it runs again, with 17";
// data-date-page.test.tsx, ScheduleExportSection.data-date.test.tsx:
const PG1 = "the Run button sends the data date's offset: 16";
const PG2 = "results simulated yesterday (Mon 10/26) are shown as not run, with the sentence, on the page and in print — and kept";
const PG3 = "Review 35, E4/E5: Delta's window gives the page's words for its passed Must Start On, never \"Constraint date held\"";
const EX1 = "offers only the current results, and names the rest";
const EX2 = "schedules work that has not started from today: Next 10/27 – 11/02, its Planned dates the plan's 10/12 – 10/16 (owner, Q1)";
// Review 36's follow-up:
const PV4 = "Review 36, E1: a Status draft that has started gets the page's rule — no conflict for what the start sets aside";
const PG5 = "Review 36, E1: set In Progress in the window, Delta's passed Must Start On is no conflict at all — the start sets it aside";
const AI3 = "is written again when the local day turns, with nothing else changed";
// The owner's Q1 and Q2 (2026-10-31):
const EXQ1 = "with the plan: Planned 10/12 – 10/16, the dates Next would keep if it started now";
const EXQ0 = "without one, as before: the dates shown, 10/27 – 11/02";
const PGQ1 = "owner, Q1: the page's own export gives Delta, not started, its Planned dates from the plan before today's floor";
const Q2DEP = "dependencies on: P → C (Complete, no dates) → Q: Q runs beside P, and the page's line says why";
const Q2SEQ = "dependencies off: the row below B follows B, not A above it, and the page's line says so";
const Q2NONE = "with no work after the started rows, no such sentence";
const CLQ1 = "Q1: the export's Planned dates for work not started are the plan before today's floor";
const CLQ2 = "Q2: work after a started activity is not held back for work that has not started";
// Existing tests a straw reaches:
const THREAD = "PrintableReport places the Progress Notes section, with the note's sentence";
const RULING6 = "an overtaken arrow is NEVER a critical edge — the ordinary colour and arrowhead; the critical B → C stays red (ruling 6)";
const PAR_GRID = "v0.80.0's Complete defaults read the same plan as the pair: the grid path";
const PAR_WINDOW = "… and the window, the estimate first: the same pair, and the same actual dates";
const PAR_DIST = "a Distribution staged with the Status: the plan has the new Distribution";
const PAR_TWO = "… the same as two Applies, the Distribution first and then the Status";
const PAR_CHAIN = "a dependent chain started in one Apply keeps each row's pre-Apply plan, unchanged (ruling 5b)";
const TR_GRID = "Planned → In Progress captures what the grid SHOWED; → Planned clears it; Planned → Complete captures";
const TR_LEGACY = "a legacy row taken to Planned and back by the grid gets the LINK-placed plan — a fresh Planned → started change";
const TR_BULK = "a dependent chain started in ONE Apply: each row its pre-Apply plan — compared with the grid one row at a time";
const DEFINITION = "says what the dates are";

export const testFile = "src/";
export const mutations = [
  // -- The design's batch 1: the floor in both engines ------------------------------------------
  {
    id: "D1  the dependency forward pass ignores the data date  [expect 35; 32 before Q1/Q2]",
    file: SCHEDULE,
    find: "    activityStart = dataDateStart(activity, activityStart, floor);\n",
    replace: "",
    expectFailing: only(DD5, DD6, DD8, DD12, DD13, F1, F3, R2A, R2B, R2C, E3B, W4, W5, E4, W7, G3CP, CP1, PV1, ST5, AI1, AI2,
      GA1, GA2, GA3, PG3, EX2, PAR_DIST, PAR_TWO, TR_GRID, TR_LEGACY, TR_BULK, THREAD, Q2DEP, EXQ0, PGQ1),
  },
  {
    id: "D2  no hold after a row's own constraint (date domain)  [expect 8]",
    file: SCHEDULE,
    find: "  if (!floor || !floorsAtDataDate(activity) || es >= floor.date) return { es, ef, conflict };\n",
    replace: "  return { es, ef, conflict };\n",
    expectFailing: only(DD12, DD13, R2A, R2B, R2C, R2D, PV1, PG3),
  },
  {
    id: "D3  the sequential pass ignores the data date  [expect 4; 3 before Q1/Q2]",
    file: SCHEDULE,
    find: "    const at = dataDateStart(activity, from, floor);\n",
    replace: "    const at = from;\n",
    expectFailing: only(DD9, F4, R2D, Q2SEQ),
  },
  {
    id: "D4  the dependency simulation gets no floors  [expect 9]",
    file: ENGINE,
    find: "    dataDateFloorOffsets(activities, dataDateOffset),\n",
    replace: "    undefined,\n",
    expectFailing: only(DD8, DD12, DD13, F2, F3, R2A, R2B, R2C, WK1),
  },
  {
    id: "D5  the simulation keeps a passed hard date's place (ruling 2)  [expect 2]",
    file: GRAPH,
    find: "  if (floor === undefined || (constrained.es >= floor && constrained.ef >= floor + dur)) return constrained;\n  return network;\n",
    replace: "  return constrained;\n",
    expectFailing: only(DD13, R2B),
  },
  {
    id: "D6  the sequential simulation ignores the floor  [expect 4]",
    file: ENGINE,
    find: "  return info.type === \"active\" ? Math.max(from, info.startFloor) : from;\n",
    replace: "  return from;\n",
    expectFailing: only(DD9, F4, R2D, WK2),
  },
  {
    id: "D7  the WI-151 skip removed: the float runs through an overtaken link again  [expect 5]",
    file: SCHEDULE,
    find: "  return overtaken.size === 0 ? succs : succs.filter((s) => !overtaken.has(linkKey(id, s.id, s.type)));\n",
    replace: "  return succs;\n",
    expectFailing: only(DD15, DD18, DD19, RULING6, E3A),
  },
  // -- The design's batch 2: scope, params, worker, notes, words, free float ----------------------
  {
    id: "U1  the scope widened to every scenario  [expect >= 3 named; the design measured 36]",
    file: RECORD,
    find: "  return hasAnyRecord(activities) ? todayISO : undefined;\n",
    replace: "  return todayISO;\n",
    expectFailing: only(DD3, UI3, ST2),
  },
  {
    id: "U2  the simulation params drop the data date  [expect 5]",
    file: PARAMS,
    find: "  const floor = dataDateOffset ? { dataDateOffset } : {};\n",
    replace: "  const floor = {};\n",
    expectFailing: only(UI1, UI2, RP1, RP2, PG1),
  },
  {
    id: "U3  the worker drops the offset (dependency branch) — verification G1a  [expect 1]",
    file: WORKER,
    find: "    recordedDurationMap: toValidatedMap(payload.recordedDurations, isNumber),\n    dataDateOffset: validDataDateOffset(payload.dataDateOffset),\n",
    replace: "    recordedDurationMap: toValidatedMap(payload.recordedDurations, isNumber),\n",
    expectFailing: only(WK1),
  },
  {
    id: "U4  free float runs through an overtaken link again  [expect 1]",
    file: SCHEDULE,
    find: "    const succs = liveSuccessors(graph, id, overtaken);\n    if (succs.length === 0) {\n      freeFloatMap.set",
    replace: "    const succs = (graph.successors.get(id) ?? []) as Edge[];\n    if (succs.length === 0) {\n      freeFloatMap.set",
    expectFailing: only(DD15),
  },
  {
    id: "U5  no data-date notes (dependencies on)  [expect 6; 5 before Q1/Q2]",
    file: SCHEDULE,
    find: "  progressNotes.push(...dataDateNotes(activities, flooredFrom, scheduledActivities, held, floor));\n",
    replace: "",
    expectFailing: only(DD5, THREAD, W4, W5, W7, Q2DEP),
  },
  {
    id: "U6  the page and print show one line per moved row  [expect 3; 2 before Q1/Q2]",
    file: WORDS,
    find: "      if (n === dataDate[0]) lines.push({ key: \"data-date\", sentence: dataDateSentence(dataDate, formatDate) });\n",
    replace: "      lines.push({ key: progressNoteKey(n), sentence: progressNoteSentence(n, formatDate) });\n",
    expectFailing: only(UI5, W5, Q2DEP),
  },
  // -- Review 35, interactions E1: work that has not started never holds work that has -----------
  {
    id: "E1a no link is set aside: started work follows work that has not started again  [expect 9; 6 before Q1/Q2]",
    file: RECORD,
    find: "    if (from && to && floorsAtDataDate(from) && !floorsAtDataDate(to)) keys.add(linkKey(p.fromId, p.toId, p.type));\n",
    replace: "",
    expectFailing: only(F1, F2, F3, F4, F5, G3SEQ, Q2DEP, Q2SEQ, Q2NONE),
  },
  {
    id: "E1b the dependency simulation keeps the links set aside  [expect 1]",
    file: ENGINE,
    find: "  if (setAside.size === 0) return full;\n",
    replace: "  return full;\n",
    expectFailing: only(F2),
  },
  {
    id: "E1c the sequential simulation: a started row follows a row above that has not started  [expect 1]",
    file: ENGINE,
    find: "    const afterStarted = dataDateOffset > 0 && !!above && floorsAtDataDate(above) && !floorsAtDataDate(activity);\n",
    replace: "    const afterStarted = false;\n",
    expectFailing: only(F4),
  },
  {
    id: "E1d the sequential schedule: the same  [expect 3; 2 before Q1/Q2]",
    file: SCHEDULE,
    find: "  return i === 0 || !setAside.has(linkKey(activities[i - 1]!.id, activities[i]!.id, \"FS\"));\n",
    replace: "  return true;\n",
    expectFailing: only(F4, G3SEQ, Q2SEQ),
  },
  {
    id: "E1e a link set aside is flagged amber  [expect 2]",
    file: SCHEDULE,
    find: "    if (setAside.has(linkKey(dep.fromActivityId, dep.toActivityId, dep.type))) continue;\n",
    replace: "",
    expectFailing: only(F1, F3),
  },
  {
    id: "E1f no note for a started row with no recorded start  [expect 6; 3 before Q1/Q2]",
    file: RECORD,
    find: "    if (!rec && !setAside) continue;\n",
    replace: "    if (!rec) continue;\n",
    expectFailing: only(F1, F4, G3SEQ, Q2DEP, Q2SEQ, Q2NONE),
  },
  {
    id: "E1g no note for a forecast finish the link no longer holds  [expect 1]",
    file: RECORD,
    find: "    const heldFinish = !setAside && !rec?.complete;\n",
    replace: "    const heldFinish = !rec?.complete;\n",
    expectFailing: only(F3),
  },
  // -- Owner, R639, decision 2 ---------------------------------------------------------------
  {
    id: "R2  a passed hard date held at today, before its predecessors (the design's hold)  [expect 4]",
    file: SCHEDULE,
    find: "  const end = activityEndDate(networkStart, duration, calendar);\n  return { es: new Date(networkStart), ef: end, conflict: conflict && passedConstraint(conflict, networkStart, end, floor) };\n",
    replace: "  const end = activityEndDate(floor.date, duration, calendar);\n  return { es: new Date(floor.date), ef: end, conflict: conflict && passedConstraint(conflict, floor.date, end, floor) };\n",
    expectFailing: only(R2A, R2B, R2C, R2D),
  },
  // -- Review 35, verification E3 and the words ---------------------------------------------------
  {
    id: "E3  the No Later Than checks read the float's late dates  [expect 2]",
    file: SCHEDULE,
    find: "    : backwardPassNetwork({ graph, durationMap, projectEndDate, calendar, overtaken: NO_LINKS });\n",
    replace: "    : floatPass;\n",
    expectFailing: only(E3A, E3B),
  },
  {
    id: "W4  any conflict silences a row's line again  [expect 1]",
    file: SCHEDULE,
    find: "  progressNotes.push(...dataDateNotes(activities, flooredFrom, scheduledActivities, held, floor));\n",
    replace: "  progressNotes.push(...dataDateNotes(activities, flooredFrom, scheduledActivities, new Set(conflicts.map((c) => c.activityId)), floor));\n",
    expectFailing: only(W4),
  },
  {
    id: "W5  the data date's notes in the network's order  [expect 1]",
    file: SCHEDULE,
    find: "  return activities\n    .filter((a) => flooredFrom.has(a.id)",
    replace: "  return scheduled.map((sa) => activities.find((a) => a.id === sa.activityId)!)\n    .filter((a) => flooredFrom.has(a.id)",
    expectFailing: only(W5),
  },
  {
    id: "W1  the red Must Start On error back to \"the data date\"  [expect 4]",
    file: SCHEDULE,
    find: "    : `${name}: Must Start On ${c.constraintDate} has passed, and ${name} has not started, so the schedule starts it ${startWords(start, floor)}.`;\n",
    replace: "    : `${name}: Must Start On ${c.constraintDate} is before the data date, ${formatDateISO(start)}, and ${name} has not started, so the schedule starts it on ${formatDateISO(start)}.`;\n",
    expectFailing: only(DD12, R2A, PV1, PG3),
  },
  {
    id: "W3  the data date's line never says \"today\" or \"the next working day\"  [expect 6; 5 before Q1/Q2]",
    file: WORDS,
    find: "  return note.date === note.today\n    ? `today, ${formatDate(note.date)}`\n    : `on ${formatDate(note.date)}, the next working day`;\n",
    replace: "  return `on ${formatDate(note.date)}`;\n",
    expectFailing: only(UI4, UI5, THREAD, W5, W7, Q2DEP),
  },
  {
    id: "E4  a predecessor that has not started gets the old words: \"before Kickoff started on 11/02\"  [expect 5; 3 before Q1/Q2]",
    file: WORDS,
    find: "  if (note.predecessorNotStarted) return notStartedSentence(note, note.predecessorNotStarted, formatDate);\n",
    replace: "",
    expectFailing: only(F3, E4, W7, Q2DEP, Q2SEQ),
  },
  {
    id: "N1  out-of-sequence notes one line each on the page  [expect 3; 2 before Q1/Q2]",
    file: WORDS,
    find: "  const grouped = outOfSequence.length > 1;\n",
    replace: "  const grouped = false;\n",
    expectFailing: only(W7, G3SEQ, Q2NONE),
  },
  {
    id: "N2  the note no longer knows its predecessor has not started  [expect 8; 5 before Q1/Q2]",
    file: RECORD,
    find: "  if (floorsAtDataDate(pred) && predES && predEF) {\n",
    replace: "  if (false) {\n",
    expectFailing: only(F1, F3, E4, W7, G3SEQ, Q2DEP, Q2SEQ, Q2NONE),
  },
  // -- Owner, R639, decision 1 (C′) ---------------------------------------------------------------
  {
    id: "C1  the plan schedule keeps today's floor: a late start loses its slip (options A/B)  [expect 8]",
    file: PAGE,
    find: "computeScenarioSchedule({ ...scheduleInputs, today: undefined, activities:",
    replace: "computeScenarioSchedule({ ...scheduleInputs, activities:",
    expectFailing: only(PAR_GRID, PAR_WINDOW, PAR_DIST, PAR_TWO, PAR_CHAIN, TR_GRID, TR_LEGACY, TR_BULK),
  },
  {
    id: "C2  the grid's rows carry no plan dates: the grid and bulk read the floored dates  [expect 6]",
    file: VIEW,
    find: "dataDay ? planSchedule([]) : null",
    replace: "null",
    expectFailing: only(PAR_GRID, PAR_TWO, PAR_CHAIN, TR_GRID, TR_LEGACY, TR_BULK),
  },
  {
    id: "C3  the Status rule ignores the plan dates it is given  [expect 9]",
    file: ROW,
    find: "      scheduledStart: (scheduled?.planDates ?? scheduled)?.startDate,\n      scheduledFinish: (scheduled?.planDates ?? scheduled)?.endDate,\n      scheduledDuration: (scheduled?.planDates ?? scheduled)?.duration,\n",
    replace: "      scheduledStart: scheduled?.startDate,\n      scheduledFinish: scheduled?.endDate,\n      scheduledDuration: scheduled?.duration,\n",
    expectFailing: only(CP2, CP3, CP4, PAR_GRID, PAR_TWO, PAR_CHAIN, TR_GRID, TR_LEGACY, TR_BULK),
  },
  {
    id: "C4  the Planned pair's definition back to \"the schedule's dates at the moment\"  [expect 1]",
    file: p("src/ui/helpers/planned-dates-words.ts"),
    find: "the dates the plan gave the activity when it left Planned — Scheduler's own plan, without moving work that has not started to today, or the plan it was imported with.",
    replace: "the schedule's dates at the moment the activity left Planned.",
    expectFailing: only(DEFINITION),
  },
  // -- Review 35, interactions E4 and verification E5: the Edit window ------------------------------
  {
    id: "P1  the window's own preview for a saved passed date (\"Constraint date held\")  [expect 2]",
    file: PREVIEW,
    find: "  if (saved) return args.schedule?.constraintConflicts?.find((c) => c.activityId === activity.id && c.passed);\n",
    replace: "  if (saved) return undefined;\n",
    expectFailing: only(PV1, PG3),
  },
  {
    id: "P3  the window's preview ignores a Status draft that has started (Review 36, E1)  [expect 2]",
    file: PREVIEW,
    find: "  if (activity && args.draftStatus !== \"planned\") return startedPreview(activity, args);\n",
    replace: "",
    expectFailing: only(PV4, PG5),
  },
  {
    id: "G1  the AI snapshot is not written again when the day turns (Review 36)  [expect 1]",
    file: p("src/ui/hooks/use-ai-connectivity.ts"),
    find: "  }, [project, activeScenarioId, workCalendar, today, sessionState.sessionActive, sessionState.consentRead, scheduleSnapshot]);",
    replace: "  }, [project, activeScenarioId, workCalendar, sessionState.sessionActive, sessionState.consentRead, scheduleSnapshot]);",
    expectFailing: only(AI3),
  },
  {
    id: "P2  the window never asks for the passed-date words  [expect 2; was 1 before Review 36's E1 test]",
    file: WINDOW,
    find: "      if (passed !== undefined) {\n        setConflictPreview(passed);\n        return;\n      }\n",
    replace: "",
    expectFailing: only(PG3, PG5),
  },
  // -- Verification G1–G5: the gaps no test caught ----------------------------------------------------
  {
    id: "G1b the worker drops the offset, sequential branch  [expect 1]",
    file: WORKER,
    find: "    sequentialRecords: seqRecords,\n    dataDateOffset: validDataDateOffset(payload.dataDateOffset),\n",
    replace: "    sequentialRecords: seqRecords,\n",
    expectFailing: only(WK2),
  },
  {
    id: "G1c the worker client never sends the offset  [expect 1]",
    file: CLIENT,
    find: "      ...(dataDateOffset && { dataDateOffset }),\n",
    replace: "",
    expectFailing: only(WK4),
  },
  {
    id: "G1d the worker takes any offset it is sent  [expect 1]",
    file: WORKER,
    find: "  return Number.isInteger(value) && (value as number) > 0 ? (value as number) : undefined;\n",
    replace: "  return value as number;\n",
    expectFailing: only(WK3),
  },
  {
    id: "G2a screen Gantt: an overtaken arrow may be a critical edge again  [expect 1]",
    file: p("src/ui/charts/GanttChart.tsx"),
    find: "const isCriticalEdge = !synthetic && showCriticalPath && !dash &&",
    replace: "const isCriticalEdge = !synthetic && showCriticalPath &&",
    expectFailing: only(GA2),
  },
  {
    id: "G2b print Gantt: the same  [expect 1]",
    file: p("src/ui/charts/PrintGanttChart.tsx"),
    find: "const isCriticalEdge = !synthetic && hasCriticalPath && !dash &&",
    replace: "const isCriticalEdge = !synthetic && hasCriticalPath &&",
    expectFailing: only(GA3),
  },
  {
    id: "G3a useToday never turns at midnight (no timer)  [expect 2; was 1 before Review 36's G1 test]",
    file: p("src/ui/hooks/use-today.ts"),
    find: "  return useSyncExternalStore(subscribe, todayISO);",
    replace: "  return useSyncExternalStore(() => () => {}, todayISO);",
    expectFailing: only(UT, AI3),
  },
  {
    id: "G3b the auto-run simulates without the data date  [expect 1]",
    file: p("src/ui/hooks/use-auto-run-simulation.ts"),
    find: "          scenario.settings.parkinsonsLawEnabled ?? true,\n          today,\n",
    replace: "          scenario.settings.parkinsonsLawEnabled ?? true,\n",
    expectFailing: only(RP2),
  },
  {
    id: "G3c the Run button simulates without the data date  [expect 1]",
    file: PAGE,
    find: "        scenario.settings.parkinsonsLawEnabled ?? true,\n        today,\n",
    replace: "        scenario.settings.parkinsonsLawEnabled ?? true,\n",
    expectFailing: only(PG1),
  },
  {
    id: "G4a the AI snapshot ignores the data date  [expect 2]",
    file: SNAPSHOT,
    find: "    const dataDate = scenarioDataDate(scenario.activities, today);",
    replace: "    const dataDate = undefined as string | undefined;",
    expectFailing: only(AI1, AI2),
  },
  {
    id: "G4b the AI snapshot's cache is not keyed on today  [expect 1]",
    file: SNAPSHOT,
    find: "cached.workCalendar === workCalendar && cached.today === today) {",
    replace: "cached.workCalendar === workCalendar) {",
    expectFailing: only(AI2),
  },
  {
    id: "G5a the comparison ignores the data date  [expect 1]",
    file: COMPARISON,
    find: "    const dataDate = scenarioDataDate(scenario.activities, today);",
    replace: "    const dataDate = undefined as string | undefined;",
    expectFailing: only(ST5),
  },
  {
    id: "G5b the schedule export ignores the data date  [expect 1]",
    file: EXPORT,
    find: "    const shown = computeScenarioSchedule({ ...inputs, today });",
    replace: "    const shown = computeScenarioSchedule(inputs);",
    expectFailing: only(EX2),
  },
  {
    id: "G5c Compare's Run simulates without the data date  [expect 1]",
    file: p("src/ui/hooks/use-compare-runs.ts"),
    find: "          todayISO(),\n",
    replace: "",
    expectFailing: only(RP1),
  },
  // -- Owner, R639, decision 3: stale results on every surface --------------------------------------
  {
    id: "S1  stale by the calendar day, not the data date: a Sunday re-run for a Saturday's results  [expect 1]",
    file: RECORD,
    find: "  if (now?.date.getTime() === then?.date.getTime()) return null;\n",
    replace: "  if (simulatedOn === todayISO) return null;\n",
    expectFailing: only(ST1),
  },
  {
    // Registered as 1 before the run; it measured 73. The other 72 are the comparison's own tests
    // (record-free scenarios whose results carry another day's timestamp): the records-only scope
    // this straw removes is what keeps them valid. Left as measured, not re-registered.
    id: "S2  stale in a scenario with no record too  [expect 1 named; measured 73]",
    file: RECORD,
    find: "  if (!run || !scenarioDataDate(scenario.activities, todayISO)) return null;\n",
    replace: "  if (!run) return null;\n",
    expectFailing: only(ST2),
  },
  {
    id: "S3  the page shows stale results  [expect 1]",
    file: VIEW,
    find: "    simulationResults: stale ? undefined : scenario?.simulationResults,\n",
    replace: "    simulationResults: scenario?.simulationResults,\n",
    expectFailing: only(PG2),
  },
  {
    id: "S4  print shows stale results  [expect 1]",
    file: VIEW,
    find: "    () => (stale && scenario ? { ...scenario, simulationResults: undefined } : scenario),\n",
    replace: "    () => scenario,\n",
    expectFailing: only(PG2),
  },
  {
    id: "S5  the comparison compares stale results  [expect 1]",
    file: COMPARISON,
    find: "computeEntry(stale[i] ? { ...s, simulationResults: undefined } : s, calendar, today)",
    replace: "computeEntry(s, calendar, today)",
    expectFailing: only(ST4),
  },
  {
    id: "S6  the schedule export offers stale results  [expect 1]",
    file: EXPORT,
    find: "      eligibleScenarios: withResults.filter((_, i) => !stale[i]),\n",
    replace: "      eligibleScenarios: withResults,\n",
    expectFailing: only(EX1),
  },
  {
    id: "S7  the AI snapshot calls stale results present  [expect 1]",
    file: SNAPSHOT,
    find: "  if (!stale) return { simulationStatus: \"present\" };\n",
    replace: "  if (stale || !stale) return { simulationStatus: \"present\" };\n",
    expectFailing: only(ST6),
  },
  // -- The owner's Q1 and Q2 (2026-10-31) ----------------------------------------------------------
  {
    id: "Q1a the export writes a not-started row's Planned dates from the floored schedule  [expect 3]",
    file: p("src/app/api/schedule-export-service.ts"),
    find: "      ...progressDateCells(activity, planMap.get(activity.id), fmt),",
    replace: "      ...progressDateCells(activity, scheduledMap.get(activity.id), fmt),",
    expectFailing: only(EXQ1, EX2, PGQ1),
  },
  {
    id: "Q1b Settings' export passes the floored schedule as its plan  [expect 1]",
    file: EXPORT,
    find: "    const plan = computeScenarioSchedule(inputs).schedule;",
    replace: "    const plan = schedule;",
    expectFailing: only(EX2),
  },
  {
    id: "Q1c the page's export passes no plan  [expect 1]",
    file: p("src/ui/components/ScenarioSummaryCard.tsx"),
    find: "    const plan = planSchedule?.([]);",
    replace: "    const plan = undefined;",
    expectFailing: only(PGQ1),
  },
  {
    // WI-150 (v0.83.0): measured alone, 2 — the root-only edit also fails changelog-public-sync.
    id: "Q1d the changelog drops Q1's bullet  [expect 2]",
    file: p("CHANGELOG.md"),
    find: "- **In the schedule export, an activity that has not started now has as its Planned Start and Planned Finish its dates in the plan before work that has not started was moved to today,**",
    replace: "- **In the schedule export,**",
    expectFailing: only(CLQ1, "the public copy is byte-identical to the root changelog"),
  },
  {
    id: "Q2a a note never knows work follows its activity  [expect 3]",
    file: RECORD,
    find: "    if (workAfter) out.workAfter = true;\n",
    replace: "",
    expectFailing: only(G3SEQ, Q2DEP, Q2SEQ),
  },
  {
    id: "Q2b one out-of-sequence line without the sentence  [expect 2]",
    file: WORDS,
    find: "  if (!note.workAfter) return own;\n",
    replace: "  if (note.workAfter || !note.workAfter) return own;\n",
    expectFailing: only(Q2DEP, Q2SEQ),
  },
  {
    // WI-150 (v0.83.0): measured alone, 2 — the root-only edit also fails changelog-public-sync.
    id: "Q2c the changelog drops Q2's sentence  [expect 2]",
    file: p("CHANGELOG.md"),
    find: " Work after such an activity is not held back for that work on its account either, so a forecast can finish earlier than before; the grey note says so.",
    replace: "",
    expectFailing: only(CLQ2, "the public copy is byte-identical to the root changelog"),
  },
];
