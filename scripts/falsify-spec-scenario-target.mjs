// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Falsification spec for WI-124 (owner ruling, 2026-10-16): the Finish Target date is kept per scenario, schema 24 → 25.
// The upgrade gives every scenario of a stored project that project's date — a locked scenario included — or none if it
// had none (the key left absent, never today's date), leaves a scenario that already holds the key alone, and removes the
// project-level key; it is a step of the ladder, and the schema version says so. The setter changes the scenario it names
// and no other, refuses a locked one, leaves the scenario's run in place and is one undo entry. A new scenario made from
// another starts with that scenario's date — a locked one's included — and Clone Project copies each scenario's own; the
// other paths that make a scenario start with none. Every reader takes the ACTIVE scenario's date: the summary card and
// its colour (the RAG memo's inputs included), the Gantt's line and its checkbox, the printed summary's row and the
// printed Gantt's line. Whether the Gantt shows the date stays one choice for the project; clearing a date turns it off
// only when no scenario of the project has a date left, and the checkbox shows unchecked where the scenario has no date
// — those two are the owner's ruling (2026-10-18), and S12, S13 and S24 are the options set against it. Where the
// scenario has no date, the checkbox's tooltip says to set that scenario's date in the summary card, or, in a locked
// scenario, to unlock it first (owner ruling, 2026-10-18).
//
// Each straw breaks ONE guarantee. The WRONG DESIGNS are the tempting ones: the upgrade filling only the first scenario,
// or skipping the locked one; filling a project with no date with today's date; leaving every scenario empty; the step
// left out of the ladder; the schema version not raised; the project-level key kept; the step overwriting a scenario's
// own date; null for "none" in place of an absent key; the copy of a scenario dropping the date, or the copy of a locked
// one dropping it; the setter writing every scenario (the behaviour before this change), bypassing the lock, dropping
// the run, or leaving no undo entry; each reader still reading the project — the printed row, the printed Gantt, the RAG
// memo's inputs, the card, the Gantt's line, the checkbox's enabled state — and the card still writing the project; a
// new scenario added to a project inheriting another's date; and the checkbox's tooltip keeping its words from before
// this change, or ignoring the lock. Each straw names EXACTLY the tests it must fail, and no others — read "K failing;
// named-match K", not merely a non-zero exit: the runner prints ✔ when ANY named test fails. Each expected set was
// written before the run that first included it; three — S5's, S20's and S23's — were then corrected by name from that
// run, each with its reason beside it, S23's after two tests were made to read what it breaks. Nine — S1's, S3's, S4's,
// S5's, S6's, S9's, S11's, S21's and S23's — were later extended by name, before their next run, with tests added after
// them: the cloud driver's tests of the save a load makes to upgrade a project (WI-128), which read each scenario's
// date after the upgrade, and the checkbox's tooltip test.
//
// NOT HERE, on purpose: the CONTROLS that no tempting design reaches — New Project, a scenario Import Activities adds,
// the sample project and a copy of a scenario with no date all start with none. They pass on the build before this
// change as on this one, and each guards a path a later change could teach to inherit a date.
//
// testFile is all of src/, so every straw runs against the whole suite.
const MIG = new URL("../src/infrastructure/persistence/migrations.ts", import.meta.url).pathname;
const TYPES = new URL("../src/domain/models/types.ts", import.meta.url).pathname;
const SVC = new URL("../src/app/api/project-service.ts", import.meta.url).pathname;
const STORE = new URL("../src/ui/hooks/use-project-store.ts", import.meta.url).pathname;
const PAGE = new URL("../src/ui/pages/ProjectPage.tsx", import.meta.url).pathname;
const REPORT = new URL("../src/ui/components/PrintableReport.tsx", import.meta.url).pathname;
const SECTIONS = new URL("../src/ui/components/print-sections.tsx", import.meta.url).pathname;
const GANTT = new URL("../src/ui/charts/GanttChart.tsx", import.meta.url).pathname;

