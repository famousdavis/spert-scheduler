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
