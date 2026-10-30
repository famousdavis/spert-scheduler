// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";

// html2canvas cannot run under jsdom. The mock records what copyChartAsPng hands it, so the test
// can ask its `ignoreElements` about elements it controls.
const { html2canvasMock } = vi.hoisted(() => ({ html2canvasMock: vi.fn() }));
vi.mock("html2canvas", () => ({ default: html2canvasMock }));

import { copyChartAsPng, type CopyChartOptions } from "./export-chart";

/**
 * What the copied picture leaves out (v0.75.0): the copy buttons, as before, and any element
 * carrying `data-capture-skip` — the comparison table's Run row, a control that belongs on the
 * screen and not in the picture.
 */

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
});

/** Run copyChartAsPng on `live` and return the options it handed html2canvas. */
async function takeOptions(live: HTMLElement, options?: CopyChartOptions) {
  await copyChartAsPng(live, options);
  expect(html2canvasMock).toHaveBeenCalledTimes(1);
  const [target, h2cOptions] = html2canvasMock.mock.calls[0]!;
  expect(target).toBe(live);
  return h2cOptions as {
    ignoreElements: (el: Element) => boolean;
    onclone: (doc: Document, clonedEl: HTMLElement) => void;
  };
}

/** Run copyChartAsPng on `live` and return the `ignoreElements` it handed html2canvas. */
async function takeIgnoreElements(live: HTMLElement, options?: CopyChartOptions) {
  return (await takeOptions(live, options)).ignoreElements;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("copyChartAsPng — what the picture leaves out", () => {
  it("an element carrying data-capture-skip, as it leaves out a copy button; never a plain element of the chart", async () => {
    // Inside the chart, on the page: since WI-143 a plain element OUTSIDE the chart is left out of
    // html2canvas's copy of the page — see the next block.
    const live = document.body.appendChild(document.createElement("div"));
    const row = live.appendChild(document.createElement("tr"));
    row.setAttribute("data-capture-skip", "");
    const button = live.appendChild(document.createElement("button"));
    button.className = "copy-image-button bg-transparent";
    const plain = live.appendChild(document.createElement("td"));
    plain.className = "px-4 py-1.5 text-right";
    const ignoreElements = await takeIgnoreElements(live);

    expect(ignoreElements(row)).toBe(true);
    expect(ignoreElements(button)).toBe(true); // the existing rule, as the control
    expect(ignoreElements(plain)).toBe(false);
  });
});

/**
 * html2canvas copies the chart and its ancestors, not the whole page (WI-143).
 *
 * It copies the page before it draws one element of it, inside its call, so nothing paints
 * meanwhile, and the colour fix then restyles the whole copy. It asks `ignoreElements` about each
 * element it is about to copy and skips an ignored one with everything inside it.
 */
describe("copyChartAsPng — what html2canvas copies of the page (WI-143)", () => {
  /** <head><style/></head> <body> <main> <section> before, CHART > inner, after </section> </main> <aside/> */
  function page() {
    const style = document.head.appendChild(document.createElement("style"));
    const main = document.body.appendChild(document.createElement("main"));
    const section = main.appendChild(document.createElement("section"));
    const before = section.appendChild(document.createElement("p"));
    const chart = section.appendChild(document.createElement("div"));
    const inner = chart.appendChild(document.createElement("span"));
    const after = section.appendChild(document.createElement("p"));
    const aside = document.body.appendChild(document.createElement("aside"));
    return { style, main, section, before, chart, inner, after, aside };
  }

  afterEach(() => {
    document.head.querySelectorAll("style").forEach((s) => s.remove());
  });

  it("keeps the chart, what is inside it and its ancestors; leaves out the rest of <body>", async () => {
    const p = page();
    const ignore = await takeIgnoreElements(p.chart);

    expect([p.chart, p.inner, p.section, p.main, document.body].map(ignore)).toEqual([false, false, false, false, false]);
    expect([p.before, p.after, p.aside].map(ignore)).toEqual([true, true, true]);
    expect(ignore(p.style)).toBe(false); // <head> holds the stylesheets
  });

  it("copies the whole page for a chart that asks to — the comparison's distribution chart", async () => {
    const p = page();
    const skipped = p.chart.appendChild(document.createElement("button"));
    skipped.className = "copy-image-button";
    const ignore = await takeIgnoreElements(p.chart, { copyWholePage: true });

    expect([p.before, p.after, p.aside].map(ignore)).toEqual([false, false, false]);
    expect(ignore(skipped)).toBe(true); // the other rules still hold
  });

  it("gives the copy's <body> the page's height, so it scrolls as the page does", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null); // jsdom has no 2D canvas
    Object.defineProperty(document.documentElement, "scrollHeight", { value: 5000, configurable: true });
    try {
      for (const [copyWholePage, minHeight] of [[false, "5000px"], [true, ""]] as const) {
        html2canvasMock.mockClear();
        const p = page();
        const { onclone } = await takeOptions(p.chart, { copyWholePage });
        const copy = document.implementation.createHTMLDocument("copy");
        onclone(copy, copy.body.appendChild(copy.createElement("div")));
        expect(copy.body.style.minHeight).toBe(minHeight);
        document.body.innerHTML = "";
      }
    } finally {
      Reflect.deleteProperty(document.documentElement, "scrollHeight");
      vi.restoreAllMocks();
    }
  });
});
