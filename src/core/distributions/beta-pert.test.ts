// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  BetaPertDistribution,
  BETA_PERT_SHAPE,
  betaPertShape,
  solveBetaPertLambda,
  symmetricBetaSpread,
} from "./beta-pert";
import { RSM_LEVELS } from "@domain/models/types";
import type { RSMLevel } from "@domain/models/types";
import { createSeededRng } from "@infrastructure/rng";
import type { SeededRng } from "@infrastructure/rng";

/**
 * ⚠️ INDEPENDENT EXPRESSION. Every expected number below was computed OUTSIDE this code base, at 60
 * significant digits with Python's standard `decimal` module — ln Γ by Stirling's series, the
 * incomplete beta by its power series, the quantile and λ by bisection — a method that shares nothing
 * with `beta-pert.ts`. A second, separately written reference agrees with every value to 4 decimals.
 * Paste new values; never compute an expected value here by calling the implementation.
 *
 * Columns: estimate, min, most likely, max, level, α, β, P5, P50, P95, and the default-target
 * schedule ⌈P50⌉ (`deterministic.ts`).
 */
type Row = [string, number, number, number, RSMLevel, number, number, number, number, number, number];
const REFERENCE: Row[] = [
  ["E1", 10, 20, 30, "nearCertainty", 25.000000000000, 25.000000000000, 17.693800683695, 20.000000000000, 22.306199316305, 20],
  ["E1", 10, 20, 30, "veryHighConfidence", 10.000000000000, 10.000000000000, 16.401730591774, 20.000000000000, 23.598269408226, 20],
  ["E1", 10, 20, 30, "highConfidence", 7.000000000000, 7.000000000000, 15.740980055888, 20.000000000000, 24.259019944112, 20],
  ["E1", 10, 20, 30, "mediumHighConfidence", 5.000000000000, 5.000000000000, 15.027352548164, 20.000000000000, 24.972647451836, 20],
  ["E1", 10, 20, 30, "mediumConfidence", 4.000000000000, 4.000000000000, 14.506431680649, 20.000000000000, 25.493568319351, 20],
  ["E1", 10, 20, 30, "mediumLowConfidence", 3.000000000000, 3.000000000000, 13.785107548755, 20.000000000000, 26.214892451245, 20],
  ["E1", 10, 20, 30, "lowConfidence", 2.000000000000, 2.000000000000, 12.707007243432, 20.000000000000, 27.292992756568, 20],
  ["E1", 10, 20, 30, "veryLowConfidence", 1.500000000000, 1.500000000000, 11.946163634799, 20.000000000000, 28.053836365201, 20],
  ["E1", 10, 20, 30, "extremelyLowConfidence", 1.368745362637, 1.368745362637, 11.714572323271, 20.000000000000, 28.285427676729, 20],
  ["E1", 10, 20, 30, "guesstimate", 1.250000000000, 1.250000000000, 11.493600139071, 20.000000000000, 28.506399860929, 20],
  ["E2", 10, 15, 30, "nearCertainty", 10.134749335298, 28.404248005894, 13.102266384136, 15.176790813462, 17.699724225915, 16],
  ["E2", 10, 15, 30, "veryHighConfidence", 4.495444514316, 11.486333542947, 12.370771467064, 15.439574018290, 19.520165375769, 16],
  ["E2", 10, 15, 30, "highConfidence", 3.361501646671, 8.084504940013, 12.074173844537, 15.626568966107, 20.523486475740, 16],
  ["E2", 10, 15, 30, "mediumHighConfidence", 2.600810760585, 5.802432281756, 11.804112045209, 15.876125714030, 21.657141611018, 16],
  ["E2", 10, 15, 30, "mediumConfidence", 2.217357551435, 4.652072654304, 11.635980633678, 16.095511131266, 22.516023424000, 17],
  ["E2", 10, 15, 30, "mediumLowConfidence", 1.829666621636, 3.488999864908, 11.438326320085, 16.465107908481, 23.748255952925, 17],
  ["E2", 10, 15, 30, "lowConfidence", 1.432736543502, 2.298209630507, 11.207892149857, 17.229153523016, 25.685792581852, 18],
  ["E2", 10, 15, 30, "veryLowConfidence", 1.225802981478, 1.677408944434, 11.086962868777, 18.046607191171, 27.128184716530, 19],
  ["E2", 10, 15, 30, "extremelyLowConfidence", 1.169411691968, 1.508235075904, 11.057366398523, 18.380778391981, 27.580127392278, 19],
  ["E2", 10, 15, 30, "guesstimate", 1.117120904230, 1.351362712690, 11.033001428705, 18.760712844889, 28.016443996271, 19],
  ["E3", 10, 12, 40, "nearCertainty", 2.149497214334, 17.092961000669, 10.700073419742, 12.949271952808, 17.382446450242, 13],
  ["E3", 10, 12, 40, "veryHighConfidence", 1.529135185014, 8.407892590197, 10.633939983007, 13.916071610373, 21.008888828607, 14],
  ["E3", 10, 12, 40, "highConfidence", 1.385393854869, 6.395513968160, 10.639107794188, 14.502497526454, 22.930336943858, 15],
  ["E3", 10, 12, 40, "mediumHighConfidence", 1.280357817057, 4.925009438795, 10.663325969403, 15.219382227859, 25.051334786629, 16],
  ["E3", 10, 12, 40, "mediumConfidence", 1.223312150052, 4.126370100735, 10.691875280344, 15.809828727173, 26.630609535916, 16],
  ["E3", 10, 12, 40, "mediumLowConfidence", 1.161496228632, 3.260947200850, 10.747349171769, 16.750286037216, 28.866130365991, 17],
  ["E3", 10, 12, 40, "lowConfidence", 1.091738218638, 2.284335060934, 10.876982212708, 18.569026266686, 32.344352660237, 19],
  ["E3", 10, 12, 40, "veryLowConfidence", 1.051233039418, 1.717262551850, 11.031351266904, 20.426554877383, 34.948057010244, 21],
  ["E3", 10, 12, 40, "extremelyLowConfidence", 1.039420895621, 1.551892538694, 11.099476766621, 21.178331884727, 35.777090971739, 22],
  ["E3", 10, 12, 40, "guesstimate", 1.028041447212, 1.392580260964, 11.181333821797, 22.037220777810, 36.589030276810, 23],
  ["E4", 10, 25, 30, "nearCertainty", 28.404248005894, 10.134749335298, 22.300275774085, 24.823209186538, 26.897733615864, 25],
  ["E4", 10, 25, 30, "veryHighConfidence", 11.486333542947, 4.495444514316, 20.479834624231, 24.560425981710, 27.629228532936, 25],
  ["E4", 10, 25, 30, "highConfidence", 8.084504940013, 3.361501646671, 19.476513524260, 24.373431033893, 27.925826155463, 25],
  ["E4", 10, 25, 30, "mediumHighConfidence", 5.802432281756, 2.600810760585, 18.342858388982, 24.123874285970, 28.195887954791, 25],
  ["E4", 10, 25, 30, "mediumConfidence", 4.652072654304, 2.217357551435, 17.483976576000, 23.904488868734, 28.364019366322, 24],
  ["E4", 10, 25, 30, "mediumLowConfidence", 3.488999864908, 1.829666621636, 16.251744047075, 23.534892091519, 28.561673679915, 24],
  ["E4", 10, 25, 30, "lowConfidence", 2.298209630507, 1.432736543502, 14.314207418148, 22.770846476984, 28.792107850143, 23],
  ["E4", 10, 25, 30, "veryLowConfidence", 1.677408944434, 1.225802981478, 12.871815283470, 21.953392808829, 28.913037131223, 22],
  ["E4", 10, 25, 30, "extremelyLowConfidence", 1.508235075904, 1.169411691968, 12.419872607722, 21.619221608019, 28.942633601477, 22],
  ["E4", 10, 25, 30, "guesstimate", 1.351362712690, 1.117120904230, 11.983556003729, 21.239287155111, 28.966998571295, 22],
  ["E5", 5, 5, 20, "nearCertainty", 1.000000000000, 12.242072495582, 5.062717305770, 5.825704949536, 8.256002409885, 6],
  ["E5", 5, 5, 20, "veryHighConfidence", 1.000000000000, 7.094949661544, 5.108052197231, 6.396129537441, 10.166295337609, 7],
  ["E5", 5, 5, 20, "highConfidence", 1.000000000000, 5.658101890795, 5.135367383906, 6.729481081954, 11.166146547432, 7],
  ["E5", 5, 5, 20, "mediumHighConfidence", 1.000000000000, 4.523639947435, 5.169123488444, 7.130985452005, 12.264571544475, 8],
  ["E5", 5, 5, 20, "mediumConfidence", 1.000000000000, 3.872265877865, 5.197384685996, 7.458449041851, 13.080025130806, 8],
  ["E5", 5, 5, 20, "mediumLowConfidence", 1.000000000000, 3.134385691965, 5.243472946600, 7.975968301876, 14.232224745981, 8],
  ["E5", 5, 5, 20, "lowConfidence", 1.000000000000, 2.255992508624, 5.337199089177, 8.967967459096, 16.024500978248, 9],
  ["E5", 5, 5, 20, "veryLowConfidence", 1.000000000000, 1.719823958001, 5.440765501163, 9.975657312052, 17.372147141437, 10],
  ["E5", 5, 5, 20, "extremelyLowConfidence", 1.000000000000, 1.559096622482, 5.485461060550, 10.383622515861, 17.804090505674, 11],
  ["E5", 5, 5, 20, "guesstimate", 1.000000000000, 1.401976233563, 5.538878407421, 10.851014717065, 18.229507563296, 11],];

