// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { PrintMilestonesTable } from "./print-sections";
import { createScenario } from "@app/api/project-service";
import { addMilestone } from "@app/api/milestone-service";
import { UNNAMED_LABEL } from "@domain/helpers/display-name";
import type { Scenario } from "@domain/models/types";

/**
 * `(unnamed)` on a milestone display surface, rendered.
 *
 * One of the four sites the v0.66.0 helper covers, chosen because it is the one
 * that renders from plain props. The two Gantt sites are covered by the parity
 * oracle (which pins the milestone label text on BOTH charts — perturbing the
 * fixture name moves 2 of 16) plus a browser pass; the summary-card chips are
 * covered in the browser.
 *
 * ⚠️ The table is gated on `dependencyMode`, so the fixture must enable it or
 * the component returns null and every assertion below would pass vacuously —
 * the "renders at all" case is the guard against that.
 */
function scenarioWithMilestoneNamed(name: string): Scenario {
  const base = createScenario("S", "2026-09-07");
  const withDeps: Scenario = {
    ...base,
    settings: { ...base.settings, dependencyMode: true },
  };
  return addMilestone(withDeps, name, "2026-12-01");
}

function renderTable(name: string) {
  render(
    <PrintMilestonesTable
      scenario={scenarioWithMilestoneNamed(name)}
      milestoneBuffers={null}
      formatDate={(iso: string) => iso}
    />,
  );
}

afterEach(cleanup);

describe("PrintMilestonesTable — an unnamed milestone", () => {
  it("renders at all (non-vacuity: the table is gated on dependencyMode)", () => {
    renderTable("Go-Live");
    expect(screen.getByText("Go-Live")).toBeDefined();
    expect(screen.getByText(/Milestones \(1\)/)).toBeDefined();
  });

  it("shows the placeholder instead of an empty cell", () => {
    renderTable("");
    expect(screen.getByText(UNNAMED_LABEL)).toBeDefined();
  });

  it("shows the placeholder for a whitespace-only name", () => {
    renderTable("   ");
    expect(screen.getByText(UNNAMED_LABEL)).toBeDefined();
  });

  it("control: a real name is rendered verbatim, not replaced", () => {
    renderTable("Go-Live");
    expect(screen.getByText("Go-Live")).toBeDefined();
    expect(screen.queryByText(UNNAMED_LABEL)).toBeNull();
  });
});
