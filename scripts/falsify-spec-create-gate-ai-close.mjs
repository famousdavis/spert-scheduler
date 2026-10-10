// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Falsification spec for WI-112 (the controls that create a project are greyed out while the first
// cloud load runs, each create is checked again as it commits, and a load abandoned while its
// preferences load cannot end the next one) and WI-111 (the Connect AI panel's close button, and the
// question Disconnect asks first).
//
// Each straw breaks ONE guarantee. S9 and S10 are the tempting wrong designs — the gate on
// `cloudDataLoaded` (which the invitation re-fetch sets early) and the gate without the storage
// mode — and S22 and S27 are the wrong designs for the panel (a close that also disconnects).
// Each straw names EXACTLY the tests it must fail, and no others — read "K failing; named-match K",
// not merely a non-zero exit: the runner prints ✔ when ANY named test fails. Each expected set was
// written before the run (PREREG2; S28 and A13's place in S1–S3 and S5–S7 in PREREG3; S29 and A14's
// place in PREREG3b; S30–S35, and A15–A19's places in the others, in PREREG4; S36, and A17's and A18's
// place in S7, in PREREG5), never inferred from it.
//
// NOT HERE, on purpose — three straws that cannot fail any test, run once by hand and measured as
// survivors: removing Clone's own check at commit (the button is natively disabled, so no click
// reaches it), and removing either one of the two places the flag is set false at the start of a load
// (each covers for the other; S18 removes both).
//
// testFile is all of src/, so every straw runs against the whole suite.
const PAGE = new URL("../src/ui/pages/ProjectsPage.tsx", import.meta.url).pathname;
const TILE = new URL("../src/ui/components/ProjectTile.tsx", import.meta.url).pathname;
const DIALOG = new URL("../src/ui/components/NewProjectDialog.tsx", import.meta.url).pathname;
const SECTION = new URL("../src/ui/components/ActivityImportSection.tsx", import.meta.url).pathname;
const GATE = new URL("../src/ui/hooks/use-cloud-create-blocked.ts", import.meta.url).pathname;
const WORDS = new URL("../src/ui/helpers/cloud-create-gate.ts", import.meta.url).pathname;
const SYNC = new URL("../src/ui/hooks/use-cloud-sync.ts", import.meta.url).pathname;
const STORE = new URL("../src/ui/hooks/use-project-store.ts", import.meta.url).pathname;
const IMPORT = new URL("../src/ui/hooks/use-import-state.ts", import.meta.url).pathname;
const PANEL = new URL("../src/ui/components/ConnectAI/ConnectAiPanel.tsx", import.meta.url).pathname;

// ProjectsPage.cloud-create-gate.test.tsx
const A1 = "New Project and Load Sample are greyed out and a note says why; when the load ends they come back and the note goes";
const A2 = "with tiles on screen before the load ends, each tile's Clone is greyed out too, and the note shows above them";
const A3 = "the invitation re-fetch ending first does not end it: the controls stay greyed until the first load ends";
const A4 = "an empty re-fetch ending first: the empty Dashboard's New Project and Load Sample Project are greyed out too";
const A5 = "a failed first load ends it too";
const A6 = "switching to local storage and back greys them again until that load ends";
const A7 =
  "a New Project window opened before the load began: Create inside it creates nothing, the window says why and keeps the name; after the load the same Create creates the project";
const A8 =
  "Load Sample pressed before the load began and landing inside it adds nothing, and a message says why; pressed after the load, it adds the sample";
const A9 =
  "Import Projects: a file confirmed after the invitation re-fetch but before the first load ends is refused, and nothing is added";
const A10 = "control: in local storage nothing is greyed and there is no note, signed in or not";
const A11 =
  "control: while a remembered sign-in is still being restored nothing is greyed — the gate starts when the sign-in is recognised";
const A12 = "is greyed out with a note while the first cloud load runs, Ctrl+Enter adds nothing, and after the load it imports";
const A13 =
  "the first sign-in's settings, arriving while the second sign-in's load runs, leave New Project, Load Sample, the loading message and Choose File as they were until that load ends";
const A14 =
  "the first sign-in's settings load failing while the second sign-in's load runs leaves New Project, Load Sample, the loading message and Choose File as they were until that load ends";
