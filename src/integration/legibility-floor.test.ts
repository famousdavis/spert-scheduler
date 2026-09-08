// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { describe, it, expect } from 'vitest';

/**
 * WI-10, the legibility floor. On-screen text has a floor of 12px (`text-xs`,
 * Tailwind's own smallest step); an arbitrary `text-[Npx]` utility is how text
 * gets below it, so the rule is enforced as "no arbitrary pixel font size in
 * on-screen UI at all" rather than as a list of banned sizes.
 *
 * ⚠️ THE ASSERTION IS DELIBERATELY TOTAL, AND THAT IS THE POINT. An earlier
 * form of this check matched only `9px|10px`, so a future `text-[8px]` would
 * have passed it silently. Matching *any* `text-[Npx]` cannot miss a smaller
 * size by construction — there is no range to get wrong and no enumeration to
 * fall out of date.
 *
 * ⚠️ AND IT IS PRE-REGISTERED AT ZERO, which is the shape of guard that most
 * often goes quiet: a scanner that walks nothing, or a regex that matches
 * nothing, produces exactly the same passing zero as a clean tree. So the
 * print-surface expectation below is not decoration — it runs THE SAME
 * SCANNER AND THE SAME REGEX and requires a NON-ZERO result. If the
 * instrument breaks, that control fails first and loudly.
 *
 * Print is out of scope on purpose. `print-sections.tsx`, `PrintableReport.tsx`
 * and `PrintGanttChart.tsx` legitimately typeset at 9px and 6px for paper, and
 * `PrintGanttChart` additionally carries a print-parity constraint with the
 * interactive chart that makes editing it here actively wrong.
 */
const ARBITRARY_PX_FONT_SIZE = /text-\[\d+px\]/g;

const PRINT_SURFACES = [
  join('src', 'ui', 'components', 'print-sections.tsx'),
  join('src', 'ui', 'components', 'PrintableReport.tsx'),
  join('src', 'ui', 'charts', 'PrintGanttChart.tsx'),
];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\./.test(entry)) out.push(full);
  }
  return out;
}

const root = process.cwd();
const isPrintSurface = (rel: string) =>
  PRINT_SURFACES.includes(rel) || /(^|[\\/])[Pp]rint/.test(rel.split(sep).pop() ?? '');

function hits(files: string[]): string[] {
  const found: string[] = [];
  for (const file of files) {
    const rel = relative(root, file);
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        for (const m of line.matchAll(ARBITRARY_PX_FONT_SIZE)) found.push(`${rel}:${i + 1} ${m[0]}`);
      });
  }
  return found;
}

describe('legibility floor: no arbitrary pixel font sizes in on-screen UI', () => {
  const all = sourceFiles(join(root, 'src', 'ui'));
  const print = all.filter((f) => isPrintSurface(relative(root, f)));
  const screen = all.filter((f) => !isPrintSurface(relative(root, f)));

  it('scans a real, non-trivial set of on-screen source files', () => {
    // Vacuity control #1: a walker that returns nothing passes every assertion
    // below. At the time of writing src/ui holds well over 100 non-test sources.
    expect(screen.length).toBeGreaterThan(80);
    expect(print.length).toBe(PRINT_SURFACES.length);
  });

  it('finds arbitrary pixel sizes on the print surfaces, proving the regex matches', () => {
    // Vacuity control #2: THE SAME regex and THE SAME reader, required to be
    // non-zero. "Zero on screen" only means something while this is non-zero.
    expect(hits(print).length).toBeGreaterThan(0);
  });

  it('finds none anywhere on screen', () => {
    // Pre-registered at 0. It read 21 before WI-10 (v0.67.13): 3x text-[9px],
    // 15x text-[10px], 3x text-[11px].
    expect(hits(screen)).toEqual([]);
  });
});

