// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * WI-137: a schedule date in the grid. A RECORDED date (the Actual Start, or a Complete row's
 * Actual Finish) is green, with a title that says so — green only, by the owner's ruling (2026-10-30:
 * no "A" beside the date, so the columns keep their width for long names). A visually hidden
 * "actual" follows it, so a screen reader hears what the colour shows. Every other date renders
 * exactly as before, a bare span. Its own component so the grid row's cognitive complexity does
 * not move.
 */
export function RecordedDateText({ text, recorded, which }: {
  text: string;
  recorded: boolean | undefined;
  which: "start" | "finish";
}) {
  if (!recorded) return <span>{text}</span>;
  return (
    <span
      className="text-green-800 dark:text-green-400 font-medium"
      title={which === "start" ? "Actual Start, as recorded" : "Actual Finish, as recorded"}
    >
      {text}
      <span className="sr-only">, actual</span>
    </span>
  );
}
