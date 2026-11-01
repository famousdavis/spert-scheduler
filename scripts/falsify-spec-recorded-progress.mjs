// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Falsification spec for an activity's Actual Start and Actual Finish, recorded as dates (WI-137, v0.80.0).
//
// A recorded start is a fact: the schedule and the simulation, in both modes, place the row where it
// started; a link, a milestone start or a start constraint it overtook is a neutral note, not a
// warning. An In Progress row's forecast finish still follows its finish-to-finish links and its
// finish constraint; a Complete row's finish is a fact. One rule writes the two dates and the count
// on every Status path, and the Edit Activity window refuses an impossible pair. Straws S1–S15 are
// the prototype's (DESIGN §6.4); the rest are one each for the build's changes 2a, 2b, 2c, 2d, 2g,
// 2i and 2k. Each straw undoes one piece and must fail the tests that pin it. Read "K failing;
// named-match K", not merely a non-zero exit: the runner prints ✔ when ANY named test fails. Each
// straw was run ALONE first, against the whole suite; its expected set is what that run observed.
const RECORD = new URL("../src/core/schedule/recorded-progress.ts", import.meta.url).pathname;
const SCHEDULE = new URL("../src/core/schedule/deterministic.ts", import.meta.url).pathname;
const GRAPH = new URL("../src/core/schedule/dependency-graph.ts", import.meta.url).pathname;
const ENGINE = new URL("../src/core/simulation/monte-carlo.ts", import.meta.url).pathname;
const SERVICE = new URL("../src/app/api/simulation-service.ts", import.meta.url).pathname;
const WORKER = new URL("../src/workers/simulation.worker.ts", import.meta.url).pathname;
const MIGRATIONS = new URL("../src/infrastructure/persistence/migrations.ts", import.meta.url).pathname;
const SECTIONS = new URL("../src/ui/components/activity-modal-sections.tsx", import.meta.url).pathname;
const WINDOW = new URL("../src/ui/components/ActivityEditModal.tsx", import.meta.url).pathname;
const WORDS = new URL("../src/ui/helpers/progress-note-words.ts", import.meta.url).pathname;
const BULK = new URL("../src/ui/components/unified-activity-helpers.ts", import.meta.url).pathname;

const escape = (s) => s.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

/** Matches exactly these test titles, as the verbose reporter prints them. */
const only = (...titles) => new RegExp(`> (?:${titles.map(escape).join("|")})$`);

