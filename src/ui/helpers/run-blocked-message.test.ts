// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import { runBlockedMessage } from "./run-blocked-message";
import type { ActivityProblem } from "@ui/hooks/use-estimate-validity";

const problem = (name: string, ...messages: string[]): ActivityProblem => ({ id: name, name, messages });

describe("runBlockedMessage — the toast a refused Run link shows", () => {
  it("names one activity and every reason it has", () => {
    expect(runBlockedMessage([problem("Design", "Min must be <= Most Likely", "Max: Enter a number.")])).toBe(
      "Simulation not run. Fix this activity first: Design (Min must be <= Most Likely; Max: Enter a number.)."
    );
  });

  it("names up to three, then counts the rest — a toast is not a list", () => {
    const five = ["A", "B", "C", "D", "E"].map((n) => problem(n, "x"));
    expect(runBlockedMessage(five)).toBe("Simulation not run. Fix these 5 activities first: A (x), B (x), C (x) and 2 more.");
    expect(runBlockedMessage(five.slice(0, 3))).toBe("Simulation not run. Fix these 3 activities first: A (x), B (x), C (x).");
  });
});
