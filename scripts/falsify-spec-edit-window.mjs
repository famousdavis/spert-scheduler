// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Falsification spec for WI-158 (v0.83.1): the Edit Activity window saves ONLY what the user changed,
// and shows the activity as it is now (owner, R653: B, D1–D5; Review 38's G1 and G2).
//
// One straw per rule. Each names EXACTLY the tests it must fail, written here BEFORE the run and
// never inferred from it: read "K failing; named-match K", not merely a non-zero exit — the runner
// prints ✔ when ANY named test fails, and a straw that under-fires looks exactly like a test that
// over-claims. testFile is the whole suite (R95): a straw must move nothing it does not name.
const MODAL = new URL("../src/ui/components/ActivityEditModal.tsx", import.meta.url).pathname;
const CHANGES = new URL("../src/ui/helpers/edit-window-changes.ts", import.meta.url).pathname;
const PAGE = new URL("../src/ui/pages/ProjectPage.tsx", import.meta.url).pathname;

// ActivityEditModal.outside-write.test.tsx — a Save with no edit keeps another writer's change.
const G4 = "Review 37, G4: a Planned row recorded In Progress meanwhile stays In Progress, with its dates";
const STALE = "a Planned row's stale count and Actual Start: no Status or date was changed, so neither is cleared";
// … the unsaved-changes prompts.
const CANCEL = "Cancel after another writer's change asks nothing";
const ESCAPE = "Escape after another writer's change asks nothing, and the change stays";
// … what the user changed is saved onto the row as it is now.
const ONE_BY_ONE = "Min, ML and Max are saved one by one: ML typed here, Min and Max from the other writer";
const TOGETHER = "D1: Status, its dates and count are saved together: a count typed here keeps the row consistent";
const D4 = "D4: tabbing through an Actual Start the user did not change never snaps it over another writer's";
const D4_TOUCHED = "D4: once the count is changed here, a blur never snaps the start the window shows over another writer's";
const D2_PLANNED = "D2: a row set back to Planned elsewhere, then Complete here: the rule reads the Planned row the window shows, and the plan's dates";
const RULE = "D2: the Status rule runs on the activity as the window shows it — In Progress → Complete keeps the recorded start";
// … B.
const SHOWS = "every untouched field shows another writer's value as it arrives";
const P1B = "Review 38 P1b: ML being typed keeps the user's ML; the other writer's Max shows, and is what Save keeps";
const P3 = "Review 38 P3: Notes changed elsewhere while collapsed — opened, the section shows theirs, and the user's addition keeps it";
const P11 = "Review 38 P11: a start recorded elsewhere shows at once, and a Save with no edit keeps it";
const FOLLOW_AGAIN = "an edit taken back to what the part showed lets the part follow the live row again";
// … D1.
const P1 = "Review 38 P1: a count typed here, then the Actual Start moved elsewhere: the window's Status and dates are saved";
const P13_OTHER = "Review 38 P13, the other order: a Note typed, then the Date moved elsewhere: the window's constraint is saved";
const P10A = "Review 38 P10a: Task one ticked here, Task two added elsewhere: the window's list is saved";
const P10B = "Review 38 P10b: Task one ticked here, deleted elsewhere: the window's list is saved";
const P10C = "Review 38 P10c (D4): a task only typed in its box is added to the list as it is now";
const NAME_BOTH = "a Name typed here, then renamed elsewhere: the window's Name is saved, and the line says so";
// … G1 and G2.
const P5D = "Review 38 P5d (G1): Escape's Save, answered after another writer recorded Complete, writes one consistent Status and dates";
const P4 = "Review 38 P4 (G2): recorded dates the window does not write never block a Notes edit";
const G2_DATES = "G2: once Status or a date is changed, the same dates are judged and Save says why";
const G2_NAME = "G2: an unnamed row's empty Name never blocks another edit; clearing a Name still does";
// … D3.
const NO_LINE = "is not there while nothing else has changed the activity";
const NO_LINE_OTHER = "is not there for a change to another activity";
// edit-window-changes.test.ts
const U_CLEAR = "writes a clear as an own property, and only for a part changed here";
const U_MINE = "a part changed here is the user's, from the row it was changed on, whatever arrives after";
const U_DROP = "an edit that comes back to its baseline is dropped, so the part follows the live row again";
const U_D2 = "D2 and D4: the Status rule's row and the committed start follow the live row until the user changes Status or a date";
const U_NO_LINE = "none while nothing has changed somewhere else, whatever was changed here";
const U_LABELS = "names the fields changed somewhere else by their labels, in the window's order, ending one sentence";
const U_AFTER = "a part the user changed AFTER the other writer's change is named too: Save keeps the window's";
const U_EVERY = "each part the user had changed too, in every form: the field, the Status and dates, the constraint, the lists";
const U_SHOWN_ONLY = "owner, R656: with a part the user changed too, the window says it shows only the new values it shows";
const U_SHOWN_PERIOD = "owner, R656: a shown label that ends in a period ends its sentence once";
// ActivityEditModal.test.tsx (v0.79.28, WI-138), unedited.
const T2 = "T2 Save adds a typed task to the existing ones, trimmed, once";
const T5 = "T5 typed text alone: Escape asks the three-way question, and its Save adds the task";
// ProjectPage.undo-in-window.test.tsx
const D5_STATUS = "Ctrl+Z and Cmd+Z on the window's Status leave the page's last change alone, and the window open";
const D5_REDO = "Ctrl+Y and Ctrl+Shift+Z on the window's Save leave an undone change undone";
const D5_R2 = "Review 38 R2: Ctrl+Z inside the window cannot undo the scenario's unlock, so Save keeps the user's edit";

