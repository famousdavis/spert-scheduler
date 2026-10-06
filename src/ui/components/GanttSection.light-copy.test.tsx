// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useRef, type ReactNode } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// CopyImageButton decides at MODULE LOAD whether this browser can copy images, from
// ClipboardItem and navigator.clipboard.write. jsdom has neither, so both must exist
// before that module is evaluated, or the button renders disabled and a click does
// nothing. html2canvas cannot run under jsdom; the mock records what it was handed, and
// what the page looked like at the moment it was called.
const { html2canvasMock, clipboardWrite } = vi.hoisted(() => {
  const write = vi.fn();
  vi.stubGlobal("ClipboardItem", class { constructor(readonly items: Record<string, Blob>) {} });
  Object.defineProperty(navigator, "clipboard", { value: { write }, configurable: true });
  return { html2canvasMock: vi.fn(), clipboardWrite: write };
});
vi.mock("html2canvas", () => ({ default: html2canvasMock }));

import { GanttSection } from "./GanttSection";
import { CopyImageButton } from "./CopyImageButton";
import { COLORS, GANTT_COLOR_PRESETS } from "@ui/charts/gantt-constants";
import { createActivity, createScenario } from "@app/api/project-service";
import { DEFAULT_GANTT_APPEARANCE, type ScheduledActivity } from "@domain/models/types";

/**
 * A copy of the Gantt is always light (WI-26).
 *
 * html2canvas copies the whole page synchronously, inside the call, before its first await —
 * and its copy of an SVG keeps the colours computed at that moment. So the chart is redrawn
 * light just before the call and redrawn in its own theme as soon as the call returns, and the
 * `dark` class comes off html2canvas's copy of the document. The mock stands in for
 * html2canvas at exactly that seam: what it sees when it is CALLED is what the copy is made of.
 *
 * Two colours stand for the chart, one per route the theme takes into it: the svg's
 * background is GanttChart's own palette, and the planned bar's fill is the appearance
 * GanttSection resolves.
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

function renderGantt(alongside?: ReactNode) {
  return render(
    <>
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
      />
      {alongside}
    </>,
  );
}

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

const chartSvg = () => document.querySelector('svg[data-gantt-chart="interactive"]') as SVGSVGElement;

/** `style.background` normalises a hex literal to `rgb(...)`; normalise the palette the same way. */
const asRendered = (color: string): string => {
  const probe = document.createElement("div");
  probe.style.background = color;
  return probe.style.background;
};

/** The chart's two colours: its background, and every hex rect fill — the planned bar's. */
function paint() {
  const fills = Array.from(chartSvg().querySelectorAll("rect")).map((r) => r.getAttribute("fill") ?? "");
  return { bg: chartSvg().style.background, bars: fills.filter((f) => f.startsWith("#")) };
}
type Paint = ReturnType<typeof paint>;

const classic = GANTT_COLOR_PRESETS.classic!;
const LIGHT: Paint = { bg: asRendered(COLORS.light.bg), bars: [classic.light.barPlanned] };
const DARK: Paint = { bg: asRendered(COLORS.dark.bg), bars: [classic.dark.barPlanned] };

const fakeCanvas = () => ({
  toBlob: (done: BlobCallback) => done(new Blob(["png"], { type: "image/png" })),
});

/** A promise this file settles itself, so a test can look at the page while it is pending. */
function pendingRender() {
  let settle!: (canvas: ReturnType<typeof fakeCanvas>) => void;
  const promise = new Promise<ReturnType<typeof fakeCanvas>>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
}

/** html2canvas's copy of a dark page: a separate document, never this test's own. */
function darkCloneDocument() {
  const doc = document.implementation.createHTMLDocument("clone");
  doc.documentElement.classList.add("dark");
  const clonedEl = doc.createElement("div");
  doc.body.appendChild(clonedEl);
  return { doc, clonedEl };
}

type Onclone = (doc: Document, el: HTMLElement) => void;
const takeOnclone = (): Onclone => html2canvasMock.mock.calls[0]![1].onclone as Onclone;

const copyGantt = () => fireEvent.click(screen.getByRole("button", { name: "Copy Gantt chart as image" }));

