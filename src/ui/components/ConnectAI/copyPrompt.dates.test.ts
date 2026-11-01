// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import { buildCopyPrompt } from "./copyPrompt";

/**
 * WI-150 release B: the prompt tells the AI what Read Mode's four dates and two flags mean. The
 * Planned pair is "the plan as it stood when the activity started (kept by the app, or imported
 * with it)" — an imported started row carries its source tool's plan (Review 34, I-W4).
 */
describe("the prompt's progress dates", () => {
  const prompt = buildCopyPrompt("ABC-123");
  it("names the four dates and the two flags, as Read Mode sends them", () => {
    for (const key of ["actualStartDate", "actualFinishDate", "plannedStartDate", "plannedFinishDate", "recordedStart", "recordedFinish"]) {
      expect(prompt).toContain(key);
    }
  });
  it("says the Planned pair may be the app's or the imported plan", () => {
    expect(prompt.replace(/\s+/g, " ")).toContain(
      "plannedStartDate / plannedFinishDate are the plan as it stood when the activity started (kept by the app, or imported with it).",
    );
  });
  it("says the AI cannot set them", () => {
    expect(prompt.replace(/\s+/g, " ")).toContain("You cannot set any of these dates: I record them in the app.");
  });
});