// scenario-target-upgrade.test.ts — what 0.77.2 saved, after the upgrade
const U_EVERY = "gives every scenario the project's date — the locked one included — and removes the project's own";
const U_NONE = "gives a project with no date none: null from the v14 → v15 step, null from a clear, or no key at all";
const U_TODAY = "control: never today's date, whatever today is";
const U_HOLDING = "leaves a scenario that already holds a date, or null, as it is";
const U_V14 = "runs at the end of the whole ladder from v14: a v14 project gains no date, and no project-level key";
const U_V15 = "carries a date set at v15 through the whole ladder to every scenario";
const L_LOCAL = "this browser's storage: each scenario's date, the locked scenario still locked, every run kept";
const L_SAVE = "this browser's storage: the next change saves the project at the current schema, its dates in the scenarios";
const L_IMPORT = "Import Projects: the file 0.77.2 exported imports with each scenario's date, at the current schema";
const L_LOADALL = "cloud loadAll: each scenario's date, and the upgraded project written forward with them";
const L_LOAD = "cloud load: each scenario's date";
const L_SUB = "cloud subscription: a snapshot of 0.77.2's document arrives with each scenario's date";
const O_LOCAL = "this browser's storage: its save gives every scenario the one date that tab held, and keeps its change";
const O_CLOUD = "cloud storage: its save, merged by field, gives every scenario the one date that tab held";
// use-project-store.scenario-target.test.ts — the setter, the one choice, the paths that make a scenario
const T_NAMED = "sets the date of the scenario it names and no other's; the project keeps no date of its own";
const T_OWN = "keeps each scenario's own date through changes to another's";
const T_RUN = "keeps the scenario's run: a target date is not a simulation input";
const T_SAVED = "saves the dates in the scenarios, the current schema, nothing on the project";
const T_LOCKED = "refuses a locked scenario: no change, and no undo entry";
const T_LOCKED_OTHER = "a date set in another scenario leaves the locked scenario's own date";
const T_UNDO = "is one undo entry: undo restores the scenario's previous date, redo puts it back";
const G_STAYS = "stays on when one scenario's date is cleared while another scenario has one";
const G_LAST = "turns off when the project's last date is cleared, and one undo brings back the date and the choice";
const G_ONE = "a project of one scenario, as before: clearing its date turns the choice off";
const P_COPY = "a new scenario made from another starts with that scenario's date";
const P_CLONE = "Clone Project copies each scenario's own date";
const P_BACKFILL = "control: a scenario added to a project — the page's backfill — starts with none, not another's date";
// ProjectPage.scenario-target.test.tsx — the page
const V_SWITCH = "keeps its own through a switch between scenarios";
const V_RELOAD = "keeps its own through a reload of the page";
const V_EXPORT = "keeps its own through an export and an import";
const V_SURFACES = "the card's date and colour, the Gantt's line, the printed row and the printed Gantt's line";
const V_RUN = "control: setting a date keeps the scenario's run";
const V_BOX = "is unchecked and disabled in a scenario with no date, while the project's choice is on";
const V_STAYS =
  "stays on when one scenario's date is cleared and another's is left; off when the last is cleared (owner ruling, 2026-10-18)";
const V_ONE =
  "control: a project of one scenario, as before — clearing the date turns the choice off, setting it again does not turn it on";
const V_LOCK_OTHER = "a date set in another scenario leaves the locked scenario's own";
const V_UNDO = "Ctrl+Z restores the scenario's previous date and leaves the other's; Ctrl+Shift+Z puts it back";
const V_TOOLTIP =
  "where the scenario has no date, its tooltip says to set that scenario's date in the summary card — or to unlock a locked scenario first";
// firestore-driver.upgrade-save.test.ts — the save a load makes to upgrade a project (WI-128), each reading the dates
const D_LOADALL =
  "loadAll: each project's upgrade save is tried and refused, logged, and reported to no one; the documents stay at 24";
const D_VIEWER = "load: a viewer's upgrade save is refused and reported to no one; the document stays at 24";
const D_OWNER = "load: its upgrade save names neither internal field, so an owner's is stored at the current schema";
const D_HELD =
  "loadAll: a document that already holds `_owner` and `_members` with the same values is stored at the current schema as it loads";
