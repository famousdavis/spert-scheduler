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

describe("the Connect AI copy prompt — the parallelism question", () => {
  const prompt = buildCopyPrompt("ABC-123");

  it("asks about parallelism, not about a dependency versus a sequence", () => {
    // The old question offered DEPENDENCIES against "run one after another" — the same
    // relationship twice, so it was a choice between a thing and itself. The real axis is
    // whether anything runs at the same time as anything else.
    expect(prompt).not.toContain("run one after another");
    expect(prompt).toContain("Can any activities run AT THE SAME TIME");
  });

  it("says where the two settings are, since no tool can turn either of them on", () => {
    // Dependency mode is a per-scenario toggle on the summary card's Parkinson's Law row
    // (ScenarioSummaryCard.tsx) — not the Dependencies panel, which has no toggle. Read
    // Mode is the Connect AI panel's "Turn on Read" button (ConnectAiPanel.tsx).
    expect(prompt).toContain('on the same row as "Parkinson\'s Law"');
    expect(prompt).toContain('a "Turn on Read" button in the Connect AI panel');
    // The guard the deleted question carried has to survive its deletion.
    expect(prompt).toContain("Do NOT create dependencies unless I have confirmed (b)");
    // Positive control, same test: this is the prompt the panel copies.
    expect(prompt).toContain("ABC-123");
  });
});
