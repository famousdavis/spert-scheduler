// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import type { Activity, LinkProgressNote } from "@domain/models/types";
import { computeDependencySchedule } from "@core/schedule/deterministic";
import { progressNoteSentence } from "./progress-note-words";

/**
 * WI-150 (Review 34, V-E3): a progress note said "The schedule keeps the start you recorded." of a
 * start the schedule had MOVED — a Saturday Actual Start drawn on the Monday. It now names the date
 * recorded and the date shown. Mon–Fri calendar; values written out by hand: Mon 5 Oct, Sat 17 Oct,
 * Mon 19 Oct, Fri 23 Oct 2026.
 */
const fmt = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8)}/${iso.slice(0, 4)}`;
const act = (id: string, overrides: Partial<Activity>): Activity => ({
  id, name: id, min: 5, mostLikely: 5, max: 5, confidenceLevel: "mediumConfidence", distributionType: "uniform", status: "planned", ...overrides,
});

describe("a moved recorded start is named, not said to be kept", () => {
  const schedule = computeDependencySchedule(
    [
      act("Design", { min: 15, mostLikely: 15, max: 15, status: "complete", actualStartDate: "2026-10-05", actualFinishDate: "2026-10-23", actualDuration: 15 }),
      act("Cutover", { status: "inProgress", actualStartDate: "2026-10-17", actualDuration: 10 }),
    ],
    [{ fromActivityId: "Design", toActivityId: "Cutover", type: "FS", lagDays: 0 }],
    "2026-10-05", 0.5, undefined, undefined, "2026-10-30",
  );
  const note = schedule.progressNotes?.find((n) => n.kind === "link") as LinkProgressNote;

  it("the note carries the recorded Saturday and the Monday the schedule shows", () => {
    expect([note.date, note.recordedDate]).toEqual(["2026-10-19", "2026-10-17"]);
  });
  it("its sentence names both dates", () => {
    expect(progressNoteSentence(note, fmt)).toBe(
      "Cutover started on 10/19/2026, before Design finished on 10/23/2026. The recorded start is 10/17/2026; the schedule shows it on 10/19/2026.",
    );
  });
  it("a start kept as recorded keeps its words", () => {
    const kept = computeDependencySchedule(
      [
        act("Design", { min: 15, mostLikely: 15, max: 15, status: "complete", actualStartDate: "2026-10-05", actualFinishDate: "2026-10-23", actualDuration: 15 }),
        act("Cutover", { status: "inProgress", actualStartDate: "2026-10-19", actualDuration: 10 }),
      ],
      [{ fromActivityId: "Design", toActivityId: "Cutover", type: "FS", lagDays: 0 }],
      "2026-10-05", 0.5, undefined, undefined, "2026-10-30",
    ).progressNotes?.find((n) => n.kind === "link") as LinkProgressNote;
    expect(kept.recordedDate).toBeUndefined();
    expect(progressNoteSentence(kept, fmt)).toBe(
      "Cutover started on 10/19/2026, before Design finished on 10/23/2026. The schedule keeps the start you recorded.",
    );
  });
});
