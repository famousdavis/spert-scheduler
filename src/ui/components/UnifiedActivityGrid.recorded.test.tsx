// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { UnifiedActivityGrid } from "./UnifiedActivityGrid";
import { ConfirmHost } from "./ConfirmHost";
import { ProgressNotesPanel } from "./ProgressNotesPanel";
import { useProjectStore } from "@ui/hooks/use-project-store";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";
import type { Activity, ActivityDependency, Project } from "@domain/models/types";
import { addActivityToScenario, createActivity, createProject } from "@app/api/project-service";
import { computeDependencySchedule } from "@core/schedule/deterministic";

/**
 * WI-137 — the grid (look A): recorded dates in green with a hidden "actual", "Sched. / Actual",
 * the Status cell by the one rule, the Actual cell's words, and a bulk Status change as ONE undo
 * step through the real store (k). Today is pinned to Tue 2026-10-27.
 */
function project(): Project {
  const p = createProject("P", "2026-10-05", { dependencyMode: true });
  let s = p.scenarios[0]!;
  const row = (id: string, name: string, extra: Partial<Activity>): Activity => ({
    ...createActivity(name, s.settings), id, min: 9, mostLikely: 10, max: 11, distributionType: "uniform", ...extra,
  });
  s = addActivityToScenario(s, row("a", "A", { status: "complete", actualStartDate: "2026-10-05", actualFinishDate: "2026-10-23", actualDuration: 15 }));
  s = addActivityToScenario(s, row("b", "B", { status: "inProgress", actualStartDate: "2026-10-19", actualDuration: 1 }));
  s = addActivityToScenario(s, row("c", "C", {}));
  s = addActivityToScenario(s, row("d", "D", {}));
  s = addActivityToScenario(s, row("l", "L", { status: "inProgress", actualDuration: 3 }));
  const deps: ActivityDependency[] = [
    { fromActivityId: "a", toActivityId: "b", type: "FS", lagDays: 0 },
    { fromActivityId: "b", toActivityId: "c", type: "FS", lagDays: 0 },
  ];
  return { ...p, scenarios: [{ ...s, dependencies: deps }] };
}

function Harness() {
  const p = useProjectStore((st) => st.projects[0]!);
  const s = p.scenarios[0]!;
  const schedule = computeDependencySchedule(s.activities, s.dependencies, s.startDate, 0.5);
  const store = useProjectStore.getState();
  return (
    <>
      <ProgressNotesPanel notes={schedule.progressNotes} />
      <UnifiedActivityGrid
        activities={s.activities}
        bands={[]}
        scheduledActivities={schedule.activities}
        activityProbabilityTarget={0.5}
        onUpdate={(id, u) => store.updateActivityField(p.id, s.id, id, u)}
        onDelete={vi.fn()}
        onAdd={vi.fn()}
        onAddBand={vi.fn()}
        onDeleteBand={vi.fn()}
        onUpdateBand={vi.fn()}
        onReorderWithBands={vi.fn()}
        onValidityChange={vi.fn()}
        onBulkUpdate={(ids, u) => store.bulkUpdateActivities(p.id, s.id, ids, u)}
        onBulkUpdateEach={(byId) => store.bulkUpdateActivitiesEach(p.id, s.id, byId)}
        dependencyMode
        activityNumberMap={null}
      />
      <ConfirmHost />
    </>
  );
}

