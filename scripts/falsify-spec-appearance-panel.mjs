// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// WI-171 — falsification spec: the Gantt chart's Appearance settings open under the toolbar.
// Each rule, undone alone, against the whole suite. jsdom has no layout, so these pin the
// document's order; that the panel is on screen at once was measured in real Chrome.
//
//   node scripts/falsify.mjs scripts/falsify-spec-appearance-panel.mjs
const CHART = new URL("../src/ui/charts/GanttChart.tsx", import.meta.url).pathname;
const SECTION = new URL("../src/ui/components/GanttSection.tsx", import.meta.url).pathname;
const escape = (s) => s.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
const only = (...titles) => new RegExp(`> (?:${titles.map(escape).join("|")})$`);

const ORDER = "the panel opens after the toolbar and before the chart, inside neither";
const EXPANDED = "the button's aria-expanded follows the panel";
const CONTROLS = "the button's aria-controls names the panel while it is open, and nothing while it is closed";
const CLOSES = "a second click closes the panel";
const COPY = "Copy as image captures the chart and never the open panel";

const SLOT = "      {appearancePanel}\n      {/* Chart SVG — horizontally scrollable */}\n";
const CONTAINER_OPEN =
  '      <div ref={svgContainerRef} className={`relative border border-gray-200 dark:border-gray-700 rounded-lg${ra.fitToWindow ? "" : " overflow-x-auto"}`}>\n';
const CHART_END = "          {tooltip.text}\n        </div>\n      )}\n    </div>\n  );\n}\n";

export const testFile = "src/";

export const mutations = [
  {
    id: "A1 rule 1: the panel opens below the whole chart again",
    file: CHART,
    find: SLOT,
    // The blank line it replaced, so that no line legibility-floor.test.ts pins by number moves.
    replace: "\n      {/* Chart SVG — horizontally scrollable */}\n",
    also: {
      find: CHART_END,
      replace: CHART_END.replace("    </div>\n  );\n}\n", "      {appearancePanel}\n    </div>\n  );\n}\n"),
    },
    expectFailing: only(ORDER),
  },
  {
    id: "A2 rule 2: the button has no aria-expanded",
    file: CHART,
    find: " aria-expanded={appearancePanelOpen}",
    replace: "",
    expectFailing: only(EXPANDED),
  },
  {
    id: "A3 rule 2: the button has no aria-controls",
    file: CHART,
    find: " aria-controls={appearancePanelId}",
    replace: "",
    expectFailing: only(CONTROLS),
  },
  {
    id: "A4 rule 2: aria-controls names the panel while it is closed too",
    file: SECTION,
    find: "appearancePanelId={appearancePanelOpen ? appearancePanelId : undefined}",
    replace: "appearancePanelId={appearancePanelId}",
    expectFailing: only(CONTROLS),
  },
  {
    id: "A5 rule 2: the panel does not carry the id the button names",
    file: SECTION,
    find: '<div id={appearancePanelId} className="mb-3">',
    replace: '<div className="mb-3">',
    expectFailing: only(CONTROLS),
  },
  {
    id: "A6 rule 3: a second click leaves the panel open",
    file: SECTION,
    find: "setAppearancePanelOpen((o) => !o)",
    replace: "setAppearancePanelOpen(true)",
    expectFailing: only(EXPANDED, CONTROLS, CLOSES),
  },
  {
    id: "A7 rule 4: the panel opens inside what Copy as image captures",
    file: CHART,
    find: SLOT + CONTAINER_OPEN,
    replace: "      {/* Chart SVG — horizontally scrollable */}\n" + CONTAINER_OPEN + "      {appearancePanel}\n",
    expectFailing: only(COPY),
  },
];