/** An RNG that counts its draws. */
function countingRng(seed: string): SeededRng & { draws: number } {
  const inner = createSeededRng(seed);
  const rng = {
    draws: 0,
    next(): number {
      rng.draws++;
      return inner.next();
    },
  };
  return rng;
}

/** λ by bisection on the unit variance (1 + λ + qλ²) / ((2 + λ)²(3 + λ)) = spread² — a different
 *  method from the implementation's closed-form cubic, so it can check it. */
function lambdaByBisection(p: number, spread: number): number {
  const q = p * (1 - p);
  const target = spread * spread;
  let lo = 0;
  let hi = 1000;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const variance = (1 + mid + q * mid * mid) / ((2 + mid) ** 2 * (3 + mid));
    if (variance > target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

describe("BetaPertDistribution — the reference values", () => {
  it("matches the independent reference at every level, to 1e-9 days", () => {
    expect(REFERENCE).toHaveLength(50);
    for (const [, min, ml, max, level, alpha, beta, p5, p50, p95, ceilP50] of REFERENCE) {
      const d = new BetaPertDistribution(min, ml, max, level);
      const { alpha: a, beta: b } = d.parameters();
      expect(Math.abs(a! - alpha)).toBeLessThan(1e-9);
      expect(Math.abs(b! - beta)).toBeLessThan(1e-9);
      expect(Math.abs(d.inverseCDF(0.05) - p5)).toBeLessThan(1e-9);
      expect(Math.abs(d.inverseCDF(0.5) - p50)).toBeLessThan(1e-9);
      expect(Math.abs(d.inverseCDF(0.95) - p95)).toBeLessThan(1e-9);
      expect(Math.max(1, Math.ceil(d.inverseCDF(0.5)))).toBe(ceilP50);
    }
  });

  it("has the SD the level promises: the Beta Edition's symmetric SD × range, exactly", () => {
    // The Beta Edition's symmetric SD per level, 1 / (2√(2β + 1)); Extremely low is defined as the
    // mean of Very low's and Guesstimate's.
    const spread: Record<RSMLevel, number> = {
      nearCertainty: 1 / (2 * Math.sqrt(51)),
      veryHighConfidence: 1 / (2 * Math.sqrt(21)),
      highConfidence: 1 / (2 * Math.sqrt(15)),
      mediumHighConfidence: 1 / (2 * Math.sqrt(11)),
      mediumConfidence: 1 / 6,
      mediumLowConfidence: 1 / (2 * Math.sqrt(7)),
      lowConfidence: 1 / (2 * Math.sqrt(5)),
      veryLowConfidence: 1 / 4,
      extremelyLowConfidence: (1 / 4 + 1 / (2 * Math.sqrt(3.5))) / 2,
      guesstimate: 1 / (2 * Math.sqrt(3.5)),
    };
    for (const [, min, ml, max, level] of REFERENCE) {
      const d = new BetaPertDistribution(min, ml, max, level);
      expect(Math.abs(Math.sqrt(d.variance()) / (spread[level] * (max - min)) - 1)).toBeLessThan(1e-12);
    }
  });

  it("stores the Beta Edition's β by name, and derives Extremely low's from its defined spread", () => {
    expect(BETA_PERT_SHAPE).toEqual({
      nearCertainty: 25,
      veryHighConfidence: 10,
      highConfidence: 7,
      mediumHighConfidence: 5,
      mediumConfidence: 4,
      mediumLowConfidence: 3,
      lowConfidence: 2,
      veryLowConfidence: 1.5,
      extremelyLowConfidence: expect.any(Number) as number,
      guesstimate: 1.25,
    });
    // (1 / (4k²) − 1) / 2 for k = (1/4 + 1/(2√3.5)) / 2, at 40 digits: 1.3687453626371296…
    expect(Math.abs(BETA_PERT_SHAPE.extremelyLowConfidence - 1.36874536263713)).toBeLessThan(1e-14);
    expect(symmetricBetaSpread(4)).toBeCloseTo(1 / 6, 15);
  });

  it("is a point mass on 5 / 5 / 5 at every level", () => {
    for (const level of RSM_LEVELS) {
      const d = new BetaPertDistribution(5, 5, 5, level);
      expect([d.inverseCDF(0), d.inverseCDF(0.5), d.inverseCDF(1)]).toEqual([5, 5, 5]);
      expect([d.cdf(4.999), d.cdf(5), d.cdf(6)]).toEqual([0, 1, 1]);
      expect([d.mean(), d.variance()]).toEqual([5, 0]);
    }
  });
});

describe("BetaPertDistribution — symmetric estimates", () => {
  it("take the stored β exactly, and their median is the midpoint exactly", () => {
    for (const level of RSM_LEVELS) {
      for (const [min, ml, max] of [[10, 20, 30], [0.1, 0.4, 0.7], [1, 2.5, 4], [2.5, 5, 7.5]] as const) {
        const d = new BetaPertDistribution(min, ml, max, level);
        expect(d.parameters().alpha).toBe(BETA_PERT_SHAPE[level]);
        expect(d.parameters().beta).toBe(BETA_PERT_SHAPE[level]);
        expect(d.inverseCDF(0.5)).toBe((min + max) / 2);
      }
    }
  });

  it("never schedules a symmetric row a day late — integer and two-decimal triples, every level", () => {
    // A numerical median lands a few ulps above an integer midpoint and Math.ceil adds a whole day.
    let checked = 0;
    for (const level of RSM_LEVELS) {
      for (let min = 0; min <= 40; min++) {
        for (let half = 1; half <= 30; half++) {
          const d = new BetaPertDistribution(min, min + half, min + 2 * half, level);
          expect(Math.ceil(d.inverseCDF(0.5))).toBe(min + half);
          checked++;
        }
      }
      for (let cents = 0; cents < 1000; cents += 7) {
        for (let halfCents = 1; halfCents <= 150; halfCents += 13) {
          const min = cents / 100;
          const ml = Number(((cents + halfCents) / 100).toFixed(2));
          const max = Number(((cents + 2 * halfCents) / 100).toFixed(2));
          const d = new BetaPertDistribution(min, ml, max, level);
          expect(d.inverseCDF(0.5)).toBe((min + max) / 2);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(12_000);
  });
});

describe("BetaPertDistribution — the shape", () => {
  it("keeps α and β at 1 or above at every level and every p in [0, 1]", () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, noNaN: true }), fc.constantFrom(...RSM_LEVELS), (p, level) => {
        const { alpha, beta } = betaPertShape(0, p, 1, level);
        return alpha >= 1 && beta >= 1;
      }),
      { numRuns: 5000 }
    );
    for (const level of RSM_LEVELS) {
      expect(betaPertShape(5, 5, 20, level).alpha).toBe(1);
      expect(betaPertShape(5, 20, 20, level).beta).toBe(1);
    }
  });

  it("takes λ from the closed-form cubic, matching an independent bisection", () => {
    for (const level of RSM_LEVELS) {
      const spread = symmetricBetaSpread(BETA_PERT_SHAPE[level]);
      for (let i = 0; i <= 200; i++) {
        const p = i / 200;
        if (p === 0.5) continue; // the symmetric shortcut, pinned above
        const lambda = solveBetaPertLambda(p, spread);
        const reference = lambdaByBisection(p, spread);
        expect(Math.abs(lambda - reference)).toBeLessThanOrEqual(1e-9 * Math.max(1, reference));
      }
    }
  });

  it("stays finite and exact next to a symmetric estimate, where the cubic has a double root", () => {
    // At p = ½ the cubic's other two roots meet at λ = −2, and rounding pushes acos's argument just
    // past 1 nearby — NaN, silently. 10 / 20.0000001 / 30 is such an estimate.
    const offsets: number[] = [];
    for (let k = -9; k <= -6 + 1e-9; k += 0.25) offsets.push(10 ** k);
    for (const level of RSM_LEVELS) {
      const spread = symmetricBetaSpread(BETA_PERT_SHAPE[level]);
      const cases: Array<[number, number, number]> = [];
      for (const off of offsets) cases.push([0, 0.5 - off, 1], [0, 0.5 + off, 1]);
      for (const delta of [1e-8, 1e-7, 1e-6]) cases.push([10, 20 - delta, 30], [10, 20 + delta, 30]);
      for (const [min, ml, max] of cases) {
        const d = new BetaPertDistribution(min, ml, max, level);
        const sd = Math.sqrt(d.variance());
        expect(Number.isFinite(sd)).toBe(true);
        expect(Math.abs(sd / (spread * (max - min)) - 1)).toBeLessThan(1e-12);
      }
    }
  });

  it("throws on an out-of-order estimate — before the point-mass check, so Min = Max ≠ Most Likely throws too", () => {
    for (const [min, ml, max] of [[10, 50, 40], [20, 10, 30], [5, 7, 5], [5, 6, 5]] as const) {
      expect(() => new BetaPertDistribution(min, ml, max, "mediumConfidence")).toThrow(
        /min <= mostLikely <= max/
      );
    }
  });
});

