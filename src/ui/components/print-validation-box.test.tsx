// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { PrintValidationBox } from "./print-sections";
import { PrintableReport } from "./PrintableReport";
import { ValidationSummary } from "./ValidationSummary";
import { createActivity, createProject, createScenario } from "@app/api/project-service";
import { savedScenarioFlags } from "@ui/helpers/scenario-flags";
import type { Activity, Scenario } from "@domain/models/types";

/**
 * WI-58 — a printout of a scenario whose SAVED activities are flagged starts with the validation
 * summary's box. ⚠️ jsdom applies no `@media print` and paints nothing, so this pins the MECHANISM:
 * the markup, its words and its place. The paper was measured on real PDFs of the Cloud ERP sample:
 * the box on page 1 above Project Summary, never split, page counts unchanged; a valid scenario
 * printed pixel-identical to the release before; a refused-only scenario printed no box.
 */

afterEach(cleanup);

const START = "2026-04-06";

function scenarioOf(name: string, rows: Partial<Activity>[]): Scenario {
  const scenario = createScenario(name, START);
  return {
    ...scenario,
    activities: rows.map((patch, i) => ({ ...createActivity(`Row ${i + 1}`, scenario.settings), ...patch })),
  };
}

const VALID = { min: 5, mostLikely: 10, max: 20 };
const OUT_OF_ORDER_NORMAL = { min: 12, mostLikely: 10, max: 20, distributionType: "normal" as const };
const OUT_OF_ORDER_TRIANGULAR = { min: 30, mostLikely: 26, max: 40, distributionType: "triangular" as const };
const ESTIMATE_ERROR = { message: "Cannot create Triangular distribution…", isCycleError: false, isCalendarError: false };
const CYCLE_ERROR = { message: "Dependency cycle detected", isCycleError: true, isCalendarError: false };

/** The box's lines, in order, as printed. */
const boxLines = (box: HTMLElement) =>
  Array.from(box.querySelectorAll("p, li")).map((el) => el.textContent);

describe("PrintValidationBox — the owner's words, from the saved plan", () => {
  it("W6: a flag that does not stop the schedule", () => {
    const { container } = render(<PrintValidationBox scenario={scenarioOf("Fast-track", [VALID, OUT_OF_ORDER_NORMAL])} scheduleError={null} />);
    const box = container.querySelector("section")!;
    expect(boxLines(box)).toEqual([
      "1 activity has validation errors",
      "#2 Row 2: Min is above Most Likely",
      "This scenario cannot be simulated until this is fixed.",
    ]);
  });

  it("W6-c: ONE row that stops the schedule, when the page's error is that estimate", () => {
    const { container } = render(<PrintValidationBox scenario={scenarioOf("Aggressive", [OUT_OF_ORDER_TRIANGULAR])} scheduleError={ESTIMATE_ERROR} />);
    expect(boxLines(container.querySelector("section")!).at(-1)).toBe("This scenario's schedule cannot be calculated until this is fixed.");
  });

  it("W6-d: two or more rows, any of which stops it", () => {
    const { container } = render(
      <PrintValidationBox scenario={scenarioOf("Stretch", [OUT_OF_ORDER_NORMAL, OUT_OF_ORDER_TRIANGULAR])} scheduleError={ESTIMATE_ERROR} />
    );
    const lines = boxLines(container.querySelector("section")!);
    expect(lines[0]).toBe("2 activities have validation errors");
    expect(lines.at(-1)).toBe("This scenario's schedule cannot be calculated. It cannot be simulated until these are fixed.");
  });

  it("a CYCLE failing the schedule keeps W6's plain line, even with a stopping row", () => {
    const { container } = render(<PrintValidationBox scenario={scenarioOf("Cyclic", [OUT_OF_ORDER_TRIANGULAR])} scheduleError={CYCLE_ERROR} />);
    expect(boxLines(container.querySelector("section")!).at(-1)).toBe("This scenario cannot be simulated until this is fixed.");
  });

  it("prints nothing for a valid saved plan — a cell the grid refused to store never reaches it", () => {
    const { container } = render(<PrintValidationBox scenario={scenarioOf("Baseline", [VALID, VALID])} scheduleError={null} />);
    expect(container.innerHTML).toBe("");
  });

  it("is plain text — no <button>, which print hides — kept whole, and light", () => {
    const { container } = render(<PrintValidationBox scenario={scenarioOf("Fast-track", [OUT_OF_ORDER_NORMAL])} scheduleError={null} />);
    const box = container.querySelector("section")!;
    expect(box.textContent).toContain("validation errors"); // non-vacuity
    expect(box.querySelectorAll("button")).toHaveLength(0);
    expect(box.className.split(/\s+/)).toContain("print-section-keep");
    expect(box.outerHTML).not.toContain("dark:");
  });

  it("uses the screen summary's own heading and line, word for word (no second wording)", () => {
    const scenario = scenarioOf("Fast-track", [VALID, OUT_OF_ORDER_NORMAL]);
    const flags = savedScenarioFlags(scenario.activities, scenario.settings.probabilityTarget);
    const numbers = new Map(scenario.activities.map((a, i) => [a.id, i + 1]));
    const rows = flags.rows.map((r) => ({ id: r.id, name: r.name, messages: [...r.messages] }));
    render(<ValidationSummary rows={rows} onRevealGrid={() => {}} activityNumberMap={numbers} />);
    const screenHeading = screen.getByText(/validation errors$/).textContent;
    const screenLine = screen.getByRole("listitem").textContent;
    cleanup();
    const { container } = render(<PrintValidationBox scenario={scenario} scheduleError={null} />);
    const [heading, line] = boxLines(container.querySelector("section")!);
    expect(heading).toBe(screenHeading);
    expect(line).toBe(screenLine);
  });
});

describe("PrintableReport — the box sits between the report's header and Project Summary", () => {
  it("in that order, for a flagged saved plan", () => {
    const scenario = scenarioOf("Fast-track", [VALID, OUT_OF_ORDER_NORMAL]);
    const project = { ...createProject("Harbour works", START), scenarios: [scenario] };
    const { container } = render(
      <PrintableReport project={project} scenario={scenario} schedule={null} scheduledActivities={[]} buffer={null} scheduleError={null} />
    );
    const report = container.querySelector(".print-report")!;
    const order = Array.from(report.children).map((el) => el.querySelector("h1, h2, p")?.textContent ?? "");
    const header = order.findIndex((t) => t.startsWith("SPERT"));
    const box = order.findIndex((t) => t === "1 activity has validation errors");
    const summary = order.findIndex((t) => t === "Project Summary");
    expect([header, box, summary].every((i) => i >= 0)).toBe(true);
    expect(header).toBeLessThan(box);
    expect(box).toBe(summary - 1);
    expect(within(report as HTMLElement).queryAllByText("1 activity has validation errors")).toHaveLength(1);
  });
});
