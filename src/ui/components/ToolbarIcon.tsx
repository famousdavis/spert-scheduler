// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * A dashboard toolbar icon: size, stroke and caps copied exactly from GanttApp's `ProjectsToolbar`.
 * It takes the text colour (`currentColor`), so it is white on the filled New Project, and it is
 * hidden from assistive tech: the button's label names it. Paths live in `toolbar-icon-paths.ts`.
 */
export function ToolbarIcon({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d={d} stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
