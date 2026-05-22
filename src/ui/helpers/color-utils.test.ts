// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import { hexToRgb, hexToTintedBackground } from "./color-utils";

describe("hexToRgb", () => {
  it("parses a 6-digit hex with leading #", () => {
    expect(hexToRgb("#94a3b8")).toEqual({ r: 148, g: 163, b: 184 });
  });

  it("parses a 6-digit hex without leading #", () => {
    expect(hexToRgb("94a3b8")).toEqual({ r: 148, g: 163, b: 184 });
  });

  it("is case-insensitive", () => {
    expect(hexToRgb("#FFFFFF")).toEqual({ r: 255, g: 255, b: 255 });
    expect(hexToRgb("#ffffff")).toEqual({ r: 255, g: 255, b: 255 });
  });

  it("trims whitespace", () => {
    expect(hexToRgb("  #000000  ")).toEqual({ r: 0, g: 0, b: 0 });
  });

  it("returns null for 3-digit shorthand", () => {
    expect(hexToRgb("#abc")).toBeNull();
  });

  it("returns null for 8-digit alpha hex", () => {
    expect(hexToRgb("#94a3b8ff")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(hexToRgb("")).toBeNull();
  });

  it("returns null for non-hex characters", () => {
    expect(hexToRgb("#gggggg")).toBeNull();
  });

  it("returns null for named colors", () => {
    expect(hexToRgb("red")).toBeNull();
  });
});

describe("hexToTintedBackground", () => {
  it("produces an rgba string with the default alpha", () => {
    expect(hexToTintedBackground("#94a3b8")).toBe("rgba(148, 163, 184, 0.18)");
  });

  it("honors a custom alpha", () => {
    expect(hexToTintedBackground("#94a3b8", 0.3)).toBe(
      "rgba(148, 163, 184, 0.3)",
    );
  });

  it("returns null when hex is invalid", () => {
    expect(hexToTintedBackground("not-a-color")).toBeNull();
  });

  it("returns null for shorthand hex", () => {
    expect(hexToTintedBackground("#abc")).toBeNull();
  });
});
