// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Config for `npm run bench` ONLY. Separate from vitest.config.ts so the benchmark —
// ~15s and wall-clock sensitive — can never be picked up by `npm test` or the ship gate.
// See src/core/simulation/monte-carlo.bench.ts for why it is not a gate step.

import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "url";

export default defineConfig({
  resolve: {
    alias: {
      "@domain": fileURLToPath(new URL("./src/domain", import.meta.url)),
      "@core": fileURLToPath(new URL("./src/core", import.meta.url)),
      "@infrastructure": fileURLToPath(new URL("./src/infrastructure", import.meta.url)),
      "@app": fileURLToPath(new URL("./src/app", import.meta.url)),
      "@ui": fileURLToPath(new URL("./src/ui", import.meta.url)),
      "@workers": fileURLToPath(new URL("./src/workers", import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.bench.ts"],
    // The benchmark's entire output is console.log. Vitest intercepts console by default
    // and prints nothing for a passing test, which would make `npm run bench` succeed
    // silently — a tool that cannot report is a tool that cannot be checked.
    disableConsoleIntercept: true,
    testTimeout: 600_000,
  },
});
