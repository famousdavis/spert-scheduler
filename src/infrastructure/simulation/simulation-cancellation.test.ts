// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach } from "vitest";
import {
  currentSimulationGeneration,
  bumpSimulationGeneration,
  _resetSimulationGenerationForTests,
} from "./simulation-cancellation";

describe("simulation-cancellation (v0.42.6 M2)", () => {
  beforeEach(() => {
    _resetSimulationGenerationForTests();
  });

  it("starts at zero", () => {
    expect(currentSimulationGeneration()).toBe(0);
  });

  it("increments on bump", () => {
    bumpSimulationGeneration();
    expect(currentSimulationGeneration()).toBe(1);
    bumpSimulationGeneration();
    expect(currentSimulationGeneration()).toBe(2);
  });

  it("captured-vs-current comparison detects an in-flight bump (the cancellation pattern)", () => {
    // Simulate the pattern used by useAutoRunSimulation and ProjectPage:
    // capture generation at dispatch, compare at result-time.
    const startGen = currentSimulationGeneration();
    expect(startGen === currentSimulationGeneration()).toBe(true); // no bump yet

    bumpSimulationGeneration(); // sign-out fires while worker is in flight

    expect(startGen === currentSimulationGeneration()).toBe(false);
  });

  it("multiple in-flight simulations are all invalidated by a single bump", () => {
    const g1 = currentSimulationGeneration();
    const g2 = currentSimulationGeneration();
    const g3 = currentSimulationGeneration();
    expect(g1).toBe(g2);
    expect(g2).toBe(g3);

    bumpSimulationGeneration();

    expect(currentSimulationGeneration() !== g1).toBe(true);
    expect(currentSimulationGeneration() !== g2).toBe(true);
    expect(currentSimulationGeneration() !== g3).toBe(true);
  });

  it("a fresh capture after bump matches the new generation (next user's simulation works)", () => {
    bumpSimulationGeneration(); // sign-out
    const newUserStart = currentSimulationGeneration();
    expect(newUserStart === currentSimulationGeneration()).toBe(true);
  });
});
