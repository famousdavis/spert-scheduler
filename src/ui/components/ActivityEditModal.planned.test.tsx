// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { ActivityEditModal } from "./ActivityEditModal";
import { ConfirmHost } from "./ConfirmHost";
import { useProjectStore } from "@ui/hooks/use-project-store";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";
import { useNotificationStore } from "@ui/hooks/use-notification-store";
import { computeScenarioSchedule } from "@ui/hooks/use-schedule";
import type { Activity, ActivityDependency, Project } from "@domain/models/types";
import { addActivityToScenario, createActivity, createProject } from "@app/api/project-service";
import { computeDependencySchedule } from "@core/schedule/deterministic";
import { gridStatusUpdates, keptNoPlan, statusUpdatesFor } from "./activity-row-helpers";
import { dispatchBulkPlan, planBulkApply } from "./unified-activity-helpers";
import { NO_PLANNED_START_LINE, PLANNED_DATES_DEFINITION, noPlanKeptMessage } from "@ui/helpers/planned-dates-words";

/**
 * WI-137 release 2 — the Planned dates in the Edit Activity window (owner, R624–R626, R630) and on
 * the grid's and the bulk toolbar's paths. Today is Tue 2026-10-27; dates read MM/DD/YYYY.
 *
 * A Complete 10-05..10-23 (kept 10-05..10-16) and B In Progress since 10-19 (kept 10-26..11-06)
 * carry their pair; C is Planned after B (scheduled 11-02..11-13). L1 (Complete 10-05..10-23), L3
 * (In Progress since 10-19) and L2 (In Progress, a count only) are rows from before v0.81.0: no
 * pair. A → B → C, A → L2. Each row Uniform 9–11: 10 days at P50.
 */
function project(): Project {
  const p = createProject("P", "2026-10-05", { dependencyMode: true });
  let s = p.scenarios[0]!;
  const row = (id: string, name: string, extra: Partial<Activity>): Activity => ({
    ...createActivity(name, s.settings), id, min: 9, mostLikely: 10, max: 11, distributionType: "uniform", ...extra,
  });
  s = addActivityToScenario(s, row("a", "A", { status: "complete", actualStartDate: "2026-10-05", actualFinishDate: "2026-10-23", actualDuration: 15, plannedStartDate: "2026-10-05", plannedFinishDate: "2026-10-16" }));
  s = addActivityToScenario(s, row("b", "B", { status: "inProgress", actualStartDate: "2026-10-19", actualDuration: 1, plannedStartDate: "2026-10-26", plannedFinishDate: "2026-11-06" }));
  s = addActivityToScenario(s, row("c", "C", {}));
  s = addActivityToScenario(s, row("l1", "L1", { status: "complete", actualStartDate: "2026-10-05", actualFinishDate: "2026-10-23", actualDuration: 15 }));
  s = addActivityToScenario(s, row("l2", "L2", { status: "inProgress", actualDuration: 3 }));
  s = addActivityToScenario(s, row("l3", "L3", { status: "inProgress", actualStartDate: "2026-10-19", actualDuration: 7 }));
  const deps: ActivityDependency[] = [
    { fromActivityId: "a", toActivityId: "b", type: "FS", lagDays: 0 },
    { fromActivityId: "b", toActivityId: "c", type: "FS", lagDays: 0 },
    { fromActivityId: "a", toActivityId: "l2", type: "FS", lagDays: 0 },
  ];
  return { ...p, scenarios: [{ ...s, dependencies: deps }] };
}

const scenario = () => useProjectStore.getState().projects[0]!.scenarios[0]!;
const stored = (id: string): Activity => scenario().activities.find((a) => a.id === id)!;
const schedule = () => computeDependencySchedule(scenario().activities, scenario().dependencies, scenario().startDate, 0.5);
/** The page's plan schedule, as `ProjectPage` builds it: the same function, the given rows replaced. */
const planSchedule = (changed: Activity[]) => {
  const s = scenario();
  const byId = new Map(changed.map((a) => [a.id, a]));
  return computeScenarioSchedule({
    activities: s.activities.map((a) => byId.get(a.id) ?? a), startDate: s.startDate, probabilityTarget: 0.5,
    network: { dependencies: s.dependencies, milestones: s.milestones },
  }).schedule;
};

