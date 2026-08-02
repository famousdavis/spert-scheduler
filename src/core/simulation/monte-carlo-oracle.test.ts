// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// ===========================================================================
// ORACLE — a pinned, behaviour-preserving contract for the Monte Carlo hot loops.
//
// WHY THIS EXISTS
// §3.7 decomposes runTrials (cognitive complexity 57) and runDependencyTrials (29).
// The mutation baseline proves the tests are strong; this proves the OUTPUT is
// unchanged. It lands BEFORE the decomposition, as its own PR, so it survives a
// revert and the regression check stays unconditional either way.
//
// WHY IT CAN EXIST AT ALL
// Monte Carlo here is seeded and fully deterministic — `createSeededRng(rngSeed)`,
// no Math.random, no clock. The v0.60.0 smoke pass independently confirmed this at
// the other end: two real-Worker runs produced byte-identical percentile tables.
//
// WHAT IS PINNED
// Not the raw samples — 10,000 floats per case would be a large file that nobody
// reads and that diffs uselessly. Instead: the full standard percentile table, the
// mean, the SD, the sample count, and `exhaustedIds`. A decomposition that changed
// the sampling order, the RNG draw count, or any clamping would move at least one
// percentile. Rounded to 10 decimal places so the file is stable across platforms
// without being loose enough to hide a real change.
//
// ⚠️ DELIBERATELY NOT A VITEST SNAPSHOT. `vitest -u` regenerates snapshots wholesale,
// which during §3.7 would silently absorb the exact behaviour change this file exists
// to catch. Regenerating here is an explicit act:
//
//     ORACLE_WRITE=1 npx vitest run src/core/simulation/monte-carlo-oracle.test.ts
//
// and the resulting diff must be reviewed. If §3.7 makes this file need regenerating,
// §3.7 is wrong.
//
// ⚠️ THIS FILE MUST STAY OUT OF `vitest.stryker.config.ts`'s include list — that list
// is an explicit allowlist, so it is excluded by default. Keep it that way: adding it
// after the monte-carlo baseline was recorded would give the §3.7 comparison more
// killing power than its own baseline and mask decomposition-caused survivors.
// ===========================================================================

import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { runTrials, runDependencyTrials } from "./monte-carlo";
import { computeStandardPercentiles, mean, standardDeviation, sortSamples } from "@core/analytics/analytics";
import { createSampleProject } from "@domain/data/sample-project";
import { buildSimulationParams } from "@ui/helpers/build-simulation-params";
import { buildWorkCalendar } from "@core/calendar/work-calendar";
import type { Activity } from "@domain/models/types";

const ORACLE_PATH = resolve("src/core/simulation/monte-carlo-oracle.json");

/** The shape pinned per case. Percentiles alone would miss a distribution-wide shift. */
interface OracleEntry {
  sampleCount: number;
  mean: number;
  sd: number;
  percentiles: Record<number, number>;
  exhaustedIds: string[];
}

// 10dp: tight enough that a real change in sampling moves it, loose enough that the
// last bits of float noise do not make the file platform-dependent.
const round = (n: number) => Number(n.toFixed(10));

function summarise(samples: Float64Array, exhaustedIds: string[]): OracleEntry {
  const sorted = sortSamples(samples);
  const pct = computeStandardPercentiles(sorted);
  return {
    sampleCount: samples.length,
    mean: round(mean(samples)),
    sd: round(standardDeviation(samples)),
    percentiles: Object.fromEntries(
      Object.entries(pct).map(([k, v]) => [k, round(v)]),
    ),
    exhaustedIds: [...exhaustedIds].sort(),
  };
}

/**
 * `buildSimulationParams` returns plain Records (they cross the Worker postMessage
 * boundary, where Maps do not survive); `runDependencyTrials` takes Maps. The worker
 * converts at `simulation.worker.ts:82-91`. Done locally here rather than sharing a
 * helper, because sharing it is a production change and charter §3.5 already tracks
 * "share the other three map conversions, with service-side tests first".
 */
function toMap<V>(rec: Record<string, V> | undefined): Map<string, V> | undefined {
  return rec ? new Map(Object.entries(rec)) : undefined;
}

function fixture() {
  // Fixed start date, no holidays, fixed seed — nothing here reads the clock.
  const project = createSampleProject("2026-04-06");
  const scenario = project.scenarios[0]!;
  const calendar = buildWorkCalendar([1, 2, 3, 4, 5], [], []);
  return { scenario, calendar };
}

interface Case {
  name: string;
  run: () => OracleEntry;
}