describe("BetaPertDistribution — sampling", () => {
  it("takes exactly one draw per sample, whatever the shape — the point mass included", () => {
    for (const [min, ml, max] of [[10, 20, 30], [10, 12, 40], [5, 5, 20], [5, 20, 20], [5, 5, 5]] as const) {
      const d = new BetaPertDistribution(min, ml, max, "nearCertainty");
      const rng = countingRng(`draws-${min}-${ml}-${max}`);
      for (let i = 0; i < 500; i++) d.sample(rng);
      expect(rng.draws).toBe(500);
    }
  });

  it("returns a finite value inside [Min, Max] for every probability, the extreme tails included", () => {
    const us = [0, 5e-324, 1e-300, 1e-100, 2 ** -53, 1e-8, 0.3, 0.5, 0.7, 1 - 1e-8, 1 - 2 ** -53, 1];
    const estimates: Array<[number, number, number]> = [[10, 20, 30], [10, 15, 30], [10, 12, 40], [10, 25, 30], [5, 5, 20], [5, 20, 20], [0, 0, 1], [5, 5, 5]];
    for (const level of RSM_LEVELS) {
      for (const [min, ml, max] of estimates) {
        const d = new BetaPertDistribution(min, ml, max, level);
        let previous = -Infinity;
        for (const u of us) {
          const x = d.inverseCDF(u);
          expect(Number.isFinite(x)).toBe(true);
          expect(x).toBeGreaterThanOrEqual(min);
          expect(x).toBeLessThanOrEqual(max);
          expect(x).toBeGreaterThanOrEqual(previous);
          previous = x;
        }
      }
    }
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 200 }),
        fc.integer({ min: 0, max: 200 }),
        fc.integer({ min: 0, max: 200 }),
        fc.constantFrom(...RSM_LEVELS),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (a, b, c, level, u) => {
          const [min, ml, max] = [a, b, c].sort((x, y) => x - y) as [number, number, number];
          const x = new BetaPertDistribution(min, ml, max, level).inverseCDF(u);
          return Number.isFinite(x) && x >= min && x <= max;
        }
      ),
      { numRuns: 3000 }
    );
  });

  it("inverts its own CDF, and both are monotone", () => {
    for (const level of RSM_LEVELS) {
      for (const [min, ml, max] of [[10, 12, 40], [5, 5, 20], [10, 25, 30]] as const) {
        const d = new BetaPertDistribution(min, ml, max, level);
        expect(d.cdf(min)).toBe(0);
        expect(d.cdf(max)).toBe(1);
        let previous = 0;
        for (let i = 1; i < 100; i++) {
          const u = i / 100;
          const x = d.inverseCDF(u);
          expect(Math.abs(d.cdf(x) - u)).toBeLessThan(1e-12);
          expect(d.cdf(x)).toBeGreaterThanOrEqual(previous);
          previous = d.cdf(x);
        }
      }
    }
  });

  it("inverts its own CDF deep in the lower tail, where the starting point decides convergence", () => {
    // On the unit range, so a quantile as small as 1e-43 is not rounded away by adding Min. The
    // upper tail is solved as a reflected lower tail, so p and 1 − p between them cover both.
    for (const level of RSM_LEVELS) {
      for (const p of [0, 0.25, 0.5, 0.75, 1]) {
        const d = new BetaPertDistribution(0, p, 1, level);
        for (const u of [1e-300, 1e-100, 1e-50, 1e-20]) {
          expect(Math.abs(d.cdf(d.inverseCDF(u)) / u - 1)).toBeLessThan(1e-9);
        }
      }
    }
  });

  it("rejects a probability outside [0, 1], as the other distributions do", () => {
    const d = new BetaPertDistribution(10, 12, 40, "mediumConfidence");
    expect(() => d.inverseCDF(-0.1)).toThrow(/p must be in \[0, 1\]/);
    expect(() => d.inverseCDF(1.1)).toThrow(/p must be in \[0, 1\]/);
  });
});
