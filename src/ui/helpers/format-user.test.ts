// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import { getFirstName } from "./format-user";

describe("getFirstName", () => {
  it("extracts the first token from a Google-style displayName", () => {
    expect(getFirstName("Alice Smith", "alice@example.com")).toBe("Alice");
  });

  it("reverses Microsoft-style 'Last, First' displayNames", () => {
    expect(getFirstName("Smith, Alice", "alice@example.com")).toBe("Alice");
  });

  it("takes only the first token from 'Last, First Middle'", () => {
    expect(getFirstName("Smith, Alice Jane", "alice@example.com")).toBe(
      "Alice"
    );
  });

  it("handles single-name displayName", () => {
    expect(getFirstName("Cher", "cher@example.com")).toBe("Cher");
  });

  it("falls back to email when displayName is null", () => {
    expect(getFirstName(null, "alice@example.com")).toBe("alice@example.com");
  });

  it("falls back to email when displayName is undefined", () => {
    expect(getFirstName(undefined, "alice@example.com")).toBe(
      "alice@example.com"
    );
  });

  it("falls back to email when displayName is an empty string", () => {
    expect(getFirstName("", "alice@example.com")).toBe("alice@example.com");
  });

  it("returns empty string when both displayName and email are absent", () => {
    expect(getFirstName(null, null)).toBe("");
    expect(getFirstName(undefined, undefined)).toBe("");
    expect(getFirstName("", "")).toBe("");
  });

  it("trims extra whitespace around names", () => {
    expect(getFirstName("   Alice Smith   ", null)).toBe("Alice");
    expect(getFirstName("Smith,   Alice", null)).toBe("Alice");
  });

  it("falls back to email for malformed 'Last,' with nothing after the comma", () => {
    expect(getFirstName("Smith,", "alice@example.com")).toBe(
      "alice@example.com"
    );
    expect(getFirstName("Smith,   ", "alice@example.com")).toBe(
      "alice@example.com"
    );
  });
});
