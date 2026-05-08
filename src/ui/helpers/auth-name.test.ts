// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import { denormalizeLastFirst } from "./auth-name";
import { getDisplayName } from "./format-user";

describe("denormalizeLastFirst", () => {
  it("passthrough for natural-order names", () => {
    expect(denormalizeLastFirst("Alice Smith")).toBe("Alice Smith");
  });

  it("reverses comma-form Last, First", () => {
    expect(denormalizeLastFirst("Smith, Alice")).toBe("Alice Smith");
  });

  it("reverses comma-form Last, First Middle", () => {
    expect(denormalizeLastFirst("Smith, Alice Jane")).toBe("Alice Jane Smith");
  });

  it("ignores stray empty parts (e.g. 'Smith, , Alice')", () => {
    // Empty parts after trimming are filtered, so this still detects 2 parts
    // and reverses them.
    expect(denormalizeLastFirst("Smith, , Alice")).toBe("Alice Smith");
  });

  it("trims whitespace on input with no comma", () => {
    expect(denormalizeLastFirst("  Alice Smith  ")).toBe("Alice Smith");
  });

  it("returns empty string on empty input", () => {
    expect(denormalizeLastFirst("")).toBe("");
  });
});

describe("getDisplayName", () => {
  it("delegates to denormalizeLastFirst for comma-form names", () => {
    expect(getDisplayName("Smith, Alice", "alice@example.com")).toBe(
      "Alice Smith"
    );
  });

  it("returns trimmed displayName for natural-order names", () => {
    expect(getDisplayName("Alice Smith", null)).toBe("Alice Smith");
  });

  it("falls back to email when displayName is empty/whitespace", () => {
    expect(getDisplayName("", "alice@example.com")).toBe("alice@example.com");
    expect(getDisplayName("   ", "alice@example.com")).toBe(
      "alice@example.com"
    );
  });

  it("returns empty string when both displayName and email are absent", () => {
    expect(getDisplayName(null, null)).toBe("");
    expect(getDisplayName(undefined, undefined)).toBe("");
  });
});
