// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, afterEach } from "vitest";
import { render } from "@testing-library/react";

import { GanttChart } from "./GanttChart";
import { PrintGanttChart } from "./PrintGanttChart";
import { readableOnWhite } from "./gantt-utils";
import { COLORS, resolveGanttAppearance } from "./gantt-constants";
import { createActivity, createScenario } from "@app/api/project-service";
import { DEFAULT_GANTT_APPEARANCE, PROJECT_TILE_COLORS } from "@domain/models/types";
import type { ActivityBand, ScheduledActivity } from "@domain/models/types";

/**
 * A section header's NAME is drawn darker where the chart is white (WI-100).
 *
 * The Gantt draws each band's name in the band's own colour, and the eight colours the picker
 * offers are pale: on white they read 1.67–2.56:1. On white — the light chart, the light render
 * a copy is taken from, and the printed chart — the name is drawn in its own colour scaled toward
 * black, c' = round(c × (1 − t)), at the smallest `t` in steps of 0.005 that reads 4.5:1. The rule
 * line beside the name keeps the band's colour; dark mode is unchanged; a band with no colour
 * keeps the muted fallback.
 *
 * ⚠️ Contrast is computed HERE, from the WCAG 2.x definition — never by calling the code under
 * test — and the eight results are literals, not outputs of the implementation.
 *
 * ⚠️ WHY THIS FILE, AND NOT THE PARITY ORACLE: `gantt-parity-oracle.test.tsx` serialises geometry
 * only (no fill, no stroke) and its one band has no colour, so it cannot see any of this.
 *
 * ⚠️ WI-172 (v0.86.0) MOVED THE CHARTS' GROUND, NOT THIS RULE. Each Section's own row is now tinted in
 * its colour at the grid's 0.18 (no colour: the muted grey), the faint rule beside the name is gone, and
 * the name — on both charts, in both themes — is moved to 4.5:1 against THAT tint: toward black on a
 * light chart, c' = round(c × (1 − t)), toward white on the dark one, c' = round(c + (255 − c) × t), at
 * the least `t` in steps of 0.005. The summary bar on the row is drawn in the name's colour. The
 * `readableOnWhite` table above is unchanged (it still draws other labels on white); the charts' literals
 * below were re-pinned, and are still checked HERE from the WCAG definition, at the same 4.5:1.
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

/** c' = round(c × (1 − t)) per channel, as #rrggbb. */
function scaled(hex: string, t: number): string {
  const byte = (at: number) =>
    Math.round(parseInt(hex.slice(at, at + 2), 16) * (1 - t)).toString(16).padStart(2, "0");
  return `#${byte(1)}${byte(3)}${byte(5)}`;
}

const WHITE = "#ffffff";
const DARK_GROUND = "#1f2937";
const STEP = 0.005;

/** The ruled results, with the `t` each one is made at. */
const PRESETS = [
  { name: "Slate", hex: "#94a3b8", t: 0.27, readable: "#6c7786" },
  { name: "Sage", hex: "#86b49a", t: 0.305, readable: "#5d7d6b" },
  { name: "Sky", hex: "#7dd3fc", t: 0.41, readable: "#4a7c95" },
  { name: "Lavender", hex: "#b4a7d6", t: 0.32, readable: "#7a7292" },
  { name: "Rose", hex: "#e8a3a3", t: 0.345, readable: "#986b6b" },
  { name: "Amber", hex: "#e6c07b", t: 0.4, readable: "#8a734a" },
  { name: "Teal", hex: "#6bb6b0", t: 0.3, readable: "#4b7f7b" },
  { name: "Clay", hex: "#c9a38a", t: 0.305, readable: "#8c7160" },
];

