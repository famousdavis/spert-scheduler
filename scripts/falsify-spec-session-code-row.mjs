// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// WI-170 — falsification spec: the Connect AI window's Copy Code and Copy Prompt stay in one place.
// Each rule of the row, undone alone, against the whole suite. jsdom has no layout, so these pin the
// structure; that the buttons do not move was measured in real Chrome.
//
// ⚠️ Every straw is one needle, with no `also`, so that a runner that applies only `find` still
// makes the straw it names.
//
//   node scripts/falsify.mjs scripts/falsify-spec-session-code-row.mjs
const PANEL = new URL("../src/ui/components/ConnectAI/ConnectAiPanel.tsx", import.meta.url).pathname;
const escape = (s) => s.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
const only = (...titles) => new RegExp(`> (?:${titles.map(escape).join("|")})$`);

const ON_LABEL_LINE = "both buttons sit on the Session code line, at its right, Copy Code first, and not on the code's line";
const CODE_LINE = "the code's line holds the code alone, in the font it had, and cannot wrap, with the Valid line under it";
const ERROR_LINE = "the error and Retry take the code's line, at the height a code has";
const PLACEHOLDER = "the placeholder has the code's shape, five dots then ten, with Generating code… under it";
const WHILE_LOADING = "both are there and greyed while the code loads";
const IN_ERROR = "both are there and greyed in the error state";
const AFTER_A_CODE = "both are greyed when a later fetch fails, though the last code is still held";
const FIXED_WIDTH = "both have the same fixed width, Copied! included, and their labels cannot wrap";
const LABEL_COLOUR = "both labels set their own colour, dark text in the light theme and light text in the dark theme";

const CODE_BUTTON = `                  <button
                    onClick={() => copy("code")}
                    disabled={!codeReady}
                    className={COPY_BUTTON_CLASS}
                  >
                    {copied === "code" ? "Copied!" : "Copy Code"}
                  </button>
`;
const PROMPT_BUTTON = `                  <button
                    onClick={() => copy("prompt")}
                    disabled={!codeReady}
                    className={COPY_BUTTON_CLASS}
                  >
                    {copied === "prompt" ? "Copied!" : "Copy Prompt"}
                  </button>
`;
const GROUP = `                <div className="flex shrink-0 items-center gap-2">
${CODE_BUTTON}${PROMPT_BUTTON}                </div>
`;
const BETWEEN = `              </div>
              {/* One height, a code's, for the error too: the panel is centred, so a shorter line
                  would move everything above it. */}
`;
const LINE_OPEN = `              <div className="flex h-7 items-center gap-2">
`;
const ERROR_FRAGMENT = `                  <>
                    <span className="text-red-600 dark:text-red-400 text-xs">Couldn&rsquo;t generate a code.</span>
                    <button onClick={fetchCode} className="text-xs text-blue-600 hover:underline">Retry</button>
                  </>
`;
const LINE_BODY = `                {codeError ? (
${ERROR_FRAGMENT}                ) : (
                  <span className="font-mono text-lg tracking-wide whitespace-nowrap text-gray-900 dark:text-gray-100">
                    {codeReady ? displayCode : "••••• · ••••••••••"}
                  </span>
                )}
              </div>
`;
const VALID_LINE = `              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {codeLoading ? "Generating code…" : "Valid 15 min · refreshes automatically"}
              </p>
`;
const CODE_BUTTON_CLASS_USE = `                    className={COPY_BUTTON_CLASS}
                  >
                    {copied === "code"`;
const WIDTH_AND_NOWRAP = `"w-24 whitespace-nowrap px-2`;

export const testFile = "src/";

