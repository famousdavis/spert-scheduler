// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import type { Activity, ActivityBand, Scenario } from "@domain/models/types";
import {
  addBand,
  removeBand,
  updateBand,
  reorderBands,
  reanchorBandsAfterRemovals,
} from "./band-service";

function makeActivity(id: string, name: string = id): Activity {
  return {
    id,
    name,
    min: 1,
    mostLikely: 2,
    max: 3,
    confidenceLevel: "mediumConfidence",
    distributionType: "triangular",
    status: "planned",
  };
}

function makeScenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    id: "s1",
    name: "Baseline",
    startDate: "2025-01-01",
    activities: [],
    dependencies: [],
    milestones: [],
    settings: {
      defaultConfidenceLevel: "mediumConfidence",
      defaultDistributionType: "triangular",
      trialCount: 50000,
      rngSeed: "seed",
      probabilityTarget: 0.5,
      projectProbabilityTarget: 0.95,
      heuristicEnabled: false,
      heuristicMinPercent: 75,
      heuristicMaxPercent: 200,
      dependencyMode: false,
      parkinsonsLawEnabled: true,
    },
    ...overrides,
  };
}

const b1: ActivityBand = { id: "b1", name: "Discovery", insertBeforeActivityId: "a1" };
const b2: ActivityBand = { id: "b2", name: "Build", insertBeforeActivityId: "a2", color: "#94a3b8" };
const b3: ActivityBand = { id: "b3", name: "Trailing", insertBeforeActivityId: null };

describe("addBand", () => {
  it("appends to empty bands", () => {
    const scenario = makeScenario();
    const result = addBand(scenario, b1);
    expect(result.bands).toEqual([b1]);
  });

  it("appends to existing bands (does not prepend)", () => {
    const scenario = makeScenario({ bands: [b1] });
    const result = addBand(scenario, b2);
    expect(result.bands).toEqual([b1, b2]);
  });

  it("returns a new Scenario object (input not mutated)", () => {
    const scenario = makeScenario({ bands: [b1] });
    const result = addBand(scenario, b2);
    expect(result).not.toBe(scenario);
    expect(scenario.bands).toEqual([b1]);
  });
});

describe("removeBand", () => {
  it("removes a band with matching ID", () => {
    const scenario = makeScenario({ bands: [b1, b2] });
    const result = removeBand(scenario, "b1");
    expect(result.bands).toEqual([b2]);
  });

  it("returns same reference when ID not found", () => {
    const scenario = makeScenario({ bands: [b1] });
    const result = removeBand(scenario, "missing");
    expect(result).toBe(scenario);
  });

  it("does not mutate input", () => {
    const scenario = makeScenario({ bands: [b1, b2] });
    removeBand(scenario, "b1");
    expect(scenario.bands).toEqual([b1, b2]);
  });

  it("does not affect other bands", () => {
    const scenario = makeScenario({ bands: [b1, b2, b3] });
    const result = removeBand(scenario, "b2");
    expect(result.bands).toEqual([b1, b3]);
  });
});

describe("updateBand", () => {
  it("updates name", () => {
    const scenario = makeScenario({ bands: [b1] });
    const result = updateBand(scenario, "b1", { name: "Renamed" });
    expect(result.bands?.[0]?.name).toBe("Renamed");
    expect(result.bands?.[0]?.id).toBe("b1");
  });

  it("updates color", () => {
    const scenario = makeScenario({ bands: [b1] });
    const result = updateBand(scenario, "b1", { color: "#7dd3fc" });
    expect(result.bands?.[0]?.color).toBe("#7dd3fc");
  });

  it("clears color via undefined", () => {
    const scenario = makeScenario({ bands: [b2] });
    const result = updateBand(scenario, "b2", { color: undefined });
    expect(result.bands?.[0]?.color).toBeUndefined();
  });

  it("returns same reference when ID not found", () => {
    const scenario = makeScenario({ bands: [b1] });
    const result = updateBand(scenario, "missing", { name: "x" });
    expect(result).toBe(scenario);
  });

  it("does not mutate input", () => {
    const scenario = makeScenario({ bands: [b1] });
    updateBand(scenario, "b1", { name: "Renamed" });
    expect(scenario.bands?.[0]?.name).toBe("Discovery");
  });

  it("does not affect other bands", () => {
    const scenario = makeScenario({ bands: [b1, b2] });
    const result = updateBand(scenario, "b1", { name: "Renamed" });
    expect(result.bands?.[1]).toEqual(b2);
  });
});

