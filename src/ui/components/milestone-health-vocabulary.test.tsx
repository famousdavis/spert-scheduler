// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { MilestonePanel } from "./MilestonePanel";
import { ScenarioSummaryCard } from "./ScenarioSummaryCard";
import { PrintMilestonesTable } from "./print-sections";
import { createScenario } from "@app/api/project-service";
import { computeMilestoneHealth, type MilestoneHealth } from "@domain/helpers/format-labels";
import { DEFAULT_SCENARIO_SETTINGS } from "@domain/models/types";
import type { Milestone, MilestoneBufferInfo, Scenario } from "@domain/models/types";

/**
 * One milestone, one word, on all three surfaces that name its health (v0.70.2). Owner ruling,
 * 2026-09-05: On Track / At Risk / Late, from ONE function, `milestoneHealthLabel`.
 *
 * ⚠️ WHY THIS EXISTS: each surface had its own words, and no test pinned any of them — changing
 * all three moved nothing in the suite. One milestone read "Healthy" on the Milestones panel, a
 * bare "✓" on the summary card and "On Track" in print; and "At Risk" meant AMBER on the panel
 * but RED on the card and in print, the collision the ruling closes.
 *
 * Words are read as the set of EVERY health word ever shipped, found in the surface's text, so a
 * surface that shows the right word beside a stale one fails too — "✗ At Risk" contained a word,
 * just the wrong one. Colours are read from the element that carries each surface's colour.
 */

afterEach(cleanup);

/** Every health word any surface has ever shown, retired ones included. */
const EVERY_WORD = ["On Track", "At Risk", "Late", "Healthy", "Warning", "Over"];

/** The health words present in `text`, whole words only, in EVERY_WORD order. */
function wordsIn(text: string | null | undefined): string[] {
  return EVERY_WORD.filter((w) => new RegExp(`\\b${w}\\b`).test(text ?? ""));
}

interface Case {
  health: MilestoneHealth;
  word: string;
  milestone: Milestone;
  slackDays: number;
}

// Slack drives health through the real rule (green ≥ 5, amber 0–4, red < 0), so the fixture
// cannot describe a state the app would never compute.
const CASES: Case[] = [
  { health: "green", word: "On Track", slackDays: 11, milestone: { id: "m-green", name: "Design Baseline", targetDate: "2027-04-09" } },
  { health: "amber", word: "At Risk", slackDays: 2, milestone: { id: "m-amber", name: "Build Complete", targetDate: "2027-07-26" } },
  { health: "red", word: "Late", slackDays: -3, milestone: { id: "m-red", name: "Go-Live", targetDate: "2028-01-28" } },
];

const MILESTONES = CASES.map((c) => c.milestone);

function buffers(): Map<string, MilestoneBufferInfo> {
  return new Map(
    CASES.map((c) => [
      c.milestone.id,
      {
        milestone: c.milestone,
        deterministicEndDate: c.milestone.targetDate,
        deterministicDuration: 100,
        bufferedEndDate: c.milestone.targetDate,
        bufferDays: 12,
        slackDays: c.slackDays,
        health: computeMilestoneHealth(c.slackDays),
      },
    ]),
  );
}

// -- The source guard: all three surfaces take the word from the one function ----------------

describe("the one label function", () => {
  const SURFACES = [
    "src/ui/components/MilestonePanel.tsx",
    "src/ui/components/ScenarioSummaryCard.tsx",
    "src/ui/components/print-sections.tsx",
  ];

  it.each(SURFACES)("%s imports milestoneHealthLabel from format-labels and calls it", (file) => {
    const source = readFileSync(join(process.cwd(), file), "utf-8");
    const imported = [...source.matchAll(/import\s*\{([^}]*)\}\s*from\s*"@domain\/helpers\/format-labels"/g)]
      .flatMap((m) => m[1]!.split(","))
      .map((name) => name.trim().replace(/^type\s+/, ""));
    expect(imported).toContain("milestoneHealthLabel");
    // A call, not only the import: the import line itself has no parenthesis after the name.
    expect(source).toMatch(/milestoneHealthLabel\(/);
  });
});