/**
 * ⚠️ THE CLASS CENSUS ABOVE HAS A STRUCTURAL BLIND SPOT, FOUND IN THE BROWSER
 * AND NOT BY ANY GREP. Charts do not size text with Tailwind classes; they pass
 * numbers to SVG and to Recharts props. At v0.67.13 the live DOM carried 185
 * on-screen nodes below the 12px floor while the class census read ZERO.
 *
 * ⚠️ AND THIS GUARD ITSELF HAD THE SAME SHAPE OF HOLE, TWICE. Its first pattern
 * matched `fontSize: 10` and `fontSize={10}` but NOT `fontSize="11"`, because a
 * string-valued JSX attribute puts a quote where it expected a brace — and six
 * such sites sit in GanttChart alone. A guard written against the syntax you
 * happen to be fixing sees only that syntax.
 *
 * The remaining sub-floor text is ALL in the interactive Gantt: 57 nodes,
 * measured at the SHIPPED DEFAULT configuration. It is left to WI-11, which
 * owns that label geometry, and it comes from THREE mechanisms — the
 * distinction matters, because it sends the next reader to different files
 * with different options:
 *
 *   HARDCODED string literals with no preference and no clamp behind them —
 *   the timeline tick labels at `GanttChart:745` are 13 of the 57. Nothing
 *   blocks raising these except that tick labels colliding with milestone
 *   labels IS WI-11's subject, so a bigger one makes its problem worse.
 *
 *   `barLabelFontSize` = min(barLabelFontMap[activityFontSize], barHeight - 6).
 *   43 of the 57. ⚠️ THE CONSTRAINT IS GEOMETRY, NOT PREFERENCE: the map reads
 *   10 for BOTH `small` and `normal`, so there is no preference collapse to
 *   argue about, and a 12px label does not fit a bar under 18px tall.
 *
 *   `bufFontSize` = min(barLabelFontSize + 1, barHeight - 6), the remaining 1.
 *
 * ⚠️ IT IS **NOT** `fontSizeMap.small`, which an earlier draft of this comment
 * and of v0.67.13's PR both claimed. `activityFontSize` defaults to `normal`
 * and `fontSizeMap.normal` is 12, so activity names render AT the floor at the
 * shipped default and are not part of the residue at all. `small: 11` is a size
 * the USER opts into, which is WCAG 1.4.4's remedy rather than a defect. The
 * false version was plausible, which is the durable kind of wrong.
 */
/**
 * ⚠️ FOUR SYNTAXES, and each one was found by the previous version missing it:
 * `fontSize: 10`, `fontSize={10}`, `fontSize="11"` and `fontSize: "0.7rem"`.
 * The rem form is the one that matters most — it read 11.2px on the GPL warranty
 * disclaimer and the earlier pattern flagged it only by accident, capturing the
 * `0` of `0.7`. A unit-blind matcher reports the wrong NUMBER while looking
 * like it works.
 */
