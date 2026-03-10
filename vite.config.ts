// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "url";

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
  worker: {
    format: "es",
  },
  build: {
    sourcemap: false, // Explicitly disable source maps in production
    rollupOptions: {
      output: {
        manualChunks: {
          recharts: ["recharts"],
          react: ["react", "react-dom", "react-router-dom"],
          firebase: ["firebase/app", "firebase/auth", "firebase/firestore"],
        },
      },
    },
  },
});
