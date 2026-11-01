// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Falsification spec for an activity's frozen Planned Start and Planned Finish, and release 2's display
// (WI-137 release 2, v0.81.0).
//
// A row leaving Planned keeps the start and finish its plan schedule gives it — the page's own schedule
// function, with the edits of the same step applied — both or neither; only → Planned clears them; no
// copy, step or engine invents or reads them. The Edit Activity window derives its pair, says why when
// there is none, and keeps v0.80.0's Sched. Finish for a Complete row without one; Schedule Analysis
// shows no date; an overtaken link is dashed, never a critical edge, and its hover says so; the export
// writes the four dates and names its date format; the printed notes have a true intro. Each straw
// undoes one of those and must fail the tests that pin it. Read "K failing; named-match K", not merely a
// non-zero exit: the runner prints ✔ when ANY named test fails. Each straw was run ALONE first, against
// the whole suite; its expected set is what that run observed.
const RULE = new URL("../src/core/schedule/recorded-progress.ts", import.meta.url).pathname;
const WORDS = new URL("../src/ui/helpers/progress-note-words.ts", import.meta.url).pathname;
const SERVICE = new URL("../src/app/api/project-service.ts", import.meta.url).pathname;
const STORE = new URL("../src/ui/hooks/use-project-store.ts", import.meta.url).pathname;
const MIGRATIONS = new URL("../src/infrastructure/persistence/migrations.ts", import.meta.url).pathname;
const SCHEMA = new URL("../src/domain/schemas/project.schema.ts", import.meta.url).pathname;
const EXPORT = new URL("../src/app/api/schedule-export-service.ts", import.meta.url).pathname;
const CHART = new URL("../src/ui/charts/GanttChart.tsx", import.meta.url).pathname;
const PRINT_CHART = new URL("../src/ui/charts/PrintGanttChart.tsx", import.meta.url).pathname;
const LEGEND = new URL("../src/ui/charts/GanttLegend.tsx", import.meta.url).pathname;
const CONSTANTS = new URL("../src/ui/charts/gantt-constants.ts", import.meta.url).pathname;
const SECTIONS = new URL("../src/ui/components/activity-modal-sections.tsx", import.meta.url).pathname;
const MODAL = new URL("../src/ui/components/ActivityEditModal.tsx", import.meta.url).pathname;
const BULK = new URL("../src/ui/components/unified-activity-helpers.ts", import.meta.url).pathname;
const ROW_HELPERS = new URL("../src/ui/components/activity-row-helpers.ts", import.meta.url).pathname;
const PRINT_SECTIONS = new URL("../src/ui/components/print-sections.tsx", import.meta.url).pathname;
const PAGE = new URL("../src/ui/pages/ProjectPage.tsx", import.meta.url).pathname;
const REPORT = new URL("../src/ui/components/PrintableReport.tsx", import.meta.url).pathname;

const escape = (s) => s.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

/** Matches exactly these test titles, as the verbose reporter prints them. */
const only = (...titles) => new RegExp(`> (?:${titles.map(escape).join("|")})$`);

