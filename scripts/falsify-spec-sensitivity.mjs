// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Falsification spec for the Sensitivity panel showing each activity's own distribution (v0.76.2).
//
// `computeSensitivityAnalysis` takes each row's mean and SD from the distribution the simulation
// builds for it, leaves out a row whose estimates are out of order or whose distribution the
// factory refuses, and the panel counts the rows left out in one line. Each straw below names
// EXACTLY the tests it must fail, and no others — read "K failing; named-match K", not merely a
// non-zero exit: the runner prints ✔ when ANY named test fails. Each expected set is written here
// before the run, never inferred from it.
//
// testFile is all of src/, so one run also reaches every page test that renders the panel.
const CORE = new URL("../src/core/analytics/sensitivity.ts", import.meta.url).pathname;
const PANEL = new URL("../src/ui/components/SensitivityPanel.tsx", import.meta.url).pathname;

// sensitivity.test.ts — "each activity's own distribution — the one the simulation samples".
const T1_TRIANGULAR = "Triangular: its own mean and SD, whatever the Confidence level";
const T2_UNIFORM = "Uniform: the midpoint and range / √12";
const T3_BETA_PERT = "Beta-PERT: the SD of the symmetric Beta(β, β) at its level, whatever the skew";
const T5_AGREES = "agrees with the distribution the simulation builds, for every type and level";
const T6_OUT_OF_ORDER = "leaves out an activity whose estimates are out of order, or LogNormal at zero";
const T7_UNDERFLOW = "leaves out a LogNormal whose estimates are too small to give it a mean";
const T8_SWEEP = "never throws or shows a negative SD, and leaves out exactly the flagged estimates";
// sensitivity.test.ts — "computeSensitivityAnalysis", the tests that were there before v0.76.2.
const E_ONE = "returns one result for a single activity";
const E_SORTED = "returns results sorted by impact score descending";
const E_ALL_EQUAL = "all-equal estimates produce zero variance but mean-shift impact";
// SensitivityPanel.test.tsx — "SensitivityPanel".
const T10_SINGULAR = "counts one left-out activity in the singular, and does not list it";
const T11_PLURAL = "counts two left-out activities in the plural";
const T12_OWN_FIGURES = "shows a Triangular activity's own mean and SD";
const T13_TINY = "still renders beside a LogNormal too small to have a mean, and counts it as left out";

const escape = (s) => s.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

/** Matches exactly these test titles, as the verbose reporter prints them. */
const only = (...titles) => new RegExp(`> (?:${titles.map(escape).join("|")})$`);

export const testFile = "src/";
export const mutations = [
  {
    // The figures before v0.76.2: every row a T-Normal's PERT mean and SD. The factory still
    // runs above the edit, so every refusal is still caught and every left-out row stays out.
    id: "S1  a T-Normal's figures for every type  [expect 5: T1, T2, T3, T5, T12]",
    file: CORE,
    find: "    return { mean: distribution.mean(), sd: Math.sqrt(distribution.variance()) };\n",
    replace:
      "    return {\n      mean: (activity.min + 4 * activity.mostLikely + activity.max) / 6,\n" +
      "      sd: activity.sdOverride ?? (activity.max - activity.min) * RSM_VALUES[activity.confidenceLevel],\n    };\n",
    also: {
      find: 'import type { Activity } from "@domain/models/types";\n',
      replace:
        'import type { Activity } from "@domain/models/types";\nimport { RSM_VALUES } from "@domain/models/types";\n',
    },
    expectFailing: only(T1_TRIANGULAR, T2_UNIFORM, T3_BETA_PERT, T5_AGREES, T12_OWN_FIGURES),
  },
  {
    // No order rule: a row whose distribution builds although the grid flags it — a Uniform
    // ignores Most Likely — is ranked. Rows the factory refuses are still caught, so the panel
    // tests, whose left-out rows all throw, hold.
    id: "S2  the order rule admits every row  [expect 2: T6, T8]",
    file: CORE,
    find: "  return estimateOrderIssues(activity.min, activity.mostLikely, activity.max).length === 0;\n",
    replace: "  return true;\n",
    expectFailing: only(T6_OUT_OF_ORDER, T8_SWEEP),
  },
  {
    // No catch: an in-order row the factory refuses — a LogNormal at zero, or one whose mean
    // underflows — throws out of the analysis, and out of the panel's render.
    id: "S3  a refused distribution throws  [expect 4: T6, T7, T8, T13]",
    file: CORE,
    find: "  } catch {\n    return null;\n  }\n",
    replace: "  } catch (error) {\n    throw error;\n  }\n",
    expectFailing: only(T6_OUT_OF_ORDER, T7_UNDERFLOW, T8_SWEEP, T13_TINY),
  },
  {
    // One left-out row is counted in the plural.
    id: "S4  one left out reads as plural  [expect 2: T10, T13]",
    file: PANEL,
    find: "  return count === 1\n",
    replace: "  return count === 0\n",
    expectFailing: only(T10_SINGULAR, T13_TINY),
  },
  {
    // The line never shows.
    id: "S5  the left-out line never shows  [expect 3: T10, T11, T13]",
    file: PANEL,
    find: "      {leftOut > 0 && (\n",
    replace: "      {leftOut < 0 && (\n",
    expectFailing: only(T10_SINGULAR, T11_PLURAL, T13_TINY),
  },
  {
    // The what-if no longer scales the estimates, so every Impact is zero — except a row whose
    // SD is set directly, which stays scaled here; that keeps "sdOverride is used when provided"
    // green, so exactly the three Impact tests that predate this release fail.
    id: "S6  the what-if leaves the estimates unscaled  [expect 3: E_ONE, E_SORTED, E_ALL_EQUAL]",
    file: CORE,
    find: "    min: activity.min * 1.1,\n    mostLikely: activity.mostLikely * 1.1,\n    max: activity.max * 1.1,\n",
    replace: "    min: activity.min,\n    mostLikely: activity.mostLikely,\n    max: activity.max,\n",
    expectFailing: only(E_ONE, E_SORTED, E_ALL_EQUAL),
  },
];
