// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { PrintItemTable } from "./print-sections";
import {
  addActivityToScenario,
  createActivity,
  createScenario,
} from "@app/api/project-service";
import type { Activity, ChecklistItem, Scenario } from "@domain/models/types";

/**
 * In the printed Tasks and Deliverables lists, an activity's name row and its items are one
 * `tbody.print-item-group`, which the print stylesheet keeps on one page.
 *
 * ⚠️ jsdom applies no `@media print`, so this pins the MECHANISM: the grouping in the
 * markup. The stylesheet half (`.print-item-group { break-inside: avoid }`) is pinned in
 * `print-stylesheet.test.ts`. The outcome was measured on real PDFs of the Cloud ERP sample:
 * before, two activity names printed alone at the bottom of a page and two short lists split
 * across two pages under no name; after, none, with every row printed exactly once.
 */

function withTasks(scenario: Scenario, name: string, tasks: ChecklistItem[]): Scenario {
  const activity: Activity = { ...createActivity(name, scenario.settings), checklist: tasks };
  return addActivityToScenario(scenario, activity);
}

function scenarioWithTasks(): Scenario {
  let scenario = createScenario("S", "2026-09-07");
  scenario = withTasks(scenario, "Design", [
    { id: "d1", text: "Draft the design", completed: true },
    { id: "d2", text: "Review the design", completed: false },
  ]);
  scenario = withTasks(scenario, "No tasks", []);
  scenario = withTasks(scenario, "Build", [
    { id: "b1", text: "Build it", completed: false },
    { id: "b2", text: "Test it", completed: false },
    { id: "b3", text: "Ship it", completed: false },
  ]);
  return scenario;
}

afterEach(cleanup);

describe("PrintItemTable — an activity's name row and its items print as one group", () => {
  it("renders one tbody.print-item-group per activity with items: its name row, then its items", () => {
    const { container } = render(
      <PrintItemTable
        scenario={scenarioWithTasks()}
        sectionTitle="Activity Tasks"
        itemLabel="Task"
        itemStatusLabel="Status"
        getItems={(a) => a.checklist}
      />,
    );
    // Non-vacuity: the table rendered at all.
    expect(screen.getByRole("heading", { name: "Activity Tasks" })).toBeDefined();

    const groups = [...container.querySelectorAll("tbody.print-item-group")];
    expect(groups.map((g) => [...g.querySelectorAll("tr")].map((tr) => tr.textContent))).toEqual([
      ["Design(1/2)", "Draft the design✓", "Review the design—"],
      ["Build(0/3)", "Build it—", "Test it—", "Ship it—"],
    ]);
    // No body row sits outside a group.
    expect(container.querySelectorAll("tbody tr")).toHaveLength(7);
  });

  // The section flows on from the one before it, as the other long tables do, instead of
  // starting a new page; the print stylesheet keeps its title with its table
  // (`.print-item-title`, pinned in print-stylesheet.test.ts). Measured on the sample: the
  // report went from 12 pages to 11, and no title was left at the foot of a page.
  it("lets the section flow across pages, with its title marked to stay with its table", () => {
    render(
      <PrintItemTable
        scenario={scenarioWithTasks()}
        sectionTitle="Activity Tasks"
        itemLabel="Task"
        itemStatusLabel="Status"
        getItems={(a) => a.checklist}
      />,
    );
    const title = screen.getByRole("heading", { name: "Activity Tasks" });
    expect(title).toHaveClass("print-item-title");
    const section = title.closest("section");
    // Non-vacuity: the lookup found the section, so the next line can fail.
    expect(section).not.toBeNull();
    expect(section).not.toHaveClass("print-section-keep");
  });
});
