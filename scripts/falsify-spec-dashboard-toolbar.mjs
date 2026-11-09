// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Falsification spec for v0.86.1: the Dashboard's toolbar (Export All · Import · Load Sample · New Project, with
// GanttApp's icons), Import opening the file picker itself with the import in a panel below the toolbar, the
// import's note under the toolbar, where focus goes when the panel closes, and the caution's off-switch named by
// the words beside it.
//
// Each straw names EXACTLY the tests it must fail, and no others — read "K failing; named-match K", not merely a
// non-zero exit: the runner prints ✔ when ANY named test fails. Each expected set is written here before the run,
// never inferred from it.
//
// testFile is all of src/, so every straw runs against the whole suite.
const PAGE = new URL("../src/ui/pages/ProjectsPage.tsx", import.meta.url).pathname;
const ICON = new URL("../src/ui/components/ToolbarIcon.tsx", import.meta.url).pathname;
const PATHS = new URL("../src/ui/components/toolbar-icon-paths.ts", import.meta.url).pathname;
const SETTINGS = new URL("../src/ui/components/NotificationsSection.tsx", import.meta.url).pathname;
const MODAL = new URL("../src/ui/components/StorageLoginModal.tsx", import.meta.url).pathname;

// ProjectsPage.toolbar.test.tsx
const TB_ORDER = "shows Export All · Import · Load Sample · New Project, left to right, beside the Projects heading";
const TB_ICONS = "draws GanttApp's four icons, 18 px, before each label, in the text colour and hidden from assistive tech";
const TB_EMPTY = "with no projects every button is still there, in the same order, and Export All is disabled, not hidden";
const TB_EXPORT_GATE = "Export All keeps its gate: disabled while every project is archived, enabled with one active project";
const TB_PICKER = "has no Import Projects toggle and no Choose File: Import opens the file picker itself";
const IM_CANCEL = "a picked file opens the preview below the toolbar; Cancel closes it and focus goes back to Import";
const IM_ESCAPE = "Escape in the preview closes it the same way, focus on Import";
const IM_DONE =
  "Confirm Import imports the project and says so; Import another file closes the panel, focus on Import, and Import picks again";
const IM_ERROR = "a file that is not an export shows its error in the panel; Try another file closes it, focus on Import";
// ProjectsPage.cloud-create-gate.test.tsx (WI-112, re-keyed in v0.86.1)
const A1 = "New Project and Load Sample are greyed out and a note says why; when the load ends they come back and the note goes";
const A9 =
  "Import: while a cloud load runs nothing is imported — a file picked between the invitation re-fetch and the end of the first load is refused, and so is one confirmed while a later re-fetch runs";
const A13 =
  "the first sign-in's settings, arriving while the second sign-in's load runs, leave New Project, Load Sample, the loading message and Import as they were until that load ends";
const A14 =
  "the first sign-in's settings load failing while the second sign-in's load runs leaves New Project, Load Sample, the loading message and Import as they were until that load ends";
// ProjectsPage.cloud-sign-in-display.test.tsx (WI-113)
const E_EMPTY =
  "after the first load listed the user's projects, an empty re-fetch answer keeps them on show and ends its part: Import comes back";
// ProjectsPage.invitation-refetch.test.tsx (WI-113)
const L_THROWS =
  "constructed — the first load's success callback throws after the load has ended, so its failure callback ends it again: a later re-fetch still ends the loading";
const I_REFETCH_FIRST =
  "the invited project on screen from the re-fetch, the first load still running: Import is greyed out, and the note says why";
const I_SETTINGS =
  "the projects on screen and the user's settings still loading: Import is greyed out, and the note says projects can't be imported until loading ends";
const I_PICKED =
  "a file reaching Import while it waits is refused as it is picked, in the note's words; chosen again after the load, it imports";
