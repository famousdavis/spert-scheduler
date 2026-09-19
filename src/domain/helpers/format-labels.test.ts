// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import {
  distributionLabel,
  distributionShortLabel,
  statusLabel,
  dependencyLabel,
  pluralize,
  computeMilestoneHealth,
  milestoneHealthDotClass,
  milestoneHealthHint,
  milestoneHealthLabel,
  milestoneHealthTextClass,
} from "./format-labels";
import type { Milestone, MilestoneBufferInfo, MilestoneNoHealthReason } from "@domain/models/types";

describe("distributionLabel", () => {
  it("formats logNormal correctly", () => {
    expect(distributionLabel("logNormal")).toBe("LogNormal");
  });

  it("formats normal correctly", () => {
    expect(distributionLabel("normal")).toBe("T-Normal");
  });

  it("formats triangular correctly", () => {
    expect(distributionLabel("triangular")).toBe("Triangular");
  });

  it("formats uniform correctly", () => {
    expect(distributionLabel("uniform")).toBe("Uniform");
  });
});

describe("distributionShortLabel", () => {
  it("formats logNormal correctly", () => {
    expect(distributionShortLabel("logNormal")).toBe("LogN");
  });

  it("formats normal correctly", () => {
    expect(distributionShortLabel("normal")).toBe("Norm");
  });

  it("formats triangular correctly", () => {
    expect(distributionShortLabel("triangular")).toBe("Tri");
  });

  it("formats uniform correctly", () => {
    expect(distributionShortLabel("uniform")).toBe("Uni");
  });
});

describe("statusLabel", () => {
  it("formats planned correctly", () => {
    expect(statusLabel("planned")).toBe("Planned");
  });

  it("formats inProgress correctly", () => {
    expect(statusLabel("inProgress")).toBe("In Progress");
  });

  it("formats complete correctly", () => {
    expect(statusLabel("complete")).toBe("Complete");
  });
});

describe("dependencyLabel", () => {
  it("formats FS correctly", () => {
    expect(dependencyLabel("FS")).toBe("Finish-to-Start");
  });

  it("formats SS correctly", () => {
    expect(dependencyLabel("SS")).toBe("Start-to-Start");
  });

  it("formats FF correctly", () => {
    expect(dependencyLabel("FF")).toBe("Finish-to-Finish");
  });
});

describe("pluralize", () => {
  // WI-16: the noun beside a whole-number count. Falsified against two mutants:
  // inverting the comparison fails all six; dropping Math.abs fails only the −1 case.
  it("uses the singular for exactly one, by magnitude", () => {
    expect(pluralize(1, "day")).toBe("day");
    expect(pluralize(-1, "day")).toBe("day");
  });

  it("uses the plural for zero and for more than one", () => {
    expect(pluralize(0, "day")).toBe("days");
    expect(pluralize(2, "day")).toBe("days");
  });

  it("takes an irregular plural when given one", () => {
    expect(pluralize(1, "entry", "entries")).toBe("entry");
    expect(pluralize(3, "entry", "entries")).toBe("entries");
  });
});

describe("computeMilestoneHealth", () => {
  it("gives NO health without slack — never a colour (v0.70.3; it was green)", () => {
    expect(computeMilestoneHealth(null)).toBe("none");
  });

  it("is green from 5 working days of slack, amber from 0 to 4, and red below 0", () => {
    expect([10, 5, 4, 0, -1].map((slack) => computeMilestoneHealth(slack))).toEqual([
      "green",
      "green",
      "amber",
      "amber",
      "red",
    ]);
  });
});

describe("the no-health state, on every milestone-health helper", () => {
  it("is a grey dash with no word and no health colour", () => {
    expect(milestoneHealthLabel("none")).toBe("—");
    expect(milestoneHealthDotClass("none")).toBe("bg-gray-400 dark:bg-gray-500");
    expect(milestoneHealthTextClass("none")).toBe("text-gray-500");
  });

  const MILESTONE: Milestone = { id: "m1", name: "Gate", targetDate: "2027-01-04" };
  const none = (noHealthReason: MilestoneNoHealthReason): MilestoneBufferInfo => ({
    milestone: MILESTONE,
    deterministicEndDate: MILESTONE.targetDate,
    deterministicDuration: 0,
    bufferedEndDate: null,
    bufferDays: null,
    slackDays: null,
    health: "none",
    noHealthReason,
  });

  // The DRAFT wording — the owner rules it. Each names the step that comes first; only
  // "no-results" may promise that one step shows the health (see use-milestone-buffers.ts).
  it.each([
    ["no-results", "Run the simulation to see this milestone's health"],
    ["no-activities", "Assign activities to this milestone before its health can be shown"],
    ["unlisted-target", "Choose a Project target from the list before this milestone's health can be shown"],
    ["dependencies-off", "Turn on Dependencies before this milestone's health can be shown"],
  ] as const)("hints %s with its own sentence", (reason, hint) => {
    expect(milestoneHealthHint(none(reason))).toBe(hint);
  });

  it("gives a MEASURED milestone no hint", () => {
    const measured: MilestoneBufferInfo = {
      ...none("no-results"),
      bufferDays: 12,
      slackDays: 3,
      health: "amber",
      noHealthReason: undefined,
    };
    expect(milestoneHealthHint(measured)).toBeUndefined();
  });
});
