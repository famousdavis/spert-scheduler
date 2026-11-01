// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useMemo } from "react";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { ActivityEditModal } from "./ActivityEditModal";
import { ConfirmHost } from "./ConfirmHost";
import { useProjectStore } from "@ui/hooks/use-project-store";
import { useConfirmStore } from "@ui/hooks/use-confirm-store";
import { computeScenarioSchedule } from "@ui/hooks/use-schedule";
import type { Activity, ActivityDependency, Project } from "@domain/models/types";
import type { AiOp } from "@app/api/ai-batch-service";
import { ProjectSchema } from "@domain/schemas/project.schema";
import { addActivityToScenario, createActivity, createProject } from "@app/api/project-service";
import { computeDependencySchedule } from "@core/schedule/deterministic";

/**
 * WI-158 (owner, R650, decision 10) — the Edit Activity window saves ONLY what the user changed.
 *
 * Each test opens the window on Build, lets ANOTHER writer change Build through the store's own path —
 * a collaborator's update (`mergeProject`, the path the cloud listener takes), Connect AI
 * (`applyAiBatch`) or undo — and then presses Save. Until v0.83.1 the window compared its drafts,
 * seeded once when it opened, with the LIVE row, so Save undid every such change (Review 37, G4).
 * Today is Fri 2026-10-30. Design → Build, finish-to-start; both Triangular 3–5–7, so Build's plan
 * is 10/12–10/16.
 */
type Extra = Partial<Activity>;

function project(build: Extra = {}): Project {
  const p = createProject("P", "2026-10-05", { dependencyMode: true });
  let s = p.scenarios[0]!;
  const row = (id: string, name: string, extra: Extra): Activity => ({
    ...createActivity(name, s.settings), id, min: 3, mostLikely: 5, max: 7, distributionType: "triangular", ...extra,
  });
  s = addActivityToScenario(s, row("a", "Design", {}));
  s = addActivityToScenario(s, row("b", "Build", {
    description: "Scope", notes: "Note one",
    checklist: [{ id: "t1", text: "Task one", completed: false }],
    deliverables: [{ id: "d1", text: "Spec", completed: false }],
    ...build,
  }));
  const dependencies: ActivityDependency[] = [{ fromActivityId: "a", toActivityId: "b", type: "FS", lagDays: 0 }];
  return { ...p, scenarios: [{ ...s, dependencies }] };
}

const scenario = () => useProjectStore.getState().projects[0]!.scenarios[0]!;
const stored = (): Activity => scenario().activities.find((a) => a.id === "b")!;
/** The page's plan schedule, as `ProjectPage` builds it: the same function, the given rows replaced. */
const planSchedule = (changed: Activity[]) => {
  const s = scenario();
  const byId = new Map(changed.map((a) => [a.id, a]));
  return computeScenarioSchedule({
    activities: s.activities.map((a) => byId.get(a.id) ?? a), startDate: s.startDate, probabilityTarget: 0.5,
    network: { dependencies: s.dependencies, milestones: s.milestones },
  }).schedule;
};

/**
 * The page's part: its schedule follows the store, as `ProjectPage`'s does — from `today` when one is
 * given, as the page schedules a scenario that holds a record (WI-154).
 */
function Harness({ onClose, today }: { onClose: () => void; today?: string }) {
  const s = useProjectStore((st) => st.projects[0]!.scenarios[0]!);
  const projectId = useProjectStore((st) => st.projects[0]!.id);
  const schedule = useMemo(() => (today
    ? computeScenarioSchedule({
      activities: s.activities, startDate: s.startDate, probabilityTarget: 0.5,
      network: { dependencies: s.dependencies, milestones: s.milestones }, today,
    }).schedule ?? undefined
    : computeDependencySchedule(s.activities, s.dependencies, s.startDate, 0.5)), [s, today]);
  return (
    <ActivityEditModal activityId="b" scenarioId={s.id} projectId={projectId} onClose={onClose}
      schedule={schedule} planSchedule={planSchedule} dependencyMode />
  );
}

function mount(today?: string) {
  const onClose = vi.fn();
  render(<><Harness onClose={onClose} today={today} /><ConfirmHost /></>);
  return onClose;
}

function open(build?: Extra) {
  useProjectStore.setState({ projects: [project(build)], undoStack: [], redoStack: [] });
  return mount();
}

