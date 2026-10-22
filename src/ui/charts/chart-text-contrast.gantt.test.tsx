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
 * The Gantt's text is readable on its own ground (WI-102). Each bar's label is WHITE on every bar — on screen
 * (#ffffff), in copies and in print (#fff) — and every colour preset's bars are dark enough for white to read at least
 * 4.5:1 on them (v0.79.4, the owner's option B; v0.79.3 had drawn the label black or white by contrast, and the owner
 * reversed that). The milestone names, dates and "Target" are a readable shade of their marker's colour where the
 * chart is white (light mode, every copy, print), drawn as they are on the dark chart.
 *
 * ⚠️ Contrast is computed HERE, from the WCAG 2.x definition — never by calling the code under test. The expected
 * colours and ratios are the measurements in the WI-102 prototype's CONTRAST.txt (the running app, headless Chrome,
 * pixel-checked; the bar fills are its §2 column "B: white on darker fill"), written out as literals; the grounds are
 * the measured ones: the chart's white #ffffff and the dark chart's #1f2937.
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
const DARK_GROUND = "#1f2937";
const AA = 4.5;

/** The bar label as each chart writes it — as before v0.79.3, and again since v0.79.4. */
const LABEL_ON_SCREEN = "#ffffff";
const LABEL_IN_PRINT = "#fff";

const STATUSES = ["planned", "inProgress", "complete"] as const;
type Status = (typeof STATUSES)[number];

/**
 * CONTRAST.txt §2, column "B: white on darker fill" — every preset × theme × status, measured on screen: the bar's
 * fill and the white label's ratio on it.
 */
const MEASURED = `
classic light planned #3473da 4.55 | classic light inProgress #be5811 4.57 | classic light complete #727780 4.50
professional light planned #1e40af 8.72 | professional light inProgress #b45309 5.02 | professional light complete #6b7280 4.83
colorful light planned #7c3aed 5.70 | colorful light inProgress #07819e 4.52 | colorful light complete #727780 4.50
grayscale light planned #475569 7.58 | grayscale light inProgress #64748b 4.76 | grayscale light complete #6c7786 4.54
contrast light planned #1d4ed8 6.70 | contrast light inProgress #cd4d0b 4.50 | contrast light complete #6b7280 4.83
forest light planned #15803d 5.02 | forest light inProgress #a16207 4.92 | forest light complete #727780 4.50
ocean light planned #07819e 4.52 | ocean light inProgress #0c857a 4.51 | ocean light complete #6c7786 4.54
sunset light planned #b36205 4.50 | sunset light inProgress #dc2626 4.83 | sunset light complete #727780 4.50
lavender light planned #7e22ce 6.98 | lavender light inProgress #c026d3 4.71 | lavender light complete #76767d 4.51
earth light planned #92400e 7.09 | earth light inProgress #b45309 5.02 | earth light complete #7a7573 4.55
classic dark planned #4678b7 4.53 | classic dark inProgress #ac6429 4.56 | classic dark complete #6b7280 4.83
professional dark planned #5a799c 4.52 | professional dark inProgress #947115 4.53 | professional dark complete #727780 4.50
colorful dark planned #7e69bd 4.52 | colorful dark inProgress #158292 4.53 | colorful dark complete #6b7280 4.83
grayscale dark planned #6c7786 4.54 | grayscale dark inProgress #72777e 4.51 | grayscale dark complete #64748b 4.76
contrast dark planned #4678b7 4.53 | contrast dark inProgress #ac6429 4.56 | contrast dark complete #727780 4.50
forest dark planned #2d864d 4.54 | forest dark inProgress #8d730c 4.58 | forest dark complete #6b7280 4.83
ocean dark planned #158292 4.53 | ocean dark inProgress #1c8376 4.61 | ocean dark complete #64748b 4.76
sunset dark planned #947115 4.53 | sunset dark inProgress #be5656 4.51 | sunset dark complete #6b7280 4.83
lavender dark planned #8f62bc 4.52 | lavender dark inProgress #a757b3 4.51 | lavender dark complete #71717a 4.83
earth dark planned #947115 4.53 | earth dark inProgress #ac6429 4.56 | earth dark complete #78716c 4.80
`
  .trim()
  .split("\n")
  .flatMap((line) => line.split("|"))
  .map((cell) => cell.trim())
  .map((row) => {
    const [preset, theme, status, fill, ratio] = row.split(" ") as [string, string, Status, string, string];
    return { preset, theme: theme as "light" | "dark", status, fill, ratio };
  });

