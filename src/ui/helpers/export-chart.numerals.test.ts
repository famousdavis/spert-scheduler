// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";

// html2canvas cannot run under jsdom (it cannot draw a canvas). The mock records what
// copyChartAsPng hands it, so a test can run the `onclone` callback itself.
const { html2canvasMock } = vi.hoisted(() => ({ html2canvasMock: vi.fn() }));
vi.mock("html2canvas", () => ({ default: html2canvasMock }));

import { copyChartAsPng, setProportionalNumerals } from "./export-chart";

/**
 * WI-62: a copied comparison table showed "10 /05/2026". html2canvas measures text where the
 * page's `tabular-nums` makes each digit as wide as a 0, and draws it on a canvas that uses
 * proportional digits, so a gap opens after a narrow "1". The fix makes the CLONE's numerals
 * proportional. jsdom cannot draw, so these tests pin the clone-side step itself; the copied
 * PNGs, before and after, are the real check (in the PR).
 *
 * jsdom resolves `font-variant-numeric` through the cascade and inherits it, so the class
 * rule below behaves as Tailwind's does in the page.
 */
let sheet: HTMLStyleElement;

function table(): { td: HTMLTableCellElement; span: HTMLSpanElement; label: HTMLTableCellElement; root: HTMLDivElement } {
  const root = document.createElement("div");
  root.innerHTML =
    '<table><tbody><tr><td class="label">Start Date</td><td class="tabular-nums"><span>10/05/2026</span></td></tr></tbody></table>';
  document.body.appendChild(root);
  return {
    root,
    label: root.querySelector("td.label")!,
    td: root.querySelector("td.tabular-nums")!,
    span: root.querySelector("span")!,
  };
}

const numerals = (el: Element) => getComputedStyle(el).fontVariantNumeric;

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
  sheet = document.createElement("style");
  sheet.textContent = ".tabular-nums { font-variant-numeric: tabular-nums; }";
  document.head.appendChild(sheet);
  html2canvasMock.mockReset();
  html2canvasMock.mockResolvedValue({
    toBlob: (done: BlobCallback) => done(new Blob(["png"], { type: "image/png" })),
  });
  // onclone also neutralises colours through a Canvas2D context, which jsdom lacks; it is
  // only dereferenced for colour values jsdom never computes, so null is enough here.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

afterEach(() => {
  sheet.remove();
  document.body.innerHTML = "";
});

describe("setProportionalNumerals", () => {
  it("turns a tabular-nums cell proportional, with its text, and leaves a normal element alone", () => {
    const { root, td, span, label } = table();
    // The control, same test: before the step the cell and its text really are tabular.
    expect(numerals(td)).toBe("tabular-nums");
    expect(numerals(span)).toBe("tabular-nums");

    setProportionalNumerals(root);

    expect(numerals(td)).toBe("normal");
    expect(numerals(span)).toBe("normal"); // inherited, not written
    expect(span.getAttribute("style")).toBeNull();
    expect(label.getAttribute("style")).toBeNull(); // already normal: untouched
    expect(root.getAttribute("style")).toBeNull();
  });
});

describe("copyChartAsPng", () => {
  it("makes html2canvas's clone proportional, and never the live element", async () => {
    const live = table();
    await copyChartAsPng(live.root);
    expect(html2canvasMock).toHaveBeenCalledTimes(1);
    const [target, options] = html2canvasMock.mock.calls[0]!;
    expect(target).toBe(live.root);

    const clone = table();
    expect(numerals(clone.td)).toBe("tabular-nums"); // the control: the clone starts tabular
    options.onclone(document, clone.root);

    expect(numerals(clone.td)).toBe("normal");
    expect(numerals(clone.span)).toBe("normal");
    // The page keeps its tabular digits.
    expect(numerals(live.td)).toBe("tabular-nums");
    expect(live.td.getAttribute("style")).toBeNull();
  });
});
