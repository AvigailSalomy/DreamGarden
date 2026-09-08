import { mulberry32 } from "../core/rng";

export type Requirement = 1 | 2 | 3;

export interface ProgressionConfig {
  weights: Record<Requirement, number>;
  /** Minimum number of tasks between two "3"s. */
  minGapBetweenThrees: number;
  /** A value may not appear more than this many times in a row. */
  maxRunSameValue: number;
  /** If this many "1"s occur in a row, force a 2-or-3 next. */
  forceRewardAfterOnesRun: number;
  coinTable: Record<Requirement, number>;
  perPuzzleBonus: number;
}

export const DEFAULT_PROGRESSION: ProgressionConfig = {
  weights: { 1: 0.55, 2: 0.3, 3: 0.15 },
  minGapBetweenThrees: 3,
  maxRunSameValue: 2,
  forceRewardAfterOnesRun: 5,
  coinTable: { 1: 10, 2: 25, 3: 55 },
  perPuzzleBonus: 5,
};

function weightedPick(
  pool: Requirement[],
  weights: Record<Requirement, number>,
  rng: () => number,
): Requirement {
  const total = pool.reduce((s, v) => s + weights[v], 0);
  let r = rng() * total;
  for (const v of pool) {
    r -= weights[v];
    if (r <= 0) return v;
  }
  return pool[pool.length - 1];
}

/**
 * Constrained weighted shuffle-bag. Produces a varied 1/2/3 requirement sequence
 * that avoids clusters of big tasks and gives a fast first win.
 * Deterministic for a given seed.
 */
export function generateRequirementSequence(
  seed: number,
  count: number,
  cfg: ProgressionConfig = DEFAULT_PROGRESSION,
): Requirement[] {
  const rng = mulberry32(seed);
  const seq: Requirement[] = [];

  const runLength = (v: Requirement): number => {
    let n = 0;
    for (let i = seq.length - 1; i >= 0 && seq[i] === v; i--) n++;
    return n;
  };

  const violates = (next: Requirement): boolean => {
    const n = seq.length;
    // R1: first two tasks are always single puzzles (fast wins)
    if (n < 2) return next !== 1;
    // R2: no value more than maxRunSameValue in a row
    if (runLength(next) >= cfg.maxRunSameValue) return true;
    // R3: two "3"s must be separated by >= minGapBetweenThrees other tasks
    if (next === 3) {
      const last = seq.lastIndexOf(3);
      if (last !== -1 && n - last <= cfg.minGapBetweenThrees) return true;
    }
    return false;
  };

  for (let i = 0; i < count; i++) {
    let pool = ([1, 2, 3] as Requirement[]).filter((v) => !violates(v));
    if (pool.length === 0) pool = [1];

    // R4: reward pacing — after a long run of 1s, force something bigger
    if (
      seq.length >= cfg.forceRewardAfterOnesRun &&
      seq.slice(-cfg.forceRewardAfterOnesRun).every((v) => v === 1)
    ) {
      const bigger = pool.filter((v) => v !== 1);
      pool = bigger.length ? bigger : [2];
    }

    seq.push(weightedPick(pool, cfg.weights, rng));
  }
  return seq;
}

export function coinsForRequirement(
  required: Requirement,
  cfg: ProgressionConfig = DEFAULT_PROGRESSION,
): number {
  return cfg.coinTable[required];
}
