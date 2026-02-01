import { describe, it, expect } from "vitest";
import { LogNormalDistribution } from "./log-normal";
import { createSeededRng } from "@infrastructure/rng";

describe("LogNormalDistribution", () => {
  it("has correct natural mean and variance", () => {
    const dist = new LogNormalDistribution(10, 3);
    expect(dist.mean()).toBe(10);
    expect(dist.variance()).toBe(9);
  });

  it("exposes log-scale parameters", () => {
    const dist = new LogNormalDistribution(10, 3);
    const params = dist.parameters();
    expect(params.naturalMean).toBe(10);
    expect(params.naturalSD).toBe(3);
    expect(params.muLog).toBeDefined();
    expect(params.sigmaLog).toBeDefined();
  });

  it("samples are always positive", () => {
    const dist = new LogNormalDistribution(5, 2);
    const rng = createSeededRng("lognormal-test");
    for (let i = 0; i < 10000; i++) {
      expect(dist.sample(rng)).toBeGreaterThan(0);
    }
  });

  it("sample mean converges to natural mean (large sample)", () => {
    const dist = new LogNormalDistribution(20, 5);
    const rng = createSeededRng("lognormal-mean-test");
    let sum = 0;
    const n = 100000;
    for (let i = 0; i < n; i++) {
      sum += dist.sample(rng);
    }
    const sampleMean = sum / n;
    // Lognormal mean convergence is slower, allow wider tolerance
    expect(sampleMean).toBeCloseTo(20, 0);
  });

  it("inverseCDF is monotonically increasing", () => {
    const dist = new LogNormalDistribution(10, 3);
    const ps = [0.01, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 0.99];
    const vals = ps.map((p) => dist.inverseCDF(p));
    for (let i = 1; i < vals.length; i++) {
      expect(vals[i]!).toBeGreaterThan(vals[i - 1]!);
    }
  });

  it("inverseCDF values are positive", () => {
    const dist = new LogNormalDistribution(10, 3);
    const ps = [0.01, 0.1, 0.5, 0.9, 0.99];
    for (const p of ps) {
      expect(dist.inverseCDF(p)).toBeGreaterThan(0);
    }
  });

  it("throws for naturalMean <= 0", () => {
    expect(() => new LogNormalDistribution(0, 3)).toThrow();
    expect(() => new LogNormalDistribution(-1, 3)).toThrow();
  });

  it("throws for negative naturalSD", () => {
    expect(() => new LogNormalDistribution(10, -1)).toThrow();
  });
});
