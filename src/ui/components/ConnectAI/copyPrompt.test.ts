// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import { buildCopyPrompt } from "./copyPrompt";

describe("the Connect AI copy prompt — choosing a distribution", () => {
  const prompt = buildCopyPrompt("ABC-123");

  it("tells the AI to ask for Uniform itself, because the app never picks it from the numbers", () => {
    // Since v0.68.0 the app's own pick is never Uniform, so a flat estimate with no distinct
    // most-likely value — the sample project's vendor lead times — is reachable for an AI
    // only if the prompt says to name it explicitly.
    expect(prompt).toContain("The app never chooses uniform from the numbers");
    expect(prompt).toContain('distributionType: "uniform" yourself');
    // The pre-v0.68.0 advice sent the AI to the app's pick by default.
    expect(prompt).not.toContain("usually let the app choose");
    // Positive control, same test: this is the prompt the panel copies.
    expect(prompt).toContain("ABC-123");
  });
});