const D_CHANGE = "a change's save is let through, and stores the project at the current schema with each scenario's date";
const D_REFETCH =
  "a second loadAll on the same driver, as at an invitation's re-fetch: each upgrade save is tried and refused again, and still reported to no one";
// project-service.test.ts and export-import-roundtrip.test.ts — existing tests that follow the ruled shape
const E_CLONE = "preserves cosmetic state (tileColor, target, gantt, calendar)";
const E_STAMP = "round-trips Beta-PERT rows unchanged, stamped with the current schema version";
// export-import-service.test.ts and export-import-roundtrip.test.ts — existing tests that import an older project
const E_MIGRATES = "applies migrations to older-version projects";
const E_RECOVERY = "wraps a project with no schemaVersion as it is, and the import migrates it from version 1";
const E_V1 = "imports a v1 project and applies migrations";

const escape = (s) => s.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

/** Matches exactly these test titles, as the verbose reporter prints them. */
const only = (...titles) => new RegExp(`> (?:${titles.map(escape).join("|")})$`);

const FILL_GUARD = '  if (typeof projectDate === "string" && scenarios) {\n';
const FILL_LOOP =
  "    for (const scenario of scenarios) {\n      if (scenario.targetFinishDate === undefined) {\n        scenario.targetFinishDate = projectDate;\n      }\n    }\n";
const FILL_ONE = "      if (scenario.targetFinishDate === undefined) {\n";
const DROP_KEY = "  delete project.targetFinishDate;\n";
const REGISTERED = "  24: migrateV24toV25,\n";
const CLONE_DATE = "    targetFinishDate: scenario.targetFinishDate,\n";
const SET_ONE = "  const updated = updateScenario(project, scenarioId, (s) => ({ ...s, targetFinishDate }));\n";
const TURN_OFF = "  return dateLeft ? updated : { ...updated, showTargetOnGantt: false };\n";
const SETTER_HEAD =
  "  updateScenarioTargetFinishDate: (projectId, scenarioId, targetFinishDate) => {\n    if (isLocked(get().projects, projectId, scenarioId)) return;\n    pushUndo(projectId);\n";
const BACKFILL = "    const scenario = createScenario(name, startDate, settingsOverrides);\n";
const RAG_DEPS =
  "    [scenario?.targetFinishDate, simulationResults?.percentiles, scenario?.startDate, targetFinishGreenPct, targetFinishAmberPct, workCalendar],\n";
const CARD_READ = "            targetFinishDate={scenario.targetFinishDate ?? null}\n            onTargetFinishDateChange";
const CARD_WRITE = "              updateScenarioTargetFinishDate(id!, scenario.id, date)\n";
const GANTT_READ = "              targetFinishDate={scenario.targetFinishDate ?? null}\n              targetRAGColor";
const BOX_ENABLED = "              hasTargetDate={!!scenario.targetFinishDate}\n";
const BOX_SHOWN = "              showTargetOnGantt={showsTargetHere(project, scenario)}\n";
const PRINT_GANTT = "          targetFinishDate={scenario.targetFinishDate ?? null}\n";
const PRINT_ROW = '                  {scenario.targetFinishDate ? formatDate(scenario.targetFinishDate) : "—"}\n';
const PRINT_PROPS = "export function PrintSummarySection({\n  scenario,\n";
const TIP_UNLOCKED = '    : "Set this scenario’s Finish Target date in the summary card to enable this option";\n';
const TIP_LOCKED = "  return isLocked\n";

