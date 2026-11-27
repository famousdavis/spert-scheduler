// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import { SAMPLE_PROJECT_NAME, sampleProjectName } from "./sample-project-meta";

/**
 * v0.89.0 (FRAME26 clean-up L; contract §7, "Load Sample"): a loaded sample is named "Sample: Cloud ERP Solution", or,
 * when a project already has that exact name, the lowest free "(2)", "(3)", …. The store passes every project's name,
 * archived ones included (`use-project-store.load-sample.test.ts` holds that end).
 */
const BASE = "Sample: Cloud ERP Solution";

describe("sampleProjectName", () => {
  it("the name is 'Sample: ' and the sample's own name", () => {
    expect(SAMPLE_PROJECT_NAME).toBe(BASE);
  });

  it("no projects: the base", () => {
    expect(sampleProjectName([])).toBe(BASE);
  });

  it("the base taken: (2)", () => {
    expect(sampleProjectName([BASE])).toBe(`${BASE} (2)`);
  });

  it("the base and (2) taken: (3)", () => {
    expect(sampleProjectName([BASE, `${BASE} (2)`])).toBe(`${BASE} (3)`);
  });

  it("(2) taken but the base free: the base wins", () => {
    expect(sampleProjectName([`${BASE} (2)`])).toBe(BASE);
  });

  it("the lowest free number wins: the base, (2) and (4) taken gives (3)", () => {
    expect(sampleProjectName([BASE, `${BASE} (2)`, `${BASE} (4)`])).toBe(`${BASE} (3)`);
  });

  it("a user's own project named like the sample takes the name: (2)", () => {
    expect(sampleProjectName(["Heart of Gold", BASE])).toBe(`${BASE} (2)`);
  });

  it("only an exact name is taken: a clone, a near-miss and the old name leave the base free", () => {
    expect(
      sampleProjectName([`${BASE} (Copy)`, "sample: cloud erp solution", `${BASE} `, "Cloud ERP Solution (Sample)"]),
    ).toBe(BASE);
  });

  it("a user's (3) with the base and (2) taken: (4)", () => {
    expect(sampleProjectName([BASE, `${BASE} (2)`, `${BASE} (3)`])).toBe(`${BASE} (4)`);
  });
});
