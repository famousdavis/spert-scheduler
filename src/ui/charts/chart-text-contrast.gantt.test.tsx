// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

import { GanttChart } from "./GanttChart";
import { PrintGanttChart } from "./PrintGanttChart";
import { computeActivityRowGeometry, markerTextFill } from "./gantt-utils";
import {
  GANTT_COLOR_PRESETS, GANTT_STANDARD_COLORS, MILESTONE_COLORS, TARGET_COLORS, resolveGanttAppearance,
} from "./gantt-constants";
import { DEFAULT_GANTT_APPEARANCE } from "@domain/models/types";
import type {
  Activity, GanttAppearanceSettings, Milestone, MilestoneBufferInfo, ScheduledActivity,
} from "@domain/models/types";

/**
 * The Gantt's text is readable on its own ground (WI-102, v0.79.3): each bar's label is black or white, whichever
 * contrasts more with that bar's fill, and the milestone names, dates and "Target" are a readable shade of their
 * marker's colour where the chart is white (light mode, every copy, print), drawn as they are on the dark chart.
 *
 * ⚠️ Contrast is computed HERE, from the WCAG 2.x definition — never by calling the code under test. The expected
 * colours and ratios are the measurements in the WI-102 prototype's CONTRAST.txt (the running app, headless Chrome,
 * pixel-checked), written out as literals; the grounds are the measured ones: the chart's white #ffffff and the dark
 * chart's #1f2937.
 */