export const testFile = "src/";
export const mutations = [
  {
    id: "S1  the forward pass ignores the record (dependencies on)  [expect 9]",
    file: SCHEDULE,
    find: "    const rec = records.get(id);\n    if (rec) {\n",
    replace: "    const rec = records.get(id);\n    if (rec && false) {\n",
    expectFailing: only(
      "In Progress: Actual Start, Sched. Finish, Sched. Dur., Actual Dur.; the note, described by the start",
      "a recorded date is green, titled, and followed by a hidden \"actual\"; a scheduled one is plain",
      "dependencies on: A 10-05..10-23, B 10-19..10-30, C 11-02..11-13; span 30; one note; no warning",
      "the workaround's hard Must Start On 10-19 on B: set aside — no red, no amber, one note for the link",
      "with A still open on 10-27 (elapsed 17): A 10-05..10-28, B stays 10-19..10-30",
      "a start constraint the record breaks is set aside with a note: B stays 10-19..10-30, no red",
      "an FF link holds its finish: B keeps its start and finishes with A, with no amber warning",
      "a hard Must Finish On holds the finish on its day; one it cannot meet is the red error, and the FF link it breaks is amber",
      "a Complete row's finish is a fact: a missed FF link and a missed deadline are grey notes, never amber or red",
    ),
  },
  {
    id: "S2  the sequential pass ignores the record (dependencies off)  [expect 3]",
    file: SCHEDULE,
    find: "  if (rec) {\n    const placed = placeRecordedRow({ activity, rec, duration, ffFinishes: [], calendar });\n",
    replace: "  if (rec && false) {\n    const placed = placeRecordedRow({ activity, rec, duration, ffFinishes: [], calendar });\n",
    expectFailing: only(
      "dependencies off: A 10-05..10-23, B 10-19..10-30, C 11-02..11-13; span 30; one note; no warning",
      "dependencies off: a recorded row that ends before the row above ends — the project ends at the LATEST end",
      "dependencies off: a hard Finish No Earlier Than holds the forecast finish too",
    ),
  },
  {
    id: "S3  the dependency simulation ignores the recorded starts  [expect 2]",
    file: ENGINE,
    find: "    recordedPinsFor(recordedStartMap, model.completedDurations),\n",
    replace: "    undefined,\n",
    expectFailing: only(
      "dependencies on: P50 30.451189059661253, P95 31.339003251031873",
      "dependencies on: the recorded starts and durations do the same",
    ),
  },
  {
    id: "S4  the sequential simulation records the last position, not the latest end  [expect 1]",
    file: ENGINE,
    find: "    samples[trial] = maxEnd;\n",
    replace: "    samples[trial] = currentPos;\n",
    expectFailing: only(
      "dependencies off: a recorded row that ends before the row above ends — the project ends at the LATEST end",
    ),
  },
  {
    id: "S5  a dated Complete row's duration read from the stored count, not its dates (dependencies on)  [expect 1]",
    file: SCHEDULE,
    find: "  for (const [id, rec] of records) if (rec.duration !== undefined) durationMap.set(id, rec.duration);\n",
    replace: "",
    expectFailing: only(
      "a Complete row with both dates is as long as its dates say, whatever count is stored (a calendar changed since)",
    ),
  },
  {
    id: "S6  the amber warning kept for a link a record explains  [expect 3]",
    file: SCHEDULE,
    find: "    if (recordExplains(dep.type, dep.toActivityId, records)) continue;\n",
    replace: "",
    expectFailing: only(
      "dependencies on: A 10-05..10-23, B 10-19..10-30, C 11-02..11-13; span 30; one note; no warning",
      "the workaround's hard Must Start On 10-19 on B: set aside — no red, no amber, one note for the link",
      "a Complete row's finish is a fact: a missed FF link and a missed deadline are grey notes, never amber or red",
    ),
  },
  {
    id: "S7  recordExplains takes FF into an In Progress row like FS  [expect 2]",
    file: RECORD,
    find: '  return type === "FF" ? rec.complete : true;\n',
    replace: "  return true;\n",
    expectFailing: only(
      "a hard Must Finish On holds the finish on its day; one it cannot meet is the red error, and the FF link it breaks is amber",
      "recordExplains: FS and SS for any recorded row; FF only for a Complete one (2b)",
    ),
  },
  {
    // WI-154 re-pointed this needle (linkHit now serves a start with no record too) and the run
    // measured 9: an on-time start noted as overtaken also moves seven of data-date.test.ts's floats
    // and notes, and the same-day sweep's not-started sentence repeats a date. Left as measured.
    id: "S8  a note for an on-time start (< becomes <=)  [expect 1 named; measured 9 after WI-154]",
    file: RECORD,
    find: "  return parseDateISO(date) < allowed ? { event: \"start\", date, predecessorDate: base, allowed } : null;\n",
    replace: "  return parseDateISO(date) <= allowed ? { event: \"start\", date, predecessorDate: base, allowed } : null;\n",
    expectFailing: only(
      "FS: one note with the predecessor's finish and what the link allowed; none for an on-time start (S8)",
    ),
  },
  {
    id: "S9  a non-working recorded start snaps BACK  [expect 1]",
    file: RECORD,
    find: "    let start = advanceToNextWorkingDay(parseDateISO(a.actualStartDate), calendar);\n",
    replace: "    let start = retreatToWorkingDay(parseDateISO(a.actualStartDate), calendar);\n",
    expectFailing: only(
      "a Saturday start moves forward to Monday and a Saturday finish back to Friday — neither shown as recorded",
    ),
  },
  {
    id: "S10 the Start-Date clamp removed  [expect 3]",
    file: RECORD,
    find: "    if (clamped) start = new Date(projectStart);\n",
    replace: "",
    expectFailing: only(
      "(l) a start before the Start Date is drawn from it, not flagged, and remembered for the note",
      "(l) a start before the Start Date: one note with the recorded date",
      "(l) a recorded start before the Start Date: drawn from it, not green, with a note",
    ),
  },
  {
    id: "S11 Planned → In Progress keeps a stale start  [expect 1]",
    file: RECORD,
    find: '    const start = activity.status === "planned" ? today : (activity.actualStartDate ?? today);\n',
    replace: "    const start = activity.actualStartDate ?? today;\n",
    expectFailing: only(
      "Planned → In Progress ignores a date a Planned row carries (an import): today",
    ),
  },
  {
    id: "S12 → Planned leaves the finish  [expect 3]",
    file: RECORD,
    find: "  actualStartDate: undefined,\n  actualFinishDate: undefined,\n};\n",
    replace: "  actualStartDate: undefined,\n};\n",
    expectFailing: only(
      "In Progress → Planned: all three cleared",
      "Complete → Planned: all three cleared",
      "a clear names its keys, so a spread over the activity removes the old values",
    ),
  },
  {
    id: "S13 the 25 → 26 step back-fills a date  [expect 2]",
    file: MIGRATIONS,
    find: "  project.schemaVersion = 26;\n",
    replace:
      "  project.schemaVersion = 26;\n" +
      "  for (const s of (project.scenarios as Array<{ activities: Array<Record<string, unknown>> }>) ?? [])\n" +
      '    for (const a of s.activities) if (a.status !== "planned") a.actualStartDate = "2026-01-05";\n',
    expectFailing: only(
      "the 25 → 26 step only stamps the version: no row is given a date (ruling 3)",
      "this browser's storage: its save writes the project whole, stamped 25, so the dates are gone — reload that tab first",
    ),
  },
  {
    id: "S14 an unchanged empty date draft is written on Save  [expect 7]",
    file: SECTIONS,
    find: '  if (wantStart !== undefined && wantStart !== (activity.actualStartDate ?? "")) {\n',
    replace: "  if (wantStart !== undefined) {\n",
    expectFailing: only(
      "closes without any prompt when nothing was changed",
      "the Cancel button closes with no prompt at all",
      "Escape closes with no prompt at all",
      "T1 Save adds a typed deliverable to the existing ones, trimmed, once",
      "T2 Save adds a typed task to the existing ones, trimmed, once",
      "a row In Progress before v0.80.0 set to Complete gets NO dates and keeps its count (ruling 3)",
      "an unrelated Save writes no date",
    ),
  },
  {
    id: "S15 a start constraint applied to a recorded row  [expect 1]",
    file: RECORD,
    find: "  if (type && date && mode && !isStartConstraint(type)) {\n",
    replace: "  if (type && date && mode) {\n",
    expectFailing: only(
      "a start constraint the record breaks is set aside with a note: B stays 10-19..10-30, no red",
    ),
  },
  {
    id: "2a  the app's synchronous simulation drops the sequential records  [expect 1]",
    file: SERVICE,
    find: "    sequentialRecords,\n    dataDateOffset,\n  });\n",
    replace: "    dataDateOffset,\n  });\n",
    expectFailing: only(
      "dependencies off: P50 30.451189059661253, P95 31.339003251031873",
    ),
  },
  {
    id: "2a' the worker drops the sequential records  [expect 1]",
    file: WORKER,
    find: "    sequentialRecords: seqRecords,\n",
    replace: "",
    expectFailing: only(
      "dependencies off: the sequential records place B at its recorded start",
    ),
  },
  {
    id: "2b  an FF link no longer holds an In Progress row's forecast finish (the schedule)  [expect 2]",
    file: RECORD,
    find: "  for (const required of ffFinishes) if (required > efNet) efNet = required;\n",
    replace: "",
    expectFailing: only(
      "an FF link holds its finish: B keeps its start and finishes with A, with no amber warning",
      "a hard Must Finish On holds the finish on its day; one it cannot meet is the red error, and the FF link it breaks is amber",
    ),
  },
  {
    id: "2b' an In Progress row's deadline no longer checked (the prototype's skip)  [expect 2]",
    file: SCHEDULE,
    find: "    if (recordSetsConstraintAside(activity.constraintType, records.get(id))) continue;\n",
    replace: "    if (records.has(id)) continue;\n",
    expectFailing: only(
      "a soft Finish No Later Than it misses warns, as on v0.79.36",
      "a hard Finish No Later Than it misses is the red error, as on v0.79.36",
    ),
  },
  {
    id: "2c  the note ignores a lag again  [expect 2]",
    file: WORDS,
    find: "  if (note.lagDays !== 0) {\n",
    replace: "  if (false) {\n",
    expectFailing: only(
      "FS with a 3-day lag names what the link allowed (the brief's own example)",
      "SS with a 1-day lag, and FS with a 2-day lead",
    ),
  },
  {
    id: "2d  Save no longer refuses impossible dates  [expect 5]",
    file: WINDOW,
    find: "    nameMissing, negativeEstimate, constraintType, constraintDate, constraintMode, dateFault !== null,\n",
    replace: "    nameMissing, negativeEstimate, constraintType, constraintDate, constraintMode, false,\n",
    expectFailing: only(
      "a finish before the start",
      "a start after the finish marks the start",
      "a date after today",
      "a start before the scenario's Start Date",
      "(f) a typed finish with no start is refused: Enter the Actual Start first.",
    ),
  },
  {
    id: "2g  ruling 3 undone: a row started before v0.80.0 takes its scheduled start when Complete  [expect 4]",
    file: RECORD,
    find: "    const start = activity.actualStartDate;\n",
    replace: "    const start = activity.actualStartDate ?? ctx.scheduledStart;\n",
    expectFailing: only(
      "a row In Progress before v0.80.0 set to Complete gets NO dates and keeps its count (ruling 3)",
      "several marked Complete at once: each its own dates, by the rule; one step to undo (v0.79.36 made one per row)",
      "In Progress with NO start → Complete (ruling 3): no dates, its count kept",
      "In Progress with no start and no count → Complete: its scheduled duration, no dates",
    ),
  },
  {
    id: "2g' ruling 5 undone: an overdue Planned row completes today, not on its scheduled dates  [expect 3]",
    file: RECORD,
    find: "  if (scheduledStart && scheduledFinish && scheduledFinish <= today) {\n",
    replace: "  if (false) {\n",
    expectFailing: only(
      "Planned → Complete, already due: its scheduled start and finish",
      "WI-137: gives each activity its own dates and count, by the one rule",
      "issues TWO entries for an activity that is both completed and recalculated",
    ),
  },
  {
    // v0.83.1 (WI-158) moved this needle: the window's drafts change through ONE edit per action, so
    // the blur's early return now writes the snapped start first. Removing the branch is the same straw.
    // ⚠️ Run at v0.83.1 it failed 2 for its 1: WI-158's D4_TOUCHED blurs a Saturday start the user's
    // count stands on, and a blur alone recounting it gives 5 for the typed 6 — the same rule. Added.
    id: "2i  elapsed recounted on a blur alone  [expect 2]",
    file: WINDOW,
    find: "      if (snapped === committedStartDate) {\n        edit({ actualStartDate: snapped });\n        return;\n      }\n",
    replace: "",
    expectFailing: only(
      "a blur alone keeps a typed count; a new start recounts",
      "D4: once the count is changed here, a blur never snaps the start the window shows over another writer's",
    ),
  },
  {
    id: "2k  a bulk Apply written row by row again  [expect 2]",
    file: BULK,
    find: "  if (onBulkUpdateEach) {\n    onBulkUpdateEach(bulkUpdatesById(ids, plan));\n    return;\n  }\n",
    replace: "",
    expectFailing: only(
      "three rows set In Progress at once; one Undo puts all three back",
      "several marked Complete at once: each its own dates, by the rule; one step to undo (v0.79.36 made one per row)",
    ),
  },
];
