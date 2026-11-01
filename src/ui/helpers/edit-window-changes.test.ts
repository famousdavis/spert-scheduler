// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import type { Activity } from "@domain/models/types";
import { createActivity } from "@app/api/project-service";
import { DEFAULT_SCENARIO_SETTINGS } from "@domain/models/types";
import {
  changedWhileOpenLine,
  committedStartOf,
  editDrafts,
  onlyChangedParts,
  progressRow,
  seedDrafts,
  shownDrafts,
  writesAnything,
  type WindowEdits,
  type WindowPart,
} from "./edit-window-changes";

/**
 * WI-158 — the parts of `edit-window-changes.ts` the window's own tests cannot reach
 * (`ActivityEditModal.outside-write.test.tsx` drives the rest through the real store and window).
 */
const row = (extra: Partial<Activity> = {}): Activity => ({ ...createActivity("Build", DEFAULT_SCENARIO_SETTINGS), ...extra });
const STARTED: Partial<Activity> = { status: "inProgress", actualStartDate: "2026-10-19", actualDuration: 10 };
const TASKS = [{ id: "t1", text: "Task one", completed: false }];
const LISTS: Partial<Activity> = { checklist: TASKS, deliverables: [{ id: "d1", text: "Spec", completed: false }] };

describe("edit-window-changes", () => {
  it("seeds a missing row with the window's own defaults, as its drafts were seeded before v0.83.1", () => {
    expect(seedDrafts(undefined)).toEqual({
      name: "", description: "", status: "planned", actualStartDate: "", actualFinishDate: "", actualDuration: "",
      min: "", mostLikely: "", max: "", confidenceLevel: "mediumConfidence", distributionType: "normal",
      constraintType: null, constraintDate: null, constraintMode: null, constraintNote: null,
      checklist: [], deliverables: [], notes: "",
    });
  });

  it("writes a clear as an own property, and only for a part changed here", () => {
    const out = onlyChangedParts({ actualDuration: undefined, name: "Build v2" }, new Set<WindowPart>(["progress"]));
    expect(Object.keys(out)).toEqual(["actualDuration"]);
    expect(writesAnything({
      fields: out, checklist: false, deliverables: false, notes: false, changedHere: new Set(), drafts: seedDrafts(undefined),
    })).toBe(true);
  });
});

describe("B: the window shows the live row, with each part the user changed laid over it", () => {
  it("a part nobody changed here follows the live row", () => {
    const live = row({ name: "Build v2" });
    expect(shownDrafts({}, live).name).toBe("Build v2");
  });

  it("a part changed here is the user's, from the row it was changed on, whatever arrives after", () => {
    const edits = editDrafts({}, row(STARTED), { actualDuration: 9 });
    const later = row({ ...STARTED, actualStartDate: "2026-10-21", actualDuration: 8 });
    expect(edits.progress?.base.actualStartDate).toBe("2026-10-19");
    const shown = shownDrafts(edits, later);
    expect([shown.actualStartDate, shown.actualDuration]).toEqual(["2026-10-19", 9]);
  });

  it("an edit that comes back to its baseline is dropped, so the part follows the live row again", () => {
    const live = row();
    const typed = editDrafts({}, live, { name: "Buildx" });
    expect(typed.name).toBeDefined();
    expect(editDrafts(typed, live, { name: "Build" }).name).toBeUndefined();
  });

  it("one action is one edit: clearing the constraint moves its four fields together", () => {
    const live = row({ constraintType: "MSO", constraintDate: "2026-10-14", constraintMode: "hard" });
    const edits: WindowEdits = editDrafts({}, live, {
      constraintType: null, constraintDate: null, constraintMode: null, constraintNote: null,
    });
    const shown = shownDrafts(edits, row({ constraintType: "MFO", constraintDate: "2026-10-21", constraintMode: "soft" }));
    expect([shown.constraintType, shown.constraintDate, shown.constraintMode]).toEqual([null, null, null]);
  });

  it("D2 and D4: the Status rule's row and the committed start follow the live row until the user changes Status or a date", () => {
    const live = row({ ...STARTED, actualStartDate: "2026-10-21" });
    expect(progressRow({}, live)).toBe(live);
    expect(committedStartOf({}, live)).toBe("2026-10-21");
    const edits = editDrafts({}, row(STARTED), { actualDuration: 9 });
    expect(progressRow(edits, live)?.actualStartDate).toBe("2026-10-19");
    expect(committedStartOf(edits, live)).toBe("2026-10-19");
    expect(committedStartOf(editDrafts(edits, row(STARTED), {}, "2026-10-20"), live)).toBe("2026-10-20");
  });
});

