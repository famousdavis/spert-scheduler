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