const STATUS_FIELD = { planned: "barPlanned", inProgress: "barInProgress", complete: "barComplete" } as const;

/** The fill the app gives a bar of `status` under `settings`, through the row geometry the chart draws. */
function chosenFill(settings: GanttAppearanceSettings, isDark: boolean, status: Status): string {
  const ra = resolveGanttAppearance(settings, isDark);
  const geo = computeActivityRowGeometry({
    idx: 0, startDate: "2026-04-06", endDate: "2026-04-10", status,
    topMargin: 32, rowHeight: 32, barYOffset: 5, leftMargin: 260,
    minTimestamp: Date.parse("2026-04-06"), dateRange: 18 * 86_400_000, chartAreaWidth: 600,
    barPlanned: ra.barPlanned, barComplete: ra.barComplete, barInProgress: ra.barInProgress,
    viewMode: "deterministic", hatchedDays: undefined, extEndDate: undefined,
  });
  return geo.barColor;
}

const preset = (colorPreset: string): GanttAppearanceSettings => ({ ...DEFAULT_GANTT_APPEARANCE, colorPreset });
const custom = (hex: string): GanttAppearanceSettings => ({
  ...DEFAULT_GANTT_APPEARANCE, customPlannedColor: hex, customInProgressColor: hex, customCompletedColor: hex,
});

describe("white bar labels on every colour preset's bars (WI-102, v0.79.4)", () => {
  it("PREMISE: the table holds every preset × theme × status, with the preset's own fills", () => {
    expect(MEASURED).toHaveLength(Object.keys(GANTT_COLOR_PRESETS).length * 2 * 3);
    for (const row of MEASURED) {
      const fills = GANTT_COLOR_PRESETS[row.preset]![row.theme];
      expect(fills[STATUS_FIELD[row.status]], `${row.preset} ${row.theme} ${row.status}`).toBe(row.fill);
    }
  });

  it.each(MEASURED)("G1 $preset $theme $status: a white label reads at least 4.5:1 on $fill, as measured", (row) => {
    const fill = chosenFill(preset(row.preset), row.theme === "dark", row.status);
    expect(fill).toBe(row.fill);
    expect(contrast(WHITE, fill).toFixed(2)).toBe(row.ratio);
    expect(contrast(WHITE, fill)).toBeGreaterThanOrEqual(AA);
  });
});

/** The picker's 20 swatches, written out — and a pale and two mid custom colours. */
const SWATCHES = [
  "#dc2626", "#ea580c", "#d97706", "#ca8a04", "#65a30d",
  "#16a34a", "#0d9488", "#0891b2", "#0284c7", "#2563eb",
  "#4f46e5", "#7c3aed", "#9333ea", "#c026d3", "#db2777",
  "#475569", "#1e293b", "#78716c", "#57534e", "#0f172a",
];
const CUSTOMS = ["#fde68a", "#767676", "#757575"];

/**
 * ⚠️ RECORDED LIMIT, THE OWNER'S RULING (2026-10-22): a colour the user chooses gets a white label whatever it is, so
 * white can read below 4.5:1 there — 4.10:1 on the picker's own #0284c7 (CONTRAST.txt §2), 1.25:1 on pale #fde68a
 * (computed here). No 4.5:1 is asserted for a user's own colours.
 */
const USER_COLOUR_LIMIT = [
  { fill: "#0284c7", ratio: "4.10" },
  { fill: "#fde68a", ratio: "1.25" },
];

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

