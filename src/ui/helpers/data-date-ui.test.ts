// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, afterEach } from "vitest";
import type { Activity, DataDateProgressNote } from "@domain/models/types";
import { buildSimulationParams } from "./build-simulation-params";
import { progressNoteLines, progressNoteSentence } from "./progress-note-words";
import { msToNextLocalMidnight } from "@ui/hooks/use-today";

/** WI-154. Every expected value is written out by hand (Mon–Fri calendar, October 2026). */
const act = (id: string, overrides: Partial<Activity> = {}): Activity => ({
  id, name: id, min: 9, mostLikely: 10, max: 11,
  confidenceLevel: "mediumConfidence", distributionType: "uniform", status: "planned", ...overrides,
});
const RECORDED = [act("a", { status: "inProgress", actualStartDate: "2026-10-05", actualDuration: 1 }), act("b")];
const params = (acts: Activity[], dependencyMode: boolean, today?: string) =>
  buildSimulationParams(acts, dependencyMode, 0.5, [], [], "2026-10-05", undefined, true, today);

describe("buildSimulationParams sends the data date's offset only when it can move a row", () => {
  it("today Tue 10/27, with a record: 16 working days from 10/05, in both modes", () => {
    expect(params(RECORDED, true, "2026-10-27").dataDateOffset).toBe(16);
    expect(params(RECORDED, false, "2026-10-27").dataDateOffset).toBe(16);
  });
  it("today Sat 10/31: the next working day, Mon 11/02, 20 working days", () => {
    expect(params(RECORDED, true, "2026-10-31").dataDateOffset).toBe(20);
  });
  it("nothing with no record, no today, or today on the Start Date — so those requests are as before", () => {
    expect(params([act("b")], true, "2026-10-27")).not.toHaveProperty("dataDateOffset");
    expect(params(RECORDED, true)).not.toHaveProperty("dataDateOffset");
    expect(params(RECORDED, false, "2026-10-05")).not.toHaveProperty("dataDateOffset");
  });
});

const note = (id: string, logicStart: string): DataDateProgressNote =>
  ({ kind: "data-date", activityId: id, activityName: id, date: "2026-11-02", logicStart, today: "2026-10-31" });
const mdy = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;

describe("the data date's words", () => {
  // Today is Sat 10/31: the schedule starts work that has not started on Mon 11/02 (Review 35, W2, W3).
  it("one row — the Edit Activity window's line", () => {
    expect(progressNoteSentence(note("Docs", "2026-09-21"), mdy)).toBe(
      "Docs has not started, and 09/21/2026 has passed, so the schedule starts it on 11/02/2026, the next working day. Once a start is recorded in a scenario, work that has not started is not scheduled before today.",
    );
  });
  it("several rows are ONE line on the page and in print, three names and a count", () => {
    const two = progressNoteLines([note("Training", "2026-09-07"), note("Docs", "2026-09-21")], mdy);
    expect(two).toEqual([{ key: "data-date", sentence:
      "Training and Docs have not started, so the schedule starts them on 11/02/2026, the next working day, not on days that have passed. Once a start is recorded in a scenario, work that has not started is not scheduled before today." }]);
    const five = progressNoteLines(["A", "B", "C", "D", "E"].map((id) => note(id, "2026-10-05")), mdy);
    expect(five.map((l) => l.sentence)).toEqual([
      "A, B, C and 2 more activities have not started, so the schedule starts them on 11/02/2026, the next working day, not on days that have passed. Once a start is recorded in a scenario, work that has not started is not scheduled before today.",
    ]);
  });
});

describe("useToday's midnight", () => {
  const tz = process.env.TZ;
  afterEach(() => { process.env.TZ = tz; });
  it("is one second past the next LOCAL midnight, in any time zone", () => {
    for (const zone of ["America/New_York", "Asia/Tokyo", "UTC"]) {
      process.env.TZ = zone;
      const now = new Date(2026, 9, 31, 23, 59, 0); // 23:59 local
      expect(msToNextLocalMidnight(now)).toBe(61_000);
    }
  });
});
