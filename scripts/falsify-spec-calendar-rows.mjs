// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// v0.87.0 — falsification spec: WI-174 (the Calendar page's rows, a project's Calendar link) and WI-175 (the
// header's title). One straw per owner's ruling and per design item a test pins (D1, D3–D7, H1–H3), each named
// by its ruling or item. Against the whole suite.
//
// ⚠️ Every straw is one needle, with no `also`, so that a runner that applies only `find` still makes the straw
// it names. `falsify.mjs` passes a straw on ANY named match: the `[expect N]` in each id is the number of named
// tests measured when this spec was written (v0.87.0, 5,725 tests), for the reader. R7b and D3 break the rows' own
// finder or every row's state, so many more fail than are named: "in all" is that total, measured twice.
// ⚠️ In the first whole run R4b and R5a also failed 3 and 4 tests outside this release; a rerun of each straw
// failed only the named ones, so those were tests that fail under load, not ones that watch these lines.
//
// v0.89.0 (FRAME26 clean-up H4, H5): v0.88.0 moved the title into AppHeader.tsx, made the three actions `.sf-btn`,
// gave About's heading the frame's mark and re-titled the tests these straws name, so seven needles (R4a–R4c, R11,
// H1–H3) and four title constants no longer matched and the spec aborted at R4a. Each was re-keyed to what the code
// now does; the `[expect N]` of those seven, and R2's, are the named tests measured at v0.89.0.
//
// v0.90.0 (FRAME26 pass 3, H5): the rebuilt About page keeps H3's needle (the heading's mark, found once), but the test
// it names asserted two ® in `main`, the body one faint, which the new page makes false. That test is rewritten (every
// ® and ™ on About a `.sf-mark`, the heading's included) and H_ABOUT follows its title. H3's `[expect 1]` was
// re-measured at v0.90.0: the straw alone fails the rewritten test and nothing else in its file.
//
//   node scripts/falsify.mjs scripts/falsify-spec-calendar-rows.mjs
const src = (p) => new URL(`../src/${p}`, import.meta.url).pathname;
const PAGE = src("ui/pages/CalendarPage.tsx");
const ROW = src("ui/components/CalendarRow.tsx");
const WORDS = src("ui/helpers/calendar-summary.ts");
const EDITOR = src("ui/components/WorkDayOverrideEditor.tsx");
const PROJECT = src("ui/pages/ProjectPage.tsx");
const HEADER = src("ui/components/AppHeader.tsx");
const ABOUT = src("ui/pages/AboutPage.tsx");
const escape = (s) => s.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
const only = (...titles) => new RegExp(`> (?:${titles.map(escape).join("|")})$`);

// CalendarPage.rows.test.tsx
const T_CLOSED = "with three projects, Company Holidays and every project's row start closed, and no editor is mounted";
const T_D1 = "Company Holidays' row is the section's h2 and each project's row an h3 beneath it (D1)";
const T_TOGGLE = "a click opens a row, and a second click closes it; aria-controls names the body it shows";
const T_LAZY = "a row's editors mount the first time it opens: only the opened row fetches the country list";
const T_KEEP = "closing a row keeps what was typed in it, and a confirmation waiting in it";
const T_VISIT = "rows start closed on every visit: a row opened on one visit is closed on the next";
const T_OPEN_ALL =
  "with two or more projects they open and close every project's row, and leave Company Holidays alone";
const T_ONE = "with one project there is neither";
const T_NAME = "a project's row reads its name, a comma, and its parts with a comma between them (ruling 7)";
const T_DOT = "the visible · between two parts is hidden from screen readers";
const T_INERT =
  "a converted work day a company holiday falls on is counted apart, as its chip is struck through (ruling 5)";
