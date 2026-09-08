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
