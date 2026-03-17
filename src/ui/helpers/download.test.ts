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

  it("handles empty string", () => {
    expect(sanitizeFilename("")).toBe("");
  });

  it("handles string with only invalid characters", () => {
    expect(sanitizeFilename('*?"<>|')).toBe("______");
  });
});