const I_LATER_REFETCH =
  "a file confirmed while a later re-fetch runs is refused, with Import greyed out and the note shown; when the re-fetch ends, the file chosen again imports";
const I_CONSTRUCTED =
  "constructed — the cloud sync's own gate shut with the projects loaded, a state no control of the app reaches: Import is greyed out with the note, and the confirm refuses";
const I_FOCUS_NOTE =
  "v0.86.1: the refusal closed while Import is greyed out sends focus to the note that says why, and on to Import when the load ends";
// warn-switch-label.test.tsx
const W_SETTINGS = "Settings → Notifications: the switch's name is the visible label, and it turns the caution off and on";
const W_MODAL = "the Storage & Sign In window's switch carries the same name as the words beside it";

const escape = (s) => s.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

/** Matches exactly these test titles, as the verbose reporter prints them. */
const only = (...titles) => new RegExp(`> (?:${titles.map(escape).join("|")})$`);

export const testFile = "src/";
export const mutations = [
  {
    // Only the words and icons trade places; each button keeps its own handler, name and gate.
    id: "T1  Export All and Import trade labels and icons  [expect 3: TB_ORDER, TB_ICONS, TB_EMPTY]",
    file: PAGE,
    find: "<ToolbarIcon d={TOOLBAR_ICON_PATHS.export} />\n            Export All",
    replace: "<ToolbarIcon d={TOOLBAR_ICON_PATHS.import} />\n            Import",
    // Applied after the first edit, so it is anchored on the file input that follows Import's own button.
    also: {
      find: "<ToolbarIcon d={TOOLBAR_ICON_PATHS.import} />\n            Import\n          </button>\n          <ImportFileInput",
      replace: "<ToolbarIcon d={TOOLBAR_ICON_PATHS.export} />\n            Export All\n          </button>\n          <ImportFileInput",
    },
    expectFailing: only(TB_ORDER, TB_ICONS, TB_EMPTY),
  },
  {
    id: "T2  Export All's name says all projects, which is false: archived ones are not exported  [expect 1: TB_ORDER]",
    file: PAGE,
    find: 'aria-label="Export all active projects as JSON"',
    replace: 'aria-label="Export all projects as JSON"',
    expectFailing: only(TB_ORDER),
  },
  {
    id: "T3  Import opens no file picker  [expect 1: TB_PICKER]",
    file: PAGE,
    find: "onClick={() => importFlow.fileInputRef.current?.click()}",
    replace: "onClick={() => {}}",
    expectFailing: only(TB_PICKER),
  },
  {
    id: "T4  Import is never greyed out  [expect 12: A1, A9, A13, A14, E_EMPTY, L_THROWS, I_REFETCH_FIRST, I_SETTINGS, I_PICKED, I_LATER_REFETCH, I_CONSTRUCTED, I_FOCUS_NOTE]",
    file: PAGE,
    find: "disabled={importWaits}",
    replace: "disabled={false}",
    expectFailing: only(A1, A9, A13, A14, E_EMPTY, L_THROWS, I_REFETCH_FIRST, I_SETTINGS, I_PICKED, I_LATER_REFETCH, I_CONSTRUCTED, I_FOCUS_NOTE),
  },
  {
    id: "T5  Import is greyed out with nothing telling a screen reader why  [expect 3: A1, A9, I_FOCUS_NOTE]",
    file: PAGE,
    find: "            {...describedByWhile(importWaits, importNoteId)}\n",
    replace: "",
    expectFailing: only(A1, A9, I_FOCUS_NOTE),
  },
  {
    id: "T6  no note under the toolbar while Import is greyed out  [expect 9: A1, A9, A13, A14, I_REFETCH_FIRST, I_SETTINGS, I_LATER_REFETCH, I_CONSTRUCTED, I_FOCUS_NOTE]",
    file: PAGE,
    find: "      {importWaits && (\n",
    replace: "      {false && (\n",
    expectFailing: only(A1, A9, A13, A14, I_REFETCH_FIRST, I_SETTINGS, I_LATER_REFETCH, I_CONSTRUCTED, I_FOCUS_NOTE),
  },
  {
    id: "T7  the import panel always shows, as the Import Projects panel did when opened  [expect 4: TB_PICKER, IM_CANCEL, IM_ESCAPE, IM_DONE]",
    file: PAGE,
    find: '      {importFlow.importState.step !== "idle" && (\n',
    replace: "      {true && (\n",
    expectFailing: only(TB_PICKER, IM_CANCEL, IM_ESCAPE, IM_DONE),
  },
  {
    id: "T8  the panel closes and focus falls to <body>  [expect 5: IM_CANCEL, IM_ESCAPE, IM_DONE, IM_ERROR, I_FOCUS_NOTE]",
    file: PAGE,
    find: "    focusImportOrItsNote(importButtonRef.current, importNoteRef.current);\n",
    replace: "",
    expectFailing: only(IM_CANCEL, IM_ESCAPE, IM_DONE, IM_ERROR, I_FOCUS_NOTE),
  },
  {
    id: "T9  focus is sent to Import even while it is greyed out, where it cannot land  [expect 1: I_FOCUS_NOTE]",
    file: PAGE,
    find: "(importButton?.disabled && note ? note : importButton)?.focus();",
    replace: "importButton?.focus();",
    expectFailing: only(I_FOCUS_NOTE),
  },
  {
    id: "T10 the note leaves with the focus on it, and nothing takes the focus  [expect 1: I_FOCUS_NOTE]",
    file: PAGE,
    find: "        queueMicrotask(() => importButtonRef.current?.focus());\n",
    replace: "",
    expectFailing: only(I_FOCUS_NOTE),
  },
  {
    // The panel's own picker back on the Dashboard: a second note with the same words while the panel is open.
    id: "T11 the Dashboard's panel keeps Settings' Choose File and note  [expect 3: IM_CANCEL, I_LATER_REFETCH, I_CONSTRUCTED]",
    file: PAGE,
    find: "<ImportPanel flow={{ ...importFlow, cancelImport: closeImport }} pickedFromToolbar />",
    replace: "<ImportPanel flow={{ ...importFlow, cancelImport: closeImport }} />",
    expectFailing: only(IM_CANCEL, I_LATER_REFETCH, I_CONSTRUCTED),
  },
  {
    id: "T12 Export All is never greyed out  [expect 2: TB_EMPTY, TB_EXPORT_GATE]",
    file: PAGE,
    find: "disabled={activeProjects.length === 0}",
    replace: "disabled={false}",
    expectFailing: only(TB_EMPTY, TB_EXPORT_GATE),
  },
  {
    id: "T13 the icons are read out  [expect 1: TB_ICONS]",
    file: ICON,
    find: ' aria-hidden="true">',
    replace: ">",
    expectFailing: only(TB_ICONS),
  },
  {
    id: "T14 New Project's icon drifts from GanttApp's  [expect 1: TB_ICONS]",
    file: PATHS,
    find: 'plus: "M12 5v14M5 12h14",',
    replace: 'plus: "M12 5v14M5 12h13",',
    expectFailing: only(TB_ICONS),
  },
  {
    id: "T15 Settings' switch keeps its old name, without the visible \"me\"  [expect 1: W_SETTINGS]",
    file: SETTINGS,
    find: 'ariaLabel="Warn me on startup when using local storage"',
    replace: 'ariaLabel="Warn on startup when using local storage"',
    expectFailing: only(W_SETTINGS),
  },
  {
    id: "T16 the Storage & Sign In window's switch keeps its old name  [expect 1: W_MODAL]",
    file: MODAL,
    find: 'ariaLabel="Warn me on startup when using local storage"',
    replace: 'ariaLabel="Warn on startup when using local storage"',
    expectFailing: only(W_MODAL),
  },
];