export const mutations = [
  {
    id: "W1 rule 1: the buttons go back to the code's line",
    file: PANEL,
    find: GROUP + BETWEEN + LINE_OPEN,
    replace: BETWEEN + LINE_OPEN + GROUP,
    expectFailing: only(ON_LABEL_LINE, CODE_LINE),
  },
  {
    id: "W2 rule 1: Copy Prompt comes first",
    file: PANEL,
    find: CODE_BUTTON + PROMPT_BUTTON,
    replace: PROMPT_BUTTON + CODE_BUTTON,
    expectFailing: only(ON_LABEL_LINE),
  },
  {
    id: "W3 rule 1: the buttons sit beside the label, not at the right",
    file: PANEL,
    find: `className="flex items-center justify-between gap-2 mb-1"`,
    replace: `className="flex items-center gap-2 mb-1"`,
    expectFailing: only(ON_LABEL_LINE),
  },
  {
    id: "W4 rule 2: the code can wrap",
    file: PANEL,
    find: "font-mono text-lg tracking-wide whitespace-nowrap text-gray-900",
    replace: "font-mono text-lg tracking-wide text-gray-900",
    expectFailing: only(CODE_LINE),
  },
  {
    id: "W5 rule 2: the code loses its font",
    file: PANEL,
    find: "font-mono text-lg tracking-wide whitespace-nowrap",
    replace: "font-mono text-sm tracking-wide whitespace-nowrap",
    expectFailing: only(CODE_LINE),
  },
  {
    id: "W6 rule 2: the line has no fixed height, so the error moves the centred panel",
    file: PANEL,
    find: `className="flex h-7 items-center gap-2"`,
    replace: `className="flex items-center gap-2"`,
    expectFailing: only(ERROR_LINE),
  },
  {
    id: "W7 rule 2: the error takes a line of its own",
    file: PANEL,
    find: ERROR_FRAGMENT,
    replace: ERROR_FRAGMENT.replace("<>", "<div>").replace("</>", "</div>"),
    expectFailing: only(ERROR_LINE),
  },
  {
    id: "W8 rule 2: the Valid and Generating line goes above the code",
    file: PANEL,
    find: LINE_OPEN + LINE_BODY + VALID_LINE,
    replace: VALID_LINE + LINE_OPEN + LINE_BODY,
    expectFailing: only(CODE_LINE, PLACEHOLDER),
  },
  {
    id: "W9 rule 3: the buttons vanish in the error state",
    file: PANEL,
    find: GROUP,
    replace: `                {!codeError && (\n${GROUP}                )}\n`,
    expectFailing: only(IN_ERROR, AFTER_A_CODE),
  },
  {
    id: "W10 rule 3: the buttons vanish while the code loads",
    file: PANEL,
    find: GROUP,
    replace: `                {!codeLoading && (\n${GROUP}                )}\n`,
    expectFailing: only(WHILE_LOADING),
  },
  {
    id: "W11 rule 3: Copy Code is not greyed without a code",
    file: PANEL,
    find: `onClick={() => copy("code")}\n                    disabled={!codeReady}\n`,
    replace: `onClick={() => copy("code")}\n`,
    expectFailing: only(WHILE_LOADING, IN_ERROR, AFTER_A_CODE),
  },
  {
    id: "W12 rule 3: Copy Prompt is not greyed without a code",
    file: PANEL,
    find: `onClick={() => copy("prompt")}\n                    disabled={!codeReady}\n`,
    replace: `onClick={() => copy("prompt")}\n`,
    expectFailing: only(WHILE_LOADING, IN_ERROR, AFTER_A_CODE),
  },
  {
    id: "W13 rule 3: a failed fetch leaves both buttons on, copying a code no longer shown",
    file: PANEL,
    find: "!!code && !codeLoading && !codeError;",
    replace: "!!code && !codeLoading;",
    expectFailing: only(AFTER_A_CODE),
  },
  {
    id: "W14 rule 4: no fixed width",
    file: PANEL,
    find: WIDTH_AND_NOWRAP,
    replace: `"whitespace-nowrap px-2`,
    expectFailing: only(FIXED_WIDTH),
  },
  {
    id: "W15 rule 4: Copied! gives up the width",
    file: PANEL,
    find: CODE_BUTTON_CLASS_USE,
    replace: CODE_BUTTON_CLASS_USE.replace(
      "className={COPY_BUTTON_CLASS}",
      `className={copied === "code" ? COPY_BUTTON_CLASS.replace("w-24 ", "") : COPY_BUTTON_CLASS}`,
    ),
    expectFailing: only(FIXED_WIDTH),
  },
  {
    id: "W16 rule 4: the two widths differ",
    file: PANEL,
    find: CODE_BUTTON_CLASS_USE,
    replace: CODE_BUTTON_CLASS_USE.replace(
      "className={COPY_BUTTON_CLASS}",
      `className={COPY_BUTTON_CLASS.replace("w-24", "w-20")}`,
    ),
    expectFailing: only(FIXED_WIDTH),
  },
  {
    id: "W17 rule 4: the labels can wrap",
    file: PANEL,
    find: WIDTH_AND_NOWRAP,
    replace: `"w-24 px-2`,
    expectFailing: only(FIXED_WIDTH),
  },
  {
    id: "W18 rule 5: the placeholder keeps the old four-digit shape",
    file: PANEL,
    find: `"••••• · ••••••••••"`,
    replace: `"••••• · ••••"`,
    expectFailing: only(PLACEHOLDER),
  },
  {
    id: "W19 the labels are black on dark grey in the dark theme",
    file: PANEL,
    find: "text-xs text-gray-900 dark:text-gray-100 rounded-md",
    replace: "text-xs text-gray-900 rounded-md",
    expectFailing: only(LABEL_COLOUR),
  },
  {
    id: "W20 the labels have no colour of their own in the light theme",
    file: PANEL,
    find: "text-xs text-gray-900 dark:text-gray-100 rounded-md",
    replace: "text-xs dark:text-gray-100 rounded-md",
    expectFailing: only(LABEL_COLOUR),
  },
];
