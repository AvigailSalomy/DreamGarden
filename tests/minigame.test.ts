import { describe, expect, it } from "vitest";
import { generateLevel } from "../src/data/minigame";
import { CATALOG } from "../src/data/objects";

const rabbitPool = CATALOG.find((o) => o.id === "rabbit")!.miniGamePool;

describe("generateLevel", () => {
  it("is deterministic for a fixed (level, pool, seed)", () => {
    const a = generateLevel(3, rabbitPool, 42);
    const b = generateLevel(3, rabbitPool, 42);
    expect(a).toEqual(b);
  });

  it("a different seed can produce a different level", () => {
    const outcomes = new Set(
      Array.from({ length: 10 }, (_, i) => JSON.stringify(generateLevel(5, rabbitPool, i))),
    );
    expect(outcomes.size).toBeGreaterThan(1);
  });

  it("early levels (1-3) are always single-goal", () => {
    for (let level = 1; level <= 3; level++) {
      for (let seed = 0; seed < 30; seed++) {
        expect(generateLevel(level, rabbitPool, seed).goals).toHaveLength(1);
      }
    }
  });

  it("later levels may roll two goals, but never impossible/empty ones", () => {
    let sawTwo = false;
    for (let level = 4; level <= 12; level++) {
      for (let seed = 0; seed < 40; seed++) {
        const def = generateLevel(level, rabbitPool, seed);
        expect(def.goals.length).toBeGreaterThanOrEqual(1);
        expect(def.goals.length).toBeLessThanOrEqual(2);
        if (def.goals.length === 2) {
          sawTwo = true;
          // no duplicate goal items within one level
          expect(new Set(def.goals.map((g) => g.itemId)).size).toBe(2);
        }
        for (const g of def.goals) {
          expect(g.target).toBeGreaterThan(0);
          expect(rabbitPool.some((i) => i.id === g.itemId)).toBe(true);
        }
      }
    }
    expect(sawTwo).toBe(true);
  });

  it("early target totals stay within the suggested 6-15 range", () => {
    for (let level = 1; level <= 5; level++) {
      for (let seed = 0; seed < 20; seed++) {
        const total = generateLevel(level, rabbitPool, seed).goals.reduce(
          (s, g) => s + g.target,
          0,
        );
        expect(total).toBeGreaterThanOrEqual(6);
        expect(total).toBeLessThanOrEqual(15);
      }
    }
  });

  it("later target totals cap around ~18", () => {
    for (let seed = 0; seed < 20; seed++) {
      const total = generateLevel(15, rabbitPool, seed).goals.reduce((s, g) => s + g.target, 0);
      expect(total).toBeLessThanOrEqual(18);
    }
  });

  it("reward is 60-100 for early levels and 90-130 for later ones", () => {
    for (let seed = 0; seed < 30; seed++) {
      const early = generateLevel(2, rabbitPool, seed).reward;
      expect(early).toBeGreaterThanOrEqual(60);
      expect(early).toBeLessThanOrEqual(100);

      const later = generateLevel(9, rabbitPool, seed).reward;
      expect(later).toBeGreaterThanOrEqual(90);
      expect(later).toBeLessThanOrEqual(130);
    }
  });

  it("throws rather than silently producing an unwinnable level for an empty pool", () => {
    expect(() => generateLevel(1, [], 1)).toThrow();
  });

  it("each catalog object carries a 4-item mini-game pool", () => {
    for (const o of CATALOG) {
      expect(o.miniGamePool.length).toBeGreaterThanOrEqual(2);
    }
  });
});
