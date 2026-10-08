// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Falsification spec for three small changes made together:
//
//   WI-104 — the Sensitivity panel says what each sort ranks by, says in dependency mode that the
//            ranking ignores dependencies, shows its rank without a "#", and names each activity
//            "#N <name>" when the project numbers its activities;
//   WI-105 — every Run refusal (the line under Run, the summary card's links, Compare's Run for the
//            scenario on screen and for another) names an activity "#N <name>" when the project
//            numbers its activities, and exactly as before when it does not;
//   WI-108 — a second clone of a scenario is offered "(Copy 2)", read when the window opens.
//
// One straw per guarded link. Each names EXACTLY the tests it must fail, and no others, written here
// before the run — read "K failing; named-match K" with K the count in the id, not merely a ✔ (the
// runner prints ✔ when ANY named test fails). Every straw runs the WHOLE suite ("src/"), so one that
// also broke a test elsewhere shows as K above its named-match.
const PANEL = new URL("../src/ui/components/SensitivityPanel.tsx", import.meta.url).pathname;
const SIM = new URL("../src/ui/components/SimulationPanel.tsx", import.meta.url).pathname;
const MESSAGE = new URL("../src/ui/helpers/run-blocked-message.ts", import.meta.url).pathname;
const HOOK = new URL("../src/ui/hooks/use-compare-runs.ts", import.meta.url).pathname;
const DIALOG = new URL("../src/ui/components/CloneScenarioDialog.tsx", import.meta.url).pathname;
const PAGE = new URL("../src/ui/pages/ProjectPage.tsx", import.meta.url).pathname;

// SensitivityPanel.test.tsx — "SensitivityPanel — what the ranking reads (WI-104)".
const SP1 = "Impact, the default sort: the line names the activity's own 95th percentile and a 10% rise";
const SP2 = "Variance Contribution: the line names a share of the variance of every activity ranked here";
const SP3 = "Relative Uncertainty: the line names the standard deviation as a share of the mean";
const SP4 = "in dependency mode, a note above the list says the ranking does not account for dependencies";
const SP5 = "outside dependency mode there is no note";
const SP6 = "the rank badge shows the rank alone, with a visually hidden 'Rank ' before it";
const SP7 = "with the page's numbers, each name reads '#N name', and the number is outside the name's own span";
// ProjectPage.test.tsx — the panel's inputs, and the clone window opened twice.
const PS1 = "dependency mode and numbered activities: the note shows, and each name carries its grid number";
const PS2 = "CONTROL: sequential mode, unnumbered: no note, and each name alone";
const PC1 = "WI-108: a second clone of the same scenario is offered '(Copy 2)', not the first copy's name";
const PC2 = "WI-108: after cloning one scenario, cloning ANOTHER is offered that one's own name";
// run-blocked-message.test.ts — "the activity's #N in a Run refusal (WI-105)".
const RB1 = "describeProblem: '#4 Design (…)' with a number, the name alone without one";
const RB2 = "runBlockedMessage: each named activity with its number, then the count of the rest";
const RB3 = "an activity the numbers do not hold is named alone, beside one they do";
// use-compare-runs.test.ts — Compare's Run for a scenario NOT on screen.
const HK1 = "WI-105: a FLAGGED plan in a project that numbers its activities → each row by its #N in ITS scenario";
const HK_UNNUMBERED = "a FLAGGED saved plan → the Run-blocked toast and no dispatch";
// ProjectPage.estimate-validity.test.tsx — the line under Run and both summary-card links.
const PV1 = "numbered: the line under Run and both links' toasts say '#2 Vireo cutover'";
// ProjectPage.compare-run.test.tsx — Compare's Run for the scenario on screen (the live gate).
const PG4 = "WI-105: in a project that numbers its activities, the live gate's toast names the row '#1'";
// CloneScenarioDialog.test.tsx — the proposed name.
const CD2 = "proposes 'Baseline (Copy 2)' once 'Baseline (Copy)' is taken";
const CD3 = "proposes 'Baseline (Copy 3)' when '(Copy)' and '(Copy 2)' are both taken";

const escape = (s) => s.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

/** Matches exactly these test titles, as the verbose reporter prints them. */
const only = (...titles) => new RegExp(`> (?:${titles.map(escape).join("|")})$`);

const NOTE_GATE = "      {dependencyMode && (\n";
const PANEL_PROPS =
  "              activities={scenario.activities}\n" +
  "              dependencyMode={scenario.settings.dependencyMode}\n" +
  "              activityNumberMap={activityNumberMap}\n" +
  "            />";
