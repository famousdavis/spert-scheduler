// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Falsification spec for "a Run for each scenario in Compare, and no false S-curve after a reload"
// (v0.75.0).
//
// One straw per behaviour. Each names EXACTLY the tests it must fail, and no others, written down
// here before the run — read "K failing; named-match K" with K equal to the count in the id, not
// merely a ✔ (the runner prints ✔ when ANY named test fails). A straw that fails more than its set
// is a finding too; under load, read the extra failure's NAME before believing it.
//
// Scope is the whole of src/: the page tests, the hook test, the table, the model, the sentences and
// the copy helper all have to be in the run for a set to be complete.
const COMPONENT = new URL("../src/ui/components/ScenarioComparison.tsx", import.meta.url).pathname;
const MODEL = new URL("../src/ui/helpers/comparison-model.ts", import.meta.url).pathname;
const SENTENCES = new URL("../src/ui/helpers/flag-sentences.ts", import.meta.url).pathname;
const COPY = new URL("../src/ui/helpers/export-chart.ts", import.meta.url).pathname;
const HOOK = new URL("../src/ui/hooks/use-compare-runs.ts", import.meta.url).pathname;
const PAGE = new URL("../src/ui/pages/ProjectPage.tsx", import.meta.url).pathname;

// ScenarioComparison.test.tsx — the Run row.
const SC_NO_PROP = "no onRunScenario, no Run row — control: the same scenarios WITH it get the row";
const SC_UNDER = "a Run button exactly under the columns offered one: unrun or stripped, never run or flagged";
const SC_RUNNING = "'Running...' for an id in runningIds, and no button there — the other column keeps its Run";
const SC_NO_ROW = "no row while nothing is offered or running — control: a running id brings it back";
const SC_CLICK = "a click calls onRunScenario with that id, AFTER focus has moved to that column's header";
const SC_QUOTE = "an imported id holding a quote still finds its header: no selector is built from the id";
const SC_SKIP = "the row carries data-capture-skip, so the copied picture leaves it out";
const SC_DARK = "no dark: class in the captured region with the Run row rendered — control: the region holds the row itself";
const SC_HEADERS = "the column headers' accessible names are unchanged with the row present";
// ProjectPage.compare-run.test.tsx — the page, on the real engine.
const PG1 =
  "runs the scenario where it is: its column fills, the tab on screen stays, focus is on its header, and the status says so";
const PG2 = "gives the numbers the scenario's own Run Simulation gives: its trials and its seed";
const PG3 = "the LIVE gate: a cell the press's blur refuses stops the on-screen scenario's Run in the still-held row";
// comparison-model.test.ts — the offer and the note.
const CM_PER_COLUMN = "run → no; unrun and runnable → yes; flagged, empty and cyclic → no";
const CM_GATE = "the on-screen gate refusing → no Run there; a gate on another scenario changes nothing";
const CM_STRIPPED_COLUMNS = "results without samples: runnable → yes; flagged → no; with samples → no";
const CM_BESIDE_FLAGGED = "two unrun beside a flagged one → both by name, not 'all': the flagged one needs a fix, not a run";
const CM_CANNOT_RUN = "a stripped scenario that cannot run — flagged, or refused on screen — is neither offered nor named";
const CM_RUN_UNRUN = "one run + one unrun → the unrun one by name (the corrected state: never 'all' beside results)";
const CM_PAPER_PLAN_B = "paper, no gate: the saved plan can run, so it asks for Plan B";
const CM_BOTH_SENTENCES = "an unrun AND a stripped one → both sentences, joined by ONE space";
const CM_ONE_OF_THREE = "one stripped beside two run → two datasets, a Run under the stripped one, and the curve sentence";
const CM_ONE_OF_TWO = "one stripped beside one run → no S-curves (a single curve is not a comparison)";
const CM_BOTH_STRIPPED = "both stripped — the reload → the curve sentence ALONE, no leading space, and no S-curves";
const CM_THREE_STRIPPED = "three stripped → 'A, B and C'";
const CM_PAPER_NO_GATE = "paper passes no gate: a scenario refused on screen is still offered in the model and named";
// flag-sentences.test.ts — the curve sentence.
const FS_ONE = "one name: 'has no curve', 'its', and the name again";
const FS_TWO = "two names: 'have no curves', 'their', 'them'";
const FS_THREE = "three, listed as the run sentence lists them";
// use-compare-runs.test.ts — the hook over a mocked service.
const HK_OWN = "the scenario's OWN trial count, seed and params: sequential, with Parkinson's floor";
const HK_DEP = "dependency mode: the dependency params, keyed by activity, and no sequential floor";
const HK_GENERATION =
  "complete after the generation moved (a sign-out): nothing stored, the status cleared — control: unmoved, stored";
