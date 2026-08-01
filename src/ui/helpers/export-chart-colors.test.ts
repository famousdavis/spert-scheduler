// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";

import {
  hasUnsupportedColorFunction,
  formatPixelColor,
} from "./export-chart-colors";

/**
 * `export-chart.ts` was one of three files heading for "browser-only, untestable" in the
 * §3.2 record. It isn't: these two decisions were pure logic buried in the Canvas work,
 * and the edge cases below are the kind nobody thinks about until a chart copies wrong.
 *
 * What stays untestable under jsdom is only the shell — html2canvas, the DOM walk, and
 * the clipboard write.
 */

describe("hasUnsupportedColorFunction", () => {
  it("detects the three functions html2canvas 1.4.1 cannot parse", () => {
    expect(hasUnsupportedColorFunction("oklch(0.7 0.1 250)")).toBe(true);
    expect(hasUnsupportedColorFunction("oklab(0.5 0.1 -0.1)")).toBe(true);
    expect(
      hasUnsupportedColorFunction("color-mix(in oklab, var(--color-gray-50) 50%, transparent)"),
    ).toBe(true);
  });

  it("detects them mid-value, not only at the start", () => {
    // Shorthand properties carry several values; the bad one can be anywhere.
    expect(hasUnsupportedColorFunction("1px solid oklch(0.7 0.1 250)")).toBe(true);
    expect(
      hasUnsupportedColorFunction("linear-gradient(to right, #fff, oklab(0.5 0.1 -0.1))"),
    ).toBe(true);
  });

  it("leaves colour formats html2canvas already understands alone", () => {
    for (const val of [
      "rgb(255, 0, 0)",
      "rgba(255, 0, 0, 0.5)",
      "#ff0000",
      "hsl(120, 50%, 50%)",
      "transparent",
      "currentColor",
      "none",
      "",
    ]) {
      expect(hasUnsupportedColorFunction(val), val).toBe(false);
    }
  });

  it("requires the function CALL, not just the word", () => {
    // The trailing `\(` is load-bearing: a custom property merely NAMED after a colour
    // space must not be pointlessly routed through the canvas.
    expect(hasUnsupportedColorFunction("var(--oklch-brand)")).toBe(false);
    expect(hasUnsupportedColorFunction("oklch")).toBe(false);
    expect(hasUnsupportedColorFunction("my-oklab-token")).toBe(false);
  });

  it("does not match a longer word ending in one of the names", () => {
    // The leading `\b` is the other half of the pair.
    expect(hasUnsupportedColorFunction("notoklch(0.7 0.1 250)")).toBe(false);
  });

  it("returns the same answer for the same input, repeatedly", () => {
    // ⚠️ Guards the `g`-flag trap. A global regex carries `lastIndex` between `.test()`
    // calls, so a shared module-level instance would alternate true/false on identical
    // input — and this runs once per CSS property on every element in the tree, so the
    // failure would be silent and roughly half the colours would go unresolved.
    const val = "oklch(0.7 0.1 250)";
    for (let i = 0; i < 5; i++) {
      expect(hasUnsupportedColorFunction(val), `call ${i + 1}`).toBe(true);
    }
  });
});

describe("formatPixelColor", () => {
  it("emits rgb() when the pixel is fully opaque", () => {
    // Not rgba(...,1.000): an unnecessary alpha channel changes how html2canvas
    // composites the layer.
    expect(formatPixelColor(255, 0, 0, 255)).toBe("rgb(255,0,0)");
    expect(formatPixelColor(18, 52, 86, 255)).toBe("rgb(18,52,86)");
  });

  it("emits rgba() as soon as the pixel is even slightly transparent", () => {
    expect(formatPixelColor(255, 0, 0, 254)).toBe("rgba(255,0,0,0.996)");
  });

  it("converts the alpha byte to a 0-1 fraction at three decimals", () => {
    expect(formatPixelColor(0, 0, 0, 128)).toBe("rgba(0,0,0,0.502)");
    expect(formatPixelColor(0, 0, 0, 64)).toBe("rgba(0,0,0,0.251)");
  });

  it("handles a fully transparent pixel", () => {
    expect(formatPixelColor(0, 0, 0, 0)).toBe("rgba(0,0,0,0.000)");
  });

  it("switches format at exactly 255, not 254", () => {
    // The boundary the `a < 255` comparison turns on.
    expect(formatPixelColor(10, 20, 30, 255)).toBe("rgb(10,20,30)");
    expect(formatPixelColor(10, 20, 30, 254)).toContain("rgba(");
  });

  it("preserves channel values verbatim, including zero", () => {
    expect(formatPixelColor(0, 255, 0, 255)).toBe("rgb(0,255,0)");
  });
});