function buildCases(): Case[] {
  const { scenario, calendar } = fixture();
  const params = (dependencyMode: boolean, parkinsons: boolean) =>
    buildSimulationParams(
      scenario.activities,
      dependencyMode,
      scenario.settings.probabilityTarget,
      scenario.dependencies,
      scenario.milestones,
      scenario.startDate,
      calendar,
      parkinsons,
    );

  const cases: Case[] = [];
  // Trial counts deliberately small and varied: the contract is about sampling
  // behaviour, not throughput, and small counts keep this fast enough to be
  // unconditional in `npm test`.
  for (const trialCount of [1, 2, 997, 5000]) {
    for (const parkinsons of [true, false]) {
      const seqP = params(false, parkinsons);
      cases.push({
        name: `sequential/parkinsons-${parkinsons}/trials-${trialCount}`,
        run: () => {
          const r = runTrials({
            activities: scenario.activities,
            trialCount,
            rngSeed: "oracle-seed-v1",
            deterministicDurations: seqP.deterministicDurations,
            sequentialConstraints: seqP.sequentialConstraints,
          });
          return summarise(r.samples, r.exhaustedIds);
        },
      });

      const depP = params(true, parkinsons);
      const durMap = depP.dependencyParams!.deterministicDurationMap
        ? new Map(Object.entries(depP.dependencyParams!.deterministicDurationMap))
        : undefined;
      cases.push({
        name: `dependency/parkinsons-${parkinsons}/trials-${trialCount}`,
        run: () => {
          const r = runDependencyTrials({
            activities: scenario.activities,
            ...depP.dependencyParams!,
            deterministicDurationMap: durMap,
            milestoneActivityIds: toMap(depP.dependencyParams!.milestoneActivityIds),
            constraintMap: toMap(depP.dependencyParams!.constraintMap),
            activityEarliestStart: toMap(depP.dependencyParams!.activityEarliestStart),
            trialCount,
            rngSeed: "oracle-seed-v1",
          });
          return summarise(r.samples, r.exhaustedIds);
        },
      });
    }
  }
  // ⚠️ THE SAMPLE PROJECT ALONE DOES NOT REACH EVERY SAMPLING PATH. Every one of its
  // activities is `planned` and unconstrained, so the sequential engine takes its
  // unconstrained branch and never touches the constrained one or the completed-activity
  // shortcut. Proven, not assumed: perturbing the constrained path's `sample()` by 1e-7
  // left the whole matrix green, while the same perturbation on the other two paths broke
  // 9 and 8 fixtures. A decomposition of that branch would have been unguarded.
  // ⚠️ The `: Activity` return annotation is load-bearing, not decoration. An earlier draft
  // used the long names "startNoEarlierThan"/"finishNoLaterThan"; the real codes are SNET
  // and FNLT. The oracle still passed 23/23 with the invalid values — they reached the
  // engine as data it ignored — and only `tsc -b` objected. A cast here would have disabled
  // exactly the check that caught it (see feedback_typed_fixture_factories).
  const constrained: Activity[] = scenario.activities.map((a, i): Activity => {
    if (i === 3) {
      return {
        ...a,
        constraintType: "SNET" as const,
        constraintDate: "2026-06-01",
        constraintMode: "hard" as const,
      };
    }
    if (i === 5) {
      return { ...a, constraintType: "FNLT" as const, constraintDate: "2026-09-01", constraintMode: "soft" as const };
    }
    // A completed activity pins the `type: "complete"` shortcut, which uses actualDuration
    // and draws NO random number — a decomposition that started drawing one here would
    // desynchronise every later sample, and only this fixture would notice.
    if (i === 7) return { ...a, status: "complete" as const, actualDuration: 12 };
    return a;
  });
  for (const parkinsons of [true, false]) {
    const cp = buildSimulationParams(
      constrained,
      false,
      scenario.settings.probabilityTarget,
      scenario.dependencies,
      scenario.milestones,
      scenario.startDate,
      calendar,
      parkinsons,
    );
    cases.push({
      name: `sequential-constrained-and-complete/parkinsons-${parkinsons}/trials-5000`,
      run: () => {
        const r = runTrials({
          activities: constrained,
          trialCount: 5000,
          rngSeed: "oracle-seed-v1",
          deterministicDurations: cp.deterministicDurations,
          sequentialConstraints: cp.sequentialConstraints,
        });
        return summarise(r.samples, r.exhaustedIds);
      },
    });
  }

  // A different seed, to pin that the seed actually reaches the sampler. Without
  // this the whole matrix could be satisfied by an engine that ignored rngSeed.
  const seqP = params(false, true);
  cases.push({
    name: "sequential/alternate-seed/trials-5000",
    run: () => {
      const r = runTrials({
        activities: scenario.activities,
        trialCount: 5000,
        rngSeed: "oracle-seed-v2-different",
        deterministicDurations: seqP.deterministicDurations,
        sequentialConstraints: seqP.sequentialConstraints,
      });
      return summarise(r.samples, r.exhaustedIds);
    },
  });
  return cases;
}

describe("Monte Carlo hot loops — pinned output oracle", () => {
  const cases = buildCases();
  const actual: Record<string, OracleEntry> = {};
  for (const c of cases) actual[c.name] = c.run();

  if (process.env.ORACLE_WRITE === "1") {
    writeFileSync(ORACLE_PATH, JSON.stringify(actual, null, 2) + "\n");
  }

  it("the oracle file exists and covers every fixture", () => {
    expect(existsSync(ORACLE_PATH)).toBe(true);
    const expected = JSON.parse(readFileSync(ORACLE_PATH, "utf8")) as Record<string, OracleEntry>;
    expect(Object.keys(expected).sort()).toEqual(Object.keys(actual).sort());
  });

  it("every fixture name is unique", () => {
    expect(new Set(cases.map((c) => c.name)).size).toBe(cases.length);
  });

  it("the matrix is the expected size", () => {
    // Tripwire on the fixture set: if this changes, it was deliberate or it was an
    // accident, and either way somebody should find out which.
    expect(cases.length).toBe(19);
  });

  it("the engine actually reads rngSeed", () => {
    // The premise the whole oracle rests on. If a decomposition ignored the seed,
    // every other case here would still pass against a regenerated file — this is
    // the one assertion that cannot be satisfied by a deterministic-but-wrong engine.
    expect(actual["sequential/alternate-seed/trials-5000"]!.percentiles[50]).not.toBe(
      actual["sequential/parkinsons-true/trials-5000"]!.percentiles[50],
    );
  });

  const expected = JSON.parse(readFileSync(ORACLE_PATH, "utf8")) as Record<string, OracleEntry>;
  for (const c of cases) {
    it(`matches the pinned output: ${c.name}`, () => {
      expect(actual[c.name]).toEqual(expected[c.name]);
    });
  }
});