function open(activityId: string, withPlan = true) {
  const p = useProjectStore.getState().projects[0]!;
  render(
    <>
      <ActivityEditModal activityId={activityId} scenarioId={p.scenarios[0]!.id} projectId={p.id} onClose={vi.fn()}
        schedule={schedule()} planSchedule={withPlan ? planSchedule : undefined} dependencyMode />
      <ConfirmHost />
    </>,
  );
}

const input = (name: string) => document.querySelector(`input[name="${name}"]`) as HTMLInputElement;
const statusSelect = () => document.querySelector('select[name="activityStatus"]') as HTMLSelectElement;
const saveButton = () => screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
const lineCells = () => Array.from(input("actualDuration").closest(".grid")!.children) as HTMLElement[];
const lineLabels = () => lineCells().map((cell) => cell.firstElementChild!.textContent);
const cell = (label: string) => lineCells().find((c) => c.firstElementChild!.textContent === label)!;
const pairOf = (id: string) => [stored(id).plannedStartDate, stored(id).plannedFinishDate];
const discardAsked = () => screen.queryAllByRole("dialog").some((d) => d.textContent?.includes("Discard your unsaved changes?"));

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-10-27T12:00:00"), toFake: ["Date"] });
  usePreferencesStore.setState((st) => ({ preferences: { ...st.preferences, dateFormat: "MM/DD/YYYY" } }));
  useProjectStore.setState({ projects: [project()], undoStack: [], redoStack: [] });
  useNotificationStore.setState({ notifications: [] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the two lines, each still ONE line (owner, R624–R625, R630)", () => {
  it("In Progress: Planned Start, Actual Start, Sched. Finish, Sched. Dur., Actual Dur.", () => {
    open("b");
    expect(lineLabels()).toEqual(["Planned Start", "Actual Start", "Sched. Finish", "Sched. Dur.", "Actual Dur."]);
    expect(cell("Planned Start").textContent).toBe("Planned Start10/26/2026");
    expect(input("actualStartDate").value).toBe("2026-10-19");
    expect(cell("Sched. Finish").textContent).toBe("Sched. Finish10/30/2026");
    expect(screen.queryByText(NO_PLANNED_START_LINE)).toBeNull();
  });

  it("Complete with a pair: Actual Start, Planned Finish, Actual Finish, Actual Dur. — the plan between the two actuals", () => {
    open("a");
    expect(lineLabels()).toEqual(["Actual Start", "Planned Finish", "Actual Finish", "Actual Dur."]);
    expect(cell("Planned Finish").textContent).toBe("Planned Finish10/16/2026");
  });

  it("Planned: unchanged — Sched. Start, Sched. Finish, Sched. Dur., Actual Dur.", () => {
    open("c");
    expect(lineLabels()).toEqual(["Sched. Start", "Sched. Finish", "Sched. Dur.", "Actual Dur."]);
  });
});

