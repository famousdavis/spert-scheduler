// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useMemo } from "react";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { ActivityEditModal } from "@ui/components/ActivityEditModal";
import { ConfirmHost } from "@ui/components/ConfirmHost";
import { useProjectStore } from "@ui/hooks/use-project-store";
import { useConfirmStore } from "@ui/hooks/use-confirm-store";
import { computeScenarioSchedule } from "@app/api/scenario-schedule";
import type { AiOp, AiOpResult } from "@app/api/ai-batch-service";
import type { BulkSetProgressItem } from "@app/api/ai-op-types";
import { addActivityToScenario, createActivity, createProject } from "@app/api/project-service";
import type { Activity, ActivityDependency, Project } from "@domain/models/types";

/**
 * WI-150 release C — the case v0.83.1 (WI-158) was built for: the Edit Activity window is OPEN while
 * Connect AI records the activity's progress, through the store's real `applyAiBatch` (the drain's own
 * call, with an op shaped as the drain builds it, `createdOn` included) and the real window. The window
 * shows the AI's Status and dates at once, the line under its title names them, and a Save with no
 * edit keeps them — never undoing the AI's record (Review 37, G4). Today is Fri 2026-10-30; Design →
 * Build, finish-to-start, both Triangular 3–5–7, so Build's plan is 10/12–10/16.
 */
const TODAY = "2026-10-30";

function project(build: Partial<Activity> = {}): Project {
  const p = createProject("P", "2026-10-05", { dependencyMode: true });
  let s = p.scenarios[0]!;
  const row = (id: string, name: string, extra: Partial<Activity>): Activity => ({
    ...createActivity(name, s.settings), id, min: 3, mostLikely: 5, max: 7, distributionType: "triangular", ...extra,
  });
  s = addActivityToScenario(s, row("a", "Design", {}));
  s = addActivityToScenario(s, row("b", "Build", build));
  const dependencies: ActivityDependency[] = [{ fromActivityId: "a", toActivityId: "b", type: "FS", lagDays: 0 }];
  return { ...p, scenarios: [{ ...s, dependencies }] };
}

const scenario = () => useProjectStore.getState().projects[0]!.scenarios[0]!;
const stored = (): Activity => scenario().activities.find((a) => a.id === "b")!;
const progress = (a: Activity) =>
  [a.status, a.actualStartDate, a.actualFinishDate, a.actualDuration, a.plannedStartDate, a.plannedFinishDate];

/** The page's part: its schedule follows the store, from today, as `ProjectPage`'s does; its plan without today. */
function Harness() {
  const s = useProjectStore((st) => st.projects[0]!.scenarios[0]!);
  const projectId = useProjectStore((st) => st.projects[0]!.id);
  const inputs = useMemo(() => ({
    startDate: s.startDate, probabilityTarget: 0.5, network: { dependencies: s.dependencies, milestones: s.milestones },
  }), [s]);
  const schedule = useMemo(() => computeScenarioSchedule({ ...inputs, activities: s.activities, today: TODAY }).schedule ?? undefined, [inputs, s]);
  const planSchedule = (changed: Activity[]) => {
    const byId = new Map(changed.map((a) => [a.id, a]));
    return computeScenarioSchedule({ ...inputs, activities: s.activities.map((a) => byId.get(a.id) ?? a) }).schedule;
  };
  return (
    <ActivityEditModal activityId="b" scenarioId={s.id} projectId={projectId} onClose={() => {}}
      schedule={schedule} planSchedule={planSchedule} dependencyMode />
  );
}

/** The AI's write, as the drain makes it: the store's own `applyAiBatch`, the batch's today, the op's creation day. */
function aiRecords(updates: BulkSetProgressItem[]): AiOpResult[] {
  const p = useProjectStore.getState().projects[0]!;
  const op = {
    seq: 1, op: "bulk_set_activity_progress", payload: { scenarioId: p.scenarios[0]!.id, updates }, createdOn: TODAY,
  } as unknown as AiOp;
  let results: AiOpResult[] = [];
  act(() => { results = useProjectStore.getState().applyAiBatch(p.id, [op], p.scenarios[0]!.id, { today: TODAY }); });
  return results;
}

const field = (selector: string) => document.querySelector(selector) as HTMLInputElement;
const line = () => screen.queryByText(/^Changed somewhere else while this window was open/)?.textContent ?? null;
const save = () => fireEvent.click(screen.getByRole("button", { name: "Save" }));

beforeEach(() => {
  vi.useFakeTimers({ now: new Date(`${TODAY}T12:00:00`), toFake: ["Date"] });
  useConfirmStore.setState({ pending: null });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("an AI progress write while the Edit Activity window is open", () => {
  it("started: the window shows the AI's Status and dates, the line names them, and Save with no edit keeps them", () => {
    useProjectStore.setState({ projects: [project()], undoStack: [], redoStack: [] });
    render(<><Harness /><ConfirmHost /></>);
    expect(field('select[name="activityStatus"]').value, "the control: Build is Planned when the window opens").toBe("planned");

    const results = aiRecords([{ id: "b", status: "inProgress", actualStartDate: "2026-10-26" }]);
    expect(results[0]!.outcome).toEqual({ status: "applied" });

    expect(field('select[name="activityStatus"]').value).toBe("inProgress");
    expect([field('input[name="actualStartDate"]').value, field('input[name="actualDuration"]').value]).toEqual(["2026-10-26", "5"]);
    expect(line()).toBe(
      "Changed somewhere else while this window was open: Status, Planned Start, Actual Start, Planned Finish and Actual Dur. The window now shows the new values.",
    );
    save();
    expect(progress(stored())).toEqual(["inProgress", "2026-10-26", undefined, 5, "2026-10-12", "2026-10-16"]);
  });

  it("finished, the finish left out: the window shows Complete on the day sent, and Save with no edit keeps it", () => {
    const started: Partial<Activity> = {
      status: "inProgress", actualStartDate: "2026-10-26", actualDuration: 5, plannedStartDate: "2026-10-12", plannedFinishDate: "2026-10-16",
    };
    useProjectStore.setState({ projects: [project(started)], undoStack: [], redoStack: [] });
    render(<><Harness /><ConfirmHost /></>);

    const results = aiRecords([{ id: "b", status: "complete" }]);
    expect(results[0]!.outcome).toEqual({ status: "applied" });

    expect(field('select[name="activityStatus"]').value).toBe("complete");
    expect(field('input[name="actualFinishDate"]').value).toBe("2026-10-30");
    expect(line()).toBe(
      "Changed somewhere else while this window was open: Status and Actual Finish. The window now shows the new values.",
    );
    save();
    expect(progress(stored())).toEqual(["complete", "2026-10-26", "2026-10-30", 5, "2026-10-12", "2026-10-16"]);
  });
});