const A15 =
  "Load Sample pressed before the sign-in was recognised, with the Dashboard then left: landing inside the load it adds nothing, and a message says why";
const A16 =
  "Load Sample pressed before the sign-in was recognised, with the Dashboard left during the load: landing after the load ends, it adds the sample";
const A17 =
  "while New Project is greyed out, deleting the last tile moves focus to the note, which says why, and on to New Project when the load ends";
const A18 =
  "while New Project is greyed out, deleting a project that could not be loaded moves focus to the note, and on to New Project when the load ends";
const A19 =
  "into an existing project too: greyed out with a note while the first cloud load runs, Ctrl+Enter adds nothing, and after the load it imports";
// ProjectsPage.test.tsx and ProjectsPage.tile-delete.test.tsx — local storage, where nothing may be greyed
const PP_TOAST = "keeps the sample-load toast up for 8 seconds, not the 3-second default";
const PP_FOCUS = "confirming removes it and focus lands on New Project, not <body>";
const TD_FOCUS_NONE = "when no tile is left, focus moves to the New Project button at the top";
// ConnectAiPanel.test.tsx
const P1 = "the title row's Close button closes the panel, and the AI session stays";
const P2 = "Disconnect asks first: nothing is ended until the question is answered";
const P3 = "Cancel keeps the panel open and the session connected, and puts focus back on Disconnect";
const P4 = "Esc on the question closes only the question, and puts focus back on Disconnect";
const P5 = "confirming ends the session once, then closes the panel";
const P6 = "control: Esc closes the panel, and the AI session stays";
const P7 = "control: a press outside the panel closes it, and the AI session stays";

const escape = (s) => s.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

/** Matches exactly these test titles, as the verbose reporter prints them. */
const only = (...titles) => new RegExp(`> (?:${titles.map(escape).join("|")})$`);