const stored = () => useProjectStore.getState().projects[0]!.scenarios[0]!.activities;
const pick = (ids: string[]) => stored().filter((a) => ids.includes(a.id)).map((a) => [a.id, a.status, a.actualStartDate, a.actualDuration]);

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-10-27T12:00:00"), toFake: ["Date"] });
  usePreferencesStore.setState((st) => ({ preferences: { ...st.preferences, dateFormat: "MM/DD/YYYY" } }));
  useProjectStore.setState({ projects: [project()], undoStack: [], redoStack: [] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("look A — green recorded dates, every width as before", () => {
  it("a recorded date is green, titled, and followed by a hidden \"actual\"; a scheduled one is plain", () => {
    render(<Harness />);
    const recorded = screen.getAllByTitle("Actual Start, as recorded")[0]!;
    expect(recorded.className).toContain("text-green-800");
    expect(recorded.textContent).toBe("10/05/2026, actual");
    expect(within(recorded).getByText(", actual").className).toBe("sr-only");
    expect(screen.getAllByTitle("Actual Finish, as recorded").map((e) => e.textContent)).toEqual(["10/23/2026, actual"]);
    expect(screen.getAllByTitle("Actual Start, as recorded").map((e) => e.textContent)).toEqual(["10/05/2026, actual", "10/19/2026, actual"]);
    // C starts the working day after B's forecast finish: a plain, scheduled date.
    expect(screen.getByText("11/02/2026").getAttribute("title")).toBeNull();
  });

  it("(q) the sub-header under START and END reads \"Sched. / Actual\", the word Actual in the same green", () => {
    render(<Harness />);
    // (The Src column's own "Actual" badge on A is a span too; the sub-header's are inside its two cells.)
    const actuals = screen.getAllByText("Actual", { selector: "span" }).filter((a) => a.parentElement!.textContent!.startsWith("Sched."));
    expect(actuals).toHaveLength(2);
    for (const a of actuals) {
      expect(a.className).toBe("text-green-800 dark:text-green-400");
      expect(a.parentElement!.textContent).toBe("Sched. / Actual");
    }
  });

  it("(o) the Progress notes box is a polite live region holding the note", () => {
    render(<Harness />);
    const region = screen.getByRole("region", { name: "Progress notes" });
    expect(region.parentElement!.getAttribute("aria-live")).toBe("polite");
    expect(region.textContent).toContain("B started on 10/19/2026, before A finished on 10/23/2026. The schedule keeps the start you recorded.");
  });

  it("(p) the Actual cell's title follows the row: from the Actual Start, or from the scheduled start for a row from before v0.80.0", () => {
    render(<Harness />);
    const titles = screen.getAllByLabelText("Actual duration").map((el) => el.getAttribute("title"));
    expect(titles).toEqual([
      "Total working days from the Actual Start to the Actual Finish",
      "Working days elapsed since the Actual Start. Used as the minimum floor for simulation trials.",
      "Working days elapsed since the scheduled start. Used as the minimum floor for simulation trials.",
    ]);
  });
});

describe("the Status cell, by the one rule", () => {
  it("Planned → In Progress writes today and a count of 1", () => {
    render(<Harness />);
    fireEvent.change(screen.getAllByLabelText("Activity status")[2]!, { target: { value: "inProgress" } });
    expect(pick(["c"])).toEqual([["c", "inProgress", "2026-10-27", 1]]);
  });

  it("a cleared Actual cell on a recorded row recounts from its Actual Start: 7 days since 10-19", () => {
    render(<Harness />);
    const cell = screen.getAllByLabelText("Actual duration")[1] as HTMLInputElement;
    fireEvent.change(cell, { target: { value: "" } });
    fireEvent.blur(cell, { target: { value: "" } });
    expect(pick(["b"])).toEqual([["b", "inProgress", "2026-10-19", 7]]);
  });
});

describe("(k) a bulk Status change is one store write — one undo step", () => {
  it("three rows set In Progress at once; one Undo puts all three back", () => {
    render(<Harness />);
    for (const name of ["C", "D", "L"]) fireEvent.click(screen.getByLabelText(`Select activity ${name}`));
    fireEvent.change(screen.getByLabelText("Set status for selected activities"), { target: { value: "inProgress" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(pick(["c", "d", "l"])).toEqual([
      ["c", "inProgress", "2026-10-27", 1],
      ["d", "inProgress", "2026-10-27", 1],
      ["l", "inProgress", undefined, 3],
    ]);
    expect(useProjectStore.getState().undoStack).toHaveLength(1);
    useProjectStore.getState().undo();
    expect(pick(["c", "d", "l"])).toEqual([
      ["c", "planned", undefined, undefined],
      ["d", "planned", undefined, undefined],
      ["l", "inProgress", undefined, 3],
    ]);
  });

  it("several marked Complete at once: each its own dates, by the rule; one step to undo (v0.79.36 made one per row)", () => {
    render(<Harness />);
    for (const name of ["B", "L"]) fireEvent.click(screen.getByLabelText(`Select activity ${name}`));
    fireEvent.change(screen.getByLabelText("Set status for selected activities"), { target: { value: "complete" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    // B, recorded since 10-19: finished today, 7 days. L, In Progress before v0.80.0: no dates, its count kept.
    expect(stored().filter((a) => ["b", "l"].includes(a.id)).map((a) => [a.id, a.status, a.actualStartDate, a.actualFinishDate, a.actualDuration])).toEqual([
      ["b", "complete", "2026-10-19", "2026-10-27", 7],
      ["l", "complete", undefined, undefined, 3],
    ]);
    expect(useProjectStore.getState().undoStack).toHaveLength(1);
    useProjectStore.getState().undo();
    expect(pick(["b", "l"])).toEqual([["b", "inProgress", "2026-10-19", 1], ["l", "inProgress", undefined, 3]]);
  });
});