/** A collaborator's update as the cloud listener delivers it: the whole project, through `mergeProject`. */
function collaborator(change: (b: Activity) => Activity, dependencies?: ActivityDependency[]) {
  const p = useProjectStore.getState().projects[0]!;
  const incoming = JSON.parse(JSON.stringify({
    ...p,
    scenarios: p.scenarios.map((s) => ({
      ...s,
      dependencies: dependencies ?? s.dependencies,
      activities: s.activities.map((a) => (a.id === "b" ? change(a) : a)),
    })),
  })) as Project;
  act(() => useProjectStore.getState().mergeProject(incoming));
}

const save = () => fireEvent.click(screen.getByRole("button", { name: "Save" }));
const field = (selector: string) => document.querySelector(selector) as HTMLInputElement;
const openSection = (title: RegExp) => fireEvent.click(screen.getByRole("button", { name: title }));

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-10-30T12:00:00"), toFake: ["Date"] });
  useConfirmStore.setState({ pending: null });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** Recorded In Progress from Mon 10/26, five days in, kept plan 10/12–10/16: what Review 37's AI wrote. */
const STARTED: Extra = {
  status: "inProgress", actualStartDate: "2026-10-26", actualDuration: 5,
  plannedStartDate: "2026-10-12", plannedFinishDate: "2026-10-16",
};
/** Recorded In Progress from Mon 10/19, ten days in, kept plan 10/12–10/16: Review 38's row. */
const IN_PROGRESS: Extra = {
  status: "inProgress", actualStartDate: "2026-10-19", actualDuration: 10,
  plannedStartDate: "2026-10-12", plannedFinishDate: "2026-10-16",
};
const progress = (a: Activity) =>
  [a.status, a.actualStartDate, a.actualFinishDate, a.actualDuration, a.plannedStartDate, a.plannedFinishDate];

const GROUPS: { group: string; change: Extra; read: (a: Activity) => unknown }[] = [
  { group: "Name", change: { name: "Build v2" }, read: (a) => a.name },
  { group: "Description", change: { description: "Scope v2" }, read: (a) => a.description },
  { group: "Min, ML and Max", change: { min: 4, mostLikely: 6, max: 9 }, read: (a) => [a.min, a.mostLikely, a.max] },
  {
    group: "Distribution and Confidence", change: { distributionType: "normal", confidenceLevel: "highConfidence" },
    read: (a) => [a.distributionType, a.confidenceLevel],
  },
  { group: "Status with its dates, count and Planned dates", change: STARTED, read: progress },
  {
    group: "Scheduling Constraint", change: { constraintType: "MSO", constraintDate: "2026-10-14", constraintMode: "hard" },
    read: (a) => [a.constraintType, a.constraintDate, a.constraintMode],
  },
  {
    group: "Tasks",
    change: { checklist: [{ id: "t1", text: "Task one", completed: true }, { id: "t2", text: "Task two", completed: false }] },
    read: (a) => a.checklist,
  },
  {
    group: "Deliverables",
    change: { deliverables: [{ id: "d1", text: "Spec", completed: true }, { id: "d2", text: "Plan", completed: false }] },
    read: (a) => a.deliverables,
  },
  { group: "Notes", change: { notes: "Note two" }, read: (a) => a.notes },
];

