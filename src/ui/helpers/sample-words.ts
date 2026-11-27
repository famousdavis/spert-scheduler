// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * Load Sample's words (v0.89.0, FRAME26 clean-up; William approved them, 2026-11-26).
 *
 * `sampleAddedSentence` is the SPERT® Suite's one sentence, the same shape in every app with a sample (contract §7):
 * curly quotes, the name as it was given ("… (2)" for a second sample). It is announced in the app's polite line
 * (`announce`), which outlives the navigation to the sample's page.
 *
 * `SAMPLE_LOADED_TOAST` is the toast beside it: the hint alone, so a screen reader, which also reads the toast,
 * does not hear the sentence twice (William, 2026-11-26). Until v0.89.0 the toast read
 * `Loaded "<name>" — run the simulation to see the buffer`.
 */
export function sampleAddedSentence(name: string): string {
  return `Added “${name}” to your projects and opened it.`;
}

export const SAMPLE_LOADED_TOAST = "Run the simulation to see the buffer.";
