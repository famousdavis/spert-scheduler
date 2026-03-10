// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import seedrandom from "seedrandom";

export interface SeededRng {
  /** Returns a number in [0, 1) */
  next(): number;
}

export function createSeededRng(seed: string): SeededRng {
  const rng = seedrandom(seed);
  return {
    next(): number {
      return rng();
    },
  };
}