beforeEach(() => {
  clipboardWrite.mockReset();
  clipboardWrite.mockResolvedValue(undefined);
  html2canvasMock.mockReset();
  // onclone also neutralises colours through a Canvas2D context, which jsdom lacks; it is
  // only dereferenced for colour values jsdom never computes, so null is enough here.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

afterEach(() => {
  document.documentElement.classList.remove("dark");
});

describe("Copy Gantt chart as image — the copy is always light (WI-26)", () => {
  it("dark mode: the chart is light at the instant html2canvas is called, and dark again before its promise settles", async () => {
    document.documentElement.classList.add("dark");
    renderGantt();
    expect(paint()).toEqual(DARK); // the premise, asserted rather than assumed

    const rendering = pendingRender();
    let atCall: Paint | undefined;
    html2canvasMock.mockImplementation(() => {
      atCall = paint();
      return rendering.promise;
    });

    copyGantt();

    expect(html2canvasMock).toHaveBeenCalledTimes(1);
    expect(atCall).toEqual(LIGHT);
    // The call has returned, and its promise is still pending — nothing has settled it — yet
    // the page is dark again: the light chart does not outlive the synchronous call.
    expect(paint()).toEqual(DARK);

    rendering.settle(fakeCanvas());
    await waitFor(() => expect(clipboardWrite).toHaveBeenCalledTimes(1));
    expect(paint()).toEqual(DARK);
  });

  it("the Gantt's onclone takes dark off the clone document's root, before the colour neutraliser runs", async () => {
    document.documentElement.classList.add("dark");
    renderGantt();
    html2canvasMock.mockResolvedValue(fakeCanvas());
    copyGantt();
    await waitFor(() => expect(clipboardWrite).toHaveBeenCalledTimes(1));
    const onclone = takeOnclone();

    const { doc, clonedEl } = darkCloneDocument();
    // The neutraliser's first act is to take a 2D context: record the theme it starts under.
    const darkWhenNeutraliserStarts: boolean[] = [];
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => {
      darkWhenNeutraliserStarts.push(doc.documentElement.classList.contains("dark"));
      return null;
    });

    onclone(doc, clonedEl);

    expect(doc.documentElement.classList.contains("dark")).toBe(false);
    expect(darkWhenNeutraliserStarts).toEqual([false]); // it ran, once, after the removal
    // Only html2canvas's copy loses the class; the page keeps it.
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("a copy site that does not opt in forces nothing, and its clone keeps dark", async () => {
    document.documentElement.classList.add("dark");
    renderGantt(<PlainCopySite />);
    let atCall: Paint | undefined;
    html2canvasMock.mockImplementation(() => {
      atCall = paint();
      return Promise.resolve(fakeCanvas());
    });

    fireEvent.click(screen.getByRole("button", { name: "Copy table as image" }));
    await waitFor(() => expect(clipboardWrite).toHaveBeenCalledTimes(1));

    expect(atCall).toEqual(DARK); // nothing redrew the chart on the page for this copy
    const { doc, clonedEl } = darkCloneDocument();
    takeOnclone()(doc, clonedEl);
    expect(doc.documentElement.classList.contains("dark")).toBe(true);
    expect(clonedEl.getAttribute("style")).toBeNull();
  });

  it("a synchronous throw from html2canvas still puts the dark chart back", async () => {
    document.documentElement.classList.add("dark");
    renderGantt();
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      let atThrow: Paint | undefined;
      html2canvasMock.mockImplementation(() => {
        atThrow = paint();
        throw new Error("html2canvas failed");
      });

      copyGantt();

      expect(atThrow).toEqual(LIGHT); // the chart really was light when the call threw...
      expect(paint()).toEqual(DARK); // ...and the throw did not leave it there
      await waitFor(() => expect(errorLog).toHaveBeenCalledWith("CopyImageButton: copy failed", expect.any(Error)));
      expect(clipboardWrite).not.toHaveBeenCalled();
    } finally {
      errorLog.mockRestore();
    }
  });

  it("the copy finishes the colour transitions its light redraw starts, after the redraw and again after the restore, and nothing else", async () => {
    document.documentElement.classList.add("dark");
    renderGantt();
    const target = chartSvg().parentElement!; // what the copy captures, and settles

    // jsdom has no Web Animations. Stand in one running CSS transition — the dependency arrows
    // animate their colour — and one animation that is not a transition.
    class FakeCSSTransition {
      finish = vi.fn();
    }
    Object.defineProperty(globalThis, "CSSTransition", { value: FakeCSSTransition, configurable: true, writable: true });
    try {
      const transition = new FakeCSSTransition();
      const other = { finish: vi.fn() };
      const finishedWhile: Paint[] = [];
      transition.finish.mockImplementation(() => finishedWhile.push(paint()));
      // Only a search of the whole subtree finds the arrows' transitions: asked without
      // `{ subtree: true }`, getAnimations answers for the container alone, which animates nothing.
      Object.defineProperty(target, "getAnimations", {
        value: (options?: { subtree?: boolean }) => (options?.subtree ? [transition, other] : []),
        configurable: true,
      });
      let finishesAtCall = -1;
      html2canvasMock.mockImplementation(() => {
        finishesAtCall = transition.finish.mock.calls.length;
        return Promise.resolve(fakeCanvas());
      });

      copyGantt();
      await waitFor(() => expect(clipboardWrite).toHaveBeenCalledTimes(1));

      expect(finishesAtCall).toBe(1); // settled once before html2canvas copied the page...
      expect(finishedWhile).toEqual([LIGHT, DARK]); // ...after the light redraw, and again after the restore
      expect(other.finish).not.toHaveBeenCalled(); // only transitions: finish() throws on an infinite one
    } finally {
      Reflect.deleteProperty(globalThis, "CSSTransition");
    }
  });

  it("light mode: the copy leaves the live chart exactly as it was", async () => {
    renderGantt();
    expect(paint()).toEqual(LIGHT); // the premise
    const chart = chartSvg().parentElement!;
    const before = chart.outerHTML;

    const rendering = pendingRender();
    let atCall: string | undefined;
    html2canvasMock.mockImplementation(() => {
      atCall = chart.outerHTML;
      return rendering.promise;
    });

    copyGantt();

    expect(html2canvasMock).toHaveBeenCalledTimes(1);
    expect(atCall).toBe(before);
    expect(chart.outerHTML).toBe(before);
    rendering.settle(fakeCanvas());
    await waitFor(() => expect(clipboardWrite).toHaveBeenCalledTimes(1));
    expect(chart.outerHTML).toBe(before);
  });
});