describe("no pair kept (ruling 2)", () => {
  it("In Progress: a dash read 'none kept', and a visible grey line that says why — the cell's description", () => {
    open("l3");
    expect(cell("Planned Start").textContent).toBe("Planned Start—none kept");
    expect(NO_PLANNED_START_LINE).toBe(
      "No Planned Start was kept for this activity. Planned dates are kept when an activity leaves Planned while the schedule can be calculated, from version 0.81.0 on. One started earlier, imported from a spreadsheet as already started, or carried into a reforecast copy has none.",
    );
    const line = screen.getByText(NO_PLANNED_START_LINE);
    expect(line.className).toContain("text-gray-600");
    expect(cell("Planned Start")).toHaveAccessibleDescription(NO_PLANNED_START_LINE);
    // L3 has an Actual Start, so the line for a missing one is not shown.
    expect(screen.queryByText(/^No Actual Start is recorded/)).toBeNull();
  });

  it("In Progress with neither an Actual Start nor a pair: both lines", () => {
    open("l2");
    expect(cell("Planned Start").textContent).toBe("Planned Start—none kept");
    expect(screen.getByText(NO_PLANNED_START_LINE)).toBeTruthy();
    expect(screen.getByText(/^No Actual Start is recorded/)).toBeTruthy();
  });

  it("Complete: v0.80.0's Sched. Finish — the Actual Start plus the planned duration, 10/05 + 10 days = 10/16 — never a dash", () => {
    open("l1");
    expect(lineLabels()).toEqual(["Actual Start", "Sched. Finish", "Actual Finish", "Actual Dur."]);
    expect(cell("Sched. Finish").textContent).toBe("Sched. Finish10/16/2026");
    expect(screen.queryByText(NO_PLANNED_START_LINE)).toBeNull();
  });
});

describe("the definition (ruling 5b): each Planned label's tooltip AND accessible description", () => {
  it("says what the dates are", () => {
    expect(PLANNED_DATES_DEFINITION).toContain("the schedule's dates at the moment the activity left Planned");
    open("b");
    const label = cell("Planned Start").firstElementChild as HTMLElement;
    expect(label.getAttribute("title")).toBe(PLANNED_DATES_DEFINITION);
    expect(label).toHaveAccessibleDescription(PLANNED_DATES_DEFINITION);
  });

  it("… on the Planned Finish too", () => {
    open("a");
    const label = cell("Planned Finish").firstElementChild as HTMLElement;
    expect(label.getAttribute("title")).toBe(PLANNED_DATES_DEFINITION);
    expect(label).toHaveAccessibleDescription(PLANNED_DATES_DEFINITION);
  });
});

describe("the capture, on the window's path", () => {
  it("Planned → In Progress shows and saves C's plan as its Planned pair", () => {
    open("c");
    fireEvent.change(statusSelect(), { target: { value: "inProgress" } });
    expect(cell("Planned Start").textContent).toBe("Planned Start11/02/2026");
    fireEvent.click(saveButton());
    expect([stored("c").status, ...pairOf("c"), stored("c").actualStartDate]).toEqual(["inProgress", "2026-11-02", "2026-11-13", "2026-10-27"]);
  });

  it("Planned → Complete saves the pair too", () => {
    open("c");
    fireEvent.change(statusSelect(), { target: { value: "complete" } });
    expect(cell("Planned Finish").textContent).toBe("Planned Finish11/13/2026");
    fireEvent.click(saveButton());
    expect(pairOf("c")).toEqual(["2026-11-02", "2026-11-13"]);
  });

  it("In Progress → Planned → In Progress in one sitting keeps the pair the row had — never its Actual Start as the plan", () => {
    open("b");
    fireEvent.change(statusSelect(), { target: { value: "planned" } });
    fireEvent.change(statusSelect(), { target: { value: "inProgress" } });
    expect(cell("Planned Start").textContent).toBe("Planned Start10/26/2026");
    fireEvent.click(saveButton());
    expect(pairOf("b")).toEqual(["2026-10-26", "2026-11-06"]);
  });

  it("In Progress → Planned clears it at Save", () => {
    open("b");
    fireEvent.change(statusSelect(), { target: { value: "planned" } });
    fireEvent.click(saveButton());
    expect([stored("b").status, ...pairOf("b")]).toEqual(["planned", undefined, undefined]);
  });

  it("In Progress → Complete keeps it", () => {
    open("b");
    fireEvent.change(statusSelect(), { target: { value: "complete" } });
    expect(cell("Planned Finish").textContent).toBe("Planned Finish11/06/2026");
    fireEvent.click(saveButton());
    expect(pairOf("b")).toEqual(["2026-10-26", "2026-11-06"]);
  });

  it("an unrelated Save of a row from before v0.81.0 writes no Planned date", () => {
    open("l2");
    fireEvent.change(document.querySelector('input[name="activityName"]')!, { target: { value: "L2 renamed" } });
    fireEvent.click(saveButton());
    expect([stored("l2").name, "plannedStartDate" in stored("l2"), "plannedFinishDate" in stored("l2")]).toEqual(["L2 renamed", false, false]);
  });

  it("with no plan schedule (the window rendered alone), none is kept — as with no schedule", () => {
    open("c", false);
    fireEvent.change(statusSelect(), { target: { value: "inProgress" } });
    expect(cell("Planned Start").textContent).toBe("Planned Start—none kept");
    fireEvent.click(saveButton());
    expect([stored("c").status, ...pairOf("c")]).toEqual(["inProgress", undefined, undefined]);
  });
});