export const testFile = "src/";
export const mutations = [
  // -- WI-112: the greyed-out controls ---------------------------------------------------------
  {
    id: "S1  the header's New Project is not greyed out  [expect 9: A1, A2, A3, A5, A6, A13, A14, A17, A18]",
    file: PAGE,
    find: "ref={newProjectRef}\n            onClick={() => setDialogOpen(true)}\n            disabled={createBlocked}",
    replace: "ref={newProjectRef}\n            onClick={() => setDialogOpen(true)}",
    expectFailing: only(A1, A2, A3, A5, A6, A13, A14, A17, A18),
  },
  {
    id: "S2  the header's Load Sample is not greyed out  [expect 7: A1, A2, A3, A6, A13, A14, A16]",
    file: PAGE,
    find: "onClick={handleLoadSample}\n            disabled={createBlocked}",
    replace: "onClick={handleLoadSample}",
    expectFailing: only(A1, A2, A3, A6, A13, A14, A16),
  },
  {
    id: "S3  a tile's Clone is not greyed out  [expect 4: A2, A3, A13, A14]",
    file: TILE,
    find: "disabled={cloneUnavailableNoteId !== undefined}",
    replace: "disabled={false}",
    expectFailing: only(A2, A3, A13, A14),
  },
  {
    // One guarantee — the empty Dashboard's two buttons — so one paired straw.
    id: "S4  the empty Dashboard's New Project and Load Sample Project are not greyed out  [expect 1: A4]",
    file: PAGE,
    find: "onClick={() => setDialogOpen(true)}\n                  disabled={createBlocked}",
    replace: "onClick={() => setDialogOpen(true)}",
    also: {
      find: "onClick={handleLoadSample}\n                  disabled={createBlocked}",
      replace: "onClick={handleLoadSample}",
    },
    expectFailing: only(A4),
  },
  {
    id: "S5  the Dashboard's note never shows  [expect 12: A1, A2, A3, A4, A5, A6, A8, A13, A14, A16, A17, A18]",
    file: PAGE,
    find: "{createBlocked && (\n        // tabIndex -1:",
    replace: "{false && (\n        // tabIndex -1:",
    expectFailing: only(A1, A2, A3, A4, A5, A6, A8, A13, A14, A16, A17, A18),
  },
  {
    id: "S6  no greyed-out control is described to a screen reader  [expect 14: A1, A2, A3, A4, A5, A6, A7, A12, A13, A14, A16, A17, A18, A19]",
    file: WORDS,
    find: 'return unavailable ? { "aria-describedby": reasonId } : {};',
    replace: "return {};",
    expectFailing: only(A1, A2, A3, A4, A5, A6, A7, A12, A13, A14, A16, A17, A18, A19),
  },
  // -- WI-112: the flag ---------------------------------------------------------------------------
  {
    id: "S7  a load that succeeds never ends it  [expect 15: A1, A2, A3, A4, A6, A7, A8, A9, A12, A13, A14, A16, A17, A18, A19]",
    file: SYNC,
    find:
      "initialLoadDoneRef.current = true;\n          useProjectStore.getState().setCloudSyncReady(true);\n          useProjectStore.getState().setCloudDataLoaded(true);",
    replace: "initialLoadDoneRef.current = true;\n          useProjectStore.getState().setCloudDataLoaded(true);",
    expectFailing: only(A1, A2, A3, A4, A6, A7, A8, A9, A12, A13, A14, A16, A17, A18, A19),
  },
  {
    id: "S8  a load that fails never ends it  [expect 1: A5]",
    file: SYNC,
    find:
      'console.error("Failed to load projects from Firestore:", e);\n          initialLoadDoneRef.current = true;\n          useProjectStore.getState().setCloudSyncReady(true);',
    replace: 'console.error("Failed to load projects from Firestore:", e);\n          initialLoadDoneRef.current = true;',
    expectFailing: only(A5),
  },
  {
    // The guard (WI-112): without it, a run cleaned up while its preferences loaded marks the NEXT
    // sign-in's load done when its late answer lands, whether that answer arrives or fails — exactly
    // patch v1's code.
    id: "S28 a load abandoned while its preferences load ends the next sign-in's load  [expect 2: A13, A14]",
    file: SYNC,
    find: "          if (cancelled) return;\n\n          initialLoadDoneRef.current = true;",
    replace: "          // (no guard)\n\n          initialLoadDoneRef.current = true;",
    expectFailing: only(A13, A14),
  },
  {
    // The guard's PLACE: moved inside the try, next to the merge's own `!cancelled`, a resolved late
    // answer still meets it (A13 passes) but a FAILED one goes to the catch, past it, and on to the flips.
    id: "S29 the guard inside the try: a late preferences FAILURE ends the next sign-in's load  [expect 1: A14]",
    file: SYNC,
    find:
      "              usePreferencesStore.getState().updatePreferences(cloudPrefs);\n            }\n          } catch (e) {",
    replace:
      "              usePreferencesStore.getState().updatePreferences(cloudPrefs);\n            }\n            if (cancelled) return;\n          } catch (e) {",
    also: {
      find: "          if (cancelled) return;\n\n          initialLoadDoneRef.current = true;",
      replace: "          initialLoadDoneRef.current = true;",
    },
    expectFailing: only(A14),
  },
  {
    // The tempting wrong design: the flag the Dashboard's loading message already uses.
    id: "S9  WRONG DESIGN: the gate on cloudDataLoaded, which the invitation re-fetch sets early  [expect 2: A3, A4]",
    file: GATE,
    find: "return s.cloudSyncActive && !s.cloudSyncReady;",
    replace: "return s.cloudSyncActive && !s.cloudDataLoaded;",
    expectFailing: only(A3, A4),
  },
  {
    // The other wrong design: the flag alone is false in local storage too, so local storage is greyed.
    // (Until PP_TOAST had a limit longer than its settle()'s 15-s deadline, it TIMED OUT here and its
    // still-running loop failed anywhere from none to six of the tests after it — measured 8, 13, 14.)
    id: "S10 WRONG DESIGN: the gate without the storage mode  [expect 10: A6, A7, A8, A10, A11, A15, A16, PP_TOAST, PP_FOCUS, TD_FOCUS_NONE]",
    file: GATE,
    find: "return s.cloudSyncActive && !s.cloudSyncReady;",
    replace: "return !s.cloudSyncReady;",
    expectFailing: only(A6, A7, A8, A10, A11, A15, A16, PP_TOAST, PP_FOCUS, TD_FOCUS_NONE),
  },
  {
    // Either reset alone covers for the other; only together do they decide a second sign-in.
    id: "S18 neither place sets the flag false — where a cloud load begins, and where cloud sync stops  [expect 1: A6]",
    file: SYNC,
    find: "      useProjectStore.getState().setCloudSyncReady(false);\n      // Reset the startup grace gate",
    replace: "      // Reset the startup grace gate",
    also: {
      find:
        "      useProjectStore.getState().setCloudSyncReady(false);\n      useProjectStore.getState().setCloudDataLoaded(false);\n      cleanupListeners();",
      replace: "      useProjectStore.getState().setCloudDataLoaded(false);\n      cleanupListeners();",
    },
    expectFailing: only(A6),
  },
  // -- WI-112: each create checked again as it commits ------------------------------------------
  {
    id: "S11 the New Project window's Create is not checked  [expect 1: A7]",
    file: DIALOG,
    find: "if (name.trim() && !blocked) {",
    replace: "if (name.trim()) {",
    expectFailing: only(A7),
  },
  {
    id: "S12 the New Project window's line never shows  [expect 1: A7]",
    file: DIALOG,
    find: "{blocked && (\n              <p id={blockedId}",
    replace: "{false && (\n              <p id={blockedId}",
    expectFailing: only(A7),
  },
  {
    id: "S13 the sample's build is not checked when it lands  [expect 2: A8, A15]",
    file: STORE,
    find: "if (isRefused?.()) return null;",
    replace: "// (not checked)",
    expectFailing: only(A8, A15),
  },
  {
    id: "S17 Import Projects' Confirm checks cloudDataLoaded alone  [expect 1: A9]",
    file: IMPORT,
    find: 'if (mode === "cloud" && (!cloudDataLoaded || !cloudSyncReady)) {',
    replace: 'if (mode === "cloud" && !cloudDataLoaded) {',
    expectFailing: only(A9),
  },
  // -- WI-112: Settings' Import Activities -------------------------------------------------------
  {
    id: "S14 Import Activities is not greyed out  [expect 2: A12, A19]",
    file: SECTION,
    find: "disabled={importBlocked}",
    replace: "disabled={false}",
    expectFailing: only(A12, A19),
  },
  {
    id: "S15 Import Activities' commit is not checked (Ctrl+Enter)  [expect 2: A12, A19]",
    file: SECTION,
    find: "if (importBlocked) return;",
    replace: "// (not checked)",
    expectFailing: only(A12, A19),
  },
  {
    id: "S16 Import Activities' line never shows  [expect 2: A12, A19]",
    file: SECTION,
    find: "{importBlocked && (\n                    <p id={blockedId}",
    replace: "{false && (\n                    <p id={blockedId}",
    expectFailing: only(A12, A19),
  },
  {
    // Owner, R467 (2): every target. Patch v4 greyed it only for a new project — this puts that back.
    id: "S34 Import Activities is greyed out only for a new project  [expect 1: A19]",
    file: SECTION,
    find: "  importBlocked = false,\n}: ActivityImportSectionProps) {",
    replace: "  importBlocked: importBlockedProp = false,\n}: ActivityImportSectionProps) {",
    also: {
      find: "  const preferences = usePreferencesStore((s) => s.preferences);\n",
      replace:
        '  const preferences = usePreferencesStore((s) => s.preferences);\n  const importBlocked = importBlockedProp && targetProjectId === "new";\n',
    },
    expectFailing: only(A19),
  },
  // -- WI-112: the sample, ready on another page (review 25, E-a) ------------------------------
  {
    // Patch v4's design: the landing asks a copy the Dashboard keeps current — which stops updating once
    // the Dashboard is left, frozen at whatever it was then: open (A15) or shut (A16).
    id: "S30 WRONG DESIGN: the sample's landing asks a copy the Dashboard keeps  [expect 2: A15, A16]",
    file: PAGE,
    find: "  const createNoteRef = useRef<HTMLParagraphElement>(null);\n",
    replace:
      "  const createNoteRef = useRef<HTMLParagraphElement>(null);\n  const createBlockedRef = useRef(createBlocked);\n  useEffect(() => {\n    createBlockedRef.current = createBlocked;\n  }, [createBlocked]);\n",
    also: {
      find: "loadSampleProject(newProjectOwner, isCloudCreateBlocked)",
      replace: "loadSampleProject(newProjectOwner, () => createBlockedRef.current)",
    },
    expectFailing: only(A15, A16),
  },
  {
    id: "S31 a refused sample says nothing  [expect 2: A8, A15]",
    file: PAGE,
    find: "      if (!project) {\n        toast.error(SAMPLE_NOT_ADDED_MESSAGE);\n        return;\n      }",
    replace: "      if (!project) return;",
    expectFailing: only(A8, A15),
  },
  // -- WI-112: focus after a Delete while New Project is greyed out (owner, R467 (1)) ------------
  {
    // Patch v4: focus went to New Project however it was — and a greyed-out button takes no focus.
    id: "S32 focus goes to New Project even while it is greyed out  [expect 2: A17, A18]",
    file: PAGE,
    find: "return newProject?.disabled && note ? note : newProject;",
    replace: "return newProject;",
    expectFailing: only(A17, A18),
  },
  {
    id: "S33 the note cannot take focus  [expect 2: A17, A18]",
    file: PAGE,
    find: '          role="note"\n          tabIndex={-1}\n',
    replace: '          role="note"\n',
    expectFailing: only(A17, A18),
  },
  {
    // Review 25, pass 2: v5's end state — the note leaves with the gate, and the focus with it.
    id: "S36 when the load ends, focus on the note falls to <body>  [expect 2: A17, A18]",
    file: PAGE,
    find: "      if (document.activeElement === note) {\n        queueMicrotask(() => newProjectRef.current?.focus());\n      }\n",
    replace: "",
    expectFailing: only(A17, A18),
  },
  {
    // Review 25-2 W4: the window's line is a note, like the Dashboard's and Settings'.
    id: "S35 the New Project window's line is not a note  [expect 1: A7]",
    file: DIALOG,
    find: '<p id={blockedId} role="note" className="text-sm text-amber-700 dark:text-amber-300">',
    replace: '<p id={blockedId} className="text-sm text-amber-700 dark:text-amber-300">',
    expectFailing: only(A7),
  },
  // -- WI-111 ----------------------------------------------------------------------------------
  {
    id: "S21 the panel has no Close button  [expect 1: P1]",
    file: PANEL,
    find:
      '            <Dialog.Close asChild>\n              <button\n                type="button"\n                aria-label="Close"\n                className="shrink-0 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"\n              >\n                <CloseIcon />\n              </button>\n            </Dialog.Close>\n',
    replace: "",
    expectFailing: only(P1),
  },
  {
    id: "S22 WRONG DESIGN: the Close button also ends the session  [expect 1: P1]",
    file: PANEL,
    find: 'aria-label="Close"',
    replace: 'aria-label="Close"\n                onClick={() => {\n                  void onDisconnect();\n                }}',
    expectFailing: only(P1),
  },
  {
    id: "S23 Disconnect ends the session at once, without asking  [expect 4: P2, P3, P4, P5]",
    file: PANEL,
    find: "onClick={() => setConfirmingDisconnect(true)}",
    replace: "onClick={handleDisconnect}",
    expectFailing: only(P2, P3, P4, P5),
  },
  {
    id: "S24 Cancel and Esc on the question end the session too  [expect 2: P3, P4]",
    file: PANEL,
    find: 'confirmLabel="Disconnect"\n            destructive',
    replace: 'confirmLabel="Disconnect"\n            onCancel={() => {\n              void handleDisconnect();\n            }}\n            destructive',
    expectFailing: only(P3, P4),
  },
  {
    id: "S25 confirming the question does nothing  [expect 1: P5]",
    file: PANEL,
    find: "onConfirm={() => {\n              void handleDisconnect();\n            }}",
    replace: "onConfirm={() => {}}",
    expectFailing: only(P5),
  },
  {
    id: "S26 the question says something else  [expect 1: P2]",
    file: PANEL,
    find: '"The AI will no longer be able to change this project, and',
    replace: '"The AI can no longer change this project, and',
    expectFailing: only(P2),
  },
  {
    id: "S27 WRONG DESIGN: closing the panel (Esc, outside, ×) ends the session  [expect 3: P1, P6, P7]",
    file: PANEL,
    find: "onOpenChange={(o) => { if (!o) onClose(); }}",
    replace: "onOpenChange={(o) => { if (!o) { void onDisconnect(); onClose(); } }}",
    expectFailing: only(P1, P6, P7),
  },
];