const HK_IN_FLIGHT = "a second run of an id already in flight → no second dispatch, even in the same task";
const HK_EMPTY = "a scenario with NO activities → no dispatch (control: one with an activity → a dispatch)";
// export-chart.capture-skip.test.ts — the copy helper.
const CP_SKIP = "an element carrying data-capture-skip, as it leaves out a copy button; never a plain element";

const escape = (s) => s.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

/** Matches exactly these test titles, as the verbose reporter prints them. */
const only = (...titles) => new RegExp(`> (?:${titles.map(escape).join("|")})$`);

export const testFile = "src/";
export const mutations = [
  {
    // The table never mounts its Run row: every test that clicks, reads or counts a Run fails — the
    // status line, mounted in the chrome bar, does not depend on the row and stays green.
    id: "S1  the Run row never rendered  [expect 12: SC×9, PG1, PG2, PG3]",
    file: COMPONENT,
    find: "            {onRunScenario && (\n              <RunRow columns={model.columns} runningIds={runningIds} onRunScenario={onRunScenario} />\n            )}\n",
    replace: "",
    expectFailing: only(SC_NO_PROP, SC_UNDER, SC_RUNNING, SC_NO_ROW, SC_CLICK, SC_QUOTE, SC_SKIP, SC_DARK, SC_HEADERS, PG1, PG2, PG3),
  },
  {
    // The column's offer forgets `canRun`; the note does not (it is built from `offersRun` itself),
    // so only the tests that read `offerRun` or a Run button under a scenario that cannot run fail.
    id: "S2  offerRun ignoring canRun  [expect 7: CM_PER_COLUMN, CM_GATE, CM_STRIPPED_COLUMNS, CM_BESIDE_FLAGGED, CM_CANNOT_RUN, SC_UNDER, PG3]",
    file: MODEL,
    find: "      offerRun: offersRun(e, runGate),",
    replace: "      offerRun: !drawsCurve(e),",
    expectFailing: only(CM_PER_COLUMN, CM_GATE, CM_STRIPPED_COLUMNS, CM_BESIDE_FLAGGED, CM_CANNOT_RUN, SC_UNDER, PG3),
  },
  {
    // 10,000 trials, the preference default, instead of the scenario's own: the hook's dispatch
    // tests read the count, and the page's same-numbers test sees a Compare run that the scenario's
    // own Run Simulation (1,000 trials) does not reproduce.
    id: "S3  a fixed trial count in the hook  [expect 3: HK_OWN, HK_DEP, PG2]",
    file: HOOK,
    find: "        scenario.settings.trialCount,\n        scenario.settings.rngSeed,",
    replace: "        10000,\n        scenario.settings.rngSeed,",
    expectFailing: only(HK_OWN, HK_DEP, PG2),
  },
  {
    // The handler selects the scenario's tab before it runs it. Only the page test that checks the
    // tab on screen sees it: the numbers are the same from either tab, and the live-gate test's run
    // is refused before the switch.
    id: "S4  the handler switching the tab  [expect 1: PG1]",
    file: PAGE,
    find: "      runCompare(id, scenarioId, workCalendar);",
    replace: "      setActiveScenarioId(scenarioId);\n      runCompare(id, scenarioId, workCalendar);",
    expectFailing: only(PG1),
  },
  {
    // Focus is left on the button the run removes.
    id: "S5  the focus move removed  [expect 3: SC_CLICK, SC_QUOTE, PG1]",
    file: COMPONENT,
    find: "    Array.from(headers ?? []).find((th) => th.dataset.scenarioId === scenarioId)?.focus();\n",
    replace: "",
    expectFailing: only(SC_CLICK, SC_QUOTE, PG1),
  },
  {
    id: "S6  data-capture-skip dropped from ignoreElements  [expect 1: CP_SKIP]",
    file: COPY,
    find: '    ignoreElements: (el) => el.classList.contains("copy-image-button") || el.hasAttribute("data-capture-skip"),',
    replace: '    ignoreElements: (el) => el.classList.contains("copy-image-button"),',
    expectFailing: only(CP_SKIP),
  },
  {
    // A result that lands after a sign-out is stored.
    id: "S7  the generation check removed  [expect 1: HK_GENERATION]",
    file: HOOK,
    find: '            if (currentSimulationGeneration() !== startGen) {\n              setRunStatus("");\n              return;\n            }\n',
    replace: "",
    expectFailing: only(HK_GENERATION),
  },
  {
    // Two clicks in one task both dispatch. The page's runs finish inside the click, so no page test
    // can see it — only the hook's.
    id: "S8  the in-flight guard removed  [expect 1: HK_IN_FLIGHT]",
    file: HOOK,
    find: "      if (runningRef.current.has(scenarioId)) return;\n",
    replace: "",
    expectFailing: only(HK_IN_FLIGHT),
  },
  {
    id: "S9  the no-activities guard removed  [expect 1: HK_EMPTY]",
    file: HOOK,
    find: "      if (!scenario || scenario.activities.length === 0) return;",
    replace: "      if (!scenario) return;",
    expectFailing: only(HK_EMPTY),
  },
  {
    // The held row's Run reaches the hook, which reads the SAVED plan — valid, because the refused
    // cell was never stored — and runs it.
    id: "S10 the page's live-gate check removed  [expect 1: PG3]",
    file: PAGE,
    find: "      if (scenarioId === activeScenarioId && !validity.runnable) {\n        toast.error(runBlockedMessage(validity.runBlockers));\n        return;\n      }\n",
    replace: "",
    expectFailing: only(PG3),
  },
  {
    // Before v0.75.0: "all scenarios" whenever every compared scenario CAN run, results or not.
    id: "S11 'all scenarios' back to every-can-run  [expect 3: CM_RUN_UNRUN, CM_PAPER_PLAN_B, CM_BOTH_SENTENCES]",
    file: MODEL,
    find: "unrun.length === entries.length),",
    replace: "entries.every((e) => canRun(e, gate))),",
    expectFailing: only(CM_RUN_UNRUN, CM_PAPER_PLAN_B, CM_BOTH_SENTENCES),
  },
  {
    // Before v0.75.0: `[]` is truthy, so a reloaded scenario kept a (flat) curve.
    id: "S12 cdfOf back to the truthy samples test  [expect 3: CM_ONE_OF_THREE, CM_ONE_OF_TWO, CM_BOTH_STRIPPED]",
    file: MODEL,
    find: "  const withSamples = entries.filter(drawsCurve);",
    replace: "  const withSamples = entries.filter((e) => e.scenario.simulationResults?.samples);",
    expectFailing: only(CM_ONE_OF_THREE, CM_ONE_OF_TWO, CM_BOTH_STRIPPED),
  },
  {
    // One name gets the plural sentence, several the singular one.
    id: "S13 the curve sentence's singular and plural swapped  [expect 9: FS_ONE, FS_TWO, FS_THREE, CM_ONE_OF_THREE, CM_BOTH_STRIPPED, CM_THREE_STRIPPED, CM_BOTH_SENTENCES, CM_CANNOT_RUN, CM_PAPER_NO_GATE]",
    file: SENTENCES,
    find: "  if (names.length === 1) {\n    return `${names[0]} has no curve",
    replace: "  if (names.length !== 1) {\n    return `${names[0]} has no curve",
    expectFailing: only(FS_ONE, FS_TWO, FS_THREE, CM_ONE_OF_THREE, CM_BOTH_STRIPPED, CM_THREE_STRIPPED, CM_BOTH_SENTENCES, CM_CANNOT_RUN, CM_PAPER_NO_GATE),
  },
];