export const testFile = "src/";
export const mutations = [
  // -- the upgrade, schema 24 → 25 --------------------------------------------------------------------------
  {
    // Extended by name, before its next run, with WI-128's driver tests, which read each scenario's date after the upgrade.
    id: "S1  WRONG DESIGN: the upgrade fills only the first scenario  [expect 15: U_EVERY, U_V15, L_LOCAL, L_SAVE, L_IMPORT, L_LOADALL, L_LOAD, L_SUB, O_LOCAL, O_CLOUD, D_LOADALL, D_VIEWER, D_OWNER, D_HELD, D_CHANGE]",
    file: MIG,
    find: FILL_LOOP,
    replace:
      "    const first = scenarios[0];\n    if (first && first.targetFinishDate === undefined) {\n      first.targetFinishDate = projectDate;\n    }\n",
    expectFailing: only(
      U_EVERY, U_V15, L_LOCAL, L_SAVE, L_IMPORT, L_LOADALL, L_LOAD, L_SUB, O_LOCAL, O_CLOUD,
      D_LOADALL, D_VIEWER, D_OWNER, D_HELD, D_CHANGE,
    ),
  },
  {
    id: "S2  WRONG DESIGN: the upgrade skips the locked scenario, as if the lock forbade it  [expect 9: U_EVERY, L_LOCAL, L_SAVE, L_IMPORT, L_LOADALL, L_LOAD, L_SUB, O_LOCAL, O_CLOUD]",
    file: MIG,
    find: FILL_ONE,
    replace: "      if (scenario.targetFinishDate === undefined && !scenario.locked) {\n",
    expectFailing: only(U_EVERY, L_LOCAL, L_SAVE, L_IMPORT, L_LOADALL, L_LOAD, L_SUB, O_LOCAL, O_CLOUD),
  },
  {
    // Extended by name, before its next run, with WI-128's loadAll test, which reads that a project with no date gives
    // its scenarios none.
    id: "S3  WRONG DESIGN: a project with no date gives its scenarios today's date  [expect 8: U_NONE, U_TODAY, U_V14, L_LOCAL, L_IMPORT, L_LOADALL, L_SUB, D_LOADALL]",
    file: MIG,
    find: FILL_GUARD,
    replace: "  if (scenarios) {\n",
    also: {
      find: "        scenario.targetFinishDate = projectDate;\n",
      replace:
        '        scenario.targetFinishDate = typeof projectDate === "string" ? projectDate : new Date().toISOString().slice(0, 10);\n',
    },
    expectFailing: only(U_NONE, U_TODAY, U_V14, L_LOCAL, L_IMPORT, L_LOADALL, L_SUB, D_LOADALL),
  },
  {
    // Extended by name, before its next run, with WI-128's driver tests, which read each scenario's date after the upgrade.
    id: "S4  WRONG DESIGN: the upgrade leaves every scenario empty, and only removes the project's key  [expect 16: U_EVERY, U_HOLDING, U_V15, L_LOCAL, L_SAVE, L_IMPORT, L_LOADALL, L_LOAD, L_SUB, O_LOCAL, O_CLOUD, D_LOADALL, D_VIEWER, D_OWNER, D_HELD, D_CHANGE]",
    file: MIG,
    find: `${FILL_GUARD}${FILL_LOOP}  }\n`,
    replace: "",
    expectFailing: only(
      U_EVERY, U_HOLDING, U_V15, L_LOCAL, L_SAVE, L_IMPORT, L_LOADALL, L_LOAD, L_SUB, O_LOCAL, O_CLOUD,
      D_LOADALL, D_VIEWER, D_OWNER, D_HELD, D_CHANGE,
    ),
  },
  {
    // Corrected after its first run, which read 16, not 13: three existing tests import a project of an older version
    // and expect it at the current one, so the suite before this change catches a step left out of the ladder too.
    // Extended by name, before its next run, with WI-128's driver tests, which read each scenario's date after the upgrade.
    id: "S5  the step left out of the ladder  [expect 21: U_EVERY, U_NONE, U_HOLDING, U_V14, U_V15, L_LOCAL, L_SAVE, L_IMPORT, L_LOADALL, L_LOAD, L_SUB, O_LOCAL, O_CLOUD, E_MIGRATES, E_RECOVERY, E_V1, D_LOADALL, D_VIEWER, D_OWNER, D_HELD, D_CHANGE]",
    file: MIG,
    find: REGISTERED,
    replace: "",
    expectFailing: only(
      U_EVERY, U_NONE, U_HOLDING, U_V14, U_V15, L_LOCAL, L_SAVE, L_IMPORT, L_LOADALL, L_LOAD, L_SUB, O_LOCAL, O_CLOUD,
      E_MIGRATES, E_RECOVERY, E_V1, D_LOADALL, D_VIEWER, D_OWNER, D_HELD, D_CHANGE,
    ),
  },
  {
    // Extended by name, before its next run, with WI-128's driver tests, which read each scenario's date after the upgrade.
    // Then with the driver's test of a second load, whose attempt count fails here because no upgrade save is tried.
    id: "S6  the schema version not raised  [expect 21: U_EVERY, U_NONE, U_HOLDING, U_V14, U_V15, L_LOCAL, L_SAVE, L_IMPORT, L_LOADALL, L_LOAD, L_SUB, O_LOCAL, O_CLOUD, T_SAVED, E_STAMP, D_LOADALL, D_VIEWER, D_OWNER, D_HELD, D_CHANGE, D_REFETCH]",
    file: TYPES,
    find: "export const SCHEMA_VERSION = 25;\n",
    replace: "export const SCHEMA_VERSION = 24;\n",
    expectFailing: only(
      U_EVERY, U_NONE, U_HOLDING, U_V14, U_V15, L_LOCAL, L_SAVE, L_IMPORT, L_LOADALL, L_LOAD, L_SUB, O_LOCAL, O_CLOUD,
      T_SAVED, E_STAMP, D_LOADALL, D_VIEWER, D_OWNER, D_HELD, D_CHANGE, D_REFETCH,
    ),
  },
  {
    id: "S7  WRONG DESIGN: the project-level key kept beside the scenarios' dates  [expect 4: U_EVERY, U_NONE, U_V14, U_V15]",
    file: MIG,
    find: DROP_KEY,
    replace: "",
    expectFailing: only(U_EVERY, U_NONE, U_V14, U_V15),
  },
  {
    id: "S8  the step overwrites a date a scenario already holds  [expect 1: U_HOLDING]",
    file: MIG,
    find: FILL_ONE,
    replace: "      if (scenario.targetFinishDate !== projectDate) {\n",
    expectFailing: only(U_HOLDING),
  },
  {
    // Extended by name, before its next run, with WI-128's loadAll test, which reads that a project holding null gives
    // its scenarios none.
    id: "S9  null for 'none' in place of an absent key, when the project held null  [expect 8: U_NONE, U_TODAY, U_V14, L_LOCAL, L_IMPORT, L_LOADALL, L_SUB, D_LOADALL]",
    file: MIG,
    find: FILL_GUARD,
    replace: "  if (projectDate !== undefined && scenarios) {\n",
    expectFailing: only(U_NONE, U_TODAY, U_V14, L_LOCAL, L_IMPORT, L_LOADALL, L_SUB, D_LOADALL),
  },
  // -- the copy of a scenario -------------------------------------------------------------------------------
  {
    id: "S10 the copy of a scenario drops its date  [expect 3: P_COPY, P_CLONE, E_CLONE]",
    file: SVC,
    find: CLONE_DATE,
    replace: "",
    expectFailing: only(P_COPY, P_CLONE, E_CLONE),
  },
  {
    id: "S26 WRONG DESIGN: the copy of a LOCKED scenario drops its date, as if the lock kept it to its source  [expect 1: P_COPY]",
    file: SVC,
    find: CLONE_DATE,
    replace: "    targetFinishDate: scenario.locked ? undefined : scenario.targetFinishDate,\n",
    expectFailing: only(P_COPY),
  },
  // -- the setter -------------------------------------------------------------------------------------------
  {
    // Extended by name, before its next run, with the checkbox's tooltip test (owner ruling, 2026-10-18).
    id: "S11 WRONG DESIGN: the setter writes every scenario of the project — the behaviour before this change  [expect 16: T_NAMED, T_OWN, T_SAVED, T_LOCKED_OTHER, T_UNDO, G_STAYS, O_LOCAL, V_SWITCH, V_RELOAD, V_EXPORT, V_SURFACES, V_BOX, V_STAYS, V_LOCK_OTHER, V_UNDO, V_TOOLTIP]",
    file: SVC,
    find: SET_ONE,
    replace: "  const updated = { ...project, scenarios: project.scenarios.map((s) => ({ ...s, targetFinishDate })) };\n",
    expectFailing: only(
      T_NAMED, T_OWN, T_SAVED, T_LOCKED_OTHER, T_UNDO, G_STAYS, O_LOCAL, V_SWITCH, V_RELOAD, V_EXPORT, V_SURFACES, V_BOX,
      V_STAYS, V_LOCK_OTHER, V_UNDO, V_TOOLTIP,
    ),
  },
  {
    id: "S12 the other option: clearing ANY scenario's date turns the project's choice off  [expect 2: G_STAYS, V_STAYS]",
    file: SVC,
    find: TURN_OFF,
    replace: "  return targetFinishDate === null ? { ...updated, showTargetOnGantt: false } : updated;\n",
    expectFailing: only(G_STAYS, V_STAYS),
  },
  {
    id: "S13 the other option: clearing a date never turns the project's choice off  [expect 4: G_LAST, G_ONE, V_ONE, V_STAYS]",
    file: SVC,
    find: TURN_OFF,
    replace: "  return dateLeft ? updated : { ...updated };\n",
    expectFailing: only(G_LAST, G_ONE, V_ONE, V_STAYS),
  },
  {
    id: "S14 the setter bypasses the lock  [expect 1: T_LOCKED]",
    file: STORE,
    find: SETTER_HEAD,
    replace:
      "  updateScenarioTargetFinishDate: (projectId, scenarioId, targetFinishDate) => {\n    pushUndo(projectId);\n",
    expectFailing: only(T_LOCKED),
  },
  {
    id: "S15 WRONG DESIGN: the setter drops the scenario's run, as a settings change does  [expect 3: T_RUN, V_RUN, V_SURFACES]",
    file: SVC,
    find: SET_ONE,
    replace:
      "  const updated = updateScenario(project, scenarioId, (s) => ({ ...s, targetFinishDate, simulationResults: undefined }));\n",
    expectFailing: only(T_RUN, V_RUN, V_SURFACES),
  },
  {
    id: "S16 the setter leaves no undo entry  [expect 3: T_UNDO, G_LAST, V_UNDO]",
    file: STORE,
    find: SETTER_HEAD,
    replace:
      "  updateScenarioTargetFinishDate: (projectId, scenarioId, targetFinishDate) => {\n    if (isLocked(get().projects, projectId, scenarioId)) return;\n",
    expectFailing: only(T_UNDO, G_LAST, V_UNDO),
  },
  // -- the readers ------------------------------------------------------------------------------------------
  {
    id: "S17 the printed summary's row still reads the project  [expect 1: V_SURFACES]",
    file: SECTIONS,
    find: PRINT_ROW,
    replace: '                  {project.targetFinishDate ? formatDate(project.targetFinishDate) : "—"}\n',
    also: { find: PRINT_PROPS, replace: "export function PrintSummarySection({\n  project,\n  scenario,\n" },
    expectFailing: only(V_SURFACES),
  },
  {
    id: "S18 the printed Gantt still reads the project  [expect 1: V_SURFACES]",
    file: REPORT,
    find: PRINT_GANTT,
    replace: "          targetFinishDate={project.targetFinishDate ?? null}\n",
    expectFailing: only(V_SURFACES),
  },
  {
    id: "S19 WRONG DESIGN: the RAG memo's inputs still name the project's date — a new date in the same scenario keeps the old colour  [expect 2: V_SURFACES, V_RUN]",
    file: PAGE,
    find: RAG_DEPS,
    replace:
      "    [project?.targetFinishDate, simulationResults?.percentiles, scenario?.startDate, targetFinishGreenPct, targetFinishAmberPct, workCalendar],\n",
    expectFailing: only(V_SURFACES, V_RUN),
  },
  {
    // Corrected after its first run, which read 8, not 6: with the field showing the project's empty date, clearing it
    // is no change for the field to report, so a scenario's date can no longer be cleared — the two tests that clear
    // one fail too.
    id: "S20 the summary card still reads the project's date  [expect 8: V_SWITCH, V_RELOAD, V_SURFACES, V_RUN, V_STAYS, V_ONE, V_LOCK_OTHER, V_UNDO]",
    file: PAGE,
    find: CARD_READ,
    replace: "            targetFinishDate={project.targetFinishDate ?? null}\n            onTargetFinishDateChange",
    expectFailing: only(V_SWITCH, V_RELOAD, V_SURFACES, V_RUN, V_STAYS, V_ONE, V_LOCK_OTHER, V_UNDO),
  },
  {
    // Extended by name, before its next run, with the checkbox's tooltip test (owner ruling, 2026-10-18).
    id: "S21 WRONG DESIGN: the summary card still writes the project's date  [expect 11: V_SWITCH, V_RELOAD, V_EXPORT, V_SURFACES, V_RUN, V_BOX, V_STAYS, V_ONE, V_LOCK_OTHER, V_UNDO, V_TOOLTIP]",
    file: PAGE,
    find: CARD_WRITE,
    replace: "              updateProjectField(id!, { targetFinishDate: date })\n",
    expectFailing: only(
      V_SWITCH, V_RELOAD, V_EXPORT, V_SURFACES, V_RUN, V_BOX, V_STAYS, V_ONE, V_LOCK_OTHER, V_UNDO, V_TOOLTIP,
    ),
  },
  {
    id: "S22 the Gantt's line still reads the project's date  [expect 4: V_SURFACES, V_BOX, V_STAYS, V_ONE]",
    file: PAGE,
    find: GANTT_READ,
    replace: "              targetFinishDate={project.targetFinishDate ?? null}\n              targetRAGColor",
    expectFailing: only(V_SURFACES, V_BOX, V_STAYS, V_ONE),
  },
  {
    // Corrected after its first run, which read 0 — it survived: in the test environment a click toggles even a
    // disabled checkbox, so the choice and the line came out right. The two box tests now read that the box is
    // enabled where the scenario has a date, and those two are its set.
    // Extended by name, before its next run, with the checkbox's tooltip test (owner ruling, 2026-10-18).
    id: "S23 the Gantt's checkbox still enabled by the project's date  [expect 3: V_BOX, V_ONE, V_TOOLTIP]",
    file: PAGE,
    find: BOX_ENABLED,
    replace: "              hasTargetDate={!!project.targetFinishDate}\n",
    expectFailing: only(V_BOX, V_ONE, V_TOOLTIP),
  },
  {
    id: "S24 the other option: the checkbox shows the project's choice in a scenario with no date  [expect 1: V_BOX]",
    file: PAGE,
    find: BOX_SHOWN,
    replace: "              showTargetOnGantt={project.showTargetOnGantt ?? false}\n",
    expectFailing: only(V_BOX),
  },
  {
    id: "S27 the checkbox's tooltip keeps its words from before this change, which send the user to the project  [expect 1: V_TOOLTIP]",
    file: GANTT,
    find: TIP_UNLOCKED,
    replace: '    : "Set a Finish Target date in the project summary to enable this option";\n',
    expectFailing: only(V_TOOLTIP),
  },
  {
    id: "S28 the checkbox's tooltip ignores the lock: a locked scenario is told to set its date in the summary card  [expect 1: V_TOOLTIP]",
    file: GANTT,
    find: TIP_LOCKED,
    replace: "  return false\n",
    expectFailing: only(V_TOOLTIP),
  },
  // -- the paths that make a scenario -----------------------------------------------------------------------
  {
    id: "S25 WRONG DESIGN: a scenario added to a project inherits the first scenario's date  [expect 1: P_BACKFILL]",
    file: STORE,
    find: BACKFILL,
    replace:
      "    const scenario = { ...createScenario(name, startDate, settingsOverrides), targetFinishDate: get().projects.find((p) => p.id === projectId)?.scenarios[0]?.targetFinishDate };\n",
    expectFailing: only(P_BACKFILL),
  },
];
