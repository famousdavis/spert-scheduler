// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import sonarjs from "eslint-plugin-sonarjs";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: [".claude/**"] },
  // `.stryker-tmp` is Stryker's sandbox: it holds full copies of every mutated
  // source file. Left behind by a crashed run, ESLint lints those copies too and
  // the problem count jumps by the findings each copied file carries — verified
  // 2026-08-01: one copy of deterministic.ts took `npm run lint` from 23 to 24.
  // The count is the ship gate (`expectProblems` in shipgate.config.json), so an
  // uncleaned sandbox reads as a regression that no commit caused.
  { ignores: ["dist", "coverage", ".stryker-tmp"] },
  sonarjs.configs.recommended,
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "react-hooks/set-state-in-effect": "warn",
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
    },
  },
  {
    // `.bench.ts` is included: the benchmark reports by measuring and printing, and its
    // guard is the self-calibration block inside it, not an expect(). It is not part of
    // `npm test` — see vitest.bench.config.ts.
    files: ["**/*.test.ts", "**/*.test.tsx", "**/*.bench.ts"],
    rules: {
      "sonarjs/assertions-in-tests": "off",
    },
  },
  {
    // `scripts/shipgate.mjs` is byte-identical across all eight SPERT® Suite repos —
    // every repo-specific detail belongs in shipgate.config.json, never in the script.
    // This repo is the only one whose ESLint config carries the sonarjs plugin AND
    // reaches scripts/, so the exemption lives here rather than as a disable comment
    // in the shared file: a plugin-specific `eslint-disable` directive is a hard
    // "Definition for rule ... was not found" ERROR in every repo that does not
    // install that plugin, which would break the other seven gates.
    //
    // The command being executed comes from this repo's own committed
    // shipgate.config.json — not from user input, argv or the network. Anyone able to
    // edit that file can already run arbitrary npm scripts.
    files: ["scripts/**/*.mjs"],
    rules: {
      "sonarjs/os-command": "off",
    },
  },
  {
    // The copyright-header guard shells out to `git` (a fixed, argument-free
    // executable, no user input) and normalises comment framing with a small
    // anchored regex over one line of source at a time. Both are sonarjs
    // security *hotspots*, not defects, and neither is reachable from anything
    // an attacker controls.
    //
    // Scoped here rather than as in-file disable comments for the same reason
    // as the block above: this repo is the only one of the five carrying
    // eslint-plugin-sonarjs, and a disable directive for an uninstalled rule is
    // a hard "Definition for rule ... was not found" ERROR in the other four.
    // The five guard files are meant to stay near-identical, so the exemption
    // belongs in this repo's config, not in the shared source.
    files: ["src/integration/copyright-headers.test.ts"],
    rules: {
      "sonarjs/no-os-command-from-path": "off",
      "sonarjs/slow-regex": "off",
    },
  },
  {
    // The falsification runner shells out to `npx vitest` (a fixed executable and a fixed
    // argument list; the only variable is a test path from a committed spec file, never
    // user input or the network) and parses vitest's own summary lines with two small
    // anchored regexes, each applied to one line of output at a time. Same two sonarjs
    // security *hotspots*, same reasoning, and scoped here for the same cross-repo reason
    // as the two blocks above.
    //
    // ⚠️ Note what is NOT exempted: this file's `sonarjs/cognitive-complexity` finding was
    // FIXED, not suppressed — `main()` measured 17 and was decomposed to sit under the
    // threshold. The campaign's rule is that a new problem is fixed rather than baselined,
    // and that applies to its own tooling first.
    files: ["scripts/falsify.mjs"],
    rules: {
      "sonarjs/no-os-command-from-path": "off",
      "sonarjs/slow-regex": "off",
    },
  }
);
