import { describe, it, expect } from "vitest";
import { createSeededRng } from "./seeded-rng";

describe("SeededRng", () => {
  it("produces values in [0, 1)", () => {
    const rng = createSeededRng("test-seed");
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("is deterministic with the same seed", () => {
    const rng1 = createSeededRng("abc-123");
    const rng2 = createSeededRng("abc-123");
    for (let i = 0; i < 100; i++) {
      expect(rng1.next()).toBe(rng2.next());
    }
  });

  it("produces different sequences for different seeds", () => {
    const rng1 = createSeededRng("seed-A");
    const rng2 = createSeededRng("seed-B");
    // Collect first 10 values from each
    const vals1 = Array.from({ length: 10 }, () => rng1.next());
    const vals2 = Array.from({ length: 10 }, () => rng2.next());
    // At least some values should differ
    const allSame = vals1.every((v, i) => v === vals2[i]);
    expect(allSame).toBe(false);
  });
});