describe("a Save with no edit keeps what another writer changed while the window was open", () => {
  it("Review 37, G4: a Planned row recorded In Progress meanwhile stays In Progress, with its dates", () => {
    open();
    collaborator((b) => ({ ...b, ...STARTED }));
    save();
    expect(progress(stored())).toEqual(["inProgress", "2026-10-26", undefined, 5, "2026-10-12", "2026-10-16"]);
  });

  for (const { group, change, read } of GROUPS) {
    it(`${group}, changed by a collaborator`, () => {
      open();
      collaborator((b) => ({ ...b, ...change }));
      const theirs = read(stored());
      save();
      expect(read(stored())).toEqual(theirs);
    });
  }

  it("Dependencies: Save never writes them (a collaborator removed Design → Build)", () => {
    open();
    collaborator((b) => b, []);
    save();
    expect(scenario().dependencies).toEqual([]);
  });

  it("Connect AI's rename and added task", () => {
    open();
    const p = useProjectStore.getState().projects[0]!;
    const ops = [
      { seq: 1, op: "rename_activity", payload: { scenarioId: p.scenarios[0]!.id, id: "b", name: "Build (AI)" } },
      { seq: 2, op: "add_checklist_items", payload: { scenarioId: p.scenarios[0]!.id, id: "b", items: [{ id: "t9", text: "From the AI" }] } },
    ] as unknown as AiOp[];
    act(() => { useProjectStore.getState().applyAiBatch(p.id, ops, p.scenarios[0]!.id); });
    expect(stored().name, "the AI's write landed").toBe("Build (AI)");
    save();
    expect(stored().name).toBe("Build (AI)");
    expect(stored().checklist?.map((t) => t.text)).toEqual(["Task one", "From the AI"]);
  });

  it("an undo run while the window is open", () => {
    useProjectStore.setState({ projects: [project()], undoStack: [], redoStack: [] });
    const p = useProjectStore.getState().projects[0]!;
    useProjectStore.getState().updateActivityField(p.id, p.scenarios[0]!.id, "b", { name: "Build renamed" });
    mount();
    act(() => useProjectStore.getState().undo());
    expect(stored().name).toBe("Build");
    save();
    expect(stored().name).toBe("Build");
  });

  it("a Planned row's stale count and Actual Start: no Status or date was changed, so neither is cleared", () => {
    open({ actualDuration: 3, actualStartDate: "2026-10-20" });
    save();
    expect([stored().actualDuration, stored().actualStartDate]).toEqual([3, "2026-10-20"]);
  });
});

