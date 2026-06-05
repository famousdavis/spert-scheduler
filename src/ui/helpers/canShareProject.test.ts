// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import { canShareProject } from "./canShareProject";

describe("canShareProject", () => {
  it("returns true for a signed-in owner in cloud mode", () => {
    expect(canShareProject("cloud", "u1", "u1")).toBe(true);
  });

  it("returns false in local mode even when the user owns the project", () => {
    expect(canShareProject("local", "u1", "u1")).toBe(false);
  });

  it("returns false when no user is signed in", () => {
    expect(canShareProject("cloud", null, "u1")).toBe(false);
    expect(canShareProject("cloud", undefined, "u1")).toBe(false);
  });

  it("returns false for a legacy project with a null owner", () => {
    expect(canShareProject("cloud", "u1", null)).toBe(false);
  });

  it("returns false when the user is not the owner (shared-with-me)", () => {
    expect(canShareProject("cloud", "u1", "u2")).toBe(false);
  });
});
