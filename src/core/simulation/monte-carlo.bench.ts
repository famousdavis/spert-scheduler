// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Monte Carlo hot-loop benchmark (charter §3.7).
//
//     npm run bench
//
// ⚠️ NOT A GATE STEP, ON PURPOSE. It takes ~15s and it measures wall-clock, so it is
// timing- and machine-sensitive; in `npm test` or `npm run shipgate` it would be a flaky
// gate. Same standing as `npm run cc`, `npm run mutate` and `npm run contract:hash`: a
// committed tool you invoke deliberately. The filename ends `.bench.ts`, not `.test.ts`,
// so the suite's `src/**/*.test.ts` include cannot pick it up — while still being under
// `src/`, so `tsc -b` type-checks it.
//
// ⚠️ THE SELF-CALIBRATION RUNS EVERY TIME, AND IS NOT DECORATION.
// "No measurable cost" and "a benchmark that measures nothing" are the same output. So
// before reporting anything this injects KNOWN slowdowns — +100%, +10%, +5% of the real
// workload — and prints whether each was detected on THIS machine, at THIS moment. A
// resolution measured once and hardcoded goes stale silently: today's ~4% on a quiet
// laptop is not next month's under load. Read the calibration block before the numbers;
// if +100% is not detected, the run is worthless and nothing below it means anything.
//
// ⚠️ DO NOT REWRITE THIS AS A SEQUENTIAL A/B. It is the obvious shape and it produces a
// CONFIDENTLY WRONG SIGN. Measured 2026-08-02: timing the control, then the variant, gave
// a +5% WORKLOAD A NEGATIVE DELTA — more work, measured faster — because whichever variant
// runs first pays the JIT warm-up. That is not a check that failed to fire; it fired and
// returned the opposite of the truth. Trusted in a decomposition A/B it would have "shown"
// that extracting code from a hot loop made it faster. `timeAll` interleaves round-robin
// and pre-warms every variant, which is the fix; the failure mode is why the fix is here.

import { describe, it } from "vitest";
import { createSampleProject } from "@domain/data/sample-project";
import { buildSimulationParams } from "@ui/helpers/build-simulation-params";
import { runTrials, runDependencyTrials } from "@core/simulation/monte-carlo";
import { buildWorkCalendar } from "@core/calendar/work-calendar";
import type { Activity } from "@domain/models/types";

const TRIALS = 10_000; // DEFAULT_USER_PREFERENCES.defaultTrialCount
const REPS = 11; // odd, so the median is a real sample

function stats(ms: number[]) {
  const sorted = [...ms].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  const mean = ms.reduce((a, b) => a + b, 0) / ms.length;
  const sd = Math.sqrt(ms.reduce((a, b) => a + (b - mean) ** 2, 0) / ms.length);
  return { median, mean, sd, min: sorted[0]!, max: sorted.at(-1)! };
}

/**
 * Time several variants INTERLEAVED, round-robin, one rep of each per round.
 *
 * ⚠️ Sequential timing gave a +5% workload a NEGATIVE delta — it measured faster than the
 * control that preceded it — because whichever variant runs first is the one paying the JIT
 * warm-up. Interleaving spreads warm-up and any machine load across every variant equally.
 * Each variant is also warmed once before recording starts.
 */
function timeAll<K extends string>(variants: Record<K, () => void>, reps = REPS) {
  const keys = Object.keys(variants) as K[];
  for (const k of keys) variants[k](); // warm every variant, not just the first
  const samples = Object.fromEntries(keys.map((k) => [k, [] as number[]])) as Record<K, number[]>;
  for (let r = 0; r < reps; r++) {
    for (const k of keys) {
      const t0 = performance.now();
      variants[k]();
      samples[k].push(performance.now() - t0);
    }
  }
  return Object.fromEntries(keys.map((k) => [k, stats(samples[k])])) as Record<
    K,
    ReturnType<typeof stats>
  >;
}

const fmt = (s: ReturnType<typeof stats>) =>
  `median ${s.median.toFixed(1)}ms  mean ${s.mean.toFixed(1)}ms  sd ${s.sd.toFixed(1)}ms  [${s.min.toFixed(1)}–${s.max.toFixed(1)}]`;

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
  // Holidays are deliberately empty. They are consumed when BUILDING simulation params,
  // never inside the trial loops, so they cannot affect what is being measured — and
  // leaving them out keeps the fixture from depending on the holiday calculator.
  const project = createSampleProject("2026-04-06");
  const scenario = project.scenarios[0]!;
  const calendar = buildWorkCalendar([1, 2, 3, 4, 5], [], []);
  return { scenario, calendar };
}

