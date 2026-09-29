import { describe, expect, it } from "vitest";
import { generateMaze, MAZE_LEVELS } from "../src/data/maze";
import { FIRST_ENEMY_MAX_TILES, FIRST_ENEMY_MIN_TILES, SAFE_MIN_TILES, pathDistances, pickEnemySpawns } from "../src/core/mazeSpawns";

const levels = Object.values(MAZE_LEVELS);
const seeds = Array.from({ length: 40 }, (_, i) => 1000 + i * 37);

describe("Dream Garden maze enemy spawns", () => {
  for (const base of levels) {
    it(`${base.difficulty}: ${base.enemyCount} enemies, fair and spread, across 40 generated mazes`, () => {
      for (const seed of seeds) {
        const grid = generateMaze({ ...base, seed });
        const start = grid.cellTiles[0];
        // pretend a few cells hold targets — enemies must avoid them
        const targets = new Set(grid.cellTiles.slice(5, 11).map((c) => `${c.tx},${c.ty}`));
        const spawns = pickEnemySpawns(grid, base.enemyCount, targets);
        expect(spawns.length).toBe(base.enemyCount);
        const dist = pathDistances(grid.walls, start);
        const maxD = Math.max(...grid.cellTiles.map((c) => dist.get(`${c.tx},${c.ty}`) ?? 0));
        for (const s of spawns) {
          expect(grid.walls[s.ty][s.tx]).toBe(false); // a real open cell
          expect(s.tx === start.tx && s.ty === start.ty).toBe(false);
          expect(s.pathDist).toBeGreaterThanOrEqual(SAFE_MIN_TILES); // safety zone
          expect(targets.has(`${s.tx},${s.ty}`)).toBe(false); // never on a target
        }
        expect(new Set(spawns.map((s) => `${s.tx},${s.ty}`)).size).toBe(spawns.length);
        // enemy #1 is a medium-range threat, well short of the far corner
        expect(spawns[0].pathDist).toBeGreaterThanOrEqual(FIRST_ENEMY_MIN_TILES);
        expect(spawns[0].pathDist).toBeLessThanOrEqual(FIRST_ENEMY_MAX_TILES);
        // …and it is the closest enemy (the others spread further out)
        expect(Math.min(...spawns.slice(1).map((s) => s.pathDist))).toBeGreaterThanOrEqual(spawns[0].pathDist);
        void maxD;
        // spread out: no two enemies stacked on neighbouring cells
        for (let i = 0; i < spawns.length; i++)
          for (let j = i + 1; j < spawns.length; j++)
            expect(Math.hypot(spawns[i].tx - spawns[j].tx, spawns[i].ty - spawns[j].ty)).toBeGreaterThan(2);
      }
    });
  }

  it("nearest enemy is much closer (by path) than with the old farthest-corner rule", () => {
    for (const base of levels) {
      const grid = generateMaze(base);
      const start = grid.cellTiles[0];
      const dist = pathDistances(grid.walls, start);
      const old = [...grid.cellTiles]
        .sort((a, b) => Math.hypot(b.tx - start.tx, b.ty - start.ty) - Math.hypot(a.tx - start.tx, a.ty - start.ty))
        .slice(0, base.enemyCount)
        .map((c) => dist.get(`${c.tx},${c.ty}`)!);
      const now = pickEnemySpawns(grid, base.enemyCount).map((s) => s.pathDist);
      expect(Math.min(...now)).toBeLessThan(Math.min(...old) * 0.7);
    }
  });
});
