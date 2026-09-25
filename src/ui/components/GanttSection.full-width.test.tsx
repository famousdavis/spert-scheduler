// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useRef } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// CopyImageButton decides at MODULE LOAD whether this browser can copy images, from
// ClipboardItem and navigator.clipboard.write. jsdom has neither, so both must exist
// before that module is evaluated, or the button renders disabled and a click does
// nothing. html2canvas cannot run under jsdom; the mock records what it was handed.
const { html2canvasMock, clipboardWrite } = vi.hoisted(() => {
  const write = vi.fn();
  vi.stubGlobal("ClipboardItem", class { constructor(readonly items: Record<string, Blob>) {} });
  Object.defineProperty(navigator, "clipboard", { value: { write }, configurable: true });
  return { html2canvasMock: vi.fn(), clipboardWrite: write };
});
vi.mock("html2canvas", () => ({ default: html2canvasMock }));

import { GanttSection } from "./GanttSection";
import { CopyImageButton } from "./CopyImageButton";
import { createActivity, createScenario } from "@app/api/project-service";
import { DEFAULT_GANTT_APPEARANCE, type ScheduledActivity } from "@domain/models/types";

/**
 * The layout the Gantt chart's container has in Chrome at a 1280 px window with Fit to
 * window off: a 1329 px chart in a box that shows 1180 px of it, inside a 1 px border.
 * jsdom does no layout, so these are stubbed onto the clone the test hands `onclone`.
 */
const OVERFLOWING = { scrollWidth: 1329, clientWidth: 1180, offsetWidth: 1182 };

function laidOut<T extends HTMLElement>(el: T): T {
  for (const [key, value] of Object.entries(OVERFLOWING)) {
    Object.defineProperty(el, key, { value, configurable: true });
  }
  return el;
}

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

/** Any copy site other than the Gantt: a CopyImageButton that does not opt in. */
function PlainCopySite() {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <>
      <CopyImageButton targetRef={ref} title="Copy table as image" />
      <div ref={ref}>table</div>
    </>
  );
}

/** Click a copy button and return what copyChartAsPng handed html2canvas. */
async function copyVia(buttonName: string) {
  fireEvent.click(screen.getByRole("button", { name: buttonName }));
  // The whole copy has run once the PNG has reached the clipboard.
  await waitFor(() => expect(clipboardWrite).toHaveBeenCalledTimes(1));
  expect(html2canvasMock).toHaveBeenCalledTimes(1);
  const [target, options] = html2canvasMock.mock.calls[0]!;
  return { target: target as HTMLElement, onclone: options.onclone as (doc: Document, el: HTMLElement) => void };
}

beforeEach(() => {
  clipboardWrite.mockReset();
  clipboardWrite.mockResolvedValue(undefined);
  html2canvasMock.mockReset();
  html2canvasMock.mockResolvedValue({
    toBlob: (done: BlobCallback) => done(new Blob(["png"], { type: "image/png" })),
  });
  // onclone also neutralises colours through a Canvas2D context, which jsdom lacks; it is
  // only dereferenced for colour values jsdom never computes, so null is enough here.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

describe("Copy Gantt chart as image", () => {
  it("the Gantt's copy captures the chart's whole scroll width", async () => {
    const { container } = render(
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
    const svg = container.querySelector('svg[data-gantt-chart="interactive"]');
    expect(svg).not.toBeNull();

    const { target, onclone } = await copyVia("Copy Gantt chart as image");

    // Premise: what gets captured is the chart's sideways-scrolling container, which
    // scrolls because Fit to window is off by default.
    expect(target).toBe(svg!.parentElement);
    expect(target.classList.contains("overflow-x-auto")).toBe(true);

    const clone = laidOut(target.cloneNode(true) as HTMLElement);
    onclone(document, clone);

    expect(clone.style.width).toBe("1331px");
    expect(clone.style.overflow).toBe("visible");
  });

  it("a copy button that does not opt in keeps the visible box", async () => {
    render(<PlainCopySite />);

    const { onclone } = await copyVia("Copy table as image");

    const clone = laidOut(document.createElement("div"));
    onclone(document, clone);

    expect(clone.getAttribute("style")).toBeNull();
  });
});
