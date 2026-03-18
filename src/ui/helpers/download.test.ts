// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import { sanitizeFilename } from "./download";

describe("sanitizeFilename", () => {
  it("passes through clean names unchanged", () => {
    expect(sanitizeFilename("My Project")).toBe("My Project");
  });

  it("replaces forward and back slashes", () => {
    expect(sanitizeFilename("A/B\\C")).toBe("A_B_C");
  });

  it("replaces Windows-invalid characters", () => {
    expect(sanitizeFilename('file*name?"<>|test')).toBe("file_name_____test");
  });

  it("replaces colons", () => {
    expect(sanitizeFilename("Project: Phase 1")).toBe("Project_ Phase 1");
  });

  it("returns Untitled for empty string", () => {
    expect(sanitizeFilename("")).toBe("Untitled");
  });

  it("replaces all invalid characters with underscores", () => {
    expect(sanitizeFilename('*?"<>|')).toBe("______");
  });

  it("returns Untitled for whitespace-only string", () => {
    expect(sanitizeFilename("   ")).toBe("Untitled");
  });

  it("truncates to 200 characters", () => {
    const long = "A".repeat(250);
    expect(sanitizeFilename(long)).toBe("A".repeat(200));
  });

  it("does not truncate names at exactly 200 characters", () => {
    const exact = "B".repeat(200);
    expect(sanitizeFilename(exact)).toBe(exact);
  });
});
