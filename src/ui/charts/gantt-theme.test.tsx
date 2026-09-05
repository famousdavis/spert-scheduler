// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, afterEach } from "vitest";
import { render, act } from "@testing-library/react";

import { GanttChart } from "./GanttChart";
import { GanttSection } from "@ui/components/GanttSection";
import { resolveGanttAppearance, GANTT_COLOR_PRESETS, COLORS } from "./gantt-constants";
import { DEFAULT_GANTT_APPEARANCE } from "@domain/models/types";
import type { Activity, ScheduledActivity } from "@domain/models/types";

/**
 * The Gantt follows a theme change without waiting for an unrelated re-render (WI-7).
 *
 * ⚠️ THIS IS THE ONLY PLACE THE THIRD PATH IS COVERED, and that is deliberate. The theme
 * can change three ways — an explicit toggle, Dark→System, and an OS flip while the
 * preference is "system". The first two were measured live in the browser. The third
 * cannot be: the browser pane's `colorScheme` emulation flips
 * `matchMedia(...).matches` but dispatches NO `change` event, and `matchMedia(q)` returns
 * a fresh MediaQueryList each call, so a synthetic event cannot reach the app's listener
 * either. Measured 2026-09-05, both.
 *
 * What every path has in common is that it ends in a mutation of the `dark` class on
 * `<html>` — on the OS path that mutation is the ONLY thing that happens. So mutating the
 * class here and asserting the palette follows covers all three at the seam they share.
 *
 * ⚠️ The mutation is awaited because `MutationObserver` delivers on a microtask; a
 * synchronous `act` reads the old value and fails against a working component.
 */

const ACTIVITY: Activity = {
  id: "a1",
  name: "Discovery",
  min: 3,
  mostLikely: 5,
  max: 10,
  confidenceLevel: "mediumConfidence",
  distributionType: "normal",
  status: "planned",
} as Activity;

const SCHEDULED: ScheduledActivity[] = [
  { activityId: "a1", name: "a1", duration: 5, startDate: "2026-04-06", endDate: "2026-04-10", isActual: false },
];

const SHARED = {
  activities: [ACTIVITY],
  scheduledActivities: SCHEDULED,
  projectStartDate: "2026-04-06",
  projectEndDate: "2026-04-10",
  buffer: null,
  dependencies: [],
  dependencyMode: false,
  activityTarget: 0.5,
  projectTarget: 0.95,
};

const root = () => document.documentElement;
const setDarkClass = async (on: boolean) =>
  act(async () => {
    if (on) root().classList.add("dark");
    else root().classList.remove("dark");
    await Promise.resolve();
  });

afterEach(() => root().classList.remove("dark"));

const chartSvg = (c: HTMLElement) => c.querySelector('svg[data-gantt-chart="interactive"]') as SVGElement;

/**
 * `style.background` normalises a hex literal to `rgb(...)`, so the palette constants
 * cannot be compared to it directly. Normalise both sides through the same code path
 * rather than hard-coding the rgb strings, which would silently stop tracking the
 * constants they are meant to be pinning.
 */
const asRendered = (color: string): string => {
  const probe = document.createElement("div");
  probe.style.background = color;
  return probe.style.background;
};

/** Every rect fill in the chart — NOT scoped by class: `cursor-pointer` is only applied
 *  when an `onEditActivity` handler is supplied, which this fixture deliberately omits. */
const rectFills = (c: HTMLElement) =>
  Array.from(chartSvg(c).querySelectorAll("rect")).map((r) => r.getAttribute("fill"));

describe("Gantt follows the theme without an intervening re-render", () => {
  it("GanttChart repaints its background and text when the dark class arrives", async () => {
    const { container } = render(
      <GanttChart
        {...SHARED}
        resolvedAppearance={resolveGanttAppearance(DEFAULT_GANTT_APPEARANCE, false)}
        appearancePanelOpen={false}
        onToggleAppearancePanel={() => {}}
      />,
    );

    // Premise, asserted rather than assumed: it starts light.
    expect(chartSvg(container).style.background).toBe(asRendered(COLORS.light.bg));

    await setDarkClass(true);
    expect(chartSvg(container).style.background).toBe(asRendered(COLORS.dark.bg));

    await setDarkClass(false);
    expect(chartSvg(container).style.background).toBe(asRendered(COLORS.light.bg));
  });

  it("GanttSection re-resolves its appearance palette when the dark class arrives", async () => {
    // GanttSection owns resolveGanttAppearance, so it needs its own coverage — a fix
    // applied to only one of the two would leave bar colours stale while the background
    // followed, which reads as a rendering bug rather than a theme bug.
    const { container } = render(
      <GanttSection
        {...SHARED}
        ganttAppearance={DEFAULT_GANTT_APPEARANCE}
        onAppearanceChange={() => {}}
      />,
    );

    const classic = GANTT_COLOR_PRESETS.classic!;
    expect(rectFills(container)).toContain(classic.light.barPlanned);

    await setDarkClass(true);
    expect(rectFills(container)).toContain(classic.dark.barPlanned);
    expect(rectFills(container)).not.toContain(classic.light.barPlanned);
  });

  it("the two palettes actually differ — otherwise the assertions above are vacuous", () => {
    // If a future palette edit made light and dark equal for these keys, every test in
    // this file would pass without the component doing anything at all.
    const classic = GANTT_COLOR_PRESETS.classic!;
    expect(classic.light.barPlanned).not.toBe(classic.dark.barPlanned);
    expect(COLORS.light.bg).not.toBe(COLORS.dark.bg);
  });
});
