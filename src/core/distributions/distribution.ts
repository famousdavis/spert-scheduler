// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import type { SeededRng } from "@infrastructure/rng";

export interface Distribution {
  sample(rng: SeededRng): number;
  mean(): number;
  variance(): number;
  parameters(): Record<string, number>;
  inverseCDF(p: number): number;
}
