// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Falsification spec for typing the summary card's Finish Target date (WI-129, v0.79.2).
//
// Before v0.79.2 the card wrote every change to the store, and a browser reads a date with a part deleted as "" —
// so one Backspace in the day cleared the whole date, and could switch off the Gantt chart's Finish Target line.
// The date is now buffered and saved when the field is left: a half-typed date ("" with validity.badInput true)
// goes back to the stored date and saves nothing; an emptied field ("" with badInput false) is a clear. Each straw
// below restores one wrong behaviour — the old one, or a plausible half-fix — and names the cases that must go red.
//
// Not straw-guarded, by design: the blur handler's DOM write that clears a half-typed entry when there is no stored
// date. jsdom does not draw a date's parts, so its evidence is the browser (WI-129 build, G6 step 5).
//
// Usage: node scripts/falsify.mjs scripts/falsify-spec-finish-target-typing.mjs
const CARD = new URL("../src/ui/components/ScenarioSummaryCard.tsx", import.meta.url).pathname;

export const testFile = "src/ui/components/ScenarioSummaryCard.finish-target-typing.test.tsx";
export const mutations = [
  {
    // THE defect: every change written as it is typed.
    id: "S1  the date is saved on every change, not when the field is left",
    file: CARD,
    find: "onChange={(e) => targetFinish.setLocalValue(e.target.value)}",
    replace: "onChange={(e) => onTargetFinishDateChange?.(e.target.value || null)}",
    expectFailing: /> measurement: |> 1: |> 4: |> 5: /,
  },
  {
    id: "S2  no badInput check: a half-typed date, left, clears the date again",
    file: CARD,
    find: 'if (value === "" && targetFinishBadInputRef.current) {',
    replace: "if (false) {",
    expectFailing: /> 1: /,
  },
  {
    id: "S3  every empty field is taken as half-typed: an emptied field can no longer clear",
    file: CARD,
    find: 'value === "" && targetFinishBadInputRef.current',
    replace: 'value === ""',
    expectFailing: /> 2: /,
  },
  {
    // The half-fix: nothing saved, but the buffer keeps "" — the next draw or leave blanks or clears the date.
    id: "S4  a half-typed date is not saved, but the buffer is not reset to the stored date",
    file: CARD,
    find: "controls.reset();",
    replace: "",
    expectFailing: /> 1: /,
  },
];
