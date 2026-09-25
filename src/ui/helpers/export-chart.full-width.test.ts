// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";

// html2canvas cannot run under jsdom. The mock records what copyChartAsPng hands it, so a
// test can run the `onclone` callback itself, on an element it controls — which is the
// only place the full-width expansion is allowed to happen.
const { html2canvasMock } = vi.hoisted(() => ({ html2canvasMock: vi.fn() }));
vi.mock("html2canvas", () => ({ default: html2canvasMock }));

import { copyChartAsPng, expandToFullWidth, type CopyChartOptions } from "./export-chart";

/**
 * The layout the Gantt chart's container has in Chrome at a 1280 px window with Fit to
 * window off: a 1329 px chart in a box that shows 1180 px of it, inside a 1 px border.
 * jsdom does no layout, so these are stubbed onto the element.
 */
const OVERFLOWING = { scrollWidth: 1329, clientWidth: 1180, offsetWidth: 1182 };
/** The same box when the chart fits: nothing hidden. */
const FITTING = { scrollWidth: 1180, clientWidth: 1180, offsetWidth: 1182 };

function laidOut(metrics: typeof OVERFLOWING): HTMLDivElement {
  const el = document.createElement("div");
  for (const [key, value] of Object.entries(metrics)) {
    Object.defineProperty(el, key, { value, configurable: true });
  }
  return el;
}

/** Run copyChartAsPng and return the `onclone` it handed html2canvas. */
async function copyAndTakeOnclone(
  live: HTMLElement,
  options?: CopyChartOptions,
): Promise<(doc: Document, clonedEl: HTMLElement) => void> {
  await copyChartAsPng(live, options);
  expect(html2canvasMock).toHaveBeenCalledTimes(1);
  const [target, h2cOptions] = html2canvasMock.mock.calls[0]!;
  expect(target).toBe(live);
  return h2cOptions.onclone;
}

beforeAll(() => {
  vi.stubGlobal("ClipboardItem", class { constructor(readonly items: Record<string, Blob>) {} });
  Object.defineProperty(navigator, "clipboard", {
    value: { write: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  });
});

afterAll(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "clipboard");
});

beforeEach(() => {
  html2canvasMock.mockReset();
  html2canvasMock.mockResolvedValue({
    toBlob: (done: BlobCallback) => done(new Blob(["png"], { type: "image/png" })),
  });
  // onclone also neutralises colours through a Canvas2D context, which jsdom lacks; it is
  // only dereferenced for colour values jsdom never computes, so null is enough here.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

describe("expandToFullWidth", () => {
  it("widens an overflowing element to its whole scroll width and stops it clipping", () => {
    const el = laidOut(OVERFLOWING);
    expandToFullWidth(el);
    // 1182 px border box + the 149 px scrolled out of view.
    expect(el.style.width).toBe("1331px");
    expect(el.style.overflow).toBe("visible");
    expect(el.style.boxSizing).toBe("border-box");
  });

  it("leaves an element with nothing hidden untouched", () => {
    const el = laidOut(FITTING);
    expandToFullWidth(el);
    expect(el.getAttribute("style")).toBeNull();
  });
});

describe("copyChartAsPng", () => {
  it("with captureFullWidth expands html2canvas's clone, never the live element", async () => {
    const live = laidOut(OVERFLOWING);
    const onclone = await copyAndTakeOnclone(live, { captureFullWidth: true });

    const clone = laidOut(OVERFLOWING);
    onclone(document, clone);

    expect(clone.style.width).toBe("1331px");
    expect(clone.style.overflow).toBe("visible");
    expect(live.getAttribute("style")).toBeNull();
  });

  it("without captureFullWidth the clone keeps its visible box", async () => {
    const onclone = await copyAndTakeOnclone(laidOut(OVERFLOWING));

    const clone = laidOut(OVERFLOWING);
    onclone(document, clone);

    expect(clone.getAttribute("style")).toBeNull();
  });
});
