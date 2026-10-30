// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";

// html2canvas cannot run under jsdom. The mock records what copyChartAsPng hands it, so the test
// can run its `onclone` — where the colour fix runs — on a document it controls.
const { html2canvasMock } = vi.hoisted(() => ({ html2canvasMock: vi.fn() }));
vi.mock("html2canvas", () => ({ default: html2canvasMock }));

import { copyChartAsPng } from "./export-chart";

/**
 * The colour fix reads every value before it writes one (WI-143).
 *
 * A read that follows a write makes the browser restyle html2canvas's copy of the page before it
 * can answer. The fix used to write each of the 67 colour variables on the root as soon as it had
 * read it: 67 restyles of the whole copy, about two seconds of every chart copy on the sample
 * project. Each of its two passes now reads everything first and writes after, so each restyles
 * once. jsdom computes no colours, so the computed styles are stand-ins that log each read; the
 * writes are logged by the element they land on.
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

afterEach(() => {
  vi.restoreAllMocks();
});

const OKLCH = "oklch(0.623 0.214 259.815)";

/** A computed style holding `props`, which logs each value read as `read <who>`. */
function computedStyle(props: Record<string, string>, who: string, log: string[]): CSSStyleDeclaration {
  const names = Object.keys(props);
  const style: Record<string | number, unknown> = {
    length: names.length,
    fontVariantNumeric: "normal",
    getPropertyValue: (prop: string) => {
      log.push(`read ${who}`);
      return props[prop] ?? "";
    },
  };
  names.forEach((name, i) => {
    style[i] = name;
  });
  return style as unknown as CSSStyleDeclaration;
}

/** The positions in `log` of one kind of entry. */
const at = (log: string[], entry: string) =>
  log.flatMap((e, i) => (e === entry ? [i] : []));

describe("copyChartAsPng — the colour fix reads every value before it writes one (WI-143)", () => {
  it("in pass 1, on the root's colour variables, and in pass 2, on the chart's own elements", async () => {
    html2canvasMock.mockResolvedValue({
      toBlob: (done: BlobCallback) => done(new Blob(["png"], { type: "image/png" })),
    });
    await copyChartAsPng(document.createElement("div"));
    const { onclone } = html2canvasMock.mock.calls[0]![1] as {
      onclone: (doc: Document, clonedEl: HTMLElement) => void;
    };

    // html2canvas's copy: a chart with one element inside it.
    const copy = document.implementation.createHTMLDocument("copy");
    const chart = copy.body.appendChild(copy.createElement("div"));
    const bar = chart.appendChild(copy.createElement("span"));

    const log: string[] = [];
    vi.spyOn(window, "getComputedStyle").mockImplementation((el) =>
      el === copy.documentElement
        ? computedStyle({ "--color-blue-500": OKLCH, "--color-gray-200": OKLCH, "--spacing": "0.25rem" }, "root", log)
        : computedStyle({ color: OKLCH, "background-color": "rgb(255, 255, 255)" }, "chart", log),
    );
    const owner = new Map<CSSStyleDeclaration, string>([
      [copy.documentElement.style, "root"],
      [chart.style, "chart"],
      [bar.style, "chart"],
    ]);
    vi.spyOn(CSSStyleDeclaration.prototype, "setProperty").mockImplementation(function (this: CSSStyleDeclaration) {
      log.push(`write ${owner.get(this) ?? "other"}`);
    });
    // The fix turns each colour into rgb through a 1×1 canvas, which jsdom lacks.
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      clearRect: () => undefined,
      fillRect: () => undefined,
      fillStyle: "",
      getImageData: () => ({ data: [59, 130, 246, 255] }),
    } as unknown as CanvasRenderingContext2D);

    onclone(copy, chart);

    for (const who of ["root", "chart"]) {
      const reads = at(log, `read ${who}`);
      const writes = at(log, `write ${who}`);
      // Two writes or more, so the order below is between real reads and real writes.
      expect(writes.length, who).toBeGreaterThanOrEqual(2);
      expect(Math.max(...reads), who).toBeLessThan(Math.min(...writes));
    }
    // Pass 2 still reads after pass 1 writes, so it sees the variables already fixed.
    expect(Math.min(...at(log, "read chart"))).toBeGreaterThan(Math.max(...at(log, "write root")));
  });
});
