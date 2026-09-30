// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Falsification spec for the WI-62 demo nits (v0.72.9): a clone goes to the RIGHT of its source,
// a full Compare selection greys the other boxes and says why (WI-87) and counts only scenarios
// that still exist, and a copied image draws its digits where it measured them.
//
// Each straw below names EXACTLY the tests it must fail, and no others — read "K failing;
// named-match K", not merely a non-zero exit. A straw that under-fires looks exactly like a test
// that over-claims, so the expected set is written down here before the run, never inferred from
// it.
//
// Scope is the whole suite (src/): every test that clones, ticks, deletes or copies runs under every
// straw.
// It fits the runner's buffer, which is per stream: measured stdout 560,543 B passing and
// 568,147 B under S1, stderr ~450 KB (a figure near 1 MB is the two streams added together).
//
// ⚠️ S1 once read 6 failing: the sixth was "adding past the scenario cap is refused with an
// explanatory toast", a page test that renders fifty scenarios. It took 4.0–5.0 s against its
// 5 s timeout while the machine's load average was ~30, and 1.4–1.9 s at ~15, with or without
// the straw — which never reaches it (the cap refuses before any clone). Load, not the straw.
const STORE = new URL("../src/ui/hooks/use-project-store.ts", import.meta.url).pathname;
const HOOK = new URL("../src/ui/hooks/use-scenario-comparison.ts", import.meta.url).pathname;
const TABS = new URL("../src/ui/components/ScenarioTabs.tsx", import.meta.url).pathname;
const COPY = new URL("../src/ui/helpers/export-chart.ts", import.meta.url).pathname;

// Part A — use-project-store.test.ts, and the page.
const A_FIRST = "duplicates scenario with new IDs (clone inserted to the right of its source)";
const A_RETURNS = "duplicateScenario returns the new clone's ID";
const A_MIDDLE = "cloning a middle scenario inserts the clone immediately to its right";
const A_LAST = "cloning the last scenario places the clone last";
const A_PAGE = "Clone Scenario on the first tab leaves it first and bold; the copy goes to its right (WI-62)";
// Part B — ScenarioTabs.test.tsx, the page, and the hook's own cap test.
const B_TABS =
  "with three ticked, each unticked box is greyed and says why, and a ticked box is not; with two, none is";
const B_PAGE = "once three are ticked the fourth box is greyed, and unticking one frees it (WI-87)";
const HOOK_CAP = "caps the selection at three";
// A ticked scenario that is deleted — the page (real store, ✕ + confirm) and the hook.
const DEL_PAGE = "a ticked scenario that is deleted stops counting toward the three (WI-62)";
const DEL_HOOK = "a ticked scenario that is deleted frees its place under the limit (WI-62)";
const DROPS = "drops a selected scenario that no longer exists";
// Part C — export-chart.numerals.test.ts.
const C_STEP = "turns a tabular-nums cell proportional, with its text, and leaves a normal element alone";
const C_COPY = "makes html2canvas's clone proportional, and never the live element";
// WI-57's two tests that a copy without captureFullWidth leaves its clone with no style at all.
const W57_HELPER = "without captureFullWidth the clone keeps its visible box";
const W57_GANTT = "a copy button that does not opt in keeps the visible box";

const escape = (s) => s.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

/** Matches exactly these test titles, as the verbose reporter prints them. */
const only = (...titles) => new RegExp(`> (?:${titles.map(escape).join("|")})$`);