describe("readableOnWhite: a band name's colour on a white chart (WI-100)", () => {
  it("the table holds exactly the eight colours the band picker offers", () => {
    expect(PRESETS.map(({ name, hex }) => ({ name, hex }))).toEqual(
      PROJECT_TILE_COLORS.map(({ name, hex }) => ({ name, hex })),
    );
  });

  it.each(PRESETS)("$name becomes $readable, which reads at least 4.5:1 on white", ({ hex, readable }) => {
    expect(readableOnWhite(hex)).toBe(readable);
    expect(contrast(readable, WHITE)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(PRESETS)("$name: one step less dark reads under 4.5:1, so $readable is the least darkening", ({ hex, t, readable }) => {
    // The ruled colour IS the method's output at `t` …
    expect(scaled(hex, t)).toBe(readable);
    // … and the step before it does not read.
    expect(contrast(scaled(hex, t - STEP), WHITE)).toBeLessThan(4.5);
  });

  it("PREMISE: all eight are too pale to read on white, and already read on the dark chart", () => {
    // Without the first half there is nothing to darken; without the second, leaving dark
    // mode alone would be a defect rather than the ruling.
    for (const { name, hex } of PRESETS) {
      expect(contrast(hex, WHITE), name).toBeLessThan(4.5);
      expect(contrast(hex, DARK_GROUND), name).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("a colour that already reads 4.5:1 on white comes back unchanged, byte for byte", () => {
    // #6b7280 is the no-colour fallback (4.83:1); #767676 reads 4.54:1, just over the line.
    for (const hex of [COLORS.light.textMuted, "#767676", "#1F2937"]) {
      expect(contrast(hex, WHITE), hex).toBeGreaterThanOrEqual(4.5);
      expect(readableOnWhite(hex)).toBe(hex);
    }
  });

  it("a colour just under the line moves exactly one step: #3c7cac becomes #3c7bab", () => {
    // 4.496:1 → 4.552:1. A second step would change it again (#3b7baa), so overshooting by one
    // step shows here as well as stopping short.
    expect(contrast("#3c7cac", WHITE)).toBeLessThan(4.5);
    expect(readableOnWhite("#3c7cac")).toBe("#3c7bab");
    expect(scaled("#3c7cac", 2 * STEP)).not.toBe("#3c7bab");
  });

  it("an upper-case colour darkens as its lower-case form does", () => {
    expect(readableOnWhite("#94A3B8")).toBe("#6c7786");
  });

  it("a string hexToRgb cannot read comes back unchanged", () => {
    expect(readableOnWhite("not-a-colour")).toBe("not-a-colour");
  });
});

// -- Both charts, on each Section's tint (WI-172) -----------------------------------

/** c' = round(c + (255 − c) × t) per channel, as #rrggbb: toward white, on the dark chart. */
function lightened(hex: string, t: number): string {
  const byte = (at: number) => {
    const c = parseInt(hex.slice(at, at + 2), 16);
    return Math.round(c + (255 - c) * t).toString(16).padStart(2, "0");
  };
  return `#${byte(1)}${byte(3)}${byte(5)}`;
}

/** `hex` at 0.18 over `ground`, as the browser composites it: the alpha at 8 bits (46/255), each channel rounded. */
function tinted(hex: string, ground: string): string {
  const alpha = Math.round(0.18 * 255) / 255;
  const byte = (at: number) =>
    Math.round(parseInt(hex.slice(at, at + 2), 16) * alpha + parseInt(ground.slice(at, at + 2), 16) * (1 - alpha))
      .toString(16).padStart(2, "0");
  return `#${byte(1)}${byte(3)}${byte(5)}`;
}

/** `rgba(…, 0.18)` of #rrggbb: the tint's fill as the charts write it. */
function tintFill(hex: string): string {
  const ch = (at: number) => parseInt(hex.slice(at, at + 2), 16);
  return `rgba(${ch(1)}, ${ch(3)}, ${ch(5)}, 0.18)`;
}

/**
 * Each Section's name on its own tint, with the `t` each is made at: light toward black, dark toward
 * white (t 0: already reads, unchanged). "Plain" has no colour: the muted grey of each chart.
 */
const ON_TINT = [
  { name: "Slate", hex: "#94a3b8", light: { t: 0.33, ink: "#636d7b" }, dark: { t: 0.075, ink: "#9caabd" } },
  { name: "Sage", hex: "#86b49a", light: { t: 0.36, ink: "#567363" }, dark: { t: 0.01, ink: "#87b59b" } },
  { name: "Sky", hex: "#7dd3fc", light: { t: 0.44, ink: "#46768d" }, dark: { t: 0, ink: "#7dd3fc" } },
  { name: "Lavender", hex: "#b4a7d6", light: { t: 0.37, ink: "#716987" }, dark: { t: 0, ink: "#b4a7d6" } },
  { name: "Rose", hex: "#e8a3a3", light: { t: 0.39, ink: "#8e6363" }, dark: { t: 0, ink: "#e8a3a3" } },
  { name: "Amber", hex: "#e6c07b", light: { t: 0.43, ink: "#836d46" }, dark: { t: 0, ink: "#e6c07b" } },
  { name: "Teal", hex: "#6bb6b0", light: { t: 0.355, ink: "#457572" }, dark: { t: 0.01, ink: "#6cb7b1" } },
  { name: "Clay", hex: "#c9a38a", light: { t: 0.36, ink: "#816858" }, dark: { t: 0, ink: "#c9a38a" } },
];
const PLAIN = {
  light: { hex: COLORS.light.textMuted, t: 0.095, ink: "#616774" },
  dark: { hex: COLORS.dark.textMuted, t: 0.07, ink: "#a3a9b5" },
};

describe("a Section's name on its own tint (WI-172): computed here, from the WCAG definition", () => {
  it("the table holds exactly the eight colours the band picker offers", () => {
    expect(ON_TINT.map(({ name, hex }) => ({ name, hex }))).toEqual(PRESETS.map(({ name, hex }) => ({ name, hex })));
  });

  it.each(ON_TINT)("$name on the light chart: $light.ink reads 4.5:1 on its tint, and one step less dark does not", ({ hex, light }) => {
    const ground = tinted(hex, WHITE);
    expect(scaled(hex, light.t)).toBe(light.ink);
    expect(contrast(light.ink, ground)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(scaled(hex, light.t - STEP), ground)).toBeLessThan(4.5);
  });

  it.each(ON_TINT)("$name on the dark chart: $dark.ink reads 4.5:1 on its tint, by the least step toward white", ({ hex, dark }) => {
    const ground = tinted(hex, DARK_GROUND);
    expect(lightened(hex, dark.t)).toBe(dark.ink);
    expect(contrast(dark.ink, ground)).toBeGreaterThanOrEqual(4.5);
    if (dark.t > 0) expect(contrast(lightened(hex, dark.t - STEP), ground)).toBeLessThan(4.5);
  });

  it("a Section with no colour: the muted grey moved the same way, on each chart's grey tint", () => {
    for (const [ground, side, move] of [[WHITE, PLAIN.light, scaled], [DARK_GROUND, PLAIN.dark, lightened]] as const) {
      const g = tinted(side.hex, ground);
      expect(move(side.hex, side.t)).toBe(side.ink);
      expect(contrast(side.ink, g)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(move(side.hex, side.t - STEP), g)).toBeLessThan(4.5);
    }
  });
});

const START = "2026-04-06";
const scenario = createScenario("Baseline", START);
const ACTIVITIES = Array.from({ length: PRESETS.length + 1 }, (_, i) =>
  createActivity(`Task ${i + 1}`, scenario.settings),
);
const SCHEDULED: ScheduledActivity[] = ACTIVITIES.map((a) => ({
  activityId: a.id,
  name: a.name,
  duration: 5,
  startDate: START,
  endDate: "2026-04-10",
  isActual: false,
}));
/** One band per preset, then one with no colour. */
const BANDS: ActivityBand[] = [
  ...PRESETS.map((p, i) => ({ id: `band-${p.name}`, name: p.name, insertBeforeActivityId: ACTIVITIES[i]!.id, color: p.hex })),
  { id: "band-plain", name: "Plain", insertBeforeActivityId: ACTIVITIES[PRESETS.length]!.id },
];

const SHARED = {
  activities: ACTIVITIES,
  bands: BANDS,
  scheduledActivities: SCHEDULED,
  projectStartDate: START,
  projectEndDate: "2026-04-10",
  buffer: null,
  dependencies: [],
  dependencyMode: false,
  activityTarget: 0.5,
  projectTarget: 0.95,
};

function renderScreen(isDark: boolean, forceLight = false) {
  if (isDark) document.documentElement.classList.add("dark");
  return render(
    <GanttChart
      {...SHARED}
      resolvedAppearance={resolveGanttAppearance(DEFAULT_GANTT_APPEARANCE, isDark && !forceLight)}
      appearancePanelOpen={false}
      onToggleAppearancePanel={() => {}}
      forceLight={forceLight}
    />,
  ).container;
}

function renderPrint() {
  return render(
    <PrintGanttChart
      {...SHARED}
      bufferedEndDate={null}
      formatDate={(iso: string) => iso}
      formatDateShort={(iso: string) => iso}
    />,
  ).container;
}

/**
 * Each band's name fill, its row's tint, its summary bar's fill, and any line left in its group (the
 * rule WI-172 removed), read from the chart svg.
 */
function bandPaint(container: HTMLElement): string[] {
  const svg = container.querySelector("svg[data-gantt-chart]")!;
  const texts = Array.from(svg.querySelectorAll("text"));
  return BANDS.map((band) => {
    const name = texts.find((t) => t.textContent === band.name && t.getAttribute("font-weight") === "700");
    if (!name) return `${band.name}: NOT DRAWN`;
    const tint = svg.querySelector(`rect[data-section-tint="${band.id}"]`)?.getAttribute("fill");
    const bar = svg.querySelector(`path[data-section-bar="${band.id}"]`)?.getAttribute("fill");
    const rule = name.parentElement?.querySelector("line") ? ", and a rule" : "";
    return `${band.name}: name ${name.getAttribute("fill")}, tint ${tint}, bar ${bar}${rule}`;
  });
}

/** The light chart: every name, and its bar, moved to 4.5:1 on its own tint; no rule. */
const ON_WHITE = [
  ...ON_TINT.map((p) => `${p.name}: name ${p.light.ink}, tint ${tintFill(p.hex)}, bar ${p.light.ink}`),
  `Plain: name ${PLAIN.light.ink}, tint ${tintFill(PLAIN.light.hex)}, bar ${PLAIN.light.ink}`,
];

/** The dark chart: the same on the dark tint — toward white where a colour does not already read. */
const ON_DARK = [
  ...ON_TINT.map((p) => `${p.name}: name ${p.dark.ink}, tint ${tintFill(p.hex)}, bar ${p.dark.ink}`),
  `Plain: name ${PLAIN.dark.ink}, tint ${tintFill(PLAIN.dark.hex)}, bar ${PLAIN.dark.ink}`,
];

afterEach(() => document.documentElement.classList.remove("dark"));

describe("band names on the Gantt and the printed Gantt (WI-100, re-pinned in WI-172)", () => {
  it("the Gantt in light mode: each NAME and bar darkened to 4.5:1 on its row's tint, no colour on the grey tint, no rule", () => {
    expect(bandPaint(renderScreen(false))).toEqual(ON_WHITE);
  });

  it("the Gantt in dark mode: each NAME and bar lightened where it does not already read 4.5:1 on its tint, no rule", () => {
    expect(bandPaint(renderScreen(true))).toEqual(ON_DARK);
  });

  it("the light render a copy takes in dark mode: the light chart's names, tints and bars", () => {
    expect(bandPaint(renderScreen(true, true))).toEqual(ON_WHITE);
  });

  it("the printed Gantt: the light chart's names, tints and bars, no rule", () => {
    expect(bandPaint(renderPrint())).toEqual(ON_WHITE);
  });
});
