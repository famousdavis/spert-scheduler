// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Falsification spec for a copied scenario keeping its source's seed (v0.76.0).
//
// `cloneScenario` copies the source's settings whole, so the copy keeps the source's random seed:
// an unchanged copy reproduces its source exactly. Every way the app copies a scenario reaches
// that one function — Clone, Add Scenario, a cloned project, the sample load, an import kept as
// a copy. Each straw below names EXACTLY the tests it must fail, and no others — read "K failing;
// named-match K", not merely a non-zero exit: the runner prints ✔ when ANY named test fails. Each
// expected set is written here before the run, never inferred from it.
//
// testFile is all of src/, so one run reaches the service, integration and sample tests together.
const SERVICE = new URL("../src/app/api/project-service.ts", import.meta.url).pathname;

// project-service.test.ts — "cloneScenario" and "cloneProject".
const C_IDS = "produces new IDs for clone and activities";
const P_SEEDS = "keeps every scenario's seed, while every id is new";
// scenario-cloning.test.ts — "Scenario cloning" and "An unchanged copy simulates exactly like its source".
const I_IDS = "clone generates new IDs for everything";
const N_SEQ = "sequential mode: the copy's percentiles and mean equal its source's; a fresh seed changes them";
const N_DEP = "dependency mode: the copy's percentiles and mean equal its source's; a fresh seed changes them";
// full-workflow.test.ts — "Full workflow integration test".
const W_FLOW = "create project -> add activities -> simulate -> schedule -> clone -> persist -> reload";
// sample-project-service.test.ts — "buildSampleProject".
const S_SAMPLE = "keeps the fixture's own seed on every load";

const escape = (s) => s.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

/** Matches exactly these test titles, as the verbose reporter prints them. */
const only = (...titles) => new RegExp(`> (?:${titles.map(escape).join("|")})$`);

const KEEPS_SEED = "    settings: { ...scenario.settings },\n";

export const testFile = "src/";
export const mutations = [
  {
    // The behaviour before v0.76.0: every copy minted a new seed. Each test that compares a
    // copy's seed or numbers with its source's (or the sample's seed with its fixture's) fails.
    id: "S1  the copy mints a new seed again  [expect 7: C_IDS, P_SEEDS, I_IDS, N_SEQ, N_DEP, W_FLOW, S_SAMPLE]",
    file: SERVICE,
    find: KEEPS_SEED,
    replace: "    settings: { ...scenario.settings, rngSeed: generateId() },\n",
    expectFailing: only(C_IDS, P_SEEDS, I_IDS, N_SEQ, N_DEP, W_FLOW, S_SAMPLE),
  },
  {
    // A fixed seed is just as repeatable, but it is not the SOURCE's: the same seven fail, because
    // each compares the copy with its source (or the sample with its fixture), never with itself.
    id: "S2  the copy gets a fixed seed, not its source's  [expect 7: C_IDS, P_SEEDS, I_IDS, N_SEQ, N_DEP, W_FLOW, S_SAMPLE]",
    file: SERVICE,
    find: KEEPS_SEED,
    replace: '    settings: { ...scenario.settings, rngSeed: "x" },\n',
    expectFailing: only(C_IDS, P_SEEDS, I_IDS, N_SEQ, N_DEP, W_FLOW, S_SAMPLE),
  },
];
