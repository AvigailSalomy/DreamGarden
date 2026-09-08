import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROGRESSION,
  generateRequirementSequence,
} from "../src/data/progression";

function longestRun(seq: number[]): number {
  let best = 1;
  let cur = 1;
  for (let i = 1; i < seq.length; i++) {
    cur = seq[i] === seq[i - 1] ? cur + 1 : 1;
    best = Math.max(best, cur);
  }
  return best;
}

describe("generateRequirementSequence", () => {
  it("is deterministic for a seed", () => {
    expect(generateRequirementSequence(7, 30)).toEqual(generateRequirementSequence(7, 30));
  });

  it("respects the requested length and value range", () => {
    const seq = generateRequirementSequence(1, 40);
    expect(seq).toHaveLength(40);
    for (const v of seq) expect([1, 2, 3]).toContain(v);
  });

  it("opens with two quick single-puzzle wins", () => {
    for (let seed = 0; seed < 25; seed++) {
      const seq = generateRequirementSequence(seed, 20);
      expect(seq[0]).toBe(1);
      expect(seq[1]).toBe(1);
    }
  });

  it("never repeats a value more than twice in a row", () => {
    for (let seed = 0; seed < 40; seed++) {
      expect(longestRun(generateRequirementSequence(seed, 60))).toBeLessThanOrEqual(2);
    }
  });

  it("keeps 3s at least minGap apart", () => {
    const gap = DEFAULT_PROGRESSION.minGapBetweenThrees;
    for (let seed = 0; seed < 40; seed++) {
      const seq = generateRequirementSequence(seed, 60);
      let last = -Infinity;
      seq.forEach((v, i) => {
        if (v === 3) {
          expect(i - last).toBeGreaterThan(gap);
          last = i;
        }
      });
    }
  });

  it("does not stall on long runs of ones (a reward lands within 6)", () => {
    for (let seed = 0; seed < 20; seed++) {
      const seq = generateRequirementSequence(seed, 60);
      for (let i = 0; i + 6 <= seq.length; i++) {
        expect(seq.slice(i, i + 6).some((v) => v !== 1)).toBe(true);
      }
    }
  });

  it("roughly follows the configured weights", () => {
    const seq = generateRequirementSequence(123, 6000);
    const ones = seq.filter((v) => v === 1).length / seq.length;
    const threes = seq.filter((v) => v === 3).length / seq.length;
    expect(ones).toBeGreaterThan(0.42);
    expect(ones).toBeLessThan(0.68);
    expect(threes).toBeGreaterThan(0.06);
    expect(threes).toBeLessThan(0.24);
  });
});