export const testFile = "src/";
export const mutations = [
  // -- DESIGN §8.3: the three measured straws ------------------------------------------------------
  {
    id: "P1  the same-day sentence removed  [expect 6]",
    file: WORDS,
    find: "  if (note.date === note.predecessorDate) return sameDaySentence(note, succ, who, formatDate);\n",
    replace: "",
    expectFailing: only(
      "dependencies on, the predecessor Complete",
      "dependencies on, the predecessor not yet Complete",
      "dependencies off (the activity above it), the predecessor Complete",
      "dependencies off, the predecessor not yet Complete",
      "every type, lag and lead reached; every date in every sentence is distinct",
      "a heading with the count, a plain line on what a note is, then one sentence per note",
    ),
  },
  {
    id: "P2  the engine reads plannedStartDate as the start  [expect 17]",
    file: RULE,
    find: "    let start = advanceToNextWorkingDay(parseDateISO(a.actualStartDate), calendar);",
    replace: "    let start = advanceToNextWorkingDay(parseDateISO(a.plannedStartDate ?? a.actualStartDate), calendar);",
    expectFailing: only(
      "the deterministic schedule, dependencies on and off, is identical",
      "the simulation through the worker, dependencies on and off: every sample identical",
      "Planned → In Progress captures what the grid SHOWED; → Planned clears it; Planned → Complete captures",
      "hold what each row holds — and nothing a row does not",
      "MM/DD/YYYY: a real CSV — its summary's Date Format line, and the four columns",
      "MM/DD/YYYY: a real XLSX, read back — the Date Format line, and the four columns",
      "DD/MM/YYYY: a real CSV — its summary's Date Format line, and the four columns",
      "DD/MM/YYYY: a real XLSX, read back — the Date Format line, and the four columns",
      "YYYY/MM/DD: a real CSV — its summary's Date Format line, and the four columns",
      "YYYY/MM/DD: a real XLSX, read back — the Date Format line, and the four columns",
      "In Progress: Planned Start, Actual Start, Sched. Finish, Sched. Dur., Actual Dur.",
      "Planned → In Progress shows and saves C's plan as its Planned pair",
      "Planned → Complete saves the pair too",
      "… while leaving Planned replaces it with the plan, as every path does",
      "the grid's Status cell (statusUpdatesFor): C's scheduled dates; with no schedule, none",
      "the bulk toolbar's plan: each row its own pair; a started row's pair is kept",
      "ONE plan schedule per Apply, with the Apply's other updates on the selected rows (ruling 5a)",
    ),
  },
  {
    id: "P3  the window takes a started row's plan from a schedule, not its stored pair, after a toggle  [expect 5]",
    file: MODAL,
    find: '  if (activity.status !== "planned") {\n    return { plannedStartDate: activity.plannedStartDate ?? "", plannedFinishDate: activity.plannedFinishDate ?? "" };\n  }\n',
    replace: "",
    also: {
      find: 'activity.status !== "planned" || draftStatus === "planned") return undefined;',
      replace: 'draftStatus === "planned") return undefined;',
    },
    expectFailing: only(
      "legacy rows: a dash read 'none kept'; every Status walk and Save writes NO pair",
      "In Progress: a dash read 'none kept', and a visible grey line that says why — the cell's description",
      "In Progress with neither an Actual Start nor a pair: both lines",
      "Complete: v0.80.0's Sched. Finish — the Actual Start plus the planned duration, 10/05 + 10 days = 10/16 — never a dash",
      "an unrelated Save of a row from before v0.81.0 writes no Planned date",
    ),
  },
  // -- DESIGN §8.3: the fifteen to add (needles from this build) ------------------------------------
  {
    id: "P4  no capture  [expect 41]",
    file: RULE,
    find: '  const planned = activity.status === "planned" ? plannedDatesAtStart(ctx) : {};',
    replace: "  const planned = {};",
    expectFailing: only(
      "Planned → In Progress keeps the schedule's start and finish",
      "Planned → Complete, not yet due, keeps them too",
      "Planned → Complete, already due: the plan and the actuals are the same dates",
      "Planned → In Progress with no schedule (a cycle, a calendar error): none kept",
      "Planned → Complete with no schedule: none kept",
      "a start without a finish is no schedule: none kept",
      "a Planned row carrying a pair (an import) gets the schedule's, never its own",
      "… and with no schedule that pair is cleared, not kept",
      "the Actual dates are exactly as release 1 wrote them: the capture is beside them, never instead",
      "Planned → In Progress on a Tuesday: today, 1",
      "Planned → In Progress ignores a date a Planned row carries (an import): today",
      "Planned → In Progress on a Saturday: the Friday before, never a Monday to come (h)",
      "Planned → Complete, already due: its scheduled start and finish",
      "Planned → Complete, started and not yet due: scheduled start to today",
      "Planned → Complete, not yet started: today and today",
      "Planned → Complete with no schedule: today and today",
      "Planned → Complete on a Saturday, due Friday 10-30: its scheduled dates, nothing after today",
      "V's case — the grid, the estimate committed first, then the Status: 11/02 – 11/20",
      "a constraint — the grid path: committed, then the Status",
      "v0.80.0's Complete defaults read the same plan as the pair: the grid path",
      "a Distribution staged with the Status: the plan has the new Distribution",
      "… the same as two Applies, the Distribution first and then the Status",
      "a dependent chain started in one Apply keeps each row's pre-Apply plan, unchanged (ruling 5b)",
      "undo and redo carry them: C started by the grid's rule, undone, redone",
      "Planned → In Progress captures what the grid SHOWED; → Planned clears it; Planned → Complete captures",
      "a legacy row taken to Planned and back by the grid gets the LINK-placed plan — a fresh Planned → started change",
      "a row WITH a pair, toggled to Planned and back in one sitting, keeps its own pair (never its Actual Start)",
      "a dependent chain started in ONE Apply: each row its pre-Apply plan — compared with the grid one row at a time",
      "a dependency cycle: Planned → In Progress by grid, window and bulk keeps NONE (keys cleared)",
      "a calendar that cannot schedule (no working day in the week): NONE",
      "typed dates, estimates, links, Start Date: the pair never moves; copies, JSON, undo/redo, cloud carry it as ruled",
      "Complete → In Progress keeps (grid); bulk same-status, → Complete, → In Progress keep; bulk → Planned clears",
      "§9 contrast: the GRID path, estimate committed first, captures the NEW estimate's plan",
      "the grid's Status cell (statusUpdatesFor): C's scheduled dates; with no schedule, none",
      "the bulk toolbar's plan: each row its own pair; a started row's pair is kept",
      "ONE plan schedule per Apply, with the Apply's other updates on the selected rows (ruling 5a)",
      "the grid: one toast naming the row, only when it leaves Planned with no schedule",
      "the bulk toolbar: ONE toast with the count",
      "WI-137: routes every Status per activity, never as a shared update — In Progress writes today and a count",
      "WI-137: gives each activity its own dates and count, by the one rule",
      "issues TWO entries for an activity that is both completed and recalculated",
    ),
  },
  {
    id: "P5  a capture on every change (a back-fill)  [expect 18]",
    file: RULE,
    find: '  const planned = activity.status === "planned" ? plannedDatesAtStart(ctx) : {};',
    replace: "  const planned = plannedDatesAtStart(ctx);",
    expectFailing: only(
      "every legacy started row, through every started↔started change: NO pair, ever",
      "Planned → In Progress captures what the grid SHOWED; → Planned clears it; Planned → Complete captures",
      "legacy started rows through Complete and In Progress: NO pair",
      "Complete → In Progress keeps (grid); bulk same-status, → Complete, → In Progress keep; bulk → Planned clears",
      "In Progress → Complete leaves the pair as it is",
      "Complete → In Progress leaves it too",
      "a row started before v0.81.0 set to Complete gets NO pair — never today's schedule (no back-fill)",
      "a row started before v0.80.0 (no date at all) set to Complete gets none either",
      "Complete → In Progress: start kept, finish cleared, elapsed from the start",
      "In Progress → Complete on a Tuesday: finish today",
      "In Progress → Complete on a Saturday: finish the Friday before",
      "In Progress → Complete, recorded start after today: finish never before the start",
      "In Progress with NO start → Complete (ruling 3): no dates, its count kept",
      "In Progress with no start and no count → Complete: its scheduled duration, no dates",
      "In Progress with no start, no count, no schedule → Complete: nothing",
      "the bulk toolbar's plan: each row its own pair; a started row's pair is kept",
      "the grid: one toast naming the row, only when it leaves Planned with no schedule",
      "the bulk toolbar: ONE toast with the count",
    ),
  },
  {
    id: "P6  → Planned keeps the pair  [expect 7]",
    file: RULE,
    find: "  actualDuration: undefined,\n  plannedStartDate: undefined,\n  plannedFinishDate: undefined,\n",
    replace: "  actualDuration: undefined,\n",
    expectFailing: only(
      "Planned → In Progress captures what the grid SHOWED; → Planned clears it; Planned → Complete captures",
      "Complete → In Progress keeps (grid); bulk same-status, → Complete, → In Progress keep; bulk → Planned clears",
      "In Progress → Planned clears it",
      "Complete → Planned clears it",
      "In Progress → Planned: all three cleared",
      "Complete → Planned: all three cleared",
      "a clear names its keys, so a spread over the activity removes the old values",
    ),
  },
  {
    id: "P7  a lone start kept  [expect 1]",
    file: RULE,
    find: "  return scheduledStart && scheduledFinish\n",
    replace: "  return scheduledStart\n",
    expectFailing: only("a start without a finish is no schedule: none kept"),
  },
  {
    id: "P8  the reforecast copy keeps the pair  [expect 2]",
    file: SERVICE,
    find: "actualFinishDate: undefined, plannedStartDate: undefined, plannedFinishDate: undefined,",
    replace: "actualFinishDate: undefined,",
    expectFailing: only(
      "a plain scenario copy and a project copy keep them; a reforecast copy carries none",
      "typed dates, estimates, links, Start Date: the pair never moves; copies, JSON, undo/redo, cloud carry it as ruled",
    ),
  },
  {
    id: "P9  the duplicate keeps the pair  [expect 2]",
    file: STORE,
    find: "        plannedStartDate: undefined, // WI-137 release 2: nor a plan kept from the original\n        plannedFinishDate: undefined,\n",
    replace: "",
    expectFailing: only(
      "a duplicated activity is new work: Planned, no Planned dates",
      "typed dates, estimates, links, Start Date: the pair never moves; copies, JSON, undo/redo, cloud carry it as ruled",
    ),
  },
  {
    id: "P10 the 26 → 27 step back-fills  [expect 15]",
    file: MIGRATIONS,
    find: "  project.schemaVersion = 27;\n",
    replace:
      "  project.schemaVersion = 27;\n" +
      "  for (const s of (project.scenarios as Array<{ activities: Array<Record<string, unknown>> }>) ?? [])\n" +
      '    for (const a of s.activities) if (a.status !== "planned") a.plannedStartDate = "2026-01-05";\n',
    expectFailing: only(
      "the 26 → 27 step only stamps the version: a started row is given NO Planned date (never back-filled)",
      "this browser's storage: the older tab saves its WHOLE copy, stamped 26 — the Planned dates and a change made here since are gone; reload that tab first",
      "migrates 26 → 27 with NO pair on any row (no back-fill at load)",
      "every legacy started row, through every started↔started change: NO pair, ever",
      "Planned → In Progress captures what the grid SHOWED; → Planned clears it; Planned → Complete captures",
      "legacy rows: a dash read 'none kept'; every Status walk and Save writes NO pair",
      "a Planned row: the window shows the grid's dates as the plan; Cancel writes nothing; Save writes them",
      "legacy started rows through Complete and In Progress: NO pair",
      "a dependent chain started in ONE Apply: each row its pre-Apply plan — compared with the grid one row at a time",
      "a dependency cycle: Planned → In Progress by grid, window and bulk keeps NONE (keys cleared)",
      "a calendar that cannot schedule (no working day in the week): NONE",
      "typed dates, estimates, links, Start Date: the pair never moves; copies, JSON, undo/redo, cloud carry it as ruled",
      "Complete → In Progress keeps (grid); bulk same-status, → Complete, → In Progress keep; bulk → Planned clears",
      "§9 contrast: the GRID path, estimate committed first, captures the NEW estimate's plan",
      "h2 order in the print report",
    ),
  },
  {
    id: "P11 Zod drops plannedStartDate  [expect 4]",
    file: SCHEMA,
    find: "    plannedStartDate: ISODateString.optional(),\n",
    replace: "",
    expectFailing: only(
      "Zod: real dates load; a non-date or an impossible date does not; a finish before its start still LOADS",
      "this browser's storage: the older tab saves its WHOLE copy, stamped 26 — the Planned dates and a change made here since are gone; reload that tab first",
      "JSON Export → Import keeps both dates",
      "typed dates, estimates, links, Start Date: the pair never moves; copies, JSON, undo/redo, cloud carry it as ruled",
    ),
  },
  {
    id: "P12 the export prints a Planned row's own pair  [expect 12]",
    file: EXPORT,
    find: '  if (activity.status === "planned") {\n    return { plannedStart: held(plan?.startDate)',
    replace: "  if (false) {\n    return { plannedStart: held(plan?.startDate)",
    expectFailing: only(
      "hold what each row holds — and nothing a row does not",
      "MM/DD/YYYY: a real CSV — its summary's Date Format line, and the four columns",
      "MM/DD/YYYY: a real XLSX, read back — the Date Format line, and the four columns",
      "DD/MM/YYYY: a real CSV — its summary's Date Format line, and the four columns",
      "DD/MM/YYYY: a real XLSX, read back — the Date Format line, and the four columns",
      "YYYY/MM/DD: a real CSV — its summary's Date Format line, and the four columns",
      "YYYY/MM/DD: a real XLSX, read back — the Date Format line, and the four columns",
      // WI-150 (v0.83.0): measured alone, 12 — v0.82.0's four export tests and WI-150's round trip also catch it.
      "owner, Q1: the page's own export gives Delta, not started, its Planned dates from the plan before today's floor",
      "hand-edited (summary block removed, # renamed Activity ID, Total row removed): the four dates come back",
      "with the plan: Planned 10/12 – 10/16, the dates Next would keep if it started now",
      "without one, as before: the dates shown, 10/27 – 11/02",
      "schedules work that has not started from today: Next 10/27 – 11/02, its Planned dates the plan's 10/12 – 10/16",
    ),
  },
  {
    id: "P13 the screen arrow undashed  [expect 5]",
    file: CHART,
    find: " strokeDasharray={ap.dash}",
    replace: "",
    expectFailing: only(
      "ProjectPage → GanttSection: the screen Gantt draws the overtaken link dashed, with its legend entry",
      "screen and print dash the SAME arrow, each with its own dash, and both legends say so",
      "… hovered too: the ordinary hover colour and arrowhead, and its hover text says it was overtaken (F13)",
      "the chart reads the set it is given, built once per schedule — not the notes (F18)",
      "screen and print dash A → B, the sequential note's link",
    ),
  },
  {
    id: "P14 the print arrow undashed  [expect 3]",
    file: PRINT_CHART,
    find: "markerEnd={arrowMarker} strokeDasharray={dash} />",
    replace: "markerEnd={arrowMarker} />",
    expectFailing: only(
      "PrintableReport → PrintGanttChart: the printed Gantt draws it dashed too",
      "screen and print dash the SAME arrow, each with its own dash, and both legends say so",
      "screen and print dash A → B, the sequential note's link",
    ),
  },
  {
    id: "P15 the legend entry always shown  [expect 1]",
    file: LEGEND,
    find: "      {overtakenLinkDash && (",
    replace: "      {(overtakenLinkDash || true) && (",
    expectFailing: only("with no note, no arrow is dashed and neither legend has the entry"),
  },
  {
    id: "P16 OVERTAKEN_LINK_DASH = \"4 3\"  [expect 2]",
    file: CONSTANTS,
    find: 'export const OVERTAKEN_LINK_DASH = "5 3";',
    replace: 'export const OVERTAKEN_LINK_DASH = "4 3";',
    expectFailing: only(
      "ProjectPage → GanttSection: the screen Gantt draws the overtaken link dashed, with its legend entry",
      "neither dash appears among every dash the Gantt files draw, nor among the Finish Target's",
    ),
  },
  {
    id: "P17 a date back in Schedule Analysis  [expect 3]",
    file: SECTIONS,
    find: '      <div className="text-gray-500 dark:text-gray-400">Total Float</div>\n',
    replace:
      '      <div className="text-gray-500 dark:text-gray-400">Scheduled Start</div>\n' +
      '      <div className="text-gray-900 dark:text-gray-100">{"11/02/2026"}</div>\n' +
      '      <div className="text-gray-500 dark:text-gray-400">Total Float</div>\n',
    expectFailing: only(
      "Planned: no date in the section",
      "In Progress: no date in the section",
      "Complete: no date in the section",
    ),
  },
  {
    id: "P18 the Complete line's order swapped  [expect 4]",
    file: SECTIONS,
    find:
      "          {actualStart}\n" +
      '          {plannedFinishDate ? plannedCell("Finish", plannedFinishDate) : schedFinishCell(completeSchedFinish ?? sa?.endDate)}\n',
    replace:
      '          {plannedFinishDate ? plannedCell("Finish", plannedFinishDate) : schedFinishCell(completeSchedFinish ?? sa?.endDate)}\n' +
      "          {actualStart}\n",
    expectFailing: only(
      "a Planned row: the window shows the grid's dates as the plan; Cancel writes nothing; Save writes them",
      "Complete with a pair: Actual Start, Planned Finish, Actual Finish, Actual Dur. — the plan between the two actuals",
      "Complete: v0.80.0's Sched. Finish — the Actual Start plus the planned duration, 10/05 + 10 days = 10/16 — never a dash",
      "Complete: Sched. Finish (read-only, 10/05 + 10 working days = 10/16), Actual Start, Actual Finish, Actual Dur.",
    ),
  },
  // -- The brief's additions ------------------------------------------------------------------------
  {
    id: "P19 2a: the window's drafts left out of the plan  [expect 5]",
    file: MODAL,
    find: "    ...computeEstimateUpdates(activity, d.min, d.mostLikely, d.max, d.confidenceLevel, d.distributionType),\n",
    replace: "",
    also: {
      find: "    ...computeConstraintUpdates(activity, d.constraintType, d.constraintDate, d.constraintMode, d.constraintNote),\n",
      replace: "",
    },
    expectFailing: only(
      "… and the window, one sitting, the estimate, then the Status: the same pair, shown at once and saved",
      "… and the window, one sitting, the Status, then the estimate: the same pair, shown at once and saved",
      "… and the window, the constraint set in the same sitting as the Status: the same pair",
      "… and the window, the estimate first: the same pair, and the same actual dates",
      "§9 timing (ruling 5a): an estimate edited in the same sitting IS in the plan, in either order",
    ),
  },
  {
    id: "P20 2a: the bulk Apply's other updates left out of the plan  [expect 2]",
    file: BULK,
    find: '  if (!planSchedule || status === "planned" || edits.length === 0) return scheduledActivities;',
    replace: "  return scheduledActivities;",
    expectFailing: only(
      "a Distribution staged with the Status: the plan has the new Distribution",
      "ONE plan schedule per Apply, with the Apply's other updates on the selected rows (ruling 5a)",
    ),
  },
  {
    id: "P21 2b: a Planned row saved Planned writes its pair away (E1)  [expect 7]",
    file: SECTIONS,
    find: '  if (status === "planned" && activity.status === "planned") return {};\n',
    replace: "",
    expectFailing: only(
      "opening its window and pressing Cancel — does the window think something changed?",
      "Cancel with no edit asks nothing",
      "an unrelated Save (a rename) leaves its pair as stored",
      "… while leaving Planned replaces it with the plan, as every path does",
      "Planned: no date in the section",
      "In Progress: no date in the section",
      "Complete: no date in the section",
    ),
  },
  {
    id: "P22 2c: no toast when no plan is kept  [expect 4]",
    file: ROW_HELPERS,
    find: "  if (count > 0) toast.info(noPlanKeptMessage(count, name));\n",
    replace: "",
    expectFailing: only(
      "a dependency cycle: Planned → In Progress by grid, window and bulk keeps NONE (keys cleared)",
      "a calendar that cannot schedule (no working day in the week): NONE",
      "the grid: one toast naming the row, only when it leaves Planned with no schedule",
      "the bulk toolbar: ONE toast with the count",
    ),
  },
  {
    id: "P23 2f: the screen's overtaken arrow drawn as a critical edge  [expect 2]",
    file: CHART,
    find: "showCriticalPath && !dash &&",
    replace: "showCriticalPath &&",
    expectFailing: only(
      "an overtaken arrow is NEVER a critical edge — the ordinary colour and arrowhead; the critical B → C stays red (ruling 6)",
      "… hovered too: the ordinary hover colour and arrowhead, and its hover text says it was overtaken (F13)",
    ),
  },
  {
    id: "P24 2f: the print's overtaken arrow drawn as a critical edge  [expect 1]",
    file: PRINT_CHART,
    find: "hasCriticalPath && !dash &&",
    replace: "hasCriticalPath &&",
    expectFailing: only("an overtaken arrow is NEVER a critical edge — the ordinary colour and arrowhead; the critical B → C stays red (ruling 6)"),
  },
  {
    id: "P25 2g: the arrow's hover says nothing of the overtaking  [expect 1]",
    file: CHART,
    find: "${lagLabel}${overtakenHoverClause(dep, overtakenLinks)}",
    replace: "${lagLabel}",
    expectFailing: only("… hovered too: the ordinary hover colour and arrowhead, and its hover text says it was overtaken (F13)"),
  },
  {
    id: "P26 2i: the print intro back to its false second sentence  [expect 1]",
    file: PRINT_SECTIONS,
    find: "kept as recorded (a start before the Start Date is drawn from the Start Date);",
    replace: "kept as recorded;",
    expectFailing: only("its intro is true beside a start before the Start Date, which the schedule draws from the Start Date (Review 33, F6)"),
  },
  {
    id: "P27 2d: the visible no-pair line gone  [expect 2]",
    file: SECTIONS,
    find:
      "      {noPlannedStart && (\n" +
      '        <p id={noPlannedStartId} className="text-xs text-gray-600 dark:text-gray-400">{NO_PLANNED_START_LINE}</p>\n' +
      "      )}\n",
    replace: "",
    expectFailing: only(
      "In Progress: a dash read 'none kept', and a visible grey line that says why — the cell's description",
      "In Progress with neither an Actual Start nor a pair: both lines",
    ),
  },
  {
    id: "P28 2d: the Complete row's Sched. Finish fallback gone  [expect 2]",
    file: SECTIONS,
    find: '{plannedFinishDate ? plannedCell("Finish", plannedFinishDate) : schedFinishCell(completeSchedFinish ?? sa?.endDate)}',
    replace: '{plannedCell("Finish", plannedFinishDate)}',
    expectFailing: only(
      "Complete: v0.80.0's Sched. Finish — the Actual Start plus the planned duration, 10/05 + 10 days = 10/16 — never a dash",
      "Complete: Sched. Finish (read-only, 10/05 + 10 working days = 10/16), Actual Start, Actual Finish, Actual Dur.",
    ),
  },
  {
    id: "P29 2j: a Planned row's Planned columns blank  [expect 12]",
    file: EXPORT,
    find: '    return { plannedStart: held(plan?.startDate), plannedFinish: held(plan?.endDate), actualStart: "", actualFinish: "" };',
    replace: '    return { plannedStart: "", plannedFinish: "", actualStart: "", actualFinish: "" };',
    expectFailing: only(
      "hold what each row holds — and nothing a row does not",
      "MM/DD/YYYY: a real CSV — its summary's Date Format line, and the four columns",
      "MM/DD/YYYY: a real XLSX, read back — the Date Format line, and the four columns",
      "DD/MM/YYYY: a real CSV — its summary's Date Format line, and the four columns",
      "DD/MM/YYYY: a real XLSX, read back — the Date Format line, and the four columns",
      "YYYY/MM/DD: a real CSV — its summary's Date Format line, and the four columns",
      "YYYY/MM/DD: a real XLSX, read back — the Date Format line, and the four columns",
      // WI-150 (v0.83.0): measured alone, 12 — v0.82.0's four export tests and WI-150's round trip also catch it.
      "owner, Q1: the page's own export gives Delta, not started, its Planned dates from the plan before today's floor",
      "hand-edited (summary block removed, # renamed Activity ID, Total row removed): the four dates come back",
      "with the plan: Planned 10/12 – 10/16, the dates Next would keep if it started now",
      "without one, as before: the dates shown, 10/27 – 11/02",
      "schedules work that has not started from today: Next 10/27 – 11/02, its Planned dates the plan's 10/12 – 10/16",
    ),
  },
  {
    id: "P30 2j: the Date Format line gone  [expect 6]",
    file: EXPORT,
    find: '    { key: "Date Format", value: dateFormat },\n',
    replace: "",
    expectFailing: only(
      "MM/DD/YYYY: a real CSV — its summary's Date Format line, and the four columns",
      "MM/DD/YYYY: a real XLSX, read back — the Date Format line, and the four columns",
      "DD/MM/YYYY: a real CSV — its summary's Date Format line, and the four columns",
      "DD/MM/YYYY: a real XLSX, read back — the Date Format line, and the four columns",
      "YYYY/MM/DD: a real CSV — its summary's Date Format line, and the four columns",
      "YYYY/MM/DD: a real XLSX, read back — the Date Format line, and the four columns",
    ),
  },
  {
    id: "P31 2k: the overtaken dash used by another line, through a braces literal  [expect 1]",
    file: LEGEND,
    find: 'stroke={c.todayLine} strokeWidth="1.5" strokeDasharray="2 1" />',
    replace: 'stroke={c.todayLine} strokeWidth="1.5" strokeDasharray={"5 3"} />',
    expectFailing: only("neither dash appears among every dash the Gantt files draw, nor among the Finish Target's"),
  },
  {
    id: "P32 2k: … through a ?? fallback  [expect 1]",
    file: LEGEND,
    find: 'strokeDasharray={targetDash ?? "4 3"}',
    replace: 'strokeDasharray={targetDash ?? "5 3"}',
    expectFailing: only("neither dash appears among every dash the Gantt files draw, nor among the Finish Target's"),
  },
  {
    id: "P33 2k: … through an exported *_DASH constant  [expect 1]",
    file: CONSTANTS,
    find: 'export const PRINT_OVERTAKEN_LINK_DASH = "3 2";\n',
    replace: 'export const PRINT_OVERTAKEN_LINK_DASH = "3 2";\nexport const MILESTONE_LINE_DASH = "5 3";\n',
    expectFailing: only("neither dash appears among every dash the Gantt files draw, nor among the Finish Target's"),
  },
  {
    id: "P34 G1: ProjectPage → GanttSection carries no progress notes  [expect 1]",
    file: PAGE,
    find: "              progressNotes={paintedSchedule.progressNotes}\n",
    replace: "",
    expectFailing: only("ProjectPage → GanttSection: the screen Gantt draws the overtaken link dashed, with its legend entry"),
  },
  {
    id: "P35 G1: PrintableReport → PrintGanttChart carries none  [expect 1]",
    file: REPORT,
    find: "          progressNotes={schedule.progressNotes}\n",
    replace: "",
    expectFailing: only("PrintableReport → PrintGanttChart: the printed Gantt draws it dashed too"),
  },
  {
    id: "P36 G1: PrintableReport places no Progress Notes section  [expect 2]",
    file: REPORT,
    find: "      <PrintProgressNotesSection notes={schedule?.progressNotes} formatDate={formatDate} />\n",
    replace: "",
    expectFailing: only(
      "PrintableReport places the Progress Notes section, with the note's sentence",
      "h2 order in the print report",
    ),
  },
];
