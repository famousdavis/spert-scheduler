// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import {
  TruncatedDistribution,
  DegenerateDistribution,
  isBreach,
  buildMcDistribution,
  UNBOUNDED_BREACH_THRESHOLD,
} from "./truncated";
import { UniformDistribution } from "./uniform";
import { TriangularDistribution } from "./triangular";
import { NormalDistribution } from "./normal";
import { createSeededRng } from "@infrastructure/rng";
import type { Activity } from "@domain/models/types";

function makeActivity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: "a1",
    name: "Task",
    min: 3,
    mostLikely: 5,
    max: 10,
    confidenceLevel: "mediumConfidence",
    distributionType: "triangular",
    status: "planned",
    ...overrides,
  };
}

describe("TruncatedDistribution", () => {
  it("Uniform oracle: E[X|X>t] = (t+b)/2 (sharpest closed-form oracle)", () => {
    const a = 0;
    const b = 100;
    const t = 40;
    const base = new UniformDistribution(a, b);
    const trunc = new TruncatedDistribution(base, base.cdf(t), t);
    const rng = createSeededRng("uniform-oracle");
    // 1M samples: standard error of the mean ~ 0.017, so a 0.1 absolute tolerance is
    // ~6 SE of sampling noise yet still catches any real bias (~0.14% of the oracle).
    const N = 1000000;
    let sum = 0;
    for (let i = 0; i < N; i++) sum += trunc.sample(rng);
    const mean = sum / N;
    const oracle = (t + b) / 2; // 70
    expect(Math.abs(mean - oracle)).toBeLessThan(0.1);
  });

  it("invariant 1: every sample >= actualT (Triangular)", () => {
    const base = new TriangularDistribution(2, 5, 12);
    const t = 7;
    const trunc = new TruncatedDistribution(base, base.cdf(t), t);
    const rng = createSeededRng("inv1-tri");
    for (let i = 0; i < 1000; i++) {
      expect(trunc.sample(rng)).toBeGreaterThanOrEqual(t);
    }
  });

  it("invariant 1: every sample >= actualT (Normal, unbounded left tail)", () => {
    const base = new NormalDistribution(10, 4);
    const t = 11;
    const trunc = new TruncatedDistribution(base, base.cdf(t), t);
    const rng = createSeededRng("inv1-normal");
    for (let i = 0; i < 1000; i++) {
      expect(trunc.sample(rng)).toBeGreaterThanOrEqual(t);
    }
  });

  it("inverseCDF(0) >= t and inverseCDF(1) does not throw (clamped at 1 - EPSILON)", () => {
    const base = new NormalDistribution(10, 4);
    const t = 11;
    const trunc = new TruncatedDistribution(base, base.cdf(t), t);
    expect(trunc.inverseCDF(0)).toBeGreaterThanOrEqual(t);
    expect(() => trunc.inverseCDF(1)).not.toThrow();
    expect(Number.isFinite(trunc.inverseCDF(1))).toBe(true);
  });

  it("cdf: 0 at/below t, rescales above", () => {
    const base = new UniformDistribution(0, 100);
    const t = 40;
    const trunc = new TruncatedDistribution(base, base.cdf(t), t);
    expect(trunc.cdf(40)).toBe(0); // at t
    expect(trunc.cdf(30)).toBe(0); // below t
    expect(trunc.cdf(70)).toBeCloseTo(0.5, 10); // midpoint of [40, 100]
    expect(trunc.cdf(100)).toBeCloseTo(1, 10);
  });

  it("mean/variance/parameters throw (no production consumers; see file-header note)", () => {
    const trunc = new TruncatedDistribution(new UniformDistribution(0, 100), 0.4, 40);
    expect(() => trunc.mean()).toThrow(/not implemented/);
    expect(() => trunc.variance()).toThrow(/not implemented/);
    expect(() => trunc.parameters()).toThrow(/not implemented/);
  });
});

describe("DegenerateDistribution", () => {
  it("sample always returns t (ignores rng)", () => {
    const d = new DegenerateDistribution(7);
    const rng = createSeededRng("degen");
    for (let i = 0; i < 100; i++) expect(d.sample(rng)).toBe(7);
  });

  it("cdf is a step at t; inverseCDF is constant t", () => {
    const d = new DegenerateDistribution(7);
    expect(d.cdf(6.999)).toBe(0);
    expect(d.cdf(7)).toBe(1);
    expect(d.inverseCDF(0)).toBe(7);
    expect(d.inverseCDF(0.5)).toBe(7);
    expect(d.inverseCDF(1)).toBe(7);
  });

  it("mean = t, variance = 0, parameters = { t }", () => {
    const d = new DegenerateDistribution(7);
    expect(d.mean()).toBe(7);
    expect(d.variance()).toBe(0);
    expect(d.parameters()).toEqual({ t: 7 });
  });
});

