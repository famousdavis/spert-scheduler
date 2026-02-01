import type { SeededRng } from "@infrastructure/rng";

export interface Distribution {
  sample(rng: SeededRng): number;
  mean(): number;
  variance(): number;
  parameters(): Record<string, number>;
  inverseCDF(p: number): number;
}
