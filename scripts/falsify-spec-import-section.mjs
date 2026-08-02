// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Falsification spec for ImportSection.test.tsx (#246). Converted from the pre-runner
// bespoke script so it is reproducible.
const SECTION = new URL("../src/ui/components/ImportSection.tsx", import.meta.url).pathname;
const HOOK = new URL("../src/ui/hooks/use-import-state.ts", import.meta.url).pathname;
const TEST = "src/ui/components/ImportSection.test.tsx";
export const testFile = 'src/ui/components/ImportSection.test.tsx';

export const mutations = [
  {
    id: "M1  onChange binding removed",
    file: SECTION,
    find: `onChange={handleFileChange}\n          className="hidden"`,
    replace: `className="hidden"`,
    expectFailing: /./, // every pickFile test
  },
  {
    id: "M2  Choose File onClick neutered",
    file: SECTION,
    find: `onClick={() => fileInputRef.current?.click()}`,
    replace: `onClick={() => {}}`,
    expectFailing: /dispatches a click/,
  },
  {
    id: "M3  ref={fileInputRef} removed from the input",
    file: SECTION,
    find: `          ref={fileInputRef}\n          type="file"`,
    replace: `          type="file"`,
    expectFailing: /dispatches a click/,
  },
  {
    id: "M4  Escape key changed to Backspace",
    file: SECTION,
    find: `if (e.key === "Escape") cancelImport();`,
    replace: `if (e.key === "Backspace") cancelImport();`,
    expectFailing: /Escape inside the preview region/,
  },
  {
    id: "M5  driftSkipped sub-message deleted",
    file: SECTION,
    find: `{importState.outcome.driftSkipped.length > 0 && (`,
    replace: `{false && (`,
    expectFailing: /driftSkipped sub-message/,
  },
  {
    id: "M6  errors sub-message deleted",
    file: SECTION,
    find: `{importState.outcome.errors.length > 0 && (`,
    replace: `{false && (`,
    expectFailing: /errors sub-message/,
  },
  {
    id: "M7  radiogroup aria-labelledby removed",
    file: SECTION,
    find: `                        aria-labelledby={labelId}\n`,
    replace: ``,
    expectFailing: /radiogroup|decision|Replace|Skip default/,
  },
  {
    id: "M8  radio checked always false",
    file: SECTION,
    find: `checked={decision.action === opt}`,
    replace: `checked={false}`,
    expectFailing: /defaulting to|Replace existing selects it|untouched/,
  },
  {
    id: "M9  radio onChange no longer calls updateDecision",
    file: SECTION,
    find: `                              onChange={() =>
                                updateDecision(
                                  decision.importedProjectId,
                                  opt
                                )
                              }`,
    replace: `                              onChange={() => {}}`,
    expectFailing: /Replace existing selects it|applies the chosen Replace|untouched/,
  },
  {
    id: "M10 Choose File never disabled",
    file: SECTION,
    find: `disabled={cloudPending}`,
    replace: `disabled={false}`,
    expectFailing: /disables the button|cannot reach the file input/,
  },
  {
    id: "M11 accept changed to .csv",
    file: SECTION,
    find: `accept=".json"`,
    replace: `accept=".csv"`,
    expectFailing: /accepts \.json/,
  },
  {
    id: "M12 preferences checkbox onChange neutered",
    file: SECTION,
    find: `                    onChange={toggleApplyPreferences}`,
    replace: `                    onChange={() => {}}`,
    expectFailing: /checking the box and confirming/,
  },
  {
    id: "M13 id-conflict default flipped skip -> replace",
    file: HOOK,
    find: `      kind: "id",\n      originalExistingId: c.existingProject.id,\n      action: "skip",`,
    replace: `      kind: "id",\n      originalExistingId: c.existingProject.id,\n      action: "replace",`,
    expectFailing: /defaulting to Skip|honours the Skip default|untouched/,
  },
  {
    id: "M18 applying block never rendered",
    file: SECTION,
    find: `        {importState.step === "applying" && (`,
    replace: `        {false && (`,
    expectFailing: /applying step renders/,
  },
  {
    id: "M19 staleness guard inverted (neither reader's result lands)",
    file: HOOK,
    find: `        if (readerPendingRef.current !== reader) return; // stale (aborted) reader`,
    replace: `        if (readerPendingRef.current === reader) return; // INVERTED`,
    expectFailing: /two picks in a row/,
  },
  {
    id: "M20 cloud-refresh announcement never rendered",
    file: SECTION,
    find: `            {importState.cloudRefreshed &&`,
    replace: `            {false &&`,
    expectFailing: /appears while the preview is open/,
  },
  {
    id: "M21 ready-to-import list no longer excludes conflicts",
    file: SECTION,
    find: `                  {importState.projects
                    .filter(
                      (p) =>
                        !importState.decisions.some(`,
    replace: `                  {importState.projects
                    .filter(
                      (p) =>
                        !!importState.decisions.some(`,
    expectFailing: /listed under conflicts only/,
  },
  {
    id: "M14 updateDecision drops the other decisions",
    file: HOOK,
    find: `        return { ...prev, decisions: [...decisionsMap.values()] };`,
    replace: `        return { ...prev, decisions: [{ ...existing, action }] };`,
    expectFailing: /untouched/,
  },
];
