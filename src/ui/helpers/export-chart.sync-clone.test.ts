// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, vi, afterEach } from "vitest";
import html2canvas from "html2canvas";

/**
 * The light Gantt copy (WI-26) rests on one property of html2canvas, pinned here with the REAL
 * library: it takes its copy of the page INSIDE its call, before the call returns — the elements,
 * and the computed style it writes into each SVG copy — so nothing the page does after the call
 * reaches the copy.
 *
 * `copyChartAsPng` redraws the chart light just before calling html2canvas and back as soon as the
 * call returns. A version that took its copy later — after an await — or that copied an SVG
 * element's style later, from the page, would copy the chart dark again, and the light-copy tests
 * would not notice: they mock html2canvas.
 *
 * Read in 1.4.1's source: the whole document is cloned, node by node, in the DocumentCloner
 * constructor (dist/html2canvas.js:7752), before renderElement's first yield (:7757). jsdom cannot
 * finish the render; only the clone matters here.
 */
describe("html2canvas copies the page inside its call — the light Gantt copy depends on it", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  function target(): { el: HTMLElement; rect: Element } {
    const el = document.createElement("div");
    // A colour on the rect both ways the chart sets one: an attribute, and a style.
    el.innerHTML =
      '<svg width="10" height="10"><rect width="10" height="10" fill="#111111" style="fill: #222222"></rect></svg>';
    document.body.appendChild(el);
    return { el, rect: el.querySelector("rect")! };
  }

  it("has copied the chart's SVG, colours and all, by the time html2canvas returns — a later change does not reach the copy", async () => {
    const { el, rect } = target();
    const spy = vi.spyOn(Node.prototype, "cloneNode");
    const pending = html2canvas(el, { logging: false });
    // The copy redraws the chart dark the moment html2canvas returns; do the same to the rect.
    rect.setAttribute("fill", "#aaaaaa");
    (rect as SVGElement).style.setProperty("fill", "#bbbbbb");
    const at = spy.mock.contexts.indexOf(rect);
    const copy = at >= 0 ? (spy.mock.results[at]!.value as SVGElement) : null;
    spy.mockRestore();
    await pending.catch(() => undefined);
    expect(copy).not.toBeNull();
    // html2canvas's copy holds the colours the rect had AT the call: its attribute...
    expect(copy!.getAttribute("fill")).toBe("#111111");
    // ...and the computed style html2canvas writes into an SVG copy, taken then, not later.
    expect(copy!.style.getPropertyValue("fill")).toMatch(/^(#222222|rgb\(34, 34, 34\))$/);
  });

  it("control: a copy taken after an await has cloned nothing by the time the call returns", async () => {
    const { el } = target();
    const spy = vi.spyOn(Node.prototype, "cloneNode");
    const later = async (n: Element) => {
      await Promise.resolve();
      return n.cloneNode(true);
    };
    const pending = later(el);
    const clonedBeforeReturn = spy.mock.contexts.includes(el);
    await pending;
    const clonedAfterAwait = spy.mock.contexts.includes(el);
    spy.mockRestore();
    expect(clonedBeforeReturn).toBe(false);
    // ...and the same spy does see the clone once it happens, so a false above is not blindness.
    expect(clonedAfterAwait).toBe(true);
  });
});
