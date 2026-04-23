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
  ],
  // Run only the tests that cover the mutated files via a scoped vitest config.
  vitest: {
    configFile: "vitest.stryker.config.ts",
  },
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