describe("§3.7 Phase 1 — Monte Carlo hot loops", () => {
  it("benchmark", () => {
    const { scenario, calendar } = fixture();

    const depParams = buildSimulationParams(
      scenario.activities,
      true,
      scenario.settings.probabilityTarget,
      scenario.dependencies,
      scenario.milestones,
      scenario.startDate,
      calendar,
      scenario.settings.parkinsonsLawEnabled ?? true,
    );
    const seqParams = buildSimulationParams(
      scenario.activities,
      false,
      scenario.settings.probabilityTarget,
      scenario.dependencies,
      scenario.milestones,
      scenario.startDate,
      calendar,
      scenario.settings.parkinsonsLawEnabled ?? true,
    );

    console.log(
      `\nfixture: ${scenario.activities.length} activities, ${scenario.dependencies.length} dependencies, ${TRIALS} trials, ${REPS} reps\n`,
    );

    // ---- FALSIFICATION FIRST -------------------------------------------------
    // ⚠️ The injected slowdowns are FRACTIONS OF THE REAL WORKLOAD, not a tuned busy-loop.
    // A hand-tuned burn has to be calibrated against the very machine whose speed is in
    // question; running the real function again is self-calibrating and is also the exact
    // shape of cost an extraction could add.
    //
    // A first attempt used `burn(2_000_000)` and the harness reported NOT DETECTED — 0.9ms
    // against sd 1.5ms. That was the guard working, not a setback: it refused to certify a
    // resolution it did not have.
    const seqRun = (trials = TRIALS) =>
      runTrials({
        activities: scenario.activities,
        trialCount: trials,
        rngSeed: scenario.settings.rngSeed,
        deterministicDurations: seqParams.deterministicDurations,
        sequentialConstraints: seqParams.sequentialConstraints,
      });

    const measured = timeAll({
      control: () => seqRun(),
      plus100: () => { seqRun(); seqRun(TRIALS); },
      plus10: () => { seqRun(); seqRun(TRIALS / 10); },
      plus5: () => { seqRun(); seqRun(TRIALS / 20); },
    });
    const control = measured.control;

    console.log(`FALSIFICATION control : ${fmt(control)}`);
    for (const [label, key] of [["+100%", "plus100"], ["+10%", "plus10"], ["+5%", "plus5"]] as const) {
      const s = measured[key];
      const delta = s.median - control.median;
      const threshold = Math.max(3 * control.sd, 0.5);
      console.log(
        `FALSIFICATION ${label.padEnd(6)}: ${fmt(s)}\n` +
          `                        delta ${delta.toFixed(2)}ms vs threshold ${threshold.toFixed(2)}ms  ->  ${delta > threshold ? "DETECTED" : "NOT DETECTED (below resolution)"}`,
      );
    }
    console.log("");

    // ---- baselines -----------------------------------------------------------
    const durMap = depParams.dependencyParams!.deterministicDurationMap
      ? new Map(Object.entries(depParams.dependencyParams!.deterministicDurationMap))
      : undefined;
    const both = timeAll({
      seq: () => seqRun(),
      dep: () => {
        runDependencyTrials({
          activities: scenario.activities,
          ...depParams.dependencyParams!,
          deterministicDurationMap: durMap,
          milestoneActivityIds: toMap(depParams.dependencyParams!.milestoneActivityIds),
          constraintMap: toMap(depParams.dependencyParams!.constraintMap),
          activityEarliestStart: toMap(depParams.dependencyParams!.activityEarliestStart),
          trialCount: TRIALS,
          rngSeed: scenario.settings.rngSeed,
        });
      },
    });
    console.log(`runTrials            : ${fmt(both.seq)}`);
    console.log(`runDependencyTrials  : ${fmt(both.dep)}\n`);

    // ---- the CONSTRAINED sequential path -------------------------------------
    // ⚠️ THE SAMPLE PROJECT IS UNCONSTRAINED, so everything above measures the engine's
    // FAST path only. The constrained path is a different loop with a per-activity switch,
    // and it is the one an extraction would put a call into — measuring only the fast path
    // would have made a hot-loop extraction look free by construction.
    //
    // This is the same blind spot the Monte Carlo ORACLE had (see the charter: an oracle
    // built from realistic data under-covers exactly the paths that most need one), found
    // the same way and fixed the same way. Realistic fixtures do not reach unusual states.
    const constrained: Activity[] = scenario.activities.map((a, i): Activity =>
      i % 5 === 0
        ? { ...a, constraintType: "SNET" as const, constraintDate: "2026-06-01", constraintMode: "hard" as const }
        : a,
    );
    const consP = buildSimulationParams(
      constrained,
      false,
      scenario.settings.probabilityTarget,
      scenario.dependencies,
      scenario.milestones,
      scenario.startDate,
      calendar,
      scenario.settings.parkinsonsLawEnabled ?? true,
    );
    const consBoth = timeAll({
      unconstrained: () => seqRun(),
      constrainedPath: () => {
        runTrials({
          activities: constrained,
          trialCount: TRIALS,
          rngSeed: scenario.settings.rngSeed,
          deterministicDurations: consP.deterministicDurations,
          sequentialConstraints: consP.sequentialConstraints,
        });
      },
    });
    console.log(`runTrials (unconstrained): ${fmt(consBoth.unconstrained)}`);
    console.log(`runTrials (CONSTRAINED)  : ${fmt(consBoth.constrainedPath)}\n`);

    // ---- scaling to the schema ceiling ---------------------------------------
    // trialCount is bounded at 100_000 by project.schema.ts:159, so this is the WORST
    // CASE a user can configure — the only number against which a performance argument
    // for keeping these functions monolithic can honestly be made.
    for (const n of [10_000, 50_000, 100_000]) {
      const scaled = timeAll(
        {
          seq: () => seqRun(n),
          dep: () => {
            runDependencyTrials({
              activities: scenario.activities,
              ...depParams.dependencyParams!,
              deterministicDurationMap: durMap,
              milestoneActivityIds: toMap(depParams.dependencyParams!.milestoneActivityIds),
          constraintMap: toMap(depParams.dependencyParams!.constraintMap),
              activityEarliestStart: toMap(depParams.dependencyParams!.activityEarliestStart),
              trialCount: n,
              rngSeed: scenario.settings.rngSeed,
            });
          },
        },
        5,
      );
      console.log(
        `SCALING ${String(n).padStart(6)} trials: runTrials ${scaled.seq.median.toFixed(1)}ms  |  runDependencyTrials ${scaled.dep.median.toFixed(1)}ms`,
      );
    }
    console.log("");
  }, 600_000);
});