const NAME_SPANS =
  '          {number !== undefined && <span className="shrink-0 tabular-nums">#{number}</span>}\n' +
  '          {number !== undefined && " "}\n' +
  '          <span className="truncate">{nameOrUnnamed(result.activityName)}</span>\n';
const HOOK_NUMBERS = "const numbers = project?.showActivityIds ? new Map";

export const testFile = "src/";
export const mutations = [
  // ── WI-104: the Sensitivity panel ─────────────────────────────────────────────────────────
  {
    id: "W1  the old Impact line returns  [expect 1: SP1]",
    file: PANEL,
    find: '    "Ranks each activity by its own estimates: about how many days its 95th-percentile duration grows if its estimates rise 10%.",\n',
    replace: '    "Activities ranked by their contribution to project schedule uncertainty.",\n',
    expectFailing: only(SP1),
  },
  {
    id: "W2  the line ignores the sort: always Impact's  [expect 2: SP2, SP3]",
    file: PANEL,
    find: "{SORT_DESCRIPTIONS[sortField]}",
    replace: "{SORT_DESCRIPTIONS.impact}",
    expectFailing: only(SP2, SP3),
  },
  {
    id: "W3  the note never shows  [expect 2: SP4, PS1]",
    file: PANEL,
    find: NOTE_GATE,
    replace: "      {dependencyMode && activities.length < 0 && (\n",
    expectFailing: only(SP4, PS1),
  },
  {
    id: "W4  the note shows outside dependency mode too  [expect 2: SP5, PS2]",
    file: PANEL,
    find: NOTE_GATE,
    replace: "      {(dependencyMode || activities.length > 0) && (\n",
    expectFailing: only(SP5, PS2),
  },
  {
    id: "W5  the note loses role=\"note\"  [expect 2: SP4, PS1]",
    file: PANEL,
    find: '          role="note"\n',
    replace: "",
    expectFailing: only(SP4, PS1),
  },
  {
    id: "W6  the note loses its second sentence  [expect 1: SP4]",
    file: PANEL,
    find: ' To see what changing an activity does to the finish, try it in a copy of this scenario and compare the two.";',
    replace: '";',
    expectFailing: only(SP4),
  },
  {
    id: "W7  the page hands the panel dependencyMode={false}  [expect 1: PS1]",
    file: PAGE,
    find: PANEL_PROPS,
    replace: PANEL_PROPS.replace("dependencyMode={scenario.settings.dependencyMode}", "dependencyMode={false}"),
    expectFailing: only(PS1),
  },
  {
    id: "W8  the page hands the panel no numbers  [expect 1: PS1]",
    file: PAGE,
    find: PANEL_PROPS,
    replace: PANEL_PROPS.replace("activityNumberMap={activityNumberMap}", "activityNumberMap={null}"),
    expectFailing: only(PS1),
  },
  {
    id: "W9  the badge shows '#1' again  [expect 2: SP6, SP7]",
    file: PANEL,
    find: '        <span className="sr-only">Rank </span>\n        {rank}\n',
    replace: "        #{rank}\n",
    expectFailing: only(SP6, SP7),
  },
  {
    id: "W10 'Rank ' is visible, not visually hidden  [expect 1: SP6]",
    file: PANEL,
    find: '<span className="sr-only">Rank </span>',
    replace: "<span>Rank </span>",
    expectFailing: only(SP6),
  },
  {
    id: "W11 the row drops the #N  [expect 2: SP7, PS1]",
    file: PANEL,
    find: '          {number !== undefined && <span className="shrink-0 tabular-nums">#{number}</span>}\n',
    replace: "",
    expectFailing: only(SP7, PS1),
  },
  {
    // The number inside the span that truncates: a long name would cut it off.
    id: "W12 the #N inside the truncated span  [expect 2: SP7, PS1]",
    file: PANEL,
    find: NAME_SPANS,
    replace: '          <span className="truncate">{number !== undefined && `#${number} `}{nameOrUnnamed(result.activityName)}</span>\n',
    expectFailing: only(SP7, PS1),
  },
  {
    id: "W13 the panel never looks a number up  [expect 2: SP7, PS1]",
    file: PANEL,
    find: "            number={activityNumberMap?.get(result.activityId)}\n",
    replace: "            number={undefined}\n",
    expectFailing: only(SP7, PS1),
  },

  // ── WI-105: the Run refusals ──────────────────────────────────────────────────────────────
  {
    id: "R1  numberedName ignores the numbers  [expect 6: RB1, RB2, RB3, HK1, PV1, PG4]",
    file: MESSAGE,
    find: "  return number === undefined ? problem.name : `#${number} ${problem.name}`;\n",
    replace: "  return problem.name;\n",
    expectFailing: only(RB1, RB2, RB3, HK1, PV1, PG4),
  },
  {
    id: "R2  describeProblem does not pass the numbers on  [expect 6: RB1, RB2, RB3, HK1, PV1, PG4]",
    file: MESSAGE,
    find: "  return `${numberedName(problem, numbers)} (",
    replace: "  return `${numberedName(problem)} (",
    expectFailing: only(RB1, RB2, RB3, HK1, PV1, PG4),
  },
  {
    id: "R3  runBlockedMessage does not pass the numbers on  [expect 5: RB2, RB3, HK1, PV1, PG4]",
    file: MESSAGE,
    find: ".map((blocker) => describeProblem(blocker, numbers));",
    replace: ".map((blocker) => describeProblem(blocker));",
    expectFailing: only(RB2, RB3, HK1, PV1, PG4),
  },
  {
    id: "R4  the summary card's links toast without numbers  [expect 1: PV1]",
    file: PAGE,
    find: "    if (!validity.runnable) {\n      toast.error(runBlockedMessage(validity.runBlockers, activityNumberMap));\n",
    replace: "    if (!validity.runnable) {\n      toast.error(runBlockedMessage(validity.runBlockers));\n",
    expectFailing: only(PV1),
  },
  {
    id: "R5  Compare's Run for the scenario on screen toasts without numbers  [expect 1: PG4]",
    file: PAGE,
    find:
      "      if (scenarioId === activeScenarioId && !validity.runnable) {\n" +
      "        toast.error(runBlockedMessage(validity.runBlockers, activityNumberMap));\n",
    replace:
      "      if (scenarioId === activeScenarioId && !validity.runnable) {\n" +
      "        toast.error(runBlockedMessage(validity.runBlockers));\n",
    expectFailing: only(PG4),
  },
  {
    id: "R6  the page hands SimulationPanel no numbers  [expect 1: PV1]",
    file: PAGE,
    find: "            runBlockers={validity.runBlockers}\n            activityNumberMap={activityNumberMap}\n",
    replace: "            runBlockers={validity.runBlockers}\n",
    expectFailing: only(PV1),
  },
  {
    id: "R7  SimulationPanel does not pass the numbers to the line under Run  [expect 1: PV1]",
    file: SIM,
    find: "<RunBlockedReason blockers={runBlockers} activityNumberMap={activityNumberMap} />",
    replace: "<RunBlockedReason blockers={runBlockers} />",
    expectFailing: only(PV1),
  },
  {
    id: "R8  the line under Run shows the bare name  [expect 1: PV1]",
    file: SIM,
    find: "{numberedName(b, activityNumberMap)}",
    replace: "{b.name}",
    expectFailing: only(PV1),
  },
  {
    id: "R9  Compare's Run for another scenario never numbers  [expect 1: HK1]",
    file: HOOK,
    find: HOOK_NUMBERS,
    replace: "const numbers = !project ? new Map",
    expectFailing: only(HK1),
  },
  {
    id: "R10 Compare's Run for another scenario numbers an unnumbered project  [expect 1: HK_UNNUMBERED]",
    file: HOOK,
    find: HOOK_NUMBERS,
    replace: "const numbers = project ? new Map",
    expectFailing: only(HK_UNNUMBERED),
  },
  {
    // The number by place among the FLAGGED rows, not in the scenario's own grid.
    id: "R11 numbered by place among the flagged  [expect 1: HK1]",
    file: HOOK,
    find: "new Map(flags.rows.map((row) => [row.id, row.position]))",
    replace: "new Map(flags.rows.map((row, i) => [row.id, i + 1]))",
    expectFailing: only(HK1),
  },

  // ── WI-108: the clone window's proposed name ──────────────────────────────────────────────
  {
    id: "C1  the window proposes '(Copy)' every time  [expect 3: CD2, CD3, PC1]",
    file: DIALOG,
    find: "useState(() => nextCloneName(sourceName, existingNames))",
    replace: "useState(() => `${sourceName} (Copy)`)",
    expectFailing: only(CD2, CD3, PC1),
  },
  {
    id: "C2  the page hands the window no names  [expect 1: PC1]",
    file: PAGE,
    find: "          existingNames={project.scenarios.map((s) => s.name)}\n",
    replace: "          existingNames={[]}\n",
    expectFailing: only(PC1),
  },
  {
    // Mounted throughout, as before WI-108: the name is read at the FIRST opening only.
    id: "C3  the window stays mounted between openings  [expect 2: PC1, PC2]",
    file: PAGE,
    find: "      {cloneSource && cloneDialogOpen && (\n",
    replace: "      {cloneSource && (\n",
    expectFailing: only(PC1, PC2),
  },
];