// -- The three surfaces, rendered from the same milestones ------------------------------------

describe("the Milestones panel", () => {
  const renderPanel = () =>
    render(
      <MilestonePanel
        projectId="panel-test-project"
        milestones={MILESTONES}
        activities={[]}
        milestoneBuffers={buffers()}
        onAddMilestone={vi.fn()}
        onRemoveMilestone={vi.fn()}
        onUpdateMilestone={vi.fn()}
        onAssignActivity={vi.fn()}
        onSetStartsAt={vi.fn()}
      />,
    );

  // The header row holds the name input, the date input, the badge and an icon-only remove
  // button, so its text IS the badge's text.
  it.each(CASES)("a $health milestone reads $word, in its own colour", ({ milestone, word, health }) => {
    renderPanel();
    const headerRow = screen.getByDisplayValue(milestone.name).parentElement!;
    expect(wordsIn(headerRow.textContent)).toEqual([word]);
    const badge = Array.from(headerRow.querySelectorAll("span")).find((s) => s.textContent === word)!;
    expect(badge.className).toContain(`text-${health}-800`);
  });
});

describe("the scenario summary card", () => {
  const settings = { ...DEFAULT_SCENARIO_SETTINGS, rngSeed: "vocabulary" };
  const renderCard = () =>
    render(
      <ScenarioSummaryCard
        startDate="2026-09-21"
        schedule={null}
        buffer={null}
        settings={settings}
        hasSimulationResults
        onSettingsChange={vi.fn()}
        onStartDateChange={vi.fn()}
        onNewSeed={vi.fn()}
        projectName="Vocabulary"
        scenarioName="Baseline"
        activities={[]}
        bands={[]}
        dependencies={[]}
        milestones={MILESTONES}
        milestoneBuffers={buffers()}
      />,
    );

  // The name's own text node sits in a span whose parent is the milestone's row.
  it.each(CASES)("a $health milestone reads $word, beside a dot in its own colour", ({ milestone, word, health }) => {
    renderCard();
    const row = screen.getByText(milestone.name).parentElement!;
    expect(wordsIn(row.textContent)).toEqual([word]);
    const dot = row.querySelector("span.rounded-full")!;
    expect(dot.className).toContain(`bg-${health}-500`);
  });

  // jsdom resolves no colours, so the contrast itself is a browser measurement: 9.96:1 in dark
  // (v0.70.2). What jsdom CAN see is the class. Nothing above this span sets a dark colour, so
  // without its own it inherits black on the dark card — measured 1.43:1, which had already made
  // the old "✗ At Risk" unreadable there.
  it.each(CASES)("gives a $health milestone's word its own dark-mode colour", ({ milestone, word }) => {
    renderCard();
    const wordSpan = screen.getByText(milestone.name).parentElement!.lastElementChild!;
    expect(wordsIn(wordSpan.textContent)).toEqual([word]); // it IS the word's span
    expect(wordSpan.className).toMatch(/(^|\s)dark:text-/);
  });
});

describe("the printed report", () => {
  const scenario = (): Scenario => {
    const base = createScenario("Baseline", "2026-09-21");
    // The table is gated on dependency mode, so the fixture turns it on. Without it the component
    // renders nothing, and every row below would fail on a missing name.
    return { ...base, milestones: MILESTONES, settings: { ...base.settings, dependencyMode: true } };
  };

  it.each(CASES)("a $health milestone reads $word, in its own colour", ({ milestone, word, health }) => {
    render(
      <PrintMilestonesTable scenario={scenario()} milestoneBuffers={buffers()} formatDate={(iso) => iso} />,
    );
    const healthCell = screen.getByText(milestone.name).closest("tr")!.lastElementChild!;
    expect(wordsIn(healthCell.textContent)).toEqual([word]);
    expect(healthCell.querySelector("span")!.className).toContain(`text-${health}-700`);
  });
});