const NUMERIC_FONT_SIZE = /fontSize[\s:={"]+([\d.]+)(rem|em|px)?/g;

/**
 * Every sub-floor numeric size that survives, with the reason it survives.
 * The Gantt entries are handed to WI-11 rather than fixed here; the two glyph
 * entries are single characters inside SVG swatches of 8px and 12px, which are
 * non-text under WCAG 1.4.11 and could not hold 12px type in any case.
 */
const SUB_FLOOR_EXCEPTIONS: Record<string, string> = {
  'src/ui/charts/GanttChart.tsx:745': 'timeline tick labels, 13 of the 57 — hardcoded, but raising them is WI-11\'s collision subject',
  'src/ui/charts/GanttChart.tsx:794': 'today-marker label — hardcoded, WI-11',
  'src/ui/charts/GanttChart.tsx:804': 'today date — hardcoded, WI-11',
  'src/ui/charts/GanttChart.tsx:849': 'finish-target marker label — hardcoded, WI-11',
  'src/ui/charts/GanttChart.tsx:904': 'milestone health label — hardcoded, WI-11',
  'src/ui/charts/GanttChart.tsx:979': 'dependency lag label — hardcoded, WI-11',
  'src/ui/charts/GanttActivityRow.tsx:222': 'constraint glyph inside an 8px bar icon — non-text, 1.4.11',
  'src/ui/charts/GanttLegend.tsx:163': 'the "C" inside a 12x12 legend swatch — non-text, 1.4.11',
};

describe('legibility floor: no numeric font size below 12 outside print', () => {
  const all = sourceFiles(join(root, 'src', 'ui'));
  const screen = all.filter((f) => !isPrintSurface(relative(root, f)));

  function numericSizes(files: string[]): { site: string; px: number }[] {
    const found: { site: string; px: number }[] = [];
    for (const file of files) {
      const rel = relative(root, file).split(sep).join('/');
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          for (const m of line.matchAll(NUMERIC_FONT_SIZE)) {
            const raw = Number(m[1]);
            // `rem` and `em` resolve against a 16px root here; the app sets no other.
            found.push({ site: `${rel}:${i + 1}`, px: m[2] === 'rem' || m[2] === 'em' ? raw * 16 : raw });
          }
        });
    }
    return found;
  }

  const sizes = numericSizes(screen);

  it('matches numeric font sizes at all, proving the pattern is live', () => {
    // Vacuity control: this assertion set is "none below 12", which an empty
    // match list satisfies. Legal sizes of 12 and up must still be found.
    expect(sizes.length).toBeGreaterThan(3);
    expect(sizes.some((s) => s.px >= 12)).toBe(true);
  });

  it('leaves only the ruled Gantt and icon-glyph exceptions below the floor', () => {
    // It read 7 outside the Gantt before WI-10: three `fontSize: 10` in
    // HistogramChart, two `fontSize: 11` in CDFChart, one in
    // CDFComparisonChart's legend wrapper, and AuthButton's 11px avatar
    // initial. Those are fixed; what remains is named, with its real cause.
    const offenders = sizes.filter((s) => s.px < 12).map((s) => s.site);
    expect(offenders.sort()).toEqual(Object.keys(SUB_FLOOR_EXCEPTIONS).sort());
  });
});

/**
 * The other half of WI-10. `text-gray-400 dark:text-gray-500` is an inverted
 * pair: it goes DARKER in dark mode, and it fails WCAG AA in BOTH — 2.60 on
 * white, 3.03 on gray-800 (Tailwind 4 OKLCH palette, WCAG 2.x). Its mirror
 * `text-gray-500 dark:text-gray-400` passes both at 4.84 / 5.64 and was already
 * the repo's majority convention, so v0.67.13 swapped 70 sites onto it.
 *
 * ⚠️ THIS IS A NAMED SET, NOT A COUNT, and deliberately so. A count fails when
 * a new inverted pair appears, but it is invariant under an exception being
 * quietly relocated or swapped for a different site. Comparing the exact set
 * fails in both directions and names the offender either way.
 *
 * The six survivors are informed exceptions, verified at source: contrast
 * minima govern text, and none of these render informational text.
 */
const RULED_EXCEPTIONS: Record<string, string> = {
  'src/ui/charts/GanttChart.tsx:193': 'disabled state, paired with cursor-not-allowed',
  'src/ui/components/StorageLoginModal.tsx:135': 'the disabled half of a ternary',
  'src/ui/components/UnifiedActivityRow.tsx:622': 'icon-only control, no text node',
  'src/ui/components/ScenarioTabs.tsx:117': 'drag-handle icon',
  'src/ui/components/DependencyPanel.tsx:331': '<select> placeholder state',
  'src/ui/components/DependencyPanel.tsx:346': '<select> placeholder state',
};

const INVERTED_PAIR = /text-gray-400 dark:text-gray-500/g;
const CORRECT_PAIR = /text-gray-500 dark:text-gray-400/g;

