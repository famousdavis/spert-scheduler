// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

// Scoped vitest config for Stryker mutation testing.
// Only includes tests that exercise src/core/schedule/ files.

import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "url";

export default defineConfig({
  resolve: {
    alias: {
      "@domain": fileURLToPath(new URL("./src/domain", import.meta.url)),
      "@core": fileURLToPath(new URL("./src/core", import.meta.url)),
      "@infrastructure": fileURLToPath(
        new URL("./src/infrastructure", import.meta.url)
      ),
      "@app": fileURLToPath(new URL("./src/app", import.meta.url)),
      "@ui": fileURLToPath(new URL("./src/ui", import.meta.url)),
      "@workers": fileURLToPath(new URL("./src/workers", import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    include: [
      "src/core/schedule/constraint-utils.test.ts",
      "src/core/schedule/deterministic.test.ts",
      "src/core/schedule/dependency-graph.test.ts",
      "src/core/schedule/buffer.test.ts",
      "src/integration/sequential-constraints.test.ts",
      "src/integration/dependency-roundtrip.test.ts",
      "src/integration/full-workflow.test.ts",
    ],
  },
});
