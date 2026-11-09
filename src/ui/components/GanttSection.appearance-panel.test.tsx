// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// CopyImageButton decides at MODULE LOAD whether this browser can copy images, so both
// ClipboardItem and navigator.clipboard.write must exist before it is evaluated (as in
// GanttSection.light-copy.test.tsx). html2canvas cannot run under jsdom; the mock records the
// element it is handed, which is what a copy is made of.
const { html2canvasMock, clipboardWrite } = vi.hoisted(() => {
  const write = vi.fn();
  vi.stubGlobal("ClipboardItem", class { constructor(readonly items: Record<string, Blob>) {} });
  Object.defineProperty(navigator, "clipboard", { value: { write }, configurable: true });
  return { html2canvasMock: vi.fn(), clipboardWrite: write };
});
vi.mock("html2canvas", () => ({ default: html2canvasMock }));

import { GanttSection } from "./GanttSection";
import { createActivity, createScenario } from "@app/api/project-service";
import { DEFAULT_GANTT_APPEARANCE, type ScheduledActivity } from "@domain/models/types";

/**
 * WI-171: the Gantt chart's Appearance settings open directly under the chart's toolbar, where
 * the button is, instead of below the whole chart, out of sight on most projects. jsdom has no
 * layout, so these pin the ORDER of the document; that the panel is on screen at once was
 * measured in real Chrome.
 */

const START = "2026-04-06";
const scenario = createScenario("Baseline", START);
const activity = createActivity("Discovery", scenario.settings);
const scheduled: ScheduledActivity = {
  activityId: activity.id,
  name: activity.name,
  duration: 5,
  startDate: START,
  endDate: "2026-04-10",
  isActual: false,
};

function renderGantt() {
  render(
    <GanttSection
      activities={[activity]}
      scheduledActivities={[scheduled]}
      projectStartDate={START}
      projectEndDate="2026-04-10"
      buffer={null}
      dependencies={[]}
      dependencyMode={false}
      activityTarget={0.5}
      projectTarget={0.95}
      ganttAppearance={DEFAULT_GANTT_APPEARANCE}
      onAppearanceChange={() => {}}
    />,
  );
}

const settingsButton = () => screen.getByTitle("Appearance settings");
const toggle = () => fireEvent.click(settingsButton());
/** A control that lives only in the panel: found by its own words, never by the panel's id. */
const panelControl = () => screen.queryByTitle("Pick planned color");
const chartSvg = () => document.querySelector('svg[data-gantt-chart="interactive"]') as SVGSVGElement;
const follows = (a: Node, b: Node) => a.compareDocumentPosition(b) === Node.DOCUMENT_POSITION_FOLLOWING;

const fakeCanvas = () => ({
  toBlob: (done: BlobCallback) => done(new Blob(["png"], { type: "image/png" })),
});

beforeEach(() => {
  clipboardWrite.mockReset();
  clipboardWrite.mockResolvedValue(undefined);
  html2canvasMock.mockReset();
  html2canvasMock.mockResolvedValue(fakeCanvas());
  // The colour neutraliser takes a Canvas2D context, which jsdom lacks; null is enough here.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

describe("Gantt chart Appearance settings open under the toolbar (WI-171)", () => {
  it("the panel opens after the toolbar and before the chart, inside neither", () => {
    renderGantt();
    expect(panelControl()).toBeNull(); // the premise: closed until asked for
    toggle();
    const control = panelControl()!;
    const toolbar = settingsButton().parentElement!;
    expect(follows(toolbar, control)).toBe(true);
    expect(follows(control, chartSvg())).toBe(true);
  });

  it("the button's aria-expanded follows the panel", () => {
    renderGantt();
    expect(settingsButton().getAttribute("aria-expanded")).toBe("false");
    toggle();
    expect(settingsButton().getAttribute("aria-expanded")).toBe("true");
    toggle();
    expect(settingsButton().getAttribute("aria-expanded")).toBe("false");
  });

  it("the button's aria-controls names the panel while it is open, and nothing while it is closed", () => {
    renderGantt();
    expect(settingsButton().hasAttribute("aria-controls")).toBe(false);
    toggle();
    const id = settingsButton().getAttribute("aria-controls");
    expect(id).toBeTruthy();
    const panel = document.getElementById(id!);
    expect(panel).not.toBeNull();
    expect(panel!.contains(panelControl())).toBe(true);
    // The whole panel: nothing of it lies outside the element the button names.
    expect(panel!.contains(screen.getByTitle("Pick completed color"))).toBe(true);
    toggle();
    expect(settingsButton().hasAttribute("aria-controls")).toBe(false);
  });

  it("a second click closes the panel", () => {
    renderGantt();
    toggle();
    expect(panelControl()).not.toBeNull();
    toggle();
    expect(panelControl()).toBeNull();
  });

  it("Copy as image captures the chart and never the open panel", async () => {
    renderGantt();
    toggle();
    fireEvent.click(screen.getByRole("button", { name: "Copy Gantt chart as image" }));
    await waitFor(() => expect(html2canvasMock).toHaveBeenCalledTimes(1));
    const captured = html2canvasMock.mock.calls[0]![0] as HTMLElement;
    expect(captured.contains(chartSvg())).toBe(true); // the premise: this is the chart's copy
    expect(captured.contains(panelControl())).toBe(false);
  });
});
