// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// stryker.config.mjs
// Mutation testing configuration — scoped to core scheduling logic.
// Run with: npx stryker run
// Do NOT commit Stryker output directories to source control.

/** @type {import('@stryker-mutator/core').PartialStrykerOptions} */
export default {
  packageManager: "npm",
  reporters: ["html", "clear-text", "progress"],
  testRunner: "vitest",
  checkers: ["typescript"],
  tsconfigFile: "tsconfig.app.json",
  mutate: [
    "src/core/schedule/constraint-utils.ts",
    "src/core/schedule/deterministic.ts",
    "src/core/schedule/dependency-graph.ts",
    "src/core/schedule/buffer.ts",
    "src/core/schedule/milestone-sim-params.ts",
    // Conditional sampling (v0.49.0): mutate whole files, not line ranges (they drift).
    "src/core/distributions/*.ts",
    "!src/core/distributions/*.test.ts",
    "src/core/simulation/monte-carlo.ts",
  ],
  // Run only the tests that cover the mutated files via a scoped vitest config.
  vitest: {
    configFile: "vitest.stryker.config.ts",
  },
  // REQUIRED — do not remove. With unlimited test-runner reuse, mutant
  // activation in the reused vitest workers goes stale on this toolchain
  // (Stryker 9.6.1 + vitest runner + Vitest 4.1.6, Node 24): the run exits 0
  // but nearly every mutant "survives", including mutants whose covering
  // tests directly assert the mutated behavior. Verified 2026-07-31:
  // monte-carlo.ts scored 10.07% with default reuse vs 84.21% with reuse 1
  // (survivors then only equivalent mutants); buffer.ts control scored 100%
  // either way. If scores ever look like mass survival of obviously-killable
  // mutants, suspect runner staleness first — and delete
  // reports/mutation/.stryker-incremental.json so a poisoned incremental
  // cache does not replay old false "Survived" results. Known recovery for a
  // sandbox "ENOENT ... chdir" crash at startup: rm -rf .stryker-tmp
  maxTestRunnerReuse: 1,
  // Exclude type-only constructs that cannot be meaningfully mutated
  mutator: {
    excludedMutations: [
      "StringLiteral",   // string content changes produce equivalent mutants
      "ObjectLiteral",   // empty object mutations rarely affect behavior
    ],
  },
  // Concurrency: use half available CPUs to avoid thrashing
  concurrency: 2,
  // Timeout: generous for the schedule computation functions
  timeoutMS: 10000,
  timeoutFactor: 2.5,
  // Output directory
  htmlReporter: {
    fileName: "reports/mutation/mutation-report.html",
  },
  // Incremental mode: cache results between runs
  incremental: true,
  incrementalFile: "reports/mutation/.stryker-incremental.json",
};
