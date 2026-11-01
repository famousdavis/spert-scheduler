// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ActivityEditModal } from "./ActivityEditModal";
import { ConfirmHost } from "./ConfirmHost";
import { useProjectStore } from "@ui/hooks/use-project-store";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";
import { useConfirmStore } from "@ui/hooks/use-confirm-store";
import type { Activity, Project } from "@domain/models/types";
import { addActivityToScenario, createActivity, createProject } from "@app/api/project-service";
import { computeSchedule } from "@app/api/schedule-service";

/**
 * WI-150 (owner, R636, D4; Review 34, V-E1 = V-E2 = I-F4): an import stores a recorded date as the
 * source tool gave it, a Saturday included. The Edit Activity window snaps only a date the user
 * CHANGED, so tabbing through it and pressing Save writes nothing new. Calendar Monday to Friday;
 * today pinned to Friday 30 October 2026; dates written out by hand.
 */
function project(extra: Partial<Activity>): Project {
  const p = createProject("P", "2026-10-03", { dependencyMode: false });
  const s = p.scenarios[0]!;
  const a: Activity = {
    ...createActivity("Build", s.settings), id: "b", min: 9, mostLikely: 10, max: 11, distributionType: "uniform", ...extra,
  };
  return { ...p, scenarios: [addActivityToScenario(s, a)] };
}

function openWindow(extra: Partial<Activity>) {
  const p = project(extra);
  useProjectStore.setState({ projects: [p], undoStack: [], redoStack: [] });
  const sc = p.scenarios[0]!;
  render(
    <>
      <ActivityEditModal activityId="b" scenarioId={sc.id} projectId={p.id} onClose={vi.fn()}
        schedule={computeSchedule(sc.activities, sc.startDate, 0.5)} dependencyMode={false} />
      <ConfirmHost />
    </>,
  );
}
const field = (name: string) => document.querySelector(`input[name="${name}"]`) as HTMLInputElement;
const tabPast = (el: HTMLInputElement) => {
  fireEvent.focus(el);
  fireEvent.blur(el);
};
const stored = () => useProjectStore.getState().projects[0]!.scenarios[0]!.activities[0]!;

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-10-30T12:00:00"), toFake: ["Date"] });
  usePreferencesStore.setState((st) => ({ preferences: { ...st.preferences, dateFormat: "MM/DD/YYYY" } }));
  useConfirmStore.setState({ pending: null });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("the Edit Activity window snaps only a recorded date the user changed (D4)", () => {
  it("V-E1: an imported Saturday Actual Start, tabbed past and saved, is still that Saturday", () => {
    openWindow({ status: "inProgress", actualStartDate: "2026-10-03", actualDuration: 20 });
    tabPast(field("actualStartDate"));
    expect(field("actualStartDate").value).toBe("2026-10-03");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect([stored().actualStartDate, stored().actualDuration]).toEqual(["2026-10-03", 20]);
  });

  it("V-E2: a Saturday–Sunday Complete record, tabbed past, stays saveable and unchanged", () => {
    openWindow({ status: "complete", actualStartDate: "2026-10-17", actualFinishDate: "2026-10-18", actualDuration: 1 });
    tabPast(field("actualStartDate"));
    tabPast(field("actualFinishDate"));
    expect([field("actualStartDate").value, field("actualFinishDate").value]).toEqual(["2026-10-17", "2026-10-18"]);
    expect(screen.queryByText("The Actual Start cannot be after the Actual Finish.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect([stored().actualStartDate, stored().actualFinishDate]).toEqual(["2026-10-17", "2026-10-18"]);
  });

  it("a date the user types is still snapped: Saturday 10/10 becomes Monday 10/12", () => {
    openWindow({ status: "inProgress", actualStartDate: "2026-10-03", actualDuration: 20 });
    const start = field("actualStartDate");
    fireEvent.change(start, { target: { value: "2026-10-10" } });
    fireEvent.blur(start);
    expect(start.value).toBe("2026-10-12");
  });
});
