// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ActivityEditModal } from "./ActivityEditModal";
import { ConfirmHost } from "./ConfirmHost";
import { useProjectStore } from "@ui/hooks/use-project-store";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";
import type { Activity, ActivityDependency, Project } from "@domain/models/types";
import { addActivityToScenario, createActivity, createProject } from "@app/api/project-service";
import { computeDependencySchedule } from "@core/schedule/deterministic";

/**
 * WI-137 — the Edit Activity window's Actual Start and Actual Finish (look B revised), its refusals,
 * its Status rule and its legacy rows. Today is pinned to Tue 2026-10-27; dates read MM/DD/YYYY.
 *
 * A Complete 10-05..10-23 and B In Progress since 10-19 are recorded; C is Planned; A → B → C.
 * L1 (Complete, 12) and L2 (In Progress, 3) are rows a v25 build wrote: a count and no date.
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
  s = addActivityToScenario(s, row("l1", "L1", { status: "complete", actualDuration: 12 }));
  s = addActivityToScenario(s, row("l2", "L2", { status: "inProgress", actualDuration: 3 }));
  const deps: ActivityDependency[] = [
    { fromActivityId: "a", toActivityId: "b", type: "FS", lagDays: 0 },
    { fromActivityId: "b", toActivityId: "c", type: "FS", lagDays: 0 },
    { fromActivityId: "a", toActivityId: "l2", type: "FS", lagDays: 0 },
  ];
  return { ...p, scenarios: [{ ...s, dependencies: deps }] };
}

function stored(id: string): Activity {
  return useProjectStore.getState().projects[0]!.scenarios[0]!.activities.find((a) => a.id === id)!;
}

function open(activityId: string, opts: { schedule?: boolean; dependencyMode?: boolean } = {}) {
  const p = useProjectStore.getState().projects[0]!;
  const s = p.scenarios[0]!;
  const schedule = opts.schedule === false ? undefined : computeDependencySchedule(s.activities, s.dependencies, s.startDate, 0.5);
  render(
    <>
      <ActivityEditModal
        activityId={activityId}
        scenarioId={s.id}
        projectId={p.id}
        onClose={vi.fn()}
        schedule={schedule}
        dependencyMode={opts.dependencyMode ?? true}
      />
      <ConfirmHost />
    </>,
  );
}

const input = (name: string) => document.querySelector(`input[name="${name}"]`) as HTMLInputElement;
const statusSelect = () => document.querySelector('select[name="activityStatus"]') as HTMLSelectElement;
const saveButton = () => screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
const lineLabels = () =>
  Array.from(input("actualDuration").closest(".grid")!.children).map((cell) => cell.firstElementChild!.textContent);
const typeDate = (name: string, value: string) => {
  fireEvent.change(input(name), { target: { value } });
  fireEvent.blur(input(name), { target: { value } });
};
const describedText = (el: HTMLElement) =>
  (el.getAttribute("aria-describedby") ?? "").split(" ").map((id) => document.getElementById(id)?.textContent).join(" | ");

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-10-27T12:00:00"), toFake: ["Date"] });
  usePreferencesStore.setState((st) => ({ preferences: { ...st.preferences, dateFormat: "MM/DD/YYYY" } }));
  useProjectStore.setState({ projects: [project()], undoStack: [], redoStack: [] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("look B revised — one line, laid out by Status", () => {
  it("In Progress: Actual Start, Sched. Finish, Sched. Dur., Actual Dur.; the note, described by the start", () => {
    open("b");
    expect(lineLabels()).toEqual(["Actual Start", "Sched. Finish", "Sched. Dur.", "Actual Dur."]);
    expect(input("actualStartDate").value).toBe("2026-10-19");
    expect(screen.getByText("10/30/2026")).toBeTruthy();
    const note = "B started on 10/19/2026, before A finished on 10/23/2026. The schedule keeps the start you recorded.";
    expect(screen.getByText(note)).toBeTruthy();
    expect(describedText(input("actualStartDate"))).toContain(note);
  });

  it("Complete: Sched. Finish (read-only, 10/05 + 10 working days = 10/16), Actual Start, Actual Finish, Actual Dur.", () => {
    open("a");
    expect(lineLabels()).toEqual(["Sched. Finish", "Actual Start", "Actual Finish", "Actual Dur."]);
    expect(screen.getByText("10/16/2026")).toBeTruthy();
    expect([input("actualStartDate").value, input("actualFinishDate").value, input("actualDuration").value]).toEqual(["2026-10-05", "2026-10-23", "15"]);
  });

  it("(r) the window may grow to 88% of the browser's height", () => {
    open("b");
    expect(screen.getByRole("dialog").className).toContain("max-h-[88vh]");
  });
});

describe("(d) Save refuses impossible dates — one cause, its reason, the red line tied to its field", () => {
  it("a finish before the start", () => {
    open("a");
    typeDate("actualFinishDate", "2026-10-01");
    expect(saveButton().disabled).toBe(true);
    expect(screen.getByText("Save needs the actual dates corrected, as the line under them says.")).toBeTruthy();
    expect(input("actualFinishDate").getAttribute("aria-invalid")).toBe("true");
    expect(input("actualStartDate").getAttribute("aria-invalid")).toBeNull();
    expect(describedText(input("actualFinishDate"))).toBe("The Actual Finish cannot be before the Actual Start.");
  });

  it("a start after the finish marks the start", () => {
    open("a");
    typeDate("actualStartDate", "2026-10-26");
    expect(saveButton().disabled).toBe(true);
    expect(input("actualStartDate").getAttribute("aria-invalid")).toBe("true");
    expect(describedText(input("actualStartDate"))).toBe("The Actual Start cannot be after the Actual Finish.");
  });

  it("a date after today", () => {
    open("b");
    typeDate("actualStartDate", "2026-10-28");
    expect(saveButton().disabled).toBe(true);
    expect(describedText(input("actualStartDate"))).toContain("The Actual Start cannot be after today.");
  });

  it("a start before the scenario's Start Date", () => {
    open("b");
    typeDate("actualStartDate", "2026-10-01");
    expect(saveButton().disabled).toBe(true);
    expect(describedText(input("actualStartDate"))).toContain("The Actual Start cannot be before this scenario's Start Date.");
  });

  it("control: a good start saves, and the count follows it", () => {
    open("b");
    typeDate("actualStartDate", "2026-10-20");
    expect(saveButton().disabled).toBe(false);
    fireEvent.click(saveButton());
    expect([stored("b").actualStartDate, stored("b").actualDuration]).toEqual(["2026-10-20", 6]);
  });
});

describe("(g) the Status rule, on this window's drafts", () => {
  it("Planned → In Progress fills today and 1; Save writes them", () => {
    open("c");
    fireEvent.change(statusSelect(), { target: { value: "inProgress" } });
    expect([input("actualStartDate").value, input("actualDuration").value]).toEqual(["2026-10-27", "1"]);
    fireEvent.click(saveButton());
    expect([stored("c").status, stored("c").actualStartDate, stored("c").actualFinishDate, stored("c").actualDuration]).toEqual(["inProgress", "2026-10-27", undefined, 1]);
  });

  it("In Progress → Complete: finish today", () => {
    open("b");
    fireEvent.change(statusSelect(), { target: { value: "complete" } });
    expect([input("actualStartDate").value, input("actualFinishDate").value, input("actualDuration").value]).toEqual(["2026-10-19", "2026-10-27", "7"]);
  });

  it("a row In Progress before v0.80.0 set to Complete gets NO dates and keeps its count (ruling 3)", () => {
    open("l2");
    fireEvent.change(statusSelect(), { target: { value: "complete" } });
    expect([input("actualStartDate").value, input("actualFinishDate").value, input("actualDuration").value]).toEqual(["", "", "3"]);
    fireEvent.click(saveButton());
    const l2 = stored("l2");
    expect([l2.status, l2.actualDuration, "actualStartDate" in l2, "actualFinishDate" in l2]).toEqual(["complete", 3, false, false]);
  });
});

describe("rows a v25 build wrote", () => {
  it("an unrelated Save writes no date", () => {
    open("l1");
    expect([input("actualStartDate").value, input("actualFinishDate").value]).toEqual(["", ""]);
    fireEvent.change(document.querySelector('input[name="activityName"]')!, { target: { value: "L1 renamed" } });
    fireEvent.click(saveButton());
    const l1 = stored("l1");
    expect([l1.name, l1.actualDuration, "actualStartDate" in l1, "actualFinishDate" in l1]).toEqual(["L1 renamed", 12, false, false]);
  });

  it("(f) a typed count is written alone — never a finish worked out from the scheduled start", () => {
    open("l1");
    fireEvent.change(input("actualDuration"), { target: { value: "9" } });
    expect(input("actualFinishDate").value).toBe("");
    fireEvent.click(saveButton());
    expect([stored("l1").actualDuration, "actualFinishDate" in stored("l1")]).toEqual([9, false]);
  });

  it("(f) a typed finish with no start is refused: Enter the Actual Start first.", () => {
    open("l1");
    typeDate("actualFinishDate", "2026-10-15");
    expect(saveButton().disabled).toBe(true);
    expect(describedText(input("actualFinishDate"))).toBe("Enter the Actual Start first.");
    expect(input("actualDuration").value).toBe("12");
  });

  it("(p) the hint says where the schedule puts it, in each mode", () => {
    open("l2");
    expect(screen.getByText("No Actual Start is recorded, so the schedule places this activity after its predecessors. Enter the day it started to record it.")).toBeTruthy();
  });

  it("(p) … and with dependencies off", () => {
    open("l2", { dependencyMode: false });
    expect(screen.getByText("No Actual Start is recorded, so the schedule places this activity after the activities before it. Enter the day it started to record it.")).toBeTruthy();
    expect(input("actualDuration").closest("[title]")!.getAttribute("title")).toBe(
      "Working days elapsed since the scheduled start. Used as the minimum floor for simulation trials.",
    );
  });
});

describe("(i) elapsed days are recounted only when the start's value changes", () => {
  it("a blur alone keeps a typed count; a new start recounts", () => {
    open("b");
    fireEvent.change(input("actualDuration"), { target: { value: "5" } });
    fireEvent.focus(input("actualStartDate"));
    fireEvent.blur(input("actualStartDate"), { target: { value: "2026-10-19" } });
    expect(input("actualDuration").value).toBe("5");
    typeDate("actualStartDate", "2026-10-20");
    expect(input("actualDuration").value).toBe("6");
  });
});

describe("(e) the date fields stay when there is no schedule", () => {
  it("they show, with a dash where a scheduled value would be", () => {
    open("b", { schedule: false });
    expect(lineLabels()).toEqual(["Actual Start", "Sched. Finish", "Sched. Dur.", "Actual Dur."]);
    expect(input("actualStartDate").value).toBe("2026-10-19");
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
  });
});
