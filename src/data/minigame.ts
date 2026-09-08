import { mulberry32 } from "../core/rng";
import type { LevelDef, LevelGoal, MiniGameItemDef } from "./types";

/** Per-level target counts before the pool of larger later levels kicks in. */
const EARLY_TARGETS = [6, 8, 10, 12, 15];
const LATE_TARGET_CAP = 18;

/** First level allowed to roll a second goal (levels before this are always single-goal). */
const TWO_GOAL_FROM_LEVEL = 4;
const TWO_GOAL_CHANCE = 0.35;

function targetCountFor(level: number, rng: () => number): number {
  if (level <= EARLY_TARGETS.length) return EARLY_TARGETS[level - 1];
  const grown = EARLY_TARGETS[EARLY_TARGETS.length - 1] + (level - EARLY_TARGETS.length);
  const jitter = Math.round(rng() * 2) - 1; // -1..1
  return Math.max(EARLY_TARGETS[EARLY_TARGETS.length - 1], Math.min(LATE_TARGET_CAP, grown + jitter));
}

function rewardFor(level: number, totalTargets: number, rng: () => number): number {
  const early = level <= 5;
  const lo = early ? 60 : 90;
  const hi = early ? 100 : 130;
  const base = lo + Math.round(((hi - lo) * Math.min(level, 10)) / 10);
  const jitter = Math.round((rng() - 0.5) * 12) + Math.floor(totalTargets / 6);
  return Math.max(lo, Math.min(hi, base + jitter));
}

/**
 * Deterministic Catch & Collect level generator: same (level, pool, seed) always
 * produces the same goals — the pool is whatever `GardenObjectDef.miniGamePool`
 * belongs to the currently active object.
 */
export function generateLevel(level: number, pool: MiniGameItemDef[], seed: number): LevelDef {
  if (pool.length === 0) throw new Error("generateLevel: empty item pool");
  const rng = mulberry32(seed);

  const wantsTwoGoals =
    pool.length >= 2 && level >= TWO_GOAL_FROM_LEVEL && rng() < TWO_GOAL_CHANCE;
  const goalCount = wantsTwoGoals ? 2 : 1;

  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const chosen = shuffled.slice(0, goalCount);

  const totalCount = targetCountFor(level, rng);
  const goals: LevelGoal[] = chosen.map((item, i) => {
    // split roughly evenly across goals, first goal takes the remainder
    const share = Math.floor(totalCount / goalCount);
    const target = i === 0 ? totalCount - share * (goalCount - 1) : share;
    return { itemId: item.id, target: Math.max(3, target) };
  });

  const totalTargets = goals.reduce((s, g) => s + g.target, 0);
  const reward = rewardFor(level, totalTargets, rng);

  return { level, goals, reward };
}
