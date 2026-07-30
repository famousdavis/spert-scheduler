// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import sonarjs from "eslint-plugin-sonarjs";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: [".claude/**"] },
  { ignores: ["dist", "coverage"] },
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
    files: ["**/*.test.ts", "**/*.test.tsx"],
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
  }
);
