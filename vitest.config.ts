// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

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
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      // Widened from core/domain/infrastructure so the UI, app and worker layers
      // are visible too. Files outside the old list were UNREPORTED, not 0% —
      // `use-project-store.ts` and `simulation.worker.ts` both carry real logic
      // and neither appeared in a coverage run. Reporting only; there are no
      // thresholds here and `npm test` is a bare `vitest run`, so this is not a gate.
      include: ["src/**"],
    },
  },
});