describe("the unsaved-changes prompts use the same comparison as Save", () => {
  it("Cancel after another writer's change asks nothing", () => {
    const onClose = open();
    collaborator((b) => ({ ...b, name: "Build v2" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(useConfirmStore.getState().pending).toBeNull();
    expect(onClose).toHaveBeenCalled();
  });

  it("Escape after another writer's change asks nothing, and the change stays", () => {
    const onClose = open();
    collaborator((b) => ({ ...b, name: "Build v2" }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(useConfirmStore.getState().pending).toBeNull();
    expect(onClose).toHaveBeenCalled();
    expect(stored().name).toBe("Build v2");
  });

  it("an edit of the user's own still asks", () => {
    open();
    collaborator((b) => ({ ...b, name: "Build v2" }));
    fireEvent.change(field('textarea[name="activityDescription"]'), { target: { value: "Mine" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(useConfirmStore.getState().pending).not.toBeNull();
  });
});

describe("what the user changed is saved onto the row as it is now", () => {
  it("a change to another field is saved beside the other writer's", () => {
    open();
    collaborator((b) => ({ ...b, name: "Build v2" }));
    openSection(/^Notes/);
    fireEvent.change(screen.getByLabelText("Activity notes"), { target: { value: "Note mine" } });
    save();
    expect([stored().name, stored().notes]).toEqual(["Build v2", "Note mine"]);
  });

  it("a change to the same field: the user's is saved", () => {
    open();
    collaborator((b) => ({ ...b, name: "Build v2" }));
    fireEvent.change(field('input[name="activityName"]'), { target: { value: "Build (mine)" } });
    save();
    expect(stored().name).toBe("Build (mine)");
  });

  it("Min, ML and Max are saved one by one: ML typed here, Min and Max from the other writer", () => {
    open();
    openSection(/^Estimates/);
    fireEvent.change(field('input[name="estimateMostLikely"]'), { target: { value: "6" } });
    collaborator((b) => ({ ...b, min: 4, max: 9 }));
    save();
    expect([stored().min, stored().mostLikely, stored().max]).toEqual([4, 6, 9]);
  });

  it("D1: Status, its dates and count are saved together: a count typed here keeps the row consistent", () => {
    open(IN_PROGRESS);
    fireEvent.change(field('input[name="actualDuration"]'), { target: { value: "9" } });
    collaborator((b) => ({
      ...b, status: "planned", actualStartDate: undefined, actualDuration: undefined,
      plannedStartDate: undefined, plannedFinishDate: undefined,
    }));
    save();
    expect(progress(stored())).toEqual(["inProgress", "2026-10-19", undefined, 9, "2026-10-12", "2026-10-16"]);
  });

  it("D1: the Scheduling Constraint is saved whole, so the project still loads", () => {
    open({ constraintType: "MSO", constraintDate: "2026-10-14", constraintMode: "hard" });
    openSection(/^Scheduling Constraint/);
    fireEvent.click(field('input[name="constraintMode"][value="soft"]'));
    collaborator((b) => ({ ...b, constraintType: null, constraintDate: null, constraintMode: null, constraintNote: null }));
    save();
    expect([stored().constraintType, stored().constraintDate, stored().constraintMode]).toEqual(["MSO", "2026-10-14", "soft"]);
    expect(ProjectSchema.safeParse(useProjectStore.getState().projects[0]).success).toBe(true);
  });

  it("D4: tabbing through an Actual Start the user did not change never snaps it over another writer's", () => {
    // Sat 10/24, as an import stored it; the collaborator moves it to Wed 10/21.
    open({ status: "inProgress", actualStartDate: "2026-10-24", actualDuration: 5 });
    collaborator((b) => ({ ...b, actualStartDate: "2026-10-21", actualDuration: 8 }));
    const start = field('input[name="actualStartDate"]');
    expect(start.value, "B: the window shows the collaborator's date").toBe("2026-10-21");
    fireEvent.focus(start);
    fireEvent.blur(start);
    save();
    expect([stored().actualStartDate, stored().actualDuration]).toEqual(["2026-10-21", 8]);
  });

  it("D4: once the count is changed here, a blur never snaps the start the window shows over another writer's", () => {
    open({ status: "inProgress", actualStartDate: "2026-10-24", actualDuration: 5 });
    fireEvent.change(field('input[name="actualDuration"]'), { target: { value: "6" } });
    collaborator((b) => ({ ...b, actualStartDate: "2026-10-21", actualDuration: 8 }));
    const start = field('input[name="actualStartDate"]');
    expect(start.value, "the window shows its own Status and dates").toBe("2026-10-24");
    fireEvent.focus(start);
    fireEvent.blur(start);
    save();
    expect([stored().actualStartDate, stored().actualDuration]).toEqual(["2026-10-24", 6]);
  });

  it("D2: the Status rule runs on the activity as the window shows it — In Progress → Complete keeps the recorded start", () => {
    open();
    collaborator((b) => ({ ...b, ...STARTED }));
    expect(field('select[name="activityStatus"]').value, "B: the window shows In Progress").toBe("inProgress");
    fireEvent.change(field('select[name="activityStatus"]'), { target: { value: "complete" } });
    save();
    expect(progress(stored())).toEqual(["complete", "2026-10-26", "2026-10-30", 5, "2026-10-12", "2026-10-16"]);
  });

  it("D2: a row set back to Planned elsewhere, then Complete here: the rule reads the Planned row the window shows, and the plan's dates", () => {
    // Design is recorded, so the page's schedule holds unstarted work at today (10/30); the plan does not.
    const p = project(IN_PROGRESS);
    const s = p.scenarios[0]!;
    const design = { ...s.activities[0]!, status: "complete" as const, actualStartDate: "2026-10-05", actualFinishDate: "2026-10-09", actualDuration: 5 };
    useProjectStore.setState({ projects: [{ ...p, scenarios: [{ ...s, activities: [design, s.activities[1]!] }] }], undoStack: [], redoStack: [] });
    mount("2026-10-30");
    collaborator((b) => ({
      ...b, status: "planned", actualStartDate: undefined, actualDuration: undefined,
      plannedStartDate: undefined, plannedFinishDate: undefined,
    }));
    expect(field('select[name="activityStatus"]').value, "B: the window shows Planned").toBe("planned");
    fireEvent.change(field('select[name="activityStatus"]'), { target: { value: "complete" } });
    save();
    expect(progress(stored())).toEqual(["complete", "2026-10-12", "2026-10-16", 5, "2026-10-12", "2026-10-16"]);
  });

  it("D1: a list both changed: the window's list is saved whole", () => {
    open();
    openSection(/^Tasks/);
    fireEvent.click(screen.getAllByLabelText("Task completed")[0]!);
    collaborator((b) => ({ ...b, checklist: [...(b.checklist ?? []), { id: "t2", text: "Task two", completed: false }] }));
    save();
    expect(stored().checklist).toEqual([{ id: "t1", text: "Task one", completed: true }]);
  });
});

/** The text of the line, or null. */
const line = () => screen.queryByText(/^Changed somewhere else while this window was open/)?.textContent ?? null;
const FIRST = "Changed somewhere else while this window was open:";
const NOW_SHOWS = "The window now shows the new values.";

describe("B: the window shows the activity as it is now, except in a part the user has changed", () => {
  it("every untouched field shows another writer's value as it arrives", () => {
    open();
    collaborator((b) => ({ ...b, ...STARTED, name: "Build v2", mostLikely: 6, notes: "Note two" }));
    expect(field('input[name="activityName"]').value).toBe("Build v2");
    expect(field('select[name="activityStatus"]').value).toBe("inProgress");
    expect(field('input[name="actualStartDate"]').value).toBe("2026-10-26");
    expect(field('input[name="actualDuration"]').value).toBe("5");
    openSection(/^Estimates/);
    expect(field('input[name="estimateMostLikely"]').value).toBe("6");
    openSection(/^Notes/);
    expect((screen.getByLabelText("Activity notes") as HTMLTextAreaElement).value).toBe("Note two");
  });

  it("Review 38 P1b: ML being typed keeps the user's ML; the other writer's Max shows, and is what Save keeps", () => {
    open();
    openSection(/^Estimates/);
    const ml = field('input[name="estimateMostLikely"]');
    fireEvent.focus(ml);
    fireEvent.change(ml, { target: { value: "6" } });
    collaborator((b) => ({ ...b, mostLikely: 8, max: 12 }));
    expect([field('input[name="estimateMin"]').value, ml.value, field('input[name="estimateMax"]').value]).toEqual(["3", "6", "12"]);
    expect(line()).toBe(`${FIRST} ML and Max. ${NOW_SHOWS} You had changed ML too: Save keeps the ML this window shows.`);
    fireEvent.blur(ml);
    save();
    expect([stored().min, stored().mostLikely, stored().max]).toEqual([3, 6, 12]);
  });

  it("Review 38 P3: Notes changed elsewhere while collapsed — opened, the section shows theirs, and the user's addition keeps it", () => {
    open();
    collaborator((b) => ({ ...b, notes: "Note two" }));
    expect(line()).toBe(`${FIRST} Notes. ${NOW_SHOWS}`);
    openSection(/^Notes/);
    const ta = screen.getByLabelText("Activity notes") as HTMLTextAreaElement;
    expect(ta.value).toBe("Note two");
    fireEvent.change(ta, { target: { value: `${ta.value} + mine` } });
    expect(line()).toBe(`${FIRST} Notes. ${NOW_SHOWS} You had changed Notes too: Save keeps the Notes this window shows.`);
    save();
    expect(stored().notes).toBe("Note two + mine");
  });

  it("Review 38 P11: a start recorded elsewhere shows at once, and a Save with no edit keeps it", () => {
    open();
    collaborator((b) => ({ ...b, ...STARTED }));
    expect([field('input[name="actualStartDate"]').value, field('input[name="actualDuration"]').value]).toEqual(["2026-10-26", "5"]);
    expect(line()).toBe(`${FIRST} Status, Planned Start, Actual Start, Planned Finish and Actual Dur. ${NOW_SHOWS}`);
    save();
    expect(progress(stored())).toEqual(["inProgress", "2026-10-26", undefined, 5, "2026-10-12", "2026-10-16"]);
  });

  it("Review 38 P13: a Note typed after another writer moved the constraint Date keeps their Date", () => {
    open({ constraintType: "MSO", constraintDate: "2026-10-14", constraintMode: "soft", constraintNote: "n1" });
    collaborator((b) => ({ ...b, constraintDate: "2026-10-21" }));
    openSection(/^Scheduling Constraint/);
    fireEvent.change(field('textarea[name="constraintNote"]'), { target: { value: "n1 mine" } });
    save();
    expect([stored().constraintType, stored().constraintDate, stored().constraintMode, stored().constraintNote])
      .toEqual(["MSO", "2026-10-21", "soft", "n1 mine"]);
  });

  it("an edit taken back to what the part showed lets the part follow the live row again", () => {
    open();
    const nameBox = field('input[name="activityName"]');
    fireEvent.change(nameBox, { target: { value: "Buildx" } });
    fireEvent.change(nameBox, { target: { value: "Build" } });
    collaborator((b) => ({ ...b, name: "Build v2" }));
    expect(nameBox.value).toBe("Build v2");
    save();
    expect(stored().name).toBe("Build v2");
  });
});

describe("D1: a part the user changed and another writer changed after it is saved whole, as the window shows it", () => {
  it("Review 38 P1: a count typed here, then the Actual Start moved elsewhere: the window's Status and dates are saved", () => {
    open(IN_PROGRESS);
    fireEvent.change(field('input[name="actualDuration"]'), { target: { value: "9" } });
    collaborator((b) => ({ ...b, actualStartDate: "2026-10-21", actualDuration: 8 }));
    expect([field('input[name="actualStartDate"]').value, field('input[name="actualDuration"]').value]).toEqual(["2026-10-19", "9"]);
    expect(line()).toBe(
      `${FIRST} Actual Start and Actual Dur. ${NOW_SHOWS} You had changed Actual Dur. too: Save keeps the Status and dates this window shows.`,
    );
    save();
    expect(progress(stored())).toEqual(["inProgress", "2026-10-19", undefined, 9, "2026-10-12", "2026-10-16"]);
  });

  it("Review 38 P13, the other order: a Note typed, then the Date moved elsewhere: the window's constraint is saved", () => {
    open({ constraintType: "MSO", constraintDate: "2026-10-14", constraintMode: "soft", constraintNote: "n1" });
    openSection(/^Scheduling Constraint/);
    fireEvent.change(field('textarea[name="constraintNote"]'), { target: { value: "n1 mine" } });
    collaborator((b) => ({ ...b, constraintDate: "2026-10-21" }));
    expect(line()).toBe(
      `${FIRST} Scheduling Constraint. ${NOW_SHOWS} You had changed Scheduling Constraint too: Save keeps the constraint this window shows.`,
    );
    save();
    expect([stored().constraintType, stored().constraintDate, stored().constraintMode, stored().constraintNote])
      .toEqual(["MSO", "2026-10-14", "soft", "n1 mine"]);
  });

  const TASK_TWO = { id: "t2", text: "Task two", completed: false };
  const TASKS_LINE = `${FIRST} Tasks. ${NOW_SHOWS} You had changed Tasks too: Save keeps the list this window shows.`;

  it("Review 38 P10a: Task one ticked here, Task two added elsewhere: the window's list is saved", () => {
    open();
    openSection(/^Tasks/);
    fireEvent.click(screen.getAllByLabelText("Task completed")[0]!);
    collaborator((b) => ({ ...b, checklist: [...(b.checklist ?? []), TASK_TWO] }));
    expect(line()).toBe(TASKS_LINE);
    save();
    expect(stored().checklist?.map((t) => `${t.text}:${t.completed}`)).toEqual(["Task one:true"]);
  });

  it("Review 38 P10b: Task one ticked here, deleted elsewhere: the window's list is saved", () => {
    open();
    openSection(/^Tasks/);
    fireEvent.click(screen.getAllByLabelText("Task completed")[0]!);
    collaborator((b) => ({ ...b, checklist: [] }));
    expect(line()).toBe(TASKS_LINE);
    save();
    expect(stored().checklist?.map((t) => `${t.text}:${t.completed}`)).toEqual(["Task one:true"]);
  });

  it("Review 38 P10c (D4): a task only typed in its box is added to the list as it is now", () => {
    open();
    openSection(/^Tasks/);
    fireEvent.change(screen.getByLabelText("Add a task"), { target: { value: "Typed" } });
    collaborator((b) => ({ ...b, checklist: [...(b.checklist ?? []), TASK_TWO] }));
    expect(line()).toBe(`${FIRST} Tasks. ${NOW_SHOWS}`);
    save();
    expect(stored().checklist?.map((t) => `${t.text}:${t.completed}`)).toEqual(["Task one:false", "Task two:false", "Typed:false"]);
  });

  it("D4: a deliverable only typed in its box is added to the list as it is now", () => {
    open();
    openSection(/^Deliverables/);
    fireEvent.change(screen.getByLabelText("Add a deliverable"), { target: { value: "Typed" } });
    collaborator((b) => ({ ...b, deliverables: [...(b.deliverables ?? []), { id: "d2", text: "Plan", completed: false }] }));
    save();
    expect(stored().deliverables?.map((t) => t.text)).toEqual(["Spec", "Plan", "Typed"]);
  });

  it("a Name typed here, then renamed elsewhere: the window's Name is saved, and the line says so", () => {
    open();
    fireEvent.change(field('input[name="activityName"]'), { target: { value: "Build (mine)" } });
    collaborator((b) => ({ ...b, name: "Build v2" }));
    expect(line()).toBe(`${FIRST} Name. ${NOW_SHOWS} You had changed Name too: Save keeps the Name this window shows.`);
    save();
    expect(stored().name).toBe("Build (mine)");
  });
});

describe("G1 and G2", () => {
  const COMPLETE: Extra = {
    status: "complete", actualStartDate: "2026-10-19", actualFinishDate: "2026-10-23", actualDuration: 5,
    plannedStartDate: "2026-10-12", plannedFinishDate: "2026-10-16",
  };
  const IN_PROGRESS_TODAY = ["inProgress", "2026-10-30", undefined, 1, "2026-10-12", "2026-10-16"];

  it("Review 38 P5d (G1): Escape's Save, answered after another writer recorded Complete, writes one consistent Status and dates", async () => {
    open();
    fireEvent.change(field('select[name="activityStatus"]'), { target: { value: "inProgress" } });
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(useConfirmStore.getState().pending?.kind).toBe("unsaved-changes");
    collaborator((b) => ({ ...b, ...COMPLETE }));
    await act(async () => { useConfirmStore.getState().settleUnsavedChanges("save"); });
    expect(progress(stored())).toEqual(IN_PROGRESS_TODAY);
  });

  it("Review 38 P5e (control): the same write, then the window's own Save", () => {
    open();
    fireEvent.change(field('select[name="activityStatus"]'), { target: { value: "inProgress" } });
    collaborator((b) => ({ ...b, ...COMPLETE }));
    save();
    expect(progress(stored())).toEqual(IN_PROGRESS_TODAY);
  });

  it("Review 38 P4 (G2): recorded dates the window does not write never block a Notes edit", () => {
    open(IN_PROGRESS);
    const p = useProjectStore.getState().projects[0]!;
    act(() => useProjectStore.getState().mergeProject({
      ...p, scenarios: p.scenarios.map((s) => ({ ...s, startDate: "2026-10-21" })),
    }));
    openSection(/^Notes/);
    fireEvent.change(screen.getByLabelText("Activity notes"), { target: { value: "Note mine" } });
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(false);
    save();
    expect([stored().notes, stored().actualStartDate]).toEqual(["Note mine", "2026-10-19"]);
  });

  it("G2: once Status or a date is changed, the same dates are judged and Save says why", () => {
    open({ ...IN_PROGRESS, actualStartDate: "2026-10-01" });
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.change(field('input[name="actualDuration"]'), { target: { value: "9" } });
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("G2: an unnamed row's empty Name never blocks another edit; clearing a Name still does", () => {
    open({ name: "" });
    openSection(/^Notes/);
    fireEvent.change(screen.getByLabelText("Activity notes"), { target: { value: "Note mine" } });
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(false);
    cleanup();
    open();
    fireEvent.change(field('input[name="activityName"]'), { target: { value: "  " } });
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("D3: the line", () => {
  it("is not there while nothing else has changed the activity", () => {
    open();
    fireEvent.change(field('input[name="activityName"]'), { target: { value: "Build (mine)" } });
    expect(line()).toBeNull();
  });

  it("is not there for a change to another activity", () => {
    open();
    const p = useProjectStore.getState().projects[0]!;
    act(() => useProjectStore.getState().updateActivityField(p.id, p.scenarios[0]!.id, "a", { name: "Design v2" }));
    expect(line()).toBeNull();
  });

  it("sits in a status region that is always there, outside the scroller", () => {
    open();
    const region = screen.getAllByRole("status").find((el) => el.parentElement === screen.getByRole("dialog"));
    expect(region, "the live region is there before any line").toBeTruthy();
    collaborator((b) => ({ ...b, notes: "Note two" }));
    expect(region!.textContent).toBe(`${FIRST} Notes. ${NOW_SHOWS}`);
  });
});