/** WCAG 2.x relative luminance of #rrggbb. */
function luminance(hex: string): number {
  const channel = (at: number) => {
    const s = parseInt(hex.slice(at, at + 2), 16) / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** WCAG 2.x contrast ratio between two #rrggbb colours. */
function contrast(a: string, b: string): number {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const WHITE = "#ffffff";
const BLACK = "#000000";
const DARK_GROUND = "#1f2937";
const AA = 4.5;

/** Whichever of white and black contrasts more with `fill` — ties to white. Stated here, not imported. */
function betterOfWhiteAndBlack(fill: string): string {
  return contrast(BLACK, fill) > contrast(WHITE, fill) ? BLACK : WHITE;
}

const STATUSES = ["planned", "inProgress", "complete"] as const;
type Status = (typeof STATUSES)[number];

/**
 * CONTRAST.txt §2, column "A: label per bar" — every preset × theme × status, measured on screen.
 * K = a black label, W = a white one; the ratio is the label on its bar.
 */
const MEASURED = `
classic light planned #3b82f6 K 5.71 | classic light inProgress #f97316 K 7.49 | classic light complete #9ca3af K 8.27
professional light planned #1e40af W 8.72 | professional light inProgress #b45309 W 5.02 | professional light complete #6b7280 W 4.83
colorful light planned #7c3aed W 5.70 | colorful light inProgress #0891b2 K 5.70 | colorful light complete #9ca3af K 8.27
grayscale light planned #475569 W 7.58 | grayscale light inProgress #64748b W 4.76 | grayscale light complete #94a3b8 K 8.19
contrast light planned #1d4ed8 W 6.70 | contrast light inProgress #ea580c K 5.90 | contrast light complete #6b7280 W 4.83
forest light planned #15803d W 5.02 | forest light inProgress #a16207 W 4.92 | forest light complete #9ca3af K 8.27
ocean light planned #0891b2 K 5.70 | ocean light inProgress #0d9488 K 5.61 | ocean light complete #94a3b8 K 8.19
sunset light planned #d97706 K 6.59 | sunset light inProgress #dc2626 W 4.83 | sunset light complete #9ca3af K 8.27
lavender light planned #7e22ce W 6.98 | lavender light inProgress #c026d3 W 4.71 | lavender light complete #a1a1aa K 8.19
earth light planned #92400e W 7.09 | earth light inProgress #b45309 W 5.02 | earth light complete #a8a29e K 8.33
classic dark planned #60a5fa K 8.26 | classic dark inProgress #fb923c K 9.28 | classic dark complete #6b7280 W 4.83
professional dark planned #93c5fd K 11.65 | professional dark inProgress #fbbf24 K 12.58 | professional dark complete #9ca3af K 8.27
colorful dark planned #a78bfa K 7.72 | colorful dark inProgress #22d3ee K 11.62 | colorful dark complete #6b7280 W 4.83
grayscale dark planned #94a3b8 K 8.19 | grayscale dark inProgress #cbd5e1 K 14.14 | grayscale dark complete #64748b W 4.76
contrast dark planned #60a5fa K 8.26 | contrast dark inProgress #fb923c K 9.28 | contrast dark complete #9ca3af K 8.27
forest dark planned #4ade80 K 12.05 | forest dark inProgress #facc15 K 13.71 | forest dark complete #6b7280 W 4.83
ocean dark planned #22d3ee K 11.62 | ocean dark inProgress #2dd4bf K 11.28 | ocean dark complete #64748b W 4.76
sunset dark planned #fbbf24 K 12.58 | sunset dark inProgress #f87171 K 7.59 | sunset dark complete #6b7280 W 4.83
lavender dark planned #c084fc K 7.95 | lavender dark inProgress #e879f9 K 8.53 | lavender dark complete #71717a W 4.83
earth dark planned #fbbf24 K 12.58 | earth dark inProgress #fb923c K 9.28 | earth dark complete #78716c W 4.80
`
  .trim()
  .split("\n")
  .flatMap((line) => line.split("|"))
  .map((cell) => cell.trim())
  .map((row) => {
    const [preset, theme, status, fill, letter, ratio] = row.split(" ") as [string, string, Status, string, string, string];
    return { preset, theme: theme as "light" | "dark", status, fill, label: letter === "K" ? BLACK : WHITE, ratio };
  });

const STATUS_FIELD = { planned: "barPlanned", inProgress: "barInProgress", complete: "barComplete" } as const;

/** The label colour the app chooses for a bar of `status` under `settings`, through the row geometry the chart draws. */
function chosenLabel(settings: GanttAppearanceSettings, isDark: boolean, status: Status) {
  const ra = resolveGanttAppearance(settings, isDark);
  const geo = computeActivityRowGeometry({
    idx: 0, startDate: "2026-04-06", endDate: "2026-04-10", status,
    topMargin: 32, rowHeight: 32, barYOffset: 5, leftMargin: 260,
    minTimestamp: Date.parse("2026-04-06"), dateRange: 18 * 86_400_000, chartAreaWidth: 600,
    barPlanned: ra.barPlanned, barComplete: ra.barComplete, barInProgress: ra.barInProgress,
    viewMode: "deterministic", hatchedDays: undefined, extEndDate: undefined,
  });
  return { fill: geo.barColor, label: geo.labelColor };
}

const preset = (colorPreset: string): GanttAppearanceSettings => ({ ...DEFAULT_GANTT_APPEARANCE, colorPreset });
const custom = (hex: string): GanttAppearanceSettings => ({
  ...DEFAULT_GANTT_APPEARANCE, customPlannedColor: hex, customInProgressColor: hex, customCompletedColor: hex,
});

describe("bar labels in every colour preset (WI-102)", () => {
  it("PREMISE: the table holds every preset × theme × status, with the preset's own fills", () => {
    expect(MEASURED).toHaveLength(Object.keys(GANTT_COLOR_PRESETS).length * 2 * 3);
    for (const row of MEASURED) {
      const fills = GANTT_COLOR_PRESETS[row.preset]![row.theme];
      expect(fills[STATUS_FIELD[row.status]], `${row.preset} ${row.theme} ${row.status}`).toBe(row.fill);
    }
  });

  it.each(MEASURED)("G1 $preset $theme $status: the label reads at least 4.5:1 on $fill, as measured", (row) => {
    const { fill, label } = chosenLabel(preset(row.preset), row.theme === "dark", row.status);
    expect(fill).toBe(row.fill);
    expect(label).toBe(row.label);
    expect(label).toBe(betterOfWhiteAndBlack(fill));
    expect(contrast(label, fill).toFixed(2)).toBe(row.ratio);
    expect(contrast(label, fill)).toBeGreaterThanOrEqual(AA);
  });
});

/** The picker's 20 swatches, written out — and a pale and two mid custom colours either side of the crossover. */
const SWATCHES = [
  "#dc2626", "#ea580c", "#d97706", "#ca8a04", "#65a30d",
  "#16a34a", "#0d9488", "#0891b2", "#0284c7", "#2563eb",
  "#4f46e5", "#7c3aed", "#9333ea", "#c026d3", "#db2777",
  "#475569", "#1e293b", "#78716c", "#57534e", "#0f172a",
];
/** #fde68a measured black 16.86; #767676 is black's by 4.62 to 4.54 and #757575 white's by 4.61 to 4.56 (computed here). */
const CUSTOMS = ["#fde68a", "#767676", "#757575"];

describe("bar labels on the colours a user chooses (WI-102)", () => {
  it("PREMISE: the swatch list is the picker's own", () => {
    expect([...GANTT_STANDARD_COLORS]).toEqual(SWATCHES);
  });

  it.each([...SWATCHES, ...CUSTOMS])("G2 custom %s: every status, both themes, reads at least 4.5:1", (hex) => {
    for (const isDark of [false, true]) {
      for (const status of STATUSES) {
        const { fill, label } = chosenLabel(custom(hex), isDark, status);
        expect(fill).toBe(hex);
        expect(label, `${hex} ${status} dark=${isDark}`).toBe(betterOfWhiteAndBlack(hex));
        expect(contrast(label, fill)).toBeGreaterThanOrEqual(AA);
      }
    }
  });

  it("G2 the measured customs: the worst swatch #0284c7 takes black at 5.13, pale #fde68a black at 16.86", () => {
    expect(chosenLabel(custom("#0284c7"), false, "planned").label).toBe(BLACK);
    expect(contrast(BLACK, "#0284c7").toFixed(2)).toBe("5.13");
    // A softer near-black would not do: #111827 reads 4.33:1 there.
    expect(contrast("#111827", "#0284c7")).toBeLessThan(AA);
    expect(chosenLabel(custom("#fde68a"), true, "planned").label).toBe(BLACK);
    expect(contrast(BLACK, "#fde68a").toFixed(2)).toBe("16.86");
  });

  it("G2 the two mid customs fall either side of the crossover", () => {
    expect(chosenLabel(custom("#767676"), false, "planned").label).toBe(BLACK);
    expect(chosenLabel(custom("#757575"), false, "planned").label).toBe(WHITE);
  });
});

// -- The charts as drawn ----------------------------------------------------------

const ACTIVITIES: Activity[] = (
  [["a1", "Planned task", "planned"], ["a2", "Started task", "inProgress"], ["a3", "Finished task", "complete"]] as const
).map(([id, name, status]) => ({
  id, name, min: 3, mostLikely: 5, max: 9,
  confidenceLevel: "mediumConfidence", distributionType: "triangular", status,
}));
/** Durations 3, 5 and 7, so a label's text ("3d", "5d", "7d") names its row's status. */
const SCHEDULED: ScheduledActivity[] = [
  { activityId: "a1", name: "Planned task", duration: 3, startDate: "2026-04-06", endDate: "2026-04-08", isActual: false },
  { activityId: "a2", name: "Started task", duration: 5, startDate: "2026-04-09", endDate: "2026-04-15", isActual: false },
  { activityId: "a3", name: "Finished task", duration: 7, startDate: "2026-04-16", endDate: "2026-04-24", isActual: false },
];
const LABEL_OF: Record<Status, string> = { planned: "3d", inProgress: "5d", complete: "7d" };

const HEALTHS = ["green", "amber", "red", "none"] as const;
const MILESTONES: Milestone[] = HEALTHS.map((h, i) => ({
  id: `m-${h}`, name: `Gate ${h}`, targetDate: ["2026-04-07", "2026-04-13", "2026-04-17", "2026-04-23"][i]!,
}));
const BUFFERS = new Map<string, MilestoneBufferInfo>(
  MILESTONES.map((m, i): [string, MilestoneBufferInfo] => {
    const base = {
      milestone: m, deterministicEndDate: m.targetDate, deterministicDuration: 3,
      bufferedEndDate: null, bufferDays: 4, slackDays: 1,
    };
    const h = HEALTHS[i]!;
    return [m.id, h === "none" ? { ...base, health: "none", noHealthReason: "no-activities" } : { ...base, health: h }];
  }),
);

const SHARED = {
  activities: ACTIVITIES,
  scheduledActivities: SCHEDULED,
  projectStartDate: "2026-04-06",
  projectEndDate: "2026-04-24",
  buffer: null,
  dependencies: [],
  dependencyMode: false,
  activityTarget: 0.5,
  projectTarget: 0.95,
  milestones: MILESTONES,
  milestoneBuffers: BUFFERS,
  targetFinishDate: "2026-04-21",
  showTargetOnGantt: true,
};

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove("dark");
});

function renderScreen(settings: GanttAppearanceSettings, opts: { dark?: boolean; forceLight?: boolean; rag?: string } = {}) {
  if (opts.dark) document.documentElement.classList.add("dark");
  const { container } = render(
    <GanttChart
      {...SHARED}
      targetRAGColor={opts.rag}
      hasTargetDate={true}
      resolvedAppearance={resolveGanttAppearance(settings, !!opts.dark && !opts.forceLight)}
      appearancePanelOpen={false}
      onToggleAppearancePanel={() => {}}
      forceLight={opts.forceLight}
    />,
  );
  return container.querySelector('svg[data-gantt-chart="interactive"]') as SVGSVGElement;
}

function renderPrint(settings: GanttAppearanceSettings, rag?: string) {
  const { container } = render(
    <PrintGanttChart
      {...SHARED}
      targetRAGColor={rag}
      ganttAppearance={settings}
      bufferedEndDate={null}
      formatDate={(iso: string) => iso}
      formatDateShort={(iso: string) => iso}
    />,
  );
  return container;
}

/** The fill of the one text in `svg` reading `content` — exactly one, or nothing below means anything. */
function fillOfText(svg: Element, content: string): string {
  const texts = Array.from(svg.querySelectorAll("text")).filter((t) => t.textContent === content);
  expect(texts, `text "${content}"`).toHaveLength(1);
  const fill = texts[0]!.getAttribute("fill");
  expect(fill, `fill of "${content}"`).toMatch(/^#[0-9a-f]{6}$/i);
  return fill!.toLowerCase();
}

/** Each status's bar label fill, keyed by status. */
function barLabels(svg: Element): Record<Status, string> {
  return Object.fromEntries(STATUSES.map((s) => [s, fillOfText(svg, LABEL_OF[s])])) as Record<Status, string>;
}

const expectedFor = (presetKey: string, theme: "light" | "dark") =>
  Object.fromEntries(
    STATUSES.map((s) => [s, MEASURED.find((r) => r.preset === presetKey && r.theme === theme && r.status === s)!.label]),
  ) as Record<Status, string>;

const PRESET_KEYS = Object.keys(GANTT_COLOR_PRESETS);

describe("bar labels as the charts draw them (WI-102)", () => {
  it.each(PRESET_KEYS)("G3 the Gantt, light, preset %s: each label is the measured colour", (key) => {
    expect(barLabels(renderScreen(preset(key)))).toEqual(expectedFor(key, "light"));
  });

  it.each(PRESET_KEYS)("G3 the Gantt, dark, preset %s: each label is the measured colour", (key) => {
    expect(barLabels(renderScreen(preset(key), { dark: true }))).toEqual(expectedFor(key, "dark"));
  });

  it("G3 the light render a copy takes in dark mode: the light labels", () => {
    expect(barLabels(renderScreen(preset("classic"), { dark: true, forceLight: true }))).toEqual(expectedFor("classic", "light"));
  });

  it.each(PRESET_KEYS)("G4 PARITY preset %s: the printed Gantt's bar labels equal the screen's, fill for fill", (key) => {
    const screen = barLabels(renderScreen(preset(key)));
    cleanup();
    const printed = barLabels(renderPrint(preset(key)).querySelector("svg")!);
    expect(printed).toEqual(screen);
    expect(printed).toEqual(expectedFor(key, "light"));
  });

  it.each(["#0284c7", "#fde68a", "#757575"])("G4 PARITY custom %s: print and screen choose the same label", (hex) => {
    const screen = barLabels(renderScreen(custom(hex)));
    cleanup();
    const printed = barLabels(renderPrint(custom(hex)).querySelector("svg")!);
    expect(printed).toEqual(screen);
    for (const s of STATUSES) expect(contrast(printed[s], hex)).toBeGreaterThanOrEqual(AA);
  });
});

// -- Milestone and "Target" labels -------------------------------------------------

/** CONTRAST.txt §4–5: the drawn colour of a milestone's name and date, and of "Target", by health and theme. */
const MARKER_TEXT = {
  light: {
    milestone: { green: "#12883e", amber: "#b36205", red: "#dc2626", none: "#9333ea" },
    target: { green: "#12883e", amber: "#b36205", red: "#dc2626", gray: "#727780" },
  },
  dark: {
    milestone: { green: "#4ade80", amber: "#fbbf24", red: "#f87171", none: "#c084fc" },
    target: { green: "#4ade80", amber: "#fbbf24", red: "#f87171", gray: "#6b7280" },
  },
} as const;

/**
 * ⚠️ RECORDED LIMIT, NOT FIXED BY WI-102: the dark chart's grey "Target" (a date set, no result), #6b7280 on #1f2937,
 * reads 3.04:1. It is drawn as it was; every other marker label reads 4.5:1 on its ground.
 */
const DARK_GREY_TARGET_LIMIT = { color: "#6b7280", ratio: "3.04" };

describe("milestone and Target label colours (WI-102)", () => {
  it("G5 on white, every marker colour's label reads at least 4.5:1, as measured", () => {
    const mc = MILESTONE_COLORS.light;
    const tc = TARGET_COLORS.light;
    const want = MARKER_TEXT.light;
    for (const [h, color] of [["green", mc.green], ["amber", mc.amber], ["red", mc.red], ["none", mc.line]] as const) {
      expect(markerTextFill(color, false), `milestone ${h}`).toBe(want.milestone[h]);
      expect(contrast(want.milestone[h], WHITE), `milestone ${h}`).toBeGreaterThanOrEqual(AA);
    }
    for (const h of ["green", "amber", "red", "gray"] as const) {
      expect(markerTextFill(tc[h], false), `target ${h}`).toBe(want.target[h]);
      expect(contrast(want.target[h], WHITE), `target ${h}`).toBeGreaterThanOrEqual(AA);
    }
    // PREMISE: three of the light marker colours do NOT read on white as they are — the reason for the change.
    for (const c of [mc.green, mc.amber, tc.gray]) expect(contrast(c, WHITE), c).toBeLessThan(AA);
  });

  it("G5 on the dark chart, each label is its marker's own colour and reads at least 4.5:1 (but the recorded grey)", () => {
    const mc = MILESTONE_COLORS.dark;
    const tc = TARGET_COLORS.dark;
    const want = MARKER_TEXT.dark;
    for (const [h, color] of [["green", mc.green], ["amber", mc.amber], ["red", mc.red], ["none", mc.line]] as const) {
      expect(markerTextFill(color, true), `milestone ${h}`).toBe(want.milestone[h]);
      expect(contrast(want.milestone[h], DARK_GROUND), `milestone ${h}`).toBeGreaterThanOrEqual(AA);
    }
    for (const h of ["green", "amber", "red"] as const) {
      expect(markerTextFill(tc[h], true), `target ${h}`).toBe(want.target[h]);
      expect(contrast(want.target[h], DARK_GROUND), `target ${h}`).toBeGreaterThanOrEqual(AA);
    }
    expect(markerTextFill(tc.gray, true)).toBe(DARK_GREY_TARGET_LIMIT.color);
    expect(contrast(DARK_GREY_TARGET_LIMIT.color, DARK_GROUND).toFixed(2)).toBe(DARK_GREY_TARGET_LIMIT.ratio);
  });
});

/** Each milestone's name and date fills, by health. */
function milestoneFills(svg: Element): Record<string, string[]> {
  return Object.fromEntries(
    MILESTONES.map((m, i) => {
      const name = Array.from(svg.querySelectorAll("text")).find((t) => t.textContent === m.name);
      if (!name) return [HEALTHS[i]!, ["NOT DRAWN"]];
      const texts = Array.from(name.parentElement!.querySelectorAll("text"));
      return [HEALTHS[i]!, texts.map((t) => (t.getAttribute("fill") ?? "none").toLowerCase())];
    }),
  );
}

function expectMilestones(svg: Element, theme: "light" | "dark") {
  const ground = theme === "dark" ? DARK_GROUND : WHITE;
  const want = MARKER_TEXT[theme].milestone;
  const fills = milestoneFills(svg);
  expect(fills).toEqual(Object.fromEntries(HEALTHS.map((h) => [h, [want[h], want[h]]])));
  for (const h of HEALTHS) expect(contrast(want[h], ground), h).toBeGreaterThanOrEqual(AA);
}

const RAGS = ["green", "amber", "red", "gray"] as const;

describe("milestone and Target labels as the charts draw them (WI-102)", () => {
  it("G6 the Gantt, light: each milestone's name and date read at least 4.5:1 on white", () => {
    expectMilestones(renderScreen(DEFAULT_GANTT_APPEARANCE), "light");
  });

  it("G6 the Gantt, dark: each milestone's name and date read at least 4.5:1 on the dark chart", () => {
    expectMilestones(renderScreen(DEFAULT_GANTT_APPEARANCE, { dark: true }), "dark");
  });

  it("G6 the light render a copy takes in dark mode: the white chart's milestone colours", () => {
    expectMilestones(renderScreen(DEFAULT_GANTT_APPEARANCE, { dark: true, forceLight: true }), "light");
  });

  it("G7 the printed Gantt: each milestone's name and date read at least 4.5:1 on white", () => {
    expectMilestones(renderPrint(DEFAULT_GANTT_APPEARANCE).querySelector("svg")!, "light");
  });

  it.each(RAGS)("G8 the Gantt, light, %s target: \"Target\" reads at least 4.5:1 on white", (rag) => {
    const fill = fillOfText(renderScreen(DEFAULT_GANTT_APPEARANCE, { rag }), "Target");
    expect(fill).toBe(MARKER_TEXT.light.target[rag]);
    expect(contrast(fill, WHITE)).toBeGreaterThanOrEqual(AA);
  });

  it.each(RAGS)("G8 the Gantt, dark, %s target: \"Target\" is drawn in its own colour", (rag) => {
    const fill = fillOfText(renderScreen(DEFAULT_GANTT_APPEARANCE, { dark: true, rag }), "Target");
    expect(fill).toBe(MARKER_TEXT.dark.target[rag]);
    if (rag !== "gray") expect(contrast(fill, DARK_GROUND)).toBeGreaterThanOrEqual(AA);
  });

  it.each(RAGS)("G8 the light render a copy takes in dark mode, %s target: the white chart's colour", (rag) => {
    expect(fillOfText(renderScreen(DEFAULT_GANTT_APPEARANCE, { dark: true, forceLight: true, rag }), "Target"))
      .toBe(MARKER_TEXT.light.target[rag]);
  });

  it.each(RAGS)("G9 the printed Gantt, %s target: \"Target\" reads at least 4.5:1 on white", (rag) => {
    const fill = fillOfText(renderPrint(DEFAULT_GANTT_APPEARANCE, rag).querySelector("svg")!, "Target");
    expect(fill).toBe(MARKER_TEXT.light.target[rag]);
    expect(contrast(fill, WHITE)).toBeGreaterThanOrEqual(AA);
  });
});

// -- The printed legend's "Date prepared" ------------------------------------------

/**
 * Tailwind 4's greys are OKLCH, so a class is mapped to the colour the browser MEASURED for it (CONTRAST.txt §4:
 * text-gray-500 #6a7282, 4.84:1 on white; text-gray-400 #99a1af, 2.60:1). A class not in this table fails.
 */
const MEASURED_GREY: Record<string, string> = { "text-gray-500": "#6a7282", "text-gray-400": "#99a1af" };

describe("the printed Gantt's \"Date prepared\" (WI-102)", () => {
  it("G10 reads at least 4.5:1 on white", () => {
    const span = Array.from(renderPrint(DEFAULT_GANTT_APPEARANCE).querySelectorAll("span")).find((s) =>
      (s.textContent ?? "").startsWith("Date prepared:"),
    );
    expect(span).toBeDefined();
    const greys = Array.from(span!.classList).filter((c) => /^text-gray-\d+$/.test(c));
    expect(greys).toHaveLength(1);
    const measured = MEASURED_GREY[greys[0]!];
    expect(measured, greys[0]).toBeDefined();
    expect(contrast(measured!, WHITE)).toBeGreaterThanOrEqual(AA);
    expect(contrast(measured!, WHITE).toFixed(2)).toBe("4.84");
  });
});