const escape = (s) => s.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

/** Matches exactly these test titles, as the verbose reporter prints them. */
const only = (...titles) => new RegExp(`> (?:${titles.map(escape).join("|")})$`);

const WRITES = "    fields: onlyChangedParts(fieldUpdatesFor(live, drafts, plannedPair), changedHere),";
const PROMPTS = "  const hasChanges = writesAnything(writes);";

// ⚠️ v0.83.1 rewrote this spec for B (owner, R653). Under B a part the user has not changed SHOWS the
// live row, so v0.83.0's comparisons are unreachable for it: the patch's E2 (changed judged against
// the live row), E11 and E12 (the lists and Notes written when they differ from the live row) kill
// nothing now — the window's untouched lists and Notes ARE the live row's — and were retired. Their
// guards in `ownListWrites` stay, as defence. E2 below is B's own straw.
export const testFile = "src/";
export const mutations = [
  {
    // Save writes every field that differs from the LIVE row. Under B only a derived write differs:
    // a Planned row's stale count and Actual Start, cleared with no Status or date change.
    id: "E1  every difference from the live row written, not only parts changed here  [expect 2]",
    file: CHANGES,
    find: "    if (part !== undefined && changedHere.has(part)) Object.assign(out, { [key]: toWindow[key] });",
    replace: "    if (part !== undefined) Object.assign(out, { [key]: toWindow[key] });",
    expectFailing: only(STALE, U_CLEAR),
  },
  {
    // B undone: the window shows the row as it OPENED (A), while Save still reads the live row.
    // (Registered and run as [expect 7], exact; D2_PLANNED, written afterwards for E8, reads the
    // Status the window shows too, so the set was widened to 8 before the whole-spec run.)
    id: "E2  B: the window shows the row as it opened, not as it is now  [expect 8]",
    file: MODAL,
    find: "  const shown = useMemo(() => shownDrafts(edits, activity), [edits, activity]);",
    replace: "  const shown = useMemo(() => shownDrafts(edits, opened), [edits, opened]);",
    expectFailing: only(D4, RULE, D2_PLANNED, SHOWS, P1B, P3, P11, FOLLOW_AGAIN),
  },
  {
    // The Status part written as its difference from the row the user changed it on: half written
    // onto the live row — the other writer's start, finish or Status kept under the user's count.
    id: "E3  the Status part written against the row it was changed on, not the live one  [expect 5]",
    file: MODAL,
    find: WRITES,
    replace: "    fields: onlyChangedParts(fieldUpdatesFor(progressRow(edits, live) ?? live, drafts, plannedPair), changedHere),",
    expectFailing: only(P1, TOGETHER, P5D, "Review 38 P5e (control): the same write, then the window's own Save", D4_TOUCHED),
  },
  {
    // Min joins ML's part: an ML typed here writes the window's Min over the other writer's.
    id: "E4  Min, ML and Max one part, not three  [expect 1]",
    file: CHANGES,
    find: "  mostLikely: [\"mostLikely\"],",
    replace: "  mostLikely: [\"mostLikely\", \"min\"],",
    expectFailing: only(ONE_BY_ONE),
  },
  {
    // The Status part always written: its derived writes run on every Save.
    id: "E5  Status's derived writes on every Save, not only when Status, a date or the count changed  [expect 1]",
    file: MODAL,
    find: WRITES,
    replace: "    fields: onlyChangedParts(fieldUpdatesFor(live, drafts, plannedPair), new Set([...changedHere, \"progress\"])),",
    expectFailing: only(STALE),
  },
  {
    // The count its own part: a count typed here is written alone, the window's Actual Start is not,
    // and the dates are not judged. ⚠️ First registered as [expect 7]; the run failed U_CLEAR too —
    // the written fields take their parts from the same table (`FIELD_PART` spreads `PART_OF`), so
    // a clear of the count is no longer in "progress". Read from the code, then the set corrected.
    id: "E6  the count its own part, not part of Status  [expect 8]",
    file: CHANGES,
    find: "  progress: [\"status\", \"actualStartDate\", \"actualFinishDate\", \"actualDuration\"],",
    replace: "  progress: [\"status\", \"actualStartDate\", \"actualFinishDate\"], actualDuration: [\"actualDuration\"],",
    expectFailing: only(TOGETHER, P1, G2_DATES, U_CLEAR, U_MINE, U_D2, U_EVERY, D4_TOUCHED),
  },
  {
    // D4 reads the live start: a blur alone snaps the window's own Saturday and recounts.
    id: "E7  D4 judged against the live date, not the date the window shows  [expect 1]",
    file: MODAL,
    find: "  const { actualStartDate: storedStartDate, actualFinishDate: storedFinishDate } = seedDrafts(shownRow);",
    replace: "  const { actualStartDate: storedStartDate, actualFinishDate: storedFinishDate } = seedDrafts(activity);",
    expectFailing: only(D4_TOUCHED),
  },
  {
    // D2 as the design had it: the Status rule on the row as the window opened. Under B the rule's
    // from-Status and dates are the window's drafts, which show the live row, so this row only picks
    // the schedule the rule reads: the plan for a row the window shows Planned, else the page's. A row
    // opened In Progress and set back to Planned elsewhere then reads the page's schedule, which holds
    // it at today, instead of the plan. ⚠️ First registered as [expect 1: RULE]; it SURVIVED (0
    // failing) — RULE's row is In Progress either way — so D2_PLANNED was written to reach it.
    id: "E8  the Status rule run on the row as the window opened it  [expect 1]",
    file: MODAL,
    find: "                      const row = shownRow ?? activity;",
    replace: "                      const row = opened ?? activity;",
    expectFailing: only(D2_PLANNED),
  },
  {
    // The Planned pair from the live row: under a count typed here, a row set back to Planned
    // meanwhile loses the pair the window shows.
    id: "E9  the Planned pair derived from the live row  [expect 1]",
    file: MODAL,
    find: "  const plannedPair = useMemo(() => derivedPlannedPair(shownRow, status, planSa), [shownRow, status, planSa]);",
    replace: "  const plannedPair = useMemo(() => derivedPlannedPair(activity, status, planSa), [activity, status, planSa]);",
    expectFailing: only(TOGETHER),
  },
  {
    // The prompts count another writer's change as the user's.
    id: "E10  the prompts ask about a change made somewhere else  [expect 2]",
    file: MODAL,
    find: PROMPTS,
    replace: "  const hasChanges = writesAnything(writes) || opened !== activity;",
    expectFailing: only(CANCEL, ESCAPE),
  },
  {
    // An edit brought back to its baseline is kept: the part keeps the old value over the live one.
    id: "E11  an edit back at its baseline kept, so the part stops following the live row  [expect 2]",
    file: CHANGES,
    find: "    next[part] = partDiffers(part, seedDrafts(edit.base), edit.draft) ? edit : undefined;",
    replace: "    next[part] = edit;",
    expectFailing: only(U_DROP, FOLLOW_AGAIN),
  },
  {
    // G1 undone: Save writes onto the row of the render it was made in — Escape's "Save", answered
    // after another writer's change, leaves their finish under the user's In Progress.
    id: "E12  G1: Save on the row of its render, not the row in the store when it runs  [expect 1]",
    file: MODAL,
    find: "      storedRow(projectId, scenarioId, activityId), edits, { task: newTaskText, deliverable: newDeliverableText }, plannedPair,",
    replace: "      activity, edits, { task: newTaskText, deliverable: newDeliverableText }, plannedPair,",
    also: { find: "  }, [\n    edits,\n    newTaskText,", replace: "  }, [\n    activity,\n    edits,\n    newTaskText," },
    expectFailing: only(P5D),
  },
  {
    id: "E13  the line shown with no change elsewhere  [expect 3]",
    file: CHANGES,
    find: "  if (elsewhere.length === 0) return null;",
    replace: "  if (elsewhere.length < 0) return null;",
    expectFailing: only(NO_LINE, NO_LINE_OTHER, U_NO_LINE),
  },
  {
    // (Run exact at [expect 7] before the line named a part the user changed AFTER the other writer
    // too — the owner's words set no order; P3 and U_AFTER joined then, so it was re-registered.)
    // (Owner, R656: two unit tests of the "now shows" sentence also carry a part changed here: 9 → 11.)
    id: "E14  the line names no part the user had changed too  [expect 11]",
    file: CHANGES,
    find: "    ...both.map((p) => bothSentence(p, edits[p]!)),",
    replace: "",
    expectFailing: only(P1B, P3, P1, P13_OTHER, P10A, P10B, NAME_BOTH, U_AFTER, U_EVERY, U_SHOWN_ONLY, U_SHOWN_PERIOD),
  },
  {
    id: "E20  owner, R656: the line says the window shows the new values even where it shows the user's  [expect 11]",
    file: CHANGES,
    find: "  if (!anyBoth) return [\"The window now shows the new values.\"];",
    replace: "  return [\"The window now shows the new values.\"];",
    expectFailing: only(P1B, P3, P1, P13_OTHER, P10A, P10B, NAME_BOTH, U_AFTER, U_EVERY, U_SHOWN_ONLY, U_SHOWN_PERIOD),
  },
  {
    id: "E15  the Planned dates left out of the line  [expect 2]",
    file: CHANGES,
    find: "  [\"plannedStartDate\", \"Planned Start\"], [\"actualStartDate\", \"Actual Start\"],",
    replace: "  [\"actualStartDate\", \"Actual Start\"],",
    also: {
      find: "  [\"plannedFinishDate\", \"Planned Finish\"], [\"actualFinishDate\", \"Actual Finish\"],",
      replace: "  [\"actualFinishDate\", \"Actual Finish\"],",
    },
    expectFailing: only(P11, U_LABELS),
  },
  {
    // G2 undone for the dates: recorded dates Save does not write still block it.
    id: "E16  G2: the dates judged though Status and its dates were not changed  [expect 2]",
    file: MODAL,
    find: "    dateFault: changedHere.has(\"progress\") ? actualDatesFault(dates) : null,",
    replace: "    dateFault: actualDatesFault(dates),",
    expectFailing: only(P4, G2_DATES),
  },
  {
    id: "E17  G2: an unchanged empty Name judged  [expect 1]",
    file: MODAL,
    find: "    nameMissing: changedHere.has(\"name\") && name.trim().length === 0,",
    replace: "    nameMissing: name.trim().length === 0,",
    expectFailing: only(G2_NAME),
  },
  {
    // D4's append rule: a task only typed in its box joins the list as it is now. Here it replaces it.
    id: "E18  a task only typed in its box replaces the list, not joins it  [expect 3]",
    file: MODAL,
    find: "    checklist: withTypedItem(shown.checklist, typed.task),",
    replace: "    checklist: withTypedItem(typed.task.trim() ? [] : shown.checklist, typed.task),",
    expectFailing: only(P10C, T2, T5),
  },
  {
    // D5 undone: Ctrl/Cmd+Z and Redo inside an open window act on the page behind it.
    id: "E19  the undo guard removed: Undo and Redo reach the page from inside a window  [expect 3]",
    file: PAGE,
    find: "      if (target.closest?.('[role=\"dialog\"], [role=\"alertdialog\"]')) return;",
    replace: "",
    expectFailing: only(D5_STATUS, D5_REDO, D5_R2),
  },
];