describe('grey contrast: the inverted dark: pair survives only where it is ruled', () => {
  const files = sourceFiles(join(root, 'src'));

  function sites(re: RegExp): string[] {
    const found: string[] = [];
    for (const file of files) {
      const rel = relative(root, file).split(sep).join('/');
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          const n = line.match(re)?.length ?? 0;
          for (let k = 0; k < n; k++) found.push(`${rel}:${i + 1}`);
        });
    }
    return found.sort();
  }

  it('still finds the correct pair in bulk, proving the matcher works', () => {
    // Vacuity control: the two regexes differ by one transposition, so a reader
    // or walker that silently matches nothing would pass the assertion below.
    // This one must be NON-zero — it read 194 at v0.67.13.
    expect(sites(CORRECT_PAIR).length).toBeGreaterThan(100);
  });

  it('leaves the inverted pair at exactly the ruled exceptions', () => {
    // It read 76 before WI-10 (v0.67.13); 70 were swapped.
    expect(sites(INVERTED_PAIR)).toEqual(Object.keys(RULED_EXCEPTIONS).sort());
  });
});

/**
 * The coloured half (WI-10 part C). Contrast work on this repo had only ever
 * scoped greys; the coloured surface was never measured until v0.67.13, and 37
 * bare tokens were rendering informational text below 4.5:1 in light mode.
 *
 * ⚠️ THE VARIANT CHAIN IS PARSED, NOT LOOKED BEHIND ONCE (R100). A lookbehind
 * of `(?<!dark:)` is necessary and NOT sufficient: it reads
 * `dark:hover:text-blue-300` as a light-mode site, and 112 such tokens exist
 * here. A misclassified token moves BETWEEN buckets, so a light + dark = total
 * reconciliation still balances and cannot catch it. The parser is pinned by
 * its own test below.
 *
 * Only BARE tokens are in scope. `hover:`, `focus:` and `disabled:` variants
 * are transient states on icon controls, and dark-chained tokens are governed
 * by the dark surface, where every one of them already passes (measured:
 * red-400 5.08, amber-400 8.52, green-400 8.25, blue-400 5.56 on gray-800).
 *
 * The banned list is every shade that cannot reach 4.5:1 against WHITE, the
 * lightest surface any of them renders on, derived from the OKLCH palette in
 * the installed tailwindcss rather than from a remembered hex table (R97).
 * Shades absent from it — red-600 at 4.77, blue-600 at 5.25 — are legal bare,
 * though a tinted background can still sink them: WarningsPanel's body text was
 * red-600, which passes on white at 4.77 and FAILED on its own bg-red-50 at
 * 4.36. This guard cannot see that case; only measuring the real background can.
 */
const BELOW_AA_ON_WHITE = new Set([
  'blue-50', 'blue-100', 'blue-200', 'blue-300', 'blue-400', 'blue-500',
  'green-50', 'green-100', 'green-200', 'green-300', 'green-400', 'green-500', 'green-600',
  'amber-50', 'amber-100', 'amber-200', 'amber-300', 'amber-400', 'amber-500', 'amber-600',
  'red-50', 'red-100', 'red-200', 'red-300', 'red-400', 'red-500',
  'yellow-50', 'yellow-100', 'yellow-200', 'yellow-300', 'yellow-400', 'yellow-500', 'yellow-600',
  'orange-50', 'orange-100', 'orange-200', 'orange-300', 'orange-400', 'orange-500', 'orange-600',
  'purple-50', 'purple-100', 'purple-200', 'purple-300', 'purple-400', 'purple-500',
  'indigo-50', 'indigo-100', 'indigo-200', 'indigo-300', 'indigo-400',
]);

/** Non-text under WCAG 1.4.11, which asks 3:1 rather than 4.5:1. Both clear it. */
const NON_TEXT_EXCEPTIONS: Record<string, string> = {
  'src/ui/charts/GanttChart.tsx:202': 'checkbox accent colour, amber-600 at 3.20',
  'src/ui/components/WarningsPanel.tsx:23': 'the warning variant glyph, amber-600 at 3.20 on white and 3.09 on its amber-50 ground',
};