export const testFile = "src/";
export const mutations = [
  {
    // The pre-WI-62 insert: at the source's index, so the clone lands to its LEFT. Every other
    // test that clones passed on both sides of the change, so it cannot see the position.
    id: "S1  the clone back to the left  [expect 5: A_FIRST, A_RETURNS, A_MIDDLE, A_LAST, A_PAGE]",
    file: STORE,
    find: "addScenarioToProject(p, clone, sourceIndex + 1)",
    replace: "addScenarioToProject(p, clone, sourceIndex)",
    expectFailing: only(A_FIRST, A_RETURNS, A_MIDDLE, A_LAST, A_PAGE),
  },
  {
    // The box keeps its reason but is never greyed. (Below the drag handle, so the legibility
    // guard's by-line key does not move.)
    // DEL_PAGE's control is that D is greyed at three ticked, so it fails too.
    id: "S2  B's disabled removed  [expect 3: B_TABS, B_PAGE, DEL_PAGE]",
    file: TABS,
    find: "          disabled={compareBlockedTitle !== undefined}\n",
    replace: "",
    expectFailing: only(B_TABS, B_PAGE, DEL_PAGE),
  },
  {
    // Greyed, but silent about why — the defect WI-87 was filed for, minus the grey.
    id: "S3  B's title removed  [expect 2: B_TABS, B_PAGE]",
    file: TABS,
    find: "          title={compareBlockedTitle}\n",
    replace: "",
    expectFailing: only(B_TABS, B_PAGE),
  },
  {
    // The limit read as "more than three": at three ticked nothing is greyed.
    id: "S4  the cap checked as more than three  [expect 3: B_TABS, B_PAGE, DEL_PAGE]",
    file: TABS,
    find: "selected.size < MAX_COMPARE_SCENARIOS",
    replace: "selected.size <= MAX_COMPARE_SCENARIOS",
    expectFailing: only(B_TABS, B_PAGE, DEL_PAGE),
  },
  {
    // ONE definition of the cap: moving it moves the hook AND the tabs. The hook's "frees a slot"
    // test ticks three, unticks one and ticks a fourth, so it holds at a cap of four too. Both
    // delete tests open with the limit reached at three, so both fail.
    id: "S5  the cap's one definition set to four  [expect 5: HOOK_CAP, B_TABS, B_PAGE, DEL_PAGE, DEL_HOOK]",
    file: HOOK,
    find: "export const MAX_COMPARE_SCENARIOS = 3;",
    replace: "export const MAX_COMPARE_SCENARIOS = 4;",
    expectFailing: only(HOOK_CAP, B_TABS, B_PAGE, DEL_PAGE, DEL_HOOK),
  },
  {
    // The copy path no longer calls the step; the step's own unit test cannot see that.
    id: "S6  C's clone-side step removed from onclone  [expect 1: C_COPY]",
    file: COPY,
    find: "      setProportionalNumerals(clonedEl);\n",
    replace: "",
    expectFailing: only(C_COPY),
  },
  {
    // The step touches exactly the wrong elements: the tabular cell stays tabular, and an element
    // already normal gets an inline style.
    // ⚠️ PRE-REGISTERED 2, MEASURED 4 — a prediction error, not a straw defect. WI-57's two
    // tests assert that a clone copied without captureFullWidth carries no `style` attribute at
    // all; their clone is a plain div, already normal, so the inverted step writes one. They are
    // right to fail. Corrected here, after the run, and said so.
    id: "S7  C's step inverted  [expect 4: C_STEP, C_COPY, W57_HELPER, W57_GANTT]",
    file: COPY,
    find: 'if (getComputedStyle(node).fontVariantNumeric !== "normal") {',
    replace: 'if (getComputedStyle(node).fontVariantNumeric === "normal") {',
    expectFailing: only(C_STEP, C_COPY, W57_HELPER, W57_GANTT),
  },
  {
    // Today's code on main: a deleted tick stays in the set, and the limit and the tabs count it.
    id: "S8  the cap counting the raw set (main's code)  [expect 3: DEL_PAGE, DEL_HOOK, DROPS]",
    file: HOOK,
    find: "  const selectedForCompare = useMemo(() => liveTicks(tickedIds, scenarios), [tickedIds, scenarios]);",
    replace: "  const selectedForCompare = tickedIds;",
    also: { find: "const next = new Set(liveTicks(prev, scenarios));", replace: "const next = new Set(prev);" },
    expectFailing: only(DEL_PAGE, DEL_HOOK, DROPS),
  },
  {
    // Half of it: the tabs read the raw set, so D is greyed after the delete.
    id: "S9  the tabs read the raw set  [expect 3: DEL_PAGE, DEL_HOOK, DROPS]",
    file: HOOK,
    find: "  const selectedForCompare = useMemo(() => liveTicks(tickedIds, scenarios), [tickedIds, scenarios]);",
    replace: "  const selectedForCompare = tickedIds;",
    expectFailing: only(DEL_PAGE, DEL_HOOK, DROPS),
  },
  {
    // The other half: D is free after the delete, but the tick counts the raw set and is refused.
    // DROPS reads only the live selection, so it stays green.
    id: "S10 the toggle counts the raw set  [expect 2: DEL_PAGE, DEL_HOOK]",
    file: HOOK,
    find: "const next = new Set(liveTicks(prev, scenarios));",
    replace: "const next = new Set(prev);",
    expectFailing: only(DEL_PAGE, DEL_HOOK),
  },
];
