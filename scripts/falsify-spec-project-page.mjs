// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Falsification spec for ProjectPage.test.tsx (#250) + ScenarioTabs a11y (#251).
// Converted from the pre-runner bespoke script so it is reproducible.
const PAGE = new URL("../src/ui/pages/ProjectPage.tsx", import.meta.url).pathname;
const TABS = new URL("../src/ui/components/ScenarioTabs.tsx", import.meta.url).pathname;
const TEST = "src/ui/pages/ProjectPage.test.tsx";
export const testFile = 'src/ui/pages/ProjectPage.test.tsx';

export const mutations = [
  {
    id: "P1  selection no longer scoped to its project (the pre-C5 bug)",
    file: PAGE,
    find: `    if (selection && selection.projectId === project.id && has(selection.scenarioId)) {`,
    replace: `    if (selection && has(selection.scenarioId)) {`,
    expectFailing: /discarded even when its id exists/,
  },
  {
    id: "P2  remembered scenario ignored",
    file: PAGE,
    find: `    const stored = getLastScenarioId(project.id);`,
    replace: `    const stored = null;`,
    expectFailing: /remembered scenario wins/,
  },
  {
    id: "P3  stale remembered id not existence-checked",
    file: PAGE,
    find: `    return stored && has(stored) ? stored : project.scenarios[0]!.id;`,
    replace: `    return stored ? stored : project.scenarios[0]!.id;`,
    expectFailing: /no longer exists falls back/,
  },
  {
    id: "P4  document.title cleanup removed",
    file: PAGE,
    find: `    return () => {\n      document.title = "SPERT Scheduler";\n    };`,
    replace: `    return () => {};`,
    expectFailing: /document title/,
  },
  {
    id: "P5  legacy zero-scenario backfill removed",
    file: PAGE,
    find: `    if (project && project.scenarios.length === 0) {`,
    replace: `    if (false) {`,
    expectFailing: /backfilled with a Baseline/,
  },
  {
    id: "P7  scenario cap guard removed",
    file: PAGE,
    find: `      if (project.scenarios.length >= MAX_SCENARIOS_PER_PROJECT) {\n        toast.error(\n          \`This project already has the maximum of \${MAX_SCENARIOS_PER_PROJECT} scenarios. Remove one to add another.\`\n        );\n        return;\n      }\n      const newId = duplicateScenario(id, sourceScenarioId, name);`,
    replace: `      const newId = duplicateScenario(id, sourceScenarioId, name);`,
    expectFailing: /past the scenario cap/,
  },
  {
    id: "P8  undo shortcut key changed",
    file: PAGE,
    find: `      if (e.key === "z" && !e.shiftKey) {`,
    replace: `      if (e.key === "q" && !e.shiftKey) {`,
    expectFailing: /Ctrl\+Z reaches undo/,
  },
  {
    id: "P9  modifier requirement dropped",
    file: PAGE,
    find: `      const mod = e.metaKey || e.ctrlKey;\n      if (!mod) return;`,
    replace: `      const mod = true;\n      if (!mod) return;`,
    expectFailing: /bare z does nothing/,
  },
  {
    id: "P10 keydown listener never removed",
    file: PAGE,
    find: `    return () => document.removeEventListener("keydown", handler);`,
    replace: `    return () => {};`,
    expectFailing: /removed on unmount/,
  },
  {
    id: "P11 Compare button no longer gated on 2+ scenarios",
    file: PAGE,
    find: `        {project.scenarios.length >= 2 && (`,
    replace: `        {project.scenarios.length >= 1 && (`,
    expectFailing: /absent with a single scenario/,
  },
  {
    id: "P12 Connect AI label ignores session state",
    file: PAGE,
    find: `              aria-label={sessionState.sessionActive ? "AI session active" : "Connect an AI assistant"}`,
    replace: `              aria-label={"Connect an AI assistant"}`,
    expectFailing: /labels the control AI/,
  },
  {
    id: "P13 consent gate bypassed — session started directly",
    file: PAGE,
    find: `    } else {\n      setShowAiConsent(true);\n    }`,
    replace: `    } else {\n      startSession(false).catch(console.error);\n    }`,
    expectFailing: /opens the consent gate/,
  },
  {
    id: "P15 Connect AI control no longer gated on isFirebaseAvailable",
    file: PAGE,
    find: `          {isFirebaseAvailable && (`,
    replace: `          {true && (`,
    expectFailing: /without Firebase configured/,
  },
  {
    id: "A1  aria-current removed from the active tab",
    file: TABS,
    find: `          aria-current={isActive ? "true" : undefined}`,
    replace: `          data-active={isActive ? "true" : undefined}`,
    expectFailing: /scenario is active|leak|discarded|keyboard user|remembered|falls back|clicking a tab|backfilled/,
  },
  {
    id: "A2  selection reverted to a non-focusable span (the pre-v0.62.2 defect)",
    file: TABS,
    find: `          title={tabTitle}
        >
          {scenario.name}
        </button>`,
    replace: `          title={tabTitle}
        >
          {scenario.name}
        </BUTTONTAG>`,
    expectFailing: /keyboard user can focus/,
    // Paired with the opening-tag swap below; applied as one mutation via `also`.
    also: {
      find: `        <button
          type="button"
          aria-current={isActive ? "true" : undefined}`,
      replace: `        <BUTTONTAG
          data-current={isActive ? "true" : undefined}`,
    },
  },
  {
    id: "A3  drag handle loses its accessible name",
    file: TABS,
    find: `        aria-label={\`Reorder scenario \${scenario.name}\`}`,
    replace: `        data-label={\`Reorder scenario \${scenario.name}\`}`,
    expectFailing: /drag handle is named/,
  },
  {
    id: "P14 per-tab delete control no longer gated on scenario count",
    file: TABS,
    find: `        {scenarioCount > 1 && (`,
    replace: `        {true && (`,
    expectFailing: /delete control is not rendered/,
  },
];
