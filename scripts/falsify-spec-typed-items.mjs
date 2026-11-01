// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Falsification spec for a task or deliverable typed but not added (v0.79.28, WI-138).
//
// In the Edit Activity window, Save — and the save Escape offers — adds the text left in the
// "Add a task…" and "Add a deliverable…" boxes, trimmed, nothing when blank; and that text counts
// as an unsaved change, so Cancel and Escape ask. Each straw below names EXACTLY the tests it must
// fail, and no others — read "K failing; named-match K", not merely a non-zero exit: the runner
// prints ✔ when ANY named test fails. Each set was observed by running the straw alone against
// the whole suite before it was written here.
//
// testFile is all of src/, so every straw runs against the whole suite.
const MODAL = new URL("../src/ui/components/ActivityEditModal.tsx", import.meta.url).pathname;
const TASKS = new URL("../src/ui/components/ChecklistSection.tsx", import.meta.url).pathname;
const DELIVERABLES = new URL("../src/ui/components/DeliverablesSection.tsx", import.meta.url).pathname;

// ActivityEditModal.test.tsx — "a task or deliverable typed but not added (WI-138)".
const T1 = "T1 Save adds a typed deliverable to the existing ones, trimmed, once";
const T2 = "T2 Save adds a typed task to the existing ones, trimmed, once";
const T3 = "T3 only spaces in both boxes: Save sends no task or deliverable update at all";
const T4 = "T4 typed text alone: Cancel asks to discard, and Keep editing keeps the text in the box";
const T5 = "T5 typed text alone: Escape asks the three-way question, and its Save adds the task";
const T6D = "T6 deliverables: Add and Enter still add and clear the box, and Save then adds nothing more";
const T6T = "T6 tasks: Add and Enter still add and clear the box, and Save then adds nothing more";
// ActivityEditModal.outside-write.test.tsx (v0.83.1, WI-158): the box's item joins the list as it is now.
const P10C = "Review 38 P10c (D4): a task only typed in its box is added to the list as it is now";
const D4D = "D4: a deliverable only typed in its box is added to the list as it is now";

const escape = (s) => s.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

/** Matches exactly these test titles, as the verbose reporter prints them. */
const only = (...titles) => new RegExp(`> (?:${titles.map(escape).join("|")})$`);

export const testFile = "src/";
export const mutations = [
  // ⚠️ v0.83.1 (WI-158) moved S1–S3: Save and both prompts now read ONE set of drafts, in which the
  // boxes' text is already in its list, so the three needles name that one place. S1 gains T4, which
  // types in the Deliverables box: a box ignored there is ignored by Cancel's question too. S3 keeps
  // its regression — the prompts reading lists without the boxes while Save still adds them —
  // written as that mistake. (First drafted with T4 under S2; the run put it under S1, and T4's
  // `openSection("Deliverables")` says why.) Its review build (B, owner R653) moved the needles into
  // `windowWrites`, and S1 and S2 each gain the WI-158 test that types in the same box.
  {
    id: "S1  Save ignores the deliverable box  [expect 3: T1, T4, D4 deliverable]",
    file: MODAL,
    find: "    deliverables: withTypedItem(shown.deliverables, typed.deliverable),",
    replace: "    deliverables: shown.deliverables,",
    expectFailing: only(T1, T4, D4D),
  },
  {
    // T5's save goes through the same drafts, so the task it types is lost too.
    id: "S2  Save ignores the task box  [expect 3: T2, T5, P10c]",
    file: MODAL,
    find: "    checklist: withTypedItem(shown.checklist, typed.task),",
    replace: "    checklist: shown.checklist,",
    expectFailing: only(T2, T5, P10C),
  },
  {
    // With nothing else changed, Cancel and Escape close without asking.
    id: "S3  hasChanges ignores the boxes  [expect 2: T4, T5]",
    file: MODAL,
    find: "  const hasChanges = writesAnything(writes);",
    replace: "  const hasChanges = writesAnything(windowWrites(activity, edits, { task: \"\", deliverable: \"\" }, plannedPair));",
    expectFailing: only(T4, T5),
  },
  {
    // The surrounding spaces reach the store (T1, T2), and a box of spaces becomes an item (T3).
    // T4 and T5 type no surrounding spaces, so they hold.
    id: "S4  the trim removed  [expect 3: T1, T2, T3]",
    file: MODAL,
    find: "  const text = typed.trim();",
    replace: "  const text = typed;",
    expectFailing: only(T1, T2, T3),
  },
  {
    id: "S5  the deliverables' Add leaves its text in the box  [expect 1: T6 deliverables]",
    file: DELIVERABLES,
    find: '    onNewTextChange("");\n',
    replace: "",
    expectFailing: only(T6D),
  },
  {
    id: "S6  the tasks' Add leaves its text in the box  [expect 1: T6 tasks]",
    file: TASKS,
    find: '    onNewTaskTextChange("");\n',
    replace: "",
    expectFailing: only(T6T),
  },
];
