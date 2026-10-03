// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";

// html2canvas cannot run under jsdom. The mock records what copyChartAsPng hands it, so the test
// can ask its `ignoreElements` about elements it controls.
const { html2canvasMock } = vi.hoisted(() => ({ html2canvasMock: vi.fn() }));
vi.mock("html2canvas", () => ({ default: html2canvasMock }));

import { copyChartAsPng } from "./export-chart";

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

/** Run copyChartAsPng and return the `ignoreElements` it handed html2canvas. */
async function takeIgnoreElements(): Promise<(el: Element) => boolean> {
  const live = document.createElement("div");
  await copyChartAsPng(live);
  expect(html2canvasMock).toHaveBeenCalledTimes(1);
  const [target, options] = html2canvasMock.mock.calls[0]!;
  expect(target).toBe(live);
  return options.ignoreElements;
}

describe("copyChartAsPng — what the picture leaves out", () => {
  it("an element carrying data-capture-skip, as it leaves out a copy button; never a plain element", async () => {
    const ignoreElements = await takeIgnoreElements();

    const row = document.createElement("tr");
    row.setAttribute("data-capture-skip", "");
    const button = document.createElement("button");
    button.className = "copy-image-button bg-transparent";
    const plain = document.createElement("td");
    plain.className = "px-4 py-1.5 text-right";

    expect(ignoreElements(row)).toBe(true);
    expect(ignoreElements(button)).toBe(true); // the existing rule, as the control
    expect(ignoreElements(plain)).toBe(false);
  });
});
