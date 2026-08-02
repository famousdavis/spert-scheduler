// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Proof the Monte Carlo oracle can FAIL. Three engine mutations, each a plausible
// decomposition slip: a perturbed sample in each of the two sequential paths, and one
// in the dependency path.
const MC = new URL("../src/core/simulation/monte-carlo.ts", import.meta.url).pathname;
export const testFile = "src/core/simulation/monte-carlo-oracle.test.ts";
export const mutations = [
  {
    id: "O1  sequential in-progress path perturbed by 1e-7",
    file: MC,
    find: `          const sampled = distributions[info.distIndex]!.sample(rng);`,
    replace: `          const sampled = distributions[info.distIndex]!.sample(rng) * 1.0000001;`,
    expectFailing: /matches the pinned output/,
  },
  {
    id: "O2  sequential main path perturbed by 1e-7",
    file: MC,
    find: `        const sampled = distributions[i]!.sample(rng);`,
    replace: `        const sampled = distributions[i]!.sample(rng) * 1.0000001;`,
    expectFailing: /matches the pinned output/,
  },
  {
    id: "O3  dependency path perturbed by 1e-7",
    file: MC,
    find: `        const sampled = dist.sample(rng);`,
    replace: `        const sampled = dist.sample(rng) * 1.0000001;`,
    expectFailing: /matches the pinned output/,
  },
];