/**
 * ⚠️ THE VARIANT CHAIN IS NOT MATCHED BY THE REGEX AT ALL, and that is
 * deliberate. Both regex forms a reader reaches for — a repeated
 * `(?:[a-z0-9._-]+:)*` group and a lazy `[a-z0-9._:-]*?` — are super-linear
 * backtracking hotspots that `sonarjs/slow-regex` flags, and at a lint baseline
 * of 3 with zero headroom a fourth finding fails the gate. So the regex matches
 * only the utility, and the prefix is recovered by walking backwards over the
 * class-token alphabet, which is linear by construction.
 */
const COLOURED_TOKEN =
  /text-(blue|green|amber|red|yellow|orange|purple|indigo)-(\d{2,3})(?![\w-])/g;

const CHAIN_CHAR = /[A-Za-z0-9@[\]._:-]/;

/** The Tailwind variant prefix immediately before `index`, e.g. `dark:hover:`. */
function variantChainBefore(line: string, index: number): string[] {
  let start = index;
  while (start > 0 && CHAIN_CHAR.test(line[start - 1] as string)) start--;
  return line.slice(start, index).split(':').filter(Boolean);
}

describe('coloured contrast: no bare token that cannot reach AA on white', () => {
  const files = sourceFiles(join(root, 'src'));
  interface Token {
    site: string;
    shade: string;
  }
  const bare: Token[] = [];
  const variantChained: Token[] = [];
  const darkChained: Token[] = [];

  for (const file of files) {
    const rel = relative(root, file).split(sep).join('/');
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        for (const m of line.matchAll(COLOURED_TOKEN)) {
          const variants = variantChainBefore(line, m.index);
          const token: Token = { site: `${rel}:${i + 1}`, shade: `${m[1]}-${m[2]}` };
          if (variants.includes('dark')) darkChained.push(token);
          else if (variants.length) variantChained.push(token);
          else bare.push(token);
        }
      });
  }

  it('classifies a real, non-trivial population into all three buckets', () => {
    // Vacuity control. Every assertion below is "none of X", which an empty
    // scan satisfies. All three buckets are known non-empty.
    expect(bare.length).toBeGreaterThan(100);
    expect(darkChained.length).toBeGreaterThan(100);
    expect(variantChained.length).toBeGreaterThan(10);
  });

  it('parses the whole variant chain, which a one-deep lookbehind does not (R100)', () => {
    // Run the BROKEN instrument beside the good one and require them to
    // disagree. `(?<!dark:)` sees only the last variant, so it counts every
    // `dark:hover:` / `dark:focus:` / `dark:disabled:` token as light-mode and
    // must report MORE than the parser's light-rendering buckets combined. If
    // the parser ever regresses to a one-deep lookbehind the two agree and this
    // fails — which is the only way to catch a regression whose own
    // reconciliation still balances.
    const ONE_DEEP =
      /(?<!dark:)text-(blue|green|amber|red|yellow|orange|purple|indigo)-(\d{2,3})(?![\w-])/g;
    let oneDeep = 0;
    for (const file of files) {
      for (const line of readFileSync(file, 'utf8').split('\n')) {
        oneDeep += line.match(ONE_DEEP)?.length ?? 0;
      }
    }
    expect(oneDeep).toBeGreaterThan(bare.length + variantChained.length);
  });

  it('leaves only the ruled non-text exceptions below AA', () => {
    // It read 37 before WI-10 (v0.67.13).
    const offenders = bare.filter((t) => BELOW_AA_ON_WHITE.has(t.shade)).map((t) => t.site);
    expect(offenders.sort()).toEqual(Object.keys(NON_TEXT_EXCEPTIONS).sort());
  });
});