describe("E1 (Review 33): a Planned row that carries a pair (a hand-edited import)", () => {
  const strayOnC = () =>
    useProjectStore.setState((st) => ({
      projects: st.projects.map((p) => ({
        ...p,
        scenarios: [{ ...p.scenarios[0]!, activities: p.scenarios[0]!.activities.map((a) => (a.id === "c" ? { ...a, plannedStartDate: "2026-01-05", plannedFinishDate: "2026-01-16" } : a)) }],
      })),
    }));

  it("Cancel with no edit asks nothing", () => {
    strayOnC();
    open("c");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(discardAsked()).toBe(false);
  });

  it("an unrelated Save (a rename) leaves its pair as stored", () => {
    strayOnC();
    open("c");
    fireEvent.change(document.querySelector('input[name="activityName"]')!, { target: { value: "C renamed" } });
    fireEvent.click(saveButton());
    expect([stored("c").name, ...pairOf("c")]).toEqual(["C renamed", "2026-01-05", "2026-01-16"]);
  });

  it("… while leaving Planned replaces it with the plan, as every path does", () => {
    strayOnC();
    open("c");
    fireEvent.change(statusSelect(), { target: { value: "inProgress" } });
    fireEvent.click(saveButton());
    expect(pairOf("c")).toEqual(["2026-11-02", "2026-11-13"]);
  });
});

describe("Schedule Analysis — option B (ruling 3): no dates; Duration, Total Float and Free Float", () => {
  const analysis = () => {
    fireEvent.click(screen.getByRole("button", { name: /Schedule Analysis/ }));
    return document.querySelector(".grid.grid-cols-2.gap-x-4")! as HTMLElement; // the section's own two-column grid
  };
  const labels = (grid: HTMLElement) => Array.from(grid.children).filter((_, i) => i % 2 === 0).map((c) => c.textContent);

  for (const [kind, id] of [["Planned", "c"], ["In Progress", "b"], ["Complete", "a"]] as const) {
    it(`${kind}: no date in the section`, () => {
      open(id);
      const grid = analysis();
      expect(labels(grid)[0]).toBe("Duration");
      expect(labels(grid)).not.toContain("Scheduled Start");
      expect(within(grid).queryByText(/\d{2}\/\d{2}\/\d{4}/)).toBeNull();
    });
  }
});