const T_COMPANY = "Company Holidays names its count and the last date covered, in the user's Date Format (ruling 10)";
const T_PARA = "the paragraph under Company Holidays no longer points at a list below it (ruling 10)";
const T_H4 = "an open project's Converted Work Days heading sits BELOW its name in the outline: an h4 (ruling 6)";
const T_PENDING =
  "while a cloud first load is pending it stays closed and mounts nothing, and opens when the load ends empty";
const T_NO_FLIP =
  "while a cloud first load is pending it stays closed, and stays closed when projects arrive: no flip";
const T_RESTORING = "while a remembered cloud sign-in is being restored (storage not ready) it stays closed";
const T_ARRIVE =
  "?project=<id> opens that row, scrolls it into view and gives its button focus; the others stay closed";
const T_MARGIN = "the linked row's button keeps its 80 px scroll margin (scroll-mt-20, ruling 2)";
const T_ONCE =
  "it scrolls and focuses once per arrival: a later change to the list neither scrolls again nor takes focus";
const T_LATE = "a project that arrives after the page mounts — a cloud first load — still opens, scrolls and takes focus";
const T_AT_WORK =
  "while the user is already at work on the page, the arrival opens the row but leaves focus and scroll alone (ruling 3)";
// CalendarPage.test.tsx (WI-16's, matched by prefix since v0.87.0).
const T_SECTION = "keeps Company Holidays as a section heading beneath it";
// ProjectPage.calendar-link.test.tsx
const L_NAMED = "shows the word Calendar, is named for this project, and goes to that project's row";
const L_PLACE = "sits between Connect AI and Print";
const L_ARCHIVED = "an archived project's page has no link, since the Calendar page does not list archived projects";
const L_JOURNEY =
  "following it opens the Calendar page with that project's row open, in view and focused, and the others closed";
const L_NOWRAP = "Connect AI, Calendar and Print each keep to one line, so a long name is cut short instead (ruling 4)";
// Layout.title.test.tsx
const H_NAME = "the link's accessible name: the words with their space, and nothing else (ruling 11; contract §3)";
const H_ONE = "the words are ONE inline element in the link, so no text run is a flex item of its own (H1)";
const H_SIZE = "the title is the frame's 24 px at every width: no size class of its own (H2)";
const H_ABOUT = "every ® and ™ on About is the frame's mark, the glyph alone in a .sf-mark, the heading's included (H3; pass 3)";
// calendar-summary.test.ts
const U_ROW = (h, c, i) => `${h} holidays, ${c} converted, ${i} not in effect`;
const U_ONE = "one: 1 holiday, through its date";
const U_SEVERAL = "several: the LATEST end date, wherever it sits in the list, and a multi-day holiday counts once";
const U_FORMAT = "the date comes from the formatter it is given (the user's Date Format)";
const U_LAST = "lastHolidayDate: by END date, not start; null when there is none";
const U_UNION = "overrideChipDates: the two lists merged, a date in both counted once, as the chips show it";
const U_IN_EFFECT =
  "notInEffectCount: a converted day a company or project holiday falls on is not in effect; a forced one over a company holiday is";

// Since v0.88.0 the three actions keep to one line by the frame's `.sf-btn` (`white-space: nowrap`).
const PRINT_CLASS =
  'className="sf-btn px-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 no-print"';
const PRINT_CLASS_BEFORE =
  'className="px-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 no-print"';
// The ® before v0.88.0: faint, and bright in dark mode on About (H3's defect). The frame's is `.sf-mark`.
const REG = '<span className="text-gray-300 dark:text-gray-600 text-xs align-super">®</span>';
const MARK = '<span className="sf-mark">®</span>';
const TITLE_WORDS = `<span className="sf-grad">SPERT</span>${MARK}{" "}<span className="sf-grad">Scheduler</span>`;

export const testFile = "src/";

