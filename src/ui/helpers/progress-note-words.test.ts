// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import type { LinkProgressNote, ProgressNote } from "@domain/models/types";
import { progressNoteKey, progressNoteSentence } from "./progress-note-words";

/** MM/DD/YYYY, written out so the expected sentences below read as the user sees them. */
const us = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;

function link(overrides: Partial<LinkProgressNote> = {}): LinkProgressNote {
  return {
    kind: "link", activityId: "b", activityName: "B Build", event: "start", date: "2026-10-19",
    predecessorId: "a", predecessorName: "A Requirements", predecessorComplete: true, dependencyType: "FS", lagDays: 0,
    predecessorDate: "2026-10-23", allowedDate: "2026-10-26", sequential: false,
    ...overrides,
  };
}

describe("progressNoteSentence (WI-137, 2c) — composed from the note's fields", () => {
  it("FS, no lag, the predecessor Complete", () => {
    expect(progressNoteSentence(link(), us)).toBe(
      "B Build started on 10/19/2026, before A Requirements finished on 10/23/2026. The schedule keeps the start you recorded.",
    );
  });

  it("FS, no lag, the predecessor still open", () => {
    expect(progressNoteSentence(link({ predecessorComplete: false, predecessorDate: "2026-10-28" }), us)).toBe(
      "B Build started on 10/19/2026, before A Requirements finished (it is scheduled to finish on 10/28/2026). The schedule keeps the start you recorded.",
    );
  });

  it("dependencies off: the predecessor is the activity above it", () => {
    expect(progressNoteSentence(link({ sequential: true }), us)).toBe(
      "B Build started on 10/19/2026, before A Requirements, the activity above it, finished on 10/23/2026. The schedule keeps the start you recorded.",
    );
  });

  it("FS with a 3-day lag names what the link allowed (the brief's own example)", () => {
    expect(progressNoteSentence(link({ activityName: "B", predecessorName: "A", date: "2026-10-20", lagDays: 3, predecessorDate: "2026-10-16", allowedDate: "2026-10-22", predecessorComplete: false }), us)).toBe(
      "B started on 10/20/2026; its link from A (finish-to-start, 3 days' lag) allowed 10/22/2026 at the earliest. The schedule keeps the start you recorded.",
    );
  });

  it("SS with a 1-day lag, and FS with a 2-day lead", () => {
    expect(progressNoteSentence(link({ dependencyType: "SS", lagDays: 1, allowedDate: "2026-10-20" }), us)).toBe(
      "B Build started on 10/19/2026; its link from A Requirements (start-to-start, 1 day's lag) allowed 10/20/2026 at the earliest. The schedule keeps the start you recorded.",
    );
    expect(progressNoteSentence(link({ lagDays: -2, allowedDate: "2026-10-22" }), us)).toBe(
      "B Build started on 10/19/2026; its link from A Requirements (finish-to-start, 2 days' lead) allowed 10/22/2026 at the earliest. The schedule keeps the start you recorded.",
    );
  });

  it("SS and FF with no lag", () => {
    expect(progressNoteSentence(link({ dependencyType: "SS", predecessorDate: "2026-10-20" }), us)).toBe(
      "B Build started on 10/19/2026, before A Requirements started on 10/20/2026. The schedule keeps the start you recorded.",
    );
    expect(progressNoteSentence(link({ dependencyType: "FF", event: "finish", date: "2026-10-21" }), us)).toBe(
      "B Build finished on 10/21/2026, before A Requirements finished on 10/23/2026. The schedule keeps the dates you recorded.",
    );
  });

  it("a date inside an activity's name is shown as typed (no rewriting of a sentence)", () => {
    expect(progressNoteSentence(link({ activityName: "Cutover 2026-11-15", predecessorName: "" }), us)).toBe(
      "Cutover 2026-11-15 started on 10/19/2026, before (unnamed) finished on 10/23/2026. The schedule keeps the start you recorded.",
    );
  });

  it("constraints and the Start Date", () => {
    const notes: ProgressNote[] = [
      { kind: "constraint", activityId: "b", activityName: "B", event: "start", date: "2026-10-19", constraintType: "MSO", constraintDate: "2026-10-26" },
      { kind: "constraint", activityId: "b", activityName: "B", event: "start", date: "2026-10-19", constraintType: "SNET", constraintDate: "2026-11-02" },
      { kind: "constraint", activityId: "a", activityName: "A", event: "finish", date: "2026-10-23", constraintType: "FNLT", constraintDate: "2026-10-20" },
      { kind: "before-start-date", activityId: "a", activityName: "A", date: "2026-09-28", startDate: "2026-10-05" },
    ];
    expect(notes.map((n) => progressNoteSentence(n, us))).toEqual([
      "B started on 10/19/2026, not on its Must Start On date, 10/26/2026. The schedule keeps the start you recorded.",
      "B started on 10/19/2026, before its Start No Earlier Than date, 11/02/2026. The schedule keeps the start you recorded.",
      "A finished on 10/23/2026, after its Finish No Later Than date, 10/20/2026. The schedule keeps the dates you recorded.",
      "A started on 09/28/2026, before this scenario's Start Date, 10/05/2026, so the schedule shows it starting on 10/05/2026.",
    ]);
    expect(notes.map(progressNoteKey)).toEqual(["constraint-b", "constraint-b", "constraint-a", "start-date-a"]);
  });
});
