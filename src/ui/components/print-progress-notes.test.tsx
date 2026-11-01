// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import type { Activity, ActivityDependency } from "@domain/models/types";
import { computeDependencySchedule } from "@core/schedule/deterministic";
import { PrintProgressNotesSection } from "./print-sections";

/**
 * WI-137 release 2 — the progress notes in the printed report, in their own section (owner, R622):
 * the same sentences the project page shows. R598's example, with C started on B's finish day.
 */
const act = (id: string, name: string, extra: Partial<Activity> = {}): Activity => ({
  id, name, min: 9, mostLikely: 10, max: 11, confidenceLevel: "mediumConfidence",
  distributionType: "uniform", status: "planned", ...extra,
});
const DEPS: ActivityDependency[] = [
  { fromActivityId: "a", toActivityId: "b", type: "FS", lagDays: 0 },
  { fromActivityId: "b", toActivityId: "c", type: "FS", lagDays: 0 },
];
const mdy = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;

describe("Progress Notes, printed", () => {
  it("a heading with the count, a plain line on what a note is, then one sentence per note", () => {
    const acts = [
      act("a", "A Requirements", { status: "complete", actualStartDate: "2026-10-05", actualFinishDate: "2026-10-23", actualDuration: 15 }),
      act("b", "B Build", { status: "complete", actualStartDate: "2026-10-19", actualFinishDate: "2026-10-30", actualDuration: 10 }),
      act("c", "C Test", { status: "inProgress", actualStartDate: "2026-10-30", actualDuration: 1 }),
    ];
    const notes = computeDependencySchedule(acts, DEPS, "2026-10-05", 0.5).progressNotes;
    const { container } = render(<PrintProgressNotesSection notes={notes} formatDate={mdy} />);
    expect(container.querySelector("h2")!.textContent).toBe("Progress Notes (2)");
    expect(Array.from(container.querySelectorAll("li")).map((li) => li.textContent)).toEqual([
      "B Build started on 10/19/2026, before A Requirements finished on 10/23/2026. The schedule keeps the start you recorded.",
      "C Test started on 10/30/2026, the day B Build finished; its finish-to-start link allowed 11/02/2026 at the earliest. The schedule keeps the start you recorded.",
    ]);
  });

  it("its intro is true beside a start before the Start Date, which the schedule draws from the Start Date (Review 33, F6)", () => {
    const acts = [act("k", "Kickoff", { status: "inProgress", actualStartDate: "2026-09-28", actualDuration: 22 })];
    const notes = computeDependencySchedule(acts, [], "2026-10-05", 0.5).progressNotes;
    const { container } = render(<PrintProgressNotesSection notes={notes} formatDate={mdy} />);
    expect(container.querySelector("p")!.textContent).toBe(
      // WI-154: the intro names each kind of note, the data date's and work started before work it
      // follows among them, in words true of every note of that kind (Review 35, W6: no nested dashes).
      "Each note below is one of these: a recorded start or finish that a link, a constraint or the Start Date would not have allowed, kept as recorded (a start before the Start Date is drawn from the Start Date); work that has started before work it follows, which the schedule does not hold back; or work that has not started, which is not scheduled before today.",
    );
    expect(Array.from(container.querySelectorAll("li")).map((li) => li.textContent)).toEqual([
      "Kickoff started on 09/28/2026, before this scenario's Start Date, 10/05/2026, so the schedule shows it starting on 10/05/2026.",
    ]);
  });

  it("no note, no section", () => {
    expect(render(<PrintProgressNotesSection notes={undefined} formatDate={mdy} />).container.innerHTML).toBe("");
    expect(render(<PrintProgressNotesSection notes={[]} formatDate={mdy} />).container.innerHTML).toBe("");
  });
});
