// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Falsification spec for "a Compare tick only ticks" (WI-82, v0.72.7).
//
// The fix is one handler: the Compare checkbox on a scenario's tab stops its CLICK, because the
// tab selects on click. It used to stop only its `change`, so a tick also selected its tab. Each
// straw below names EXACTLY the tests it must fail, and no others — read "K failing;
// named-match K", not merely a non-zero exit. A straw that under-fires looks exactly like a test
// that over-claims, so the expected set is written down here before the run, never inferred from
// it.
//
// Scope is src/ui/ — both test files, and every test in the suite that ticks a Compare box (the
// others drive Compare by props). The whole suite does not fit the runner's output buffer; it was
// run per straw separately, with the same sets.
const COMPONENT = new URL("../src/ui/components/ScenarioTabs.tsx", import.meta.url).pathname;

const T1 = "a tick toggles the scenario and does not select it; its name and the tab itself still select it";
const T2 =
  "a tick only ticks: the scenario on screen stays there while both are compared, and a click on a tab still selects it (WI-82)";
const T3 =
  "an entry the grid REFUSED survives a tick; a switch to another tab and back still drops it, by design (WI-82)";
// Existing page tests that tick, then read the comparison — so they need a tick to LAND (S3 only).
// Since WI-82 each chooses the scenario on screen by its tab, so S1 leaves them green.
const W58_HELD = "a commit that flags the scenario on screen reaches Compare only after the click has landed";
const W58_REFUSED =
  "a cell the grid REFUSED flags neither Compare nor the printout — but the grey note stops asking for that run";
const W61_PRINTED = "the PRINTED comparison's grey note follows the saved plan: a refused cell leaves no scenario out (WI-61)";
const W58_SECOND = "the second tick paints no one-column table: the table's mount waits for the release too";

const escape = (s) => s.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

/** Matches exactly these test titles, as the verbose reporter prints them. */
const only = (...titles) => new RegExp(`> (?:${titles.map(escape).join("|")})$`);

const CLICK_STOP = "          onClick={(e) => e.stopPropagation()}\n";
const ON_CHANGE = "          onChange={() => onToggleCompare(scenario.id)}";
const TAB_SELECTS = "      onClick={() => {\n        if (!isEditing) onSelect(scenario.id);\n      }}";

export const testFile = "src/ui/";
export const mutations = [
  {
    // The pre-WI-82 checkbox: no click stop, and `onChange` stopping an event nothing listens for.
    // The tick's click reaches the tab. The three helper-driven tests stay green: they choose the
    // scenario on screen by its tab after ticking.
    id: "S1  today's checkbox  [expect 3: T1, T2, T3]",
    file: COMPONENT,
    find: CLICK_STOP + ON_CHANGE,
    replace:
      "          onChange={(e) => {\n            e.stopPropagation();\n            onToggleCompare(scenario.id);\n          }}",
    expectFailing: only(T1, T2, T3),
  },
  {
    // The stop moved to the tab's own onClick: a tick no longer selects, but neither does a click
    // on the tab. Only a control that clicks the tab OUTSIDE its name button sees it — the name
    // button selects through its own handler. T3's control uses the name buttons, so T3 survives.
    // The replacement keeps the block's three lines: the legibility guard pins the drag handle
    // below it BY LINE (ScenarioTabs.tsx:117), and a shorter block moves that line and fails it.
    id: "S2  the stop moved to the tab's own onClick  [expect 2: T1, T2]",
    file: COMPONENT,
    find: CLICK_STOP,
    replace: "",
    also: { find: TAB_SELECTS, replace: "      onClick={(e) => {\n        e.stopPropagation();\n      }}" },
    expectFailing: only(T1, T2),
  },
  {
    // A tick no longer toggles. Every test that needs a tick to land fails — T3 too, because it
    // checks its ticks landed before claiming the refused entry survived them.
    id: "S3  onChange no longer toggles  [expect 7: T1, T2, T3, W58_HELD, W58_REFUSED, W61_PRINTED, W58_SECOND]",
    file: COMPONENT,
    find: ON_CHANGE,
    replace: "          onChange={() => {}}",
    expectFailing: only(T1, T2, T3, W58_HELD, W58_REFUSED, W61_PRINTED, W58_SECOND),
  },
];