describe("reorderBands", () => {
  it("replaces bands with provided array", () => {
    const scenario = makeScenario({ bands: [b1, b2, b3] });
    const result = reorderBands(scenario, [b3, b1, b2]);
    expect(result.bands).toEqual([b3, b1, b2]);
  });

  it("does not mutate input", () => {
    const scenario = makeScenario({ bands: [b1, b2] });
    reorderBands(scenario, [b2, b1]);
    expect(scenario.bands).toEqual([b1, b2]);
  });
});

describe("reanchorBandsAfterRemovals", () => {
  const a1 = makeActivity("a1");
  const a2 = makeActivity("a2");
  const a3 = makeActivity("a3");
  const a4 = makeActivity("a4");

  it("re-anchors a band to the next survivor when its anchor is removed", () => {
    const original = [a1, a2, a3];
    const survivors = [a1, a3];
    const bands: ActivityBand[] = [
      { id: "bx", name: "X", insertBeforeActivityId: "a2" },
    ];
    const result = reanchorBandsAfterRemovals(bands, new Set(["a2"]), original, survivors);
    expect(result[0]?.insertBeforeActivityId).toBe("a3");
  });

  it("returns null when the removed anchor was last (no later survivor)", () => {
    const original = [a1, a2, a3];
    const survivors = [a1, a2];
    const bands: ActivityBand[] = [
      { id: "bx", name: "X", insertBeforeActivityId: "a3" },
    ];
    const result = reanchorBandsAfterRemovals(bands, new Set(["a3"]), original, survivors);
    expect(result[0]?.insertBeforeActivityId).toBeNull();
  });

  it("returns null when all activities are removed", () => {
    const original = [a1, a2];
    const survivors: Activity[] = [];
    const bands: ActivityBand[] = [
      { id: "bx", name: "X", insertBeforeActivityId: "a1" },
    ];
    const result = reanchorBandsAfterRemovals(
      bands,
      new Set(["a1", "a2"]),
      original,
      survivors,
    );
    expect(result[0]?.insertBeforeActivityId).toBeNull();
  });

  it("does not affect a band whose anchor is null", () => {
    const original = [a1, a2];
    const survivors = [a1];
    const bands: ActivityBand[] = [
      { id: "bx", name: "X", insertBeforeActivityId: null },
    ];
    const result = reanchorBandsAfterRemovals(bands, new Set(["a2"]), original, survivors);
    expect(result[0]).toBe(bands[0]);
  });

  it("does not affect a band anchored to a surviving activity", () => {
    const original = [a1, a2, a3];
    const survivors = [a1, a3];
    const bands: ActivityBand[] = [
      { id: "bx", name: "X", insertBeforeActivityId: "a3" },
    ];
    const result = reanchorBandsAfterRemovals(bands, new Set(["a2"]), original, survivors);
    expect(result[0]).toBe(bands[0]);
  });

  it("contiguous bulk removal: skips removed activities to find first survivor", () => {
    const original = [a1, a2, a3, a4];
    const survivors = [a1, a4];
    const bands: ActivityBand[] = [
      { id: "bx", name: "X", insertBeforeActivityId: "a2" },
    ];
    const result = reanchorBandsAfterRemovals(
      bands,
      new Set(["a2", "a3"]),
      original,
      survivors,
    );
    expect(result[0]?.insertBeforeActivityId).toBe("a4");
  });

  it("returns a new array; does not mutate input", () => {
    const original = [a1, a2];
    const survivors = [a1];
    const bands: ActivityBand[] = [
      { id: "bx", name: "X", insertBeforeActivityId: "a2" },
    ];
    const before = JSON.stringify(bands);
    const result = reanchorBandsAfterRemovals(bands, new Set(["a2"]), original, survivors);
    expect(JSON.stringify(bands)).toBe(before);
    expect(result).not.toBe(bands);
  });
});
