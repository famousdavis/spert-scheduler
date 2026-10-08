// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import { describeProblem, runBlockedMessage } from "./run-blocked-message";
import type { ActivityProblem } from "@ui/hooks/use-estimate-validity";

const problem = (name: string, ...messages: string[]): ActivityProblem => ({ id: name, name, messages });

describe("runBlockedMessage — the toast a refused Run link shows", () => {
  it("names one activity and every reason it has", () => {
    expect(runBlockedMessage([problem("Design", "Min is above Most Likely", "Max: Enter a number.")])).toBe(
      "Simulation not run. Fix this activity first: Design (Min is above Most Likely; Max: Enter a number.)."
    );
  });

  it("names up to three, then counts the rest — a toast is not a list", () => {
    const five = ["A", "B", "C", "D", "E"].map((n) => problem(n, "x"));
    expect(runBlockedMessage(five)).toBe("Simulation not run. Fix these 5 activities first: A (x), B (x), C (x) and 2 more.");
    expect(runBlockedMessage(five.slice(0, 3))).toBe("Simulation not run. Fix these 3 activities first: A (x), B (x), C (x).");
  });
});

/**
 * WI-105 — every Run refusal names an activity as the validation summary does: `#N <name>` when the
 * project numbers its activities, and EXACTLY today's words when it does not.
 */
describe("the activity's #N in a Run refusal (WI-105)", () => {
  it("describeProblem: '#4 Design (…)' with a number, the name alone without one", () => {
    const design = problem("Design", "Min is above Most Likely");
    expect(describeProblem(design, new Map([["Design", 4]]))).toBe("#4 Design (Min is above Most Likely)");
    expect(describeProblem(design)).toBe("Design (Min is above Most Likely)");
  });

  it("runBlockedMessage: each named activity with its number, then the count of the rest", () => {
    const five = ["A", "B", "C", "D", "E"].map((n) => problem(n, "x"));
    const numbers = new Map([
      ["A", 2],
      ["B", 5],
      ["C", 9],
      ["D", 11],
      ["E", 12],
    ]);
    expect(runBlockedMessage(five, numbers)).toBe(
      "Simulation not run. Fix these 5 activities first: #2 A (x), #5 B (x), #9 C (x) and 2 more."
    );
    expect(runBlockedMessage(five.slice(1, 2), numbers)).toBe("Simulation not run. Fix this activity first: #5 B (x).");
  });

  it("an activity the numbers do not hold is named alone, beside one they do", () => {
    const two = [problem("Design", "x"), problem("Build", "y")];
    expect(runBlockedMessage(two, new Map([["Build", 3]]))).toBe(
      "Simulation not run. Fix these 2 activities first: Design (x), #3 Build (y)."
    );
  });

  it("no numbers — null, undefined, or an empty map — gives today's toast, byte for byte", () => {
    const design = [problem("Design", "Min is above Most Likely", "Max: Enter a number.")];
    const today = "Simulation not run. Fix this activity first: Design (Min is above Most Likely; Max: Enter a number.).";
    expect(runBlockedMessage(design, null)).toBe(today);
    expect(runBlockedMessage(design, undefined)).toBe(today);
    expect(runBlockedMessage(design, new Map())).toBe(today);
  });
});