describe("D3: the line", () => {
  const opened = row({ ...STARTED, ...LISTS, plannedStartDate: "2026-10-12", plannedFinishDate: "2026-10-16" });

  it("none while nothing has changed somewhere else, whatever was changed here", () => {
    expect(changedWhileOpenLine(opened, opened, editDrafts({}, opened, { name: "Mine", notes: "Mine" }))).toBeNull();
  });

  it("names the fields changed somewhere else by their labels, in the window's order, ending one sentence", () => {
    const live = { ...opened, notes: "Note two", actualDuration: 11, status: "complete" as const, plannedFinishDate: "2026-10-23" };
    expect(changedWhileOpenLine(opened, live, {})).toBe(
      "Changed somewhere else while this window was open: Status, Planned Finish, Actual Dur. and Notes. The window now shows the new values.",
    );
    expect(changedWhileOpenLine(opened, { ...opened, actualDuration: 11 }, {})).toBe(
      "Changed somewhere else while this window was open: Actual Dur. The window now shows the new values.",
    );
  });

  it("a part the user changed AFTER the other writer's change is named too: Save keeps the window's", () => {
    const live = { ...opened, name: "Build v2" };
    expect(changedWhileOpenLine(opened, live, editDrafts({}, live, { name: "Build (mine)" }))).toBe(
      "Changed somewhere else while this window was open: Name. You had changed Name too: Save keeps the Name this window shows.",
    );
  });

  it("owner, R656: with a part the user changed too, the window says it shows only the new values it shows", () => {
    const live = { ...opened, name: "Build v2", notes: "Note two" };
    expect(changedWhileOpenLine(opened, live, editDrafts({}, opened, { name: "Build (mine)" }))).toBe(
      "Changed somewhere else while this window was open: Name and Notes. The window now shows the new Notes. You had changed Name too: Save keeps the Name this window shows.",
    );
  });

  it("owner, R656: a shown label that ends in a period ends its sentence once", () => {
    const live = { ...opened, name: "Build v2", actualDuration: 11 };
    expect(changedWhileOpenLine(opened, live, editDrafts({}, opened, { name: "Build (mine)" }))).toBe(
      "Changed somewhere else while this window was open: Name and Actual Dur. The window now shows the new Actual Dur. You had changed Name too: Save keeps the Name this window shows.",
    );
  });

  it("a list changed only by its box has no second sentence: Save adds the item to the list as it is now", () => {
    const live = { ...opened, checklist: [] };
    expect(changedWhileOpenLine(opened, live, {})).toBe(
      "Changed somewhere else while this window was open: Tasks. The window now shows the new values.",
    );
  });

  it("each part the user had changed too, in every form: the field, the Status and dates, the constraint, the lists", () => {
    let edits: WindowEdits = {};
    edits = editDrafts(edits, opened, { name: "Build (mine)" });
    edits = editDrafts(edits, opened, { actualDuration: 9 });
    edits = editDrafts(edits, opened, { constraintType: "MSO", constraintDate: "2026-10-14", constraintMode: "hard" });
    edits = editDrafts(edits, opened, { checklist: [{ ...TASKS[0]!, completed: true }] });
    edits = editDrafts(edits, opened, { deliverables: [] });
    const live: Activity = {
      ...opened, name: "Build v2", actualStartDate: "2026-10-21", constraintType: "MFO", constraintDate: "2026-10-23",
      constraintMode: "soft", checklist: [], deliverables: [...(opened.deliverables ?? []), { id: "d2", text: "Plan", completed: false }],
    };
    expect(changedWhileOpenLine(opened, live, edits)).toBe([
      "Changed somewhere else while this window was open: Name, Actual Start, Scheduling Constraint, Tasks and Deliverables.",
      "You had changed Name too: Save keeps the Name this window shows.",
      "You had changed Actual Dur. too: Save keeps the Status and dates this window shows.",
      "You had changed Scheduling Constraint too: Save keeps the constraint this window shows.",
      "You had changed Tasks too: Save keeps the list this window shows.",
      "You had changed Deliverables too: Save keeps the list this window shows.",
    ].join(" "));
  });
});