/** The fill of the one text in `svg` reading `content`, exactly as the chart wrote it — print writes white "#fff". */
function writtenFillOfText(svg: Element, content: string): string {
  const texts = Array.from(svg.querySelectorAll("text")).filter((t) => t.textContent === content);
  expect(texts, `text "${content}"`).toHaveLength(1);
  return texts[0]!.getAttribute("fill") ?? "none";
}

/** Each status's bar label fill, keyed by status, as written. */
function barLabels(svg: Element): Record<Status, string> {
  return Object.fromEntries(STATUSES.map((s) => [s, writtenFillOfText(svg, LABEL_OF[s])])) as Record<Status, string>;
}

/** One fill for every status. */
const every = (fill: string) => Object.fromEntries(STATUSES.map((s) => [s, fill])) as Record<Status, string>;

/** "#fff" → "#ffffff", so print's shorthand compares with the screen's six digits. */
const longHex = (hex: string) =>
  (/^#[0-9a-f]{3}$/i.test(hex) ? `#${hex.slice(1).split("").map((ch) => ch + ch).join("")}` : hex).toLowerCase();
const asLongHex = (labels: Record<Status, string>) =>
  Object.fromEntries(STATUSES.map((s) => [s, longHex(labels[s])])) as Record<Status, string>;

const PRESET_KEYS = Object.keys(GANTT_COLOR_PRESETS);

describe("white bar labels on the colours a user chooses (WI-102, v0.79.4)", () => {
  it("PREMISE: the swatch list is the picker's own", () => {
    expect([...GANTT_STANDARD_COLORS]).toEqual(SWATCHES);
  });

  it.each([...SWATCHES, ...CUSTOMS])("G2 custom %s: every status, both themes, the label is white whatever the fill", (hex) => {
    for (const dark of [false, true]) {
      expect(barLabels(renderScreen(custom(hex), { dark })), `dark=${dark}`).toEqual(every(LABEL_ON_SCREEN));
      cleanup();
    }
  });

  it("G2 the recorded limit: white reads below 4.5:1 on some of them, as measured", () => {
    for (const { fill, ratio } of USER_COLOUR_LIMIT) {
      expect(contrast(WHITE, fill).toFixed(2), fill).toBe(ratio);
      expect(contrast(WHITE, fill), fill).toBeLessThan(AA);
    }
  });
});

describe("bar labels as the charts draw them (WI-102)", () => {
  it.each(PRESET_KEYS)("G3 the Gantt, light, preset %s: every label is #ffffff", (key) => {
    expect(barLabels(renderScreen(preset(key)))).toEqual(every(LABEL_ON_SCREEN));
  });

  it.each(PRESET_KEYS)("G3 the Gantt, dark, preset %s: every label is #ffffff", (key) => {
    expect(barLabels(renderScreen(preset(key), { dark: true }))).toEqual(every(LABEL_ON_SCREEN));
  });

  it("G3 the light render a copy takes in dark mode: every label is #ffffff", () => {
    expect(barLabels(renderScreen(preset("classic"), { dark: true, forceLight: true }))).toEqual(every(LABEL_ON_SCREEN));
  });

  it.each(PRESET_KEYS)("G4 PARITY preset %s: the printed Gantt's bar labels are #fff, the screen's white, fill for fill", (key) => {
    const screen = barLabels(renderScreen(preset(key)));
    cleanup();
    const printed = barLabels(renderPrint(preset(key)).querySelector("svg")!);
    expect(printed).toEqual(every(LABEL_IN_PRINT));
    expect(asLongHex(printed)).toEqual(asLongHex(screen));
  });

  it.each(["#0284c7", "#fde68a", "#757575"])("G4 PARITY custom %s: print and screen both draw the label white", (hex) => {
    const screen = barLabels(renderScreen(custom(hex)));
    cleanup();
    const printed = barLabels(renderPrint(custom(hex)).querySelector("svg")!);
    expect(printed).toEqual(every(LABEL_IN_PRINT));
    expect(asLongHex(printed)).toEqual(asLongHex(screen));
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