describe("the capture, on the grid's and the bulk toolbar's paths", () => {
  const cScheduled = () => {
    const sa = schedule().activities.find((x) => x.activityId === "c")!;
    return { startDate: sa.startDate, endDate: sa.endDate, duration: sa.duration };
  };

  it("the grid's Status cell (statusUpdatesFor): C's scheduled dates; with no schedule, none", () => {
    expect(cScheduled()).toEqual({ startDate: "2026-11-02", endDate: "2026-11-13", duration: 10 });
    const u = statusUpdatesFor(stored("c"), "inProgress", cScheduled());
    expect([u.plannedStartDate, u.plannedFinishDate]).toEqual(["2026-11-02", "2026-11-13"]);
    const none = statusUpdatesFor(stored("c"), "inProgress", undefined);
    expect(["plannedStartDate" in none, none.plannedStartDate, none.plannedFinishDate]).toEqual([true, undefined, undefined]);
  });

  it("the bulk toolbar's plan: each row its own pair; a started row's pair is kept", () => {
    const plan = planBulkApply({ status: "complete" }, ["c", "b"], scenario().activities,
      schedule().activities, {}, () => ({ min: 0, max: 0 }));
    const byId = Object.fromEntries(plan.perActivity.map(({ id, updates }) => [id, updates]));
    expect([byId.c!.plannedStartDate, byId.c!.plannedFinishDate]).toEqual(["2026-11-02", "2026-11-13"]);
    expect("plannedStartDate" in byId.b! || "plannedFinishDate" in byId.b!).toBe(false);
  });

  it("ONE plan schedule per Apply, with the Apply's other updates on the selected rows (ruling 5a)", () => {
    // C at Most Likely 20 (Uniform 9–21 by the heuristic below, 15 days): 11/02 – 11/20.
    const plan = vi.fn(planSchedule);
    const acts = scenario().activities.map((a) => (a.id === "c" ? { ...a, mostLikely: 20 } : a));
    const heuristic = { enabled: true, minPercent: 45, maxPercent: 105 };
    const result = planBulkApply({ status: "inProgress", recalculateHeuristic: true }, ["c"], acts,
      schedule().activities, heuristic, (ml, lo, hi) => ({ min: (ml * lo) / 100, max: (ml * hi) / 100 }), undefined, plan);
    expect(plan).toHaveBeenCalledTimes(1);
    expect(plan.mock.calls[0]![0].map((a) => [a.id, a.status, a.min, a.mostLikely, a.max])).toEqual([["c", "planned", 9, 20, 21]]);
    const c = result.perActivity.find((e) => e.id === "c" && e.updates.status)!.updates;
    expect([c.plannedStartDate, c.plannedFinishDate]).toEqual(["2026-11-02", "2026-11-20"]);
  });

  it("… and none when the Apply changes nothing else: the page's schedule is the plan", () => {
    const plan = vi.fn(planSchedule);
    planBulkApply({ status: "inProgress" }, ["c"], scenario().activities, schedule().activities, {}, () => ({ min: 0, max: 0 }), undefined, plan);
    expect(plan).not.toHaveBeenCalled();
  });
});

describe("no schedule, no plan kept — and the app says so (ruling 7c)", () => {
  const infoToasts = () => useNotificationStore.getState().notifications.filter((n) => n.type === "info").map((n) => n.message);

  it("the words: true whatever the cause, and the Status change still made", () => {
    expect(noPlanKeptMessage(1, "C")).toBe("No Planned dates were kept for C: the schedule could not be calculated when it left Planned. Its Status changed all the same.");
    expect(noPlanKeptMessage(1)).toBe("No Planned dates were kept for 1 activity: the schedule could not be calculated when it left Planned. Its Status changed all the same.");
    expect(noPlanKeptMessage(3)).toBe("No Planned dates were kept for 3 activities: the schedule could not be calculated when they left Planned. Their Status changed all the same.");
  });

  it("the grid: one toast naming the row, only when it leaves Planned with no schedule", () => {
    const u = gridStatusUpdates(stored("c"), "inProgress", undefined);
    expect([u.status, keptNoPlan(u)]).toEqual(["inProgress", true]);
    expect(infoToasts()).toEqual([noPlanKeptMessage(1, "C")]);
    gridStatusUpdates(stored("c"), "inProgress", { startDate: "2026-11-02", endDate: "2026-11-13", duration: 10 });
    gridStatusUpdates(stored("b"), "planned", undefined);
    gridStatusUpdates(stored("b"), "complete", undefined);
    expect(infoToasts()).toHaveLength(1);
  });

  it("the bulk toolbar: ONE toast with the count", () => {
    const plan = planBulkApply({ status: "complete" }, ["c", "l2", "b"], scenario().activities, [], {}, () => ({ min: 0, max: 0 }));
    dispatchBulkPlan(["c", "l2", "b"], plan, { onUpdate: vi.fn() });
    expect(infoToasts()).toEqual([noPlanKeptMessage(1)]); // only C left Planned
  });
});
