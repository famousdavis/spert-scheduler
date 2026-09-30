// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { PrintActivityTable } from "./print-sections";
import {
  addActivityToScenario,
  createActivity,
  createScenario,
} from "@app/api/project-service";
import type {
  Activity,
  ActivityStatus,
  DistributionType,
  RSMLevel,
  Scenario,
} from "@domain/models/types";

/**
 * What the printed Activities table shows in its Distribution, Confidence and Status columns
 * (WI-47).
 *
 * Until this file nothing pinned what PRINT shows there: a mutation to the shared
 * `distributionLabel` failed the schedule-export test and no print test, and print's own
 * Confidence rule — a level for T-Normal, LogNormal and Beta-PERT, a dash for Triangular and
 * Uniform — could be inverted with the whole suite still green.
 *
 * The expected words are written out here, never computed with `distributionLabel` or
 * `RSM_LABELS`: an expectation built from the code under test agrees with it by construction.
 */

function withActivity(
  scenario: Scenario,
  name: string,
  distributionType: DistributionType,
  confidenceLevel: RSMLevel,
  status: ActivityStatus,
): Scenario {
  const activity: Activity = {
    ...createActivity(name, scenario.settings),
    distributionType,
    confidenceLevel,
    status,
  };
  return addActivityToScenario(scenario, activity);
}

/**
 * One activity per distribution type, each at a different confidence level, the three statuses
 * shared among them. Triangular and Uniform carry levels too — ones that would print if print's
 * dash rule were inverted, so the dash is not true merely because there was nothing to show.
 */
function scenarioOfEveryDistribution(): Scenario {
  let scenario = createScenario("S", "2026-09-07");
  scenario = withActivity(scenario, "Survey", "normal", "highConfidence", "planned");
  scenario = withActivity(scenario, "Design", "logNormal", "lowConfidence", "inProgress");
  scenario = withActivity(scenario, "Build", "betaPert", "guesstimate", "complete");
  scenario = withActivity(scenario, "Test", "triangular", "nearCertainty", "inProgress");
  scenario = withActivity(scenario, "Deploy", "uniform", "mediumConfidence", "planned");
  return scenario;
}

afterEach(cleanup);

describe("PrintActivityTable — the Distribution, Confidence and Status columns", () => {
  it("prints each distribution's name, a level only where confidence applies, and the status", () => {
    const { container } = render(
      <PrintActivityTable
        scenario={scenarioOfEveryDistribution()}
        scheduledActivities={[]}
        formatDate={(iso) => iso}
      />,
    );
    // Non-vacuity: the table rendered at all.
    expect(screen.getByRole("heading", { name: "Activities (5)" })).toBeDefined();

    // The columns are read by position, so first confirm the positions are the right columns.
    // Dur., Start and Finish print a dash too with no schedule; reading by position keeps those
    // dashes from standing in for Confidence's.
    const headers = [...container.querySelectorAll("thead th")].map((th) => th.textContent);
    const NAME = headers.indexOf("Name");
    const DISTRIBUTION = headers.indexOf("Distribution");
    const CONFIDENCE = headers.indexOf("Confidence");
    const STATUS = headers.indexOf("Status");
    expect([NAME, DISTRIBUTION, CONFIDENCE, STATUS]).toEqual([1, 8, 9, 10]);

    const rows = [...container.querySelectorAll("tbody tr")].map((tr) => {
      const cells = within(tr as HTMLElement).getAllByRole("cell").map((td) => td.textContent);
      return [cells[NAME], cells[DISTRIBUTION], cells[CONFIDENCE], cells[STATUS]];
    });

    // The dash for Triangular and Uniform and a real level for the other three sit in one table:
    // each half is the other's control.
    expect(rows).toEqual([
      ["Survey", "T-Normal", "High", "Planned"],
      ["Design", "LogNormal", "Low", "In Progress"],
      ["Build", "Beta-PERT", "Guesstimate", "Complete"],
      ["Test", "Triangular", "—", "In Progress"],
      ["Deploy", "Uniform", "—", "Planned"],
    ]);
  });
});