export const mutations = [
  // -- the owner's rulings ---------------------------------------------------------------------------------------
  {
    id: "R1a ruling 1: Company Holidays opens on an empty list, loaded or not (the prototype's flip) [expect 3]",
    file: PAGE,
    find: "  const companyByDefault = unarchived.length === 0 && !cloudLoadPending;\n",
    replace: "  const companyByDefault = unarchived.length === 0;\n",
    expectFailing: only(T_PENDING, T_NO_FLIP, T_RESTORING),
  },
  {
    id: "R1b ruling 1: a remembered sign-in still being restored counts as loaded [expect 1]",
    file: PAGE,
    find: '  const cloudLoadPending = !storageReady || (mode === "cloud" && !cloudDataLoaded);\n',
    replace: '  const cloudLoadPending = mode === "cloud" && !cloudDataLoaded;\n',
    expectFailing: only(T_RESTORING),
  },
  {
    id: "R2 ruling 2: no scroll margin on the linked row [expect 1]",
    file: ROW,
    find: "text-left scroll-mt-20 rounded",
    replace: "text-left rounded",
    expectFailing: only(T_MARGIN),
  },
  {
    id: "R3 ruling 3: the arrival takes focus and scrolls even while the user is at work on the page [expect 1]",
    file: PAGE,
    find: "    if (active !== null && active !== document.body) return;\n",
    replace: "",
    expectFailing: only(T_AT_WORK),
  },
  {
    id: "R4a ruling 4: the Calendar link may wrap [expect 1]",
    file: PROJECT,
    find: `${PRINT_CLASS}\n              title="This project's holidays and converted work days"`,
    replace: `${PRINT_CLASS_BEFORE}\n              title="This project's holidays and converted work days"`,
    expectFailing: only(L_NOWRAP),
  },
  {
    id: "R4b ruling 4: Connect AI may wrap [expect 1]",
    file: PROJECT,
    find: "className={`sf-btn px-2 rounded-md no-print transition-colors ${",
    replace: "className={`px-2 rounded-md no-print transition-colors ${",
    expectFailing: only(L_NOWRAP),
  },
  {
    id: "R4c ruling 4: Print may wrap [expect 1]",
    file: PROJECT,
    find: `onClick={() => window.print()}\n            ${PRINT_CLASS}`,
    replace: `onClick={() => window.print()}\n            ${PRINT_CLASS_BEFORE}`,
    expectFailing: only(L_NOWRAP),
  },
  {
    id: "R5a ruling 5: no converted work day is ever counted as not in effect [expect 2]",
    file: WORDS,
    find: "  return dates.filter((date) => !classifyChipStatus(date, ctx).active).length;\n",
    replace: "  return 0;\n",
    expectFailing: only(U_IN_EFFECT, T_INERT),
  },
  {
    id: "R5b ruling 5: the words leave out how many are not in effect [expect 5]",
    file: WORDS,
    find: "    parts.push(notInEffect > 0 ? `${days}, ${notInEffect} not in effect` : days);\n",
    replace: "    parts.push(days);\n",
    expectFailing: only(U_ROW(0, 1, 1), U_ROW(0, 3, 1), U_ROW(0, 3, 3), U_ROW(12, 5, 2), T_INERT),
  },
  {
    id: "R5c ruling 5: a date in both lists is counted twice, where the chips show it once [expect 1]",
    file: WORDS,
    find: "  return [...new Set([...converted, ...forced])];\n",
    replace: "  return [...converted, ...forced];\n",
    expectFailing: only(U_UNION),
  },
  {
    id: "R5d ruling 5: one converted work day reads as plural [expect 3]",
    file: WORDS,
    find: '    const days = converted === 1 ? "1 converted work day" : `${converted} converted work days`;\n',
    replace: "    const days = `${converted} converted work days`;\n",
    expectFailing: only(U_ROW(0, 1, 0), U_ROW(0, 1, 1), U_ROW(1, 1, 0)),
  },
  {
    id: "R6 ruling 6: Converted Work Days back to an h3, a peer of the project names [expect 1]",
    file: EDITOR,
    find: '      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">\n        Converted Work Days\n      </h4>\n',
    replace: '      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">\n        Converted Work Days\n      </h3>\n',
    expectFailing: only(T_H4),
  },
  {
    id: "R7a ruling 7: no spoken comma between the summary's two parts [expect 1]",
    file: ROW,
    find: '  const spokenName = [name, ...summary].join(", ");\n',
    replace: '  const spokenName = `${name}, ${summary.join(" ")}`;\n',
    expectFailing: only(T_NAME),
  },
  {
    id: "R7b ruling 7: no label, so the name runs into the summary with no comma at all [expect 4 named, 26 in all]",
    file: ROW,
    find: "          aria-label={spokenName}\n",
    replace: "",
    expectFailing: only(T_NAME, T_CLOSED, T_TOGGLE, T_ARRIVE),
  },
  {
    id: "R7c ruling 7: the visible · is read aloud [expect 1]",
    file: ROW,
    find: '<span aria-hidden="true">·</span>',
    replace: "<span>·</span>",
    expectFailing: only(T_DOT),
  },
  {
    id: "R8 ruling 8: the link is named only Calendar, like the header's [expect 4]",
    file: PROJECT,
    find: '              aria-label="Calendar for this project"\n',
    replace: "",
    expectFailing: only(L_NAMED, L_PLACE, L_JOURNEY, L_NOWRAP),
  },
  {
    id: "R10a ruling 10: Company Holidays gives its count without the last date covered [expect 4]",
    file: WORDS,
    find: "  return [`${holidaysWords(holidays.length)}, through ${formatDate(last)}`];\n",
    replace: "  return [holidaysWords(holidays.length)];\n",
    expectFailing: only(U_ONE, U_SEVERAL, U_FORMAT, T_COMPANY),
  },
  {
    id: "R10b ruling 10: the last date is the latest START, not the latest end [expect 3]",
    file: WORDS,
    find: "    if (last === null || h.endDate > last) last = h.endDate;\n",
    replace: "    if (last === null || h.startDate > last) last = h.startDate;\n",
    expectFailing: only(U_LAST, U_SEVERAL, T_COMPANY),
  },
  {
    id: "R10c ruling 10: the date ignores the user's Date Format [expect 1]",
    file: PAGE,
    find: "summary={companyCalendarSummary(globalCalendar.holidays, formatDate)}",
    replace: "summary={companyCalendarSummary(globalCalendar.holidays, (iso) => iso)}",
    expectFailing: only(T_COMPANY),
  },
  {
    id: "R10d ruling 10: the paragraph points at holidays listed below a closed row [expect 1]",
    file: PAGE,
    find: "{workDayNames}, excluding company holidays.",
    replace: "{workDayNames}, excluding holidays listed below.",
    expectFailing: only(T_PARA),
  },
  {
    id: "R11 ruling 11: the space before Scheduler is gone, the defect H1 fixed [expect 2]",
    file: HEADER,
    find: `${MARK}{" "}<span className="sf-grad">Scheduler</span>`,
    replace: `${MARK}<span className="sf-grad">Scheduler</span>`,
    expectFailing: only(H_NAME, H_ONE),
  },
  // -- the design's items ----------------------------------------------------------------------------------------
  {
    id: "D1 every row's heading is an h3, Company Holidays' too [expect 2]",
    file: ROW,
    find: '  const Heading = level === 2 ? "h2" : "h3";\n',
    replace: '  const Heading = "h3";\n',
    expectFailing: only(T_D1, T_SECTION),
  },
  {
    id: "D3 every row starts open [expect 3 named, 14 in all]",
    file: PAGE,
    find: "  const isOpen = (row: string, byDefault: boolean) => toggled[row] ?? byDefault;\n",
    replace: "  const isOpen = (row: string, _byDefault: boolean) => toggled[row] ?? true;\n",
    expectFailing: only(T_CLOSED, T_VISIT, T_PENDING),
  },
  {
    id: "D4a Open all and Close all for a single project [expect 1]",
    file: PAGE,
    find: "            {unarchived.length >= 2 && (\n",
    replace: "            {unarchived.length >= 1 && (\n",
    expectFailing: only(T_ONE),
  },
  {
    id: "D4b Open all opens Company Holidays too [expect 1]",
    file: PAGE,
    find: "    setToggled((t) => ({ ...t, ...Object.fromEntries(unarchived.map((p) => [p.id, open])) }));\n",
    replace:
      "    setToggled((t) => ({ ...t, [COMPANY_ROW]: open, ...Object.fromEntries(unarchived.map((p) => [p.id, open])) }));\n",
    expectFailing: only(T_OPEN_ALL),
  },
  {
    id: "D5a every row's editors mount at once, open or not [expect 6]",
    file: ROW,
    find: "        {mounted && children}\n",
    replace: "        {children}\n",
    expectFailing: only(T_CLOSED, T_LAZY, T_KEEP, T_OPEN_ALL, T_PENDING, T_NO_FLIP),
  },
  {
    id: "D5b a closed row unmounts its body, losing what was typed [expect 1]",
    file: ROW,
    find: "        {mounted && children}\n",
    replace: "        {open && children}\n",
    expectFailing: only(T_KEEP),
  },
  {
    id: "D6a the linked row is not scrolled into view [expect 4]",
    file: PAGE,
    find: '    linkedButtonRef.current?.scrollIntoView({ block: "start" });\n',
    replace: "",
    expectFailing: only(T_ARRIVE, T_ONCE, T_LATE, L_JOURNEY),
  },
  {
    id: "D6b the linked row's button is not focused [expect 3]",
    file: PAGE,
    find: "    linkedButtonRef.current?.focus({ preventScroll: true });\n",
    replace: "",
    expectFailing: only(T_ARRIVE, T_LATE, L_JOURNEY),
  },
  {
    id: "D6c the linked row is not opened [expect 4]",
    file: PAGE,
    find: "                  open={isOpen(project.id, byDefault)}\n",
    replace: "                  open={isOpen(project.id, false)}\n",
    expectFailing: only(T_ARRIVE, T_LATE, T_AT_WORK, L_JOURNEY),
  },
  {
    id: "D6d the arrival runs on every render, not once [expect 1]",
    file: PAGE,
    find: "  }, [linkedId, linkedPresent]);\n",
    replace: "  });\n",
    expectFailing: only(T_ONCE),
  },
  {
    id: "D7a an archived project's page links to a calendar the page does not list [expect 1]",
    file: PROJECT,
    find: "          {!project.archived && (\n            <Link\n",
    replace: "          {(\n            <Link\n",
    expectFailing: only(L_ARCHIVED),
  },
  {
    id: "D7b the link goes to the Calendar page without its project [expect 2]",
    file: PROJECT,
    find: "              to={`/calendar?project=${encodeURIComponent(project.id)}`}\n",
    replace: '              to="/calendar"\n',
    expectFailing: only(L_NAMED, L_JOURNEY),
  },
  {
    id: "H1 the words straight in the flex link again, each text run a flex item [expect 1]",
    file: HEADER,
    find: `<span className="sf-title" data-sf="title">\n            ${TITLE_WORDS}\n          </span>`,
    replace: TITLE_WORDS,
    expectFailing: only(H_ONE),
  },
  {
    id: "H2 the title stays 18 px at every width [expect 1]",
    file: HEADER,
    find: '<span className="sf-title" data-sf="title">',
    replace: '<span className="sf-title text-lg" data-sf="title">',
    expectFailing: only(H_SIZE),
  },
  {
    id: "H3 the About title's ® bright in dark mode again [expect 1]",
    file: ABOUT,
    find: `About SPERT${MARK}`,
    replace: `About SPERT${REG}`,
    expectFailing: only(H_ABOUT),
  },
];
