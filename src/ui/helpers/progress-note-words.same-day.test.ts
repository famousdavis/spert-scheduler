// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import type { Activity, DependencyType, LinkProgressNote } from "@domain/models/types";
import { detectProgressNotes, resolveRecordedProgress } from "@core/schedule/recorded-progress";
import { addWorkingDays, formatDateISO, parseDateISO } from "@core/calendar/calendar";
import { progressNoteSentence } from "./progress-note-words";

/**
 * WI-137 release 2 — the same-day note (owner, R625: reworded). A finish-to-start link without lag
 * allows the NEXT working day, so a start ON the predecessor's finish day is a real note; v0.80.0
 * said "before B Build finished on 10/30/2026" beside a start on 10/30/2026. Dates read MM/DD/YYYY.
 */
const mdy = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;

function sameDay(over: Partial<LinkProgressNote>): LinkProgressNote {
  return {
    kind: "link", activityId: "c", activityName: "C Test", event: "start", date: "2026-10-30",
    predecessorId: "b", predecessorName: "B Build", predecessorComplete: true, dependencyType: "FS", lagDays: 0,
    predecessorDate: "2026-10-30", allowedDate: "2026-11-02", sequential: false, ...over,
  };
}

describe("the same-day sentence, in each case", () => {
  it("dependencies on, the predecessor Complete", () => {
    expect(progressNoteSentence(sameDay({}), mdy)).toBe(
      "C Test started on 10/30/2026, the day B Build finished; its finish-to-start link allowed 11/02/2026 at the earliest. The schedule keeps the start you recorded.",
    );
  });
  it("dependencies on, the predecessor not yet Complete", () => {
    expect(progressNoteSentence(sameDay({ predecessorComplete: false }), mdy)).toBe(
      "C Test started on 10/30/2026, the day B Build is scheduled to finish; its finish-to-start link allowed 11/02/2026 at the earliest. The schedule keeps the start you recorded.",
    );
  });
  it("dependencies off (the activity above it), the predecessor Complete", () => {
    expect(progressNoteSentence(sameDay({ sequential: true }), mdy)).toBe(
      "C Test started on 10/30/2026, the day B Build, the activity above it, finished; with dependencies off, it could start on 11/02/2026 at the earliest. The schedule keeps the start you recorded.",
    );
  });
  it("dependencies off, the predecessor not yet Complete", () => {
    expect(progressNoteSentence(sameDay({ sequential: true, predecessorComplete: false }), mdy)).toBe(
      "C Test started on 10/30/2026, the day B Build, the activity above it, is scheduled to finish; with dependencies off, it could start on 11/02/2026 at the earliest. The schedule keeps the start you recorded.",
    );
  });
  it("control: a start strictly before the finish keeps v0.80.0's sentence", () => {
    expect(progressNoteSentence(sameDay({ date: "2026-10-29" }), mdy)).toBe(
      "C Test started on 10/29/2026, before B Build finished on 10/30/2026. The schedule keeps the start you recorded.",
    );
  });
});

/**
 * The sweep the brief asks for: can any other link type, lag or lead print two equal dates? Real
 * notes, from the engine's own detector, over FS / SS / FF × lag −3..+3 × a recorded date on every
 * working day from three weeks before the predecessor to two weeks after it, predecessor done or not.
 */
interface SweepCase { type: DependencyType; lag: number; d: number; predComplete: boolean; sequential: boolean }

const day = (n: number) => formatDateISO(addWorkingDays(parseDateISO("2026-10-05"), n, undefined));
const PRED_START = "2026-10-12";
const PRED_FINISH = "2026-10-23";
const base = (id: string, extra: Partial<Activity>): Activity => ({
  id, name: id === "p" ? "B Build" : "C Test", min: 9, mostLikely: 10, max: 11,
  confidenceLevel: "mediumConfidence", distributionType: "uniform", status: "planned", ...extra,
});
const TYPE_LAGS = (["FS", "SS", "FF"] as DependencyType[]).flatMap((type) => [-3, -2, -1, 0, 1, 2, 3].map((lag) => ({ type, lag })));
const SLOTS = Array.from({ length: 25 }, (_, d) => d).flatMap((d) => [{ d, predComplete: true }, { d, predComplete: false }]);
/** Dependencies off pairs a row with the row above it, FS without lag: only that link has a sequential twin. */
const sequentialFlags = (type: DependencyType, lag: number) => (type === "FS" && lag === 0 ? [false, true] : [false]);
const CASES: SweepCase[] = TYPE_LAGS.flatMap((tl) =>
  SLOTS.flatMap((sl) => sequentialFlags(tl.type, tl.lag).map((sequential) => ({ ...tl, ...sl, sequential }))));

/** The engine's own notes for one case: C Test recorded Complete from day d to d + 2, after B Build. */
function notesOf(c: SweepCase): { c: SweepCase; n: LinkProgressNote }[] {
  const start = day(c.d);
  const finish = day(c.d + 2);
  const succ = base("s", { status: "complete", actualStartDate: start, actualFinishDate: finish });
  const pred = base("p", { status: c.predComplete ? "complete" : "inProgress" });
  return detectProgressNotes({
    pairs: [{ fromId: "p", toId: "s", type: c.type, lagDays: c.lag }],
    records: resolveRecordedProgress([succ], "2026-09-01", undefined),
    startDates: new Map([["p", parseDateISO(PRED_START)], ["s", parseDateISO(start)]]),
    endDates: new Map([["p", parseDateISO(PRED_FINISH)], ["s", parseDateISO(finish)]]),
    activityMap: new Map([["p", pred], ["s", succ]]),
    calendar: undefined,
    sequential: c.sequential,
  }).map((n) => ({ c, n }));
}

const repeatsADate = (sentence: string) => {
  const dates = sentence.match(/\d{2}\/\d{2}\/\d{4}/g) ?? [];
  return new Set(dates).size !== dates.length;
};

describe("no link sentence prints the same date twice", () => {
  it("every type, lag and lead reached; every date in every sentence is distinct", () => {
    const found = CASES.flatMap(notesOf);
    // Non-vacuity: every type with a lead, none and a lag produced notes, and the same-day case came up.
    expect([...new Set(found.map(({ c }) => `${c.type} ${Math.sign(c.lag)}`))].sort()).toEqual(
      ["FF -1", "FF 0", "FF 1", "FS -1", "FS 0", "FS 1", "SS -1", "SS 0", "SS 1"]);
    expect(found.filter(({ n }) => n.date === n.predecessorDate).length).toBeGreaterThan(0);
    const repeats = found
      .map(({ c, n }) => ({ c, sentence: progressNoteSentence(n, mdy) }))
      .filter(({ sentence }) => repeatsADate(sentence))
      .map(({ c, sentence }) => `${c.type} ${c.lag} ${day(c.d)}: ${sentence}`);
    expect(repeats).toEqual([]);
  });
});