describe("isBreach (boundary mutants must die here)", () => {
  it("bounded types (Triangular, Uniform) breach at p0 >= 1.0 exactly", () => {
    // At exactly 1.0 the predicate is true; a `> 1.0` mutant returns false → killed.
    expect(isBreach("triangular", 1.0)).toBe(true);
    expect(isBreach("uniform", 1.0)).toBe(true);
    expect(isBreach("triangular", 0.9999999)).toBe(false);
    expect(isBreach("uniform", 0.9999999)).toBe(false);
  });

  it("unbounded types (Normal, LogNormal) breach at the model-honesty threshold", () => {
    // At exactly the threshold the predicate is true; a `> THRESHOLD` mutant → killed.
    expect(isBreach("normal", UNBOUNDED_BREACH_THRESHOLD)).toBe(true);
    expect(isBreach("logNormal", UNBOUNDED_BREACH_THRESHOLD)).toBe(true);
    expect(isBreach("normal", 0.9998)).toBe(false);
    expect(isBreach("logNormal", 0.9998)).toBe(false);
  });
});

describe("buildMcDistribution", () => {
  it("planned activity → base distribution unchanged (no wrapper)", () => {
    const base = new TriangularDistribution(2, 5, 12);
    const { dist, isExhausted } = buildMcDistribution(makeActivity({ status: "planned" }), base);
    expect(dist).toBe(base);
    expect(isExhausted).toBe(false);
  });

  it("inProgress with actualDuration == null → base (explicit guard)", () => {
    const base = new TriangularDistribution(2, 5, 12);
    const activity = makeActivity({ status: "inProgress", actualDuration: undefined });
    const { dist, isExhausted } = buildMcDistribution(activity, base);
    expect(dist).toBe(base);
    expect(isExhausted).toBe(false);
  });

  it("invariant 2 (structural): bounded type with t <= min → base, NOT a wrapper", () => {
    const base = new TriangularDistribution(5, 8, 12); // min = 5
    const activity = makeActivity({
      status: "inProgress",
      actualDuration: 5,
      distributionType: "triangular",
    });
    const { dist, isExhausted } = buildMcDistribution(activity, base);
    expect(dist instanceof TruncatedDistribution).toBe(false);
    expect(dist instanceof DegenerateDistribution).toBe(false);
    expect(dist).toBe(base);
    expect(isExhausted).toBe(false);
  });

  it("inProgress mid-range → TruncatedDistribution", () => {
    const base = new TriangularDistribution(2, 5, 12);
    const activity = makeActivity({
      status: "inProgress",
      actualDuration: 7,
      distributionType: "triangular",
    });
    const { dist, isExhausted } = buildMcDistribution(activity, base);
    expect(dist instanceof TruncatedDistribution).toBe(true);
    expect(isExhausted).toBe(false);
  });

  it("breach: Triangular with t >= max → DegenerateDistribution + isExhausted", () => {
    const base = new TriangularDistribution(2, 5, 12);
    const activity = makeActivity({
      status: "inProgress",
      actualDuration: 12,
      distributionType: "triangular",
    });
    const { dist, isExhausted } = buildMcDistribution(activity, base);
    expect(dist instanceof DegenerateDistribution).toBe(true);
    expect(isExhausted).toBe(true);
  });

  it("breach: Triangular overran past max (t > max, cdf clamps to 1) → Degenerate", () => {
    const base = new TriangularDistribution(2, 5, 12);
    const activity = makeActivity({
      status: "inProgress",
      actualDuration: 20,
      distributionType: "triangular",
    });
    const { dist, isExhausted } = buildMcDistribution(activity, base);
    expect(dist instanceof DegenerateDistribution).toBe(true);
    expect(isExhausted).toBe(true);
  });

  it("Normal with p0 >= 0.9999 → breach; p0 = 0.9998-ish → TruncatedDistribution", () => {
    const base = new NormalDistribution(10, 1);
    // t = 14 → z = 4 → cdf ~ 0.99997 >= 0.9999 → breach
    const breached = buildMcDistribution(
      makeActivity({ status: "inProgress", actualDuration: 14, distributionType: "normal" }),
      base,
    );
    expect(breached.isExhausted).toBe(true);
    expect(breached.dist instanceof DegenerateDistribution).toBe(true);

    // t = 13 → z = 3 → cdf ~ 0.99865 < 0.9999 → truncated (not breach)
    const truncated = buildMcDistribution(
      makeActivity({ status: "inProgress", actualDuration: 13, distributionType: "normal" }),
      base,
    );
    expect(truncated.isExhausted).toBe(false);
    expect(truncated.dist instanceof TruncatedDistribution).toBe(true);
  });

  it("invariant 3 (de-biasing): E[max(floor, X|X>t)] >= E[max(floor, X)] (Triangular, t=0.7*max)", () => {
    const base = new TriangularDistribution(0, 5, 10);
    const t = 7; // 0.7 * max
    const floor = 4;
    const { dist: trunc } = buildMcDistribution(
      makeActivity({ status: "inProgress", actualDuration: t, distributionType: "triangular" }),
      base,
    );
    const rngT = createSeededRng("debias-trunc");
    const rngB = createSeededRng("debias-base");
    const N = 100000;
    let sumT = 0;
    let sumB = 0;
    for (let i = 0; i < N; i++) {
      sumT += Math.max(floor, trunc.sample(rngT));
      sumB += Math.max(floor, base.sample(rngB));
    }
    expect(sumT / N).toBeGreaterThan(sumB / N);
  });
});
